import React from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What it switches, for screen readers */
  label?: string;
}

/** An on/off setting, drawn as a tick box (ENH-30: platform-neutral, not a sliding switch). */
const Toggle: React.FC<ToggleProps> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-label={label}
    className={`tq-tick${checked ? ' on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    {checked && (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </button>
);

export { Toggle };
export default Toggle;
