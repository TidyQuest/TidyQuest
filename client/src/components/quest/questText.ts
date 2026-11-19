import type { MapTexts } from './TrailMap';
import { monthPlus, type MapWords, type WorldKey } from './trailBuild';
import type { QuestEvent, QuestState } from './types';

type Tr = (key: string) => string;

/** Text put into the map's HTML layers */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

const utcDate = (day: string) => new Date(`${day}T12:00:00Z`);
export const monthName = (lang: string, month: string) =>
  new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }).format(utcDate(`${month}-01`));
export const shortDate = (lang: string, day: string) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(utcDate(day.slice(0, 10)));
export const listOf = (lang: string, names: string[]) => {
  try { return new Intl.ListFormat(lang, { type: 'conjunction' }).format(names); } catch { return names.join(', '); }
};

/** Days left after today in the trail's month (0 on the last day) */
export function daysLeft(endDay: string, now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((utcDate(endDay).getTime() - 12 * 3600e3 - today) / 86400e3));
}

export const worldTitle = (t: Tr, world: WorldKey) => t(`quest.${world}Title`);
/** The world's finish landmark, as the object of "reach" ("the Treehouse") */
export const finishPlace = (t: Tr, world: WorldKey) => t(`quest.${world}Place`);

/** A prize as one line: the catalog reward and/or the coins */
export function prizeText(t: Tr, prize: { rewardTitle: string | null; coins: number } | null): string | null {
  if (!prize) return null;
  const parts = [prize.rewardTitle, prize.coins > 0 ? fill(t('quest.prizeCoins'), { n: prize.coins }) : null].filter(Boolean) as string[];
  return parts.length ? parts.join(' + ') : null;
}

/** Everything written on the map, escaped */
export function mapTexts(t: Tr, lang: string, s: QuestState, meId: number | null, myPos: number): MapTexts {
  const w = s.trail.world, e = (k: string) => esc(t(`quest.${k}`));
  const go = t(`quest.${w}Go`), back = t(`quest.${w}Back`);
  const words: MapWords = {
    start: e('mapStart'), finish: e('mapFinish'), halfway: e('mapHalfway'),
    toGo: (n) => esc(fill(t('quest.mapToGo'), { n })),
    go: esc(go), back: esc(back),
    pill: (kind, n) => esc(fill(t('quest.mapPill'), { name: kind === 'go' ? go : back, n })),
    regions: [1, 2, 3, 4, 5].map((i) => e(`${w}Region${i}`)),
    waters: [1, 2].map((i) => e(`${w}Water${i}`)),
    onward: esc(fill(t('quest.mapOnward'), { month: monthName(lang, monthPlus(s.trail.month, 1)) })),
    key: {
      coins: e('keyCoins'), coinsWhat: e('keyCoinsWhat'), card: e('keyCard'), cardWhat: e('keyCardWhat'), treat: e('keyTreat'), treatWhat: e('keyTreatWhat'),
      upWhat: e('keyUpWhat'), downWhat: e('keyDownWhat'), high: e('keyHigh'), highWhat: e('keyHighWhat'),
    },
  };
  const prize = prizeText(t, s.prize);
  // Once someone has won the prize, the sign at the finish says who (and what they won)
  const won = s.prize.won;
  const prizeSign = won
    ? fill(t(won.userId === meId ? 'quest.prizeWonYou' : 'quest.prizeWonBy'), { name: won.displayName, prize: prizeText(t, won) ?? prize ?? '' })
    : prize ? fill(t(s.prize.kidsOnly ? 'quest.prizeFirstKid' : 'quest.prizeFirst'), { place: finishPlace(t, w), prize }) : null;
  const title = worldTitle(t, w);
  const playing = s.players.some((p) => p.userId === meId);
  return {
    words,
    kicker: esc(fill(t('quest.mapKicker'), { month: monthName(lang, s.trail.month) })),
    title: esc(title),
    sub: esc(fill(t('quest.mapSub'), { n: s.trail.length, date: shortDate(lang, s.trail.endDay) })),
    keyTitle: e('keyTitle'),
    fogTitle: e('fogTitle'), fogSub: e('fogSub'),
    prize: prizeSign ? { label: e('prizeLabel'), text: esc(prizeSign) } : null,
    you: t('quest.you'),
    aria: playing ? fill(t('quest.mapAria'), { title, pos: myPos, n: s.trail.length }) : fill(t('quest.mapAriaWatch'), { title, n: s.trail.length }),
  };
}

