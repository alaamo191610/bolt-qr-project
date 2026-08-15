import path from 'node:path';

const RELEASE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const parsePort = value => {
  const port = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
};

export const resolveRuntimeConfig = ({
  env = process.env,
  cwd = process.cwd(),
} = {}) => {
  const production = env.NODE_ENV === 'production';
  const configuredUploadDirectory = String(env.UPLOAD_DIR || '').trim();
  if (production && !configuredUploadDirectory) {
    throw new Error('UPLOAD_DIR must be configured in production');
  }
  if (production && !path.isAbsolute(configuredUploadDirectory)) {
    throw new Error('UPLOAD_DIR must be an absolute path in production');
  }

  const uploadDirectory = path.resolve(configuredUploadDirectory || path.join(cwd, 'uploads'));
  if (uploadDirectory === path.parse(uploadDirectory).root || uploadDirectory === path.resolve(cwd)) {
    throw new Error('UPLOAD_DIR must identify a dedicated subdirectory');
  }

  const releaseVersion = String(env.RELEASE_VERSION || (production ? '' : 'development')).trim();
  if (!RELEASE_PATTERN.test(releaseVersion)) {
    throw new Error('RELEASE_VERSION must use 1-128 letters, numbers, dots, underscores, or hyphens');
  }

  return Object.freeze({
    host: String(env.HOST || (production ? '127.0.0.1' : '0.0.0.0')),
    port: parsePort(env.PORT || '3000'),
    uploadDirectory,
    releaseVersion,
    shutdownTimeoutMs: Math.max(1_000, Number.parseInt(env.SHUTDOWN_TIMEOUT_MS || '25000', 10) || 25_000),
  });
};
