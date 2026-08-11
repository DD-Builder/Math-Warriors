# Math Warriors: Numeria — Full Project Handoff

**Read this entire file before writing any code.** It carries the owner's
instructions, the art direction, the architecture, and — most importantly —
the documented failure modes from a long, partly-failed first attempt. Those
failures are not history; they are the exact traps that will re-bite you.

> **START HERE:** §9 is the single next task. §3 is why previous attempts
> failed. If you read only two sections, read those.

---

## 1. WHAT THIS PROJECT IS

**Math Warriors: Numeria** — a 3D open-world educational math RPG for ages
5–10 in **Three.js**, spun out of a working 2D game, **Math Warriors Classic**.

Two products, two repos, **never developed in one context window**:

| | Repo | State |
|---|---|---|
| **Math Warriors Classic** | `DD-Builder/Math-Warriors` (`main`) | Shipping 2D Phaser game, v0.9.5. Works, deployed, charming. **Never touch from Numeria.** |
| **Math Warriors: Numeria** | `DD-Builder/math-warriors-numeria` | This project. Source: branch `claude/overworld-3d` (29 commits, 235 files, ~87k lines ahead of Classic's main). |

### The owner's brief (verbatim; they restated it three times)

> "You are AGI-pilled. I want you to transform this game into a full open
> world exploration game at the level of Super Mario Odyssey + The Legend of
> Zelda: Tears of the Kingdom. It should be utterly perfect, visually
> beautiful, with every single thing done at AAA quality — from textures to
> physics to anything you could think of. Fan out sub-agents and have
> sub-agents tackle each one individually so that the game is utterly perfect.
> You should /loop on each item and have a separate sub-agent check it
> visually to ensure it looks triple A. That separate sub-agent should be a
> really harsh critic, and if it doesn't look triple A, it should keep going.
> Don't stop until each sub-agent is utterly wowed with the quality when
> compared with the actual Super Mario Odyssey + The Legend of Zelda: Tears of
> the Kingdom games. It should literally compare them side by side blind and
> say which one looks better. Do this in ThreeJS. /loop until it's utterly
> perfect. Fan out sub-agents and ultracode."

And, correctly widening scope:

> "AAA games have excellent art and graphics, but also game play, sound
> effects, and story."

And on parallelism:

> "How many agents are fanned out and working? They should be working in
> parallel not serial."

### Locked decisions (do not re-litigate)

- **The WHOLE game is 3D.** An early build made only the hub 3D and dropped
  the player into a 2D maze on entering a floor. Owner: *"when you enter the
  playing level, it's back to the 2d… That is not what i wanted."*
- **Real physics engine.** Rapier (`@dimforge/rapier3d-compat`), installed and
  lazily chunked.
- **Critic loops run until wowed**, hard ceiling ~10 rounds/domain. Report
  domains that hit the ceiling *unsatisfied* — never fake a pass.
- **In scope:** climb/glide/swim, sky islands, caves, weather + day/night,
  secrets & discovery.
- **Math stays the core.** Reuse `src/systems/math.js generateRatedQuestion`.
  Never write a second question generator.

---

## 2. ART DIRECTION (current — supersedes all earlier passes)

Full spec: **`docs/art-direction-3d.md`** — read it. Summary:

**Super Mario Odyssey (form, colour) + Astro Bot / PS5 (materials, lighting).**

- **ROUNDEDNESS IS LAW.** No raw boxes/cones/hard prisms in the final image.
  Rounded-box, capsule, sphere-blended primitives; bevels everywhere. Tree
  canopies are blobby sphere clusters, not stacked discs.
- **Toy materials.** World = satin matte. Characters, creatures, collectibles,
  interactables = toy gloss (vinyl/ABS, tight speculars) + Fresnel rim.
- **Lighting.** Warm sun key + sky hemisphere + real **ground bounce**
  (undersides tinted by local ground colour). Soft wide penumbra, buttery AO.
- **Animation.** Springy, **critically damped**. Landing squash ≤15% recovering
  <300ms; idle breathing ≤2%. Owner called the old hero *"a stack of jello"* —
  that is the failure mode to avoid.
- **Silhouette test.** Every asset identifiable blacked out. If a tree reads as
  an umbrella or a hero as a stack, it fails.

**Surviving from the 2D identity:** the `PAPER` palette (`src/config.js`) is
the franchise's colour DNA, and **shadows must be COLOURED (teal family) —
never black or grey.** Saturation may lift toward Odyssey brightness. The flat
papercut *slab construction* is retired in 3D; the *palette law* is not.

> ⚠️ **The entire existing codebase predates this direction** — it was built to
> the flat-papercut spec. A full re-skin pass is owed and has not started.

---

## 3. THE HARD-WON LESSONS (read twice)

Every one of these shipped to the owner and was caught by *them*, not by a test.

### 3.1 "Boots" ≠ "Plays" — the central failure

For months every gate verified *the game boots with zero console errors and
tests pass*. **Nobody ever played it.** All ten of the owner's defects lived in
that gap:

> "This sucks. Controls are absolutely abysmal - like totally broken. The sound
> is broken and makes a prolonged high pitched machine sound. There is only a
> jump and nothing else. There are no other characters or animals or anything
> to interact with. The hero looks like a stack of jello. The physics of
> objects doesn't work: you can walk through trees (which are too short and
> look like umbrellas or mushrooms), water doesn't move… I never even found a
> playable level to understand the math combat."

