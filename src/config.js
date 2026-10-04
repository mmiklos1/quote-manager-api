export function readConfig(env = process.env) {
  return {
    port: env.PORT ?? '',
    databaseUrl: env.DATABASE_URL ?? '',
    jwtSigningKey: env.JWT_SIGNING_KEY ?? '',
    googleClientId: env.GOOGLE_CLIENT_ID ?? '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    microsoftClientId: env.MICROSOFT_CLIENT_ID ?? '',
    microsoftClientSecret: env.MICROSOFT_CLIENT_SECRET ?? '',
    assetStorage: env.ASSET_STORAGE === 's3' ? 's3' : 'local',
    s3Bucket: env.S3_BUCKET ?? '',
    s3Region: env.S3_REGION ?? '',
  };
}

export function assertPort(config) {
  if (!config.port) {
    throw new Error('PORT is unset. No listen port was chosen for this API.');
  }
  const port = Number(config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT is not a TCP port.');
  }
  return port;
}
