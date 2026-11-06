import { describe, it, expect, beforeEach } from 'vitest';
import { createTestApp, createAdmin, createUser } from './setup';
import { keepTrashedRewardHistory } from '../utils/trash';
import type supertest from 'supertest';
import type Database from 'better-sqlite3';

// FIX-22: deleting a reward keeps its row (deletedAt), so its purchases keep their name and a waiting request
// can still be decided.

let agent: supertest.Agent;
let db: InstanceType<typeof Database>;

beforeEach(() => {
  ({ agent, db } = createTestApp());
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const coins = (userId: number) => (db.prepare('SELECT coins FROM users WHERE id = ?').get(userId) as { coins: number }).coins;

async function family() {
  const admin = await createAdmin(agent);
  const kid = await createUser(agent, admin.token, { username: 'kid', displayName: 'Kid', password: 'pass123', role: 'child' });
  await agent.post(`/api/users/${kid.user.id}/adjust-coins`).set(auth(admin.token)).send({ amount: 100 }).expect(200);
  const reward = (await agent.post('/api/rewards').set(auth(admin.token)).send({ title: 'Screen time', costCoins: 20 })).body.id as number;
  // One handed over, one still waiting
  const done = (await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(200)).body.redemption.id as number;
  await agent.put(`/api/rewards/redemptions/${done}`).set(auth(admin.token)).send({ status: 'approved' }).expect(200);
  const waiting = (await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(200)).body.redemption.id as number;
  return { admin, kid, reward, done, waiting };
}

describe('Deleting a reward', () => {
  it('leaves the shop and catalog but keeps its purchases in Insights and its request in Approvals', async () => {
    const { admin, kid, reward, done, waiting } = await family();
    expect(coins(kid.user.id)).toBe(60);
    const trashId = (await agent.delete(`/api/rewards/${reward}`).set(auth(admin.token)).expect(200)).body.trashId;
    expect(coins(kid.user.id)).toBe(60); // deleting doesn't touch balances
    expect(db.prepare('SELECT deletedAt IS NOT NULL AS gone FROM rewards WHERE id = ?').get(reward)).toEqual({ gone: 1 });

    // Gone from everything a reward is picked from
    const shop = (await agent.get('/api/rewards').set(auth(kid.token)).expect(200)).body;
    expect(shop.rewards.map((r: any) => r.id)).not.toContain(reward);
    const catalog = (await agent.get('/api/rewards/admin').set(auth(admin.token)).expect(200)).body;
    expect(catalog.rewards.map((r: any) => r.id)).not.toContain(reward);
    await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(404);
    await agent.put(`/api/rewards/${reward}`).set(auth(admin.token)).send({ title: 'Back?', costCoins: 5 }).expect(404);
    await agent.put(`/api/rewards/${reward}/rules`).set(auth(admin.token)).send({ isRotating: true }).expect(404);
    await agent.delete(`/api/rewards/${reward}`).set(auth(admin.token)).expect(404);
    const csv = (await agent.get('/api/csv/rewards').set(auth(admin.token)).expect(200)).text;
    expect(csv).not.toContain('Screen time');

    // Kept wherever its purchases show
    expect(shop.mine.map((r: any) => [r.id, r.title]).sort()).toEqual([[done, 'Screen time'], [waiting, 'Screen time']].sort());
    expect(catalog.redemptions.map((r: any) => r.title)).toEqual(['Screen time', 'Screen time']);
    const insights = (await agent.get('/api/insights/coins').set(auth(admin.token)).expect(200)).body;
    expect(insights.bought.map((b: number[]) => b.slice(0, 4)).sort()).toEqual([[reward, kid.user.id, done, 20], [reward, kid.user.id, waiting, 20]].sort());
    expect(insights.rewards.find((r: any) => r.id === reward)).toMatchObject({ title: 'Screen time', deleted: 1 });
    const spent = insights.flows.filter((f: any[]) => f[1] === kid.user.id && f[2] === 'rewards').reduce((s: number, f: any[]) => s + f[3], 0);
    expect(spent).toBe(40);
    const dash = (await agent.get('/api/dashboard').set(auth(admin.token)).expect(200)).body;
    expect(dash.pendingRewardRequests.map((r: any) => [r.id, r.title])).toEqual([[waiting, 'Screen time']]);

    // The waiting request can still be turned down, which gives the coins back
    await agent.put(`/api/rewards/redemptions/${waiting}`).set(auth(admin.token)).send({ status: 'rejected' }).expect(200);
    expect(coins(kid.user.id)).toBe(80);

    // Restore brings it back to the shop with its history
    await agent.post(`/api/trash/${trashId}/restore`).set(auth(admin.token)).expect(200);
    const back = (await agent.get('/api/rewards').set(auth(kid.token)).expect(200)).body;
    expect(back.rewards.map((r: any) => r.id)).toContain(reward);
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_redemptions WHERE rewardId = ?').get(reward)).toEqual({ n: 2 });
    await agent.post(`/api/rewards/${reward}/redeem`).set(auth(kid.token)).expect(200);
  });

  it('deleting for good only takes it off the trash list', async () => {
    const { admin, reward } = await family();
    const trashId = (await agent.delete(`/api/rewards/${reward}`).set(auth(admin.token)).expect(200)).body.trashId;
    await agent.delete(`/api/trash/${trashId}`).set(auth(admin.token)).expect(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_redemptions WHERE rewardId = ?').get(reward)).toEqual({ n: 2 });
    const insights = (await agent.get('/api/insights/coins').set(auth(admin.token)).expect(200)).body;
    expect(insights.bought).toHaveLength(2);
  });

  it('puts rewards trashed the old way back as deleted rows, with their purchases', async () => {
    const { admin, kid, reward, done } = await family();
    await agent.put(`/api/rewards/${reward}/rules`).set(auth(admin.token)).send({ prices: { [kid.user.id]: 15 } }).expect(200);
    // An entry from before FIX-22: a full copy in the snapshot and the row (with its purchases) deleted
    const trashId = (await agent.delete(`/api/rewards/${reward}`).set(auth(admin.token)).expect(200)).body.trashId;
    const old = {
      reward: { ...(db.prepare('SELECT * FROM rewards WHERE id = ?').get(reward) as object), deletedAt: undefined },
      redemptions: db.prepare('SELECT * FROM reward_redemptions WHERE rewardId = ?').all(reward),
      visibility: [],
      prices: db.prepare('SELECT * FROM reward_prices WHERE rewardId = ?').all(reward),
      contributions: [],
    };
    db.prepare('UPDATE trash SET snapshot = ? WHERE id = ?').run(JSON.stringify(old), trashId);
    db.prepare('DELETE FROM rewards WHERE id = ?').run(reward);
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_redemptions').get()).toEqual({ n: 0 });

    expect(keepTrashedRewardHistory()).toBe(1);
    expect(keepTrashedRewardHistory()).toBe(0); // once only
    expect(db.prepare('SELECT title, deletedAt IS NOT NULL AS gone FROM rewards WHERE id = ?').get(reward)).toEqual({ title: 'Screen time', gone: 1 });
    expect((db.prepare('SELECT id FROM reward_redemptions WHERE rewardId = ? ORDER BY id').all(reward) as { id: number }[]).map((r) => r.id)).toContain(done);
    const shop = (await agent.get('/api/rewards').set(auth(kid.token)).expect(200)).body;
    expect(shop.rewards.map((r: any) => r.id)).not.toContain(reward);
    expect((await agent.get('/api/insights/coins').set(auth(admin.token))).body.bought).toHaveLength(2);

    // Still in the trash, and restoring it is the same as for any deleted reward
    const trash = (await agent.get('/api/trash').set(auth(admin.token)).expect(200)).body;
    expect(JSON.stringify(trash)).toContain('Screen time');
    await agent.post(`/api/trash/${trashId}/restore`).set(auth(admin.token)).expect(200);
    const back = (await agent.get('/api/rewards').set(auth(kid.token)).expect(200)).body;
    expect(back.rewards.find((r: any) => r.id === reward)).toMatchObject({ costCoins: 15 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM reward_redemptions WHERE rewardId = ?').get(reward)).toEqual({ n: 2 });
  });
});
