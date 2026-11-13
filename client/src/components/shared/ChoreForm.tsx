import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { IconPicker } from './IconPicker';
import { Toggle } from './Toggle';
import { DueOnPicker, ReminderPicker, RotationPeriodPicker, SeasonPicker, StartsOnPicker, StepsField, TimerPicker } from './ScheduleFields';
import { startsLater, todayIso, type ScheduleValue } from '../../utils/schedule';
import { useTranslation } from '../../hooks/useTranslation';
import { FREQ_UNITS, healthColor, initPercentages, type AssignMode, type ChoreFormState } from '../../utils/choreForm';

// The chore form (ENH-28), the same for Add and Edit: name and notes, When, Who, Effort & coins, then More options
// folded. A bottom sheet on phones with Save pinned to the bottom; a panel beside the list on a computer.

const customTotal = (f: ChoreFormState) => f.assignmentUserIds.reduce((s, id) => s + (f.assignmentPercentages[id] ?? 0), 0);

const tomorrowIso = () => todayIso(new Date(Date.now() + 86400000));

function FrequencyPicker({ value, unit, onChange, t }: {
  value: number; unit: string;
  onChange: (v: number, u: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input type="number" min={1} max={999} value={value} aria-label={t('roomDetail.every')}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value) || 1), unit)}
        className="tq-input-compact"
        style={{ width: 52, textAlign: 'center', fontWeight: 700 }} />
      <select value={unit} onChange={(e) => onChange(value, e.target.value)}
        className="tq-input-compact"
        style={{ cursor: 'pointer' }}>
        {FREQ_UNITS.map((f) => (
          <option key={f.label} value={f.label}>{t(`units.${f.label}`)}</option>
        ))}
      </select>
    </div>
  );
}

