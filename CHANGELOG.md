# Changelog

What changed in each release, in plain language, newest first. Releases up to v0.6.3 came out as
`mellowfox/tidyquest`, before the project moved to the TidyQuest organization: see [RELEASE-NOTES.md](RELEASE-NOTES.md).

**Adding to it:** every pull request adds its lines under **Unreleased** (in Added, Changed or Fixed).
`scripts/release.sh X.Y.Z` turns Unreleased into that version's section and uses it as the GitHub release notes
(see [RELEASING.md](RELEASING.md)).

## Unreleased

### Changed
- On a room's page, a chore that can't be done yet no longer turns red as it gets close: its bar stops at yellow and
  turns red only once it's due. Chores with *Allow early completion* on, and anytime chores, keep their colours (#153).
- A parent with *Participates in tasks* off now shows on the Board in any period when they did a chore, instead of
  never. The switch's description says what it really does (they still earn coins), and the guide has a new
  troubleshooting entry, *A parent is missing from the Board* (#152).

### Fixed
- Editing a starter reward (like *Stay Up 30 Min*) no longer shows its description in French. The form now shows the
  same text as the list, in your language. A starter reward whose description you changed also shows your text
  instead of the built-in one. New installs save the starter descriptions in English (#150).
- On screens wider than a tablet, buttons without a set size (like *Customise* at the bottom of Home, and *Reset to
  default* and *Done* in it) had no padding and looked squished. They now have the same padding as on phones (#151).
- Each admin can now turn *Participates in tasks* on or off on their own card in Settings → Family Members. Before,
  only another admin could, so a family with one admin had no way to change it (#152).
- The table of contents in API.md links to its sections again, and now lists *Rate Limiting* and *Notes* too
  (#139).

## v0.15.2 (2026-11-02)

### Added
- A **Source code** link to the code of the exact version you run, at the bottom of the login and sign-up pages and
  in Settings → General under the version (TidyQuest is free software, AGPL-3.0). Running code you changed? Set
  `SOURCE_URL` to where people can get your copy.
- Hosted mode (`HOSTED=1`) sends its emails for real through any mail server (SMTP): confirming an address,
  resetting a password and changing the sign-in email. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and optionally
  `SMTP_PORT`, `EMAIL_FROM` and `EMAIL_REPLY_TO` (README, *Hosted mode*). Without them emails still go to the server
  log. Self-hosted installs don't send email and need none of this.

### Changed
- The security policy (`SECURITY.md`) is rewritten and up to date: report problems privately through GitHub's
  **Report a vulnerability** or by email to hello@tidyquest.org, with a reply within 7 days. GitHub's Security tab
  shows it directly (its old link led to a "page not found").
- Updated the tools used to build and test TidyQuest, for security fixes in them (Vite, Vitest, ESLint and
  others). None of them ship inside the app, so nothing changes in how it works.
- The server runs on Express 5, the current version of the web framework it's built on (it was on Express 4),
  so it keeps getting security fixes. Nothing changes in how the app works.
- The app's pages are built with Vite 8 (was Vite 7), and its code is checked with ESLint 10 (was ESLint 9). These
  are build tools, so nothing changes in how the app works.

### Fixed
- Building the Docker image no longer fails when one download of the database add-on (`better-sqlite3`) fails.
  The server's packages are downloaded once per platform instead of twice. If the ready-made add-on still can't be
  downloaded, the build compiles it instead. The finished image is the same and has no build tools in it. Pull
  requests that change the build files now build the image too, without publishing it. Building it yourself
  (`docker compose build`) no longer copies in `node_modules`, `dist` or `data` from your computer.

## v0.15.1 (2026-11-02)

### Fixed
- Security updates for parts the app is built on: the code that reads a visitor's address behind a reverse proxy
  (`proxy-addr`, critical when `TRUST_PROXY` is set), the photo upload handler (`multer`), request parsing
  (`express`, `body-parser`, `qs`) and page navigation (`react-router`). Nothing changes in how the app works.

## v0.15.0 (2026-11-02)

### Changed
- TidyQuest has a new home: [github.com/TidyQuest/TidyQuest](https://github.com/TidyQuest/TidyQuest). New
  versions are published as `tidyquest/tidyquest` on Docker Hub and `ghcr.io/tidyquest/tidyquest` on GitHub.
  Coming from `mellowfox/tidyquest` (0.6.3)? Back up, change the image name and pull (README, *Moving from
  mellowfox/tidyquest*). The Unraid template, the Home Assistant integration, and the README's links point to
  the new home.

## v0.14.3 (2026-11-02)

### Added

- Hosted mode: the operator page has a History. It keeps every pause, resume, delete and resent confirmation
  email (who did it, to which family, when, and from which address), plus operator sign-ins, wrong passwords,
  password changes, Sign out, and accounts or passwords set from the compose file. A History button at the top
  lists everything, newest first, with All, Family actions and Sign-ins filters, and each family's card has a
  History button for that family's own. Entries stay after a family is removed for good. Families never see
  any of this, and self-hosted installs have no operator page.
- Hosted mode: new sign-ups can be closed. The operator page has a "New sign-ups: Open / Closed" switch that
  works at once, with no restart. While closed, the sign-up page becomes a waitlist form (family name, your
  name, email and an optional note), and a page that was already open switches to it, keeping what was typed.
  The operator page lists the waitlist, oldest first, with each family's email as a link to write to them and a
  Remove button. Nothing is emailed. Families already signed up aren't affected. Each change of the switch and
  each removal goes in the History, under a new Sign-ups filter. It's open by default.
- Tapping a proof photo in Activity or in Waiting for approval opens it full size inside the app, instead of in
  a new browser tab. Tap anywhere (or press Esc) to close it.
- Insights: see who bought which reward, and when. Under Coins in and out, tap a reward in Rewards bought most
  to see who bought it, how many times and for how many coins. A new Recent rewards list shows every reward in
  the weeks shown, newest first, with the day and who paid (for a shared reward, everyone who chipped in, with
  their share); ones a parent hasn't approved yet are marked ⏳ waiting. The first 8 show, with Show all for the
  rest. Both follow the name chips.

### Changed

- Proof photos only open for someone logged in to the family who may see them: parents see all of them, and
  everyone else only their own (or one from a team-up they were on). A photo's link copied out of the app no
  longer opens anywhere else, or after logging out, "Log out everywhere" or a password change. In hosted mode
  the same goes for avatars, and no photos open while a family is paused, its trial has ended or its email is
  waiting to be confirmed. Self-hosted avatars still open without logging in, because the login screen shows
  them. Nothing changes for families: the app gets what it needs when it starts, so nobody has to log in again.
- In hosted mode the "Allow new registrations" setting is hidden. Hosted families add people from Settings →
  Family Members, and the public sign-up page is always off there, so the toggle did nothing. Self-hosted installs
  still have it, unchanged.
- The timed notifications (the morning summary, the evening nudge and chore reminders) are checked once a minute
  instead of every 30 seconds, and do far less work each time. What gets sent, and when, stays the same.
- In hosted mode, requests no longer wait while the background jobs go through every family: the jobs let them
  through after each family.
- The README says what hosted mode (`HOSTED=1`) is: how tidyquest.org runs, allowed for others but not supported.

### Fixed

- Deleting a reward no longer erases what was bought with it. Its past purchases stay in Insights (the coins
  chart's spending bars and Rewards bought most), so past weeks no longer look like less was spent. A request
  that was still waiting stays with Reward requests, where a parent can still approve it or turn it down (which
  gives the coins back); before, it vanished and its coins never came back. Restoring the reward from Recently
  deleted works as before. Rewards already in Recently deleted get their purchases back too.
- The side navigation now scrolls when the window is short, so you can always reach every menu item and your
  profile. Before, the lower items and the profile could be cut off with no way to scroll to them.
- Un-pinning or un-snoozing a chore that no longer exists now answers "not found", as pinning and snoozing
  already did, instead of saying it worked.

## v0.14.2 (2026-10-30)

### Added

- A kid's proof photo and note now stay with the chore in Activity after a parent approves it: a small photo
  (tap it for full size) and the note under the chore's name. Parents see everyone's; everyone else sees only
  their own.

### Changed

- The house mascot only cheers (🍪 and a little hop) for bigger chores, 3★ effort or more, so "Make your bed" no
  longer gets the same party as "Mow the lawn". Smaller chores still fill its tummy, quietly.

### Fixed

- Proof photos no longer pile up in the family's photo space: undoing or rejecting a chore, marking a chore not
  done, replacing a photo, or deleting a person now deletes the photo file too.
- Home's data no longer includes other people's proof notes and photos for anyone but parents.
- Resetting the first parent's password on the server (ADMIN_RESET_PASSWORD) now signs them out on every
  device, like any other new password. Before, phones and computers already logged in kept working.

## v0.14.1 (2026-10-29)

### Changed

- Proof photos and profile photos are made smaller on the phone before they upload (about 1600 pixels on the long
  side for proof photos), so big camera photos no longer fail for being over the size limit, and they take less of
  a family's photo space. Photos the browser can't read, and small ones, go up as they are.
- When a proof photo doesn't upload after Done, the message now stays until you close it, says the chore was still
  recorded and why the photo failed when that's known (too big, or the family's photo space is full), and has a
  "Try again" button while the chore waits for a parent's approval. Before, it vanished after a few seconds, and a
  "Waiting for approval" message could replace it straight away.
- Operator page (hosted): the box for deleting a family is labelled "Family name, to confirm" and shows the
  family's name as a grey hint, and "Delete for good" looks switched off until the name matches. What happened
  ("Deleted …" or an error) also shows on the family's card, or in its place once it leaves the list, not only at
  the top of the page.

### Fixed

- "Who completed this task?": tapping a person's name or picture now picks them. Before, only the small circle or
  tick box worked, because a tap on the rest of the card picked and unpicked them at once.

## v0.14.0 (2026-10-29)

### Added

- Groundwork for the hosted service (tidyquest.org): with the new `HOSTED=1` setting, one server can keep many
  families, each with its own database and photo folder, and a family can never reach another's data. It isn't
  usable yet (sign-up and family logins come next). Without `HOSTED=1` nothing changes for self-hosted installs.
- Hosted mode (`HOSTED=1`) gets sign-up and its own logins. A new family signs up with a family name, the parent's
  name, email and password (time zone from the browser), and can play right away. Parents sign in with their email;
  kids and teens with the family code (like `sunny-otter-42`), their username and password. Settings shows the
  code, the family link and a QR code to open on a kid's device, which then remembers the family, plus "New code".
  The login page lists nobody in hosted mode. Parents confirm their email with a link (after 30 days unconfirmed,
  only confirming and downloading the family's data work), can reset a forgotten password by email, and can change
  their sign-in email. Emails go to the server log until a real sender is added. Optional settings:
  `PUBLIC_URL` (the address in emailed links), `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (a CAPTCHA on
  sign-up), `TERMS_URL` and `PRIVACY_URL` (an "I agree" box on sign-up).
- Hosted mode runs the background jobs (reminders, coin boosts, scheduled notifications, team-ups, streak shields,
  overdue counts and the end of pauses) for every family on a trial or a paid plan, one family at a time, each in its
  own database. An error in one family is logged and the others carry on. Once a day it removes families deleted
  more than 30 days ago. With billing switched on (a `PAYMENT_KEY`, which comes with billing), a trial that ended
  without paying is deleted 60 days later, and its parents get an email a week before with a link to download their
  data. Without a payment key, families never expire.
- Hosted mode (`HOSTED=1`) safety. Notifications only go through ntfy.sh and Telegram: a custom ntfy server or Home
  Assistant is refused when saved and when sent, and dropped from an imported backup (with that server's topics, so
  messages never land in a public ntfy.sh topic). Each family has limits, set with `MAX_PEOPLE` (15 people),
  `MAX_IMPORT_MB` (5), `MAX_PHOTO_MB` (5) and `MAX_FILES_MB` (200 MB of avatars and photos). Login, sign-up and email
  limits are kept in the hosted database, so a restart doesn't reset them. Security headers are on, and CORS only
  allows the app's own address (`PUBLIC_URL`, or `CORS_ORIGIN`). A paused family, or one whose trial has ended (with
  billing on), sees a page about it instead of the app, and parents can still download their data there.
- An operator page for hosted mode (`HOSTED=1`) at `/operator`, for the people running the server. It has its own
  accounts and sign-in: a family's login can't open it, and an operator's login can't open a family. It lists each
  family (newest activity first, 50 at a time) with its family code, when it was made and last used, how many people
  it has, the space its photos and data take, its status, plan and parents' emails, and finds a family by name, code
  or email. It can pause and resume a family, delete one (type its name to confirm; the folder is kept 30 days), and
  resend a parent's confirmation email. It never shows what's inside a family. `OPERATOR_EMAIL` and
  `OPERATOR_PASSWORD` (12 characters or more) make the first account at startup; the same settings with a new
  password are the way back in after a forgotten one. Take the password out of the settings after signing in. The
  page is in English only.
- A "Proof photos" switch in Settings → Features. It's on, except in hosted mode, where it starts off until a parent
  turns it on. When it's off, kids finish a chore that waits for approval with a note only.

### Changed

- "Due today" reminders still go out when the server is busy or restarts around the set time, up to 90 minutes
  late, instead of being skipped for the day.
- Sending a notification gives up after 10 seconds, so an unreachable Telegram, ntfy or Home Assistant server can't
  hold up the other reminders.
- An error in one background job is logged and the other jobs keep running (before, it could stop the server).
- A photo, avatar or backup that's too big now gets a message that says the limit, instead of a general error.

### Fixed

- A wrong password on the login screen now says so, in your language, instead of reloading the page.
- Adding a family member that doesn't work (a username that's taken, say) now says why under the form; before,
  nothing happened.

## v0.13.0 (2026-10-29)

### Added
- **A Time zone setting.** Settings → General → Time zone (parents): days start at midnight there for the whole
  family, so chores, streaks, weekly goals, the Board, reward limits, reminders, quiet hours and Insights all count
  home days. Search the list or tap "Use this device's zone". A new install takes the zone from the first parent's
  browser. An existing install keeps using the server's `TZ` until a parent picks a zone, and Settings offers this
  device's zone when it's different. Changing it moves when each day starts from then on: chores already done stay
  on their days, and a weekly goal that's running moves to the new zone's week. The server no longer needs `TZ`.
- **Log out everywhere.** Profile → "Log out everywhere else" signs you out on every other phone, tablet and
  computer and keeps you signed in on this one. Parents can sign one person out on all their devices (Settings →
  Family Members → Manage member → "Log out of all devices"), e.g. for a lost tablet.
- **"Forgot password?" on the login screen.** It opens a short note: ask a parent to set a new password in
  Settings → Family Members, and if no parent can log in, whoever runs the server can reset the first parent's
  password (with a link to the README's steps). No email needed.

### Changed
- A new password signs that person out on every device. Changing your own keeps you signed in where you changed it;
  when a parent resets a kid's password, the kid's tablet is signed out too and needs the new one. Logins from
  before this version keep working until then.
- A phone or computer in another time zone (a parent on a trip) still counts home days: today's chores, due dates,
  the Calendar, History, Insights and "Done earlier…" follow the family's zone. Coin boost start and end times are
  typed and shown in home time.

### Fixed
- A goal's end date now ends at midnight at home. It used to end at midnight UTC, which is late afternoon in the
  Americas.
- Home's "streak done today" and the earliest vacation end date no longer use the UTC date, which is already
  tomorrow on an American evening.
- The streak check for a missed day looks at the end of the family's day, not the end of the UTC day.
- Typing the wrong current password when changing yours no longer signs you out.
- Home's House Health card: tapping Rooms or Tasks opens that page, and tapping Critical opens the task list showing
  only the chores under 30% health (a new "Critical" choice in the task list's status filter). They looked like
  buttons but did nothing.
- On the Rooms page, tapping a chore on a room's card opens the room scrolled to that chore and flashes it, instead of
  opening the room at the top.
- The guide now says the right thing about passwords after importing a backup: people who already have an account on
  this server keep their passwords, and only people new to it need one from a parent.

## v0.12.0 (2026-10-24)

### Added
- **Pick the day the week starts.** Settings → General → Week starts on: Monday (as before) or Sunday. Weekly
  goals, the Board (this week, last week, the team goal and past winners), weekly reward limits, rotating rewards,
  "per week" chore turns, weekly badges, Insights, the Calendar and History's "This week" all follow it. A weekly
  goal that's running moves to the new week when you switch.

### Changed
- The weekly recap covers the week that just ended when it goes out on the week's first day (for example, Sunday
  evening for a family whose week starts on Sunday).

### Fixed
- On a computer, the chore editor's options (Timer, Steps, Effort, Allow early completion) no longer run off the
  right side of the card: that row wraps now, in Add Task too.
- On phones, a chore's ⋯ menu no longer hangs off the left edge of its card.
- A room's page no longer scrolls sideways on laptops. On a wide screen the chore table's columns share the space,
  so names and descriptions get room to breathe. On a narrower one each chore shows its name on top, its details on
  a line below and its buttons at the right; the column names stay above as sort buttons.
- Page titles no longer push the Search, coins and streak badges off the side on narrow computer windows; the
  badges move under the title instead.
- In kid mode, the room table's column names line up with the chores again.

## v0.11.1 (2026-10-21)

### Added
- **Pause a chore.** ⏸️ Pause in a chore's ⋯ menu (or the "⏸️ Paused" tick in the chore editor) takes it off
  everyone's lists without deleting it. Pick an optional "Back on" day and it switches itself back on; ▶️ Switch
  back on does it by hand. It comes back as if just done. Parents see paused chores greyed at the end of their room.
- **Hide a reward.** Hide / Show in Settings → Rewards Catalog takes a reward out of the shop and keeps it for
  later. Hidden rewards are greyed at the end of the list.
- **Log a chore late.** "Done earlier…" next to Done logs a chore for yesterday or another day in the past week. It
  counts on that day for streaks, the weekly goal, the Board and the Calendar. A kid's late log always waits for a
  parent. It pays the chore's normal coins, without double coins or the Rescue Mission. Activity tags it "logged
  late".
- **Insights: compare people.** Tap a name in a chart's legend to hide or show that person's data (for example,
  only the twins). Colors stay with each person, and totals count only who's shown.

### Fixed
- Insights bars no longer stay dimmed after the mouse leaves the chart. Pointing at a bar previews it; a click or
  tap pins it, and tapping it again or anywhere outside the chart lets go.
- "Waiting for approval" stays on a parent's Home while Strict Mode is on, and says "No chores waiting for
  approval." when it's empty.

## v0.11.0 (2026-10-20)

### Added
- **🛡️ Streak shields** cover a missed day so a streak keeps going. Earned every 7th day of a streak, bought in the
  shop or given by a parent.
- **Insights for parents:** when chores get done, busy and quiet times, who does how much, skipped and late chores,
  and coins in and out, with a date picker and a custom date range.

## v0.10.1 (2026-10-18)

### Added
- Monthly chores, on a day of the month or a day like "first Saturday".
- A "Starts on" date for repeating chores.

### Changed
- Due dates show the weekday ("Sat, Nov 7").

## v0.10.0 (2026-10-18)

### Added
- A countdown timer on chores.
- One thing at a time (Focus).
- Rearrange Home by drag and drop, saved per person.
- The guide in six languages.

### Fixed
- The Troubleshooting link scrolls to its section.

## v0.9.6 (2026-10-18)

### Added
- Undo a snooze.
- "Call off team-up".
- Tap a double coins event to see its chores.

### Fixed
- Cancel no longer fails on shared (chipped-in) reward requests.
- Actions that failed silently now show an error.

## v0.9.5 (2026-10-18)

### Changed
- Deleting a chore or room keeps its history.
- Clearer chore row buttons: no ×, a bigger ⋯, and Done set apart.
- ↩️ Undo asks to confirm.
- Deleting a room says how many chores it has.
- "See all" for reward requests.
- The guide explains adjusting coins.

## v0.9.4 (2026-10-18)

### Added
- Decline a team-up.
- Refund a reward.
- Take back a Done that's still waiting for approval.
- Reject with undo and a reason.
- Adjust parents' coins.

### Fixed
- Team-up undo.
- The login limit.

## v0.9.3 (2026-10-17)

### Added
- Swap mascots.

### Fixed
- The egg in the mascot shop.
- The Settings layout.

## v0.9.2 (2026-10-16)

### Added
- More to do with the house mascot.

## v0.9.1 (2026-10-16)

### Added
- Guide & help in Settings.

## v0.9.0 (2026-10-16)

### Added
- Cheers.
- Unlockables: titles and gold-tier badge frames.
- A house mascot that hatches and grows with the family's coins.
- Team-ups on a chore.
- More chore icons.

## v0.8.0 (2026-10-16)

### Added
- Double coins on chosen chores.

### Fixed
- Chip-ins start at 0, and Activity shows every chip-in.

## v0.7.0 (2026-10-16)

The first release of this fork.

### Added
- Seasonal styling: holiday decorations and colors, which can be turned off.
- Search and filters: a Tasks page, header search (/ or Ctrl+K), and filters on Rewards and Activity.
- One-time chores with a To-do card and "+ To-do", the "Your usual" and "Maybe you forgot" cards, and the Rescue
  Mission (today's most-forgotten chore pays extra).
- A Features card in Settings to switch the extras on or off.
- A family Board, achievements, notifications per person, and a theme per person.
- Settings shows the running version.

### Fixed
- Many fixes from the first review: badges that disappeared, the weekly goal rolling over, custom coins on the room
  page, tapping and scrolling, approvals, backups, coins, rewards and goals, scheduling, and setup.
