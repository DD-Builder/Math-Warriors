# Math Warriors — Technical Architecture

**Status:** v0.1 scaffold. Subject to change as we learn what the game actually needs.

---

## Stack decision

| Layer | Choice | Why |
|---|---|---|
| **Game engine** | Phaser 3 | Mature, free, 2D-focused, ships to iOS via Capacitor with zero rewrite |
| **Build tool** | Vite | Instant hot reload, zero config, modern ES modules |
| **Language** | Vanilla JavaScript (ES2020+) | No TypeScript friction for rapid iteration; can promote later if needed |
| **Assets** | Static PNG/WebP sprites, MP3/OGG audio | Loaded via Phaser's asset pipeline; one folder per level/style |
| **Storage** | `localStorage` for saves | No server, no account, works offline, ships with Capacitor unchanged |
| **Deploy** | GitHub Actions → GitHub Pages | Free, automatic on push to main, public URL for iPad playtesting |
| **iOS wrapper** | Capacitor (deferred) | When the web game is fun, we wrap it for App Store |

## What we explicitly rejected

- **Unity** — overkill for 2D, licensing uncertainty, larger binary, slower iteration
- **Godot** — great engine, but requires local install for playtesting; web-first iteration is better for our loop
- **Swift + SpriteKit** — best native feel but iOS-only, slow dev loop, needs Xcode running for every change
- **React Native / Flutter + Flame** — neither is a real gamedev path for this scale
- **The prototype's hand-authored Canvas 2D polygon renderer** — bespoke, buggy, hard to extend, and the user didn't love the output anyway

## Folder layout

```
Math-Warriors/
├── index.html              # Single-page entry
├── vite.config.js          # Build config
├── package.json            # npm manifest
├── src/
│   ├── main.js             # Phaser game bootstrap
│   ├── config.js           # Game constants (screen size, colors, etc.)
│   ├── scenes/
│   │   ├── BootScene.js        # Asset loading + splash
│   │   ├── TitleScene.js       # Title screen + START button
│   │   ├── GradeSelectScene.js # K–5 picker
│   │   ├── PartySelectScene.js # Hero picker
│   │   ├── WorldMapScene.js    # Floor selector
│   │   ├── MazeScene.js        # Tile-based maze
│   │   └── BattleScene.js      # Turn-based math combat
│   ├── systems/
│   │   ├── math.js             # Question generator, difficulty tables
│   │   ├── combat.js           # Damage calc, momentum, turn order
│   │   ├── save.js             # localStorage wrapper
│   │   └── audio.js            # Music + SFX manager
│   ├── data/
│   │   ├── heroes.js           # Hero roster (stats, sprite keys, abilities)
│   │   ├── enemies.js          # Enemy roster (stats, abilities, floor assignment)
│   │   ├── floors.js           # Floor configs (tilemap, palette, music, enemy pool)
│   │   └── difficulty.js       # Grade-level difficulty tables
│   └── ui/
│       ├── Button.js           # Reusable UI button
│       ├── HealthBar.js        # HP bar display
│       └── MomentumMeter.js    # Battle momentum UI
└── public/
    └── assets/
        ├── sprites/            # Character / enemy / UI sprites
        ├── audio/              # Music + SFX
        ├── fonts/              # Custom fonts (if not using Google Fonts)
        └── tilemaps/           # Maze level data (JSON + tileset PNGs)
```

**Rule:** anything that can be data should be data, not code. Hero rosters, enemy stats, floor configs, and math difficulty tables all live in `src/data/` as plain JS objects. Code in `src/systems/` and `src/scenes/` reads those objects but never hard-codes values.

## Scene flow

```
Boot → Title → GradeSelect → PartySelect → WorldMap ⇄ Maze ⇄ Battle
                                               ↑___________________|
                                          (victory / defeat / flee)
```

Phaser scenes handle their own setup and teardown via `create()` / `shutdown()`. No scene retains state across transitions — **all persistent state lives in the save system**, which is the single source of truth.

## Data model (save file)

