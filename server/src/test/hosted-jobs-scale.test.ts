import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import db from '../database';
import { runInFamily } from '../hosted/context';
import { closeAllFamilies, createFamily, familyDir, openFamily, upgradeAllFamilies } from '../hosted/families';
import { forEachFamily, runJobs } from '../hosted/jobs';
import { backgroundJobs } from '../index';
import { setNotifyTransport } from '../utils/notify';
import { createAdmin, createTestApp, createUser } from './setup';

// How long the background jobs take with many families (HOSTED.md §6, backlog NEW-14). It takes minutes, so it
// only runs when asked: JOBS_SCALE=1000 npx vitest run test/hosted-jobs-scale.test.ts (JOBS_SCALE_REPORT=<file>
// also writes the results there). Every family is a copy of one busy family: 5 people, 15 rooms, 120 chores (a
// third with a 7 pm reminder), 100 rewards, two months of chores done and notifications on, kept by the test.
const FAMILIES = Number(process.env.JOBS_SCALE) || 0;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 24 * 60 * 60 * 1000;

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
const openFiles = () => (fs.existsSync('/proc/self/fd') ? fs.readdirSync('/proc/self/fd').length : NaN);
async function timed(fn: () => unknown): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

describe.skipIf(!FAMILIES)('Hosted mode: background jobs with many families', () => {
  it(`times a run for ${FAMILIES} families`, async () => {
    const { agent } = createTestApp({ hosted: true });
    let sends = 0;
    setNotifyTransport(async () => { sends++; return { ok: true }; });
    const before = { rss: process.memoryUsage().rss, files: openFiles() };

    // The busy family, through the API
    const template = createFamily('Template');
    const parent = await createAdmin(agent, 'parent', 'parent123', 'Parent', template);
    const people = [parent.user.id];
    for (const [username, role] of [['second', 'admin'], ['kid1', 'child'], ['kid2', 'child'], ['teen', 'member']]) {
      people.push((await createUser(agent, parent.token, { username, displayName: username, password: 'pass123', role, familyId: template })).user.id);
    }
    const rooms: number[] = [];
    for (let r = 0; r < 15; r++) rooms.push((await agent.post('/api/rooms').set(auth(parent.token)).send({ name: `Room ${r}`, roomType: 'other' })).body.id);
    const chores: number[] = [];
    for (let c = 0; c < 120; c++) {
      const res = await agent.post(`/api/rooms/${rooms[c % 15]}/tasks`).set(auth(parent.token)).send({
        name: `Chore ${c}`, effort: 1 + (c % 5), frequencyDays: [1, 2, 3, 7, 14][c % 5],
        ...(c % 3 === 0 ? { reminderTime: '19:00' } : {}), ...(c % 2 ? { assignedUserIds: [people[2 + (c % 3)]] } : {}),
      });
      expect(res.status, res.text).toBe(201);
      chores.push(res.body.id);
    }
    for (let r = 0; r < 100; r++) await agent.post('/api/rewards').set(auth(parent.token)).send({ title: `Reward ${r}`, costCoins: 10 + r });

    // Monday Nov 2 2026, a minute and a half before the 7 pm reminders (Los Angeles)
    const start = Date.parse('2026-11-02T18:58:30-08:00');
    runInFamily(openFamily(template)!, () => {
      for (const [key, value] of [['notificationsEnabled', '1'], ['ntfyEnabled', '1'], ['ntfyTopic', 'scale-test'], ['timeZone', 'America/Los_Angeles']]) {
        db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(key, value);
      }
      const done = db.prepare("INSERT INTO task_completions (taskId, userId, completedAt, coinsEarned, status) VALUES (?, ?, ?, 5, 'approved')");
      for (let d = 1; d <= 60; d++) {
        for (let n = 0; n < 5; n++) done.run(chores[(d * 7 + n * 13) % 120], people[2 + (n % 3)], new Date(start - d * DAY + n * 3_600_000).toISOString());
      }
      db.prepare('UPDATE tasks SET lastCompletedAt = (SELECT MAX(completedAt) FROM task_completions c WHERE c.taskId = tasks.id)').run();
      db.pragma('wal_checkpoint(TRUNCATE)');
    });

    // The copies: registered as families, then given the busy family's database
    const ids: string[] = [];
    for (let f = 0; f < FAMILIES; f++) ids.push(createFamily(`Family ${f}`, { db: new Database(':memory:') }));
    closeAllFamilies();
    for (const id of ids) fs.copyFileSync(path.join(familyDir(template), 'tidyquest.db'), path.join(familyDir(id), 'tidyquest.db'));

    const lines = [`${FAMILIES} families, each with 5 people, 15 rooms, 120 chores (40 with a 7 pm reminder), 100 rewards, 300 chores done`];
    lines.push(`Server start, opening and upgrading every family: ${seconds(await timed(() => upgradeAllFamilies()))}`);
    const open = { rss: process.memoryUsage().rss, files: openFiles() };
    lines.push(`Every family open: ${megabytes(open.rss - before.rss)} more memory, ${open.files - before.files} more open files`);

    // A run every 30 seconds for 4 minutes: the first of the day, then 7 pm's reminders and evening nudges
    // (each job timed on its own, one after the other, where the server starts them together)
    const perJob = new Map<string, number>(backgroundJobs.map((job) => [job.name, 0]));
    let longest = 0;
    for (let r = 0; r < 8; r++) {
      const sentBefore = sends;
      const now = new Date(start + r * 30_000);
      const took = await timed(() => forEachFamily(async () => {
        let family = 0;
        for (const job of backgroundJobs) {
          const ms = await timed(() => job(now));
          perJob.set(job.name, perJob.get(job.name)! + ms);
          family += ms;
        }
        longest = Math.max(longest, family);
      }));
      lines.push(`Run ${r + 1} (${now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' })}): ${seconds(took)}, ${sends - sentBefore} notifications`);
    }
    lines.push(`The 8 runs by job: ${[...perJob].sort((a, b) => b[1] - a[1]).map(([name, ms]) => `${name} ${seconds(ms)}`).join(', ')}`);
    lines.push(`Longest one family's jobs took (requests wait at most that long): ${seconds(longest)}`);
    lines.push(`Opening each family's database and context, with no jobs: ${seconds(await timed(() => forEachFamily(() => undefined)))}`);
    closeAllFamilies();
    lines.push(`A run as the server does it at 7:03 pm, every database closed first: ${seconds(await timed(() => runJobs(backgroundJobs, new Date(start + 9 * 30_000))))}`);

    const report = lines.join('\n');
    console.log(report);
    if (process.env.JOBS_SCALE_REPORT) fs.writeFileSync(process.env.JOBS_SCALE_REPORT, `${report}\n`);
    setNotifyTransport();
    closeAllFamilies();
  }, 60 * 60 * 1000);
});