**RULE: the only acceptable evidence is driving the real BUILT game with
synthetic input and observing behaviour.** `e2e/playthrough.spec.js` now
encodes this (see §5).

### 3.2 Unwired modules — happened FOUR times

Agents delivered excellent, fully-tested modules that **nothing imported**:
`battle3d.js` (75KB) orphaned a full round · `traversal.js` verified **100%
dead code** after being "delivered" · `physics.js`/`physicsProps.js` (2285
lines) committed and never imported · `discoverySpec.js` + `puzzles.js`
authored against three helper modules **that were never written**.

**RULE: wiring is the deliverable, not the code.** Every agent finishes by
proving with `grep` that its module has a real importer outside itself and its
test. Audit:

```bash
for f in src/overworld/*.js; do b=$(basename $f .js); case "$b" in *test*) continue;; esac;
  n=$(grep -rl "$b" src e2e --include=*.js | grep -v "/$b\.js" | grep -v "/$b\.test\.js" | wc -l);
  [ "$n" -eq 0 ] && echo "ORPHAN: $b"; done
```

### 3.3 Tests that only check themselves

Self-consistent tables, completely wrong in situ:
- `SOUND_FOR` mapped events to bare names (`climb`) while the SFX library ships
  namespaced keys (`move/climb`) — **every traversal sound resolved to `null`**;
  six battle cues dead the same way.
- `controls3d` exposed no held-button state, so variable jump height was
  *physically impossible* while its tests passed.
- `discoverySpec`'s content had never been run against the real island.
- The playthrough gate's own `expect(foe).toBeTruthy()` passed while the foe's
  coordinates were `undefined` (see 3.5).

### 3.4 Specific bugs found — do not reintroduce

- **The "machine scream"**: the `harp` was a live Karplus-Strong loop, feedback
  0.93, damping lowpass left at WebAudio's default Q. **Lowpass Q is in dB** —
  the default adds +1 dB of resonant peaking *inside the loop* → loop gain
  ≈1.06 > 1 → every harp note self-oscillated into a rising ~3.2 kHz scream,
  following the music everywhere. Fixed **structurally**: no live feedback loop
  exists; the string is pre-rendered offline into a buffer. `MAX_FEEDBACK =
  0.6` is a named constant in `audioGraph.js` with a test, plus a master
  **watchdog** (analyser on the limiter; ducks on non-finite samples or
  sustained hot RMS).
- **Jello hero**: **two independent squash systems** fired on every landing and
  *multiplied* — `heroRig.js` squashed the inner rig node, `gameFeel.js` the
  outer transform, neither aware of the other. Two individually-correct systems
  producing one broken result. Reconciled to a single damped source.
