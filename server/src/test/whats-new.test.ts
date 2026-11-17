import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type supertest from 'supertest';
import { createTestApp, createAdmin, createUser } from './setup';
import { recordWhatsNewArrivals, WHATS_NEW } from '../utils/whatsNew';

// "What's new" after a big update (NEW-38)
let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const unseen = async (token: string) => (await agent.get('/api/dashboard').set(auth(token)).expect(200)).body.whatsNew as string[];
/** The account was made before the update reached the server, as everyone's was when it arrives */
const madeBefore = (id: number) => db.prepare("UPDATE users SET createdAt = '2020-01-01 00:00:00' WHERE id = ?").run(id);

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  madeBefore(admin.user.id);
  madeBefore(kid.user.id);
  return { admin, kid };
}

describe("What's new", () => {
  it('shows once per person, and skipping counts as seen', async () => {
    const { admin, kid } = await family();
    expect(await unseen(admin.token)).toEqual(['new-look']);
    expect(await unseen(kid.token)).toEqual(['new-look']);

    await agent.post('/api/whats-new/seen').set(auth(admin.token)).send({ ids: ['new-look'] }).expect(200);
    expect(await unseen(admin.token)).toEqual([]);
    // Only for the person who saw it
    expect(await unseen(kid.token)).toEqual(['new-look']);

    // No ids: everything
    await agent.post('/api/whats-new/seen').set(auth(kid.token)).send({}).expect(200);
    expect(await unseen(kid.token)).toEqual([]);
  });

  it("gives a new account nothing old, and a new server nothing at all", async () => {
    const { admin } = await family();
    const newKid = await createUser(agent, admin.token, { username: 'newkid', displayName: 'New', password: 'pass123', role: 'child' });
    expect(await unseen(newKid.token)).toEqual([]);
    // Restarting doesn't move the time it arrived
    recordWhatsNewArrivals();
    expect(await unseen(newKid.token)).toEqual([]);
    expect(await unseen(admin.token)).toEqual(['new-look']);
  });

  it('shows nothing when the family switched it off', async () => {
    const { admin, kid } = await family();
    await agent.put('/api/features').set(auth(admin.token)).send({ features: { whatsNew: false } }).expect(200);
    expect(await unseen(kid.token)).toEqual([]);
    expect(await unseen(admin.token)).toEqual([]);
  });

  it('marks everyone seen when the family finishes the setup wizard', async () => {
    const { admin, kid } = await family();
    await agent.post('/api/setup').set(auth(admin.token)).send({
      people: [{ ref: 'me', kind: 'adult' }],
      rooms: [{ key: 'kitchen', starter: 'kitchen', name: 'Kitchen' }],
      chores: [{ id: 'kitchen.clean_counters', room: 'kitchen', people: ['me'] }],
      rewards: [],
    }).expect(201);
    expect(await unseen(admin.token)).toEqual([]);
    expect(await unseen(kid.token)).toEqual([]);
  });

  it('ignores ids it does not know and refuses a bad list', async () => {
    const { admin } = await family();
    await agent.post('/api/whats-new/seen').set(auth(admin.token)).send({ ids: ['made-up'] }).expect(200);
    expect(await unseen(admin.token)).toEqual(['new-look']);
    expect((await agent.post('/api/whats-new/seen').set(auth(admin.token)).send({ ids: 'new-look' })).status).toBe(400);
    expect((await agent.post('/api/whats-new/seen').send({})).status).toBe(401);
  });

  it('export and import keep who has seen what', async () => {
    const { admin, kid } = await family();
    await agent.post('/api/whats-new/seen').set(auth(kid.token)).send({}).expect(200);
    const backup = (await agent.get('/api/export').set(auth(admin.token))).body;
    expect(backup.whatsNewSeen).toHaveLength(1);
    db.prepare('DELETE FROM whats_new_seen').run();
    await agent.post('/api/import').set(auth(admin.token)).send(backup).expect(200);
    expect(db.prepare('SELECT userId, itemId FROM whats_new_seen').all()).toEqual([{ userId: kid.user.id, itemId: WHATS_NEW[0] }]);
  });
});