function EffortPicker({ effort, onChange, label }: { effort: number; onChange: (e: number) => void; label: string }) {
  return (
    <div style={{ display: 'flex', gap: 2 }} role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((e) => (
        <button type="button" key={e} onClick={() => onChange(e)} aria-label={String(e)} aria-pressed={e === effort}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, opacity: e <= effort ? 1 : 0.3 }}>
          <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
            <path d="M7 1L8.5 5H12.5L9.5 7.5L10.5 11.5L7 9L3.5 11.5L4.5 7.5L1.5 5H5.5L7 1Z"
              fill={e <= effort ? '#F59E0B' : 'none'}
              stroke={e <= effort ? '#F59E0B' : '#E2D5C5'}
              strokeWidth={e <= effort ? '0.5' : '1'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

/** One line of a group: the label (and a short hint) on the left, the control on the right */
function Row({ label, hint, children, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="cf-row">
      <div className="cf-row-text">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <b>{label}</b>}
        {hint && <small>{hint}</small>}
      </div>
      <div className="cf-row-ctl">{children}</div>
    </div>
  );
}

export function ChoreSheet({ kind, form, setForm, schedule, setSchedule, room, users, language, coinsByEffort, allowOneTime = true, nameError, error, saving, onSave, onCancel, onDelete }: {
  kind: 'add' | 'edit';
  form: ChoreFormState;
  setForm: Dispatch<SetStateAction<ChoreFormState>>;
  schedule: ScheduleValue;
  setSchedule: (v: ScheduleValue) => void;
  room: { name: string; color: string; assignedUserId?: number | null };
  users?: Array<{ id: number; displayName: string }>;
  language?: string;
  coinsByEffort?: Record<number, number>;
  allowOneTime?: boolean;
  /** "Give it a name" under the name box */
  nameError?: string;
  /** Why the last save didn't go through */
  error?: string;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Edit only: Delete Task (it goes to Recently deleted) */
  onDelete?: () => void;
}) {
  const { t } = useTranslation(language);
  const set = <K extends keyof ChoreFormState>(key: K, value: ChoreFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const [moreOpen, setMoreOpen] = useState(false);
  const isEdit = kind === 'edit';
  const autoCoins = coinsByEffort?.[form.effort];
  const total = customTotal(form);
  const saveDisabled = form.assignmentType === 'users' && form.assignmentMode === 'custom' && form.assignmentUserIds.length >= 2 && total !== 100;
  const scheduled = !form.onDemand;
  const repeating = scheduled && schedule.mode !== 'once';
  const roomOwner = room.assignedUserId ? (users ?? []).find((u) => u.id === room.assignedUserId) : undefined;

  // More options says what's set in it, so nothing hides there unnoticed
  const stepCount = schedule.steps.split('\n').filter((s) => s.trim()).length;
  const moreSet = [
    stepCount > 0 && t('choreForm.sumSteps').replace('{n}', String(stepCount)),
    schedule.timerMinutes && t('choreForm.sumTimer').replace('{n}', schedule.timerMinutes),
    repeating && startsLater(schedule) && t('choreForm.sumStart'),
    repeating && schedule.seasonOn && t('choreForm.sumSeason'),
    isEdit && form.paused && t('choreForm.sumPaused'),
  ].filter(Boolean) as string[];

  const togglePerson = (id: number) => setForm((f) => {
    const ids = f.assignmentUserIds.includes(id) ? f.assignmentUserIds.filter((x) => x !== id) : [...f.assignmentUserIds, id];
    return { ...f, assignmentUserIds: ids, assignmentPercentages: f.assignmentMode === 'custom' ? initPercentages(ids) : f.assignmentPercentages };
  });
  const setMode = (mode: AssignMode) => setForm((f) => ({
    ...f, assignmentMode: mode, assignmentPercentages: mode === 'custom' ? initPercentages(f.assignmentUserIds) : f.assignmentPercentages,
  }));
  const modeHint: Record<AssignMode, string> = {
    first: t('choreForm.firstHint'), shared: t('choreForm.sharedHint'), custom: t('choreForm.customHint'), rotating: t('roomDetail.rotatingDesc'),
  };
  const title = isEdit ? t('choreForm.titleEdit') : t('choreForm.titleAdd');

  return createPortal(
    <div className="tq-modal-overlay task-edit-overlay cf-sheet-overlay" onClick={onCancel}>
      <div className="tq-card tq-modal cf-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="cf-sheet-head">
          <h2>{title}</h2>
          <span className="cf-sheet-room">{room.name}</span>
          <button type="button" className="cf-sheet-x" onClick={onCancel} aria-label={t('common.cancel')}>×</button>
        </div>

        <div className="cf-sheet-body">
          {/* Name and notes */}
          <section className="cf-group">
            <label className="cf-field" htmlFor="cf-name">{t('roomDetail.name')}</label>
            <input id="cf-name" value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isEdit) onSave(); }}
              autoFocus={!window.matchMedia('(pointer: coarse)').matches}
              placeholder={isEdit ? undefined : t('roomDetail.taskName')}
              className="tq-input" aria-invalid={!!nameError}
              style={{ width: '100%', fontWeight: 700, borderColor: nameError ? 'var(--health-red)' : undefined }} />
            {nameError && <div className="cf-err">{nameError}</div>}
            <label className="cf-field" htmlFor="cf-notes">{t('roomDetail.notes')}</label>
            <textarea id="cf-notes" value={form.notes} rows={2} className="tq-input"
              onChange={(e) => set('notes', e.target.value)} placeholder={t('roomDetail.optionalNotes')}
              style={{ width: '100%', resize: 'vertical' }} />
            <Row label={t('roomDetail.icon')}>
              <IconPicker value={form.iconKey} onChange={(k) => set('iconKey', k)} language={language}
                taskName={form.name} roomName={room.name} roomColor={room.color}
                coins={form.customCoins !== '' ? Number(form.customCoins) : autoCoins} />
            </Row>
          </section>

          {/* When */}
          <section className="cf-group">
            <h3>{t('choreForm.when')}</h3>
            {scheduled && (
              <DueOnPicker seg allowOnce={allowOneTime} value={schedule} onChange={setSchedule} t={t} language={language}
                interval={<FrequencyPicker value={form.freqValue} unit={form.freqUnit} t={t}
                  onChange={(v, u) => setForm((f) => ({ ...f, freqValue: v, freqUnit: u }))} />} />
            )}
            <Row label={t('roomDetail.onDemand')} hint={t('choreForm.onDemandHint')}>
              <Toggle checked={form.onDemand} onChange={(on) => set('onDemand', on)} label={t('roomDetail.onDemand')} />
            </Row>
            {form.onDemand && (
              <>
                <Row label={t('roomDetail.showInDashboard')}>
                  <Toggle checked={form.showInDashboard} onChange={(on) => set('showInDashboard', on)} label={t('roomDetail.showInDashboard')} />
                </Row>
                <Row label={t('repeat.limit')} hint={t('repeat.limitDesc')}>
                  <input type="number" min={1} max={99} className="tq-input-compact" value={form.repeatLimit} placeholder="∞"
                    aria-label={t('repeat.limit')} onChange={(e) => set('repeatLimit', e.target.value)} style={{ width: 52 }} />
                  <select className="tq-input-compact" value={form.repeatPeriod} onChange={(e) => set('repeatPeriod', e.target.value as 'day' | 'week')}>
                    <option value="day">{t('repeat.perDay')}</option>
                    <option value="week">{t('repeat.perWeek')}</option>
                  </select>
                </Row>
              </>
            )}
            {scheduled && <ReminderPicker value={schedule} onChange={setSchedule} t={t} />}
          </section>

          {/* Who */}
          <section className="cf-group">
            <h3>{t('choreForm.who')}</h3>
            {room.assignedUserId ? (
              <p className="cf-hint">{t('rooms.assignedTo').replace('{name}', roomOwner?.displayName ?? '?')} · {t('choreForm.roomOwnerHint')}</p>
            ) : (
              <>
                <div className="cf-seg" role="group" aria-label={t('choreForm.who')}>
                  {(['none', 'users'] as const).map((type) => (
                    <button type="button" key={type} className={form.assignmentType === type ? 'on' : ''} aria-pressed={form.assignmentType === type}
                      onClick={() => setForm((f) => f.assignmentType === type ? f : ({ ...f, assignmentType: type, assignmentUserIds: [], assignmentMode: 'first', assignmentPercentages: {} }))}>
                      {type === 'none' ? t('choreForm.everyone') : t('choreForm.specific')}
                    </button>
                  ))}
                </div>
                {form.assignmentType === 'none' ? (
                  <p className="cf-hint">{t('choreForm.everyoneHint')}</p>
                ) : (
                  <>
                    <div className="cf-people">
                      {(users ?? []).map((u) => {
                        const on = form.assignmentUserIds.includes(u.id);
                        return (
                          <button type="button" key={u.id} className={`cf-person${on ? ' on' : ''}`} aria-pressed={on} onClick={() => togglePerson(u.id)}>
                            {on && <span aria-hidden="true">✓</span>}{u.displayName}
                          </button>
                        );
                      })}
                    </div>
                    {form.assignmentUserIds.length === 0 && <p className="cf-hint">{t('choreForm.pickPeople')}</p>}
                    {form.assignmentUserIds.length >= 2 && (
                      <>
                        <div className="cf-seg" role="group" aria-label={t('roomDetail.assignmentMode')}>
                          {(['first', 'shared', 'rotating', 'custom'] as const).map((mode) => (
                            <button type="button" key={mode} className={form.assignmentMode === mode ? 'on' : ''} aria-pressed={form.assignmentMode === mode} onClick={() => setMode(mode)}>
                              {mode === 'first' ? t('choreForm.firstCome') : mode === 'shared' ? t('rooms.modeShared') : mode === 'custom' ? t('rooms.modeCustom') : t('roomDetail.rotating')}
                            </button>
                          ))}
                        </div>
                        <p className="cf-hint">{modeHint[form.assignmentMode]}</p>
                        {form.assignmentMode === 'rotating' && <RotationPeriodPicker value={schedule} onChange={setSchedule} t={t} language={language} />}
                        {form.assignmentMode === 'custom' && (
                          <div className="cf-split">
                            {form.assignmentUserIds.map((uid) => {
                              const u = (users ?? []).find((x) => x.id === uid);
                              if (!u) return null;
                              return (
                                <label key={uid}>
                                  <span>{u.displayName}</span>
                                  <input type="number" min={0} max={100} className="tq-input-compact" value={form.assignmentPercentages[uid] ?? 0}
                                    onChange={(e) => setForm((f) => ({ ...f, assignmentPercentages: { ...f.assignmentPercentages, [uid]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) } }))}
                                    style={{ width: 56, textAlign: 'center', fontWeight: 700 }} />
                                  <span>%</span>
                                </label>
                              );
                            })}
                            <div className="cf-hint" style={{ fontWeight: 700, color: total === 100 ? 'var(--health-green)' : 'var(--health-red)' }}>
                              {t('rooms.totalPercentage').replace('{total}', String(total))} {total === 100 ? '✓' : '✗'}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          {/* Effort & coins */}
          <section className="cf-group">
            <h3>{t('choreForm.effortCoins')}</h3>
            <Row label={t('roomDetail.effort')}>
              <EffortPicker effort={form.effort} onChange={(e) => set('effort', e)} label={t('roomDetail.effort')} />
            </Row>
            <Row label={t('choreForm.coins')} htmlFor="cf-coins"
              hint={autoCoins != null ? t('choreForm.coinsAuto').replace('{coins}', String(autoCoins)) : t('roomDetail.customCoinsDesc')}>
              <input id="cf-coins" type="number" min={1} value={form.customCoins}
                onChange={(e) => set('customCoins', e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                placeholder={autoCoins != null ? String(autoCoins) : t('roomDetail.customCoinsPlaceholder')}
                className="tq-input-compact" style={{ width: 72, textAlign: 'center', fontWeight: 700 }} />
            </Row>
            <Row label={t('roomDetail.allowEarlyCompletion')} hint={t('roomDetail.allowEarlyCompletionDesc')}>
              <Toggle checked={form.allowEarlyCompletion} onChange={(on) => set('allowEarlyCompletion', on)} label={t('roomDetail.allowEarlyCompletion')} />
            </Row>
          </section>

          {/* More options: the ones most chores never need */}
          <section className="cf-group cf-more">
            <button type="button" className="cf-more-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              <span className="cf-row-text">
                <b>{t('choreForm.more')}</b>
                <small>{moreSet.length ? moreSet.join(' · ') : isEdit ? t('choreForm.moreHint') : t('choreForm.moreHintAdd')}</small>
              </span>
              <span className={`cf-more-chev${moreOpen ? ' open' : ''}`} aria-hidden="true">⌄</span>
            </button>
            {moreOpen && (
              <div className="cf-more-body">
                <StepsField value={schedule} onChange={setSchedule} t={t} />
                <TimerPicker value={schedule} onChange={setSchedule} t={t} />
                {repeating && <StartsOnPicker value={schedule} onChange={setSchedule} t={t} />}
                {repeating && <SeasonPicker value={schedule} onChange={setSchedule} t={t} language={language} />}
                {scheduled && startsLater(schedule) ? (
                  <p className="cf-hint">{t('schedule.firstDueOnStart')}</p>
                ) : (
                  <div>
                    <div className="cf-health-head">
                      <label htmlFor="cf-health">{t('rooms.health')}</label>
                      <b style={{ color: healthColor(form.health) }}>{form.health}%</b>
                    </div>
                    <input id="cf-health" type="range" min={0} max={100} step={10} value={form.health}
                      onChange={(e) => setForm((f) => ({ ...f, health: parseInt(e.target.value, 10), healthChanged: true }))}
                      style={{ width: '100%', accentColor: healthColor(form.health) }} />
                    <div className="cf-health-ends"><span>{t('rooms.dirty')}</span><span>{t('rooms.clean')}</span></div>
                  </div>
                )}
                {isEdit && (
                  <>
                    <Row label={t('pause.switch')}>
                      <Toggle checked={form.paused} onChange={(on) => setForm((f) => ({ ...f, paused: on, pausedUntil: on ? f.pausedUntil : '' }))} label={t('pause.switch')} />
                    </Row>
                    {form.paused && (
                      <>
                        <Row label={t('pause.untilLabel')} htmlFor="cf-paused-until">
                          <input id="cf-paused-until" type="date" className="tq-input-compact" value={form.pausedUntil} min={tomorrowIso()}
                            onChange={(e) => set('pausedUntil', e.target.value)} />
                        </Row>
                        <p className="cf-hint">{t('pause.hint')}</p>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {onDelete && (
            <button type="button" className="cf-delete" onClick={onDelete}>{t('roomDetail.deleteTask')}</button>
          )}
        </div>

        {/* Save stays at the bottom however far the form scrolls */}
        <div className="cf-sheet-foot">
          {error && <div role="alert" className="cf-err" style={{ flexBasis: '100%', textAlign: 'right' }}>{error}</div>}
          <button type="button" onClick={onCancel} className="tq-btn tq-btn-secondary">{t('common.cancel')}</button>
          <button type="button" onClick={onSave} disabled={saveDisabled || saving} className="tq-btn tq-btn-primary"
            style={{ opacity: saveDisabled ? 0.5 : 1 }}>{isEdit ? t('common.save') : t('roomDetail.addTask')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
