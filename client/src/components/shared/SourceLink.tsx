import { useTranslation } from '../../hooks/useTranslation';
import { useLegalLinks, useSourceUrl } from '../../utils/hosted';
import { LegalLinks } from './LegalLinks';

/**
 * "TidyQuest v0.15.1 · Source code" under the login and sign-up forms (NEW-20, the AGPL's source offer),
 * and in hosted mode "Privacy policy · Terms" under it (NEW-34).
 */
export function SourceFooter({ language }: { language: string }) {
  const { t } = useTranslation(language);
  const url = useSourceUrl();
  const legal = useLegalLinks();
  return (
    <div style={{ textAlign: 'center', marginTop: 22, fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)', display: 'grid', gap: 4 }}>
      <span>
        TidyQuest v{__APP_VERSION__} ·{' '}
        {url
          ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{t('about.sourceCode')}</a>
          : t('about.sourceCode')}
      </span>
      <LegalLinks legal={legal} language={language} />
    </div>
  );
}
