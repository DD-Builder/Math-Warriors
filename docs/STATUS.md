# Math Warriors — Current Status

**Last updated:** during the "rough in all sections" autonomous build sprint.

This doc is the fastest way to catch up on where the project is. Read this first, then dive into the other docs only if you want detail.

---

## Milestones complete

### v0.1 — "It boots"
Repo scaffolded. Vite + Phaser + deploy pipeline running. Title screen renders.

### v0.2 — "First playable battle"
Math question generator (16 tests, 10k-iteration fuzz). Combat system (27 tests). Save system (19 tests). Placeholder heroes and enemies. Battle scene with turns, HP bars, momentum.

### v0.3 — "Three heroes, party system"
PartySelectScene with class tabs, hero grid, party strip, confirm button. START routes through party pick into battle.

### v0.4 — "World map + save persistence + battle juice"
WorldMapScene with 5 floor nodes, linear unlock. Save system wired into victory/defeat. Battle juice pass: hit-pause, particles, arcing damage numbers, snappier tempo, audio hooks, camera zoom, TitleScene detects save and offers CONTINUE.
**+ DESIGN-PRINCIPLES.md** synthesizing indie RPG research + educational game research + Prodigy Math's lessons into 10 non-negotiable rules the game follows.

### v0.5 — "Walkable maze"
MazeScene with tilemap, grid-snap movement, fog of war, keyboard + d-pad input, chest/potion/encounter/boss/exit object interactions. Battle returns to maze and preserves state. Boss defeat unlocks the floor exit.

### v0.6 — "Grade select, adaptive difficulty, potion, tutorial"
GradeSelectScene (K–5). Math generator now reads streak to adapt difficulty within grade bounds. Potion button in battle actually works (was a prototype bug I called out in the audit). First-battle tutorial toast.

