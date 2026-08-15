import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const read = relativePath => readFile(path.join(projectRoot, relativePath), 'utf8');
const script = relativePath => path.join(projectRoot, relativePath);
const writeExecutable = async (directory, name, content) => {
  const executable = path.join(directory, name);
  await writeFile(executable, content);
  await chmod(executable, 0o755);
};

test('backup and restore scripts pass shell syntax validation', () => {
  for (const relativePath of [
    'ops/bin/backup-pilot.sh',
    'ops/bin/check-backup-freshness.sh',
    'ops/bin/restore-pilot.sh',
  ]) {
    const result = spawnSync('bash', ['-n', script(relativePath)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('backup stages only database/uploads, enforces retention, verifies restic, and reports success last', async () => {
  const backup = await read('ops/bin/backup-pilot.sh');

  assert.match(backup, /pg_dump[\s\S]*--format=custom/);
  assert.match(backup, /--no-owner/);
  assert.match(backup, /--no-privileges/);
  assert.match(backup, /UPLOAD_DIR contains a symbolic link/);
  assert.match(backup, /RESTIC_REPOSITORY/);
  assert.match(backup, /source_database_fingerprint/);
  assert.match(backup, /--keep-daily "\$keep_daily"/);
  assert.match(backup, /keep_daily < 7/);
  assert.match(backup, /restic check/);
  assert.match(backup, /Another backup is already running/);
  assert.doesNotMatch(backup, /JWT_SECRET|SUPER_ADMIN_MFA_ENCRYPTION_KEY|bolt-qr\.env/);

  const checkPosition = backup.indexOf('restic check');
  const markerPosition = backup.indexOf('last-success.tmp');
  const successPingPosition = backup.lastIndexOf('notify_monitor');
  assert.ok(checkPosition >= 0 && markerPosition > checkPosition);
  assert.ok(successPingPosition > markerPosition);
});

test('freshness check accepts a current marker and rejects stale or malformed state', async t => {
  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'bolt-backup-status-'));
  t.after(() => rm(workingDirectory, { recursive: true, force: true }));
  const marker = path.join(workingDirectory, 'last-success');

  await writeFile(marker, 'completed_epoch=1000\ncompleted_at=test\n', { mode: 0o640 });
  const current = spawnSync(script('ops/bin/check-backup-freshness.sh'), [], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BACKUP_STATE_DIR: workingDirectory,
      BACKUP_MAX_AGE_HOURS: '24',
      BACKUP_CHECK_NOW_EPOCH: String(1000 + (23 * 60 * 60)),
    },
  });
  assert.equal(current.status, 0, current.stderr);
  assert.match(current.stdout, /freshness check passed/);

  const stale = spawnSync(script('ops/bin/check-backup-freshness.sh'), [], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BACKUP_STATE_DIR: workingDirectory,
      BACKUP_MAX_AGE_HOURS: '24',
      BACKUP_CHECK_NOW_EPOCH: String(1000 + (25 * 60 * 60)),
    },
  });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /outside the 24-hour window/);

  await writeFile(marker, 'completed_epoch=invalid\n');
  const malformed = spawnSync(script('ops/bin/check-backup-freshness.sh'), [], {
    encoding: 'utf8',
    env: { ...process.env, BACKUP_STATE_DIR: workingDirectory },
  });
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /invalid success marker/);
});

test('restore script refuses production and non-empty targets before invoking restore tools', async t => {
  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'bolt-restore-guard-'));
  t.after(() => rm(workingDirectory, { recursive: true, force: true }));
  const password = path.join(workingDirectory, 'credential');
  const productionUploads = path.join(workingDirectory, 'uploads');
  await writeFile(password, 'not-a-real-secret\n', { mode: 0o600 });
  await mkdir(productionUploads);

  const commonEnvironment = {
    ...process.env,
    RESTIC_REPOSITORY: 'test-repository',
    RESTIC_PASSWORD_FILE: password,
    BACKUP_HOST: 'pilot-test',
    PGHOST: '127.0.0.1',
    PGPORT: '5432',
    PGDATABASE: 'production',
    PGUSER: 'backup',
    PGPASSFILE: password,
    UPLOAD_DIR: productionUploads,
    RESTORE_PGHOST: '127.0.0.1',
    RESTORE_PGPORT: '5432',
    RESTORE_PGDATABASE: 'restore_test',
    RESTORE_PGUSER: 'restore',
    RESTORE_PGPASSFILE: password,
    RESTORE_UPLOAD_DIR: productionUploads,
    RESTORE_CONFIRMATION: 'isolated-non-production',
  };
  const productionTarget = spawnSync(script('ops/bin/restore-pilot.sh'), [], {
    encoding: 'utf8',
    env: commonEnvironment,
  });
  assert.equal(productionTarget.status, 77);
  assert.match(productionTarget.stderr, /production upload directory/);

  const nonEmptyUploads = path.join(workingDirectory, 'non-empty');
  await mkdir(nonEmptyUploads);
  await writeFile(path.join(nonEmptyUploads, 'existing-file'), 'keep');
  const nonEmptyTarget = spawnSync(script('ops/bin/restore-pilot.sh'), [], {
    encoding: 'utf8',
    env: { ...commonEnvironment, RESTORE_UPLOAD_DIR: nonEmptyUploads },
  });
  assert.equal(nonEmptyTarget.status, 65);
  assert.match(nonEmptyTarget.stderr, /must not exist or must be empty/);
});

