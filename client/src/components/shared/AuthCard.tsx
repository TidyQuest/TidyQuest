import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { SparkleIcon } from '../icons/UIIcons';

/** The centered card of the pages shown before sign-in (sign-up, password reset, confirming an email). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--warm-bg)', padding: '24px 0',
    }}>
      <div className="tq-card auth-card" style={{ padding: 40, width: 400, maxWidth: 'calc(100vw - 24px)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 'var(--shape-radius-card)', margin: '0 auto 14px',
            background: 'var(--warm-streak-bg)', border: '1.5px solid var(--warm-streak-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SparkleIcon />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--warm-text)', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 12, color: 'var(--warm-text-light)', fontWeight: 600, margin: '6px 0 0' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** A labelled field on those pages. The label sits beside the box (linked by id), not around it: a box
 *  inside its <label> confused a password manager on a phone into closing the keyboard (BUG-17). */
export function AuthField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const field = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
      id, ...(hint ? { 'aria-describedby': hintId } : {}),
    })
    : children;
  return (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} className="tq-label" style={{ textTransform: 'none', display: 'block' }}>{label}</label>
      {field}
      {hint && <span id={hintId} style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--warm-text-light)', marginTop: 4 }}>{hint}</span>}
    </div>
  );
}
