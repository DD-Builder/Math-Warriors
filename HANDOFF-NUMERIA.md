# Math Warriors: Numeria — Full Project Handoff

**Read this entire file before writing any code.** It carries the owner's
instructions, the art direction, the architecture, and — most importantly —
the hard-won lessons from a long and partly failed first attempt. The failures
documented here are not history; they are the specific traps that will re-bite
you if you do not read them.

---

## 1. WHAT THIS PROJECT IS

**Math Warriors: Numeria** is a 3D open-world educational math RPG for ages
5–10, built in **Three.js**, spun out of a working 2D game called **Math
Warriors Classic**.

Two separate products, two separate repos, never to be developed in one
context window:

| | Repo | State |
|---|---|---|
| **Math Warriors Classic** | `DD-Builder/Math-Warriors` (`main`) | Shipping 2D Phaser game, v0.9.5. Charming, working, deployed. **Do not touch from the Numeria repo.** |
| **Math Warriors: Numeria** | the new repo | This 3D project. Started from branch `claude/overworld-3d`. |

### The owner's original brief (verbatim, re-stated by them three times)

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

And later, correctly widening the scope:

> "AAA games have excellent art and graphics, but also game play, sound
> effects, and story."

### Owner decisions already made (do not re-litigate)

- **The WHOLE game is 3D.** An early version made only the hub 3D and dropped
  the player back into a 2D maze on entering a floor. The owner's verdict:
  *"when you enter the playing level, it's back to the 2d, not our 3d world.
  That is not what i wanted."* Floors, battles, everything: 3D.
- **Physics:** a real engine. Rapier (`@dimforge/rapier3d-compat`) is already
  installed and lazily chunked.
- **Critic loops:** run until the critic is wowed, with a hard round ceiling
  (~10) per domain. Report domains that hit the ceiling *unsatisfied* rather
  than pretending they passed.
- **Scope includes:** traversal verticality (climb/glide/swim), sky islands,
  caves, weather + full day/night, secrets & discovery.
- **Math stays the core.** This is an educational game. Exploring leads to
  math. Never write a second question generator — reuse
  `src/systems/math.js generateRatedQuestion`.

---

## 2. ART DIRECTION (CURRENT — supersedes earlier passes)

The owner changed direction late and deliberately. **The full spec lives in
`docs/art-direction-3d.md` — read it.** Summary:

**Follow Super Mario Odyssey (form, colour) and Astro Bot / PS5 (materials,
lighting).**

- **ROUNDEDNESS IS LAW.** No raw boxes, cones, or hard-extruded prisms in the
  final image. Rounded-box/capsule/sphere-blended primitives; bevels on
  everything. Tree canopies are blobby sphere clusters, not stacked discs.
- **Toy materials.** World = satin matte. Characters, creatures, collectibles,
  interactables = toy gloss (tight speculars, vinyl/ABS feel), with a Fresnel
  rim to pop silhouettes.
- **Lighting.** Warm sun key + sky hemisphere + a real **ground-bounce** term
  (undersides tinted by local ground colour). Soft wide shadow penumbra,
  buttery AO in crevices.
- **Animation.** Springy and **critically damped**. Squash on landing ≤15%,
  recovering <300ms; idle breathing ≤2%. The owner described the previous hero
  as *"a stack of jello"* — that is the exact failure mode to avoid.
- **Silhouette test.** Every asset must be identifiable blacked out. If a tree
  reads as an umbrella or a hero reads as a stack, it fails.

**What survives from the original 2D identity:** the `PAPER` palette in
`src/config.js` is the franchise's colour DNA, and **shadows must be COLOURED
(teal family) — never black, never grey.** Saturation/value may lift toward
Odyssey brightness. The flat papercut *slab construction* is retired in 3D;
the *palette law* is not.

---

## 3. THE HARD-WON LESSONS (read this section twice)

These are the actual failure modes that cost this project weeks. Each one
shipped to the owner and was caught by them, not by any test.

