# Changelog

What changed in each release, in plain language, newest first. Releases up to v0.6.3 came out as
`mellowfox/tidyquest`, before the project moved to the TidyQuest organization: see [RELEASE-NOTES.md](RELEASE-NOTES.md).

**Adding to it:** every pull request adds its lines under **Unreleased** (in Added, Changed or Fixed).
`scripts/release.sh X.Y.Z` turns Unreleased into that version's section and uses it as the GitHub release notes
(see [RELEASING.md](RELEASING.md)).

## Unreleased

### Added

- **Settings → Look: one style for the whole family** (NEW-37, the last step of the new look). Parents pick Fresh
  (the default: a softly tinted summary card and light cards), Quest (a bold block of colour at the top of the page
  and in the summary card, gold progress, chunky buttons with a pressed edge, every chore its own tile with a solid
  green ✓) or Calm (flat, thin outlines, smaller corners, colour only where something needs attention). Each choice has
  a small drawing in your own colours, and the page lists everyone's colour theme underneath. The look sets the
  shapes and each person's theme still sets the colours, so every theme works with every look. It changes on your
  device at once and on everyone else's when their Today next loads, and backups keep it. Kids and members don't see
  the setting.

### Changed

- **A calmer, plainer look: "Fresh"** (ENH-30, the last layout step of the new look). Cards have thin borders and
  smaller corners, buttons are square-cornered with no glow, and filled buttons and links in the seven light colour
  themes use a deeper shade of their colour, so white text on them is easier to read (the default orange went from
  #F97316 to #C94A0B). The dark themes keep their colours. On/off settings are tick boxes instead of sliding switches;
  All / Mine, Insights' periods and the chore form's choices (Every / On / Monthly, Everyone / Specific people, First
  come / Shared / Rotating / Custom) are rows of joined buttons. Headings are ordinary bold text instead of small
  capitals, Settings rows no longer end in ›, and no text is smaller than 12px (the bottom tabs' labels, chart labels
  and many small notes got a little bigger).
- **Rooms are a grid of small tiles** (ENH-29). Each room is a tile with its icon, its health, how many chores it has
  and how many are due today ("6 chores · 3 due", or "all done"), and a bar, neediest first. Two tiles fit across a
  phone, so about six rooms show on the first screen instead of one. A room given to one person shows their picture on
  the icon. Chips at the top show All rooms, Mine, or one zone. The list of every chore inside each room's card is gone
  (open the room to see them). For parents, renaming, zones (🏷️), assigning and deleting moved under ✏️ Edit rooms,
  along with adding, renaming and deleting zones.
- **Today on a computer** (ENH-29). On wide screens the chore list stops at a comfortable width instead of stretching
  across the whole screen, and the mascot in the column on the right is a smaller picture beside its message.
- **The chore form, in groups** (ENH-28, second half). Add Task and ✏️ Edit now open the same form, in groups: the
  name, notes and icon; When (Every, On, Monthly, One time, or On Demand); Who (Everyone, or tap the people, then First
  come, Shared, Rotating or Custom, with a line saying what each means); Effort & coins (the Coins box shows the
  effort's amount when it's left empty); and More options, folded, for steps, the timer, a start date, the season,
  health and pausing. More options says what's set inside it. Save stays at the bottom of the screen on a phone,
  however far you scroll, and on a computer the form opens as a panel beside the room's list. Add Task now also offers
  Allow early completion.
- **A room page you can take in at a glance** (ENH-28, first half). The big room banner is now a short summary: the
  room's health ring, "3 overdue · 2 left today · 9 fine for now" and the coins waiting there. Under it, chips filter
  the chores (All, Mine, Overdue, Paused), and the chores sit under Overdue, Today, This week, When needed and Paused;
  the ones due after this week are folded under "Show … more". The sort is the last chip ("When it's due" keeps the
  sections; any other order shows one list). The ← back button moved into the top bar next to the room's name, and
  Duplicate room is under ⋯ in the summary. On a phone the first chore now starts about 280px down instead of 610px.
- **Settings is a short index** (ENH-27). Instead of one very long page (about fifteen phone screens), Settings is a
  list of its sections in five groups (Household, Chores & coins, Game extras, Data, Help), each with a one-line
  summary such as "Notifications: Off" or "1 waiting for your OK". On a phone each section opens on its own page with
  a ‹ Settings button to go back; on a computer the list stays on the left with the section beside it. A search box
  finds a section by name or by a setting inside it ("strict" finds General), and a number shows next to Approvals
  and the Rewards Catalog when something is waiting. Notifications and Vacation Mode now have their own sections
  (they used to sit inside General), and the guide, troubleshooting and setup wizard links moved to Help at the bottom.
  Nothing else was renamed, so "Settings → …" in the guide still points to the right place.
- **A bar of tabs along the bottom on phones** (ENH-24, the first step of the new look). The ☰ menu button and the
  slide-out menu are gone from phones. Parents get Home, Rooms, Rewards, Board and More along the bottom of the
  screen; kids get Home, Rewards, Board, Badges and More. More holds the rest (Tasks, Calendar, Activity, Insights,
  Achievements, Settings, and Rooms for kids) with your profile at the top. A line over a tab shows where you are,
  and tapping that tab again jumps back to the top of the page. With Gamification switched off the tabs are Home,
  Rooms, Tasks, Calendar and More. Computers and wide tablets keep the menu on the left.
- **The top of each page is one line on phones.** It shows the page's name (on Home: your picture, a hello and the
  date), your coins, your streak and the search button. Parents also get a + next to it on Rooms (Add Room) and inside a
  room (Add Task), so the separate Add Room button is gone from phones. The points chip and the small line
  under the page name are hidden on phones; your points are still on the Board.
