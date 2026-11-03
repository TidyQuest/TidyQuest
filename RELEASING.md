# Releasing

Two images come out of this repo (`.github/workflows/docker-publish.yml`):

| When | Image tags | Used by |
|---|---|---|
| Every merge to `main` | `:main`, `:sha-<short>` | **Staging**: `docker compose pull && docker compose up -d` |
| A published GitHub release `vX.Y.Z` | `:X.Y.Z`, `:X.Y`, `:X`, `:latest` | **Production**, pinned to `:X.Y.Z` |

Settings → Version shows which one is running: `v0.7.0` on a release, `v0.6.3 · main · 7e18930` on a
build from `main`. Without logging in: `curl http://<server>:<port>/api/version`.

## Putting a new version on production

1. Merge the work into `main` and try it on staging (`:main`). Each pull request adds its lines to
   [CHANGELOG.md](CHANGELOG.md) under **Unreleased** (Added, Changed or Fixed), in plain language.
2. Release it from an up-to-date `main` checkout:

   ```sh
   ./scripts/release.sh 0.7.0
   ```

   This moves CHANGELOG.md's Unreleased lines under `## v0.7.0 (date)`, bumps `package.json`, commits
   `chore: release v0.7.0`, tags `v0.7.0`, pushes both and publishes the GitHub release with that
   changelog section as its notes, followed by GitHub's list of merged pull requests (with `gh`; without
   it, publish the release for the tag on GitHub yourself). It stops if Unreleased is empty.
   Pick the number by what changed: `0.7.1` for fixes only, `0.8.0` for new features.
3. Wait for the "Build and Push Docker Image" run to finish (GitHub → Actions).
4. On the production server, pin the new version in `docker-compose.yml` and pull it:

   ```yaml
   image: ghcr.io/tidyquest/tidyquest:0.7.0
   ```

   ```sh
   docker compose pull && docker compose up -d
   ```

## The hosted service (app.tidyquest.org)

The rented server runs hosted mode (`HOSTED=1`, many families on one server) from the same images. It gets a
release the same way as production, pinned to `:X.Y.Z`, with a few extra steps because other families' data is
on it. Hosted staging (`:main` with `HOSTED=1`, port 3022 on the home server) is where each release is tried
first: sign up a test family, confirm its email, and click through whatever changed.

1. **Read the release's changelog for new settings.** Compare the server's `.env` with `.env.example` in the
   deploy files and fill in anything new before the upgrade, or the app starts without it.
2. **Pick a quiet hour.** Families are in the US: 2–4 am US Eastern (11 pm–1 am Pacific) is when the fewest
   are signed in. The restart takes a few seconds; anyone using the app then just tries again.
3. **Pin the version** in the app's `compose.yml` (`image: ghcr.io/tidyquest/tidyquest:X.Y.Z`) and pull it
   first, so the app is down only for the restart:

   ```sh
   docker compose pull
   ```

4. **Take a snapshot of the data**, with the app stopped so every database is complete:

   ```sh
   docker compose stop app
   mkdir -p ~/snapshots
   tar czf ~/snapshots/app-data-$(date +%F)-before-X.Y.Z.tgz data
   docker compose up -d
   ```

   Delete snapshots after 30 days (`find ~/snapshots -name '*.tgz' -mtime +30 -delete`): they hold every
   family's data, and the privacy policy promises a deleted family is gone from everything within 60 days.
5. **Check it:**
   - `curl -s https://app.tidyquest.org/api/version` shows `X.Y.Z` and `"hosted":true`;
   - the operator page (`/operator`) signs in, lists the families, and its History shows no clean-up you
     didn't expect;
   - `docker compose logs app | tail -50` has no errors, and `[email]` says the mail server took the login;
   - sign in to a test family and open Home, Settings and one room.

To roll back, pin the previous version and `docker compose up -d`. If the new version changed something in
the data that the old one trips over, stop the app, put the snapshot's `data` folder back, and start the old
version.

## Rolling back

Set the image back to the previous version (e.g. `:0.6.3`) and run `docker compose up -d` again.
The database migrates forward only (new columns and tables are added on start and ignored by older
versions), so take a backup first (Settings → Data → Download, or copy the `data` folder) before a
big release.
