import { Fragment } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

// The terms of service and privacy policy (hosted mode, NEW-34): on the login and sign-up pages, in Settings,
// and when adding a family member. Self-hosted installs have neither.

export interface Legal { termsUrl: string | null; privacyUrl: string | null }

const linkStyle: React.CSSProperties = { color: 'var(--warm-accent)', fontWeight: 700 };

/** A sentence like "I agree to the {terms} and the {privacy}." with the links in place. */
export function WithLinks({ text, links }: { text: string; links: Record<string, { href: string | null; label: string }> }) {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const link = links[part.slice(1, -1)];
    if (!link) return part;
    return link.href
      ? <a key={i} href={link.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{link.label}</a>
      : <Fragment key={i}>{link.label}</Fragment>;
  });
}

/** "Privacy policy · Terms", whichever the server has. Nothing when it has neither. */
export function LegalLinks({ legal, language, style }: { legal: Legal | null; language?: string; style?: React.CSSProperties }) {
  const { t } = useTranslation(language);
  const links = [
    legal?.privacyUrl && { href: legal.privacyUrl, label: t('hosted.privacy') },
    legal?.termsUrl && { href: legal.termsUrl, label: t('hosted.terms') },
  ].filter((l): l is { href: string; label: string } => !!l);
  if (!links.length) return null;
  return (
    <span style={style}>
      {links.map((l, i) => (
        <Fragment key={l.href}>
          {i > 0 && ' · '}
          <a href={l.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{l.label}</a>
        </Fragment>
      ))}
    </span>
  );
}
