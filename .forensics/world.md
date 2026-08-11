# World & Character Forensics — defects 4, 5, 6, 7, 8, 9

Method: the BUILT game (`npm run build` → vite preview :4173) was driven headlessly with
Playwright/SwiftShader via `window.__MW_OVERWORLD` (teleport, keyboard input, sim-clock waits,
pixel-diff of screenshots). Driver specs preserved as
`.forensics/overworld-zzforensic.spec.js.txt` and `.forensics/overworld-zzwaterprobe.spec.js.txt`
(rename back into `e2e/` with a `.spec.js` suffix to re-run; they were parked here so a full
`npx playwright test` run never pays for them). All screenshots referenced below are in this
directory. Save seeded as a FRESH save (no floors complete, 0 battles) unless noted.

---

## Defect 6 — "You can walk through trees": trunk collision is INTACT; the *experience* is real

**Live reproduction attempt.** Teleported the hero 3.0 m from the deterministic nearest tree to
spawn (tree at x=13.62, z=155.96, trunk collider r=0.387; dumped from `createProps` in Node with
the game's seed), faced it, held W for 4 sim-seconds, sampled position every 150 ms:

- Hero stopped at **0.991 m** from the trunk centre — expected stop = trunk r 0.387 + PLAYER_RADIUS
  0.6 = 0.987. Never crossed to the far side. Control run into the shop building (r 3.4) stopped at
  exactly 4.0 m. **Trunk colliders work.**

**The suspected seam is NOT broken.** After the vegetation.js rework: vegetation.js owns trees and
returns `veg.trees` (`vegetation.js:1583-1596`, incl. the landmark tree at `:1645`); props.js
re-exports them (`props.js:1139-1143`, returned at `:1289`); index.js registers every one as a
circle collider (`index.js:642-644`, into `islandCollision`, which the raft-aware wrapper passes
through to — confirmed live: `worldStats().colliders` = 372 = 352 trees + 3 buildings + 9×2
pillars). 

**Why the player still reports walking through trees** (see `03-tree-walkthrough.png` — the hero is
buried head-deep INSIDE a canopy, stopped only by an invisible 39 cm pole):

1. The collider is the trunk only: r = `spec.trunk.rBot * sx` = **0.18–0.50 m**
   (`vegetation.js:1596`), while the visual crown is **1.5–3.7 m radius** (species tables
   `vegetation.js:705-812`; umbrella crown r 3.55). ~85–95 % of a tree's visual footprint is
   walk-through.
2. Because the trees are short (defect 7), the canopy's underside sits at **≈1.2–1.9 m** — face
   height — so walking at a tree puts the hero's head and torso inside the foliage long before the
   trunk stops them.
3. Two species have no low mass at the trunk at all: `umbrella` (bare pole, parasol at 3.6 m) and
   `willow` (9 hanging curtain plies reaching down to ~1.2 m, `vegetation.js:786-790`, no
   colliders) — you pass clean through the entire visible body without ever meeting the 30 cm trunk.
4. The tree-sized things you *can* fully walk through are ground cover: the `shrub`/`tuft` archetypes
   (`vegetation.js:655-671`) scale up to ~1.4 m and read as small conifers in rows (see the hillside
   band in `07-pondprobe-t0.png`); ground cover intentionally has zero colliders.

**Verdict:** wired-and-working at the trunk; the defect is collider-vs-silhouette mismatch plus
canopy-at-head-height, not a lost registration. Fix direction (for the fix pass, not applied here):
taller trees (defect 7) + species-aware collider radii (canopy-reach radius for willow/blossom, or a
second collider ring), not re-wiring.

## Defect 7 — "Trees too short, look like umbrellas or mushrooms": CONFIRMED

Evidence: `04-tree-row.png` (hero standing among blossom + broadleaf trees near the garden — the
blossom trees are literally pink/white/tan MUSHROOM stacks barely 2× the hero) and
`02-hero-closeup.png` (a broadleaf reading as a giant toadstool).

Numbers from `TREE_SPECIES` (`vegetation.js:705-812`) against the 1.72 m hero
(`heroRig` stats confirm height 1.72):

| species  | unit top height | unit crown Ø | shape at mean scale (~1.0) |
|----------|----------------|--------------|----------------------------|
| blossom  | 3.47 m | 4.6 m | **wider than tall** — mushroom (canopy base 1.9 m) |
| ember    | 4.05 m | 4.7 m | wider than tall |
| umbrella | 4.58 m | **7.1 m** | crown Ø ≈ 1.5× height — literally named `umbrella` |
| broadleaf| 4.70 m | 5.0 m | as wide as tall |
| willow   | 4.65 m | ~5.5 m | drooping dome |
| conifer  | 6.65 m | 4.1 m | the only tall silhouette |
| frostpine| 6.25 m | 3.9 m | tall |

`treeScale` (`vegetation.js:845-850`) then multiplies by variant `s` (0.78–1.30) × per-instance
(0.78–1.30) × `tall` (0.88–1.16), so **many placed trees land at 0.6–0.8× the table**, i.e. a
2.1–2.8 m "tree" ≈ 1.2–1.6× hero height. A real tree is 4–10× a person. Live mix (worldStats):
broadleaf 79, conifer 65, frostpine 45, blossom 60, willow 36, umbrella 40, ember 25 — i.e. ~68 %
of the island's 351 trees are the squat wide-crown silhouettes. Garden (the biome around spawn,
the first thing seen) is 34 % broadleaf / 18 % blossom / 16 % willow / 12 % umbrella
(`vegetation.js:949`), so the first impression is all mushrooms.

