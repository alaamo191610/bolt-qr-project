import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTenantOwnershipReady,
  normalizeTenantOwnershipReport,
} from '../server/prisma/verification/runTenantOwnershipVerification.js';

test('tenant ownership report normalization converts database counts safely', () => {
  const report = normalizeTenantOwnershipReport([{
    root_name: 'menus',
    total_rows: '12',
    missing_organization: '0',
    invalid_organization: '0',
    owner_mismatches: '0',
    branch_mismatches: '0',
    link_mismatches: '0',
    issue_count: '0',
    enforcement_ready: true,
  }]);

  assert.equal(report[0].total_rows, 12);
  assert.equal(report[0].issue_count, 0);
  assert.equal(assertTenantOwnershipReady(report), report);
});

test('tenant ownership verification fails closed with root-level issue counts', () => {
  assert.throws(
    () => assertTenantOwnershipReady([{
      root_name: 'orders',
      issue_count: 2,
      enforcement_ready: false,
    }]),
    /orders:2/,
  );
});
