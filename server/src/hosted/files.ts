import fs from 'fs';
import path from 'path';
import { Router, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { currentFamily, isHosted, keepFamily, runInFamily } from './context';
import { dataDir } from './mainDb';
import { familyDir, openFamily } from './families';
import db from '../database';
import { stripPhotoMetadata } from '../utils/photoMetadata';
import { filesViewer, shutOutCode, type FilesViewer } from '../middleware/auth';

// Avatars and proof photos. Self-hosted they sit in data/avatars and data/proofs, served at /api/avatars
// and /api/proofs. In hosted mode each family keeps its own in its folder, served at
// /api/files/<familyId>/<kind>/<name>. Names are random either way.
// Who may load them (NEW-29): proof photos need the photos cookie (middleware/auth.ts) of a parent, the person
// who did the chore or their partner on it; hosted avatars need anyone's in the family. Self-hosted avatars
// stay open, because the login screen shows them before anyone signs in.
export type FileKind = 'avatars' | 'proofs';

function familyOf(familyId?: string): string {
  const id = familyId ?? currentFamily()?.familyId;
  if (!id) throw new Error('No family for this file (hosted mode)');
  return id;
}

/** The folder uploads of this kind go to (made if missing). Pass the request's familyId from multer. */
export function uploadDir(kind: FileKind, familyId?: string): string {
  const dir = isHosted() ? path.join(familyDir(familyOf(familyId)), kind) : path.join(dataDir(), kind);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** The link saved for an uploaded file. */
export function fileUrl(kind: FileKind, name: string, familyId?: string): string {
  return isHosted() ? `/api/files/${familyOf(familyId)}/${kind}/${name}` : `/api/${kind}/${name}`;
}

/**
 * Takes one uploaded file (multer) inside the request's family. One over limitMb answers 413 with the
 * limit, so the app can say how big a file may be.
 */
export function oneFile(field: string, limitMb: () => number, options: Omit<multer.Options, 'limits'>): RequestHandler {
  return keepFamily((req, res, next) => {
    const limit = limitMb();
    multer({ ...options, limits: { fileSize: limit * 1024 * 1024 } }).single(field)(req, res, (err?: unknown) => {
      if ((err as { code?: string } | undefined)?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `That file is too big (the limit is ${limit} MB)`, code: 'too-large', limit });
      }
      if (err || !req.file) return next(err);
      // Photos without location (NEW-34): the camera's metadata comes off. Hosted mode takes only photos it
      // can clean (JPEG, PNG, WebP); the app sends JPEGs.
      try {
        if (!stripPhotoMetadata(req.file.path) && isHosted()) {
          fs.rmSync(req.file.path, { force: true });
          return res.status(400).json({ error: "That photo couldn't be read. Try a JPEG or PNG.", code: 'photo-type' });
        }
        req.file.size = fs.statSync(req.file.path).size;
      } catch (e) {
        fs.rmSync(req.file.path, { force: true });
        return next(e);
      }
      next();
    });
  });
}

/** Bytes of avatars and proof photos in the family's folder (hosted mode). */
export function filesBytes(familyId: string): number {
  let total = 0;
  for (const kind of ['avatars', 'proofs']) {
    const dir = path.join(familyDir(familyId), kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.size ?? 0;
  }
  return total;
}

const FILE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

/** Delete an uploaded file by its saved link, so photos of deleted completions don't use up the family's space. */
export function removeFile(kind: FileKind, url: string | null | undefined): void {
  const name = url?.slice(url.lastIndexOf('/') + 1) ?? '';
  // Only ever a plain name in this family's own folder
  if (FILE_NAME.test(name)) fs.rmSync(path.join(uploadDir(kind), name), { force: true });
}

/** Whether this person may see the file at this link, inside its family's database. */
function mayView(viewer: FilesViewer, kind: FileKind, url: string): boolean {
  // Removed people, and cookies from before "log out everywhere" or a password change, see nothing
  const user = db.prepare('SELECT role, tokenVersion FROM users WHERE id = ?').get(viewer.userId) as
    { role: string; tokenVersion: number } | undefined;
  if (!user || (viewer.v ?? 0) !== user.tokenVersion) return false;
  if (kind === 'avatars' || user.role === 'admin') return true;
  // A proof: the person who did it, or a partner on it (the same rule as History)
  const proof = db.prepare(`
    SELECT tc.userId, tc.teamupId, tc.taskId, tc.completedAt, t.assignmentMode
    FROM task_completions tc LEFT JOIN tasks t ON t.id = tc.taskId WHERE tc.photoUrl = ?
  `).get(url) as { userId: number; teamupId: number | null; taskId: number; completedAt: string; assignmentMode: string | null } | undefined;
  if (!proof) return false;
  if (proof.userId === viewer.userId) return true;
  if (proof.teamupId) {
    return !!db.prepare('SELECT 1 FROM task_completions WHERE teamupId = ? AND userId = ?').get(proof.teamupId, viewer.userId);
  }
  return proof.assignmentMode === 'shared' && !!db.prepare(
    'SELECT 1 FROM task_completions WHERE taskId = ? AND substr(completedAt, 1, 10) = ? AND teamupId IS NULL AND userId = ?'
  ).get(proof.taskId, proof.completedAt.slice(0, 10), viewer.userId);
}

/** Sends a photo, asking the browser to check back each time so a signed-out device can't show its copy. */
function sendPhoto(res: Response, dir: string, name: string): void {
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(name, { root: dir }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Not found' });
  });
}

// Every refusal is the same 404, so a link never tells whether the photo is there
const notFound = (res: Response) => res.status(404).json({ error: 'Not found' });

/** Hosted mode: /api/files/<familyId>/<avatars|proofs>/<name>, for the family's own people while it's open. */
export const filesRouter = Router();

filesRouter.get('/:familyId/:kind/:name', (req, res) => {
  const { familyId, kind, name } = req.params;
  if ((kind !== 'avatars' && kind !== 'proofs') || !FILE_NAME.test(name)) return notFound(res);
  const viewer = filesViewer(req);
  if (!viewer || viewer.fid !== familyId) return notFound(res);
  const family = openFamily(familyId);
  if (!family || shutOutCode(familyId)) return notFound(res);
  if (!runInFamily(family, () => mayView(viewer, kind, fileUrl(kind, name, familyId)))) return notFound(res);
  sendPhoto(res, path.join(familyDir(familyId), kind), name);
});

/** Self-hosted: /api/proofs/<name>. */
export const proofsRouter = Router();

proofsRouter.get('/:name', (req, res) => {
  const { name } = req.params;
  const viewer = filesViewer(req);
  if (!FILE_NAME.test(name) || !viewer || !mayView(viewer, 'proofs', fileUrl('proofs', name))) return notFound(res);
  sendPhoto(res, uploadDir('proofs'), name);
});
