/**
 * The in-app guide (Settings → Guide & help → /guide). English is here; each other language is a GUIDE_<LANG>
 * array in guide.<lang>.ts with the same sections and blocks. A guide change goes into all six
 * (check them with devtools/guide_check.mjs).
 */
export type GuideBlock =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  /** Where to find it, e.g. "Settings → Features" */
  | { where: string }
  | { tip: string }
  /** A how-it-connects chain, read top to bottom */
  | { flow: Array<{ title: string; text: string }> }
  /** Troubleshooting: what you see, then why and what to do */
  | { qa: Array<{ q: string; a: string[] }> }
  | { h: string };

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  /** Mostly for parents (shown with a tag) */
  parents?: boolean;
  blocks: GuideBlock[];
}

export const GUIDE_EN: GuideSection[] = [
  {
    id: 'start',
    icon: '🚀',
    title: 'Getting started',
    parents: true,
    blocks: [
      { p: 'TidyQuest turns housework into a game: chores earn coins, coins buy rewards, and levels, badges and a family mascot keep everyone going. Here is the order that works best for setting it up.' },
      { ol: [
        'Install it (see "Installing and updating"), open it in a browser and sign up. The first person to sign up becomes a parent (admin).',
        'Add everyone in Settings → Family Members: a name, a login and a role (see "People and roles"). Set each kid’s Task view and Kid mode there too.',
        'Put TidyQuest on everyone’s phone or tablet so it opens like an app (see "On your phone").',
        'Make your rooms on the Rooms page. A room type adds suggested chores you can untick. Give a room to one person ("assigned to") to make it theirs, like a bedroom.',
        'Add or adjust chores in each room: how often, effort or coins, who can do it, and an icon (see "Chores").',
        'Set the coin values in Settings → Coins per effort, then build the Rewards Catalog with prices kids can reach (see "Coins, rewards and goals").',
        'Give each kid a weekly goal in Settings → Goals by member, with a bonus for reaching it. The same section has the family team goal shown on the Board.',
        'Turn on Strict Mode in Settings → General if a parent should approve kids’ chores before the coins count.',
        'Set up notifications (see "Notifications"): a family channel, then each person’s own phone if you like.',
        'Look through Settings → Features and switch off any extras you don’t want (Rescue Mission, mascot, team-ups, holidays…).',
        'Download a backup in Settings → Data & Privacy once everything is set up, and now and then after that.',
      ] },
      { tip: 'Start small: a handful of chores per kid and a few cheap rewards they can earn in the first week. You can add more any time.' },
      { tip: 'Settings is a short list in groups (Household, Chores & coins, Game extras, Data, Help): tap a row to open it, and on a computer the list stays on the left. Type in Search settings to find one by name, like “strict”. A number next to Approvals or Rewards Catalog means something is waiting for you.' },
      { h: 'The setup wizard' },
      { ul: [
        'A parent of a new family (no rooms yet) lands in it after signing in. Not now skips it, and Settings → Setup wizard (under Help) opens it any time.',
        'Family: add kids by age group (3–5, 6–8, 9–12, 13+) and other grown-ups. Kids are optional, so couples and roommates can use it too. A kid can log in on their own (Kid mode makes the app simpler) or not log in, and a parent does it for them. Ages only pick the starter chores and aren’t saved.',
        'Home: tick your rooms. Each kid also gets their own room, and kids 6 and up can get a Quests room for daily routines and school things (homework, out the door on time, reading), as anytime chores shown on Home.',
        'Chores: a ticked starter list for each person, picked by age, with More ideas for extras. A chore several kids can do is shared: whoever does it first gets the coins. Chores no kid is old enough for go to the grown-ups.',
        'Rewards: everyone pays about the same weeks of their own chores, so each person gets their own price (“own prices”). An optional weekly allowance adds cash rewards priced to match it. Weekly goals repeat at about 70% of each person’s chores, with a bonus for reaching them.',
        'Finish makes everything at once. A short click-through tutorial then shows how to change a chore, how often it comes back (like every 3 months), timers, anytime chores, sharing and taking turns, Quests rooms, the to-do list, rewards, goals and coins.',
        'Running it again only adds: it uses the rooms you already have, skips chores they already have, starts grown-up chores and rewards unticked, and leaves your rewards alone.',
      ] },
      { h: 'What’s new after an update' },
      { ul: [
        'After a big update (like the new look), each person gets a few slides about what moved the first time they open the app: Next and Back to go through them, Skip to close. Small updates show nothing.',
        'Each person sees them once, on whichever phone or computer they open first. Skipping counts as seen. Parents also get the parts about Settings; kids in Kid mode get a shorter set with bigger pictures.',
        'They wait while a chore timer runs, and don’t open over One thing at a time or the setup wizard. Someone who joins after the update, or a family that has just used the setup wizard, doesn’t get them.',
        'To see them again: Settings → Guide & help (under Help) → 📣 See what’s new again. A parent can switch them off for the family in Settings → Features → 📣 What’s new after updates.',
      ] },
    ],
  },
  {
    id: 'phone',
    icon: '📱',
    title: 'On your phone',
    blocks: [
      { p: 'TidyQuest is a web app: there’s nothing to get from an app store. Add it to the home screen once and it opens like any other app, full screen with its own icon. Do it on every phone and tablet in the family, kids’ too.' },
      { h: 'iPhone and iPad' },
      { ol: [
        'Open your TidyQuest address in Safari: app.tidyquest.org, or your home server’s address.',
        'Tap Share (a square with an arrow pointing up). Don’t see it? Tap ⋯ next to the address bar first.',
        'Scroll down and tap Add to Home Screen.',
        'If there’s a switch to open it as a web app, leave it on. Tap Add.',
        'Open TidyQuest from the home screen and sign in once more: it keeps its own sign-in, apart from Safari’s.',
      ] },
      { tip: 'Chrome and Edge on an iPhone can do it too: tap Share in the address bar, then Add to Home Screen.' },
      { h: 'Android' },
      { ol: [
        'Open your TidyQuest address in Chrome: app.tidyquest.org, or your home server’s address.',
        'Tap ⋮ at the top right.',
        'Tap Add to home screen or Install app (the name depends on the Chrome version), then Install or Add.',
        'Open TidyQuest from the home screen: you’re still signed in.',
      ] },
      { tip: 'Samsung Internet: tap ☰ at the bottom, then Add page to → Home screen.' },
      { h: 'Good to know' },
      { ul: [
        'Updates arrive by themselves: after the server is updated, the app loads the new version the next time you open it or change page. If it still looks out of date, close it fully and open it again.',
        'Remove it like any other app: press and hold the icon. The family’s data stays on the server.',
        'To get notifications on this phone, open TidyQuest from the home screen, then Profile → My notifications → Turn on for this device. Messages can also come through ntfy, Telegram or Home Assistant (see "Notifications").',
      ] },
    ],
  },
  {
    id: 'connections',
    icon: '🔗',
    title: 'How it all connects',
    blocks: [
      { p: 'Almost everything starts with a chore being done. This is the chain, from tapping Done to the rewards at the end.' },
      { flow: [
        { title: '1. A chore comes due', text: 'Each chore has a schedule (every N days, set weekdays, or anytime). Its health drops from 100% to 0% over its interval; house health (the 🏠 chip on Today) is the average of all chores, weighted by effort.' },
        { title: '2. Someone taps Done', text: 'Alone, or as a team-up. With Strict Mode on, a kid’s chore waits for a parent to approve it; nothing below happens until then (except that the coins are already worked out).' },
        { title: '3. Coins are worked out', text: 'Custom coins if the chore has them, otherwise Coins per effort. Then the biggest multiplier that applies: a double coins event or today’s Rescue Mission (they don’t stack). Team-ups split the coins plus a team bonus; each share gets the multiplier.' },
        { title: '4. The coins go to work', text: 'They add to the person’s balance (to spend on rewards), their lifetime coins (levels and unlocks), their weekly goal (bonus when reached), the Board (ranks, awards, the family goal) and the family’s total (the mascot grows).' },
        { title: '5. Everything else updates', text: 'The chore’s health resets to 100%, streaks continue, badges are checked (and may pay bonus coins), the chore shows in Activity and as done on Today, and others can cheer it.' },
        { title: '6. Spending', text: 'A kid requests a reward and a parent approves it; the price comes off their balance. Shared rewards fill a pot that several people chip into; when it’s full a parent approves it, and a rejection gives everyone their coins back.' },
      ] },
      { h: 'Two kinds of coins' },
      { ul: [
        'Balance: what you can spend now. It goes down when you buy a reward or chip into a pot.',
        'Lifetime coins earned: chores plus coins given by a parent. It never goes down and decides your level.',
      ] },
      { h: 'What happens by itself' },
      { ul: [
        'Each morning: today’s Rescue Mission is picked (the most-forgotten chore pays extra), and kids can get a "today’s chores" summary. Parents get a recap on Sundays (about the week that just ended, if your week starts on Sunday).',
        'During the day: reminders for chores with a set time, then again 2 hours later, then a note to a parent.',
        'Evening: nudges about what’s still undone, a streak about to break, or a goal that’s close.',
        'The first day of the week (Monday, or Sunday if a parent picks it in Settings → General → Week starts on): a new week starts and weekly goals that repeat set themselves up again. A goal’s bonus is paid the moment it’s reached.',
        'Midnight: team-up invites end, and the done chores on Today start over.',
        'All of this follows the family’s clock: midnight and the first day of the week where you live (Settings → General → Time zone). A parent on a trip still sees home days.',
      ] },
    ],
  },
  {
    id: 'people',
    icon: '👨‍👩‍👧‍👦',
    title: 'People and roles',
    parents: true,
    blocks: [
      { where: 'Settings → Family Members' },
      { ul: [
        'Parent (admin): can change everything, approves chores and rewards under Strict Mode, and counts as a "helper" when teaming up with a kid.',
        'Member: an older kid or another adult. Doesn’t need approval and can mark chores done for others.',
        'Child: earns coins; under Strict Mode their chores wait for a parent.',
      ] },
      { h: 'Per-person settings' },
      { ul: [
        'Participates in tasks: off for a parent who only manages. They still earn coins for any chore they do, but appear on the Board only in a period when they did one, and can’t have goals. Each admin can also switch it for themselves.',
        'Task view: All (they choose), Starts on Mine, or Only theirs (locked).',
        'Kid mode: bigger buttons, fewer cards, coins and goal up front.',
        'Theme and holiday colors follow the person to every device (they can change them in Profile).',
        'Vacation per member: protects their streak and freezes their chores’ health while away. With a Return date it ends by itself that morning.',
        'Adjust coins (Manage member): add or take away coins with a reason. The number is a change, not a new balance: 10 adds 10, -10 takes 10 away. Works for parents too, including yourself. Details in "Coins, rewards and goals" → Adjusting coins.',
        'Password: a parent can set a new one if someone forgets theirs. That signs the person out on every device, so they log in again with the new one.',
      ] },
      { tip: 'Turn on "Hide other people’s private rooms from kids" in Settings → General if kids shouldn’t see, say, a parent’s own room.' },
      { h: 'The family’s look' },
      { where: 'Settings → Look (parents only)' },
      { ul: [
        'One look for the whole family: Fresh (the default: a softly tinted summary card, light cards), Quest (a bold block of colour at the top, chunky buttons, every chore its own tile) or Calm (flat, thin outlines, colour used sparingly).',
        'The look sets the shapes; each person’s colour theme (Profile) fills them in, so every theme works with every look. The page lists everyone’s theme under the three choices.',
        'It changes on this device at once and on everyone else’s the next time their app refreshes. Backups keep it.',
      ] },
      { h: 'Someone who doesn’t log in' },
      { p: 'For a grandparent, a toddler or anyone who won’t use the app: add them and do everything for them, with no username or password.' },
      { ul: [
        'Add Member: switch off Can log in, type their name and tap Create.',
        'Can log in on a member’s card switches it for someone already added. Off signs them out on every device. Turning it back on asks for a new password, then shows the username they sign in with.',
        'Their chores: tick them off in the room or on the Tasks page and pick them in "who did it?". It counts as approved straight away, even under Strict Mode.',
        'Their rewards: on Rewards, pick them under Buying for (see "Coins, rewards and goals").',
        'Coins and streak shields work as for anyone, in Manage member.',
        'They get no notifications at all, on any channel. Their notification settings are kept for when they log in again.',
        'They’re not on the login screen and can’t be invited to a team-up. For a chore done together, pick everyone in "who did it?".',
        'Parents always log in, so this is only for members and children. On tidyquest.org they still count toward the 15 people.',
      ] },
      { h: 'Signing out everywhere' },
      { ul: [
        'Profile → Log out everywhere else: signs you out on every other phone, tablet and computer, and keeps you signed in on this one. Handy after using someone else’s device, or if someone may know your password.',
        'Settings → Family Members → Manage member → Log out of all devices: signs that person out everywhere, e.g. when a tablet is lost. They log back in with their password.',
        'A new password signs the person out everywhere too. Changing your own in Profile keeps you signed in on that device; when a parent resets a kid’s password, the kid’s tablet is signed out as well and needs the new one.',
      ] },
      { h: 'On tidyquest.org: signing in' },
      { ul: [
        'This part is only on tidyquest.org (hosted). A home server has no family code or sign-in email.',
        'Parents sign in with their email and password. Everyone else signs in with the family code, their username and their password (parents can too).',
        'Settings → 🔑 Family code shows the code (like sunny-otter-42), the family link and a QR code. Open the link or scan the code on a kid’s phone or tablet: it remembers the family, so they only type their username and password. Capitals, spaces and dashes in the code don’t matter.',
        'New code gives the family a fresh code. The old code and link stop working; everyone who’s signed in stays signed in.',
        'Settings → ✉️ Sign-in email: Change email sends a link to the new address, and the change happens when you open it. A second parent can Add email to sign in with their own. A parent’s password needs at least 8 characters to sign in with an email. A parent changed to member or child loses their sign-in email and signs in with the family code instead.',
        'At sign-up we email a link to confirm your address. Opening it is also how a parent agrees, for their children, to what TidyQuest keeps (the US children’s privacy law, COPPA, asks for this). Until a parent has confirmed, only parents can sign in. A family that hasn’t confirmed a parent’s email within 30 days is deleted; we send a reminder a week before.',
        'Forgot password? on the login screen emails a parent a link that works once, for one hour. Kids and teens ask a parent to set a new one in Settings → Family Members.',
      ] },
      { p: 'When new sign-ups on tidyquest.org are closed, the sign-up page is a waitlist form instead. Another family can leave their details there, and we email them when there’s room. Families already signed up aren’t affected.' },
      { h: 'On tidyquest.org: privacy' },
      { ul: [
        'Privacy policy and Terms links are under the login and sign-up pages, and in Settings under Version.',
        'Other parents and members see the terms and the privacy policy the first time they sign in, and tap Agree and continue. Children never do. When either changes, the adults are asked again.',
        'Only a parent sets where anyone’s notifications go (an ntfy topic or Telegram chat). Everyone still picks which kinds they get in Profile.',
        'Settings → ✉️ Sign-in email → Send me TidyQuest news: news now and then, only if a parent ticks it (at sign-up or here). Every news email has a link to stop them.',
        'A family nobody has used for a year gets an email, and is deleted 30 days later unless someone signs in.',
      ] },
      { h: 'On tidyquest.org: limits' },
      { ul: [
        'A family can have up to 15 people.',
        'A proof photo can be up to 5 MB (an avatar 2 MB), and a family has 200 MB for its photos. A backup to import can be up to 5 MB.',
        'Proof photos start off: a parent can turn them on in Settings → Features → Proof photos.',
        'If TidyQuest pauses a family, or its free trial ends, the app shows a page about it instead. Parents can still tap Download our data there.',
      ] },
    ],
  },
  {
    id: 'rooms',
    icon: '🏠',
    title: 'Rooms and zones',
    parents: true,
    blocks: [
      { p: 'Rooms hold chores. A room assigned to one person is theirs: only they (and parents/members) can do its chores, and it never takes part in team-ups.' },
      { ul: [
        'Create a room on the Rooms page; a room type adds suggested chores you can pick from.',
        'The Rooms page shows a tile per room, neediest first: its health, how many chores it has and how many are due today. Zones group the tiles (for example "Upstairs" or "Parents’ Quests"); tap a zone’s chip at the top to see only its rooms, or Mine for yours. Parents tap ✏️ Edit rooms to rename a room, move it to a zone (🏷️), assign it to someone or delete it, and to add, rename or delete zones.',
        'A room’s health is the average of its chores; the worst room is the one the mascot asks for help with.',
        'A chore’s bar turns red only once it’s due. A chore that can’t be done yet (Allow early completion off) stops at yellow in its room.',
      ] },
    ],
  },
  {
    id: 'chores',
    icon: '🧽',
    title: 'Chores',
    parents: true,
    blocks: [
      { where: 'Rooms → a room → Add Task, or the ✏️ on a chore' },
      { h: 'The chore form' },
      { p: 'Add Task and ✏️ Edit open the same form: a sheet from the bottom on a phone, a panel beside the list on a computer. It comes in groups: the name, notes and icon; When (Every, On, Monthly or One time, or On Demand); Who (Everyone, or tap the people, then First come, Shared, Rotating or Custom); Effort & coins; and More options, folded, for steps, the timer, a start date, the season, health and pausing. More options lists what’s set in it, so nothing hides there. Save stays at the bottom however far you scroll; Delete Task is at the end of the form.' },
      { h: 'Schedule' },
      { ul: [
        'Every N days: due again N days after it was last done. Its health falls over those days.',
        'Set weekdays: due on chosen days of the week instead.',
        'Monthly: due on a day of the month (29–31 fall on the last day of shorter months, and "Last day" is always the last) or on the first, second, third, fourth or last weekday, like the first Saturday. It doesn’t drift when it’s done late.',
        'Starts on (📅): for any repeating chore. Nothing is due before that day, and it’s first due on it (with set weekdays or Monthly: on the first scheduled day from it). Until then it counts as clean, and the room shows “Starts …”. Once it’s been done on or after that day, the date no longer matters.',
        'Only in season: only due between two months (outside them it doesn’t count toward house health).',
        'On demand (anytime): no schedule; it can be done whenever. Turn on "Show on Today" to list it under Any time on Today, and set a repeat limit (per day or week) if it could be farmed.',
        'One-time (to-do): done once, then it’s gone from the lists (it stays in Activity). Optional "Do by" date. To-dos have their own To-do list on Today, overdue ones first; if you hide that list in Customise, they sit in the day’s lists instead (under Today on their date, Overdue after it, Any time without one). Quick-add one with "+ To-do" on Today.',
        'Allow early completion: lets a chore be redone on any new calendar day, even before it’s due (useful for daily routines).',
        'Remind at: a reminder at a set time on the day (or the evening before).',
      ] },
      { h: 'Coins' },
      { ul: [
        'Effort (1–5) sets the coins from Settings → Coins per effort. Custom coins override that for one chore: fill in the Coins box under Effort & coins when you add the chore or edit it, or leave it empty for the amount from the effort.',
        'Rescue Mission and double coins events multiply them on the day.',
      ] },
      { h: 'Who can do it' },
      { ul: [
        'Nobody assigned: anyone. The first person to finish it gets the coins ("first one wins").',
        'Assigned to some people: only they can do it.',
        'Shared: each assignee does their part and gets an even share. The chore turns clean once everyone has done their part, on whichever days. Until it’s due again, each person can do theirs once.',
        'Custom split: each assignee gets a set percentage.',
        'Rotating: turn by turn, per completion or per calendar week.',
      ] },
      { h: 'Icon' },
      { p: 'Tap the icon button to open the picker. It shows a live preview of the chore, suggests an icon from the chore’s name, and has a search and every icon grouped by area. A new chore left on the ✨ gets the suggested icon automatically.' },
      { h: 'Timer' },
      { ul: [
        'Timer (minutes) in the chore editor gives a chore a countdown, for example 10 minutes to tidy a room. Leave it empty for no timer. The chore’s name doesn’t matter.',
        'The chore then has a ▶ 10 min button: tap the chore to open it and it’s with the other buttons (for a kid who has to run the timer first, it sits in place of ✓). Tap it for a big countdown with Pause and +5 min. Tap ⌄ to hide it: a small timer bar stays at the top of every page, and the timer keeps going after a reload.',
        'At zero it chimes and vibrates, then asks “Time’s up! Done?”. Done finishes the chore as usual (with Strict Mode it still waits for a parent). “Need more time” adds 5 minutes.',
        'Kids start the timer first: on a timer chore, their Done button comes back when the time is up. Parents and members can tap Done any time.',
        'The Tasks page lists every chore with a timer: pick “⏱️ Has a timer” in its filter.',
      ] },
      { h: 'Steps' },
      { p: 'Steps (one per line) list what a chore involves, like “Feet on the floor”, “Lights on”, “Put on the clothes”. They show as tick boxes in One thing at a time. The ticks are only a help: Done still finishes the chore.' },
      { h: 'Finishing a chore' },
      { ul: [
        'Every chore is one row, the same on Today and in its room: its icon, its name, a line saying where, when or who (red when it’s late), its coins and a square ✓ button. That ✓ is Done: tap it when the chore is finished.',
        'Tap the row itself to open it: the notes, how often it’s due, the effort, whose turn it is and when it was last done, plus the less-used buttons (Edit, Pin, 📅 Done earlier…, 🤝 Team up, 📎 and ⋯). Tap it again to close it. On Today, Go to room opens the chore in its room; the Tasks page lists every chore, and a tap opens it in its room.',
        'A room opens with a short summary (its health, how many chores are overdue or left today, and the coins waiting), then its chores under Overdue, Today, This week, When needed and Paused; “Show … more · later” opens the ones due after this week. The chips All, Mine, Overdue and Paused narrow the list. The last chip, When it’s due, is the sort: pick another order (health, name, coins…) to see one list, and the arrow next to it reverses it. ← goes back to the rooms; parents find Duplicate room under ⋯ in the summary.',
        'The 📎 button in the opened chore adds a note or photo as proof.',
        'After a parent approves, the note and photo stay with the chore in Activity (tap the photo to see it full size). Parents see everyone’s; everyone else sees only their own. A photo’s link doesn’t open for anyone else, or after logging out. Undoing or rejecting the chore deletes its photo.',
        'Parents and members can mark a chore done for someone else ("who did it?").',
        'A mistake can be undone from Activity (parents), or with ↩️ Undo next to the chore’s "Done by" in its room (parents; it asks first, because the coins come back off). A team-up is undone for the whole team, and everyone’s coins for it are taken back. A kid can take back their own Done while it waits for approval.',
      ] },
      { p: 'Settings → Features → Proof photos switches photos off; the 📎 button then adds a note only. On tidyquest.org photos start off, and a parent turns them on.' },
      { h: 'Logging it late' },
      { ul: [
        'Forgot to tap Done? Open the chore in its room (tap it), tap 📅 Done earlier…, pick the day (up to 7 days back) and tap Log it. Parents and members can pick who did it.',
        'It counts on that day: for streaks, the weekly goal, the Board and the Calendar. If it fills the day that broke a streak, the streak comes back. A goal whose week has ended still pays its bonus once the coins reach it.',
        'It pays the chore’s usual coins, without double coins or the Rescue Mission. Everyone but parents waits for a parent’s approval, even with Strict Mode off. Activity and the approval list mark it 🕘 Logged late.',
        'It can’t go on a day the chore was already done (with First come, first served, by anyone), before the chore was added or its start date, or on a day it wasn’t due yet.',
      ] },
      { h: 'Pausing a chore' },
      { ul: [
        'Not needed for a while (the pool in winter, a kid away at camp)? Parents open the chore in its room (tap it), tap ⋯ (More options), then ⏸️ Pause. Or open Edit, open More options, switch on ⏸️ Paused and pick a day under Back on (optional) so it switches back on by itself.',
        'A paused chore leaves Today, the Tasks page, the Calendar, reminders, the Rescue Mission, team-ups and house health. Parents still see it greyed in its room, marked ⏸️ Paused; kids don’t see it at all.',
        'Open the chore and tap ⋯ → ▶️ Switch back on (or untick ⏸️ Paused). It comes back as if just done, so it isn’t overdue. Its history, coins and who it’s assigned to stay the same.',
      ] },
      { h: 'To-do list' },
      { ul: [
        'The first time a parent taps "+ To-do" on Today, a room called To-dos is made by itself. There’s one per family. Renaming it is fine; if you delete it, the next "+ To-do" makes a new one. A room you already called To-dos is used instead of making a second.',
        'Its page is a checklist: the earliest "Do by" date first, then the oldest added. Tick one to finish it (with its coins); it disappears and stays in Activity. Parents add more with "+ To-do" at the bottom and change one with Edit.',
        'Anything added to the To-dos room is a one-time to-do. Nothing in it counts toward room or house health, the mascot, the Tasks and Critical counts on Today or Insights, even a repeating chore moved there. On Rooms its card shows "3 to do · 1 overdue" instead of a health bar.',
        'A to-do is Overdue only once its "Do by" date has passed. Without a date it’s never overdue.',
        'To put a to-do in another room, add a chore there and pick One time.',
      ] },
    ],
  },
  {
    id: 'home',
    icon: '🏡',
    title: 'Today and the other pages',
    blocks: [
      { ul: [
        'Today: a summary card (a ring of what’s done out of everything due today, how many are left and overdue, coins up for grabs, your level and the mascot), chips (Rescue Mission, house health, the next holiday, double coins), the approvals for parents, then your chores under Overdue, Today and Any time, and the week’s standings. Mine / Everyone switches between your chores and the family’s. Kids get Next up, Today, Catch up, Already done and Bonus quests.',
        'Rooms: every room and its chores; tap a chore to open its room right at it. Tasks: every chore in one searchable list.',
        'House health: the 🏠 chip on Today (on a computer, the card on the right). Tap Rooms or Tasks to open that page, or Critical to see the chores under 30% health in the task list.',
        'Calendar: what’s due when, and what was done.',
        'Activity: everything that happened (chores, coin changes, chip-ins), with filters and cheers.',
        'Board: rankings by coins, goal % or most improved, awards like Early Bird and room champions, the trophy shelf and the family goal.',
        'Achievements: badges, your level and what’s next. Rewards: the catalog and your requests.',
        'Search: the 🔍 button, or press / or Ctrl+K on a keyboard.',
      ] },
      { h: 'Getting around' },
      { ul: [
        'On a phone the pages are along the bottom of the screen: Today, Rooms, Rewards, Board and More. Kids get Today, Rewards, Board, Badges and More. A line over a tab shows where you are; tap that tab again to go back to the top of the page.',
        'More has the rest: Tasks, Calendar, Activity, Insights (parents), Achievements and Settings, with your profile at the top. For kids, Rooms is under More too.',
        'The top of every page is one line: the page’s name (on Today, your picture, a hello and the date), your coins, your streak and the 🔍 search button. Parents also get a + next to it on Rooms (Add Room) and inside a room (Add Task). Tap your coins to open Rewards, your streak to open Achievements, and your picture to open your profile.',
        'On a computer, or a tablet held sideways, the pages are in the menu on the left, and the top of the page also shows your points.',
        'With Gamification off (Settings → General) the bottom bar is Today, Rooms, Tasks, Calendar and More.',
      ] },
      { h: 'Choose what Today shows' },
      { ul: [
        'Customise (at the bottom of Today) has two parts. Order on the page: the big blocks (Waiting for approval, Team-ups, Next up, the chore lists, the To-do list, the Leaderboard); drag ≡ or use ▲▼ to move one. Buttons at the top: the mascot, the chips, Your usual and more. 👁️ shows a part, 🚫 hides it (the chore lists can’t be hidden). Back to the start puts the order back and shows everything.',
        'What you hide is saved for you: it’s the same on every phone and computer you sign in on, and someone else on the same device has their own.',
        'In Kid mode, kids hide parts of their own Today too (the ones Kid mode shows).',
        'The summary stays at the top and the chips stay in one row; only the big blocks move. An order saved on the old Home carries over for the blocks that still exist; what you hid there stays hidden.',
      ] },
      { h: 'One thing at a time' },
      { ul: [
        'Today’s chores one at a time, big: the icon, name, coins and the steps as tick boxes, with Done, Skip for now, and ▶ when the chore has a timer.',
        'The order: your own chores due today, then the Rescue Mission, then up to 3 open chores (anyone’s) that are due. Skip for now moves a chore to the back of today’s line.',
        'Dots show how far you are (“3 of 7 today”), and an empty line gets a celebration.',
        'Parents choose per person in Settings → Family Members → One thing at a time: Off, Next up card on Today, or It is their Today page (then “Show all of Today” opens the usual Today page). The Next up card shows the first chore with Done! and Pick another; “One thing at a time ›” opens the full page. Kids get the card unless a parent changes it. Settings → Features switches it off for everyone.',
      ] },
    ],
  },
  {
    id: 'rewards',
    icon: '🎁',
    title: 'Coins, rewards and goals',
    blocks: [
      { where: 'Settings → Rewards Catalog, Goals by member, Coins per effort' },
      { h: 'Rewards' },
      { ul: [
        'Each reward has a price. Kids request it; a parent approves or turns it down. Reject opens a box for an optional one-line note (why not, or when to ask again). The kid gets it with their notification and sees it under the request in My redemption history; left empty, it rejects without one.',
        'Approved one by mistake? Reward requests (under the catalog) has Refund next to each approved reward: the coins go back (a shared pot to everyone who chipped in) and it shows as rejected.',
        'Rules per reward: a limit (per day, week, month or ever; per person or for everyone), a date window, Rotating (only a few show each week), who can see it, a different price per person, and a category. On the Rewards page each category is a button above the list (All shows everything), and your requests sit at the top under My redemption history.',
        'Shared saving: anyone can chip coins into a pot; when it’s full it goes to a parent. The chip-in box starts at 0, and each chip-in shows in Activity. A full pot can’t be cancelled from My requests ("Shared: a parent decides"): a parent turns it down and everyone gets their coins back. If a parent lowers the price below what’s already in the pot, the pot counts as full and the coins over the new price go back, newest chip-ins first.',
      ] },
      { h: 'Buying for someone else' },
      { p: 'Parents: at the top of Rewards, pick someone under Buying for. The shop then shows their coins, their prices and their limits, and what you buy is paid from their coins. It counts as handed over, so nobody has to approve it. Activity and Insights show it as theirs, bought by you. Handy for someone who doesn’t log in (see "People and roles"). Shared rewards (chip-in) work as before.' },
      { h: 'Hiding a reward' },
      { ul: [
        'Settings → Rewards Catalog: tap Hide next to a reward. Kids no longer see it; parents see it greyed at the end of the list, marked Hidden. Tap Show to bring it back.',
        'Requests already made still go through. A shared pot keeps its coins but takes no new chip-ins until the reward is shown again.',
      ] },
      { h: 'Goals' },
      { ul: [
        'Weekly goal per person: a coin target with an optional bonus when reached (paid automatically). "Repeats weekly" sets up next week’s goal by itself.',
        'Family team goal (in Goals by member): a weekly coin target for everyone together, with a prize, shown on the Board. Set it to 0 to turn it off.',
      ] },
      { h: 'Adjusting coins' },
      { p: 'Settings → Family Members → Manage member, next to their Balance. The box takes how many coins to add or take away, not the new balance.' },
      { ol: [
        'Type the change in the Adjust box: a plain number adds coins (15 gives 15), a minus sign takes them away (-15 removes 15).',
        'Add a reason if you like (up to 200 characters). They see it in their coin history and Activity, and in the notification they get if theirs are on.',
        'Tap Adjust. "+15 ✓" or "-15 ✓" confirms it, and the Balance updates.',
      ] },
      { ul: [
        'To set an exact balance, type the difference: Balance 71 and it should be 59 → type -12. Balance 40 and it should be 50 → type 10.',
        'A balance can’t go below 0. Taking away more than they have stops at 0, and only what was actually taken is recorded.',
        'Coins added count toward their lifetime coins (level and unlocks) like coins from chores. Taking coins away lowers the balance only; a level is never lost.',
        'Adjustments don’t count toward the weekly goal or the Board, which only count chores.',
      ] },
      { tip: 'Typed 12 when you meant -12? Adjust again with -24 to land where you wanted.' },
      { h: 'Coins from a parent' },
      { ul: [
        'Adjust coins (see above) gives or takes away coins by hand, with a reason.',
        'When approving a chore, ⭐💬 adds a note and an "above and beyond" bonus (+1, +2 or +5).',
        'Rejecting a chore shows "Rejected · Undo" for 5 seconds before it goes through. 💬 Add a reason pauses that and sends the kid one line on what’s missing (with their outcome notification).',
        'Double coins events (Settings → Double coins events): a multiplier for a time window, for everything, chosen rooms, or chosen chores. On Today, tap the event’s ⚡ chip to see every chore it covers that you can do, with its coins and whether it’s ready now; tap one to open it.',
      ] },
    ],
  },
  {
    id: 'extras',
    icon: '✨',
    title: 'Game extras',
    blocks: [
      { where: 'Settings → Features (each one can be switched off for the family)' },
      { ul: [
        'Rescue Mission: each day the most-forgotten chore pays extra (2× by default) to the first person who does it.',
        'Your usual: on Today, under Any time, the chores you do most (and ones you pin: open a chore and tap ☆ Pin). Overdue chores: open one and tap 💤 Snooze for 3 days, or tap Snooze all above the Overdue list (parents and members). It waits under "Show … scheduled" for 3 days, just for you; Undo on the message, or Bring back now on the chore, brings it straight back.',
        'To-dos: one-time chores, with "+ To-do" on Today.',
        'Board awards and trophy shelf. Levels and Next badge.',
        'Cheers: 👏 🎉 💪 ⭐ on anyone else’s finished chore (tap a done chore on Today, or in Activity). The same emoji again takes it back. The person gets a private notification.',
        'Team-ups: open a chore worth 6 or more coins and 🤝 Team up invites one person or anyone. Once someone joins, the chore is the team’s for the day. Either one taps Done; coins split evenly plus a team bonus (10, 20 or 30%). A parent with a kid is a helper and the kid keeps all the coins. Never on someone’s own room, one-person or rotating chores. Not up for it? "No thanks" turns an invite down: an invite just for you ends and the person who asked hears about it, so they can ask someone else; an invite for anyone just disappears for you. The person who started it can "Call off team-up" (it ends for everyone); anyone else can Leave.',
        'House mascot: one of 8 creatures, picked and named here. It grows with the family coins earned while it’s the active mascot (hatches at 500, then 2,000, 5,000 and 10,000), its mood follows house health, and it reacts to birthdays, the family goal and the Rescue Mission.',
        'Swapping mascots: picking a creature you haven’t had starts it as a new egg. Each creature keeps its own growth, name and outfit, so switching back brings it back exactly as it was. The tummy and bedtime are shared.',
        'Playing with the mascot: tap it for a reaction. Its 🍪 tummy fills 5% with every chore (a team-up counts once) and empties over 2 days. It cheers with a 🍪 and a hop only for bigger chores (3★ effort or more); smaller ones fill it quietly; when it’s low it just says it’s hungry. "What should I do?" suggests a chore you can do right now. It adds a 🐾 cheer to finished chores of 3★ or more. It sleeps during the family bedtime (set under the mascot in Features, 9 pm to 7 am by default).',
        'Mascot shop (its own tick box): anyone can buy it an accessory for 1 to 5 coins. There’s one shared outfit and no closet: a new item goes on right away for everyone and replaces whatever was in that spot (head, face, neck or back). Whoever bought an item, or a parent, can take it off for free. Purchases show in Activity. The shop opens once the mascot hatches. Turning the shop off hides it and the outfit.',
        'Seasonal styling: Halloween in October, Thanksgiving in November, Christmas in December: colors, decorations, a countdown and a costume for the mascot. Each holiday has its own tick box and a Preview button.',
      ] },
      { h: 'Streak shields' },
      { ul: [
        'A streak counts the days in a row with at least one chore. Every 7 days in a row earns a 🛡️ shield; you can hold 2. A chore that waits for a parent’s approval counts on the day it was done.',
        'Buy a shield from the 🔥 streak chip on Today (25 coins by default; parents set the price in Settings → Features).',
        'A missed day uses a shield by itself, just after midnight, and the streak carries on (the missed day doesn’t add to it). Two missed days need two shields; with too few, none are used and the streak starts again.',
        'A chore waiting for a parent’s approval counts for its day.',
        'Parents can give a shield (a sick day, a busy weekend) with 🛡️ Give a shield in Settings → Family Members. Bought, earned, given and used shields show in Activity.',
      ] },
      { h: 'Levels and unlocks' },
      { p: 'Levels come from lifetime coins (level 2 at 50, 5 at 500, 10 at 2,250). Each level unlocks something; pick them in Profile → Unlocks.' },
      { ul: [
        'Frames: bronze (2), silver (6), gold (9), rainbow (10). Crown and diamond badges unlock their own frames.',
        'Celebrations: falling coins (3), fireworks (8). Themes: Forest (4), Galaxy (7), Lava (10). The first 8 themes are free.',
        'Titles (5): your level’s title or any badge you’ve earned, shown on Today, the Board, the menu (on a phone, More) and Activity.',
      ] },
      { h: 'Badges' },
      { p: 'Built-in badges unlock by themselves. Parents can make their own in Settings → Badges (for example "Homework 4 weeks in a row"), with optional bonus coins, and set coins for every built-in badge.' },
    ],
  },
  {
    id: 'notifications',
    icon: '🔔',
    title: 'Notifications',
    parents: true,
    blocks: [
      { where: 'Settings → Notifications, then Who gets what, Timing & quiet hours and Notification log' },
      { ol: [
        'Turn notifications on and pick which kinds the family gets.',
        'Optionally set up a family channel (not needed if everyone uses phone notifications, see below): ntfy (a server URL and a topic everyone subscribes to in the ntfy app), Telegram (a bot token and a chat ID), or a Home Assistant notify service. Use the test button.',
        'Optionally give each person their own channel in "Who gets what": their own ntfy topic, Telegram chat, or Home Assistant phone. They then get messages in their own language, and can turn kinds off in Profile.',
        'Set quiet hours (messages wait and go out when they end) and whether kids’ messages wait during school hours on weekdays.',
      ] },
      { ul: [
        'Private kinds (approved/turned down, summaries, nudges, cheers) only go to a person’s own channel, never the family channel.',
        'The Notification log shows what was sent, queued or failed, and why.',
      ] },
      { p: 'On tidyquest.org, notifications go straight to phones (web push), or through ntfy.sh or Telegram. Your own ntfy server and Home Assistant only work on a home server.' },
      { ul: [
        'A message that waited out quiet hours only goes out if it still holds. It’s dropped when the chore got done meanwhile, the day it was about is over, the team-up or double coins event has ended, or that kind was switched off.',
        'Nobody on vacation gets chore messages (due today, reminders, the morning list, the evening nudge, Rescue Mission), and during Vacation Mode nobody does. Approvals, reward requests and the weekly recap still arrive.',
        'A chore that’s waiting for a parent’s approval counts as done: no more reminders about it. Due today and reminders for a chore nobody is assigned to (and whose room has no owner) only go to people with Chores anyone can do ticked; it starts off for kids, so they only hear about their own chores. Turn it on for a kid in Profile → My notifications, or in Who gets what.',
        'Starter chores are named in each reader’s own language (on their own channel).',
      ] },
      { h: 'Phone notifications (web push)' },
      { p: 'Everyone can get their notifications on their own phone or computer, straight from TidyQuest: no ntfy or Telegram needed. Each person turns it on themselves, on that device: Profile → My notifications → Turn on for this device. It counts as their own channel, so their messages come in their own language and no longer go to the family channel.' },
      { ul: [
        'It needs a secure (https://) address. On iPhone and iPad (iOS 16.4 or newer), add TidyQuest to the Home Screen first and turn it on from there (see "On your phone").',
        'Who gets what lists each person’s devices; Remove stops one. Log out stops that device, and Log out of all devices stops all of that person’s. Log out everywhere else and a new password keep only the device in your hand.',
        'Messages travel through the browser maker’s push service (Google, Apple, Mozilla or Microsoft), encrypted so only the device can read them.',
        'Settings → Features → Phone notifications (web push) switches it off for the whole family.',
      ] },
      { p: 'Someone with no channel of their own sees a card on Today after their first chore of the day: Turn on does the same as Profile → My notifications on that phone. Not now hides it for a week, and it comes back at most three times. Who gets what marks people who get nothing yet (no channel of their own and no family channel), so a parent can hand them the phone.' },
      { h: 'Home Assistant' },
      { p: 'If your family has the Home Assistant app on their phones, TidyQuest can send messages through it. This only works on a home server, not on tidyquest.org.' },
      { ol: [
        'In Home Assistant, open your profile (bottom left), then the Security tab. At the bottom, create a long-lived access token and copy it: Home Assistant shows it only once.',
        'In Settings → Notifications → Home Assistant, enter the Home Assistant URL as the TidyQuest server reaches it, e.g. http://homeassistant.local:8123 or http://192.168.1.20:8123, and paste the token.',
        'Optionally add a family notify service for messages everyone gets, e.g. notify.family (a notify group you made in Home Assistant). Then tap Save.',
        'In Who gets what, give each person their phone’s service: notify.mobile_app_ and the phone’s name, e.g. notify.mobile_app_alexs_phone. Home Assistant lists them in Developer tools → Actions (type notify.). A phone shows up there once the Home Assistant app is signed in on it.',
        'Tap Send test notification next to that person. “ha: ✓” means it arrived; otherwise the message says what went wrong.',
      ] },
    ],
  },
  {
    id: 'insights',
    icon: '📊',
    title: 'Insights for parents',
    parents: true,
    blocks: [
      { where: 'Insights in the menu; on a phone, under More (parents only)' },
      { ul: [
        'Chores done: bars for a day (by hour), a week or a month (by day), or a year (by month). ◀ ▶ steps back through earlier periods. Tap a bar for its numbers, or use Show as a table.',
        'To look further back, tap the date and pick any day from the calendar, or choose Custom for a From–To range; the bars then go by hour, day, week or month to fit. Busy and quiet times and Coins in and out end on the picked dates too. Back to today returns to now.',
        'Measure: Chores counts what was done, Coins what was actually paid (with double coins, the Rescue Mission and team bonuses), and Effort adds up the chores’ effort levels. A chore waiting for approval counts when it was done; its coins count once a parent approves it.',
        'Split by Person (in each person’s color), Room or Chore. Past 8 rooms or chores, the rest are grouped as Other. Tap an entry in the legend to hide or show it (by Room or Chore, that room or chore).',
        'Busy and quiet times: weekdays by time of day, averaged over the last 4 or 12 weeks. The strongest colors are when the most gets done; faint squares are bad times to push chores. Show numbers puts the averages in the squares. Chores logged late are left out, because their time of day isn’t known.',
        'Who does how much: each person’s share of the period, and the change from the period before (while a period is still running, up to the same point, like last week by now).',
        'Skipped and late (by chore, or rolled up by room): chores often done after their due day and by how many days; chores left overdue at the end of a day (recorded nightly from the day this version was installed); and First come, first served chores nobody grabbed, with how long they waited and which are waiting now.',
        'Coins in and out (last 8 or 26 weeks): coins in above the line (chores, bonuses) and out below (rewards, chip-ins, the Mascot shop, streak shields, coins taken off), the balance at the end of each week, and the weekly goal as a mark across the bar (it counts chore coins only). With one person shown you see their goal; with more, a table shows each one’s totals. Underneath: the rewards bought most (tap one to see who bought it, how many times and for how many coins), Recent rewards (each one in those weeks, newest first, with the day and who paid; a shared reward lists everyone who chipped in, with their share, and ⏳ waiting means a parent hasn’t approved it yet), and the ones never bought. Refunded, cancelled and turned-down rewards aren’t counted.',
        'The name chips under the filters pick who’s shown on every card: tap a name to hide or show their data, for example to compare only two kids. A hidden name stays greyed so it can be tapped back on; Everyone shows all again. Names in the legend and the Who does how much rows do the same. Colors stay with each person, and totals, shares and the axis count only who’s shown. Parents’ own chores are included.',
      ] },
      { tip: 'With game features switched off, Insights still works; only the Coins measure and Coins in and out are hidden.' },
    ],
  },
  {
    id: 'data',
    icon: '💾',
    title: 'Backups, spreadsheets and deleted items',
    parents: true,
    blocks: [
      { ul: [
        'Settings → Data & Privacy → Export: a full JSON backup. Keep one before big changes.',
        'Import restores a backup and REPLACES everything. Everyone who already has an account on this server (same username) keeps their current password. People who are new to this server get a random one, so set their passwords in Family Members afterwards. The backup must list you as an Admin (same username), or the import is refused. Some devices may be signed out afterwards; they sign in again with the same password.',
        'Settings → Spreadsheets: download chores or rewards, edit them in any spreadsheet app, and load them back. You see a preview first and nothing is deleted. One-time chores keep their date (columns one_time and do_by).',
        'To delete a chore, open it with Edit; Delete task is at the bottom of the form. It goes to Settings → Recently deleted for 30 days and can be restored from there. Rewards work the same way.',
        'Deleting never takes coins away or erases what was done: past completions keep showing in Activity, the Board and goals under the chore’s name, even after it leaves Recently deleted.',
        'A deleted reward keeps its history the same way: what was bought before stays in Insights under its name. A request still waiting stays in Reward requests (under the catalog), so a parent can still approve it or turn it down, which gives the coins back.',
        'Deleting a room (Rooms → ✏️ Edit rooms → 🗑) deletes its chores too, and the room can’t be brought back. Their history and coins stay.',
        'Deleting a family member (Delete user, in Settings → Family Members) can’t be undone. A shared reward of theirs that was still waiting for a parent is turned down first, so everyone else gets their chip-ins back. A reward that only they could see is hidden, not shown to everyone: tap Show in Settings → Rewards Catalog if someone else should have it.',
      ] },
      { p: 'Proof photos go with their chore: when a chore leaves Recently deleted (or its room is deleted), its photos are deleted too, while who did it and the coins stay. A person’s avatar photo goes when they’re removed.' },
      { p: 'Every photo is redrawn on the phone or computer before it uploads, which leaves out where and with what it was taken. A photo the browser can’t read (some HEIC photos) is refused: send a JPEG or a screenshot instead.' },
      { h: 'On tidyquest.org: deleting the family' },
      { ul: [
        'Settings → Data & Privacy → Delete our family deletes everyone’s chores, history, coins and photos. Tap Download our data first if you might want a copy.',
        'Type the family’s name and your password, then tap Delete the family for good. Everyone is signed out at once, and parents with a confirmed email get an email about it.',
        'We keep it for 30 days in case it was a mistake (reply to that email), then it’s gone for good.',
      ] },
    ],
  },
  {
    id: 'install',
    icon: '🛠️',
    title: 'Installing and updating',
    parents: true,
    blocks: [
      { ul: [
        'TidyQuest runs as one Docker container with a data folder (the database, avatars and proof photos). Back up that folder.',
        'Set JWT_SECRET to a long random string. The family’s time zone is picked in the app (Settings → General → Time zone); a new install takes it from the first parent’s device. TZ on the server is only used until one is picked.',
        'Releases are tagged (for example 0.9.0). Pin that number in docker-compose.yml, then run "docker compose pull && docker compose up -d". The ":main" image is the newest code, for trying things out first.',
        'Settings → General shows the version running. To roll back, put the previous version number back and start it again (take a backup first: the database only moves forward).',
        'Under the version, Source code opens the code of that exact version: TidyQuest is free software (AGPL-3.0). Running code you changed? Set SOURCE_URL to where people can get your copy; the license asks for that.',
        'Phone notifications (web push) and installing it as an app need a secure (https://) address; until then use ntfy or Telegram. The server makes its web push keys the first time they’re needed and keeps them in the data folder (vapid-keys.json): back it up with the rest, or set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY yourself. With new keys, each device signs up again the next time the app opens.',
      ] },
    ],
  },
  {
    id: 'troubleshooting',
    icon: '🧰',
    title: 'Troubleshooting',
    blocks: [
      { qa: [
        { q: 'I can’t find Settings, Tasks or the Calendar on my phone', a: [
          'They’re under More, the last tab at the bottom of the screen, with Activity, Insights (parents) and Achievements. Your profile is at the top of More.',
          'The ☰ menu button is gone from phones: the bar at the bottom replaces it. On a computer the menu is still on the left.',
          'The points chip isn’t in the phone’s top line any more: your points are on the Board.',
        ] },
        { q: 'Everything moved after an update', a: [
          'Settings → Guide & help → 📣 See what’s new again shows the slides about what moved. The pages you use most are tabs at the bottom; everything else is under More.',
          'The slides didn’t open by themselves? Someone who joined after the update doesn’t get them, a parent may have switched off 📣 What’s new after updates in Settings → Features, or you already saw them on another device.',
        ] },
        { q: 'The Done button is grey', a: [
          'The line under the chore’s name says why: "Not assigned" (someone else’s chore), "Waiting for approval" (a parent hasn’t approved your last one yet), "Done by …" (someone already did it today), "Done today / this week" (an anytime chore’s repeat limit), or "🤝 names" (a team has claimed it today).',
          '"Waiting for …" is a Rotating chore on someone else’s turn. When the button shows a day instead of Done ("Tomorrow", "In 3 days"), the chore isn’t due again until then.',
          'If Done gives a "not yet due" message: the chore isn’t due again yet. A parent can turn on "Allow early completion" for daily routines.',
        ] },
        { q: 'A kid’s chore shows ▶ instead of Done', a: [
          'It has a timer (Timer in the chore editor). The kid taps ▶, and Done comes back when the time is up. A parent can tap Done for them, or empty the timer in the chore editor.',
          'The screen may turn off while the timer runs (over a plain http address, phones don’t let apps keep it on). The timer keeps counting and shows “Time’s up! Done?” when you look again.',
        ] },
        { q: 'I tapped Done but got no coins', a: [
          'With Strict Mode on, a kid’s chore waits for a parent. It shows as waiting in Activity and on the parent’s Today as "1 waiting for your OK": tap Review. With nothing waiting, the same place says "Nothing waiting for your OK" (hide it with 👁️ Waiting for approval in Customise).',
          'Tapped Done by mistake? While it waits, ↩ Take back (next to the button) undoes it; on a team-up it’s taken back for the whole team.',
          'If Gamification is off (Settings → General), there are no coins at all.',
          'If a parent turned it down, the chore is open again; under team-ups it goes back to the team.',
        ] },
        { q: 'I forgot to tap Done yesterday', a: [
          'Open the chore in its room (tap it), tap 📅 Done earlier… and pick the day. It counts on that day (streak included) once a parent approves it. See Chores → Logging it late.',
        ] },
        { q: 'Something is missing from Today', a: [
          'It may be hidden: open Customise (the button at the bottom of Today) and tap its 🚫 to show it again, or tap Back to the start.',
          'Some parts only show when they have something in them (approvals, team-ups, Next up, Any time, the Rescue Mission chip), and some are for parents only. Rooms, the Calendar and Recent Activity are only on their own pages now.',
        ] },
        { q: 'A parent is missing from the Board', a: [
          'A parent with Participates in tasks off shows on the Board only in a period when they did a chore. To keep them on it, tick it in Settings → Family Members. Each parent can switch it on their own card too. The standings on Today follow the same rule.',
        ] },
        { q: 'One thing at a time is missing, or a chore isn’t in it', a: [
          'For parents and members it’s off unless it’s set in Settings → Family Members. Kids get it (the Next up card on Today) unless a parent turned it off there. It can also be hidden in Today → Customise (Next up), or switched off in Settings → Features.',
          'It lists chores you can do now: your own that are due today, the Rescue Mission and up to 3 open ones. Anytime chores and chores that aren’t due yet are on Today and the Tasks page.',
        ] },
        { q: 'A chore isn’t showing on Today', a: [
          'Today lists chores that are due under Overdue and Today (one due later today shows once it’s due, or right away when it may be done early). Chores due in the next 30 days are under "Show … scheduled" at the bottom; the rest are in their room and on the Tasks page.',
          'Anytime chores need "Show on Today" turned on.',
          'Out of season (Only in season) or set weekdays: it isn’t due today.',
          'It has a start date (📅 Starts on) that hasn’t come yet: it shows “Starts …” in its room.',
          'Your Task view may be on "Mine" (the buttons above the lists), or a parent set it to "Only theirs".',
          'One-time chores show on their Do by day (under Any time when they have none), and are gone once done.',
          'You may have snoozed it (💤): it waits under "Show … scheduled" for 3 days. Tap it there and Bring back now, or Undo on the "Snoozed" message right away.',
        ] },
        { q: 'I can’t find where to add a to-do room', a: [
          'There’s no room type for it: the To-dos room is made by itself the first time a parent taps "+ To-do" on Today. After that it’s on the Rooms page.',
          'No "+ To-do"? Only parents have it (next to Mine / Everyone on Today), and To-dos may be switched off in Settings → Features.',
        ] },
        { q: 'A to-do says Overdue', a: [
          'Its "Do by" date has passed. Tap Edit on it in the To-dos room to pick a later date or clear it: a to-do without a date is never overdue.',
        ] },
        { q: 'A chore or reward disappeared', a: [
          'It may be paused: parents see it greyed in its room, marked ⏸️ Paused. Open it and tap ⋯ → ▶️ Switch back on.',
          'A hidden reward shows as Hidden in Settings → Rewards Catalog: tap Show.',
          'Deleted by mistake? Settings → Recently deleted brings it back for 30 days.',
        ] },
        { q: 'A kid can’t see a room or chore', a: [
          'Settings → General → "Hide other people’s private rooms from kids" hides rooms that belong to someone else.',
          'Their Task view may be "Only theirs" (Settings → Family Members).',
        ] },
        { q: 'The coins for a chore look wrong', a: [
          'Custom coins win over Coins per effort.',
          'A double coins event or the Rescue Mission multiplies them (the bigger one wins; they don’t stack).',
          'Team-ups split the coins plus the team bonus; a parent helper gets nothing so the kid keeps it all.',
          'Badge bonuses and parent bonuses show as separate lines in Activity.',
        ] },
        { q: 'Notifications don’t arrive', a: [
          'Check in order: notifications are on and the kind is ticked (Settings → General); the channel works (use the test button); the person hasn’t turned that kind off (Profile). A kid only gets due today and reminders for chores nobody is assigned to once Chores anyone can do is ticked for them.',
          'Private kinds (outcomes, summaries, nudges, cheers) need the person’s own channel.',
          'Quiet hours and school hours hold messages until they end.',
          'The Notification log shows each message and any error.',
        ] },
        { q: 'A reminder or morning message never came', a: [
          'A message held by quiet hours is dropped if it no longer holds when they end: the chore was done (or is waiting for approval), its day is over, or the team-up or double coins event has ended.',
          'For someone on vacation, and for everyone during Vacation Mode, chore messages aren’t sent at all.',
          'The follow-ups of a late reminder can come after midnight: 2 and 4 hours after the reminder time.',
        ] },
        { q: 'Phone notifications won’t turn on', a: [
          '“Needs a secure address”: open TidyQuest at its https:// address, not http:// or a number like 192.168…. A home server needs HTTPS set up first.',
          'On iPhone and iPad: open TidyQuest from its Home Screen icon, not in Safari, on iOS 16.4 or newer.',
          '“Blocked in this browser”: notifications were refused when it asked. Allow them for TidyQuest in the browser’s site settings (iPhone: Settings → Notifications → TidyQuest), then try again.',
          'No Phone notifications part in Profile: a parent switched it off in Settings → Features.',
          '“Brave has push messaging turned off”: open brave://settings/privacy, turn on Use Google services for push messaging, and restart Brave.',
          '“This browser can’t sign up for notifications here”: it’s a private (incognito) window, or a browser built on Chromium without a push service. Use a normal window in Chrome, Edge, Firefox or Safari.',
          '“Notifications weren’t allowed”: the question was closed, or Chrome or Edge showed a bell in the address bar instead of asking. Tap Turn on for this device again and choose Allow.',
          'Private windows can’t get notifications: open TidyQuest in a normal window.',
        ] },
        { q: 'I never got the “turn on notifications” card', a: [
          'It only shows to people with no channel of their own (no phone notifications on any device, ntfy topic, Telegram chat or Home Assistant service), while notifications and Settings → Features → Phone notifications (web push) are on, and only after their first chore of the day.',
          'It stays hidden on an http:// address and in browsers that can’t show notifications. After Turn on it’s gone for good; after Not now it waits a week, at most three times. Profile → My notifications always works.',
        ] },
        { q: 'Phone notifications stopped coming', a: [
          'Log out on that device, Log out of all devices or a new password set by a parent stops them. Sign in and tap Turn on for this device again.',
          'Check the phone itself: notifications allowed for TidyQuest (or the browser), and no Focus or Do Not Disturb hiding them.',
          'A parent can look in the Notification log: a "push" line shows each message and any error. A device that was reset or had the app removed drops off the list after its first failed message.',
        ] },
        { q: 'Send test notification shows ✓ but nothing appears on the computer', a: [
          'The browser has to be running to get them. On Windows, Chrome, Edge and Brave can keep running after their last window closes (their Settings → System → Continue running background apps); Firefox only while it’s open.',
          'Allow notifications for the browser itself: on Windows, Settings → System → Notifications; on a Mac, System Settings → Notifications → the browser.',
          'Turn off Do Not Disturb or Focus: they hide notifications.',
        ] },
        { q: 'The Home Assistant test fails', a: [
          '“Could not reach Home Assistant”: the URL is wrong, or the TidyQuest server can’t reach it. In Docker, homeassistant.local often doesn’t work: use the IP address with :8123.',
          '“Home Assistant returned 401”: the token is wrong or was deleted. Create a new one in Home Assistant and paste it again.',
          '“Home Assistant returned 400” (or 404): Home Assistant has no notify service by that name. Copy the name from Developer tools → Actions; notify. in front is optional.',
          '“Invalid Home Assistant notify service”: use only lowercase letters, numbers and underscores, e.g. notify.mobile_app_alexs_phone.',
          'The test button is grey: save the URL and the token first, and give the person a Home Assistant service in Who gets what.',
        ] },
        { q: 'Our own ntfy server or Home Assistant doesn’t work on tidyquest.org', a: [
          'tidyquest.org only sends to ntfy.sh and Telegram: an address typed in could reach machines inside our network, so the server won’t call it. A home server can use both.',
          'Importing a backup from a home server drops its Home Assistant and custom ntfy settings (with that server’s topics), so messages never land in a public ntfy.sh topic by mistake. Set up ntfy.sh or Telegram again in Settings → General → Notifications.',
        ] },
        { q: 'Chores reset at the wrong time of day, or days and weeks are off by a few hours', a: [
          'Check Settings → General → Time zone (parents): days start at midnight there for the whole family. If it says "Not picked yet", tap Use it to take this device’s zone, or tap Change and search for yours.',
          'Changing it moves when each day starts from then on. Chores already done stay on the day they were done.',
        ] },
        { q: 'The week starts on the wrong day', a: [
          'A parent picks Sunday or Monday in Settings → General → Week starts on. Weekly goals, the Board, reward limits and "per week" turns all follow it, and a weekly goal that’s running moves to the new week.',
          'Past weekly winners on the Board are counted again with the new weeks, so they can change a little.',
        ] },
        { q: 'A rotating chore seems stuck on one person', a: [
          'Check its rotation: "per completion" moves on after each completion (after approval under Strict Mode); "per week" moves on when a new week starts (Monday or Sunday: Settings → General → Week starts on).',
          'Parents and members can always do it for whoever’s turn it is.',
        ] },
        { q: 'There’s no 🤝 Team up button', a: [
          'The button is inside the chore: tap the chore to open it. Team-ups need a chore worth 6 or more coins that isn’t in someone’s own room, isn’t assigned to just one person, and isn’t rotating.',
          'Only one team-up per chore per day; check the Team-ups card on Today.',
          'Settings → Features → Team-ups must be on.',
        ] },
        { q: 'A team-up invite disappeared', a: [
          'Invites end at midnight, and when someone does the chore another way.',
          'If you tapped "No thanks" on an invite for anyone, it’s hidden for you for the rest of the day.',
          'If the person you invited said no thanks, the invite ended and you can ask someone else.',
        ] },
        { q: 'A theme, frame or celebration is locked', a: [
          'It unlocks at a level (🔒 shows which). Levels come from lifetime coins and never go down.',
        ] },
        { q: 'The mascot is still an egg, or looks sad', a: [
          'It hatches at 500 family coins (everyone’s chores together, all time), then grows at 2,000, 5,000 and 10,000.',
          'Its mood follows house health: below 50% it asks for help with the messiest room; tap "Let’s help".',
        ] },
        { q: 'An accessory someone bought disappeared', a: [
          'There’s one shared outfit and no closet, so buying a new item replaces whatever was in that spot. Activity shows who bought what.',
          'Whoever bought it, or a parent, can also take it off. If the shop causes arguments, a parent can switch it off in Settings → Features.',
        ] },
        { q: 'The mascot turned back into an egg', a: [
          'Someone picked a different creature in Settings → Features: a creature you haven’t had starts as an egg. The old one keeps its growth, name and outfit; pick it again to bring it back.',
        ] },
        { q: 'The mascot is asleep, or says it’s hungry', a: [
          'It sleeps during the family bedtime (Settings → Features, under the mascot), by each device’s clock.',
          'Hungry means fewer chores in the last couple of days; every chore fills its tummy a little. Hunger never affects anything else.',
        ] },
        { q: 'The mascot didn’t cheer for a chore', a: [
          'It cheers (🍪 and a hop) only for bigger chores, 3★ effort or more, and only once a waiting chore is approved. Smaller chores still fill its tummy, quietly. Its 🐾 next to a finished chore follows the same rule.',
          'Each device shows the cheer once: a phone that already saw it won’t cheer again.',
        ] },
        { q: 'The app looks different on another family member’s phone', a: [
          'The look (Settings → Look) is one choice for the whole family, but each device picks up a change when it next loads Today: open Today, or switch to another app and back.',
          'Colours are personal: each person picks their theme in Profile, so the same look can be orange on one phone and blue on another.',
        ] },
        { q: 'No holiday decorations or colors', a: [
          'Settings → Features → Seasonal styling, and that holiday’s own switch, must be on. It follows the device’s date.',
          'Profile → Holiday colors off keeps your own theme (decorations still show).',
          'Phones set to reduce motion don’t show falling or flying decorations, or confetti.',
        ] },
        { q: 'A streak broke while we were away', a: [
          'Use Vacation Mode (whole house, Settings → General) or vacation per member (Family Members) before leaving; it protects streaks and freezes chore health.',
          'When a vacation ends (switched off, or on its Return date), chores pick up where they were when it began: the days away don’t count as neglect. Streaks carry on from the day you’re back.',
        ] },
        { q: 'A shield didn’t save the streak', a: [
          'Each missed day needs its own shield. With fewer shields than missed days, none are used: the streak starts again and the shields are kept.',
          'Shields aren’t used during Vacation Mode; vacation already protects the streak.',
        ] },
        { q: 'There’s no Add to Home Screen on an iPhone', a: [
          'Open the address in Safari itself. A link tapped in Mail, Messages or a chat app can open inside that app, which can’t add it: tap the Safari compass (or "Open in Safari") first.',
          'Still not in the Share list? Scroll to the bottom, tap Edit Actions and add it.',
        ] },
        { q: 'On Android it opens in a browser tab, with an address bar', a: [
          'Chrome installs it as an app only from a secure (https://) address. Over a plain http:// address, as on many home servers, you get a shortcut instead: it works the same, with Chrome’s bar on top. See "Installing and updating".',
          'Added it to the home screen a while ago? Remove the icon and add it again to get the full-screen app.',
        ] },
        { q: 'The app on the home screen asks me to sign in again', a: [
          'On an iPhone or iPad that’s normal the first time: it keeps its own sign-in, apart from Safari’s. Sign in once and it stays signed in.',
        ] },
        { q: 'After an update the app on the home screen looks the same', a: [
          'It loads the new version by itself the next time you open it or change page. Still the same? Close it fully (swipe it away in the app switcher) and open it again.',
        ] },
        { q: 'Someone can’t log in', a: [
          'Too many wrong passwords block logins for up to 15 minutes: 10 for one account, or 20 from one device. Wait and try again; a correct password clears the account’s count. Changing your own password or sign-in email, or deleting the family, allows 5 wrong passwords in 15 minutes.',
          'A parent can set a new password in Settings → Family Members. Passwords need at least 4 characters; on tidyquest.org a parent’s needs 8.',
          'No parent can log in? Whoever runs the server can reset the first parent’s password with ADMIN_RESET_PASSWORD (README, "Admin Password Recovery"). "Forgot password?" on the login screen says the same.',
          'After importing a backup, people who already had an account on this server keep their passwords. People who are new to this server need a parent to set one in Family Members. Some devices may be signed out after an import; they sign in again with the same password.',
        ] },
        { q: 'Someone isn’t on the login screen, or it says logging in is turned off', a: [
          'A parent switched off Can log in for them: their card in Settings → Family Members says 🔒 No login. On tidyquest.org the login just says the name or password is wrong.',
          'To let them in, switch Can log in back on, type a new password and tap Turn on. It then shows the username to sign in with.',
          'Parents always log in: the switch is only on members’ and children’s cards, and someone without a login can’t be made a parent until it’s on.',
        ] },
        { q: 'A kid can’t log in on tidyquest.org', a: [
          'Check the family code in Settings → 🔑 Family code on a parent’s device. After New code the old one stops working: on the login screen tap Change next to the code and type the new one.',
          'Kids type their username, not an email. Parents can use either their email or the family code with their username.',
        ] },
        { q: 'The confirmation or password email didn’t arrive', a: [
          'It comes from noreply@tidyquest.org: look in the spam folder too, and mark it as not spam. Settings → ✉️ Sign-in email → Send it again sends a new confirmation link (the older one stops working).',
          'A password link works for one hour and only once; ask for a new one with Forgot password? on the login screen.',
          'Typed the address wrong? Settings → ✉️ Sign-in email → Change email.',
        ] },
        { q: 'It says “A parent needs to confirm their email first”', a: [
          'Only on tidyquest.org. Until a parent has confirmed their email, only parents can sign in. A parent opens the link we sent (Settings → ✉️ Sign-in email → Send it again sends a new one), and then everyone can sign in.',
        ] },
        { q: 'It says "Confirm your email to keep using TidyQuest"', a: [
          'Your family had 30 days to confirm a parent’s email. A parent opens the link we sent, or taps Send it again (or Change email if the address was wrong). Until then Download our data still works, but the family is deleted soon after, so don’t wait.',
        ] },
        { q: 'It asks me to agree to the terms', a: [
          'Only on tidyquest.org, for parents and members: the first time you sign in, and again when the terms or the privacy policy change. Read them with the links, then tap Agree and continue. Children are never asked.',
        ] },
        { q: 'It says the family is paused, or the free trial has ended', a: [
          'Only on tidyquest.org. A paused family can’t use the app until TidyQuest resumes it. Nothing is lost, and a parent can still tap Download our data.',
          'When the free trial has ended, a parent picks a plan to keep going. Until then the family’s data is kept, and Download our data still works.',
        ] },
        { q: 'It says a file is too big, or the family is full', a: [
          'The message says which limit was hit. A proof photo can be up to 8 MB (5 MB on tidyquest.org), an avatar up to 2 MB, and a backup to import up to 50 MB (5 MB on tidyquest.org).',
          'On tidyquest.org a family has 200 MB for photos. When it’s full, new photos don’t upload, but the chore still counts.',
          'On tidyquest.org a family can have up to 15 people.',
          'Phones make big photos smaller before they upload. If a photo still doesn’t upload after Done, the chore counts anyway: the message stays until you close it, and while the chore waits for a parent, Try again sends the photo again.',
          'No photo field when finishing a chore with 📎? A parent switched them off in Settings → Features → Proof photos.',
        ] },
        { q: 'It says a photo can’t be read', a: [
          'The phone or browser couldn’t open that photo (often a HEIC photo on a computer), and every photo is redrawn before it uploads to leave out where it was taken. Send a JPEG or PNG, or take a screenshot of the photo and send that.',
        ] },
        { q: 'A photo or avatar doesn’t show', a: [
          'Proof photos only open for someone logged in to the family: parents see all of them, everyone else only their own. On tidyquest.org the same goes for avatars.',
          'If photos stopped showing, close and reopen the app. If that doesn’t help, tap Log out and log in again.',
          'A copied link to a photo doesn’t open anywhere else, on purpose: it keeps kids’ photos private.',
          'On tidyquest.org, no photos show while the family is paused or its free trial has ended.',
        ] },
        { q: 'It says "Can’t reach TidyQuest"', a: [
          'The app couldn’t reach the server when it opened: no Wi-Fi or data, or the server is restarting or being updated. You stay signed in and this device’s notifications stay on. It tries again every few seconds; Try again does it right away.',
        ] },
        { q: 'I was signed out on every device', a: [
          'A parent changed your password or used Log out of all devices, or you changed your password or used Log out everywhere else on another device. Log in again with your current password.',
          'First parent: whoever runs the server may have reset your password there (ADMIN_RESET_PASSWORD). Ask them for the new one.',
          'A login ends by itself only on a device that hasn’t opened TidyQuest for 30 days. A device you use stays signed in.',
        ] },
        { q: 'It says "That didn’t work"', a: [
          'The phone couldn’t reach the server (no Wi-Fi or data), or someone changed the same thing at the same moment. The page reloads; check it, then try again.',
        ] },
        { q: 'I deleted something by mistake', a: [
          'Settings → Recently deleted can bring chores and rewards back for 30 days, with their history. A chore whose room was deleted asks which room to go into.',
          'A chore marked done by mistake can be undone from Activity, or with ↩️ Undo in its room (parents).',
        ] },
        { q: 'The setup wizard didn’t open, or I want it again', a: [
          'It opens by itself only for a parent, while the family has no rooms yet (the To-dos room doesn’t count), until someone finishes it or taps Not now.',
          'Open it any time from Settings → Setup wizard (under Help). Running it again only adds, so delete rooms (Rooms → ✏️ Edit rooms → 🗑) or rewards you don’t want yourself.',
        ] },
        { q: 'Each kid pays a different price for the same reward', a: [
          'The setup wizard gave each person their own price, so everyone pays about the same weeks of their own chores: a kid with more chores earns more, so pays more. It shows as “own prices” under the reward.',
          'Change or clear them in Settings → Rewards Catalog → Rules → Price per person (blank = usual price).',
        ] },
        { q: 'A kid still sees the old price of a reward', a: [
          'A different price per person is set in Settings → Rewards Catalog → Rules, with the Save inside that box (the box closes and “own prices” shows under the reward’s name). The Save under Edit only changes the usual price.',
          'The kid’s Rewards page picks up the change within 15 seconds, or as soon as the app is opened again.',
          'If the price changes while the buy box is open, the box shows the new price instead of buying: tap Confirm to pay that, or Cancel.',
        ] },
        { q: 'A reward I deleted still shows in Insights', a: [
          'That’s on purpose: what was bought before still counts, so past weeks add up. It’s gone from Rewards and the Rewards Catalog, and isn’t listed under Never bought.',
          'Changed your mind? Settings → Recently deleted brings it back for 30 days.',
        ] },
        { q: 'Is the app up to date?', a: [
          'Settings → General shows the version. See "Installing and updating" to update or roll back.',
        ] },
      ] },
    ],
  },
];

/** The other languages, each loaded the first time the guide opens in it */
const TRANSLATIONS: Record<string, () => Promise<GuideSection[]>> = {
  fr: () => import('./guide.fr').then((m) => m.GUIDE_FR),
  de: () => import('./guide.de').then((m) => m.GUIDE_DE),
  es: () => import('./guide.es').then((m) => m.GUIDE_ES),
  it: () => import('./guide.it').then((m) => m.GUIDE_IT),
  nl: () => import('./guide.nl').then((m) => m.GUIDE_NL),
};
const loading: Record<string, Promise<GuideSection[]>> = {};

/** The guide in this language: English straight away, or a promise of the translation (English if it can't load) */
export function guideFor(language?: string): GuideSection[] | Promise<GuideSection[]> {
  const load = language ? TRANSLATIONS[language] : undefined;
  if (!language || !load) return GUIDE_EN;
  return (loading[language] ??= load().catch(() => GUIDE_EN));
}