export type ResultKind = 'plain' | 'coins' | 'up' | 'down' | 'card' | 'treat' | 'high' | 'finish';
export interface TurnMessage { kind: ResultKind; title: string; body: string }

/** What a roll did, in words (the result card on the map page) */
export function turnMessage(t: Tr, lang: string, world: WorldKey, events: QuestEvent[], starsLeft: number, names: Map<number, string>, coinsPerStar: number): TurnMessage {
  const has = <K extends QuestEvent['t']>(k: K) => events.find((e) => e.t === k) as Extract<QuestEvent, { t: K }> | undefined;
  const move = has('move'), high = has('highFive');
  const mates = high ? listOf(lang, high.with.map((id) => names.get(id) ?? '?')) : '';
  const highLine = high ? fill(t('quest.resHighFiveWith'), { names: mates }) : '';
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
  const cash = has('cashIn');
  if (cash) return { kind: 'coins', title: fill(t('quest.resCoins'), { n: cash.coins }), body: t('quest.resCashInBody') };
  const fin = has('finish');
  if (fin) {
    const prize = prizeText(t, fin.prize);
    return {
      kind: 'finish',
      title: fill(t('quest.resFinish'), { place: finishPlace(t, world) }),
      body: join(
        fill(t('quest.resPlace'), { n: fin.place }),
        fin.coins > 0 ? fill(t('quest.resFinisherCoins'), { n: fin.coins }) : '',
        prize ? fill(t('quest.resPrize'), { prize }) : '',
        prize && fin.prize?.rewardTitle ? t('quest.resPrizeReward') : '',
        coinsPerStar > 0 ? fill(t('quest.resAfter'), { n: coinsPerStar }) : '',
      ),
    };
  }
  const coins = has('coins'), up = has('shortcut'), down = has('slide'), card = has('card'), treat = has('treat'), treatCoins = has('treatCoins');
  if (coins) return { kind: 'coins', title: fill(t(coins.n === 1 ? 'quest.resCoin' : 'quest.resCoins'), { n: coins.n }), body: join(t(`quest.${world}CoinText`), highLine) };
  if (up) return { kind: 'up', title: `${t(`quest.${world}Go`)}!`, body: join(fill(t('quest.resJump'), { text: t(`quest.${world}GoText`), a: up.from, b: up.to }), highLine) };
  if (down) return { kind: 'down', title: `${t(`quest.${world}Back`)}!`, body: join(fill(t('quest.resJump'), { text: t(`quest.${world}BackText`), a: down.from, b: down.to }), highLine) };
  if (card) return { kind: 'card', title: t('quest.resCard'), body: join(t(card.fresh ? 'quest.resCardFresh' : 'quest.resCardOld'), highLine) };
  if (treat) return { kind: 'treat', title: t('quest.resTreat'), body: join(fill(t('quest.resTreatItem'), { item: t(`mascot.item_${treat.item}`) }), highLine) };
  if (treatCoins) return { kind: 'treat', title: t('quest.resTreat'), body: join(fill(t('quest.resTreatCoins'), { n: treatCoins.n }), highLine) };
  if (high) return { kind: 'high', title: t('quest.resHighFive'), body: highLine };
  return { kind: 'plain', title: fill(t('quest.resSpace'), { n: move?.to ?? 0 }), body: t(starsLeft > 0 ? 'quest.resQuiet' : 'quest.resQuietDone') };
}
