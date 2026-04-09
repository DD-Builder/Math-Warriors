# Prototype v0 — Audit Findings

Full list of issues found in the original single-file prototype, ordered by severity. This document exists to make sure we don't re-introduce any of these bugs in v1.

---

## CATASTROPHIC — Nothing rendered correctly

### 1. CSS custom properties used `–` (en-dash) instead of `--`
Every `:root` variable declaration was syntactically invalid CSS. Every `var()` reference throughout the stylesheet returned nothing. The UI had essentially no colors, typography, or sizing applied. This single bug explains ~80% of the "looks broken" impression.

### 2. Font-family strings used curly/smart quotes
`'Press Start 2P'` with U+2018/U+2019 instead of ASCII `'`. CSS parsing failed; canvas `G.font` strings with curly quotes fell back to default monospace. Several JS string literals had the same problem — if the real file used those characters, the scripts wouldn't have parsed at all.

---

## CRITICAL — Major subsystems broken

### 3. Enemy selection picked the wrong monster on every non-Garden floor
```js
enemyN = Math.min(GS.floor - 1, ENEMY_LIST.length - 1);
```
`ENEMY_LIST` had 25 entries (5 per floor). `floor - 1` gave 0–4, always a Garden enemy. Floor 2 fought THORNWALL instead of DRIFTER. Floor 5's "boss" was BRIAR KING.

`initLevel` correctly stuffed the right enemy into `GAME.pendingMonster`, but `BA_start` ignored `pendingMonster` entirely.

### 4. The entire boss system was dead code
`BOSSES` array, `drawSigma`, `drawNull`, `drawManyfold`, `drawSchism`, `drawUnknown` — ~1000 lines total — were defined but never referenced by anything.

