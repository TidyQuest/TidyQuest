# Configuration

Most of TidyQuest is set up in the app (Settings). This page covers the server's environment variables and the
notification services. Start from [`.env.example`](../.env.example) if you build from source.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | **Yes** (prod) | Secret for signing JWT tokens (min 32 chars) |
| `NODE_ENV` | No | `production` or `development` |
| `TZ` | No | Only a fallback. The family's time zone is set in the app (Settings → General → Time zone); a new install takes it from the first parent's browser. `TZ` (e.g. `Europe/Paris`, default UTC) is used until a zone is picked, which matters for installs that existed before the setting |
| `PORT` | No | Server port (default: 3000) |
| `TRUST_PROXY` | Behind a reverse proxy | Addresses of the proxy in front (e.g. `loopback, 172.16.0.0/12` for nginx or Nginx Proxy Manager on the same host or in Docker), or a hop count such as `1`. The login limit then counts each visitor's own address instead of the proxy's. Leave it unset without a proxy: the `X-Forwarded-For` header is ignored, since anyone can send it |
| `ADMIN_RESET_PASSWORD` | No | One-shot admin password recovery. Set, restart, then remove. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | No | The keys that sign phone notifications (web push). Without them the server makes a pair on first use and keeps it in the data folder (`vapid-keys.json`): back it up with the database. With new keys, each device signs up again the next time the app opens. |
| `VAPID_SUBJECT` | No | How a push service can contact you about this server's messages: `mailto:you@example.org` or an `https://` address. Default: this project's GitHub page. |
| `SOURCE_URL` | If you changed the code | Where the **Source code** link (login page and Settings → General) points. By default it's this repository at the tag (or `:main` commit) you run. If you run code you changed, set it to where people can get your copy: the AGPL asks for that |

## Notifications

Parents turn notifications on in **Settings → General → Notifications**. Each service can be a family channel
everyone gets, and each person can also get their own (ntfy topic, Telegram chat or Home Assistant phone) under
*Who gets what*. The *Notification log* there shows every send and any error.

**Phone notifications (web push)**

Nothing to set up on the server. Once notifications are on, each person opens **Profile → My notifications** on
their own phone or computer and taps **Turn on for this device**. It needs the app opened at an `https://` address
(a reverse proxy with a certificate, e.g. Nginx Proxy Manager); on iPhone and iPad (iOS 16.4+) TidyQuest has to be
added to the Home Screen first. Messages go through the browser's push service (Google, Apple, Mozilla or
Microsoft), encrypted end to end. Parents see each person's devices under *Who gets what*; **Settings → Features**
can switch it off.

**Telegram**
1. Create a Telegram bot via [@BotFather](https://t.me/botfather)
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot)
3. Enter bot token and chat ID in Settings

**ntfy**
1. Use [ntfy.sh](https://ntfy.sh) or your own ntfy server
2. Enter the server URL and topic in Settings
3. Subscribe to the topic on your phone

**Home Assistant** (not in hosted mode)

Messages go to phones through the Home Assistant Companion app.
1. In Home Assistant, open your profile (bottom left) → **Security** → **Long-lived access tokens** → **Create token**,
   and copy it (it's shown only once).
2. In TidyQuest's Home Assistant box, enter the **Home Assistant URL** as the TidyQuest server reaches it, e.g.
   `http://homeassistant.local:8123` or `http://192.168.1.20:8123` (inside Docker, `.local` names often don't
   resolve: use the IP address), and paste the token.
3. Optional: a **family notify service** for messages everyone gets, e.g. `notify.family` (a
   [notify group](https://www.home-assistant.io/integrations/group/#notify-groups) you made in Home Assistant). Save.
4. Under **Who gets what**, give each person their phone's service, e.g. `notify.mobile_app_alexs_phone`. Home
   Assistant lists them under **Developer tools → Actions** (type `notify.`); a phone appears there once the
   Companion app is signed in on it. The `notify.` prefix is optional; only lowercase letters, numbers and
   underscores are allowed.
5. Tap **Send test notification** next to that person. If it fails, the message says why: "Could not reach Home
   Assistant" (wrong URL or not reachable from the server), "returned 401" (wrong or deleted token), "returned 400"
   (no notify service by that name). The *Notification log* shows every send and any error.

TidyQuest calls `POST <url>/api/services/notify/<service>` with `{"title": "TidyQuest", "message": ...}`. This is
separate from the [Home Assistant integration](../custom_components/tidyquest/README.md), which shows chores as sensors in
Home Assistant.


## Hosted mode (`HOSTED=1`)

`HOSTED=1` runs many families on one server, each with its own database and folder, with sign-up, email sign-in for
parents and an operator page at `/operator`. It isn't supported for self-hosting, and you're responsible for the data
of the families you host. To run TidyQuest for your own family, leave `HOSTED` unset. The code is in
`server/src/hosted/`.

Hosted mode sends emails (confirm an address, reset a password, change the sign-in email) through any SMTP server.
Without `SMTP_HOST` they go to the server log, links and all, which is fine for testing only.

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | The mail server, e.g. your mailbox host or Postmark, Amazon SES or Resend |
| `SMTP_PORT` | Default `465` (TLS from the start). Other ports such as `587` must offer STARTTLS before a password is sent |
| `SMTP_USER`, `SMTP_PASS` | The login, often the mailbox's full address and its password |
| `EMAIL_FROM` | The sender, e.g. `TidyQuest <noreply@example.org>` (no quotes needed). Default: TidyQuest at `SMTP_USER` |
| `EMAIL_REPLY_TO` | Optional: where replies go, e.g. a support mailbox |