### v0.7 — "Content pass"
Each of Floors 2–5 gets its own unique hand-designed layout (they were all sharing Floor 1's map before). 5 enemy abilities now implemented with real behavior (sporulate, accumulate, shell_split, consume, crown_tally); 20 other ability names are no-op stubs ready for future implementation. SettingsScene with volume controls, grade change, stats display, reset. iOS build scaffold (capacitor.config.json + [`IOS-BUILD.md`](IOS-BUILD.md)).

---

## Test coverage

- **Unit tests:** 106 passing (math, combat, save, data integrity)
  - Math generator: 16 tests including 10,000-iteration fuzz
  - Combat: 27 tests covering damage, momentum, turn order
  - Save: 19 tests including corruption recovery and migration
  - Data integrity: 21 tests validating hero/enemy/scene registry contracts
- **E2E tests:** 12 passing (Playwright + headless Chromium)
  - Page load, canvas render, loading overlay dismiss
  - All 7 scenes start without errors
  - All 5 floor layouts load without errors
  - Maze player movement
  - SettingsScene open and close
  - Screenshot capture for every major scene

**Real bugs caught by tests before reaching the user:**
1. `Phaser.Graphics.quadraticCurveTo` doesn't exist — would have crashed the first time the user clicked any floor on the world map
2. Battle scene HP bars were being clipped by the UI panel (groundY too low)
3. Screenshot test was leaking SettingsScene across transitions (fixed with explicit scene stop)

---

## Current scene graph

```
Boot
  └→ Title (checks save; shows CONTINUE or START)
       ├→ NEW GAME → GradeSelect → PartySelect → WorldMap
       ├→ CONTINUE → WorldMap
       └→ SETTINGS → Settings
                       └→ (back) Title

WorldMap
  ├→ (tap unlocked floor) → Maze
  └→ (back) Title

Maze
  ├→ (step on encounter tile) → Battle → Maze
  ├→ (step on boss tile) → Battle → Maze (exit unlocked)
  ├→ (step on exit tile, boss defeated) → WorldMap
  ├→ (WORLD MAP button) → WorldMap
  └→ (settings gear) → Settings → Maze

Battle
  ├→ Victory → returnScene (Maze or WorldMap)
  └→ Defeat  → returnScene (full heal)
```

---

## Build status

- **Build:** passes cleanly in ~5 seconds
- **App code:** 68 KB raw, 19 KB gzipped
- **Phaser:** 1.48 MB raw, 340 KB gzipped (cached separately)
- **Total download for first visit:** ~360 KB gzipped
- **Load time target:** under 3s on iPad / LTE. Currently well inside that.

---

## What's actually playable right now

**The full intended loop.** Open the URL → title screen → new game → grade → party → world map → tap Floor 1 → walk around the garden maze → pick up a chest → bump into a monster → answer math questions → win the battle → return to maze → find more stuff → defeat the boss → exit opens → return to world map → Floor 2 is unlocked → repeat.

**All with placeholder colored-rectangle art.** The *game* works. The *art* is a stand-in that'll be replaced with real papercut sprites during v0.8 once assets are sourced or generated.

---

## What's NOT yet in the game

### Needs external assets (can't do without user/resources)

- **Real art.** All heroes, enemies, tiles, and backgrounds are colored rectangles. Real sprites, per-level art styles (papercut, claymation, etc.) are v0.8+.
- **Real audio.** Sound system is wired and ready to play files; the files don't exist yet. v0.8+.
- **iOS device build.** Capacitor config and docs are committed; actually building requires a Mac + Xcode + optional $99 Apple Developer account.
- **App Store listing.** Apple Developer account required. v1.0 work.

### Can be built without external resources (future sessions)

- **More enemy abilities.** 5 implemented, 20 declared as stubs. Each takes ~20 lines of code.
- **Achievement system.** Data model not designed yet.
- **Hero variety beyond stat tweaks.** Each hero could have a signature ability — currently they're visually distinct (color) but mechanically similar.
- **Cosmetic unlocks.** Principles doc commits us to shipping these; the save data model doesn't track them yet.
- **Localization.** Strings are inline, not externalized. Design Principle #14 calls this out as needed before shipping.
- **Parent gate.** Apple requires it if there are external links. Currently there are none, so not urgent.
- **iCloud save sync.** Post-launch.
- **Additional floors / new game plus / endless mode.** Post-launch content.

---

## Repo layout

```
Math-Warriors/
├── README.md                   Quickstart
├── LICENSE                     MIT
├── capacitor.config.json       iOS wrapper config
├── playwright.config.js        E2E test runner config
├── vite.config.js              Build config
├── package.json                Dependencies + scripts
├── index.html                  Entry point
│
├── .github/workflows/
│   └── deploy.yml              Auto-deploy to GitHub Pages
│
├── prototype/
│   ├── README.md               Historical note
│   └── AUDIT.md                66-bug list from the original prototype
│
├── docs/
│   ├── STATUS.md               ← you are here
│   ├── DESIGN-PRINCIPLES.md    The rules we follow (read first)
│   ├── GDD.md                  Game design doc
│   ├── ARCHITECTURE.md         Technical architecture
│   ├── ART-STYLE.md            Per-level art direction + reference board
│   ├── ROADMAP.md              Milestone plan
│   └── IOS-BUILD.md            How to build for iPad when you have a Mac
│
├── src/
│   ├── main.js                 Phaser bootstrap
│   ├── config.js               Constants (colors, scene keys, screen size)
│   ├── scenes/
│   │   ├── BootScene.js        Asset loader
│   │   ├── TitleScene.js       Title + CONTINUE/NEW GAME
│   │   ├── GradeSelectScene.js K-5 picker
│   │   ├── PartySelectScene.js Hero grid + party strip + confirm
│   │   ├── WorldMapScene.js    5 floor nodes with unlock state
│   │   ├── MazeScene.js        Tile-based dungeon explorer
│   │   ├── BattleScene.js      Turn-based math combat
│   │   └── SettingsScene.js    Volume, grade, stats, reset
│   ├── systems/
│   │   ├── math.js             Question generator (+ tests)
│   │   ├── combat.js           Damage, momentum, turns (+ tests)
│   │   ├── save.js             Versioned localStorage (+ tests)
│   │   ├── audio.js            Sound manager (stub-safe)
│   │   └── abilities.js        Enemy ability hooks
│   └── data/
│       ├── heroes.js           15 heroes (+ integrity tests)
│       ├── enemies.js          25 enemies (+ integrity tests)
│       └── floors.js           5 floor tilemaps + object lists
│
├── public/assets/              Placeholder asset folders (gitkeeps)
│
└── e2e/
    ├── smoke.spec.js           12 Playwright tests
    └── screenshots.spec.js     Captures every major scene
```

---

## Next best things to work on

When you're ready to direct the next session, these are the highest-impact items ordered by bang-for-buck:

1. **Source placeholder art.** AI-gen or Kenney.nl free assets. Even ugly-but-consistent art is a huge perceived-quality upgrade over colored rectangles. Floor 1 alone is enough to prove the pipeline.

2. **Record or source placeholder audio.** Free CC0 SFX packs (Kenney has these) + one looping background track. Would make the game feel 3× better.

3. **Implement another 5-10 enemy abilities.** The combat variety pays off as soon as there are more fights that feel different.

4. **Hero signature abilities.** Pepper's dash, Boulder's slam, Grand Mage's fireball, etc. Each hero starts feeling like *itself*.

5. **Build on a real Mac and deploy to iPad.** [`IOS-BUILD.md`](IOS-BUILD.md) has the full step-by-step. You'd have the game as a native iPad app at this point.

6. **First playtest.** Put it in front of a real kid. Every subsequent design decision should be informed by what they did and didn't like.

7. **App Store submission prep** once the art and audio are in and playtesting confirms the game is actually fun.
