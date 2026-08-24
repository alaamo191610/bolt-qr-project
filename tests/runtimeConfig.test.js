import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeConfig } from '../server/runtimeConfig.js';

test('development runtime has safe deterministic defaults', () => {
  const config = resolveRuntimeConfig({ env: {}, cwd: '/srv/qr' });

  assert.deepEqual(config, {
    host: '0.0.0.0',
    port: 3000,
    uploadDirectory: '/srv/qr/uploads',
    releaseVersion: 'development',
    shutdownTimeoutMs: 25_000,
  });
});

test('production runtime binds to loopback and requires persistent absolute uploads', () => {
  const config = resolveRuntimeConfig({
    env: {
      NODE_ENV: 'production',
      PORT: '3100',
      UPLOAD_DIR: '/var/lib/qr/uploads',
      RELEASE_VERSION: '29d1e83',
    },
    cwd: '/opt/qr/current',
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3100);
  assert.equal(config.uploadDirectory, '/var/lib/qr/uploads');
  assert.equal(config.releaseVersion, '29d1e83');
});

test('production runtime rejects missing, relative, broad, and malformed configuration', () => {
  assert.throws(
    () => resolveRuntimeConfig({ env: { NODE_ENV: 'production', RELEASE_VERSION: 'release-1' } }),
    /UPLOAD_DIR must be configured/,
  );
  assert.throws(
    () => resolveRuntimeConfig({
      env: { NODE_ENV: 'production', UPLOAD_DIR: './uploads', RELEASE_VERSION: 'release-1' },
    }),
    /UPLOAD_DIR must be an absolute path/,
  );
  assert.throws(
    () => resolveRuntimeConfig({
      env: { NODE_ENV: 'production', UPLOAD_DIR: '/', RELEASE_VERSION: 'release-1' },
    }),
    /dedicated subdirectory/,
  );
  assert.throws(
    () => resolveRuntimeConfig({
      env: { NODE_ENV: 'production', UPLOAD_DIR: '/var/lib/qr/uploads', RELEASE_VERSION: '../bad' },
    }),
    /RELEASE_VERSION/,
  );
  assert.throws(
    () => resolveRuntimeConfig({ env: { PORT: '70000' } }),
    /PORT/,
  );
});

