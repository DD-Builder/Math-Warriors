# Controls & UX forensic — defects 1 ("controls abysmal"), 3 ("only a jump"), 10 ("never found a level")

Date: 2026-08-10 · Branch: `claude/overworld-3d` @ 1dbe848 · Method: **the built game**
(`npm run build`, `vite preview :4173`) driven headlessly with synthetic pointer/touch/keyboard
input (Playwright + CDP `Input.dispatchTouchEvent`, SwiftShader WebGL). All assertions are on
**sim state** (`__MW_OVERWORLD._state.pos`, `stats().simTime`, scene internals), never wall clock.
Probe scripts (throwaway, not committed): scratchpad `probe-controls.mjs` … `probe6.mjs`
(session scratchpad `/tmp/claude-0/-home-user-Math-Warriors/…/scratchpad/`).

DO-NOT-FIX report. Diagnoses only, with file:line.

---

## Measured behaviour (built game)

| Probe | Result |
|---|---|
| Left stick drag UP/DOWN/LEFT/RIGHT, 3 sim-s each (mouse-pointer drag from fixed base 250,830) | Moves in all 4 directions: 28.29 / 27.86 / 27.92 / 28.17 m → ~9.3 m/s (run band; controller runSpeed = 8.5 + downhill assist). Mechanically functional. |
| Direction correctness (stick UP, detail run) | **Correct**: heading walked −3.128 rad vs camera yaw −3.142 — camera-relative within 0.014 rad. |
| Drift after stick release | **≈1.6 m of coast** before rest (measured 1.57 m over the 1.5 sim-s after release; includes ≤1 frame sampling latency). Authored intent is full→0 in ~110 ms ≈ 0.47 m at run speed (`decel: 9.0`, controls3d.js:99) — the hero slides ~3× further than the tuning table promises — see D1-F (mass is modelled twice). |
| Right-half horizontal drag, 400 game-px | Camera yaw **-3.117 rad (≈179°)** for a drag covering 28 % of screen width. See D1-A. |
| Right-drag while stick idle — does the player move? | **No** (0.000 m) — the look surface never leaks into movement. |
| Multi-touch (CDP): JUMP tapped while a right-half look-drag is held | **Works.** Jump rose 1.67 m (full apex) and camera yawed 1.32 rad during the 200-px drag. |
| JUMP tap vs hold | tap 0.775 m, hold 1.636 m — variable jump height works. |
| Keyboard parity, 1.5 sim-s each | W 8.64 m, A 7.87, S 8.64, D 8.67, ↑ 7.08, ← 8.59 — all sane walk speeds. |
| Portal discovery from spawn | Optimal-path walk needed 9.3 sim-s with 2 overshoots for 18.4 m; prompt appears only at 3 m. ENTER works with a 3-hero party (behind an 8-line dialogue); **silently crashes with fewer heroes**. Details in DEFECT 10. |
| Page errors while driving | None during movement/camera/jump phases. **One uncaught `TypeError … reading 'sys'`** on the portal-ENTER path with a <3-hero party (D10-B). |

The mechanics mostly WORK under a clean single-pointer/lab drive. The "abysmal" report is
explained by (a) a wildly hot camera, (b) an input surface that is 90 % unwired presentation,
and (c) frame-rate-dependent input integration on a real iPad — detailed below.

---

## DEFECT 1 — "Controls are absolutely abysmal"