test('restore validates database isolation, integrity, uploads, and measured RTO', async () => {
  const restore = await read('ops/bin/restore-pilot.sh');

  assert.match(restore, /RESTORE_CONFIRMATION.*isolated-non-production/s);
  assert.match(restore, /source_fingerprint/);
  assert.match(restore, /manifest_source_fingerprint/);
  assert.match(restore, /Refusing to restore into the production database/);
  assert.match(restore, /Restore database must be empty/);
  assert.match(restore, /Database dump integrity check failed/);
  assert.match(restore, /Restored uploads contain a symbolic link/);
  assert.match(restore, /pg_restore[\s\S]*--exit-on-error/);
  assert.match(restore, /rto_met/);
  assert.match(restore, /bolt-qr-restore-report-v1/);
});

test('backup and isolated restore orchestration completes with controlled command doubles', async t => {
  const workingDirectory = await mkdtemp(path.join(tmpdir(), 'bolt-recovery-rehearsal-'));
  t.after(() => rm(workingDirectory, { recursive: true, force: true }));
  const fakeBin = path.join(workingDirectory, 'bin');
  const uploads = path.join(workingDirectory, 'uploads');
  const state = path.join(workingDirectory, 'state');
  const backupStaging = path.join(workingDirectory, 'backup-staging');
  const restoreStaging = path.join(workingDirectory, 'restore-staging');
  const reports = path.join(workingDirectory, 'reports');
  const repository = path.join(workingDirectory, 'repository');
  const restoreUploads = path.join(workingDirectory, 'restore-uploads');
  const password = path.join(workingDirectory, 'credential');
  const restoredFlag = path.join(workingDirectory, 'database-restored');
  const resticLog = path.join(workingDirectory, 'restic.log');
  await Promise.all([
    mkdir(fakeBin), mkdir(uploads), mkdir(state), mkdir(backupStaging),
    mkdir(restoreStaging), mkdir(reports), mkdir(repository),
  ]);
  await writeFile(path.join(uploads, 'menu-image.webp'), 'image-fixture');
  await writeFile(password, 'fixture-credential\n', { mode: 0o600 });

  await writeExecutable(fakeBin, 'flock', '#!/usr/bin/env bash\nexit 0\n');
  await writeExecutable(fakeBin, 'pg_dump', `#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do
  if [[ "$argument" == --file=* ]]; then output_file="${'$'}{argument#--file=}"; fi
done
printf 'database-fixture' > "${'$'}output_file"
`);
  await writeExecutable(fakeBin, 'sha256sum', `#!/usr/bin/env bash
set -euo pipefail
hash="${'$'}(shasum -a 256 "${'$'}1" | awk '{print ${'$'}1}')"
printf '%s  %s\\n' "${'$'}hash" "${'$'}1"
`);
  await writeExecutable(fakeBin, 'rsync', `#!/usr/bin/env bash
set -euo pipefail
source_path="${'$'}{@: -2:1}"
target_path="${'$'}{@: -1}"
mkdir -p "${'$'}target_path"
cp -R "${'$'}{source_path%/}/." "${'$'}target_path/"
`);
  await writeExecutable(fakeBin, 'restic', `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "${'$'}1" >> "${'$'}FAKE_RESTIC_LOG"
case "${'$'}1" in
  backup)
    cp -R . "${'$'}FAKE_RESTIC_STORAGE/payload"
    ;;
  restore)
    shift
    while [[ ${'$'}# -gt 0 ]]; do
      if [[ "${'$'}1" == --target ]]; then shift; target="${'$'}1"; fi
      shift || true
    done
    mkdir -p "${'$'}target"
    cp -R "${'$'}FAKE_RESTIC_STORAGE/payload/." "${'$'}target/"
    ;;
  forget|check) ;;
  *) exit 64 ;;
esac
`);
  await writeExecutable(fakeBin, 'psql', `#!/usr/bin/env bash
set -euo pipefail
if [[ "${'$'}{FAKE_SOURCE_UNAVAILABLE:-}" == true && "${'$'}PGDATABASE" == production ]]; then exit 1; fi
if [[ "$*" == *"COUNT(*)"* ]]; then
  if [[ -f "${'$'}FAKE_RESTORED_FLAG" ]]; then printf '5\\n'; else printf '0\\n'; fi
else
  printf '127.0.0.1:%s/%s\\n' "${'$'}PGPORT" "${'$'}PGDATABASE"
fi
`);
  await writeExecutable(fakeBin, 'pg_restore', `#!/usr/bin/env bash
set -euo pipefail
touch "${'$'}FAKE_RESTORED_FLAG"
`);

  const sharedEnvironment = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    RESTIC_REPOSITORY: 'controlled-test-repository',
    RESTIC_PASSWORD_FILE: password,
    BACKUP_HOST: 'pilot-test',
    PGHOST: '127.0.0.1',
    PGPORT: '5432',
    PGDATABASE: 'production',
    PGUSER: 'backup',
    PGPASSFILE: password,
    UPLOAD_DIR: uploads,
    FAKE_RESTIC_STORAGE: repository,
    FAKE_RESTIC_LOG: resticLog,
    FAKE_RESTORED_FLAG: restoredFlag,
  };
  const backupResult = spawnSync(script('ops/bin/backup-pilot.sh'), [], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...sharedEnvironment,
      BACKUP_STATE_DIR: state,
      BACKUP_STAGING_ROOT: backupStaging,
    },
  });
  assert.equal(backupResult.status, 0, backupResult.stderr);
  assert.match(await readFile(path.join(state, 'last-success'), 'utf8'), /completed_epoch=/);
  assert.match(await readFile(path.join(repository, 'payload', 'manifest.txt'), 'utf8'), /format=bolt-qr-backup-v1/);
  assert.deepEqual((await readFile(resticLog, 'utf8')).trim().split('\n'), ['backup', 'forget', 'check']);

  const restoreResult = spawnSync(script('ops/bin/restore-pilot.sh'), ['latest'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...sharedEnvironment,
      RESTORE_PGHOST: '127.0.0.1',
      RESTORE_PGPORT: '5432',
      RESTORE_PGDATABASE: 'restore_rehearsal',
      RESTORE_PGUSER: 'restore',
      RESTORE_PGPASSFILE: password,
      RESTORE_UPLOAD_DIR: restoreUploads,
      RESTORE_CONFIRMATION: 'isolated-non-production',
      RESTORE_STAGING_ROOT: restoreStaging,
      RESTORE_REPORT_DIR: reports,
      FAKE_SOURCE_UNAVAILABLE: 'true',
    },
  });
  assert.equal(restoreResult.status, 0, restoreResult.stderr);
  assert.equal(await readFile(path.join(restoreUploads, 'menu-image.webp'), 'utf8'), 'image-fixture');
  const reportFiles = await readdir(reports);
  assert.equal(reportFiles.length, 1);
  const report = await readFile(path.join(reports, reportFiles[0]), 'utf8');
  assert.match(report, /rto_met=true/);
  assert.match(report, /restored_tables=5/);
});