**Root cause:** authored species tables — trunk `h` 2.0–3.6 m and crown radii 2.3–3.55 m at unit
scale — plus the downward-skewed scale band. At fault for the "umbrella/mushroom" read specifically:
`umbrella` and `blossom` species parameters, and the fat crown-to-height ratio on broadleaf/ember.

## Defect 8 — "Water doesn't move": ocean animates; the water the player actually meets doesn't (and floats)

**Ocean (tidepool shore, unfrozen sim, no pose):** 5 screenshots at 1.5 sim-second intervals,
mean |ΔRGB| in the open-sea band: **11.9 / 9.5 / 8.8 / 7.6** per interval — waves, foam and glitter
visibly march (`06-waterprobe-t0..4.png`). `water.update(lightFrame, animT)` is correctly called
each frame on the island (`index.js:2021`) and writes `uTime` (`water.js:1466`). **Not frozen.**

**Pond — the first water a player sees:** the island's single pond is `garden-pool` at (-8, 154),
r 7.5 — **20 m from SPAWN (6, 158)**. Pixel-diff at 1.5 s intervals shows only the global wind
shimmer (~4.1 everywhere, identical inside and outside the pond — no pond-specific motion), and
`pondTuning` (`water.js:1137-1183`) explains why: `waveAmp: 0.018` (a 1.8 **cm** swell),
`runupLift: 0.010`, `foamSwing: r*0.012`, `foamSpeed 0.30` — deliberately-still numbers that read
as a frozen pane at 3–8 m. See `07-pondprobe-t0.png`: the pond also sits **proud of the meadow on a
~1 m pedestal bank** (pond level 11.45 vs surrounding ground ≈10.4, skirt from `buildPondBank`,
`water.js:978`), so it reads as a static glass tabletop levitating next to spawn. A kid standing at
spawn looks at THIS, not the distant ocean, and reports "water doesn't move". Root cause: pond
tuning amplitude + pond-fit leaving the surface above the meadow, not a broken update call.

**A real (harness-facing) freeze bug found on the way:** `api.setPose()` sets `currentPose` and
freezes the animation clock (`animT = POSE_TIME`, `index.js:1978`), but `api.freeze(false)` and
`api.teleport()` clear only the rig freeze/pose CAMERA — **nothing except `clearPose()`
(`index.js:2215`) ever clears `currentPose`**, so any harness that poses then unfreezes runs a live
sim with ALL world animation (water/props/sky/wind) frozen forever after. Measured: sea-band diff
collapsed to 0.03–0.04 across 5 sim-seconds after a `setPose`+`freeze(false)` sequence. Any prior
"verified" screenshot run that posed first was photographing a frozen world. Seam:
`index.js:2062-2068` (`freeze`) and `:2069` (`teleport`) vs `:1978`.

## Defect 5 — "Hero looks like a stack of jello": the channels are healthy; the LOOK and the compounding squash are the problem

**Live channel sampling** (`__MW_OVERWORLD.feel()`): idle 10×, walking 10×, post-input 5 s —
`squash` and `stretch` stayed **exactly 0** throughout; no runaway, no oscillation. (A landing
sample could not be captured: `keyboard.press('Space')` is a sub-frame tap that SwiftShader's
300 ms frames drop — the jump never fired. Left to the controls forensic; consistent with
defect 1/3.)

**The look** (`02-hero-closeup.png`, rear ¾; `04-tree-row.png`, front; `07-pondprobe-t0.png`,
side): from the front the knight reads (helmet, visor band, chest cross, sword); from behind and
side he is a **loose stack of 50 dark-teal extruded plies with visible gaps between the cloak
slats** — exactly "a stack of jello". This is the real rig (`heroRig` stats: heroId knight-shadow,
7 nodes, 50 plies, 1222 tris — no fallback), so the defect is the papercut extrusion presentation
of the traced 2D art at 3D viewing angles, not a substitute mesh.

**Squash is applied 2–3 times per landing — the "jello on every hop" mechanism:**

1. INNER: heroRig keeps its own landing squash — `st.squash` set from impact
   (`heroRig.js:1347`), applied `rig.scale.set(1+sq*0.16, 1-sq*0.22, …)` (`heroRig.js:1437-1441`).
