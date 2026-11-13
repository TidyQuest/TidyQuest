import { useState, useEffect, useCallback } from 'react';
import { useHeaderAdd } from '../layout/headerAdd';
import { useLocation, useNavigationType } from 'react-router-dom';
import { getRoomIcon } from '../icons/RoomIcons';
import { TaskIcon } from '../icons/TaskIcons';
import { IconPicker } from '../shared/IconPicker';
import { PlusIcon, TrashIcon } from '../icons/UIIcons';
import UserAvatar from '../shared/UserAvatar';
import { getHealthColor, getRoomHealth } from '../../utils/health';
import { ROOM_COLORS } from '../../utils/colors';
import { api } from '../../hooks/useApi';
import { useTranslation } from '../../hooks/useTranslation';
import { useTaskView } from '../../hooks/useTaskView';
import { isTaskForUser, taskNextDue } from '../../utils/tasks';
import { dateStr, startOfDay } from '../../utils/clock';

const ROOM_TYPES = [
  { type: 'kitchen' },
  { type: 'bedroom' },
  { type: 'bathroom' },
  { type: 'living' },
  { type: 'office' },
  { type: 'garage' },
  { type: 'laundry' },
  { type: 'other' },
];

const FREQ_UNITS = [
  { label: 'hours', toDays: 1 / 24 },
  { label: 'days', toDays: 1 },
  { label: 'weeks', toDays: 7 },
  { label: 'months', toDays: 30 },
  { label: 'years', toDays: 365 },
];

function daysToFreq(days: number): { value: number; unit: string } {
  if (days >= 365 && days % 365 === 0) return { value: days / 365, unit: 'years' };
  if (days >= 30 && days % 30 === 0) return { value: days / 30, unit: 'months' };
  if (days >= 7 && days % 7 === 0) return { value: days / 7, unit: 'weeks' };
  if (days >= 1) return { value: days, unit: 'days' };
  return { value: Math.round(days * 24), unit: 'hours' };
}

function freqToDays(value: number, unit: string): number {
  const u = FREQ_UNITS.find(f => f.label === unit);
  return value * (u?.toDays || 1);
}

interface TaskConfig {
  name: string;
  translationKey?: string;
  iconKey?: string;
  freqValue: number;
  freqUnit: string;
  effort: number;
  isSeasonal: boolean;
  selected: boolean;
  initialHealth: number;
  assignedUserId?: string;
}

interface AssignedUser {
  id: number;
  displayName: string;
  avatarColor: string;
  avatarType?: string;
  avatarPreset?: string;
  avatarPhotoUrl?: string;
}

type RoomTask = {
  id: number; name: string; translationKey?: string; iconKey?: string; health: number; onDemand?: boolean | number;
  allowEarlyCompletion?: boolean | number; lastCompletedAt?: string | null; effectiveAssignedUserIds?: number[];
  assignedToChildren?: boolean; frequencyDays?: number; nextDueAt?: string | null; pausedAt?: string | null;
  outOfSeason?: boolean; oneTime?: boolean | number; doBy?: string | null;
};

interface RoomsListProps {
  rooms: Array<{
    id: number;
    name: string;
    roomType: string;
    color: string;
    accentColor: string;
    health: number;
    zoneId?: number | null;
    assignedUserId?: number | null;
    assignedUser?: AssignedUser | null;
    tasks: RoomTask[];
    /** The family's To-dos room (ENH-18): a to-do count instead of health */
    isTodoRoom?: boolean;
    todoCount?: number;
    todoOverdue?: number;
  }>;
  language?: string;
  isAdmin: boolean;
  users?: Array<{ id: number; displayName: string; role: string; avatarColor: string; avatarType?: string; avatarPreset?: string; avatarPhotoUrl?: string }>;
  onSelectRoom: (roomId: number) => void;
  onCreateRoom: (data: { name: string; roomType: string; color: string; accentColor: string; tasks: any[]; assignedUserId?: number | null }) => Promise<void>;
  onDeleteRoom: (roomId: number) => Promise<void>;
  onAssignRoom?: (roomId: number, assignedUserId: number | null, force?: boolean) => Promise<void>;
  onRenameRoom?: (roomId: number, name: string) => Promise<void>;
  /** Reload the rooms after a change made here (e.g. moving a room to another zone) */
  onRoomsChanged?: () => Promise<void> | void;
  /** The person looking: drives the All / Mine switch */
  viewer?: { id: number; role?: string; taskView?: 'all' | 'mine' | 'mineOnly'; kidMode?: number | boolean };
}

