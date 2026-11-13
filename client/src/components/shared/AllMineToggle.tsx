import type { TaskFilter } from '../../hooks/useTaskView';

/** The All / Mine joined buttons (hidden entirely when the person's view is locked to Mine). */
export function AllMineToggle({ value, onChange, allLabel, mineLabel }: { value: TaskFilter; onChange: (f: TaskFilter) => void; allLabel: string; mineLabel: string }) {
  return (
    <div className="tq-joined" role="group" style={{ flexShrink: 0 }}>
      {(['all', 'mine'] as const).map((f) => (
        <button key={f} type="button" onClick={() => onChange(f)} aria-pressed={value === f}>
          {f === 'all' ? allLabel : mineLabel}
        </button>
      ))}
    </div>
  );
}
