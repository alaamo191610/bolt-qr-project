import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('systemd service runs one hardened unprivileged process with persistent uploads', async () => {
  const service = await read('ops/systemd/bolt-qr.service');

  assert.match(service, /^User=boltqr$/m);
  assert.match(service, /^Group=boltqr$/m);
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
  assert.match(deploy, /npm ci/);
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
  assert.doesNotMatch(environment, /development-only-change-me/);
});