test('systemd schedules a hardened twice-daily backup with retries and a four-hour ceiling', async () => {
  const service = await read('ops/systemd/bolt-qr-backup.service');
  const initService = await read('ops/systemd/bolt-qr-backup-init.service');
  const timer = await read('ops/systemd/bolt-qr-backup.timer');
  const environment = await read('ops/env/bolt-qr-backup.env.example');

  assert.match(service, /^User=boltqrbackup$/m);
  assert.match(service, /^Group=boltqrbackup$/m);
  assert.match(service, /^SupplementaryGroups=boltqruploads$/m);
  assert.match(service, /^LoadCredential=restic-password:/m);
  assert.match(service, /^LoadCredential=postgres-passfile:/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ReadOnlyPaths=\/var\/lib\/bolt-qr\/uploads$/m);
  assert.match(service, /^Restart=on-failure$/m);
  assert.match(service, /^TimeoutStartSec=4h$/m);
  assert.match(initService, /^ExecStart=\/usr\/bin\/restic init$/m);
  assert.match(initService, /^LoadCredential=restic-password:/m);
  assert.match(initService, /^User=boltqrbackup$/m);
  assert.match(timer, /^OnCalendar=\*-\*-\* 02,14:00:00 UTC$/m);
  assert.match(timer, /^Persistent=true$/m);

  assert.match(environment, /^BACKUP_KEEP_DAILY=7$/m);
  assert.match(environment, /^BACKUP_MAX_AGE_HOURS=18$/m);
  assert.doesNotMatch(environment, /JWT_SECRET|SUPER_ADMIN_MFA_ENCRYPTION_KEY/);
  assert.doesNotMatch(environment, /AWS_SECRET_ACCESS_KEY=/);
});