```js
{
  version: 1,                  // bump when save format changes
  grade: 3,                    // 0-5 (K-5)
  party: [                     // 3 heroes
    { id: 'knight-shadow',  hp: 50, maxHp: 50 },
    { id: 'wizard-grandmage', hp: 40, maxHp: 40 },
    { id: 'bunny-pepper',   hp: 45, maxHp: 45 }
  ],
  gold: 125,
  potions: 2,
  floors: [
    { id: 1, unlocked: true,  complete: true,  bestStreak: 12 },
    { id: 2, unlocked: true,  complete: false, bestStreak: 0 },
    { id: 3, unlocked: false, complete: false, bestStreak: 0 },
    { id: 4, unlocked: false, complete: false, bestStreak: 0 },
    { id: 5, unlocked: false, complete: false, bestStreak: 0 }
  ],
  settings: {
    musicVolume: 0.8,
    sfxVolume: 1.0,
    reducedMotion: false
  },
  stats: {
    totalBattles: 42,
    totalCorrect: 187,
    totalWrong: 31,
    playTimeSec: 4280
  }
}
```

**Versioning:** bump `version` when the shape changes. Write a one-way migration from each old version to the current one. Never assume a save file is current.

## Math question generator contract

```js
// src/systems/math.js
export function generateQuestion(opts) {
  // opts: { operator, grade, recentQuestions }
  // returns: { a, b, op, answer, choices: [n, n, n, n], correctIndex }
}
```

**Requirements:**
- `choices` is always length 4
- All four values are distinct integers
- `choices[correctIndex] === answer` is always true
- `answer` is always a whole number (no fractions in v1)
- If `op === '/'`, `a` is always a clean multiple of `b`
- If `op === '-'`, `answer` is always non-negative
- Never produces `undefined` in `choices` (the prototype had this bug)

## Combat contract

```js
// src/systems/combat.js
export function applyDamage(target, amount, opts) {
  // opts: { source: 'hero' | 'enemy', momentum: 0..1 }
  // returns: { damageDealt, newHp, killed }
}

export function advanceMomentum(current, delta, streak) {
  // returns: new momentum 0..1
}
```

All combat math goes through these functions. **Never mutate a target's HP directly from a scene.**

## Asset pipeline

1. **Source art** lives outside this repo (art drive, AI gen output, etc.).
2. Export to PNG at 2× or 3× the display size (for Retina).
3. Drop into `public/assets/sprites/<category>/<level>/`.
4. Register the asset key in the relevant scene's `preload()`.
5. Reference by key in `create()`.

**Naming convention:** `<category>-<name>-<state>.png` (e.g., `hero-knight-shadow-idle.png`, `enemy-sproutling-attack.png`, `ui-button-start.png`).

## Per-level art style support

Each floor declares its `styleBucket`:

```js
// src/data/floors.js
export const FLOORS = [
  { id: 1, name: 'The Garden',      styleBucket: 'level-1-papercut' },
  { id: 2, name: 'Tidepool Ruins',  styleBucket: 'level-2-claymation' },
  // ...
];
```

Asset loader resolves sprite paths through the style bucket, so swapping art styles for a level is a folder swap, not a code change.

## Responsiveness & device support

- **Target resolution:** 1920×1080 logical (Phaser scales to fit)
- **Aspect ratio:** 16:9 primary; clamp letterbox on other ratios
- **Orientation:** Landscape only; prompt on portrait
- **DPR:** Phaser handles; we clamp to 2 for memory sanity
- **Touch:** All interactions must work with taps only, no hover, no right-click

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):

1. Trigger: push to `main`
2. Install Node.js + dependencies
3. `npm run build`
4. Upload `dist/` as Pages artifact
5. Deploy to Pages environment

The live URL is `https://<user>.github.io/Math-Warriors/`. Configure in repo Settings → Pages → Source: GitHub Actions.

## Testing plan

**v0.1:** None beyond "does it run." Manual playtest via the deployed URL.

**v0.5:** Add unit tests for `math.js` (question generator correctness) and `combat.js` (damage math). Framework: Vitest (Vite-native).

**v1.0:** Add smoke tests for each scene's `create()` → `shutdown()` cycle. Add a "cheat mode" toggle for faster playtesting.

## Performance targets

- **Load time:** under 3 seconds on a 2020 iPad over LTE
- **Frame rate:** 60 fps on iPad Air 4 and newer; 30 fps acceptable on iPad 7
- **Memory:** under 200 MB resident
- **Bundle size:** under 5 MB gzipped (Phaser itself is ~1 MB)

## Future considerations

- **Localization** — math games travel well. Design strings to be externalized even if we only ship English in v1.
- **COPPA compliance** — if we ever collect any data from kids, we're subject to COPPA in the US. For v1 we collect nothing, which is the safest path.
- **Parent gate** — App Store requires a parent gate for any "leave the app" link. Plan for one.
- **iCloud save sync** — nice to have for families with multiple iPads. Deferred.
- **Multiplayer** — explicitly out of scope for v1.