### D1-A (CONFIRMED, measured): camera drag is ~3× hotter than its own design intent
`src/overworld/controls3d.js:117` — `lookScaleX: 0.0062` rad/px. The annotation on that line
claims "a half-screen swipe (~700 px) is a bit over a quarter turn". Actual: 700 × 0.0062 =
**4.34 rad = 249°**, not ~90°. Measured on the build: a 400-px drag yawed the camera **179°**
(includes ~0.5–0.9 rad of flick-inertia coast, `orbitFlickMax`/`orbitDamp`,
controls3d.js:131-133 + stepOrbit controls3d.js:418-436). A child swiping the right half spins
the world half a revolution per swipe; two casual swipes and they have no idea which way they
face. On an iPad this is further amplified: pointer coords are in the 1440-px design space while
the canvas renders at ≈1150 CSS px (FIT scale, `src/main.js:89-91`), so each physical cm of
thumb travel counts ~1.25× more "px" than authored. Unit tests only pin `dx * lookScaleX`
multiplication (`controls3d.test.js:341`), never the constant's sanity — this is exactly the
"tests green, game broken" failure mode.

### D1-B (CONFIRMED, code + partially measured): input integrators run on the Phaser frame with a 50 ms dt clamp
`src/scenes/OverworldScene.js:1525` — `dt = Math.min(0.05, (now - last)/1000)`. The 3D sim
catches up to wall clock through `renderer.js:15-16,89-97` (fixed 60 Hz steps, MAX_FRAME 0.25 s),
but the CONTROLS integrators (accel/decel/turn in `resolveInput`, orbit inertia/recentre in
`stepOrbit`) integrate only `poll()`-time dt, once per Phaser frame. On a device below 20 fps —
an iPad pushing three.js + shadows(2048², dpr 2, renderer.js:39) + Rapier + a full Phaser scene —
frames take >66 ms while dt is clamped to 50 ms: acceleration, turning and camera recentre all
run at (50/frame-ms) × real speed. The controls literally get mushier as the device gets slower.
The stick's *position* still reads correctly, so movement continues (sim-side), but every FEEL
parameter (accel 6.5, turnRate 9.5) silently degrades. Not reproducible under SwiftShader's
sim-state waits by design — must be measured on-device — but the code path is unambiguous.

### D1-C (CONFIRMED, code): a third of the screen is an input dead zone
Look input owns only `x ≥ 720` (`createLookInput` `minX: GAME_WIDTH * 0.5`, controls3d.js:703,716);
the stick owns a 330-px disc around (250, 830) (controls3d.js:71,622). Everything else — the whole
upper-left quadrant plus the band between x≈580 and x=720 — does **nothing** on touch. A child
dragging "on the left but not on the stick" gets zero response and no feedback. (Buttons excluded:
JUMP 1250,870 r88; ACTION 1060,750 r76 — controls3d.js:150-155.)

### D1-D (CONFIRMED, measured): flick inertia + auto-recentre keep the camera moving after the finger stops
Release velocity coasts (measured as part of the 179° above; `stepOrbit` controls3d.js:421-436)
and, while walking, the orbit self-recentres behind the hero at up to 1.9 rad/s after 1.15 s
(controls3d.js:135-140, 443-449). Net effect during normal play: the camera is almost never
where the player last put it. Combined with D1-A this is the "totally broken" feel: movement is
camera-relative (controls3d.js:294-309), so an uncommanded camera swing *changes what "up on the
stick" does* mid-walk.

### D1-F (CONFIRMED, code + measured): character mass is modelled TWICE — two stacked inertia filters
`controls3d.js:95-108` runs its own accel/decel/turn filter on the input vector (`accel: 6.5`
frac/s → 0→full ≈ 155 ms; `decel: 9.0` → full→0 ≈ 110 ms), and then `gameFeel.js:120-146` runs a
second full momentum model on the velocity (`accel: 42` → 0→sprint ≈ 200 ms; `drag: 34` →
"coasts ~1.1 m"). The sim therefore chases a *filtered* input with *another* filter: effective
time-to-full-speed is ~0.35 s (both annotations claim ~0.2 s or less) and measured stop distance
is **1.57 m** where controls3d promises 0.47 m and gameFeel promises 1.1 m. Every feel number in
both tuning tables is a lie in the shipped build because the other module's filter stacks on top
of it. This is the floaty, laggy, overshooting character a player describes as "abysmal".

