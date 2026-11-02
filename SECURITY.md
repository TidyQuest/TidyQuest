# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

- **On GitHub:** the repository's **Security** tab → **Report a vulnerability**
  ([direct link](https://github.com/TidyQuest/TidyQuest/security/advisories/new)), or
- **By email:** hello@tidyquest.org, with "Security" in the subject.

Include what you found, the steps to reproduce it, the version you run (Settings → General shows it), and what
someone could do with it. A suggested fix is welcome but not needed.

TidyQuest is maintained in spare time. You'll get a reply **within 7 days**; serious problems are fixed first and
released as soon as they're ready. Once a fix is out, the report can be published with credit to you, if you'd like.

This covers the app in this repository and the hosted service at tidyquest.org.

## Supported versions

Only the **latest release** gets security fixes ([releases](https://github.com/TidyQuest/TidyQuest/releases)).
Please check that a problem still happens on it before reporting. Coming from `mellowfox/tidyquest` (0.6.3)? See
the README, *Moving from mellowfox/tidyquest*.

## Running it safely

### 1. Set a strong JWT secret

The JWT secret signs every login. A weak or default secret lets anyone sign in as anyone.

```bash
openssl rand -base64 32
```

```yaml
environment:
  - JWT_SECRET=<your-generated-secret>
```

Never commit secrets to version control.

### 2. Use HTTPS with a reverse proxy

Don't expose TidyQuest to the internet over plain HTTP. Put Caddy, Nginx or Traefik in front with a valid
certificate (Let's Encrypt), and set `TRUST_PROXY` so the login limits see each visitor's real address.

```
tidyquest.yourdomain.com {
    reverse_proxy localhost:3020
}
```

### 3. Keep the database private

Telegram bot tokens and ntfy access tokens are stored **unencrypted** in the SQLite database.

- Restrict access to the `./data/` folder (`chmod 600 data/tidyquest.db`).
- Never serve the database file.
- Back it up regularly, and encrypt the backups.

```bash
# Manual backup
cp data/tidyquest.db backups/tidyquest-$(date +%Y%m%d).db

# Daily at 3:00 (crontab)
0 3 * * * cd /path/to/tidyquest && cp data/tidyquest.db backups/tidyquest-$(date +\%Y\%m\%d).db
```

Settings → Export never includes password hashes.

### 4. Limit who can reach it

The default Docker Compose setup publishes port `3020` on every network interface. For access from this machine
only:

```yaml
ports:
  - "127.0.0.1:3020:3000"
```

### 5. Lost the admin password?

Set `ADMIN_RESET_PASSWORD` and restart: the first admin's password is reset and they're signed out everywhere.
**Remove the variable afterwards.** It's ignored in hosted mode.

```yaml
environment:
  - ADMIN_RESET_PASSWORD=new-secure-password
```

## Checklist

- [ ] `JWT_SECRET` set to a random value (not the example)
- [ ] HTTPS reverse proxy in front, and `TRUST_PROXY` set
- [ ] Database file permissions restricted (`chmod 600`)
- [ ] Regular, encrypted backups
- [ ] Firewall allows only the ports you need
- [ ] Running the latest release
- [ ] Notification tokens kept secret (Telegram, ntfy)
- [ ] `.env` not committed

## How sign-in works

- **Logins:** JWT, valid for 30 days. Profile → **Log out everywhere else** ends your other logins, a parent can
  sign anyone out from Settings → Family Members (**Log out of all devices**), and a new password signs the
  person out everywhere too.
- **Passwords:** bcrypt (10 rounds).
- **Limits:** registrations and failed logins, 20 per 15 minutes per address.
- **Roles:** admin, member and child.
- **Uploads:** pictures only (`.jpg`, `.jpeg`, `.png`, `.webp`), checked by type and size; an old avatar is deleted
  when it's replaced.
- **Docker:** the container runs as the non-root user `node`.
