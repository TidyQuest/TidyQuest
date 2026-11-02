import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../database';
import { currentFamily, isHosted, runInFamily } from '../hosted/context';
import { familyStatusOf, openFamily } from '../hosted/families';
import { isLocked } from '../hosted/accounts';

// Security: Require JWT_SECRET in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production mode.');
  console.error('Generate a secure secret: openssl rand -base64 32');
  console.error('Set it in your .env file or docker-compose.yml');
  process.exit(1);
}

const JWT_SECRET: string = process.env.JWT_SECRET || (() => {
  const secret = require('crypto').randomBytes(32).toString('hex');
  console.warn('[WARN] JWT_SECRET not set — using random secret. Tokens will invalidate on restart. Set JWT_SECRET in your environment.');
  return secret;
})();

export interface AuthRequest extends Request {
  userId?: number;
  /** Hosted mode: the family this request belongs to. */
  familyId?: string;
}

type TokenPayload = { userId: number; v?: number; fid?: string; aud?: unknown };

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  // An operator-page token (it has an audience) never opens a family
  if (payload.aud !== undefined) return res.status(401).json({ error: 'Invalid token' });
  if (!isHosted()) return checkUser(req, res, next, payload);
  // Hosted mode: the token names the family. The rest of the request runs with that family's database.
  const family = openFamily(payload.fid);
  if (!family) return res.status(401).json({ error: 'Signed out' });
  req.familyId = family.familyId;
  // A suspended or expired family, or one that hasn't confirmed a parent's email within 30 days (decision 3),
  // can only see its account and export. The app shows why from /api/hosted/account.
  const shutOut = () => {
    if (OPEN_WHEN_LOCKED.test(req.originalUrl)) return next();
    const code = shutOutCode(family.familyId);
    if (code === 'suspended') return res.status(403).json({ error: 'This family is paused', code });
    if (code === 'expired') return res.status(403).json({ error: 'The free trial has ended', code });
    if (code === 'confirm-email') return res.status(403).json({ error: 'Confirm your email to keep using TidyQuest', code });
    next();
  };
  runInFamily(family, () => checkUser(req, res, shutOut, payload));
}

/** Why a hosted family can only see its account and export, or null when it's open. */
export function shutOutCode(familyId: string): 'suspended' | 'expired' | 'confirm-email' | null {
  const status = familyStatusOf(familyId);
  if (status === 'suspended' || status === 'expired') return status;
  return isLocked(familyId) ? 'confirm-email' : null;
}

// What a locked, suspended or expired family can still reach: its account (confirming, changing the
// email), its export (always, ROADMAP rule 2), who's signed in
const OPEN_WHEN_LOCKED = /^\/api\/(hosted\/|export(\?|$)|auth\/me(\?|$))/;

function checkUser(req: AuthRequest, res: Response, next: NextFunction, payload: TokenPayload) {
  // Turn away a removed person, or a token from before their last "log out everywhere" or password
  // change. Tokens made before NEW-8 have no version and count as 0.
  const row = db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(payload.userId) as { tokenVersion: number } | undefined;
  if (!row || (payload.v ?? 0) !== row.tokenVersion) {
    return res.status(401).json({ error: 'Signed out' });
  }
  req.userId = payload.userId;
  next();
}

function tokenPayload(userId: number): TokenPayload {
  const row = db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(userId) as { tokenVersion: number } | undefined;
  const fid = isHosted() ? currentFamily()?.familyId : undefined;
  return { userId, v: row?.tokenVersion ?? 0, ...(fid && { fid }) };
}

/** A login token for this person, carrying their current token version. */
export function generateToken(userId: number): string {
  return jwt.sign(tokenPayload(userId), JWT_SECRET, { expiresIn: '30d' });
}

/** A login token, plus the photos cookie for the same person (every answer that signs someone in uses this). */
export function loginToken(res: Response, userId: number): string {
  setFilesCookie(res, userId);
  return generateToken(userId);
}

// Photos (NEW-29). An <img> can't send the login header, so the server also sets a cookie that the browser
// sends only to the photo addresses (hosted/files.ts). It carries its own token, marked "files": the family
// routes refuse it like an operator token, so it can't be used for anything but loading photos.
const FILES_AUDIENCE = 'files';
const FILES_COOKIE = 'tq_files';
export type FilesViewer = { userId: number; v: number; fid?: string };

/** Where the cookie is sent: hosted photos are all under /api/files; self-hosted avatars stay open. */
const filesCookiePath = () => (isHosted() ? '/api/files' : '/api/proofs');
const filesCookieOptions = (res: Response) =>
  ({ httpOnly: true, sameSite: 'strict', secure: res.req.secure, path: filesCookiePath() }) as const;

export function setFilesCookie(res: Response, userId: number): void {
  const token = jwt.sign(tokenPayload(userId), JWT_SECRET, { audience: FILES_AUDIENCE, expiresIn: '30d' });
  res.cookie(FILES_COOKIE, token, { ...filesCookieOptions(res), maxAge: 30 * 24 * 60 * 60 * 1000 });
}

export function clearFilesCookie(res: Response): void {
  res.clearCookie(FILES_COOKIE, filesCookieOptions(res));
}

/** Who's asking for a photo, from the cookie (not yet checked against the person's token version). */
export function filesViewer(req: Request): FilesViewer | null {
  const pair = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${FILES_COOKIE}=`));
  if (!pair) return null;
  try {
    return jwt.verify(decodeURIComponent(pair.slice(FILES_COOKIE.length + 1)), JWT_SECRET, { audience: FILES_AUDIENCE }) as FilesViewer;
  } catch {
    return null;
  }
}

/** Logs this person out on every device: their existing tokens stop working. */
export function revokeTokens(userId: number): void {
  db.prepare('UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ?').run(userId);
}

// Operator-page tokens (hosted/operator.ts) are marked with their own audience and last 12 hours. The
// family routes refuse them above, and the operator routes refuse every token without it.
const OPERATOR_AUDIENCE = 'operator';
export type OperatorTokenPayload = { op: number; v: number };

export function signOperatorToken(payload: OperatorTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { audience: OPERATOR_AUDIENCE, expiresIn: '12h' });
}

export function verifyOperatorToken(token: string): OperatorTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { audience: OPERATOR_AUDIENCE }) as OperatorTokenPayload;
  } catch {
    return null;
  }
}
