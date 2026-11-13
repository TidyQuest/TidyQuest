/** A joined row of buttons, one pressed (the page's filter style; ENH-30: square, not pills). */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="tq-joined" style={{ display: 'flex' }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} style={{ flex: 1 }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