### 3.1 "Boots" ≠ "Plays" — the central failure

Every gate for months verified *the game boots with zero console errors and
tests pass*. **Nobody ever played it.** All ten of the owner's eventual
defects lived in that gap. Their verdict:

> "This sucks. Controls are absolutely abysmal - like totally broken. The
> sound is broken and makes a prolonged high pitched machine sound. There is
> only a jump and nothing else. There are no other characters or animals or
> anything to interact with. The hero looks like a stack of jello. The physics
> of objects doesn't work: you can walk through trees (which are too short and
> look like umbrellas or mushrooms), water doesn't move… I never even found a
> playable level to understand the math combat."

**RULE: the only acceptable evidence is driving the real BUILT game with
synthetic input and observing behaviour.** A play-through gate — move, get
blocked by a tree, follow a marker, enter a level, fight, win, exit — with
screenshots at every step, is the definition of done.

### 3.2 Unwired modules — happened FOUR times

Agents repeatedly delivered excellent, fully-tested modules that **nothing
imported**:
- `battle3d.js` (75KB) sat orphaned for a full round.
- `traversal.js` (climb/glide/swim) was verified **100% dead code** after
  being "delivered" — nothing imported it, nothing tested it.
- `physics.js`/`physicsProps.js` (2285 lines) committed and never imported.
- `discoverySpec.js` + `puzzles.js` authored against three helper modules that
  **were never written**.

**RULE: wiring is the deliverable, not the code.** Every agent must finish by
proving, with `grep`, that its module has a real importer outside itself and
its own test. Run this audit regularly:

```bash
for f in src/overworld/*.js; do b=$(basename $f .js); case "$b" in *test*) continue;; esac;
  n=$(grep -rl "$b" src e2e --include=*.js | grep -v "/$b\.js" | grep -v "/$b\.test\.js" | wc -l);
  [ "$n" -eq 0 ] && echo "ORPHAN: $b"; done
```

### 3.3 Unit tests that only check themselves

Several tables were self-consistent and completely wrong in situ. Examples:
- `SOUND_FOR` mapped traversal events to bare names (`climb`) while the SFX
  library ships namespaced keys (`move/climb`) — **every traversal sound
  resolved to `null`.** Six battle cues were dead the same way.
- `controls3d` exposed no held-button state, so variable jump height was
  *physically impossible* while its tests passed.
- `discoverySpec`'s content had never once been run against the real island.

**RULE: integration probes against the built game, not just unit tests.**

### 3.4 Specific bugs found by forensics (do not reintroduce)

- **The "machine scream"**: the `harp` instrument was a live Karplus-Strong
  loop with feedback 0.93 and a damping lowpass left at WebAudio's default Q.
  **Lowpass Q is in dB** — the default adds +1 dB of resonant peaking *inside
  the loop*, giving loop gain ≈1.06 > 1. Every harp note self-oscillated into
  a rising ~3.2 kHz scream. Fixed structurally: no live feedback loop exists;
  the string is pre-rendered offline into a buffer. `MAX_FEEDBACK = 0.6` is
  now a named constant in `audioGraph.js` with a test on it, plus a master
  **watchdog** (analyser on the limiter output; ducks on non-finite samples or
  sustained hot RMS).
- **Negative delta debt**: the fixed-step accumulator clamped delta only on
  the upper bound. A negative delta (rAF timestamp lagging `performance.now()`,
  measured −3.3 s under SwiftShader) banked a debt the sim had to pay off
  before stepping — read as "the world never starts". Now clamped both sides.
- **Trees**: trunk collision was proven CORRECT (hero stops within 4 mm of the
  predicted radius). The "walking through trees" complaint is an **art**
  problem — wide short umbrella canopies at head height with (correctly) no
  collider. Fix the art, not the physics.
- **Camera sensitivity** was 2.8× its own annotated intent.
- **Toon ramp**: three's `gradientmap_pars_fragment` samples the ramp's **red
  channel only**, splatted to grey — so a carefully authored teal ramp shipped
  as flat grey. Fixed by swapping the shader chunk (`installToonRampRGB`).

