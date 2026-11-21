import React from 'react';
import { UserAvatar } from '../shared/UserAvatar';
import type { QuestPlayer } from './types';

/**
 * The little race track on the Quest Trail cards on Today (NEW-40): everyone's picture along it, yours bigger and
 * on top, and the 🏆 past the end so whoever finished stays in sight. Last month's winner wears a crown (ENH-44). People on the same space sit a little apart.
 */

interface Props {
  players: QuestPlayer[];
  userId: number;
  length: number;
  /** Your picture's size (the others' are 16) */
  youSize?: number;
  /** Last month's winner wears a crown (ENH-44) */
  crown?: number | null;
}

export const QuestRail: React.FC<Props> = ({ players, userId, length, youSize = 22, crown = null }) => {
  const me = players.find((p) => p.userId === userId) ?? null;
  const order = [...players.filter((p) => p.userId !== userId), ...(me ? [me] : [])];
  const at = (p: QuestPlayer) => Math.min(length, Math.max(0, p.position));
  const groups = new Map<number, number[]>();
  for (const p of order) groups.set(at(p), [...(groups.get(at(p)) ?? []), p.userId]);
  const nudge = (p: QuestPlayer) => {
    const g = groups.get(at(p)) ?? [p.userId];
    return (g.indexOf(p.userId) - (g.length - 1) / 2) * 11;
  };
  return (
    <span className="quest-card-rail" aria-hidden="true">
      <span className="quest-card-track" />
      {me && <span className="quest-card-done" style={{ width: `${(100 * at(me)) / length}%` }} />}
      {order.map((p) => (
        <span key={p.userId} className={`quest-card-dot${p.userId === userId ? ' you' : ''}`}
          style={{ left: `calc(${(100 * at(p)) / length}% + ${nudge(p)}px)` }}>
          <UserAvatar name={p.displayName} color={p.avatarColor || '#6B5A4B'} size={p.userId === userId ? youSize : 16}
            avatarType={p.avatarType ?? undefined} avatarPreset={p.avatarPreset} avatarPhotoUrl={p.avatarPhotoUrl} />
          {p.userId === crown && <i className="quest-crown">👑</i>}
        </span>
      ))}
      <span className="quest-card-finish">🏆</span>
    </span>
  );
};

export default QuestRail;