### D1-E (context, measured): the underlying controller is fine
Camera-relative resolution, accel curves, coyote/buffer jump, multi-touch, variable jump height
and keyboard parity all verified working on the build (table above). The wreckage is in tuning
(D1-A), frame-rate coupling (D1-B) and the surface gaps below — not in the core math.

---

## DEFECT 3 — "There is only a jump and nothing else"

Interactive UI actually on screen at spawn (live inventory of Phaser objects, built game):

| object | game px | size | visible | interactive |
|---|---|---|---|---|
| JUMP button (Arc + label) | 1250, 870 | r 88 | yes | **yes** |
| MAP VIEW button (Rect + label) | 1310, 56 | 180×56 | yes | **yes** |
| ACTION button label | 1060, 750 | — | **no** (empty text, hidden) | no |
| "THE REALM" title | 40, 30 | — | yes | no |
| gold chip "10" / potion chip "2" | 135/305, 96 | — | yes | no |
| SKIP chip, dialogue TAP zone, floor-HUD texts | various | — | no | TAP zone technically interactive but invisible |

(The stick ring/knob are non-interactive Arcs driven by scene-level pointer events; the camera
surface has no visual at all.) **Total visible interactive objects at spawn: two — JUMP and MAP
VIEW.** No ability button, no swap/party chip, no dive control, no camera affordance, nothing
off-canvas or overlapping — the missing verbs are missing because they were never built, not
because they are misplaced (see D3-A/B/C).

That is: **one visible verb (JUMP)**, a MAP VIEW escape hatch, passive HUD chips. Verified: the
ACTION button exists but is `visible:false` + non-interactive until within 5.2 m of a portal
(`setActionVisible(false)` default, controls3d.js:596-605; radius = PORTAL_RADIUS 3 +
PORTAL_PAD 2.2, `src/overworld/props.js:78`, `src/overworld/index.js:369,1393-1407`). A player
who never stands inside a portal ring **never sees a second button in the entire game**.

### D3-A (CONFIRMED, code): the whole ability system is unreachable from any input device
- `src/overworld/abilityWiring.js:473` defines `pressAbility()` (knight SHOVE, wizard LEVITATE).
  **Zero callers in the repo** — `grep pressAbility|abilityPressed|swapNext|swapPrev` over
  `index.js`, `OverworldScene.js`, `controls3d.js` finds only the wiring doc's own comments
  (abilityWiring.js:690,733). The assembly instructions at abilityWiring.js:630-760 (ability
  chip, party-ring chip, key/pad bindings) were **never executed** in OverworldScene.
- `src/overworld/abilities.js:252-257` (BINDINGS: ability = KeyE/Shift/pad-2, swap = KeyQ/LB)
  is bound nowhere — worse, KeyE and Shift are already consumed as ACTION and RUN by
  controls3d.js:819,877,886-888, so the documented bindings *conflict* with what is bound.
- Party-ring hero swap: same — no touch chip, no Q key, no pad binding anywhere.
- Only the bunny's double jump survives, because it rides the jump button inside the sim
  (`index.js:1865-1872`).

### D3-B (CONFIRMED, code): DIVE is unreachable on touch AND keyboard
`controls3d.js:884` reads `down(k?.C) || down(k?.CTRL)` — but `addKeys` at controls3d.js:819
registers only `'W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,SHIFT,E,ENTER'`. `k.C`/`k.CTRL` are always
`undefined`, so `keys.dive` is permanently false. Touch has no dive control at all. The swim
"go under" verb exists only on gamepad B (controls3d.js:531). On an iPad it does not exist.

