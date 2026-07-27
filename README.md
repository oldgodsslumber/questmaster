# Questmaster

A Dungeon-Crawler-Carl-flavored habit tracker. You do real things; a real RPG character grows because of it.

Vanilla HTML/CSS/JS, no build step. Google sign-in + Firestore, deployable to GitHub Pages. Runs fully in local mode until you configure Firebase, so you can play with it before touching a console.

---

## Run it

```
npx serve .          # or: python -m http.server 8000
```

Then open the printed URL. Opening `index.html` directly with `file://` will **not** work — the icon manifest is loaded with `fetch`, which browsers block on the file protocol.

On first load you'll see a sign-in screen with **Continue on this device**. That's local mode: everything works, stored in `localStorage`, never uploaded.

---

## Wire up Firebase

Project **`questmaster-84341`** is created and its config is already live in [js/firebase-config.js](js/firebase-config.js). Three console steps remain — until they're done the app falls back to local mode rather than failing.

1. **Build → Firestore Database → Create database** → production mode, pick a region. *(This is the current blocker: the Firestore API isn't enabled on the project yet, so nothing can read or write.)*
2. **Build → Authentication → Sign-in method** → enable **Google**.
3. **Authentication → Settings → Authorized domains** → add `localhost` and your Pages host (e.g. `thatwalshguy.github.io`).

Then publish the rules — `firebase.json` and `.firebaserc` are set up, so from the project root:

```
firebase deploy --only firestore:rules
```

(Or paste [firestore.rules](firestore.rules) into **Firestore → Rules → Publish**.)

Those config values are public by design — a web client can't hide them. Security comes from the rules plus Google Auth, never from secrecy.

> The console's setup snippet shows `import { initializeApp } from "firebase/app"`. That's bare-module syntax which only resolves under a bundler. This app has no build step, so `firebase-config.js` imports the same SDK from its gstatic CDN URLs instead — same library, same pinned version, no npm.

### Deploying to GitHub Pages

Repo: [oldgodsslumber/questmaster](https://github.com/oldgodsslumber/questmaster)

**Settings → Pages → Deploy from branch → `main` → `/ (root)`.** No build step, nothing to configure. It lands at:

```
https://oldgodsslumber.github.io/questmaster/
```

Then add **`oldgodsslumber.github.io`** to **Firebase → Authentication → Settings → Authorized domains**, or Google sign-in will fail on the deployed site with `auth/unauthorized-domain` while working fine on localhost.

Bump the `?v=` query strings in `index.html` and `CONFIG.build` when you ship a change, or browsers will serve stale JS. They're the same string — one find-and-replace.

---

## What's built

| Milestone | State |
|---|---|
| **M1** Auth + character core | ✅ Creation wizard (backgrounds → array → hinges), attributes base vs. effective, three resource pools, modifier engine, XP/leveling |
| **M2** Quests & tasks | ✅ Quest CRUD with cadence, tasks + subtasks, task XP, auto-complete bonus, quest-level streaks, client-side resets, quick-add |
| **M3** RPG kit + icon picker | ✅ Skills (XP→Rank), inventory + equip slots, castable spells, buffs/debuffs, achievements, 4,229-icon picker |
| **M4** Races & Classes | ✅ 12 races, 14 classes, tiered point-buy, detriments at 2-for-1, Earth gating |
| **M5** Party + friends + sharing | ✅ **Multiple parties** per crawler (create/join by invite code, roster, live snapshots), a **friends list** (add by friend code via a public crawler directory), a shared **newsfeed** combined across your parties and filterable by party (manual posts, journal cross-posts, auto quest turn-ins), and per-quest sharing to a chosen party (view / co-op). Cloud-only — local mode shows a graceful sign-in state. Cross-client co-op *task completion* remains a future add; the rules already permit it. |
| **M6** Export + polish | 🟡 PNG export works; responsive pass and empty states are in |

Quest documents already carried `visibility`, `shareMode`, `sharedWith` and `partyId`, and `firestore.rules` already enforced the co-op task-completion rule, so M5 slotted in without a migration.

**Character creation** now also lets you homebrew as you register: add custom skills (name/icon/rank), define a custom starting class or pick one from the roster, and build your own gear pack — all inline in the wizard, alongside the write-your-own hinges that were already there.

**Parties** are top-level Firestore documents keyed by their own invite code, so joining is a direct `get(parties/CODE)` — no query, no composite index. A crawler carries a `partyIds` array (migrated automatically from the old single `partyId`) and can be in several at once; the Feed blends them into one stream, tagged and filterable by party. **Friends** work the same keyed-lookup way: a public `crawlers/{uid}` card holds the shareable minimal profile and a `crawlerCodes/{CODE}` index resolves a friend code to a uid, so "add by code" is one read and never exposes anyone's private sheet. The Party and Feed screens are the only place in the app that subscribes to live snapshots; everything else still follows the fetch-once rule.

---

## How it fits together

Scripts are plain classic `<script>` tags in dependency order (see `index.html`); only `firebase-config.js` is a module, because it needs `import`.

| File | Role |
|---|---|
| `js/config.js` | **Every tunable number.** Level curve, XP values, tier costs, rank cap, reset rules. Start here. |
| `js/engine.js` | Pure functions. Effective stats, derived stats, XP/rank math, cadence boundaries, point-buy budget. No DOM, no network. |
| `js/store.js` | Data layer. Two interchangeable backends (Firestore / localStorage) behind one interface. |
| `js/progress.js` | Commits progression: awards XP, trains skills, completes quests, runs resets. Everything is reversible by passing a negative. |
| `js/icons.js` | game-icons.net picker; fetches SVGs and **inlines the markup** (see below). |
| `js/data-seed.js` | Creation content — backgrounds, hinges, gear packs, starter kit. |
| `js/data-build.js` | The races/classes/traits roster. |
| `js/views-*.js` | One file per screen. Each exposes `render(hostNode)`. |
| `js/app.js` | Auth gating, hash routing, the render loop. |

**Rendering is a full repaint.** Every mutation calls `App.render()`, which rebuilds the current view from `Store.state`. The state is one character and its subcollections — already in memory — so repainting costs less than the bookkeeping diffing would need.

**Reads are fetch-once.** Boot pulls everything, then the app renders from memory and writes through. Nothing subscribes to snapshots; that arrives with the party layer, the only place two people can touch one document.

---

## Two things that will bite you if you forget them

**Icons must stay inline SVG.** `html2canvas` taints the canvas on any cross-origin image, which kills PNG export. `Icons.node()` fetches the SVG markup and injects a real `<svg>` element — never an `<img>`. If you "optimize" that to an `<img src>`, export breaks and the error won't point at the icons.

**Resets are client-side and local-time.** There is no server and no cron. `Progress.runResets()` runs once per load and rolls over any quest whose window has closed. Daily quests roll at *your* midnight, not UTC. Missing a week breaks a streak once, not seven times.

---

## Where it diverges from the rulebook

The book is `DCC_TTRPG_Core_Rulebook.md`. Faithful: the 2/3/4/5/6 array, 10 health slots at CON-mod capacity, Mana = raw INT, Passive Evade = 10 + DEX mod + floor, Size 4, 1 AI Favor, Heal at Rank 1 for 2 Mana restoring 2 slots, Unarmed Combat at Rank 3, background ranks (1/1/3/2), the five point tiers, 5 detriment points at a 2-for-1 deficit, Earth classes at +50%.

Deliberately different:

- **Leveling.** The book levels on milestones (surviving a session, turning in a quest, killing a boss). Habit tracking has no sessions, so levels come from task XP, tuned to roughly one per week. `CONFIG.xpForLevel`.
- **Skill advancement.** The book uses an end-of-session d20 checkmark roll. Same problem, same fix: skills take XP from linked tasks. `CONFIG.skillXpForRank`.
- **Score→modifier.** The book never prints the table but gives a "CON +2" example. We use `floor(score / 2)`, which reproduces it. `CONFIG.scoreToModifier`.
- **Point-buy costs.** The book names the tiers but not their prices. Minor 1 → Epic 5, budget 10. `CONFIG.tierCosts`.
- **Floor 3 gate.** The book locks races/classes behind Floor 3. Ungated by default; set `CONFIG.buildUnlockFloor = 3` to honor it.
- **The roster.** The book claims 30+ races and 42+ classes but names only a handful (Tigran, Obsidian Butterfly, Santero, Compensated Anarchist, Bomb Squad Tech, Prize Fighter, Primal). Those are all present; the rest of `data-build.js` is written to fit the book's economy.

**Not simulated, on purpose:** the d20 formula, DCs, degrees of success, phase-less combat, action economy, health-slot damage math, and pets/companions/mounts. This tracks a character, not encounters. Don't let a future change grow a combat engine here.

---

## Regenerating the icon manifest

`data/icons-manifest.json` is 4,229 `author/name` slugs pulled from the game-icons source repo:

```bash
curl -s "https://data.jsdelivr.com/v1/packages/gh/game-icons/icons@master?structure=flat" -o gi.json
python -c "
import json,io
d=json.load(open('gi.json'))
s=sorted(x['name'][1:-4] for x in d['files'] if x['name'].endswith('.svg') and x['name'].count('/')==2)
io.open('data/icons-manifest.json','w',encoding='utf-8').write(json.dumps(s,separators=(',',':')))
print(len(s))
"
```

Icons are © their authors, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The credit line in the picker and on the sheet is a license condition — leave it in.