2. OUTER: gameFeel keeps a second, independent landing squash (`gameFeel.js:451`,
   `landingImpact`), and index multiplies `rigScale(player)` onto the outer group **on top of** the
   inner one (`index.js:1990-1995` — the comment says this doubling is intentional). Combined
   worst-case Y = 0.78 × 0.78 ≈ **0.61**, width ≈ 1.16 × 1.16 ≈ 1.35.
3. LEGS: additionally `legL/legR.scale.y = 1 - sq*0.30` (`heroRig.js:1520-1523`) — triple
   compression on the legs.
4. On top, two **under-damped** springs wobble the body continuously: flow/cloak spring k=58,
   c=8.0 → ζ≈0.53 (`heroRig.js:1470`) and hem spring k=30, c=7.0 → ζ≈0.64 (`heroRig.js:1481`),
   plus idle sway/breath scale writes (`heroRig.js:1432-1434`, `:1447`). Each is small; summed with
   the doubled squash every step/hop, the figure never stands still and compresses ~40 % on any
   real landing.

**Root cause file:lines:** double application seam `index.js:1995` × `heroRig.js:1437` (two
independent squash state machines fed by the same landing), leg extra at `heroRig.js:1522`,
under-damped springs `heroRig.js:1470,1481`; plus the ply-stack rear silhouette of the traced rig.

## Defect 4 — "No other characters or animals": CONFIRMED — two finished systems, never instantiated

- **`creatures.js` (1730 lines)** — full island-wildlife system: 30-species papercut bestiary
  transcribed from the 2D monster art, seeded fixed-step behaviour sim (`stepSim`,
  `creatures.js:1126`), notice/flee radii, and a complete factory
  **`createCreatures(heightfield, opts)` at `creatures.js:1397`**. Its only consumer is
  `battle3d.js:45-47`, which imports the *geometry helpers* to build in-battle enemies. **No call
  site anywhere constructs island wildlife**; `index.js` neither imports nor mentions it.
- **`companions.js` (1174 lines)** — the party-follower system (breadcrumb trail, arc-length
  formation, springs; `createCompanions` at `companions.js:709`). **Imported by NOTHING except its
  own test.** The only reference in shipping code is a comment (`heroRig.js:66`) budgeting "two
  companions" that were never added.

Verdict: **not-wired** (never spawned), not wired-but-broken. Live scene concurs: props stats
enumerate portals/buildings/stalls/pickups/vegetation only; every traversal screenshot shows an
island with a single figure on it. Both modules pass their unit tests — which is exactly how "tests
green" coexisted with an empty world.

## Defect 9 — cutscenes/UI: the machinery works; the gate guarantees the user never saw it

- **First-arrival cinematic DOES fire on a truly fresh save** — reproduced live: letterbox + SKIP
  + the authored Floor-9-gate establishing shot (`01-arrival.png`), `cinematicActive()` true from
  the first sample. Wiring: `OverworldScene.js:334-335` → `islandArrival` (`cinematics.js:671`).
- **Why the user saw nothing:** `_isFirstArrival()` (`OverworldScene.js:276-282`) suppresses it if
  the save has ANY completed floor, ANY battle fought, or a stored `overworld.pos`. The user's real
  save comes from months of 2D play (battles > 0, floors complete), so the 3D world's establishing
  shot is permanently skipped for exactly the person the 3D overworld debuted to. Every returning
  player sees zero cinematics on their first 3D boot.
- **Floor title cards ARE wired** — `floorTitleCard(floorId)` plays on floor entry
  (`OverworldScene.js:663`), followed by the once-per-save arrival story beat (`:664`, `:677`). But
  they trigger ONLY inside `_enterFloor`; the user "never even found a playable level" (defect 10),
  so this entire content layer was unreachable. Cutscene visibility is downstream of portal
  discovery.
- **UI observed live:** "THE REALM" label, gold/potion counters, MAP VIEW button, fixed joystick,
  JUMP button — and nothing else (no quest/goal, no compass, no prompt toward a portal). Matches
  "no UI buildout".

---

## Cross-cutting institutional notes

1. `worldStats().colliders` counts trees+buildings+pillars (372) and the boot spec asserts draw
   calls — but no spec ever *walked into* anything or *watched* a wave until now. The driver specs
   in this directory do; keep them (renamed back into `e2e/`) as the template for behavioural gates.
2. The `setPose`→`freeze(false)` animation-clock leak (defect-8 section) means any prior
   screenshot-based "beauty" verification that posed first was looking at a world with wind, water
   and petals frozen — screenshots passed while motion was never actually verified.
3. Keyboard Space taps are droppable at SwiftShader frame rates (sub-frame keydown/keyup between
   300 ms polls); behavioural specs should hold the key across ≥1 sim step.
