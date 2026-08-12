import { createHash } from 'node:crypto';

export interface Page<T> {
  items: T[];
  next_cursor?: string;
  total: number;
  generated_at: string;
}

export class CursorError extends Error {
  readonly status = 400 as const;

  constructor(message: string) {
    super(message);
    this.name = 'CursorError';
  }
}

export function encodeCursor(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new CursorError('cursor index must be a non-negative integer');
  }
  return Buffer.from(String(index), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined, total: number): number {
  if (value === undefined || value === '') return 0;
  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    throw new CursorError('invalid cursor encoding');
  }
  if (!/^\d+$/.test(decoded)) throw new CursorError('invalid cursor payload');
  const index = Number(decoded);
  if (!Number.isInteger(index) || index < 0 || index > total) {
    throw new CursorError('cursor out of range');
  }
  return index;
}

export function parseLimit(raw: string | null | undefined, fallback = 100, max = 1000): number {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new CursorError('limit must be a positive integer');
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) throw new CursorError('limit must be a positive integer');
  if (limit > max) throw new CursorError(`limit exceeds maximum of ${max}`);
  return limit;
}

export function pageSlice<T>(
  items: readonly T[],
  cursor: string | undefined,
  limitRaw: string | null | undefined,
  now = new Date()
): Page<T> {
  const total = items.length;
  const offset = decodeCursor(cursor, total);
  const limit = parseLimit(limitRaw);
  const pageItems = items.slice(offset, offset + limit);
  const nextIndex = offset + pageItems.length;
  const page: Page<T> = {
    items: pageItems,
    total,
    generated_at: now.toISOString()
  };
  if (nextIndex < total) page.next_cursor = encodeCursor(nextIndex);
  return page;
}

export function etagFor(value: unknown): string {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('base64url');
  return `"${digest}"`;
}

export function etagsMatch(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch.split(',').some((value) => {
    const candidate = value.trim();
    return candidate === '*' || (candidate.startsWith('W/') ? candidate.slice(2).trim() : candidate) === etag;
  });
}
