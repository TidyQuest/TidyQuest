import net from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEmail, setEmailTransport, smtpSettings, smtpTransport, startEmail, type SmtpSettings } from '../hosted/email';

// NEW-15: real email sending over SMTP (SMTP_HOST and friends), checked against a tiny SMTP server here.

/** A bare SMTP server on a free port: no TLS, no login. It keeps each message it's given. */
async function fakeSmtp() {
  const messages: string[] = [];
  const server = net.createServer((sock) => {
    sock.setEncoding('utf8');
    sock.write('220 fake ESMTP\r\n');
    let buf = '';
    let data: string | null = null;
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let end: number;
      while ((end = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, end);
        buf = buf.slice(end + 2);
        if (data !== null) {
          if (line === '.') { messages.push(data); data = null; sock.write('250 queued\r\n'); }
          else data += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-fake\r\n250 8BITMIME\r\n');
        else if (cmd === 'DATA') { data = ''; sock.write('354 go ahead\r\n'); }
        else if (cmd === 'QUIT') sock.end('221 bye\r\n');
        else sock.write('250 OK\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, messages, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const local = (port: number, more: Record<string, string> = {}) =>
  smtpSettings({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), EMAIL_FROM: '"TidyQuest" <noreply@example.com>', ...more }) as SmtpSettings;

afterEach(() => {
  setEmailTransport();
  vi.restoreAllMocks();
});

describe('smtpSettings', () => {
  it('is off without SMTP_HOST', () => {
    expect(smtpSettings({})).toBeNull();
    expect(smtpSettings({ SMTP_HOST: '  ', SMTP_USER: 'a@b.c' })).toBeNull();
  });

  it('defaults to port 465 with TLS, sent from the login address as TidyQuest', () => {
    const s = smtpSettings({ SMTP_HOST: 'mail.example.com', SMTP_USER: 'noreply@example.com', SMTP_PASS: 'pw' }) as SmtpSettings;
    expect(s.options).toMatchObject({ host: 'mail.example.com', port: 465, secure: true, requireTLS: false, auth: { user: 'noreply@example.com', pass: 'pw' } });
    expect(s.from).toBe('"TidyQuest" <noreply@example.com>');
    expect(s.replyTo).toBeUndefined();
  });

  it('needs STARTTLS before a password goes out on other ports', () => {
    const s = smtpSettings({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'key', SMTP_PASS: 'pw', EMAIL_FROM: 'app@example.com', EMAIL_REPLY_TO: 'hello@example.com' }) as SmtpSettings;
    expect(s.options).toMatchObject({ port: 587, secure: false, requireTLS: true });
    expect(s.from).toBe('app@example.com');
    expect(s.replyTo).toBe('hello@example.com');
    // No login (a relay on the same machine): nothing to protect, so no STARTTLS needed
    expect((smtpSettings({ SMTP_HOST: 'localhost', SMTP_PORT: '25', EMAIL_FROM: 'a@b.c' }) as SmtpSettings).options.requireTLS).toBe(false);
  });

  it('says what is wrong when the settings cannot work', () => {
    expect(smtpSettings({ SMTP_HOST: 'h', SMTP_PORT: 'abc', EMAIL_FROM: 'a@b.c' })).toEqual({ error: expect.stringContaining('SMTP_PORT') });
    expect(smtpSettings({ SMTP_HOST: 'h', SMTP_USER: 'a@b.c' })).toEqual({ error: expect.stringContaining('SMTP_PASS') });
    expect(smtpSettings({ SMTP_HOST: 'h', SMTP_USER: 'apikey', SMTP_PASS: 'pw' })).toEqual({ error: expect.stringContaining('EMAIL_FROM') });
  });
});

describe('sending over SMTP', () => {
  it('delivers the email with its sender, reply-to and auto-generated header', async () => {
    const smtp = await fakeSmtp();
    try {
      await smtpTransport(local(smtp.port, { EMAIL_REPLY_TO: 'hello@example.com' })).send({ to: 'parent@example.com', subject: 'Confirm your email', text: 'Open this link: http://x/confirm' });
      expect(smtp.messages).toHaveLength(1);
      const msg = smtp.messages[0];
      expect(msg).toMatch(/^From: "?TidyQuest"? <noreply@example\.com>$/m);
      expect(msg).toMatch(/^Reply-To: hello@example\.com$/m);
      expect(msg).toMatch(/^To: parent@example\.com$/m);
      expect(msg).toMatch(/^Subject: Confirm your email$/m);
      expect(msg).toMatch(/^Auto-Submitted: auto-generated$/m);
      expect(msg).toContain('Open this link: http://x/confirm');
    } finally {
      await smtp.close();
    }
  });

  it('startEmail switches sendEmail from the log to the mail server', async () => {
    const smtp = await fakeSmtp();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      startEmail({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.port), EMAIL_FROM: 'noreply@example.com' });
      await sendEmail({ to: 'parent@example.com', subject: 'Reset your password', text: 'hi' });
      expect(smtp.messages).toHaveLength(1);
      expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[email] to parent@example.com'));
      // The startup login check reports success
      await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining(`Sending through 127.0.0.1:${smtp.port}`)));
    } finally {
      await smtp.close();
    }
  });

  it('keeps logging emails when SMTP is missing or set up wrong', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    startEmail({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No SMTP_HOST'));
    startEmail({ SMTP_HOST: 'h', SMTP_USER: 'a@b.c' });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SMTP_PASS'));
    await sendEmail({ to: 'parent@example.com', subject: 'S', text: 'T' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[email] to parent@example.com: S'));
  });

  it('a mail server that is down is logged, never thrown', async () => {
    const smtp = await fakeSmtp();
    await smtp.close(); // nothing listens on that port now
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setEmailTransport(smtpTransport(local(smtp.port)).send);
    await expect(sendEmail({ to: 'parent@example.com', subject: 'S', text: 'T' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('sending to parent@example.com failed'), expect.anything());
  });
});