- **Negative-delta debt**: the fixed-step accumulator clamped delta only on the
  upper bound. A negative delta (rAF timestamp lagging `performance.now()`,
  measured −3.3 s under SwiftShader) banked a debt the sim had to pay off
  before stepping — read as "the world never starts". Now clamped both sides.
- **Trees**: trunk collision was proven CORRECT (hero stops within 4 mm of the
  predicted radius). "Walking through trees" is an **art** bug — wide short
  umbrella canopies at head height with (correctly) no collider. Fix the art.
- **Toon ramp**: three's `gradientmap_pars_fragment` samples the ramp's **red
  channel only**, splatted to grey — a carefully authored teal ramp shipped as
  flat grey. Fixed by swapping the shader chunk (`installToonRampRGB`).
- **Camera sensitivity** was 2.8× its own annotated intent.

### 3.5 TWO PARALLEL OBJECT MODELS (new, and it bites)

The scene keeps **rule objects** (tile coords + game state); the 3D app keeps
**handles** (world coords). `worldX`/`worldZ` are populated **only** on island
creature encounters and hero handles — **never on floor objects**. The
playthrough gate read `o.worldX` off a floor rule object, got `undefined`,
teleported nowhere, and timed out looking like "combat is broken".

Mitigation added: **`api.floorObjects()`** in `src/overworld/index.js`
(alongside `api.portals()`), returning live handle coords. Harnesses must ask
the component that *owns* positions. **This mismatch is a latent trap
elsewhere — treat any `worldX` read with suspicion.**

### 3.6 A probe can lie — verify your instrument

I ran a probe that appeared to prove a severe bug (the 3D app holding a floor
while the scene thought none was open). **The probe was invalid**: it called
`scene._enterFloor(1)`, which does not exist, and silently fell through to
`app.enterFloor(1)`, which builds the 3D floor *without* setting scene-side
state. The scene's real entry path is around **`OverworldScene.js:757`**.
Before believing a shocking result, verify the probe called a real API.

### 3.7 Process realities
- **Session/weekly usage limits killed ~50 agents** across waves. Resume
  workflows from cache (`resumeFromRunId`), stagger, **commit constantly**.
- **No network for reference images** (proxy blocks general hosts). Critics
  compare against trained knowledge — never claim a "blind side-by-side" that
  didn't happen.
- **SwiftShader ≠ device.** The screenshot harness is software GL at ~2–6 fps.
  Critics judge composition/palette/silhouette, not AA. **Final judgment is the
  owner on-device.**

---

## 4. TECHNICAL ARCHITECTURE

**Stack:** Phaser 3 (2D shell/HUD/input) + Three.js r170 (3D world) + Rapier +
Vite. `node:test` for units, Playwright for e2e.

**Canvas sandwich (non-obvious):** `#mw-overworld` WebGL canvas sits **UNDER**
a **transparent** Phaser canvas. Phaser owns HUD, transitions, input; Three
owns the world. Gives the Paper UI, opaque scene transitions covering the 3D
view, and the system overlay for free. `#game` CSS supplies the ink-teal ground.

**Determinism:** fixed **60 Hz** accumulator in `renderer.js`. Identical input
traces → identical trajectories at 7 fps and 120 Hz. This is what makes tests
and screenshots reproducible. **Never use wall-clock in simulation.**

**Controller stack order matters:** `traversal → gameFeel → controller`.
`gameFeel` delegates non-walk modes but can never *enter* one; `traversal` is
the only layer that knows how to leave walking. Wrap them the other way and
climb/glide/swim become permanently unreachable.

**Module map** (`src/overworld/`, ~50 modules):
```
WORLD:     heightfield, worldSpec, terrainMesh, geobuild, level3d, level3dBuild
RENDER:    renderer, index (assembly), sky, water, atmosphere, weather,
           materials/{toon,textures,aerialFog}
ACTORS:    heroRig, characterView, companions, creatures, props, vegetation
MOVEMENT:  controller, collision, gameFeel, traversal(+Fx/Hud/Wiring/Spec),
           controls3d
PHYSICS:   physics, physicsProps, floatables
GAMEPLAY:  floorRules, portals, collectibles, battle3d, battleOverlay3d,
           abilities(+Fx/Wiring), progression, discovery(+Spec/Wiring),
           puzzles, shrines, storyPages, rewardCadence, bossArenas
AUDIO:     audio3d + src/systems/{sfxLibrary,synthAudio,music/*}
NARRATIVE: cinematics + src/data/story.js
SUPPORT:   state, poses, timeOfDay
```