### D3-C (CONFIRMED, code): 13+ presentation hooks are emitted and never received
`index.js` emits `onHeroSwap`(713), `onAbilityPrompt`(714), `onAbilityBlocked`(715),
`onAbilityGate`(716), `onMoment`(717), `onStagedMoment`(718), `onVista`(719), `onBanter`(720),
`onPing`(721), `onCompass`(737), `onDiscovery`(736), `onDiscoveryProgress`(738), `onToybox`(785).
The scene's hooks object (`OverworldScene.js:157-180`) supplies **none of them** — grep across
`src/scenes/` = 0 hits. Every ability prompt, discovery beat, shrine, story page, progression
moment and compass built in those modules is computed each frame and silently dropped. This is
the "modules declared wired because imports exist" failure: `createAbilityRuntime` and
`createDiscoveryRuntime` ARE constructed (index.js:681-738) — their *outputs* go nowhere.

### D3-D (adjacent, for the world forensic): `creatures.js` / `companions.js` are imported by
nothing in `index.js` (grep = 0 hits) — root cause of defect 4 "no characters or animals".

---

## DEFECT 10 — "I never even found a playable level"

### Measured discovery run (from spawn, driving the stick toward the nearest portal)

Teleport to SPAWN (6, 158), then push the stick toward portal-f1 (10, 140), re-aiming every
2 sim-s (this is the *optimal* player — perfect knowledge of where the portal is):

| sim t | pos | dist to portal | prompt |
|---|---|---|---|
| 0.0 | 6.0, 158.0 | 18.4 m | — |
| 3.0 | 16.0, 141.7 | 6.3 m | — (overshot east) |
| 6.0 | −0.5, 138.4 | 10.6 m | — (re-aim overshot west) |
| 9.3 | 7.7, 141.9 | 3.0 m | **ENTER — FLOOR 1** appears |

Even a probe that always pushes exactly toward the target *oscillated around it twice* before
landing in the 5.2 m ring — the double-inertia steering (D1-F) in numbers. A child who does not
know the portal is there never gets within 5.2 m on purpose.

### D10-A (CONFIRMED): zero wayfinding surface
- Nearest portal to spawn: `portal-f1` at (10, 140) vs SPAWN (6, 158) — **18.4 m**
  (`src/overworld/worldSpec.js:277,336`). It is physically close, and arches are 8.6 m monuments
  (props.js:68-78) — the failure is not distance, it is *signposting*:
- The ENTER prompt appears only within **5.2 m** (index.js:1393-1407) — a giant gold button at
  the bottom of the screen, but only once you are already standing in the ring.
- A compass IS computed — `discoveryWiring.js` re-aims `compassHint` at 6 Hz — and emitted via
  `hooks.onCompass` (index.js:737). The scene never subscribes (D3-C), so **no needle, no
  marker, no "go here" of any kind is ever rendered**.
- No minimap. The only navigation affordance is the MAP VIEW button (OverworldScene.js:407-414),
  which *leaves the 3D hub entirely* for the 2D WorldMapScene — an escape hatch, not wayfinding.
- HUD text at spawn (measured): `JUMP`, `THE REALM`, `10`, `2`, `MAP VIEW` — not one word about
  portals, floors, levels or where to go.
- The first-arrival cinematic (`islandArrival`, OverworldScene.js:334-336) frames the **palace**
  (0, 58, 0) — the locked floor-9 landmark — and never shows a floor-1 gate. The one authored
  "where to go" beat points at the wrong building.

### D10-B (CONFIRMED, measured): the ENTER flow silently dead-ends on a small party — and crashes
Instrumented the ENTER prompt's hit zone on the build (listeners on zone + `_enterPortal` wrap):

- **Party of 3** (the routePortal gate): a deliberate press fires the chain —
  `ZONE-down → gameobjectdown → _enterPortal() → entering=true → entry dialogue shows`
  (`ENTER — FLOOR 1` at 720, 930, zone 460×88, interactive), and after tapping through the
  entry dialogue the floor genuinely opens as a 3D level: `activeFloor: 1`, 54 draw calls,
  115 138 triangles. **The end-to-end loop works — for the first time this has actually been
  driven.** Caveat: the entry gate is an **8-line dialogue** (`data/dialogue.js:83-92`) needing
  up to 16 taps (finish-typing + advance per line) before the level opens — a long wall between
  a 5-year-old and the game (my probe needed 17 taps).