type RoomItem = RoomsListProps['rooms'][number];
type Zone = { id: number; name: string; sortOrder: number; roomCount: number };
// Where the page was when a room was opened from it, so coming back lands there again (FIX-28), and the zones from
// the last visit, so the page has its final layout as soon as it comes back.
let returnSpot: { roomId: number; y: number } | null = null;
let zonesCache: Zone[] | null = null;
let lastZone: number | null = null;
const rememberZone = (z: number | null) => { lastZone = z; };
const rememberSpot = (roomId: number) => { returnSpot = { roomId, y: window.scrollY }; };
const cacheZones = (z: Zone[]) => { zonesCache = z; return z; };

export function RoomsList({ rooms, language, isAdmin, users, onSelectRoom, onCreateRoom, onDeleteRoom, onAssignRoom, onRenameRoom, onRoomsChanged, viewer }: RoomsListProps) {
  const { taskName, t, roomName: translateRoomName, roomDisplayName } = useTranslation(language);
  const [showModal, setShowModal] = useState(false);
  // On a phone "Add room" is the top bar's + (ENH-24); the button below is for wider screens
  const openAddRoom = useCallback(() => setShowModal(true), []);
  useHeaderAdd(isAdmin ? openAddRoom : null);
  const [step, setStep] = useState<1 | 2>(1);
  const [createAssignedUserId, setCreateAssignedUserId] = useState<string>('none');
  const [assigningRoomId, setAssigningRoomId] = useState<number | null>(null);
  const [assignDropdownValue, setAssignDropdownValue] = useState<string>('none');
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignConflict, setAssignConflict] = useState<{ taskNames: string[] } | null>(null);
  const [selectedType, setSelectedType] = useState('kitchen');
  const [roomName, setRoomName] = useState('');
  const [taskConfigs, setTaskConfigs] = useState<TaskConfig[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [renamingRoom, setRenamingRoom] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [zones, setZones] = useState<Zone[]>(() => zonesCache ?? []);
  const [zonesReady, setZonesReady] = useState(zonesCache !== null);
  const [creatingZone, setCreatingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [renamingZone, setRenamingZone] = useState<number | null>(null);
  const [renameZoneValue, setRenameZoneValue] = useState('');
  const [zoneMenuRoomId, setZoneMenuRoomId] = useState<number | null>(null);
  // Edit rooms (admin): shows the zones and each tile's rename, zone, assign and delete buttons
  const [editing, setEditing] = useState(false);
  // The zone chip picked (null: all rooms); kept for the visit like the scroll spot
  const [zoneFilter, setZoneFilterState] = useState<number | null>(() => lastZone);
  const setZoneFilter = (z: number | null) => { rememberZone(z); setZoneFilterState(z); };

  useEffect(() => {
    api.getZones().then((z) => { setZones(cacheZones(z)); setZonesReady(true); }).catch(() => setZonesReady(true));
  }, []);

  const refreshZones = () => api.getZones().then((z) => setZones(cacheZones(z))).catch(() => {});

  // Coming back from a room (its Back to Rooms button, or the phone's back button): scroll to where the page was
  // when that room was opened, and make sure its card is on screen. App skips its scroll to the top for these.
  const location = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (!zonesReady) return;
    const fromRoom = (location.state as { fromRoom?: number } | null)?.fromRoom ?? (navType === 'POP' ? returnSpot?.roomId : undefined);
    if (fromRoom === undefined) {
      if (navType === 'POP') window.scrollTo(0, 0);
      return;
    }
    window.scrollTo(0, returnSpot?.roomId === fromRoom ? returnSpot.y : 0);
    const card = document.querySelector(`[data-room-id="${fromRoom}"]`);
    const box = card?.getBoundingClientRect();
    if (card && box && (box.top < 0 || box.bottom > window.innerHeight)) card.scrollIntoView({ block: 'center' });
  }, [zonesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mine: rooms the viewer owns or has at least one task in
  const { filter: roomFilter, setFilter: setRoomFilter, locked: roomFilterLocked } = useTaskView(viewer, 'tq-rooms-filter');
  const isMyRoom = (room: RoomsListProps['rooms'][number]) => !viewer || room.assignedUserId === viewer.id
    || room.tasks.some((task) => isTaskForUser(task, viewer.id, viewer.role));
  // Kids and members locked to Mine: tiles count only their own chores
  const onlyMine = !!viewer && (viewer.taskView === 'mineOnly' || !!viewer.kidMode);
  // Most urgent first; the To-dos room (no health) last
  const sortedRooms = [...rooms].filter((room) => roomFilter === 'all' || isMyRoom(room)).sort(
    (a, b) => Number(!!a.isTodoRoom) - Number(!!b.isTodoRoom) || getRoomHealth(a.tasks as any) - getRoomHealth(b.tasks as any)
  );
  const todoLine = (room: { todoCount?: number; todoOverdue?: number }) => [
    t('todos.countLine').replace('{n}', String(room.todoCount ?? 0)),
    room.todoOverdue ? t('todos.overdueCount').replace('{n}', String(room.todoOverdue)) : '',
  ].filter(Boolean).join(' · ');

  // Step 2's suggested chores (the button that opens step 2 turns loadingTasks on)
  useEffect(() => {
    if (step === 2) {
      api.getDefaultTasks(selectedType).then((defaults) => {
        setTaskConfigs(defaults.map((t) => {
          const { value, unit } = daysToFreq(t.frequencyDays);
          return {
            name: t.name,
            translationKey: (t as any).translationKey,
            iconKey: (t as any).iconKey || 'sparkle',
            freqValue: value,
            freqUnit: unit,
            effort: t.effort,
            isSeasonal: !!t.isSeasonal,
            selected: false,
            initialHealth: 0,
          };
        }));
        setLoadingTasks(false);
      }).catch(() => {
        setTaskConfigs([]);
        setLoadingTasks(false);
      });
    }
  }, [step, selectedType]);

  const handleCreate = async () => {
    setCreateError(null);
    setCreatingRoom(true);
    const name = roomName.trim() || translateRoomName(selectedType) || t('rooms.room');
    const colors = ROOM_COLORS[selectedType] || ROOM_COLORS.other;
    const selectedTasks = taskConfigs.filter(t => t.selected).map(t => ({
      name: t.name,
      translationKey: t.translationKey,
      iconKey: t.iconKey || 'sparkle',
      frequencyDays: freqToDays(t.freqValue, t.freqUnit),
      effort: t.effort,
      isSeasonal: t.isSeasonal,
      initialHealth: t.initialHealth,
      assignedUserId: t.assignedUserId && t.assignedUserId !== 'none' ? parseInt(t.assignedUserId) : null,
    }));
    const assignedUserId = createAssignedUserId === 'none' ? null : parseInt(createAssignedUserId);
    try {
      await onCreateRoom({ name, roomType: selectedType, color: colors.bg, accentColor: colors.accent, tasks: selectedTasks, assignedUserId });
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error && err.message ? err.message : t('common.error');
      setCreateError(msg);
    } finally {
      setCreatingRoom(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setStep(1);
    setRoomName('');
    setSelectedType('kitchen');
    setTaskConfigs([]);
    setNewTaskName('');
    setCreateAssignedUserId('none');
    setCreateError(null);
    setCreatingRoom(false);
  };

  const updateTask = (idx: number, updates: Partial<TaskConfig>) => {
    setTaskConfigs(prev => prev.map((t, i) => i === idx ? { ...t, ...updates } : t));
  };

  const addCustomTask = () => {
    if (!newTaskName.trim()) return;
    setTaskConfigs(prev => [...prev, {
      name: newTaskName.trim(),
      translationKey: undefined,
      iconKey: 'sparkle',
      freqValue: 1,
      freqUnit: 'weeks',
      effort: 2,
      isSeasonal: false,
      selected: true,
      initialHealth: 0,
    }]);
    setNewTaskName('');
  };

  const removeTask = (idx: number) => {
    setTaskConfigs(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDeleteRoom = async (roomId: number, roomName: string, choreCount: number) => {
    const key = choreCount === 0 ? 'rooms.deleteRoomConfirmEmpty' : choreCount === 1 ? 'rooms.deleteRoomConfirmOne' : 'rooms.deleteRoomConfirmMany';
    const shouldDelete = window.confirm(t(key).replace('{room}', roomName).replace('{n}', String(choreCount)));
    if (!shouldDelete) return;
    await onDeleteRoom(roomId);
  };

  const assignableUsers = users || [];

  const openAssignModal = (e: React.MouseEvent, room: any) => {
    e.stopPropagation();
    setAssigningRoomId(room.id);
    setAssignDropdownValue(room.assignedUserId ? String(room.assignedUserId) : 'none');
    setAssignError(null);
    setAssignConflict(null);
  };

  const doAssign = async (force = false) => {
    if (!assigningRoomId || !onAssignRoom) return;
    setAssignSaving(true);
    setAssignError(null);
    const userId = assignDropdownValue === 'none' ? null : parseInt(assignDropdownValue);
    try {
      await onAssignRoom(assigningRoomId, userId, force);
      setAssignSaving(false);
      setAssignConflict(null);
      setAssigningRoomId(null);
    } catch (err: any) {
      setAssignSaving(false);
      if (err?.body?.error === 'tasks_have_conflicting_assignments') {
        setAssignConflict({ taskNames: err.body.conflictingTaskNames || [] });
      } else {
        setAssignError(err?.message || 'Error');
      }
    }
  };

  const saveAssignment = () => doAssign(false);

  // A chore counts as due when it's late or due before the end of today (paused, on-demand and out-of-season ones never)
  const endToday = startOfDay(new Date(), 1).getTime();
  const today = dateStr();
  const isDue = (tk: RoomTask) => {
    if (tk.pausedAt || tk.onDemand || tk.outOfSeason) return false;
    if (tk.oneTime) return tk.doBy ? tk.doBy <= today : tk.health <= 0;
    return taskNextDue({ lastCompletedAt: tk.lastCompletedAt ?? null, frequencyDays: tk.frequencyDays ?? 1, nextDueAt: tk.nextDueAt }).getTime() < endToday;
  };
  // The chores a tile counts: the viewer's own when they only see theirs (kids)
  const tileTasks = (room: RoomItem) => onlyMine && viewer ? room.tasks.filter((tk) => isTaskForUser(tk, viewer.id, viewer.role)) : room.tasks;
  const tileLine = (room: RoomItem) => {
    if (room.isTodoRoom) return todoLine(room);
    const list = tileTasks(room);
    if (list.length === 0) return t('rooms.noChores');
    const due = list.filter(isDue).length;
    return `${list.length === 1 ? t('rooms.choreOne') : t('rooms.choreMany').replace('{n}', String(list.length))} · ${due ? t('rooms.dueCount').replace('{n}', String(due)) : t('rooms.allDone')}`;
  };
  // The chips: All rooms, Mine (unless the person only ever sees theirs) and one per zone that has rooms
  const knownZone = (room: RoomItem) => !!room.zoneId && zones.some((z) => z.id === room.zoneId);
  const zoneChips = zones.filter((z) => rooms.some((r) => r.zoneId === z.id));
  const activeZone = zoneFilter !== null && zoneChips.some((z) => z.id === zoneFilter) ? zoneFilter : null;
  const shownRooms = activeZone === null ? sortedRooms : sortedRooms.filter((r) => r.zoneId === activeZone);
  const pickChip = (zone: number | null, mine: boolean) => { setZoneFilter(zone); if (!roomFilterLocked) setRoomFilter(mine ? 'mine' : 'all'); };
  const chip = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button key={key} type="button" className={`today-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>{label}</button>
  );
  const mineOn = roomFilter === 'mine' && !roomFilterLocked;
  const editBtn = (label: string, onClick: (e: React.MouseEvent) => void, icon: React.ReactNode, extra = '') => (
    <button type="button" className={`rooms-tile-act${extra}`} onClick={(e) => { e.stopPropagation(); onClick(e); }} title={label} aria-label={label}>{icon}</button>
  );
  const saveRename = async (roomId: number) => {
    if (renameValue.trim()) { if (onRenameRoom) await onRenameRoom(roomId, renameValue.trim()); else await api.updateRoom(roomId, { name: renameValue.trim() }); }
    setRenamingRoom(null);
  };

  const renderRoom = (room: RoomItem) => {
    const rh = room.health;
    const RoomIcon = getRoomIcon(room.roomType);
    const name = roomDisplayName(room.name, room.roomType);
    const open = () => { if (renamingRoom === room.id) return; rememberSpot(room.id); onSelectRoom(room.id); };
    return (
      <div key={room.id} data-room-id={room.id} className="rooms-tile" role="link" tabIndex={0} aria-label={name}
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); }}>
        <div className="rooms-tile-top">
          <span className="rooms-tile-icon" style={{ backgroundColor: room.color }}>
            <RoomIcon />
            {room.assignedUser && (
              <span className="rooms-tile-who" title={t('rooms.assignedTo').replace('{name}', room.assignedUser.displayName)}>
                <UserAvatar name={room.assignedUser.displayName} color={room.assignedUser.avatarColor} size={20} avatarType={room.assignedUser.avatarType as any} avatarPreset={room.assignedUser.avatarPreset} avatarPhotoUrl={room.assignedUser.avatarPhotoUrl} />
              </span>
            )}
          </span>
          {room.isTodoRoom
            ? <span className="rooms-tile-pct" aria-hidden="true">📝</span>
            : <span className="rooms-tile-pct" style={{ color: getHealthColor(rh) }}>{rh}%</span>}
        </div>
        {renamingRoom === room.id ? (
          <div className="rooms-tile-rename" onClick={(e) => e.stopPropagation()}>
            <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} aria-label={t('rooms.renameRoom')}
              onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(room.id); else if (e.key === 'Escape') setRenamingRoom(null); }}
              autoFocus className="tq-input" />
            <button type="button" onClick={() => void saveRename(room.id)} title={t('common.save')} aria-label={t('common.save')}>✓</button>
            <button type="button" onClick={() => setRenamingRoom(null)} title={t('common.cancel')} aria-label={t('common.cancel')}>✕</button>
          </div>
        ) : <div className="rooms-tile-name">{name}</div>}
        <div className={`rooms-tile-sub${room.isTodoRoom && room.todoOverdue ? ' late' : ''}`}>{tileLine(room)}</div>
        {!room.isTodoRoom && <div className="rooms-tile-bar"><span style={{ width: `${Math.max(0, Math.min(100, rh))}%`, backgroundColor: getHealthColor(rh) }} /></div>}
        {editing && isAdmin && (
          <div className="rooms-tile-acts">
            {editBtn(t('rooms.renameRoom'), () => { setRenamingRoom(room.id); setRenameValue(name); }, '✏️')}
            {zones.length > 0 && (
              <span className="rooms-tile-zone">
                {editBtn(t('rooms.assignToZone'), () => setZoneMenuRoomId(zoneMenuRoomId === room.id ? null : room.id), '🏷️', room.zoneId ? ' on' : '')}
                {zoneMenuRoomId === room.id && (
                  <div className="rooms-zone-menu" onClick={(e) => e.stopPropagation()}>
                    {room.zoneId && (
                      <button type="button" onClick={async () => { await api.updateRoom(room.id, { zoneId: null }); setZoneMenuRoomId(null); await onRoomsChanged?.(); }}>{t('rooms.removeFromZone')}</button>
                    )}
                    {zones.map((z) => (
                      <button type="button" key={z.id} className={room.zoneId === z.id ? 'on' : ''}
                        onClick={async () => { await api.updateRoom(room.id, { zoneId: z.id }); setZoneMenuRoomId(null); await onRoomsChanged?.(); }}>🏷️ {z.name}</button>
                    ))}
                  </div>
                )}
              </span>
            )}
            {onAssignRoom && editBtn(t('rooms.assignRoom'), (e) => openAssignModal(e, room), (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/><path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            ))}
            {editBtn(`${t('common.delete')} ${name}`, () => void handleDeleteRoom(room.id, name, room.tasks.length), <TrashIcon />, ' danger')}
          </div>
        )}
      </div>
    );
  };

  // Zone sections when showing every room and the family uses zones; one grid otherwise
  const sections = activeZone === null && zones.length > 0
    ? [...zones.map((z) => ({ id: z.id as number | null, label: z.name })), { id: null, label: t('rooms.noZone') }]
      .map((s) => ({ ...s, rooms: shownRooms.filter((r) => (s.id === null ? !knownZone(r) : r.zoneId === s.id)) }))
      .filter((s) => s.rooms.length > 0)
    : [{ id: activeZone, label: '', rooms: shownRooms }];

  // Edit rooms (admin): a link on the first section's heading
  const editToggle = isAdmin && (
    <button type="button" className={`today-link${editing ? '' : ' quiet'}`} aria-pressed={editing}
      onClick={() => { setEditing((v) => !v); setZoneMenuRoomId(null); setRenamingRoom(null); }}>
      {editing ? `✓ ${t('rooms.doneEditing')}` : `✏️ ${t('rooms.editRooms')}`}
    </button>
  );

  return (
    <>
      <div className="rooms-tools">
        {(zoneChips.length > 0 || !roomFilterLocked) && viewer && (
          <div className="today-chips rooms-chips" role="group" aria-label={t('rooms.zoneChips')}>
            {chip('all', t('rooms.allRooms'), activeZone === null && !mineOn, () => pickChip(null, false))}
            {!roomFilterLocked && chip('mine', t('rooms.mineChip'), activeZone === null && mineOn, () => pickChip(null, true))}
            {zoneChips.map((z) => chip(`z${z.id}`, z.name, activeZone === z.id, () => pickChip(z.id, false)))}
          </div>
        )}
        {isAdmin && <button type="button" className="tq-btn tq-btn-primary tq-btn-sm ph-desktop rooms-add" onClick={() => setShowModal(true)}>+ {t('rooms.addRoom')}</button>}
      </div>

      {/* Zone management (admin, in Edit rooms) */}
      {isAdmin && editing && (
        <div className="rooms-zones">
          <span className="rooms-zones-label">{t('rooms.zones')}</span>
          {zones.map(zone => (
            <span key={zone.id} className="rooms-zone">
              {renamingZone === zone.id ? (
                <>
                  <input
                    value={renameZoneValue}
                    onChange={e => setRenameZoneValue(e.target.value)}
                    aria-label={t('rooms.zoneName')}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && renameZoneValue.trim()) {
                        await api.updateZone(zone.id, { name: renameZoneValue.trim() });
                        await refreshZones();
                        setRenamingZone(null);
                      } else if (e.key === 'Escape') setRenamingZone(null);
                    }}
                    autoFocus
                  />
                  <button type="button" onClick={async () => { if (renameZoneValue.trim()) { await api.updateZone(zone.id, { name: renameZoneValue.trim() }); await refreshZones(); } setRenamingZone(null); }} aria-label={t('common.save')}>✓</button>
                  <button type="button" onClick={() => setRenamingZone(null)} aria-label={t('common.cancel')}>✕</button>
                </>
              ) : (
                <>
                  <button type="button" className="rooms-zone-name" onClick={() => { setRenamingZone(zone.id); setRenameZoneValue(zone.name); }}>🏷️ {zone.name}</button>
                  <button type="button" onClick={async () => { if (confirm(`${t('rooms.deleteZone')} "${zone.name}"?`)) { await api.deleteZone(zone.id); await refreshZones(); } }} title={t('rooms.deleteZone')} aria-label={`${t('rooms.deleteZone')} ${zone.name}`}>✕</button>
                </>
              )}
            </span>
          ))}
          {creatingZone ? (
            <span className="rooms-zone new">
              <input
                value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)}
                placeholder={t('rooms.zoneName')}
                aria-label={t('rooms.zoneName')}
                autoFocus
                onKeyDown={async e => {
                  if (e.key === 'Enter' && newZoneName.trim()) {
                    await api.createZone(newZoneName.trim());
                    await refreshZones();
                    setNewZoneName('');
                    setCreatingZone(false);
                  } else if (e.key === 'Escape') { setCreatingZone(false); setNewZoneName(''); }
                }}
              />
              <button type="button" onClick={async () => { if (newZoneName.trim()) { await api.createZone(newZoneName.trim()); await refreshZones(); setNewZoneName(''); setCreatingZone(false); } }} aria-label={t('common.save')}>✓</button>
              <button type="button" onClick={() => { setCreatingZone(false); setNewZoneName(''); }} aria-label={t('common.cancel')}>✕</button>
            </span>
          ) : (
            <button type="button" className="rooms-zone add" onClick={() => setCreatingZone(true)}>+ {t('rooms.createZone')}</button>
          )}
        </div>
      )}

      <div className="page-enter rooms-page">
        {sections.map((section, i) => (
          <section key={section.id ?? 'all'} className="rooms-section">
            {(section.label || i === 0) && (
              <div className="rooms-sec">
                <span className="rooms-sec-title">
                  {section.label && <h3>{section.label}</h3>}
                  {i === 0 && shownRooms.length > 1 && <span className="rooms-sec-note">{t('rooms.neediestFirst')}</span>}
                </span>
                {i === 0 && editToggle}
              </div>
            )}
            <div className="rooms-grid">{section.rooms.map(renderRoom)}</div>
          </section>
        ))}
        {sections.length === 0 && editToggle}
        {rooms.length === 0 && (
          <div className="tq-empty-state">
            <div className="tq-empty-state-title">{t('rooms.noRoomsYet')}</div>
            <div>{t('rooms.clickAddRoom')}</div>
          </div>
        )}
      </div>
      {/* Assign Room Modal */}
      {assigningRoomId && (
        <div className="tq-modal-overlay" onClick={() => setAssigningRoomId(null)}>
          <div className="tq-card tq-modal tq-modal-narrow tq-card-padded" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 900, color: 'var(--warm-text)' }}>{t('rooms.assignRoom')}</h3>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)', display: 'block', marginBottom: 6 }}>
              {t('rooms.assignRoom')}
            </label>
            <select
              value={assignDropdownValue}
              onChange={(e) => { setAssignDropdownValue(e.target.value); setAssignError(null); }}
              className="tq-input" style={{ cursor: 'pointer', marginBottom: assignError ? 10 : 20 }}
            >
              <option value="none">{t('rooms.noAssignment')}</option>
              {assignableUsers.map(u => (
                <option key={u.id} value={String(u.id)}>{u.displayName}</option>
              ))}
            </select>
            {assignError && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 10,
                backgroundColor: 'var(--task-critical-bg)', border: '1.5px solid var(--task-critical-border)',
                fontSize: 12, fontWeight: 600, color: 'var(--task-critical-text)', lineHeight: 1.5,
              }}>
                {assignError}
              </div>
            )}
            {assignConflict && (
              <div style={{
                marginBottom: 16, padding: '12px 14px', borderRadius: 10,
                backgroundColor: 'var(--task-warning-bg)', border: '1.5px solid var(--task-warning-border)',
                fontSize: 12, fontWeight: 600, color: 'var(--task-warning-text)', lineHeight: 1.6,
              }}>
                {t('rooms.assignConflictError').replace('{tasks}', assignConflict.taskNames.join(', '))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="tq-btn tq-btn-secondary tq-btn-md" onClick={() => { setAssigningRoomId(null); setAssignError(null); setAssignConflict(null); }}
                >{t('common.cancel')}</button>
              {assignConflict ? (
                <button className="tq-btn tq-btn-primary tq-btn-md" onClick={() => doAssign(true)} disabled={assignSaving}
                  >{t('rooms.assignConflictConfirm')}</button>
              ) : (
                <button className="tq-btn tq-btn-primary tq-btn-md" onClick={saveAssignment} disabled={assignSaving}
                  >{t('common.save')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Room Modal */}
      {showModal && (
        <div className="tq-modal-overlay" onClick={() => { if (!creatingRoom) closeModal(); }}>
          <div className={`tq-card tq-modal ${step === 2 ? 'tq-modal-wide' : ''}`}
            onClick={(e) => e.stopPropagation()}>
            <div className="tq-modal-inner">

            {step === 1 ? (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--warm-text)', margin: '0 0 6px' }}>{t('rooms.addRoomTitle')}</h2>
                <p style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 20 }}>
                  {t('rooms.pickRoomType')}
                </p>

                <div className="room-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                  {ROOM_TYPES.map((rt) => {
                    const colors = ROOM_COLORS[rt.type] || ROOM_COLORS.other;
                    const Icon = getRoomIcon(rt.type);
                    const isSelected = selectedType === rt.type;
                    return (
                      <div key={rt.type}
                        onClick={() => setSelectedType(rt.type)}
                        style={{
                          padding: '14px 8px', borderRadius: 'var(--shape-radius-card)', textAlign: 'center', cursor: 'pointer',
                          backgroundColor: isSelected ? colors.bg : 'var(--warm-bg-subtle)',
                          border: isSelected ? `2px solid ${colors.accent}` : 'var(--shape-border-w) solid var(--warm-border)',
                          transition: 'all 0.15s ease',
                        }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12, margin: '0 auto 8px',
                          backgroundColor: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><Icon /></div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? colors.accent : 'var(--warm-text-muted)' }}>
                          {translateRoomName(rt.type)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)', display: 'block', marginBottom: 6 }}>
                    {t('rooms.customNameOptional')}
                  </label>
                  <input value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    placeholder={translateRoomName(selectedType)}
                    className="tq-input" style={{ backgroundColor: 'var(--warm-bg-subtle)' }} />
                </div>

                {assignableUsers.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-muted)', display: 'block', marginBottom: 6 }}>
                      {t('rooms.assignRoom')}
                    </label>
                    <select
                      value={createAssignedUserId}
                      onChange={(e) => setCreateAssignedUserId(e.target.value)}
                      className="tq-input" style={{ backgroundColor: 'var(--warm-bg-subtle)', cursor: 'pointer' }}
                    >
                      <option value="none">{t('rooms.noAssignment')}</option>
                      {assignableUsers.map(u => (
                        <option key={u.id} value={String(u.id)}>{u.displayName}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="tq-btn tq-btn-secondary tq-btn-md" onClick={closeModal} disabled={creatingRoom}
                    >{t('common.cancel')}</button>
                  <button className="tq-btn tq-btn-primary tq-btn-md" onClick={() => { setLoadingTasks(true); setStep(2); }} disabled={creatingRoom}
                    >{t('rooms.nextConfigure')}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                  <button onClick={() => setStep(1)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: 'var(--warm-text-light)', fontSize: 18, fontWeight: 700,
                  }}>&#8592;</button>
                  <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>{t('rooms.configureTasks')}</h2>
                </div>
                <p style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, marginBottom: 16 }}>
                  {t('rooms.configureTasksDesc')}
                </p>

                {loadingTasks ? (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--warm-text-light)', fontWeight: 600 }}>{t('common.loading')}...</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {taskConfigs.map((task, idx) => {
                      const healthColor = task.initialHealth >= 70 ? '#22C55E' : task.initialHealth >= 40 ? '#F59E0B' : '#EF4444';
                      return (
                        <div key={idx} style={{
                          padding: '14px 16px', borderRadius: 14,
                          backgroundColor: task.selected ? 'var(--warm-bg-subtle)' : 'var(--warm-bg-warm)',
                          border: task.selected ? 'var(--shape-border-w) solid var(--warm-border)' : 'var(--shape-border-w) solid var(--warm-border-subtle)',
                          opacity: task.selected ? 1 : 0.6,
                          transition: 'all 0.15s ease',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: task.selected ? 12 : 0 }}>
                            <input type="checkbox" checked={task.selected}
                              onChange={(e) => updateTask(idx, { selected: e.target.checked })}
                              style={{ width: 18, height: 18, accentColor: 'var(--warm-accent)', cursor: 'pointer' }} />
                            <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: 'var(--warm-text)', display: 'flex', alignItems: 'center', gap: 9 }}>
                              <span style={{
                                width: 32, height: 32, borderRadius: 10,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: 'var(--warm-bg-warm)', border: '1px solid var(--warm-border)',
                                flexShrink: 0,
                                marginLeft: -6,
                              }}>
                                <TaskIcon iconKey={task.iconKey} size={22} />
                              </span>
                              <span>{taskName(task.name, task.translationKey)}</span>
                            </div>
                            <button onClick={() => removeTask(idx)} style={{
                              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--warm-text-light)',
                              fontSize: 18, fontWeight: 700, padding: '0 4px', lineHeight: 1,
                            }}>&times;</button>
                          </div>

                          {task.selected && (<>
                            <div className="task-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, paddingLeft: 28 }}>
                              {/* Current State */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)', marginBottom: 6 }}>
                                  {t('rooms.currentState')}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <input type="range" min={0} max={100} step={10}
                                    value={task.initialHealth}
                                    onChange={(e) => updateTask(idx, { initialHealth: parseInt(e.target.value) })}
                                    style={{ flex: 1, accentColor: healthColor }} />
                                  <span style={{ fontSize: 12, fontWeight: 800, color: healthColor, minWidth: 36, textAlign: 'right' }}>
                                    {task.initialHealth}%
                                  </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, marginTop: 2 }}>
                                  <span>{t('rooms.dirty')}</span><span>{t('rooms.clean')}</span>
                                </div>
                              </div>

                              {/* Effort */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)', marginBottom: 6 }}>
                                  {t('roomDetail.effort')}
                                </div>
                                <div style={{ display: 'flex', gap: 2 }}>
                                  {[1, 2, 3, 4, 5].map((e) => (
                                    <button key={e} onClick={() => updateTask(idx, { effort: e })}
                                      style={{
                                        background: 'none', border: 'none', cursor: 'pointer', padding: 1,
                                        opacity: e <= task.effort ? 1 : 0.3,
                                        transform: e <= task.effort ? 'scale(1.1)' : 'scale(1)',
                                        transition: 'all 0.1s ease',
                                      }}>
                                      <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                                        <path d="M7 1L8.5 5H12.5L9.5 7.5L10.5 11.5L7 9L3.5 11.5L4.5 7.5L1.5 5H5.5L7 1Z"
                                          fill={e <= task.effort ? 'var(--warm-coin)' : 'none'}
                                          stroke={e <= task.effort ? 'var(--warm-coin)' : 'var(--warm-border)'}
                                          strokeWidth={e <= task.effort ? '0.5' : '1'} />
                                      </svg>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Frequency */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)', marginBottom: 6 }}>
                                  {t('roomDetail.frequency')}
                                </div>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <input type="number" min={1} max={999} value={task.freqValue}
                                    onChange={(e) => updateTask(idx, { freqValue: Math.max(1, parseInt(e.target.value) || 1) })}
                                    className="tq-input-compact" style={{ width: 48, textAlign: 'center' }} />
                                  <select value={task.freqUnit}
                                    onChange={(e) => updateTask(idx, { freqUnit: e.target.value })}
                                    className="tq-input-compact" style={{ cursor: 'pointer', fontSize: 12 }}>
                                    {FREQ_UNITS.map((f) => (
                                      <option key={f.label} value={f.label}>{t(`units.${f.label}`)}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Icon */}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)', marginBottom: 6 }}>
                                  {t('rooms.icon')}
                                </div>
                                <IconPicker value={task.iconKey || 'sparkle'} onChange={(k) => updateTask(idx, { iconKey: k })} language={language}
                                  taskName={taskName(task.name, task.translationKey)} compact />
                              </div>

                            </div>

                            {/* Assign — separate row below the grid */}
                            {assignableUsers.length > 0 && (
                              <div style={{ paddingLeft: 28, marginTop: 8 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-text-light)', marginBottom: 6 }}>
                                  {t('rooms.assignTask')}
                                </div>
                                <select
                                  value={task.assignedUserId || 'none'}
                                  onChange={(e) => updateTask(idx, { assignedUserId: e.target.value })}
                                  className="tq-input-compact" style={{ maxWidth: 200, cursor: 'pointer', fontSize: 12 }}
                                >
                                  <option value="none">—</option>
                                  {assignableUsers.map(u => (
                                    <option key={u.id} value={String(u.id)}>{u.displayName}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </>)}
                        </div>
                      );
                    })}

                    {/* Add Custom Task */}
                    <div style={{
                      padding: '10px 16px', borderRadius: 14, border: '1.5px dashed var(--warm-border)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <PlusIcon />
                      <input value={newTaskName}
                        onChange={(e) => setNewTaskName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomTask()}
                        placeholder={t('rooms.addCustomTask')}
                        style={{
                          flex: 1, padding: '6px 0', border: 'none', outline: 'none',
                          fontSize: 13, fontFamily: 'Nunito', fontWeight: 600, color: 'var(--warm-text)',
                          backgroundColor: 'transparent',
                        }} />
                      <button onClick={addCustomTask} className="tq-btn tq-btn-secondary"
                        style={{ padding: '6px 14px', fontSize: 12 }}>{t('common.add')}</button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600 }}>
                      {taskConfigs.filter(t => t.selected).length} {t('rooms.tasksSelected')}
                    </div>
                    {createError && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warm-danger)' }}>{createError}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="tq-btn tq-btn-secondary tq-btn-md" onClick={closeModal} disabled={creatingRoom}
                      >{t('common.cancel')}</button>
                    <button className="tq-btn tq-btn-primary tq-btn-md" onClick={handleCreate}
                      disabled={creatingRoom || taskConfigs.filter(t => t.selected).length === 0}
                      >{creatingRoom ? `${t('common.loading')}...` : t('rooms.createRoom')}</button>
                  </div>
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RoomsList;