**Audio (iOS-critical):** No audio files — everything synthesised. **Exactly
ONE AudioContext**, in `src/systems/music/audioGraph.js`; Phaser's sound
manager is disabled (`audio: { noAudio: true }`) because a second context
breaks iPad. Chain: voices → music/sfx buses → master → safety → **limiter** →
destination; never connect straight to destination. iOS unlock uses
**document-level capture listeners** in `main.js` — do not add handlers that
swallow or `preventDefault` pointer events.

**Rendering constraints (non-negotiable):** three r170 · **no
post-processing** · **no depth-texture reads, no `fwidth`/derivatives** (the
SwiftShader harness must match device) · InstancedMesh/merged for repeats ·
**zero per-frame allocation** · `dispose()` everything · budget on M4 iPad
@1440×1080: **≤250 draw calls, ≤500k tris** (currently ~153 / ~510k — at the
ceiling; the re-skin must not blow it).

**Save:** `src/systems/save.js`, **v6**, strict append-only MIGRATIONS chain. A
missing migration **wipes saves**. 3D state lives additively under
`save.overworld`.

**Build:** Vite `manualChunks`: `phaser`, `three`, `rapier` — three and Rapier
**lazily imported**, never in the eager boot bundle. Current: phaser 1.48MB,
rapier 2.24MB, three 688KB, app ~1.6MB.

---

## 5. THE PLAY-THROUGH GATE (the definition of done)

`e2e/playthrough.spec.js` — run with:
```bash
npx playwright test e2e/playthrough.spec.js --project=3d
```
It drives the **built** game with synthetic touch/keyboard through a full
session, screenshotting each step to `e2e/screenshots/playthrough/`:

| Step | What it proves | Status |
|---|---|---|
| 1 | Arrival cinematic + orientation dialogue | ✅ PASS |
| 2 | Touch-stick drive, camera orbit, jump | ✅ PASS |
| 3 | Walk into a tree → **blocked** | ✅ PASS |
| 4 | Companions, creature, water motion, hero close-up | ✅ PASS |
| 5 | Compass → portal prompt → title card → **real 3D floor** (asserts no `BattleScene`, `activeFloor===1`, real geometry) | ✅ PASS |
| 6 | Encounter → numpad → victory → rewards | ❌ **FAILS** |

19 screenshots exist as evidence for steps 1–5.

