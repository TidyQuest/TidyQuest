import { useEffect, useState } from 'react';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { pushBlock, pushFailure } from '../../utils/push';
import { turnOnPush } from '../../utils/pushSync';

export type NotifyCardKind = 'kid' | 'parent';

/**
 * "Turn on notifications" (ENH-31): on Today, Kid mode and One thing at a time's "all done", for someone with no
 * channel of their own, after their first chore of the day (the server decides: utils/notifyCard.ts). Turn on runs
 * the same flow as Profile → My notifications. On an iPhone outside the Home Screen app, or with notifications
 * blocked, it shows Profile's hint instead; on an http:// address or a browser without push it stays hidden.
 */
export function NotifyCard({ kind, userId, language, onTurnedOn, onGone }: {
  kind: NotifyCardKind; userId: number; language?: string; onTurnedOn: () => void; onGone: () => void;
}) {
  const { t } = useTranslation(language);
  const [publicKey, setPublicKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { api.pushInfo().then((i) => setPublicKey(i.on ? i.publicKey : '')).catch(() => setPublicKey('')); }, []);

  const block = on ? null : pushBlock();
  if (block === 'insecure' || block === 'unsupported') return null;
  if (!on && !publicKey) return null;

  const turnOn = () => {
    setBusy(true);
    setMessage('');
    // Straight from the tap: the browser asks for permission first
    turnOnPush(userId, publicKey)
      .then(() => { setOn(true); onTurnedOn(); return api.notifyCard('done'); })
      .catch((err) => pushFailure(err).then((why) => setMessage(t(`push.${why}`))))
      .finally(() => setBusy(false));
  };
  const notNow = () => {
    api.notifyCard('snooze').catch(() => {});
    onGone();
  };

  return (
    <section className="notify-card" aria-live="polite">
      <span className="notify-card-icon" aria-hidden="true">{on ? '✅' : '🔔'}</span>
      <div className="notify-card-body">
        {on ? (
          <p>{t(kind === 'kid' ? 'notifyCard.onKid' : 'notifyCard.onParent')}</p>
        ) : (
          <>
            <b>{t(kind === 'kid' ? 'notifyCard.titleKid' : 'notifyCard.titleParent')}</b>
            <p>{block ? t(`push.block_${block}`) : t('notifyCard.text')}</p>
          </>
        )}
        {message && <p className="notify-card-error" role="alert">{message}</p>}
        <div className="notify-card-actions">
          {on ? (
            <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" onClick={onGone}>{t('notifyCard.gotIt')}</button>
          ) : (
            <>
              {!block && <button type="button" className="tq-btn tq-btn-primary tq-btn-sm" onClick={turnOn} disabled={busy}>{t('notifyCard.turnOn')}</button>}
              <button type="button" className="tq-btn tq-btn-secondary tq-btn-sm" onClick={notNow} disabled={busy}>{t('notifyCard.notNow')}</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
