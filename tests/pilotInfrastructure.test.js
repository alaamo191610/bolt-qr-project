import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('systemd service runs one hardened unprivileged process with persistent uploads', async () => {
  const service = await read('ops/systemd/bolt-qr.service');

  assert.match(service, /^User=boltqr$/m);
  assert.match(service, /^Group=boltqr$/m);
  assert.match(service, /^SupplementaryGroups=boltqruploads$/m);
  assert.match(service, /^EnvironmentFile=\/etc\/bolt-qr\/bolt-qr\.env$/m);
  assert.match(service, /^EnvironmentFile=-\/opt\/bolt-qr\/current\/\.release\.env$/m);
  assert.match(service, /^ExecStartPre=\/usr\/bin\/npm run migrate:deploy$/m);
  assert.match(service, /^ExecStart=\/usr\/bin\/npm run start:server$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ReadWritePaths=\/var\/lib\/bolt-qr\/uploads$/m);
  assert.match(service, /^KillSignal=SIGTERM$/m);
  assert.match(service, /^TimeoutStopSec=30s$/m);
});

test('nginx terminates TLS, preserves proxy identity, and supports Socket.IO upgrades', async () => {
  const nginx = await read('ops/nginx/bolt-qr.conf');

  assert.match(nginx, /server 127\.0\.0\.1:3000;/);
  assert.match(nginx, /return 301 https:\/\/\$host\$request_uri;/);
  assert.match(nginx, /ssl_protocols TLSv1\.2 TLSv1\.3;/);
  assert.match(nginx, /client_max_body_size 6m;/);
  assert.match(nginx, /location \/socket\.io\//);
  assert.match(nginx, /proxy_set_header Upgrade \$http_upgrade;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto https;/);
});

test('deployment scripts pass shell syntax checks and exclude mutable or secret state', async () => {
  const deployPath = new URL('../ops/bin/deploy-release.sh', import.meta.url).pathname;
  const rollbackPath = new URL('../ops/bin/rollback-release.sh', import.meta.url).pathname;
  for (const scriptPath of [deployPath, rollbackPath]) {
    const syntax = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }

  const deploy = await read('ops/bin/deploy-release.sh');
  assert.match(deploy, /--exclude '\.env'/);
  assert.match(deploy, /--exclude 'uploads'/);
  assert.match(deploy, /env -u SENTRY_AUTH_TOKEN -u SENTRY_ORG -u SENTRY_PROJECT npm ci/);
  assert.match(deploy, /npm run migrate:deploy/);
  assert.match(deploy, /mv -Tf "\$next_link" "\$current_link"/);
  assert.match(deploy, /curl --fail/);

  const rollback = await read('ops/bin/rollback-release.sh');
  assert.match(rollback, /rolls back application code only/i);
  assert.doesNotMatch(rollback, /prisma migrate/);
});

test('production environment template uses loopback and keeps uploads outside releases', async () => {
  const environment = await read('ops/env/bolt-qr.env.example');

  assert.match(environment, /^NODE_ENV=production$/m);
  assert.match(environment, /^HOST=127\.0\.0\.1$/m);
  assert.match(environment, /^TRUST_PROXY_HOPS=1$/m);
  assert.match(environment, /^UPLOAD_DIR=\/var\/lib\/bolt-qr\/uploads$/m);
  assert.match(environment, /^JWT_SECRET=REPLACE_/m);
  assert.match(environment, /^SUPER_ADMIN_MFA_ENCRYPTION_KEY=REPLACE_WITH_64_HEX_CHARACTERS$/m);
  assert.doesNotMatch(environment, /development-only-change-me/);
});

test('Sentry starts before the API and production source maps are uploaded then removed', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const deploy = await read('ops/bin/deploy-release.sh');
  const vite = await read('vite.config.ts');
  const applicationEnvironment = await read('ops/env/bolt-qr.env.example');
  const buildEnvironment = await read('ops/env/bolt-qr-sentry-build.env.example');

  assert.equal(packageJson.scripts['start:server'], 'node --import ./server/instrumentation.js server/index.js');
  assert.match(packageJson.scripts.server, /--import \.\/server\/instrumentation\.js/);
  assert.match(deploy, /SENTRY_RELEASE="\$release_id"/);
  assert.match(deploy, /VITE_RELEASE_VERSION="\$release_id"/);
  assert.match(deploy, /env -u SENTRY_AUTH_TOKEN -u SENTRY_ORG -u SENTRY_PROJECT npm run migrate:deploy/);
  assert.match(vite, /sourcemap: sentrySourceMapsEnabled \? 'hidden' : false/);
  assert.match(vite, /filesToDeleteAfterUpload: \['\.\/dist\/\*\*\/\*\.map'\]/);
  assert.match(applicationEnvironment, /^SENTRY_DSN=https:\/\//m);
  assert.match(applicationEnvironment, /^SENTRY_TRACES_SAMPLE_RATE=0$/m);
  assert.match(buildEnvironment, /^SENTRY_AUTH_TOKEN=REPLACE_/m);
  assert.match(buildEnvironment, /^VITE_SENTRY_DSN=https:\/\//m);
});

test('operator synthetic validation checks HTTPS readiness and has no public trigger route', async () => {
  const validatorPath = new URL('../ops/bin/verify-observability.js', import.meta.url).pathname;
  const validator = await read('ops/bin/verify-observability.js');
  const server = await read('server/index.js');
  const telemetry = await read('server/telemetry.js');
  const syntax = spawnSync(process.execPath, ['--check', validatorPath], { encoding: 'utf8' });

  assert.equal(syntax.status, 0, syntax.stderr);
  assert.match(validator, /UPTIME_HEALTH_URL must use HTTPS/);
  assert.match(validator, /health\?\.status !== 'ready'/);
  assert.match(validator, /health\?\.database !== 'ok'/);
  assert.match(validator, /captureSyntheticAlert\(\)/);
  assert.match(validator, /flushServerTelemetry\(10_000\)/);
  assert.match(telemetry, /\['bolt-qr-observability-validation', telemetryRelease\]/);
  assert.doesNotMatch(server, /synthetic(?:-|_)alert/iu);
});
