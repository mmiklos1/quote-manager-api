import { randomUUID } from 'node:crypto';
import { ApiError, ErrorClass } from '../errors.js';

export const LOCAL_IMAGE_KEY = 'local-stub';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const CROP_PX = 1040;
export const DERIVATIVE_PX = 520;

export function decodeImage(imageBase64) {
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    throw new ApiError(ErrorClass.catalogImageRejected);
  }
  const bytes = Buffer.from(imageBase64, 'base64');
  if (bytes.length === 0) {
    throw new ApiError(ErrorClass.catalogImageRejected);
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ApiError(ErrorClass.catalogImageTooLarge);
  }
  return bytes;
}

/**
 * Local development stores a stub key and does not keep bytes.
 * S3 stores the original, a 1040 crop, and a 520 derivative.
 */
export async function storeCatalogImage({ assetStorage, imageBase64, storage, crop }) {
  if (assetStorage !== 's3') {
    return { imageKey: LOCAL_IMAGE_KEY, derivativeKey: null };
  }

  const bytes = decodeImage(imageBase64);
  const cropped = await crop.toSquare(bytes, CROP_PX);
  const derivative = await crop.downscale(cropped, DERIVATIVE_PX);
  const id = randomUUID();
  await storage.put(`${id}/original`, bytes);
  await storage.put(`${id}/crop-1040`, cropped);
  await storage.put(`${id}/derivative-520`, derivative);
  return {
    imageKey: `${id}/crop-1040`,
    derivativeKey: `${id}/derivative-520`,
  };
}

export async function sharpCrop() {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  return {
    toSquare(bytes, size) {
      return sharp(bytes).rotate().resize(size, size, { fit: 'cover' }).jpeg().toBuffer();
    },
    downscale(bytes, size) {
      return sharp(bytes).resize(size, size).jpeg().toBuffer();
    },
  };
}
