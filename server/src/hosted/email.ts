import type { Request } from 'express';
import { createTransport } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { tr } from '../utils/i18n';

// Emails in hosted mode: confirming an address, resetting a password, changing the sign-in email, a trial
// about to be deleted. With SMTP_HOST set they go out through that mail server (any SMTP: the domain's own
// mailbox host, or Postmark, SES or Resend); without it they go to the server log, links and all, which is
// fine for testing only.
export interface Email {
  to: string;
  subject: string;
  text: string;
}

export type EmailTransport = (email: Email) => Promise<void> | void;

const logTransport: EmailTransport = ({ to, subject, text }) => {
  console.log(`[email] to ${to}: ${subject}\n${text}`);
};

let transport: EmailTransport = logTransport;
/** Tests: capture emails instead of logging them (call with no argument to restore). */
export function setEmailTransport(t?: EmailTransport) { transport = t ?? logTransport; }

/** A send, or the login check at startup, gives up after this long, like notifications (NEW-11). */
const SMTP_TIMEOUT_MS = 10_000;

type Env = Record<string, string | undefined>;

export interface SmtpSettings {
  options: SMTPTransport.Options;
  from: string;
  replyTo?: string;
}

/**
 * The SMTP settings from the environment: SMTP_HOST, SMTP_PORT (465 by default), SMTP_USER, SMTP_PASS,
 * EMAIL_FROM (by default "TidyQuest" at SMTP_USER) and EMAIL_REPLY_TO. Null without SMTP_HOST; an error
 * when they can't work, so startup can say what's missing.
 */
export function smtpSettings(env: Env = process.env): SmtpSettings | { error: string } | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(env.SMTP_PORT?.trim() || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: `SMTP_PORT "${env.SMTP_PORT}" isn't a port number.` };
  const user = env.SMTP_USER?.trim() || undefined;
  const pass = env.SMTP_PASS ?? '';
  if (user && !pass) return { error: 'SMTP_USER is set but SMTP_PASS is empty.' };
  const from = env.EMAIL_FROM?.trim() || (user?.includes('@') ? `"TidyQuest" <${user}>` : '');
  if (!from) return { error: 'Set EMAIL_FROM (like TidyQuest <noreply@example.com>).' };
  const secure = port === 465; // 465 is TLS from the start; other ports upgrade with STARTTLS
  return {
    options: {
      host,
      port,
      secure,
      // Never send a password unencrypted: on other ports the server must offer STARTTLS
      requireTLS: !secure && !!user,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    },
    from,
    replyTo: env.EMAIL_REPLY_TO?.trim() || undefined,
  };
}

/** An EmailTransport that sends through an SMTP server. */
export function smtpTransport(settings: SmtpSettings): { send: EmailTransport; verify: () => Promise<unknown> } {
  const mailer = createTransport(settings.options);
  return {
    send: async ({ to, subject, text }) => {
      await mailer.sendMail({
        from: settings.from,
        replyTo: settings.replyTo,
        to,
        subject,
        text,
        // An automatic email: out-of-office replies shouldn't answer it (RFC 3834)
        headers: { 'Auto-Submitted': 'auto-generated' },
      });
    },
    verify: () => mailer.verify(),
  };
}

/**
 * At startup (hosted mode): send through SMTP when it's set up, and log whether the mail server accepts
 * the login. Emails go to the log if it isn't set up or the settings can't work.
 */
export function startEmail(env: Env = process.env): void {
  const settings = smtpSettings(env);
  if (!settings) {
    console.warn('[email] No SMTP_HOST: emails go to this log, links and all. Fine for testing, not for real families.');
    return;
  }
  if ('error' in settings) {
    console.error(`[email] Emails go to this log, not out: ${settings.error}`);
    return;
  }
  const smtp = smtpTransport(settings);
  transport = smtp.send;
  const where = `${settings.options.host}:${settings.options.port}`;
  smtp.verify().then(
    () => console.log(`[email] Sending through ${where} as ${settings.from}.`),
    (err: unknown) => console.error(`[email] The mail server at ${where} didn't accept the login, so emails may not go out:`, err instanceof Error ? err.message : err),
  );
}

/** Sends an email. A failed send is logged, never thrown: the page answers the same either way. */
export async function sendEmail(email: Email): Promise<void> {
  try {
    await transport(email);
  } catch (err) {
    console.error(`[email] sending to ${email.to} failed:`, err);
  }
}

/**
 * A link for an email. PUBLIC_URL (like https://app.tidyquest.org) is the address people use; without
 * it the link follows the request, which a forged Host header could point elsewhere, so set it.
 */
export function appLink(req: Request, pathAndQuery: string): string {
  const base = process.env.PUBLIC_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.get('host')}`;
  return `${base}${pathAndQuery}`;
}

export type EmailKind = 'confirm' | 'reset' | 'change-email' | 'email-changing' | 'trial-ending';

/** One of the app's emails in the person's language: hostedEmail.<kind>Subject and <kind>Body. */
export function writeEmail(kind: EmailKind, lang: string | null | undefined, to: string, vars: Record<string, string>): Email {
  const key = kind.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()); // change-email: changeEmail
  return {
    to,
    subject: tr(lang, `hostedEmail.${key}Subject`, vars),
    text: `${tr(lang, `hostedEmail.${key}Body`, vars)}\n\n— TidyQuest`,
  };
}
