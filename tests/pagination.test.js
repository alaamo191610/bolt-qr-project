import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PaginationError,
  cursorWhere,
  decodeCursor,
  encodeCursor,
  presentPage,
  resolveCursorPagination,
} from '../server/pagination.js';

const createdAt = new Date('2026-08-16T10:15:30.000Z');

test('cursor pagination applies bounded defaults and rejects invalid limits', () => {
  assert.deepEqual(resolveCursorPagination({}, {
    defaultLimit: 50,
    maxLimit: 100,
    idType: 'integer',
  }), { limit: 50, cursor: null });

  for (const limit of ['0', '-1', '1.5', '101', 'abc']) {
    assert.throws(() => resolveCursorPagination({ limit }, {
      defaultLimit: 50,
      maxLimit: 100,
      idType: 'integer',
    }), PaginationError);
  }
});

test('opaque cursor round-trips exact timestamp and tie-break identifier', () => {
  const encoded = encodeCursor({ createdAt, id: 42 });
  assert.doesNotMatch(encoded, /2026-08-16/);
  assert.deepEqual(decodeCursor(encoded, { idType: 'integer' }), { createdAt, id: 42 });
  assert.deepEqual(cursorWhere({ createdAt, id: 42 }), {
    OR: [
      { created_at: { lt: createdAt } },
      { created_at: createdAt, id: { lt: 42 } },
    ],
  });
});

test('cursor decoder rejects malformed, wrong-version, and wrong-id cursors', () => {
  const invalid = [
    'not+a+base64url+cursor',
    Buffer.from('{bad json', 'utf8').toString('base64url'),
    Buffer.from(JSON.stringify({ v: 2, createdAt: createdAt.toISOString(), id: '42' })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, createdAt: createdAt.toISOString(), id: 'uuid' })).toString('base64url'),
  ];
  for (const cursor of invalid) {
    assert.throws(() => decodeCursor(cursor, { idType: 'integer' }), PaginationError);
  }
});

test('page presentation uses limit plus one without duplicates or leaking the sentinel row', () => {
  const rows = [
    { id: 3, created_at: createdAt },
    { id: 2, created_at: createdAt },
    { id: 1, created_at: new Date('2026-08-15T10:15:30.000Z') },
  ];
  const page = presentPage(rows, 2);
  assert.deepEqual(page.items.map(row => row.id), [3, 2]);
  assert.equal(page.pagination.hasMore, true);
  assert.deepEqual(decodeCursor(page.pagination.nextCursor, { idType: 'integer' }), {
    createdAt,
    id: 2,
  });
});