- **Party of 1 or 2**: `routePortal` (`src/overworld/portals.js:52-54`) requires
  `save.party.length >= 3`. Tapping ENTER (or pressing E, or calling `_enterPortal()` directly)
  produces **nothing visible in the overworld** — `entering:false, dlg:false, floor:null`,
  prompt still up — and an **uncaught page error fires**:
  `TypeError: Cannot read properties of undefined (reading 'sys')`, thrown from the
  `no-party` redirect (`OverworldScene.js:566-571` → `scene.start(SCENES.PARTY_SELECT)` during
  the live 3D scene). The scene switch aborts; the player is left standing at a portal whose
  button does nothing, with no message. **Any save whose party has fewer than 3 heroes cannot
  enter any level from the 3D overworld.** (Verdict on the exact throwing line: PLAUSIBLE —
  the pageerror is confirmed and reproducible, the stack is inside Phaser's scene-start path;
  needs one instrumented run to pin the frame.)
- Also observed: a fast tap (down+up in one ~3 fps frame, Playwright `mouse.click`) failed to
  fire the zone's pointerup `onClick` in one run, where a 700 ms deliberate press always works —
  PaperButton fires on `pointerup` (`src/ui/paperUI.js:244-246`); flaky at very low frame rates.
  Marked PLAUSIBLE (one occurrence), but kids tap fast and iPads under this renderer run slow.
- Housekeeping bug found while instrumenting: `DialogueOverlay.hide()` disables `tapZone` but
  never `continueBtn.zone` (`src/ui/DialogueOverlay.js:59-65,87-93`) — an invisible 130×46
  interactive rectangle sits at (0,0) permanently, eating top-left-corner taps (topOnly).

### D10-C (CONFIRMED, harness drift): the debug API no longer matches its own docs/specs
`__MW_OVERWORLD` lacks `getNearPortal`/`getNearActionKind` — they are defined on the internal
`world` object (index.js:2506-2515), not on the exported `api` (index.js:2060-2348). Probe 1
crashed on this. Any harness or spec written against the documented surface silently cannot
observe portal proximity — one more reason nobody ever *drove* portal entry end-to-end.

---

## Root-cause summary (one line each)

1. `controls3d.js:117` lookScaleX 0.0062 — camera 2.8× hotter than authored intent (measured 179°/400 px).
2. `controls3d.js:95-108` + `gameFeel.js:120-146` — mass modelled twice; ~0.35 s to full speed, 1.57 m stop slide, overshoot steering (measured).
3. `OverworldScene.js:1525` dt≤0.05 s on Phaser frames — control feel degrades further as device fps drops.
4. `controls3d.js:819` addKeys omits C/CTRL that `:884` reads — dive dead on keyboard; no touch dive exists.
5. `abilityWiring.js:473` `pressAbility` has zero callers; `abilities.js:252` BINDINGS bound nowhere (and collide with ACTION/RUN keys) — SHOVE/LEVITATE/hero-swap unreachable everywhere.
6. `OverworldScene.js:157-180` hooks object omits 13 emitted hooks (index.js:713-722,736-738,785) — all ability/discovery/progression/compass UI computed then dropped.
7. `portals.js:53` party≥3 gate + `OverworldScene.js:566-571` crashing redirect — ENTER silently no-ops (with an uncaught TypeError) on any save with <3 heroes.
8. `index.js:737` compass emitted, never rendered; prompt radius 5.2 m; MAP VIEW exits 3D; arrival cinematic frames the palace (`cinematics.js:671`) — a portal 18 m away is undiscoverable by a child.
9. `index.js:2506` getNearPortal on `world` not `api` — debug surface drift hid all of the above from every prior "gate".
10. `DialogueOverlay.js:87-93` hide() leaves `continueBtn.zone` interactive — invisible tap-eater at (0,0).
