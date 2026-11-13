import { randomBytes } from 'crypto';
import { currentDatabase, prepared } from '../database';

// One id per open database connection, so a restart (or a hosted family's database opened again) never
// hands out a number a browser already saw
const connectionIds = new WeakMap<object, string>();

/**
 * A value that moves whenever this family's data changes (ENH-20): SQLite's count of rows written through
 * this connection, which covers every request and background job. An open Today asks for it every
 * 15 seconds and loads everything again only when it moved.
 */
export function dataVersion(): string {
  const instance = currentDatabase();
  let id = instance ? connectionIds.get(instance) : undefined;
  if (instance && !id) connectionIds.set(instance, (id = randomBytes(4).toString('hex')));
  const n = (prepared('SELECT total_changes() AS n').get() as { n: number }).n;
  return `${id ?? '0'}-${n}`;
}
