import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPORT_DATASETS } from '@/src/lib/export/catalog';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  loadUsers: vi.fn(),
  exportAll: vi.fn(),
}));

vi.mock('@/src/lib/auth/session', () => {
  class ForbiddenError extends Error {}
  class UnauthenticatedError extends Error {}
  return { ForbiddenError, UnauthenticatedError, requireRole: mocks.requireRole };
});

vi.mock('@/src/lib/export/datasets', () => {
  const empty = (columns: string[]) => ({ columns, load: async () => [] });
  return {
    DATASETS: {
      checklists: empty(['id']),
      answers: empty(['id']),
      jobs: empty(['id']),
      technicians: empty(['id']),
      pay_periods: empty(['id', 'label']),
      users: { columns: ['id', 'name'], load: mocks.loadUsers },
      audit_log: empty(['id']),
    },
    exportAll: mocks.exportAll,
  };
});

import { GET } from '@/app/api/export/[format]/route';
import { ForbiddenError, UnauthenticatedError } from '@/src/lib/auth/session';

function call(format: string, query = '') {
  const request = new NextRequest(`http://localhost/api/export/${format}${query}`);
  return GET(request, { params: Promise.resolve({ format }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' });
  mocks.loadUsers.mockResolvedValue([
    { id: 'u1', name: 'Dana, "DJ" Caller' },
    { id: 'u2', name: 'José' },
  ]);
  mocks.exportAll.mockResolvedValue({
    exported_at: '2026-07-06T14:30:00.000Z',
    checklists: [{ id: 'c1' }],
    users: [{ id: 'u1' }],
  });
});

describe('GET /api/export/[format]', () => {
  it('requires the admin role, and maps auth failures to 401 and 403', async () => {
    await call('csv', '?dataset=users');
    expect(mocks.requireRole).toHaveBeenCalledWith('admin');

    mocks.requireRole.mockRejectedValueOnce(new UnauthenticatedError());
    const unauthenticated = await call('csv', '?dataset=users');
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: 'unauthenticated' });

    mocks.requireRole.mockRejectedValueOnce(new ForbiddenError());
    const forbidden = await call('json');
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden' });

    // Nothing is read from the database for a rejected caller.
    mocks.requireRole.mockRejectedValueOnce(new ForbiddenError());
    mocks.loadUsers.mockClear();
    await call('csv', '?dataset=users');
    expect(mocks.loadUsers).not.toHaveBeenCalled();
  });

  it('rejects an unknown or missing dataset with 400 and an unknown format with 404', async () => {
    const unknown = await call('csv', '?dataset=hcp_customers');
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error).toContain('hcp_customers');

    const missing = await call('csv');
    expect(missing.status).toBe(400);

    const unknownJson = await call('json', '?dataset=nope');
    expect(unknownJson.status).toBe(400);

    const format = await call('xlsx', '?dataset=users');
    expect(format.status).toBe(404);
  });

  it('serves a CSV download with a BOM, header, CRLF records and attachment headers', async () => {
    const response = await call('csv', '?dataset=users');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="rse-qaqc-users-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(
      'id,name\r\nu1,"Dana, ""DJ"" Caller"\r\nu2,José\r\n',
    );
  });

  it('still sends the header row for an empty dataset', async () => {
    const response = await call('csv', '?dataset=pay_periods');
    // Response.text() strips a BOM, so decode the raw bytes with the BOM kept.
    const bytes = await response.arrayBuffer();
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe('﻿id,label\r\n');
  });

  it('serves every dataset name the catalog lists', async () => {
    for (const dataset of EXPORT_DATASETS) {
      const response = await call('csv', `?dataset=${dataset}`);
      expect(response.status, dataset).toBe(200);
      await response.arrayBuffer();
    }
  });

  it('serves everything as one JSON download', async () => {
    const response = await call('json');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="rse-qaqc-all-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(await response.json()).toEqual({
      exported_at: '2026-07-06T14:30:00.000Z',
      checklists: [{ id: 'c1' }],
      users: [{ id: 'u1' }],
    });
  });

  it('narrows the JSON download to one dataset', async () => {
    const response = await call('json', '?dataset=users');
    expect(response.headers.get('content-disposition')).toMatch(
      /filename="rse-qaqc-users-.*\.json"$/,
    );
    const body = await response.json();
    expect(Object.keys(body)).toEqual(['exported_at', 'users']);
    expect(body.users).toEqual([
      { id: 'u1', name: 'Dana, "DJ" Caller' },
      { id: 'u2', name: 'José' },
    ]);
    expect(mocks.exportAll).not.toHaveBeenCalled();
  });

  it('returns a JSON 500 when a dataset cannot be read', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadUsers.mockRejectedValueOnce(new Error('db down'));
    const response = await call('csv', '?dataset=users');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'export failed' });
    consoleError.mockRestore();
  });
});
