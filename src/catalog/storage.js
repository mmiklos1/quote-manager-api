export function createS3Storage({ bucket, region, client }) {
  if (typeof bucket !== 'string' || bucket.length === 0) {
    throw new Error('S3_BUCKET is unset.');
  }
  if (typeof region !== 'string' || region.length === 0) {
    throw new Error('S3_REGION is unset.');
  }

  return {
    async put(key, bytes) {
      const sdk = await import('@aws-sdk/client-s3');
      const s3 = client ?? new sdk.S3Client({ region });
      await s3.send(new sdk.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
      }));
    },
  };
}
