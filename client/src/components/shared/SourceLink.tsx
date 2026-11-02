import { useTranslation } from '../../hooks/useTranslation';
import { useSourceUrl } from '../../utils/hosted';

/** "TidyQuest v0.15.1 · Source code" under the login and sign-up forms (NEW-20, the AGPL's source offer). */
export function SourceFooter({ language }: { language: string }) {
  const { t } = useTranslation(language);
  const url = useSourceUrl();
  return (
    <div style={{ textAlign: 'center', marginTop: 22, fontSize: 11, fontWeight: 600, color: 'var(--warm-text-light)' }}>
      TidyQuest v{__APP_VERSION__} ·{' '}
      {url
        ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{t('about.sourceCode')}</a>
        : t('about.sourceCode')}
    </div>
  );
}