### 3.5 Process
- **Session/weekly usage limits killed ~50 agents** across waves. Mitigate:
  resume workflows from cache (`resumeFromRunId`), stagger waves, commit often.
- **No network access** for reference images (proxy blocks all general hosts).
  Critics cannot literally view SMO/TotK screenshots; they compare against
  trained knowledge. Do not claim a "blind side-by-side" that didn't happen.
- **The screenshot harness runs SwiftShader software GL**, which differs from a
  real iPad GPU. Critics judge composition/palette/silhouette, not AA quality.
  **Final judgment is always the owner on-device.**

---

## 4. TECHNICAL ARCHITECTURE

### Stack
Phaser 3 (2D shell/HUD/input) + Three.js r170 (3D world) + Rapier
(`@dimforge/rapier3d-compat`) + Vite. Node `node:test` for unit tests,
Playwright for e2e.

### The canvas sandwich (important, non-obvious)
`#mw-overworld` WebGL canvas sits **UNDER** a **transparent** Phaser canvas.
Phaser owns HUD, transitions, input; Three owns the world. This gives the
existing Paper UI components, opaque scene transitions that cover the 3D view,
and the system overlay for free. `#game` CSS supplies the ink-teal background.

### Determinism
Fixed **60 Hz** simulation accumulator in `renderer.js`. Identical input traces
produce identical trajectories at 7 fps (SwiftShader) and 120 Hz (ProMotion).
This is what makes screenshots and tests reproducible. **Never** use wall-clock
in simulation.

### Module map (`src/overworld/`, ~50 modules)
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

**Controller stack order matters:** `traversal → gameFeel → controller`.
`gameFeel` delegates non-walk modes but can never *enter* one; `traversal` is
the only layer that knows how to leave walking. Wrapping them the other way
makes climb/glide/swim permanently unreachable.

### Audio constraints (iOS-critical)
- **No audio files.** Everything is synthesised procedurally in WebAudio.
- **Exactly ONE AudioContext**, in `src/systems/music/audioGraph.js`. Phaser's
  sound manager is disabled (`audio: { noAudio: true }`) — a second context
  breaks iPad.
- Signal chain: voices → music/sfx buses → master → safety → **limiter** →
  destination. Never connect straight to destination.
- iOS unlock uses **document-level capture listeners** in `main.js`. Do not add
  handlers that swallow or `preventDefault` pointer events, or audio dies.

### Rendering constraints (all non-negotiable)
- three r170. **No post-processing / EffectComposer.**
- **No depth-texture reads. No `fwidth`/derivatives** — the SwiftShader
  screenshot harness must match the device.
- InstancedMesh/merged geometry for anything repeated.
- **Zero per-frame allocation.** `dispose()` everything.
- Budget on M4 iPad @1440×1080: **≤250 draw calls, ≤500k triangles**.
  (Currently ~128 draws / ~480k tris on the island.)

### Save system
`src/systems/save.js`, currently **v6**, strict append-only MIGRATIONS chain.
A missing migration step **wipes saves**. Add fields to `makeDefaultSave()`,
append a migration, coerce in `normalize()`, extend `save.test.js`. 3D state
lives additively under `save.overworld`.

### Testing
- `npm test` — node:test, **2680 passing**. This is the deploy gate.
  Pure-logic modules (no three/DOM at import) get `.test.js` siblings.
- `npx playwright test --project=2d` — the 2D fallback game, must stay green.
- `npx playwright test --project=3d` — WebGL specs, run under SwiftShader
  (`--use-angle=swiftshader --enable-unsafe-swiftshader`). The two projects
  exist because software WebGL is ~10× slower and broke timing-sensitive 2D
  specs.
- Forensic probes and evidence live in `.forensics/`.

