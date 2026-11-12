// Why a Done didn't go through, in the page's language. The server answers with short codes.
const CODES: Record<string, string> = {
  already_done_today: 'app.alreadyDoneToday',
  already_done_by_other: 'app.alreadyDoneByOther',
  already_done: 'app.alreadyDone',
  repeat_limit_reached: 'repeat.limitReached',
  not_assigned: 'app.notAssigned',
  not_yet_due: 'app.notYetDue',
  not_your_turn: 'app.notYourTurn',
  paused: 'app.chorePaused',
  claimed_by_team: 'app.claimedByTeam',
};

// A parent marking it done for someone else: "You already did this" would be about the wrong person
const DONE_ALREADY = ['already_done_today', 'already_done_by_other', 'not_yet_due'];

export function taskErrorText(err: unknown, t: (key: string) => string, forSomeoneElse = false): string {
  const msg = err instanceof Error ? err.message : '';
  if (forSomeoneElse && DONE_ALREADY.includes(msg)) return t('app.alreadyDone');
  if (CODES[msg]) return t(CODES[msg]);
  // A code without its own message, or no answer at all (offline, the server restarting): never the raw
  // code (BUG-37)
  if (!msg || err instanceof TypeError || /^[a-z_]+$/.test(msg)) return t('common.actionFailed');
  return msg;
}