- **The seasonal garland is a thin strip across the top on phones**, so it no longer pushes the page down.
- Undo, "waiting for approval" and other pop-up notes now sit just above the bottom bar instead of under it.
- **Chores are short rows, the same everywhere** (ENH-25, the second step of the new look). On Home, on the Tasks
  page and in a room, a chore is now one row: its icon, its name (up to two lines), a line saying where, when or
  who (red when it's late), its coins, and a square ✓ button, which is Done. Rooms fit several times as many chores
  on a screen as the old tall cards did.
- **Tap a chore to open it.** The opened row shows the notes, how often it's due, the effort, whose turn it is, when
  it was last done and its health, with the less-used buttons underneath: Edit, Pin, Done earlier…, the timer, Team
  up, add a note or photo, Take back, Undo and ⋯ (Duplicate, Move to room, Pause). Everything a chore could do before
  is still there. Tap the row again to close it.
- **On Home, tapping a chore opens it there** instead of jumping to its room; Go to room in the opened row does
  that. Snooze for 3 days (Maybe you forgot) and Pin (Your usual) moved into the opened row too.
- **When ✓ is grey, the line under the chore's name says why** (Waiting for approval, Done by …, Not assigned…).
  A kid's chore with a timer shows ▶ in place of ✓ until the time is up.
- **Rooms have a Sort by list** (health, due date, name, how often, effort, coins, who) with a button that reverses
  the order. It replaces the column headings, and rooms look the same on computers as on phones.
- **Home is now Today** (ENH-26, the third step of the new look). It starts with one summary card: a ring showing how
  much of today is done, how many chores are left and overdue, the coins up for grabs, your level and the mascot.
  Under it, a row of chips (Rescue Mission, house health, the next holiday, double coins events, your streak, goals)
  that open when tapped, and one note when chores or rewards wait for a parent's OK, with a Review button.
- **Your chores in three lists:** Overdue, Today (finished ones stay there, ticked and crossed out) and Any time
  (anytime chores and Your usual). Mine / Everyone above them shows how many are left in each. Chores due in the next
  30 days are behind "Show N scheduled…", and the week's standings come last, with a link to the Board.
- **To-dos keep their own To-do list** on Today, overdue ones first, with "+ To-do" at its top. Hide it in Customise
  and the to-dos join the day's lists by their do-by date instead.
- **Kids get Next up:** one chore with a big Done! button and Pick another, then Today, Catch up, Already done and
  Bonus quests.
- **Snooze all** puts every overdue chore in the list away for 3 days, just for you, with Undo. A snoozed chore waits
  in the scheduled list with a Bring back now button. "Maybe you forgot" is now part of Overdue, and its switch in
  Settings → Features is called "Snooze overdue chores".
- **Customise on Today** moves the big blocks (approvals, team-ups, Next up, the chore lists, the To-do list, the
  standings) by dragging ≡ or with ▲▼, and shows or hides the smaller parts at the top. The summary stays on top.
  "Back to the start" resets both. An order saved on the old Home carries over, and anything you hid stays hidden.
- **Rooms, Recent Activity, the coin status card and the big holiday greeting left Home**: they have their own pages,
  and the holiday countdown is a chip. On computers, approvals, the mascot, house health and the standings sit in a
  column on the right.
- The first tab and the menu say Today, and "Show in Dashboard" on anytime chores is now "Show on Today".

### Fixed

- **New look, from testing on staging:** pages opened from the More tab now have a ← back button on phones; the
  chore editor no longer reaches the top of a phone screen, and pulling down inside a pop-up no longer reloads the
  page; the holiday garland lies over the Quest look's colour block instead of pushing it down; the small health
  rings (a room's page, House Health on Today) show a smaller, centred number; the helper's picture on a Rooms tile
  has a solid background.
- Settings no longer scrolls sideways on narrow phones (360px wide): the family member cards now wrap inside the
  page.

## v0.18.0 (2026-11-11)

### Added

- **A note when you reject a reward request** (ENH-23). Reject, on the Rewards page and on Home, now opens a small
  box for an optional one-line note, such as "Not on a school night, ask again on Friday". The kid gets it with their
  "wasn't approved" notification and sees it under the request in My redemption history; parents see it in Settings →
  Rewards Catalog → Reward requests. Leave the box empty to reject as before, or tap Cancel to change your mind.

### Changed

- **Chores pick up where they left off after a vacation** (BUG-45). When Vacation Mode ends, for the family or for
  one person, the days away no longer count as neglect: each chore is as clean or as dirty as it was the day the
  vacation began, instead of the whole house opening red. One person's vacation does this for the chores that are
  only theirs.
- **A vacation's Return date is the day you're back**: the vacation ends at the start of that day in the family's
  time zone, and the earliest date you can pick is tomorrow. The family's Return date used to end it the evening
  before in the Americas, and picking today ended it at once.
- **You stay signed in on the devices you use** (BUG-47). A login used to end 30 days after you signed in, however
  often you opened the app, so everyone had to sign in again about once a month. It's now renewed while you use the
  app, and only ends on a device that hasn't opened TidyQuest for 30 days.
- **An open app picks up a new version by itself** (BUG-48). After the server is updated, the app reloads the next
  time you come back to it or change page (never while you're typing), instead of showing a blank page until you
  closed it. Stopping or updating the server now lets what's in progress finish first.

### Fixed

- **"Waiting for a parent" no longer looks like an error** (FIX-33). With Strict Mode on, a kid's Done showed its
  "waiting for approval" message in the red banner the app uses for failures. It's now green with a ✅, and says
  "Sent! Waiting for a parent to approve." instead of "Completion submitted. Waiting for admin approval." (reworded
  in French, German, Spanish and Italian too).
- **"Earned a badge" messages arrive after a normal Done** (BUG-40). The pop-up in the app showed, but the kid and
  the parents only got the 🏆 message when a parent approved a chore. On a team-up, the person who tapped Done now
  gets theirs too.
- **A message that waited out quiet hours isn't sent when it's no longer true** (BUG-41). A 21:00 "Still not done"
  for a chore finished at 21:30 used to arrive at 07:00 anyway. Held messages are now checked again before they go
  out, and dropped when the chore got done, the day they were about is over ("due today", the morning list, the
  evening nudge, "for tomorrow", team-up messages), the team-up was called off, the double coins event has ended,
  the approval was already handled, or that kind was switched off meanwhile. A first reminder that's still waiting
  when the second one is due is replaced by it, instead of both arriving together.
- **Starter chores are named in the reader's language in notifications** (BUG-42). A French family saw "Faire la
  vaisselle" in the app and "Wash Dishes" in the morning list, reminders, nudges, Rescue Mission, approval, cheer,
  team-up and double coins messages. People with their own channel now get the chore's name in their language.
- **Evening reminders finish after midnight** (BUG-43). With a reminder at 20:00 the parents' "Still not done" (due
  at midnight) never came, and from 22:00 the second reminder didn't either.
- **Each person can turn the Rescue Mission message off for themselves** (BUG-43): it was missing from the list in
  Profile → My notifications and Settings → Who gets what.
- **No chore messages on vacation** (BUG-49). Someone on vacation no longer gets "due today", reminders, the morning
  list, the evening nudge or the Rescue Mission announcement, and the parents aren't told their chore is "still not
  done"; during Vacation Mode nobody gets them. The Rescue Mission isn't picked during Vacation Mode, and isn't a
  chore whose people are all away. Approvals, reward requests and the weekly recap still arrive.
- **A chore waiting for approval counts as done in notifications** (BUG-49). With Strict Mode, the kid no longer
  gets the second reminder and the evening nudge for it, and the parents no longer get "still not done" while the
  approval sits in their list.
- **Custom coins can be set when adding a chore to a room.** The room page's Add form has the same Custom coins box
  as Edit, so you no longer have to save the chore first and then edit it (FIX-29).
- **Small fixes around the app** (FIX-31):
  - A streak of 0 days no longer lights all seven bars on Home.
  - The ☆ button that adds a chore to Your usual is hidden on room pages when Your usual is switched off.
  - The Strict Mode "waiting for approval" message and other chore errors wrap on phones instead of being cut off.
  - Tapping your profile card in the menu on a phone closes the menu.
  - Changing the birthday month keeps a day that exists (March 31 → April 30), so the birthday badge still comes.
  - "Who did this task?" says "✓ Already done" instead of "Already done by" with no name.
  - Cancel on a goal's edit form throws away the changes.
  - The date on Home and Focus, and the week labels in Insights → Coins, follow the family's time zone, not the
    phone's.
- **Fewer English words in a French, German, Spanish, Italian or Dutch app** (FIX-32): the problems listed when
  loading a spreadsheet, the family channel's test message (now with a local time), "Goal reached" in Activity, the
  backup import messages, "Mode" in the chore forms, the "d" after streaks, prices and times on reward requests, the
  menu button's and pop-ups' screen-reader labels, and the errors in Settings for double coins events, reward rules
  and goals.
- **Loading a tasks spreadsheet that the save step refuses says which line**, instead of failing with a server
  error, and changes nothing.
- **A shared chore that two people finish a few minutes apart is one entry in Activity** (BUG-31). Shared chores
  were matched by the UTC date, so in the Americas two people finishing one in the late afternoon or evening could
  show as two entries, and one done just before midnight was merged with the next day's. They now follow the
  family's day, and so does who may see a shared chore's proof photo.
- **Shared chores pay each person once, and turn clean when everyone has done their part** (BUG-26). Two kids
  sharing a weekly chore who did it on different days left it overdue, and the first one could tap Done and get
  their share again every day. Each person's share now counts until the chore is due again, whichever day they did
  it, and someone who isn't on the chore doesn't count as one of its people.
- **Rotating chores keep track of whose turn it is** (BUG-27). Editing one (even just its notes) no longer hands the
  turn back to the first person, undoing a Done gives the turn back, and on a room page a parent can tap Done on a
  kid's turn, as on Home.
- **One chore can't be paid twice** (BUG-28). With Strict Mode, a chore that's waiting for a parent's approval can't
  be done again by someone else, and "Done earlier…" refuses a day when the chore had already been done since.
- **Taking back a waiting Done leaves the chore's due date alone** (BUG-46). With Strict Mode it could turn a chore
  into "never done", or make it look not due.
- **Streaks count the right days** (BUG-29):
  - With Strict Mode, a chore counts on the day it was done, not the day a parent approves it. Approving five days
    on Friday adds five days to the streak, not one.
  - A vacation keeps the streak after it ends, and doesn't use up a shield.
  - An Anytime quest no longer counts as "a chore was due", so a day with nothing scheduled can't break a streak.
- **One person's vacation ends by itself on its Return date** (BUG-30), like the family's. The Return date box in
  Settings → Family Members keeps the date you pick, and health never shows above 100% for chores done during a
  vacation.
- **Rescue Mission and Team-ups** (BUG-32): a new mission is picked when its chore is deleted, paused or finished
  for good, switching Team-ups off frees a chore a team had claimed, and Home Assistant's "Reset task" opens
  today's Rescue Mission again.
- **Small chore and room fixes** (BUG-33, BUG-46):
  - Every new chore on a room page starts dirty, not only the first one you add.
  - Home's Scheduled card says "Tomorrow" for a chore due tomorrow morning, also late in the evening.
  - Giving a room an owner leaves finished one-time chores and chores in the trash alone.
  - The chores spreadsheet has `one_time` and `do_by` columns, so open to-dos no longer come back as weekly chores.
  - A Do-by, Starts-on or Return date that doesn't exist (February 31) is refused instead of rolling into March.
- **Importing a backup can no longer leave a phone signed in as someone else** (BUG-21). Logins are tied to each
  person's place in the family, and a backup can put someone else in that place, so a kid's tablet could open a
  parent's account after an import. Anyone whose place changed is now signed out once and signs in again with
  their password. The parent who imports stays signed in, and the import is refused if the backup doesn't list
  them as an Admin. Nobody gets the importing parent's password any more.
- **A backup round trip keeps earned badges** (BUG-22), so their bonus coins aren't paid again and the badge
  notifications don't all go out a second time. Backups now also keep today's Rescue Mission, which reminders were
  sent and the notification log. The 8 starter rewards only go into a new family and no longer come back after
  you remove them all or import a backup without any.
- **Wrong passwords count when you change your password or sign-in email, or delete the family** (BUG-23). After 5
  wrong ones, it says to wait 15 minutes.
- **On tidyquest.org a parent's password always needs 8 characters**, also when adding a parent, in the setup
  wizard and when changing it in Profile or Family Members; a parent who was made from a kid changes a short one
  before adding a sign-in email (BUG-24). Everyone else needs 4, which adding a family member now checks too.
- **tidyquest.org account clean-ups** (BUG-25): a parent changed to member or child lets their sign-in email go
  (they still sign in with the family code), used and expired email links are deleted each day, and wrong
  sign-ins or "Forgot password?" requests no longer count as the family using TidyQuest.
- **A hiccup while the app opens no longer signs you out** (BUG-34). If the server was restarting or the Wi-Fi
  dropped at that moment, the app signed the person out and turned off that device's notifications. It now says
  "Can't reach TidyQuest", keeps you signed in, and tries again by itself every few seconds.
- **Double taps do one thing** (BUG-35): Buy and Chip in on Rewards, Adjust coins in Settings, Done in One thing at
  a time, adding chores and templates on a room page, Create on a double coins event, and Enter in "+ To-do" could
  each go through twice. Adding chores from templates no longer gets stuck on "..." when one fails.
- **Coins and reward requests keep up by themselves** (BUG-36). Your coin balance follows what others do (a parent's
  approval, a gift) within a few seconds, also after buying something for the mascot; a parent's Rewards page shows
  new requests without a reload; and Approve or Reject on a request someone else already decided says so and
  updates the list.
- **Home only offers Done where it works** (BUG-37). A shared chore with custom coins keeps its Done button for the
  second person, a Rotating chore says "Waiting for (name)" during someone else's turn (and stays out of One thing
  at a time), and Your usual shows when a chore is due again instead of a Done that fails. Refusals are in plain
  words, not codes like "not_your_turn".
- **Failures look like failures** (BUG-38). When "Who did this task?" can't record the chore, the box stays open and
  says why, instead of closing or flashing green. A chore form whose save is refused says so and stays open, and
  the Timer box stops at 240 minutes instead of Save silently doing nothing.
- **Cheers from others show up on Home while it's open** (BUG-39), not only after a reload.
- **Lowering a shared reward's price gives the extra back** (BUG-44). With 80 coins chipped in toward 100 and the
  price lowered to 60, the request was made for all 80 and 20 was never returned. The request is now for the new
  price and the coins over it go back, newest chip-ins first. The same when the new price comes from a spreadsheet.
- **Deleting a family member no longer strands other people's coins** (BUG-44). If their shared reward was still
  waiting for a parent, the others' chip-ins vanished with it; it is now turned down first, so everyone else gets
  their coins back. A reward only that person could see is hidden instead of suddenly showing for everyone
  (Settings → Rewards Catalog → Show brings it back).
- **Home's Leaderboard and Coins Status cards leave out parents who don't do chores** (BUG-44), as the Board page
  already did. A parent with "Participates in tasks" off shows in a period when they did a chore.
- **A username that differs only in capitals is refused** (BUG-44). Adding `Wyatt` when `wyatt` exists made an
  account that could never sign in, because signing in ignores capitals. Spaces typed around a new username or name
  are dropped.

## v0.17.2 (2026-11-09)

### Added

- **Phone notifications show a TidyQuest star in Android's status bar**, instead of the browser's own icon. From
  gjincy88 (#176).
- **The Home Assistant integration shows TidyQuest's icon** under Settings → Devices & services, on Home Assistant
  2026.3 or later. From gjincy88 (#176).

### Fixed

- **A parent saving someone's profile no longer wipes their photo** (#177). Changing a birthday, language or theme
  for someone in Settings replaced their uploaded photo with a letter avatar. Their photo now stays, and Photo is one
  of the choices there for anyone who has uploaded one. If it already happened, they can get it back from Profile →
  Photo → Save.
- **The notification kinds and time save with phone notifications alone** (#178). In Settings → General →
  Notifications, the only Save buttons were inside Telegram and ntfy, so with both off, unticked kinds came back
  after a reload. The kinds and the time now save as soon as you change them.

## v0.17.1 (2026-11-05)

### Fixed

- On Achievements, the row of team-up badges (Better Together, Dream Team, Unstoppable Crew) showed
  "badges.ladder_team_ups" instead of its name. It's now called "Team chores" in all six languages, and the hint for
  the next one says "5 more team chores" instead of "5 to go". A new test checks that every row of badges has a name,
  and that every piece of text the app asks for exists. (#175)

## v0.17.0 (2026-11-05)

### Added

- **A setup wizard for new families.** A parent whose family has no rooms yet lands in it after signing in (Not now
  skips it). Four quick steps: who's in the household (kids by age group 3–5, 6–8, 9–12 or 13+, whether they log in,
  and other grown-ups; a household without kids works too), which rooms you have (each kid also gets their own, and
  kids 6 and up a Quests room for daily routines and school things like homework, shown on Home), a ticked list of
  starter chores for each person picked by age, and rewards. Each person pays about the same number of weeks of
  their own chores, so everyone gets their own price. An optional weekly allowance adds "$1 / $5 cash" rewards, and
  each kid gets a repeating weekly goal with a bonus. Finish makes it all at once, then a 10-step click-through
  tutorial shows how to change a chore, make one come back every few months (like an air filter), use timers,
  anytime chores and taking turns, set up a Quests room, use the to-do list, and change rewards, goals and coins.
  Settings → Setup wizard runs it again later, for example for a new kid: it only adds. In all six languages, with
  a new part in the guide.

## v0.16.6 (2026-11-05)

### Fixed

- **The Rooms page no longer shows a chore in red before it can be done** (#172). A chore whose Done button is still
  locked (Allow early completion off) keeps a yellow chip on its room card, like its bar inside the room since
  v0.15.3. Red is for chores that are due.

## v0.16.5 (2026-11-05)

### Changed

- **The To-dos room is now a to-do list.** Its page is a checklist (earliest "Do by" date first, then the oldest
  added): tick one to finish it, and parents add more with "+ To-do", the same short form as on Home. Anything
  added there is a one-time to-do. On Rooms its card shows "3 to do · 1 overdue" instead of a health bar.
- **Nothing in the To-dos room counts toward room or house health,** the mascot's mood and "needs some love", the
  Tasks and Critical counts on Home, or Insights' late and skipped chores, even a repeating chore that ended up
  there.
- **A to-do without a "Do by" date is never overdue.** It used to turn Overdue a week after it was added. Undated
  to-dos are no longer picked for the Rescue Mission.
- The first "+ To-do" uses a room you already called "To-dos" instead of making a second one.
- The guide has a new "To-do list" part under Chores, and two troubleshooting entries.
- **A reward's Delete button is now inside Edit,** next to Cancel and Save, the same as chores, so it can't be tapped
  by accident. A deleted reward can still be brought back with Undo or from Recently deleted.

### Fixed

- **Back to Rooms takes you back to where you were** on the Rooms page, with the room you opened on screen, instead
  of the top. The phone's back button does the same; the menu's Rooms link still opens at the top.
- **Blank "Price per person" boxes say "usual"** (in Settings → Rewards Catalog → Rules) instead of a grey number that
  looked like a typed price, and people who have their own price show in orange.
- **Saving a reward's Rules closes the Rules box,** and the reward's line shows "own prices" when someone has one.
  Before, the box stayed open until you tapped Rules again.
- **Search shows a reward's current price** straight after it's changed in Settings, instead of the old one until the
  Rewards page was opened.
- **The Rewards page shows only the price you pay.** When you have your own price for a reward, the usual price is
  no longer shown crossed out next to it.
- **On phones, your profile card shows at the bottom of the side menu straight away.** Before, it sat under the
  browser's address bar and only appeared once you scrolled. The page behind the open menu no longer scrolls
  either, which hid the browser's toolbars and left a strip of page showing under the menu.
- **On phones, every button on a reward in Settings → Rewards Catalog fits.** The buttons now sit on their own line
  under the reward's name and share the card's width. Editing a reward puts the name, description and price one per
  line.

## v0.16.4 (2026-11-04)

### Fixed

- **Phone notifications say why they can't turn on, instead of "That didn't work".** Brave (which has push
  turned off until you switch it on) now gets the exact setting to change. Browsers without a push service (some
  built on Chromium) and private windows are named as such. A closed or quiet permission question says to tap
  Turn on again and choose Allow. The guide's troubleshooting has the same, and a new entry for computers where
  the test works but nothing appears.

## v0.16.3 (2026-11-04)

### Added

- **A `:dev` image for trying changes before they're released.** Every merge to `main`, and any branch built with
  `scripts/dev-build.sh`, is published as `ghcr.io/tidyquest/tidyquest:dev`. It's for test servers: a server
  people rely on should stay on `:latest` or a version number. (`:main` still follows `main`.)

### Fixed

- **Notifications turn off again.** In v0.16.2 the Notifications switch in Settings → General kept turning itself
  back on when ntfy or Telegram had been left switched on without a topic or bot (an older refused save could do
  that). A channel like that never sent anything, so it's now switched off along the way. Switching ntfy or
  Telegram off saves straight away, and if the Notifications switch can't save, the reason shows right under it.

## v0.16.2 (2026-11-04)

### Fixed

- **Notifications can be turned on with phone notifications alone.** Settings → General → Notifications used to
  insist on Telegram or ntfy, and its switch only saved through their Save buttons, so with neither it went back to
  off. The switch now saves as soon as you flip it, and phone notifications count as a way to send.
- **A notification settings save that's turned down changes nothing.** Before, the Notifications switch could stay
  saved as on while the page showed the error.

## v0.16.1 (2026-11-04)

### Added

- **Phone notifications from the app itself (web push).** Everyone can get their notifications on their own phone
  or computer like any other app, without ntfy or Telegram: open **Profile → My notifications** on that device and
  tap **Turn on for this device**. It counts as the person's own channel, so messages come in their language,
  follow quiet hours and show in the Notification log. Parents see each person's devices under **Who gets what**
  and can remove one. Signing out on a device stops its notifications; **Log out of all devices** and a new password
  set by a parent stop all of that person's. It needs the app opened at an `https://` address, and on iPhone and
  iPad (iOS 16.4 or newer) TidyQuest added to the Home Screen first. Messages travel through the browser maker's
  push service, encrypted so only the device can read them. **Settings → Features → Phone notifications** switches
  it off for the family. Self-hosters: the server makes its signing keys on first use and keeps them in the data
  folder (`vapid-keys.json`); back it up with the database, or set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

## v0.16.0 (2026-11-04)

### Added

- **Hosted service: restore a deleted family.** The operator page has a **Restore** button on deleted families for
  the 30 days their folder is kept. The family comes back as it was: same status, family code and parents' sign-in
  emails. If a new sign-up took an email or the code in the meantime, that one is skipped (the family gets a new
  code) and the page says so. A family that one of the automatic clean-ups deleted gets that clean-up's warning
  email again, with the usual notice, before it can be deleted again. Deleted families now show their parents'
  emails on the operator page, so you can find one by the address a parent writes from.

## v0.15.6 (2026-11-04)

### Added

- **Family members who don't log in.** In Settings → Family Members, switch off **Can log in** when adding someone
  (a grandparent, a toddler) and they need no username or password. A parent ticks off their chores with "who did
  it?" (approved straight away, even in Strict Mode) and buys their rewards. They don't appear on the login screen,
  get no notifications, and can't be invited to a team-up. The same switch is on every member's and child's card:
  turning it off signs them out everywhere, and turning it back on asks for a new password. Parents always log in.
- **Buy a reward for someone else.** Parents pick a person under **Buying for** at the top of Rewards. The shop then
  shows that person's coins, prices and limits, and the purchase is paid with their coins and counts as handed over.
- Reward purchases now show in Activity (each person sees their own, parents see everyone's), with "bought by …"
  when a parent bought it for them. Insights' Recent rewards says who bought it too.

### Fixed

- A price a parent gives one person (Settings → Rewards Catalog → Rules) now shows on that person's Rewards page
  even if it was already open: the page refreshes every 15 seconds and when the app comes back to the front.
  Before, a page left open (or the home-screen app reopened on Rewards) kept the old price.
- Buying a reward never charges a different price than the one shown. If the price changed after the page loaded,
  the buy box shows the new price and asks again. A purchase that fails now says why instead of doing nothing.

## v0.15.5 (2026-11-04)

### Fixed

- The mascot's 🐾 cheer now shows only on chores of 3★ effort or more, in Activity and Home's "Completed today",
  the same rule as its cookie-and-hop cheer. Smaller chores no longer get a paw.

## v0.15.4 (2026-11-03)

### Added
- **Privacy basics for tidyquest.org** (hosted mode). With `TERMS_URL` and `PRIVACY_URL` set:
  - The sign-up box now says "I'm 18 or over and the parent or guardian of any children I add. I agree to the Terms
    and the Privacy policy", and the server keeps when it was ticked and which versions (`TERMS_VERSION`,
    `PRIVACY_VERSION`) were agreed to.
  - Other parents and members see the terms and the privacy policy the first time they sign in and tap *Agree and
    continue*, and again when either version changes. Children never do.
  - *Privacy policy · Terms* links under the login and sign-up pages, in Settings under Version, and where a parent
    adds a family member.
- **Parental consent** (hosted): until a parent confirms their email, only parents can sign in; kids and members are
  told a parent has to confirm first. The confirmation email carries the notice the US children's privacy law (COPPA)
  asks for, and a second email follows once it's confirmed. A family that never confirms is reminded a week before
  day 30, then deleted.
- **Delete our family** (hosted): Settings → Data & Privacy. A parent downloads the data if they like, types the
  family's name and their password, and the family is deleted for everyone at once. Parents with a confirmed email get
  an email about it. It's kept 30 days in case of a mistake, like a family the operator deletes.
- **News emails** (hosted): an unticked "Send me TidyQuest news" box at sign-up and a switch under Settings → Sign-in
  email. The operator page sends them, each with a one-click unsubscribe link and the postal address (`POSTAL_ADDRESS`).
- **Clean-up** (hosted): a family nobody has used for a year gets an email, and is deleted 30 days later unless someone
  signs in. Waitlist entries go after a year. Once a deleted family is gone for good, its name and emails leave the
  operator History too.
- `RELEASING.md` has a section on releasing to the hosted service: new settings, a quiet hour, a snapshot first, and
  what to check after.
- TidyQuest can go on a phone's home screen like a real app: it opens full screen with its own icon, on iPhone,
  iPad and Android. On Android this needs a secure (https://) address; over plain http:// it's a browser shortcut.
  Added it to a home screen before? Remove the icon and add it again.
- A new guide section, *On your phone* (Settings → Guide & help), with the steps for iPhone, iPad and Android, a
  step for it in *Getting started*, and troubleshooting entries for when it doesn't work.
- 32 more icons for chores: dishwasher, grill, coffee maker, wiping the table, bins to the curb, boxes, baseboards,
  ceiling fan, stairs, front door, a 10-minute tidy, gutters, water heater, pressure washer, paint, fireplace,
  thermostat, hedge trimming, leaf blower, vegetable garden, chickens, bird, small pet, reptile, horse, baby,
  medicine, music practice, sports, bath time, morning routine and screen time. The baby, medicine, music, sports and
  bath icons are in a new *Family* group. A new chore's name suggests them in all six languages.

### Changed
- Every photo is redrawn in the browser before it uploads, so it no longer carries where and with what it was taken.
  A photo the browser can't read (some HEIC photos) is refused with a message saying so, instead of going up as it
  was. The server also strips that information from JPEG, PNG and WebP photos; in hosted mode it takes only those.
- A chore's proof photos are deleted when it leaves Recently deleted, or at once when its room is deleted. Who did
  it, when, and the coins stay. Removing a person deletes their avatar photo too.
- On tidyquest.org only a parent sets where anyone's notifications go (an ntfy topic or Telegram chat); everyone
  still picks which kinds they get in Profile.
- On tidyquest.org, Settings → Data & Privacy no longer says "All data stays on your server": it links to the privacy
  policy instead.
- On a phone's home screen, the status bar takes the color of the theme you picked.


### Fixed
- On a phone, the × that closes the side menu no longer sits off the menu's edge: it has room and a bigger tap target,
  and the desktop-only "collapse" button no longer shows there. Its label is translated (#155).
- How to set up Home Assistant notifications is now explained, in the README and in the guide (Settings → Guide &
  help → Notifications), with a troubleshooting entry for when the test fails (#156).

## v0.15.3 (2026-11-03)

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
- The bug report form asks you to type your version instead of offering a list that stopped at v0.5.0 (#150).
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