**Never replace this gate with a "boots clean" check.** Other e2e:
`--project=2d` (Classic's suite, must stay green) and `--project=3d`
(WebGL specs under SwiftShader flags).

---

## 6. CURRENT STATE

**2680 unit tests passing. Build clean. Branch pushed.**

### Working (verified by driving the built game)
- 3D island (480 m, 9 floor-themed biomes): terrain, water, sky, weather,
  day/night, vegetation.
- **Floors load as real 3D places** via `buildLevel3D(floorId)` — no 2D maze.
- Real hero rigs from the actual hero art; companions follow **and speak
  banter**; creatures roam.
- Physics toybox (crates, logs, ball, plank) with SHOVE; SWAP party switching.
- Portal beacons + compass (addresses "never found a playable level").
- 3D battles staged in-world with a 2D math overlay.
- Positional audio, procedural SFX, adaptive music with main theme *"Nine Paper
  Roads"* (stored as scale degrees so it transposes and recurs).
- Story: 9-beat arc where the collected proof pages **are** the villain.

### Broken / unfinished — be honest about these
1. **Combat does not resolve.** See §9 — the single next task.
2. **Level art scored 3.3/10** by a harsh critic vs the island's 7/10. Their
   diagnosis: *"The engine is not the problem. The levels were not composed."*
   Nothing in a level is taller than ~2.9 m → flat skylines, no landmark to
   navigate toward, spawn on the flattest terrace.
3. **Tree art** still reads as umbrellas/mushrooms.
4. **The Mario/Astro re-skin has not started** — all art is to the retired
   papercut spec.
5. `bossArenas.js` is still orphaned.
6. Draw calls at 153 and tris at ~510k are **at/over budget** before the
   re-skin adds anything.

---

## 7. HOW TO WORK ON THIS

1. **Fan out agents in parallel**, not serially — the owner explicitly asked.
   10–15 concurrent via the Workflow tool is reasonable.
2. **File ownership:** exactly ONE agent owns `index.js` and
   `OverworldScene.js` per wave; everyone else creates new files and *reports
   wiring lines* for the integrator to apply.
3. **Every wave ends with the play-through gate.** No "boots clean" substitutes.
4. **Critic loops:** separate harsh critics scoring against SMO/TotK from
   memory, producing ranked file-level defect lists that drive the next round.
   A 7/10 should be rare. Report unsatisfied ceilings.
5. **Commit and push constantly** — usage limits kill agents mid-flight.
6. **Never overstate.** The owner has repeatedly caught claims outrunning
   evidence (e.g. "the overworld is the hub" when `goHub()` had zero callers).
   If you have not observed it, say so.

---

## 8. GETTING THE CODE INTO THE NUMERIA REPO

The source is `claude/overworld-3d` in `DD-Builder/Math-Warriors` (29 commits
ahead of Classic's `main`). From a local clone of Math-Warriors:

```bash
git fetch origin claude/overworld-3d
git remote add numeria https://github.com/DD-Builder/math-warriors-numeria.git
git push numeria origin/claude/overworld-3d:refs/heads/main
```

History intact. (Ask if a squashed single-commit start is preferred instead.)

**Latest playable build** (pre-gate, for reference):
https://claude.ai/code/artifact/1b156991-2c7e-4804-befd-ec52a0c7c62e

---

## 9. THE SINGLE NEXT TASK

**Make `e2e/playthrough.spec.js` step 6 pass: a fight must trigger AND
RESOLVE.**

Latest evidence, from an agent stopped mid-investigation:
> *"The fight runs but doesn't resolve in 6 min."*

So combat **does** trigger inside a 3D floor — the earlier "combat is broken"
reading was the coordinate bug in 3.5. The real problem is the fight not
**concluding**. Start there, not from trigger-path theories.

Suspects to instrument (verify, don't trust):
- `battle3d.js` turn loop — does it advance? Does a correct answer land damage?
  Does enemy HP reach 0? Is the victory transition ever fired?
- The 2D math overlay (`battleOverlay3d.js`) — does the numpad's answer reach
  the rules layer, or does the fight stall waiting for input that never arrives?
- `_startBattle`'s 2D fallback: `!app.startBattle || party.length===0 ||
  enemies.length===0` starts the old `BattleScene` and `battleActive()` stays
  false forever — confirm which path actually ran.
- The step-6 timeout is generous but SwiftShader is ~2–6 fps; assert on **sim
  state**, not wall-clock.

**Done means:** the gate passes, `npm test` still ≥2680, `npm run build` clean,
`--project=2d` green, and a pass/fail table for the owner's ten defects with a
screenshot per row — anything unprovable marked FAILED.

---

## 10. STORY BIBLE (short form)

Numeria is losing its numbers. The Chaos King is revealed as **The Theorem** —
the Great Story's discarded first draft, a proof that concluded the world
"doesn't add up". Each floor's midpoint yields one line of his handwriting;
read in order, the collected pages **are** the villain. Victory is
**completing** him, not destroying him — floor 9 is the party writing the line
he never could. Heroes are rescued from themed prisons along the way. Nine
floors: Sprout Garden, Tidepool Shallows, Sky Cliffs, Ember Slopes, Frost
Fields, Crystal Hollow, Market Town, Canyon Library, Paper Palace. Data in
`src/data/story.js`, `src/data/levels.js` lore headers, `src/data/dialogue.js`.

---

*Updated at pause. Branch `claude/overworld-3d` @ `204beaf`, 2680 tests green,
working tree clean, everything pushed.*
