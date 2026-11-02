import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './database';
import authRoutes from './routes/auth';
import roomsRoutes from './routes/rooms';
import zonesRoutes from './routes/zones';
import tasksRoutes from './routes/tasks';
import dashboardRoutes from './routes/dashboard';
import leaderboardRoutes from './routes/leaderboard';
import historyRoutes from './routes/history';
import usersRoutes from './routes/users';
import dataRoutes from './routes/data';
import achievementsRoutes from './routes/achievements';
import rewardsRoutes from './routes/rewards';
import { sendDueTaskNotificationsIfNeeded } from './utils/notifications';
import { sendCoinBoostNotificationsIfNeeded } from './utils/boosts';
import { runScheduledNotifications } from './utils/notifySchedule';
import notifyRoutes from './routes/notify';
import todosRoutes from './routes/todos';
import rescueRoutes from './routes/rescue';
import shieldsRoutes from './routes/shields';
import featuresRoutes from './routes/features';
import cheersRoutes from './routes/cheers';
import unlocksRoutes from './routes/unlocks';
import teamupsRoutes from './routes/teamups';
import mascotRoutes from './routes/mascot';
import boostsRoutes from './routes/boosts';
import csvRoutes from './routes/csv';
import trashRoutes from './routes/trash';
import { proxyHint, trustProxySetting } from './utils/proxy';
import { sourceUrl } from './utils/source';
import { closeOldTeamups } from './utils/teamups';
import { settleAllStreaks } from './utils/streaks';
import { snapshotOverdueChores } from './utils/insights';
import { resumeDuePauses } from './utils/pause';
import insightsRoutes from './routes/insights';
import { countRequests, isHosted } from './hosted/context';
import { startHosted } from './hosted/families';
import { startJobs, type Job } from './hosted/jobs';
import { filesRouter, proofsRouter } from './hosted/files';
import hostedRoutes from './hosted/routes';
import operatorRoutes, { operatorFromEnv } from './hosted/operator';
import { hostedCorsOrigin, securityHeaders } from './hosted/headers';
import { limits } from './hosted/limits';

export function createApp() {
  const app = express();
  app.set('trust proxy', trustProxySetting());
  if (isHosted()) app.use(countRequests);
  app.use(proxyHint);
  // Hosted mode: security headers (helmet), and CORS only for the app's own address
  if (isHosted()) app.use(securityHeaders());

  // CORS: allow only in dev or via explicit env var (in production, frontend is served from same origin)
  const corsOrigin = isHosted() ? hostedCorsOrigin() : process.env.CORS_ORIGIN || (process.env.NODE_ENV !== 'production' ? true : false);
  app.use(cors({ origin: corsOrigin }));

  // The biggest body is an import: 50 MB self-hosted, 5 MB in hosted mode (MAX_IMPORT_MB)
  const bodyMb = isHosted() ? limits().importMb : 50;
  app.use(express.json({ limit: `${bodyMb}mb` }));

  // Prevent browser caching of API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Which version is running (no login needed): {"version":"0.7.0","build":"main · 7e18930"}, and the link
  // to its code (utils/source.ts)
  app.get('/api/version', (_req, res) => {
    let version: string | null = null;
    try {
      version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8')).version ?? null;
    } catch { /* not there in some setups */ }
    res.json({ version, build: process.env.APP_BUILD || null, hosted: isHosted(), source: sourceUrl(version) });
  });

  if (isHosted()) {
    // Each family's avatars and proof photos, from its own folder (hosted/files.ts)
    app.use('/api/files', filesRouter);
  } else {
    // Serve uploaded avatars
    const avatarsDir = path.join(__dirname, '..', '..', 'data', 'avatars');
    app.use('/api/avatars', express.static(avatarsDir));
    // Proof photos attached to completions: only for the people allowed to see them (the photos cookie)
    app.use('/api/proofs', proofsRouter);
  }

  // API routes
  app.use('/api/auth', authRoutes);
  // Sign-up, parents' emails and the family code (hosted mode only)
  if (isHosted()) app.use('/api/hosted', hostedRoutes);
  // The operator page, for the people running the server (hosted mode only)
  if (isHosted()) app.use('/api/operator', operatorRoutes);
  app.use('/api/rooms', roomsRoutes);
  app.use('/api/zones', zonesRoutes);
  app.use('/api', tasksRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/history', historyRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api', dataRoutes);
  app.use('/api/achievements', achievementsRoutes);
  app.use('/api/rewards', rewardsRoutes);
  app.use('/api/boosts', boostsRoutes);
  app.use('/api/csv', csvRoutes);
  app.use('/api/trash', trashRoutes);
  app.use('/api/notify', notifyRoutes);
  app.use('/api/todos', todosRoutes);
  app.use('/api/rescue', rescueRoutes);
  app.use('/api/shields', shieldsRoutes);
  app.use('/api/insights', insightsRoutes);
  app.use('/api/features', featuresRoutes);
  app.use('/api/cheers', cheersRoutes);
  app.use('/api/unlocks', unlocksRoutes);
  app.use('/api/teamups', teamupsRoutes);
  app.use('/api/mascot', mascotRoutes);

  // 404 handler for unknown API routes
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // A body over the limit (an import, mostly) answers in JSON, so the app can say so
  app.use((err: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type !== 'entity.too.large') return next(err);
    res.status(413).json({ error: `That file is too big (the limit is ${bodyMb} MB)`, code: 'too-large', limit: bodyMb });
  });

  return app;
}

/** The background jobs: every 30 seconds, for each family (hosted/jobs.ts). */
export const backgroundJobs: Job[] = [
  sendDueTaskNotificationsIfNeeded,
  sendCoinBoostNotificationsIfNeeded,
  runScheduledNotifications,
  closeOldTeamups,
  settleAllStreaks,
  snapshotOverdueChores,
  resumeDuePauses,
];

// Start server only when run directly (not imported by tests)
if (require.main === module || !process.env.VITEST) {
  const PORT = process.env.PORT || 3000;
  if (isHosted()) {
    startHosted();
    operatorFromEnv();
  } else initDatabase();
  const app = createApp();

  // Serve static frontend in production
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`TidyQuest server running on http://localhost:${PORT}${isHosted() ? ' (hosted mode)' : ''}`);
    startJobs(backgroundJobs);
  });
}