### 5. Boss draw functions called methods that didn't exist
- `drawSigma` → `R.shadow(...)` (should be `gshadow`)
- `drawNull` → `R.mkpath(...)` (doesn't exist at all)
- `drawManyfold`, `drawSchism`, `drawUnknown` → `R.shadow(...)`

Would have crashed on first draw if wired up.

### 6. Event listener stacking — damage multiplied on every re-entry
`BA_start()` set `onclick=null` (pointless — it doesn't remove `addEventListener` handlers) and then added another listener. After N battles, one tap fired `answer()` N times. Same bug on `#b-end-btn`.

`initLevel()` had the same bug with `window.keydown/keyup`, d-pad touch buttons, and the minimap toggle.

### 7. Potion button was completely non-functional
The button, count display, and CSS all existed. The click handler was never attached. Comment literally said:
```js
// Potion button wired dynamically in BA_start
```
…and then it wasn't.

### 8. Grade selection was a placebo
`GAME.grade` was set by the K–5 picker and **never read by anything**. A kindergartner and a 5th grader got identical math.

---

## HIGH — Battle logic bugs

### 9. Monsters effectively never respawned
```js
oRef.respawnAt = Date.now() + 3600000; // 1hr: effectively permanent
```
The comment admits it. Only 5 monsters per floor, each one-shot.

### 10. Momentum multiplier asymmetric (harms the player)
- Hero COOL: −25% damage
- Hero ZONE: +25% damage
- Hero HEAT: no bonus *(but enemy HEAT: +40%)*
- Enemy COOL / ZONE: no penalty

HEAT was strictly worse for the player.

### 11. `genQ` could produce `undefined` answer buttons
The wrong-answer generator had a 50-try cap and no guarantee of 3 unique values. Unlucky RNG → button labeled `undefined`.

### 12. Sporulate ability always hit hero slot 0
```js
dmg(HEROES[currentTurn().idx || 0], ab.counter * 2, false);
```
On enemy turns, `idx` was undefined → `undefined || 0 = 0`. Every sporulate counter hit hero 0 specifically.

### 13. Runebound / Grimoire abilities regenerated `CQ` mid-animation
Calling `showQuestion()` inside `triggerAbility()` changed the question while the player's answer was still in flight.

### 14. `setTimeout`-scheduled turn advances leaked across screen changes
`setTimeout(nextTurn, 700)` and similar still fired after the user navigated away.

### 15. Defeat didn't restore party HP
`victory()` wrote `HEROES[i].hp` back to `GS.party[i].hp`. `defeat()` did not. Stale state persisted into the next battle.

---

## MEDIUM — Maze / rendering bugs

### 16. Map tile values 3 and 4 had no renderer
Tile 3 fell through as water, tile 4 fell through to floor. The "chest room" in rows 15–16 was drawn as water. `LV_walkable` only rejected walls, so everything else was walkable regardless of what it looked like.

### 17. `LV_TS = 4` declared but never used anywhere

### 18. `drawHeroPortrait` always took the fallback branch
```js
var heroRef = h.portraitDraw && h.portraitDraw._topExt ? h.portraitDraw : null;
```
`_topExt` was never set on any draw function. `heroRef` was always null. Every portrait used the same hardcoded 80/78 extents.

### 19. Canvas allocations on high-DPI devices were enormous
`BA_start()` used `Math.round(vw * dpr)` with no DPR clamp. On a 3× DPR phone at 1170×2532, that's ~107 megapixels × 4 bytes = ~427 MB of canvas backing store. Safari would silently cap or crash.

### 20. `R.glow` used `G.filter = 'blur(Npx)'` with no fallback
Unsupported in older iOS Safari. Glow effects silently rendered as solid ellipses.

### 21. `bumpStrip` called `G.ellipse` directly with no shim
Shim wrappers existed elsewhere (`LV_ellipse`) but weren't used here.

### 22. `mkRng` was defined twice with different algorithms
Top-level LCG was silently overwritten by the battle engine's XOR-shift, changing the wobble determinism from what was designed to whatever the battle engine produced.

---

## LOW — Code quality / dead code

### 23. `GAME.heroKills`, `GAME.heroLevels` — tracked in initial state, never read or written

### 24. `GAME.pendingMonster` — set in the maze, never consumed

### 25. `WORLDS[5]` tooltip said "COMPLETE ALL 4 FLOORS TO UNLOCK" but the unlock code was linear (N−1 → N)

### 26. Two separate floor-unlock paths (`onFloorComplete` and `WM_onFloorComplete`) that partly duplicated each other

### 27. Error overlay (`MW_showErr`, `window.onerror`) shipped to production

### 28. `LV_party.trail` stored 42 positions but only 2 followers were ever rendered

### 29. `confirmParty` hard-coded stats per class, ignoring the hero's actual identity. All 5 knights had identical stats.

### 30. `BA_draw` set `G.shadowBlur = 0` at the top of every frame, killing the papercut depth effect in the battle background that monster drawing expected to work

---

## Missing / never implemented

- No audio system at all
- No save/load — closing the tab lost everything
- No pause menu
- No defeat-recovery path other than manual re-entry
- No way to heal between battles
- No tutorial / how-to-play
- Portrait mobile was outright blocked by `#rotate-prompt`

---

## What we're doing differently in v1

| Prototype problem | v1 approach |
|---|---|
| Single 100KB file | Modular Phaser scenes in separate files |
| Bespoke polygon renderer | Sprite images, engine-managed |
| Broken CSS variables | Proper CSS (no Unicode dashes) |
| Manual `addEventListener` leaks | Phaser scene lifecycle handles teardown |
| No save/load | `localStorage` save system from day one |
| No audio | Phaser audio manager wired in from the title scene |
| Dead boss code | No bosses until a boss is actually designed & built |
| Grade placebo | Grade actually drives a difficulty curve in the math generator |
| Tile rendering by value-check | Phaser Tilemap system |
| Manual damage number sprites | Phaser tweens on Text objects |
| DPR-unbounded canvas | Phaser handles DPR |