### Build
Vite. `manualChunks`: `phaser`, `three`, `rapier` — three and Rapier are
**lazily imported** so they never enter the eager boot bundle.
Current: phaser 1.48MB, rapier 2.24MB, three 688KB, app ~1.6MB.

---

## 5. CURRENT STATE

### Working
- 3D island (480 m, 9 biomes themed to the floors) with terrain, water, sky,
  weather, day/night, vegetation.
- Floors load as **3D places** via `buildLevel3D(floorId)` — no 2D maze.
- Real hero rigs built from the actual hero art; companions follow and speak
  banter; creatures exist.
- Physics toybox (logs, crates, ball, plank) with SHOVE; SWAP party switching.
- 3D battles staged in-world with a 2D math overlay.
- Positional audio, procedural SFX library, adaptive music with a main theme
  ("Nine Paper Roads", stored as scale degrees so it transposes/recurs).
- Story: a 9-beat arc where the collected proof pages *are* the villain.
- 2680 tests green, build clean.

### Known broken / unfinished (be honest about these)
- **The play-through gate has never completed a pass.** This is the single
  most important outstanding item.
- Hero "jello" deformation not yet confirmed fixed.
- Level art scored **3.3/10** by a harsh critic vs the island's 7/10. Their
  diagnosis: *"The engine is not the problem. The levels were not composed."*
  Nothing in a level is taller than ~2.9 m, so skylines are flat with no
  landmark to navigate toward.
- Tree art (umbrella/mushroom read) not yet rebuilt to the Mario/Astro spec.
- Portal discoverability: the owner never found a playable level. Needs a
  compass/waypoint and arch beacons.
- **The entire codebase predates the Mario/Astro art direction** — it was built
  to the flat-papercut spec. A full re-skin pass is owed.
- `bossArenas.js` is still orphaned.

---

## 6. HOW TO WORK ON THIS

1. **Fan out agents in parallel**, not serially. The owner explicitly called
   this out: *"They should be working in parallel not serial."* Use the
   Workflow tool; 10–15 concurrent agents is reasonable.
2. **File ownership discipline.** When agents run in parallel, exactly one
   agent owns `index.js` and `OverworldScene.js`; everyone else creates new
   files and *reports wiring lines* for the integrator to apply.
3. **Every wave ends with a play-through gate.** No exceptions, no "boots
   clean" substitutes.
4. **Critic loops**: separate harsh-critic agents that score against SMO/TotK
   from memory, produce ranked file-level defect lists, and drive the next
   build round. A 7/10 should be rare. Report unsatisfied ceilings honestly.
5. **Commit and push often** — usage limits kill agents mid-flight; uncommitted
   work is lost work.
6. **Never overstate.** The owner has repeatedly caught claims that outran the
   evidence ("the overworld is the hub" when `goHub()` had zero callers). If
   you have not observed it, say so.

---

## 7. NAMING

Repo is `math-warriors-numeria`. Suggested in-game titles:
- **Math Warriors: Numeria** — the world is already named Numeria in the story
  ("Numeria is quietly losing its numbers…"), so the title doubles as lore.
- *Math Warriors World* · *Math Warriors: The Great Story*

---

## 8. STORY BIBLE (short form)

Numeria is losing its numbers. The Chaos King is eventually revealed as **The
Theorem** — the Great Story's discarded first draft, a proof that concluded the
world "doesn't add up". Each floor's midpoint yields one line of his
handwriting; read in order, the collected pages **are** the villain. The
victory is **completing** him, not destroying him — floor 9 is the party
writing the line he never could. Heroes are rescued from themed prisons along
the way. Nine floors: Sprout Garden, Tidepool Shallows, Sky Cliffs, Ember
Slopes, Frost Fields, Crystal Hollow, Market Town, Canyon Library, Paper
Palace. Full data in `src/data/story.js`, `src/data/levels.js` lore headers,
and `src/data/dialogue.js`.

---

*Generated at handoff. Branch `claude/overworld-3d`, 2680 tests passing.*
