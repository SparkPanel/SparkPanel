import dotenv from 'dotenv';
dotenv.config();

function getEnv(name: string, fallback?: string, required = false): string {
  const val = process.env[name] ?? fallback;
  if ((val === undefined || val === '') && required) {
    throw new Error(`Missing required env var ${name}`);
  }
  return val ?? '';
}

export const config = {
  port: Number(getEnv('PORT', '8080')),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  jwtAccessSecret: getEnv('JWT_ACCESS_SECRET', undefined, true),
  jwtRefreshSecret: getEnv('JWT_REFRESH_SECRET', undefined, true),
  jwtAccessTtl: getEnv('JWT_ACCESS_TTL', '15m'),
  jwtRefreshTtl: getEnv('JWT_REFRESH_TTL', '30d'),
  databaseUrl: getEnv('DATABASE_URL', undefined, true),
  smtp: {
    host: getEnv('SMTP_HOST', ''),
    port: Number(getEnv('SMTP_PORT', '587')),
    user: getEnv('SMTP_USER', ''),
    pass: getEnv('SMTP_PASS', ''),
    from: getEnv('SMTP_FROM', 'SparkPanel <no-reply@sparkpanel.local>')
  },
  baseUrl: getEnv('BASE_URL', 'http://localhost:5173'),
  apiBaseUrl: getEnv('API_BASE_URL', 'http://localhost:8080'),
  filesRoot: getEnv('FILES_ROOT', '/var/lib/sparkpanel/servers'),
  diskQuota: {
    enforce: getEnv('DISK_QUOTA_ENFORCE', 'false') === 'true',
    defaultMb: Number(getEnv('DISK_QUOTA_DEFAULT_MB', '10240')), // 10 GB by default
  },
  s3: {
    enabled: getEnv('S3_ENABLED', 'false') === 'true',
    endpoint: getEnv('S3_ENDPOINT', ''),
    region: getEnv('S3_REGION', 'us-east-1'),
    bucket: getEnv('S3_BUCKET', ''),
    accessKeyId: getEnv('S3_ACCESS_KEY_ID', ''),
    secretAccessKey: getEnv('S3_SECRET_ACCESS_KEY', ''),
    sse: getEnv('S3_SSE', ''),
    pathStyle: getEnv('S3_PATH_STYLE', 'false') === 'true',
  }
};

export const isProd = config.nodeEnv === 'production'; 