import { useEffect, useState, type CSSProperties } from 'react';
import { api, type NotifyPerson } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { localeFor } from '../../utils/locale';
import { pushBlock, pushFailure, pushOwner } from '../../utils/push';
import { pushOnHere, turnOffPush, turnOnPush } from '../../utils/pushSync';

const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--warm-text-muted)' };
const hint: CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };

/**
 * Web push (NEW-5) in a person's notification settings: the phones and computers that get their notifications.
 * On their own Profile (`own`) it also turns it on or off for the device in their hand. Hidden while Settings →
 * Features has it off.
 */
export function PushDevices({ person, own, language, onChange }: { person: NotifyPerson; own?: boolean; language?: string; onChange: (next: NotifyPerson) => void }) {
  const { t } = useTranslation(language);
  const [info, setInfo] = useState<{ publicKey: string; on: boolean; notificationsOn: boolean } | null>(null);
  const [here, setHere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { api.pushInfo().then(setInfo).catch(() => setInfo(null)); }, []);
  useEffect(() => {
    if (own) pushOnHere(person.id).then(setHere).catch(() => setHere(false));
  }, [own, person.id]);
  if (!info?.on) return null;

  const reload = () => api.getNotifyPerson(person.id).then(onChange);
  const block = own && !here ? pushBlock() : null;
  const thisDevice = own ? pushOwner()?.deviceId : undefined;
  const added = (iso: string) => new Date(iso).toLocaleDateString(localeFor(language), { month: 'short', day: 'numeric' });

  const turnOn = () => {
    setBusy(true);
    setMessage('');
    // Straight from the tap: the browser asks for permission first
    turnOnPush(person.id, info.publicKey)
      .then(() => { setHere(true); setMessage(t('push.turnedOn')); return reload(); })
      .catch((err) => pushFailure(err).then((why) => setMessage(t(`push.${why}`))))
      .finally(() => setBusy(false));
  };
  const turnOff = () => {
    setBusy(true);
    setMessage('');
    turnOffPush()
      .then(() => { setHere(false); setMessage(t('push.turnedOff')); return reload(); })
      .catch(() => setMessage(t('push.failed')))
      .finally(() => setBusy(false));
  };
  const remove = (deviceId: number) => {
    if (deviceId === thisDevice) return turnOff();
    api.removePushDevice(person.id, deviceId).then(onChange).catch(() => setMessage(t('push.failed')));
  };

  return (
    <div style={{ display: 'grid', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--warm-border)' }}>
      <span style={label}>📲 {t('push.title')}</span>
      {own && (
        <>
          <div style={hint}>
            {here ? t('push.onHere')
              : !info.notificationsOn ? t('push.familyOff')
              : block ? t(`push.block_${block}`)
              : t('push.offHere')}
          </div>
          {!block && info.notificationsOn && (
            <div style={row}>
              <button className={`tq-btn tq-btn-sm ${here ? 'tq-btn-secondary' : 'tq-btn-primary'}`} onClick={here ? turnOff : turnOn} disabled={busy}>
                {here ? t('push.turnOff') : t('push.turnOn')}
              </button>
            </div>
          )}
        </>
      )}
      {person.devices.length === 0 && !own && <div style={hint}>{t('push.none')}</div>}
      {person.devices.map((d) => (
        <div key={d.id} style={{ ...row, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text)', minWidth: 0, overflowWrap: 'anywhere' }}>
            {d.label || t('push.device')}
            {d.id === thisDevice && here ? ` · ${t('push.thisDevice')}` : ''}
            <span style={{ ...hint, marginLeft: 6 }}>{t('push.added').replace('{date}', added(d.createdAt))}</span>
          </span>
          <button className="tq-btn tq-btn-sm tq-btn-secondary" onClick={() => remove(d.id)} disabled={busy}>{t('push.remove')}</button>
        </div>
      ))}
      {message && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-accent)' }}>{message}</div>}
    </div>
  );
}
