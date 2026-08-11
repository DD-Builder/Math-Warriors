/**
 * LEVEL ARCHITECTURE — the tests that exist because the floors looked bad.
 *
 * Two critics reviewed the 3D floors independently and converged on the same
 * three findings, all of which are measurable and none of which any existing
 * test could have caught:
 *
 *   FLAT SKYLINE   nothing in any floor was taller than 2.9 m, so every
 *                  horizon was a straight line, there was no focal point and
 *                  no reason to walk anywhere. "The single most damaging
 *                  flaw." Guarded by `the skyline`.
 *
 *   NO VALUE       a hedge's sun-facing crown measured L=55 against its shaded
 *   STRUCTURE      front face at L=59 — the top was DARKER than the side, so
 *                  every wall was one flat shape and the maze read as a hole
 *                  rather than as geometry. Guarded by `value structure`.
 *
 *   BLACK SLOTS    the ply seams landed on #0e3423, 10% luma, in a palette
 *                  whose stated floor is PAPER.shadow — and they did it at a
 *                  constant altitude on every tile, which re-imposed the exact
 *                  tile grid the rest of the vocabulary exists to hide.
 *                  Guarded by `the palette floor` and `the tile grid`.
 *
 * These are properties, not screenshots. A screenshot tells you the frame is
 * wrong; a ratio tells you which number to change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPER } from '../config.js';
import {
  readLevel, distanceField, heightField, makeHeightSampler, themeForFloor,
  wallTiles, wallProfile, landmarkSpecs, landmarkProfile, groundScatter,
  levelSpawn, maxAdjacentStep, stepDegrees, paperLinear, isWalkableChar,
  LEVEL_THEMES, WALL_H_TALL, PLY_SHADOW_MIX, SEAM_SKIP, LANDMARK_H,
  WALL_YAW_JIT, WALL_H_JIT, WALL_SLIDE_ALONG, TILE_M, ventSpots, wallFaceYaw,
} from './level3dBuild.js';
import { LEVEL_SKY, applyFloorSky, timeOfDay } from './timeOfDay.js';
import { createRenderFrame, applyWeather, weatherByName } from './weather.js';
import { buildLevel3D } from './level3d.js';

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HERO_H = 1.72;

/** Rec.709 luma of a PAPER int, 0-255. The critics' measurements are in this
 *  space, so the thresholds below can be compared against their numbers. */
function luma(hex) {
  return 0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255);
}
/** Luma of a LINEAR rgb triple, which is what a vertex colour holds. */
function lumaLin(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

function rig(id) {
  const level = readLevel(id);
  const dist = distanceField(level);
  const hf = heightField(level, dist);
  const theme = themeForFloor(id);
  const { sampleHeight } = makeHeightSampler(hf, level.width, level.height);
  return { level, dist, hf, theme, sampleHeight, walls: wallTiles(level, hf) };
}
const rigs = new Map(FLOORS.map((id) => [id, rig(id)]));

// Building the real geometry is the only way to test the baked face tone, and
// it is slow enough that it is done once for the three floors the critics
// scored rather than for all nine.
const SHOTS = [1, 4, 8];
const built = new Map(SHOTS.map((id) => [id, buildLevel3D(id, { castShadow: false })]));
test.after(() => { for (const b of built.values()) b.dispose(); });

test('the skyline', async (t) => {
  await t.test('every floor has a landmark far above its wall band', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, dist, walls } = rigs.get(id);
      const lms = landmarkSpecs(level, hf, theme, dist);
      assert.ok(lms.length >= 1, `floor ${id}: no landmark — the horizon is a straight line`);
      const primary = lms.find((l) => l.tier === 0);
      assert.ok(primary, `floor ${id}: no primary landmark at the objective end`);
      assert.ok(primary.h >= LANDMARK_H[0],
        `floor ${id}: primary landmark is only ${primary.h.toFixed(1)} m`);
      // The whole point: you must be able to see it OVER the walls, from
      // anywhere. Four times the interior wall band, and it must still tower
      // over the raised boundary ring rather than merely clear it.
      const interior = walls.filter((w) => !w.ring).reduce((a, w) => Math.max(a, w.h), 0);
      const ring = walls.filter((w) => w.ring).reduce((a, w) => Math.max(a, w.h), 0);
      assert.ok(interior === 0 || primary.h > interior * 4,
        `floor ${id}: landmark ${primary.h.toFixed(1)} m vs interior wall ${interior.toFixed(1)} m`
        + ' — that is not a silhouette you can navigate by');
      assert.ok(primary.h > ring * 2,
        `floor ${id}: landmark ${primary.h.toFixed(1)} m barely clears the ${ring.toFixed(1)} m ring`);
      assert.ok(interior <= WALL_H_TALL + 0.01,
        `floor ${id}: an interior wall (${interior.toFixed(2)} m) broke the height band`);
    }
  });

  await t.test('landmarks never stand on ground the player can walk', () => {
    // A tower on a walkable tile is a new collider, a new hole in the BFS
    // field and a new way to strand a five-year-old. Hosting on wall tiles is
    // what makes the landmark tier free of gameplay consequence.
    for (const id of FLOORS) {
      const { level, hf, theme, dist } = rigs.get(id);
      for (const l of landmarkSpecs(level, hf, theme, dist)) {
        assert.equal(level.code[l.ty][l.tx], 'W',
          `floor ${id}: landmark at ${l.tx},${l.ty} is not on a wall tile`);
        assert.ok(!isWalkableChar(level.code[l.ty][l.tx]));
      }
    }
  });

  await t.test('masts are spread out, not stacked in one corner', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, dist } = rigs.get(id);
      const lms = landmarkSpecs(level, hf, theme, dist);
      for (let i = 0; i < lms.length; i++) {
        for (let j = i + 1; j < lms.length; j++) {
          const d = Math.hypot(lms[i].x - lms[j].x, lms[i].z - lms[j].z);
          assert.ok(d > 24, `floor ${id}: two landmarks only ${d.toFixed(0)} m apart`);
        }
      }
    }
  });

  await t.test('every floor has its OWN hero structure, not a shared needle', () => {
    // Four of the nine floors used to resolve to the same generic 'spire', so
    // the Shattered Sky, the Frozen Peak, the Crystal Caverns and the Mending
    // Room all navigated by the identical object. A landmark you have already
    // seen on three other floors is scenery, not a destination.
    const kinds = FLOORS.map((id) => themeForFloor(id).landmark);
    const dupes = kinds.filter((k, i) => kinds.indexOf(k) !== i);
    assert.equal(dupes.length, 0,
      `landmark shapes repeat across floors: ${JSON.stringify(dupes)}`);
    for (const id of FLOORS) {
      const t2 = themeForFloor(id);
      assert.ok(t2.landmark && t2.mast, `floor ${id}: missing landmark or mast kind`);
      // A mast that is the primary at 40% scale cancels the primary — with
      // four copies of one tower, none of them is "the" tower.
      assert.notEqual(t2.mast, t2.landmark,
        `floor ${id}: masts are miniature copies of the ${t2.landmark}`);
    }
  });

  await t.test('every landmark kind actually builds a distinct profile', () => {
    // A kind string that no case in landmarkProfile handles falls through to
    // `default` and silently becomes the generic spire again — which is the
    // failure above, reintroduced as a typo. Compare the built geometry.
    for (const id of FLOORS) {
      const { level, hf, theme, dist } = rigs.get(id);
      const lms = landmarkSpecs(level, hf, theme, dist);
      const prim = lms.find((l) => l.tier === 0);
      const mast = lms.find((l) => l.tier > 0);
      if (!mast) continue;
      const sig = (s) => landmarkProfile(s, theme).length;
      // Same host, same height, same seed — only `kind` differs, so an equal
      // piece count means both resolved to the same builder.
      const a = sig({ ...prim, kind: theme.landmark });
      const b = sig({ ...prim, kind: theme.mast });
      assert.notEqual(a, b,
        `floor ${id}: '${theme.mast}' and '${theme.landmark}' build the same shape`
        + ' — one of them is falling through to the default spire');
    }
  });

  await t.test('is deterministic — the harness can diff frames', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, dist } = rigs.get(id);
      assert.deepEqual(landmarkSpecs(level, hf, theme, dist),
        landmarkSpecs(level, hf, theme, dist));
      assert.deepEqual(landmarkProfile(landmarkSpecs(level, hf, theme, dist)[0], theme),
        landmarkProfile(landmarkSpecs(level, hf, theme, dist)[0], theme));
    }
  });
});

test('value structure', async (t) => {
  await t.test('every theme reaches a genuinely light crown', () => {
    // Floor 1 used to be [forestD 64, forest 86, forestL 109] — a 1.7x range,
    // all of it dark, over 60% of the frame. Floor 8 was 1.15x, which is why
    // its shelves measured as grey mush. Odyssey's Steam Gardens hedge runs
    // about 2x crown-to-base and that ratio is the reason it reads as a solid.
    for (const [id, th] of Object.entries(LEVEL_THEMES)) {
      const s = th.wallStack;
      assert.ok(th.wallTop, `floor ${id}: no wallTop — nothing to cut the sunlit edge from`);
      assert.ok(luma(s[0]) < luma(s[1]) && luma(s[1]) <= luma(s[2]),
        `floor ${id}: wallStack is not ordered dark -> light`);
      assert.ok(luma(th.wallTop) >= luma(s[2]),
        `floor ${id}: the crown paper is darker than the ply it caps`);
      const ratio = luma(th.wallTop) / luma(s[0]);
      assert.ok(ratio >= 1.6,
        `floor ${id}: crown:base is only ${ratio.toFixed(2)}x — the wall is one flat shape`);
    }
  });

  await t.test('a wall top is LIGHTER than a wall face (the 0.93 defect)', () => {
    // The measured failure was top L=55, front L=59: a ratio of 0.93, on
    // geometry that had four plies and a crown. The cause was architectural —
    // the toon ramp only sees the sun, and at this world's sun elevations
    // NdotL on a crown and on a south face are within a few per cent — so the
    // form is baked into the albedo by face orientation instead.
    for (const id of SHOTS) {
      let upSum = 0, upN = 0, sideSum = 0, sideN = 0;
      built.get(id).group.traverse((o) => {
        if (!o.isMesh || !o.name.startsWith('level-wall')) return;
        const n = o.geometry.getAttribute('normal');
        const c = o.geometry.getAttribute('color');
        for (let i = 0; i < n.count; i++) {
          const L = lumaLin(c.getX(i), c.getY(i), c.getZ(i));
          if (n.getY(i) > 0.7) { upSum += L; upN++; }
          else if (Math.abs(n.getY(i)) < 0.3) { sideSum += L; sideN++; }
        }
      });
      assert.ok(upN > 1000 && sideN > 1000, `floor ${id}: not enough wall faces to measure`);
      const ratio = (upSum / upN) / (sideSum / sideN);
      assert.ok(ratio >= 1.3,
        `floor ${id}: wall crown:face luma is ${ratio.toFixed(3)} — it must exceed 1.3, `
        + 'and it was 0.93 when the walls read as flat dark shapes');
    }
  });
});

test('the palette floor', async (t) => {
  await t.test('no wall vertex is darker than PAPER.shadow, in any channel', () => {
    // The ply seams rendered at #0e3423, L=25, and the toon ramp's shade texel
    // then multiplied that again. They did not read as cut edges, they read as
    // black slots — and the palette law says the deepest thing in this world is
    // shadow teal. The albedo is clamped before any light touches it, and the
    // clamp is divided by the steepest face-tone darkening so a fully downward
    // face lands exactly ON the teal rather than 20% under it.
    const floor = paperLinear(PAPER.shadow);
    for (const id of SHOTS) {
      let worst = Infinity, below = 0, total = 0;
      built.get(id).group.traverse((o) => {
        if (!o.isMesh || !o.name.startsWith('level-wall')) return;
        const c = o.geometry.getAttribute('color');
        for (let i = 0; i < c.count; i++) {
          const rgb = [c.getX(i), c.getY(i), c.getZ(i)];
          for (let k = 0; k < 3; k++) if (rgb[k] < floor[k] - 1e-6) below++;
          worst = Math.min(worst, lumaLin(rgb[0], rgb[1], rgb[2]));
          total++;
        }
      });
      assert.equal(below, 0,
        `floor ${id}: ${below}/${total * 3} wall colour channels fall below PAPER.shadow`);
      assert.ok(worst >= lumaLin(floor[0], floor[1], floor[2]) * 0.999,
        `floor ${id}: darkest wall luma ${worst.toFixed(4)} is under the palette floor`);
    }
  });

  await t.test('the seam mix stays well clear of ink', () => {
    assert.ok(PLY_SHADOW_MIX <= 0.18,
      `PLY_SHADOW_MIX ${PLY_SHADOW_MIX} pulls the layer edge far enough toward shadow`
      + ' that it reads as a black slot on an already-dark ply');
  });
});

test('the tile grid', async (t) => {
  await t.test('a run does not draw one ruled seam at one altitude', () => {
    // Every seam used to be emitted at a fixed fraction of h on every tile,
    // which drew a dead-level line the whole length of a forty-tile run, in
    // the darkest value in the frame.
    for (const id of FLOORS) {
      const { theme, walls } = rigs.get(id);
      if (walls.length < 12) continue;
      let seamless = 0;
      const seamY = [];
      for (const w of walls) {
        // Seam pieces tag themselves, so this measures the property directly
        // rather than guessing which thin box was a layer edge.
        const seams = wallProfile(w, theme).filter((p) => p.seam);
        if (!seams.length) seamless++;
        for (const p of seams) seamY.push((p.y0 + p.y1) / 2 / w.h);
      }
      assert.ok(seamless / walls.length > SEAM_SKIP * 0.4,
        `floor ${id}: only ${seamless}/${walls.length} tiles skip their seam`);
      const uniq = new Set(seamY.map((y) => y.toFixed(2)));
      assert.ok(uniq.size > 8,
        `floor ${id}: seams land on only ${uniq.size} distinct altitudes — that is the grid`);
    }
  });

  await t.test('neighbours share neither a top edge nor a yaw', () => {
    for (const id of FLOORS) {
      const { walls, theme } = rigs.get(id);
      if (walls.length < 12) continue;
      const hs = walls.filter((w) => !w.planter && !w.ring).map((w) => w.h);
      if (hs.length < 8) continue;
      const spread = Math.max(...hs) / Math.min(...hs);
      assert.ok(spread > 1.35,
        `floor ${id}: wall heights span only ${spread.toFixed(2)}x — the skyline is a line`);
      const yaws = walls.map((w) => w.yaw);
      const yawSpread = Math.max(...yaws) - Math.min(...yaws);
      // The fronted vocabularies (stall, shelf, screen) must NOT be spun far,
      // so they are allowed a smaller spread — a bookcase turned 25 degrees is
      // a bookcase facing a wall.
      assert.ok(yawSpread > (theme.wall === 'hedge' ? 0.6 : 0.35),
        `floor ${id}: yaw spans only ${yawSpread.toFixed(2)} rad — tiles still meet flush`);
    }
  });

  await t.test('a run is broken by planters you can see over', () => {
    // Not every floor has straight deg-2 runs (the Shattered Sky is nine wall
    // tiles), so this asserts the mechanism across the tower rather than
    // per floor.
    let planters = 0, straights = 0;
    for (const id of FLOORS) {
      const { walls } = rigs.get(id);
      for (const w of walls) {
        if (w.topo.straight && !w.ring) straights++;
        if (!w.planter) continue;
        planters++;
        assert.ok(w.h < HERO_H, `floor ${id}: a planter at ${w.h.toFixed(2)} m is not a gap`);
        assert.ok(w.topo.straight, `floor ${id}: a planter punched a hole at a corner`);
      }
    }
    assert.ok(planters > 20, `only ${planters} planters across the tower — runs still unbroken`);
    assert.ok(planters < straights * 0.5, 'too many planters — the maze stopped being a maze');
  });

  await t.test('the boundary ring gives the level a top edge', () => {
    for (const id of FLOORS) {
      const { level, walls } = rigs.get(id);
      const ring = walls.filter((w) => w.ring);
      // NOT `if (!ring.length) continue`. That skip is how this test passed on
      // a floor that had no boundary ring AT ALL: Ebbport and the Shattered Sky
      // are islands in a field of 'Q', so every one of their perimeter tiles
      // was culled by facesOpenSpace and floor 3 shipped with nine wall tiles
      // in the whole level and open sky to the fog in every direction. A test
      // that skips the failing case is not a test.
      assert.ok(ring.length > 0,
        `floor ${id}: no boundary ring — the level has no top edge, it is a lawn`);
      // Ring tiles near the spawn stay low on purpose — the establishing shot
      // must not open on a six-metre wall in the player's face.
      const far = ring.filter((w) =>
        Math.hypot(w.tx - level.startX, w.ty - level.startY) > 6);
      if (!far.length) continue;
      const tallest = far.reduce((a, w) => Math.max(a, w.h), 0);
      assert.ok(tallest >= 4.5,
        `floor ${id}: the outer ring tops out at ${tallest.toFixed(1)} m — still a picket fence`);
    }
  });
});

test('the establishing shot', async (t) => {
  await t.test('the spawn stands on a step, not on the flattest ground', () => {
    // Height is a function of walk distance from the spawn, so the spawn was
    // band 0 — the bottom — and the first ~28 m of every floor was a literal
    // plane. That plane is the frame the player judges the level by.
    for (const id of FLOORS) {
      const { level, hf, sampleHeight } = rigs.get(id);
      const sp = levelSpawn(level, sampleHeight);
      // The MINIMUM in the 8-20 m annulus, not the mean. The floor climbs away
      // from the spawn in some directions and drops in others — that is the
      // composition. A mean averages the step away; what the opening frame
      // shows is the lowest ground in it.
      let lo = Infinity;
      for (let R = 8; R <= 20; R += 2) {
        for (let a = 0; a < 24; a++) {
          const th = (a / 24) * Math.PI * 2;
          lo = Math.min(lo, sampleHeight(sp.x + Math.cos(th) * R, sp.z + Math.sin(th) * R));
        }
      }
      const drop = sp.y - lo;
      assert.ok(drop > 1.2,
        `floor ${id}: the spawn looks down only ${drop.toFixed(2)} m in the first 20 m — `
        + 'the establishing shot is a plane');
    }
  });

  await t.test('faces the landmark it is composed around', () => {
    // The whole opening-frame effort — the entrance terrace, the landmark at
    // the objective end, the planters you see it through — is aimed at a frame
    // the camera has to actually be pointed at. It was not: levelSpawn built
    // its heading with `Math.atan2(-c.z, -c.x)` while every other heading in
    // the overworld is `Math.atan2(dx, dz)`, and swapping those two arguments
    // does not rotate a bearing, it MIRRORS it about the 45 degree diagonal.
    // Floor 1 spawned the hero 121 degrees off the tower, staring into a hedge.
    for (const id of FLOORS) {
      const { level, hf, theme, dist, sampleHeight } = rigs.get(id);
      const primary = landmarkSpecs(level, hf, theme, dist).find((l) => l.tier === 0);
      const sp = levelSpawn(level, sampleHeight, primary);
      const want = Math.atan2(primary.x - sp.x, primary.z - sp.z);
      let off = Math.abs(((sp.yaw - want + Math.PI) % (Math.PI * 2)) - Math.PI);
      assert.ok(off < 1e-9,
        `floor ${id}: spawn faces ${(off * 180 / Math.PI).toFixed(0)} degrees off the landmark`);
      // And the fallback bearing must use the same convention, or the bug just
      // moves to the callers that do not pass an aim.
      const bare = levelSpawn(level, sampleHeight);
      const toCentre = Math.atan2(-sp.x, -sp.z);
      off = Math.abs(((bare.yaw - toCentre + Math.PI) % (Math.PI * 2)) - Math.PI);
      assert.ok(off < 1e-9, `floor ${id}: the no-aim spawn bearing is mirrored`);
    }
  });

  await t.test('and the entrance terrace cannot sever a route', () => {
    // The whole reason elevation is derived from the BFS field is that
    // connectivity has to be a theorem. Adding a local plateau at the spawn
    // must not break it.
    for (const id of FLOORS) {
      const { level, hf } = rigs.get(id);
      const deg = stepDegrees(maxAdjacentStep(level, hf));
      assert.ok(deg < 45,
        `floor ${id}: worst adjacent slope is ${deg.toFixed(1)} degrees — that is a wall`);
    }
  });
});

test('ground dressing reads as grown, not generated', async (t) => {
  await t.test('comes in three size classes spanning at least 3x', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      const scales = spots.map((s) => s.scale).sort((a, b) => a - b);
      const p05 = scales[Math.floor(scales.length * 0.05)];
      const p95 = scales[Math.floor(scales.length * 0.95)];
      assert.ok(p95 / p05 >= 3,
        `floor ${id}: scatter size spans only ${(p95 / p05).toFixed(2)}x — one apparent size`);
      // Three genuinely separated populations, not a uniform smear.
      const classes = new Set(spots.map((s) => (s.scale < 0.65 ? 'S' : s.scale < 1.25 ? 'M' : 'L')));
      assert.equal(classes.size, 3, `floor ${id}: scatter uses ${classes.size} size classes`);
    }
  });

  await t.test('is clumped, so it does not read as wallpaper', () => {
    // A clump has near neighbours; a uniform lattice does not. The median
    // nearest-neighbour distance of a clumped field is far below the mean
    // spacing its density implies.
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      const near = [];
      for (let i = 0; i < spots.length; i += 3) {
        let best = Infinity;
        for (let j = 0; j < spots.length; j++) {
          if (i === j) continue;
          const d = (spots[i].x - spots[j].x) ** 2 + (spots[i].z - spots[j].z) ** 2;
          if (d < best) best = d;
        }
        near.push(Math.sqrt(best));
      }
      near.sort((a, b) => a - b);
      const median = near[Math.floor(near.length / 2)];
      assert.ok(median < 1.6,
        `floor ${id}: median nearest-neighbour is ${median.toFixed(2)} m — that is a lattice`);
    }
  });

  await t.test('varies its hue instead of repeating one hex', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      const byKind = new Map();
      for (const s of spots) {
        if (!byKind.has(s.kind)) byKind.set(s.kind, new Set());
        byKind.get(s.kind).add(s.hex);
      }
      for (const [kind, hexes] of byKind) {
        assert.ok(hexes.size >= 8,
          `floor ${id}: every "${kind}" is one of ${hexes.size} colours — that is a decal field`);
      }
    }
  });

  await t.test('clears the paver ribbon where the theme asks it to', () => {
    // The Ember Caves' cone field marched right up to the path in a visible
    // lattice; a negative vergeBias is what pulls it back off the shoulder.
    assert.ok(LEVEL_THEMES[4].vergeBias < 0, 'floor 4 must clear its path verge');
    const { level, hf, theme, sampleHeight } = rigs.get(4);
    const spots = groundScatter(level, hf, theme, sampleHeight, {});
    assert.ok(spots.length > 150, 'clearing the verge must not strip the floor bare');
  });
});

test('the whole floor still fits its budget', () => {
  // 250 draw calls / 500 k triangles is the frame budget, shared with the hero,
  // the HUD and everything else. A level may not eat it.
  for (const id of SHOTS) {
    const s = built.get(id).stats;
    assert.ok(s.drawCalls <= 120, `floor ${id}: ${s.drawCalls} draw calls`);
    assert.ok(s.triangleCount <= 250_000, `floor ${id}: ${s.triangleCount} triangles`);
    assert.ok(s.landmarks >= 1 && s.landmarkHeight >= LANDMARK_H[0]);
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// BREAK THE GRID
//
// The pass before this one claimed anti-grid jitter and did not have it. The
// numbers, measured across all nine floors on the build these tests were
// written against:
//
//   yaw       ±0.42 rad free-standing (±0.11 on the fronted vocabularies)
//   height    σ = 11% of the mean, max/min = 1.50x
//   offset    ±0.16 m on a 4 m tile — 4%, so neighbours met FLUSH
//   colour    7 to 10 distinct hexes for a WHOLE FLOOR
//   scatter   index of dispersion 0.64-0.93 on five of nine floors, i.e. the
//             field was measurably MORE REGULAR THAN RANDOM — a lattice
//
// Every assertion below is one of those numbers with a threshold on it, so the
// next person to "tidy" a jitter constant down to a rounding error has to
// argue with a failing test rather than with a comment.
// ═══════════════════════════════════════════════════════════════════════════

test('the anti-grid budget is large enough to SEE', async (t) => {
  await t.test('a tile slides a real fraction of its own width', () => {
    // ±0.14 m on a 4 m tile is ±3.5%: a rounding error, not a composition.
    assert.ok(WALL_SLIDE_ALONG / TILE_M > 0.12,
      `a run tile slides only ${(100 * WALL_SLIDE_ALONG / TILE_M).toFixed(1)}% of a tile`);
    for (const id of FLOORS) {
      const { walls } = rigs.get(id);
      const inner = walls.filter((w) => !w.ring);
      if (inner.length < 12) continue;
      const off = inner.map((w) => Math.hypot(w.ox, w.oz));
      const worst = Math.max(...off);
      assert.ok(worst / TILE_M > 0.10,
        `floor ${id}: the largest in-tile offset is ${(100 * worst / TILE_M).toFixed(1)}%`
        + ' of a tile — neighbouring tiles still meet flush');
    }
  });

  await t.test('yaw and height vary by more than the eye can dismiss', () => {
    assert.ok(WALL_YAW_JIT >= 0.5, `free-standing yaw jitter is only ±${WALL_YAW_JIT} rad`);
    assert.ok(WALL_H_JIT >= 0.35, `height jitter is only ±${(WALL_H_JIT * 100) | 0}%`);
    for (const id of FLOORS) {
      const { walls, theme, level } = rigs.get(id);
      const inner = walls.filter((w) => !w.ring);
      if (inner.length < 12) continue;
      // The jitter itself, not the absolute yaw: a fronted vocabulary's base
      // yaw is where the corridor is, and that is signal, not variance.
      const jit = inner.map((w) => w.yaw - wallFaceYaw(level, w.tx, w.ty, theme.wall));
      const mean = jit.reduce((a, b) => a + b, 0) / jit.length;
      const sd = Math.sqrt(jit.reduce((a, b) => a + (b - mean) ** 2, 0) / jit.length);
      assert.ok(sd > 0.10,
        `floor ${id}: yaw jitter has σ = ${sd.toFixed(3)} rad — the run is still parallel`);
      const hs = inner.filter((w) => !w.low).map((w) => w.h);
      if (hs.length < 8) continue;
      const hm = hs.reduce((a, b) => a + b, 0) / hs.length;
      const hsd = Math.sqrt(hs.reduce((a, b) => a + (b - hm) ** 2, 0) / hs.length);
      assert.ok(hsd / hm > 0.15,
        `floor ${id}: wall heights vary by only ${(100 * hsd / hm).toFixed(1)}% — one top edge`);
    }
  });

  await t.test('a floor is cut from many papers, not from seven', () => {
    for (const id of FLOORS) {
      const { walls, theme } = rigs.get(id);
      const inner = walls.filter((w) => !w.ring);
      if (inner.length < 12) continue;
      const hexes = new Set();
      for (const w of inner) for (const p of wallProfile(w, theme)) hexes.add(p.hex);
      // Not per tile — per FLOOR. Colour is the strongest grouping cue there
      // is, and every tile printing the same swatch is what made a run of
      // forty crafted pieces measure as one shape.
      assert.ok(hexes.size > inner.length,
        `floor ${id}: ${inner.length} wall tiles share only ${hexes.size} colours`);
    }
  });

  await t.test('runs are broken: gap tiles, planters AND rubble', () => {
    let gaps = 0, low = 0, planters = 0, rubble = 0, inner = 0;
    for (const id of FLOORS) {
      for (const w of rigs.get(id).walls) {
        if (w.ring) continue;
        inner++;
        if (w.gap) gaps++;
        if (w.low) low++;
        if (w.planter) planters++;
        if (w.rubble) rubble++;
      }
    }
    assert.ok(gaps / inner > 0.20,
      `only ${gaps}/${inner} interior tiles drop their seam-filling footing`);
    assert.ok(planters > 8 && rubble > 8,
      `the low tiles are all one archetype (${planters} planters, ${rubble} rubble)`);
    assert.equal(planters + rubble, low, 'every low tile must be one archetype or the other');
    // And the flag must actually change the tile: same tile, gap on vs off.
    const { walls, theme } = rigs.get(1);
    const g = walls.find((w) => w.gap && !w.ring);
    assert.ok(g, 'floor 1 has no gap tiles at all');
    const span = (t2) => wallProfile(t2, theme)
      .reduce((a, p) => Math.max(a, p.w || p.r0 || 0), 0);
    assert.ok(span(g) < span({ ...g, gap: false }) * 0.95,
      'a gap tile is no narrower than the same tile without the flag');
  });

  await t.test('the footing that welds a run is skipped, not merely hidden', () => {
    // The widest piece at ground level is the join-hider. On a gap tile there
    // must not be one.
    const { walls, theme } = rigs.get(1);
    const ground = (w) => wallProfile(w, theme)
      .filter((p) => p.y0 < 0 && !p.seam)
      .reduce((a, p) => Math.max(a, p.w || 0), 0);
    const gapTiles = walls.filter((w) => w.gap && !w.ring);
    const solidTiles = walls.filter((w) => !w.gap && !w.ring && !w.low);
    assert.ok(gapTiles.length && solidTiles.length, 'floor 1 must have both kinds of tile');
    for (const w of gapTiles) {
      assert.equal(ground(w), 0, `a gap tile at ${w.tx},${w.ty} still has its footing ply`);
    }
    assert.ok(solidTiles.some((w) => ground(w) > 3),
      'a solid tile lost its footing — the run has nothing holding it together');
  });
});

test('the scatter is not a lattice', async (t) => {
  /** Index of dispersion (variance/mean of per-cell counts). 1.0 is a Poisson
   *  field; BELOW 1 means more regular than random, which is a grid. */
  function dispersion(spots, cell) {
    const counts = new Map();
    for (const s of spots) {
      const k = `${Math.floor(s.x / cell)},${Math.floor(s.z / cell)}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const v = [...counts.values()];
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length / m;
  }

  await t.test('clusters instead of spreading evenly', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      const d = dispersion(spots, TILE_M);
      assert.ok(d > 1.25,
        `floor ${id}: index of dispersion ${d.toFixed(2)} at tile scale — at or below 1`
        + ' means the field is as regular as a grid');
      const d8 = dispersion(spots, TILE_M * 2);
      assert.ok(d8 > 1.6,
        `floor ${id}: index of dispersion ${d8.toFixed(2)} at 8 m — no thickets, no clearings`);
    }
  });

  await t.test('every archetype comes in three cut variants and leans', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      const byKind = new Map();
      for (const s of spots) {
        if (!byKind.has(s.kind)) byKind.set(s.kind, new Set());
        byKind.get(s.kind).add(s.variant);
        assert.ok(Number.isInteger(s.variant) && s.variant >= 0 && s.variant < 3,
          `floor ${id}: scatter variant ${s.variant} is not one of three`);
      }
      assert.ok(byKind.size >= 4, `floor ${id}: only ${byKind.size} scatter archetypes`);
      for (const [k, vs] of byKind) {
        assert.equal(vs.size, 3, `floor ${id}: "${k}" uses ${vs.size} of its three variants`);
      }
      // Lean and aspect. A field of plumb-vertical, uniformly-scaled pieces
      // advertises the transform that placed them however well it is placed.
      const tilts = spots.map((s) => Math.abs(s.tilt));
      assert.ok(Math.max(...tilts) > 0.25, `floor ${id}: nothing in the scatter leans`);
      const st = spots.map((s) => s.stretch);
      assert.ok(Math.max(...st) / Math.min(...st) > 1.8,
        `floor ${id}: every piece has the same aspect ratio`);
    }
  });
});

test('a floor sky matches the floor premise', async (t) => {
  /** The composed frame a floor actually renders under. */
  function frameFor(key) {
    const out = createRenderFrame();
    applyWeather(timeOfDay(0.32), weatherByName('clear'), out);
    applyFloorSky(out, key);
    return out;
  }
  const luma709 = (hex) =>
    (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;

  await t.test('the Ember Caves are not under a clear blue sky', () => {
    const island = frameFor(null);
    const cave = frameFor('ember');
    // Warmer: red must beat blue at the horizon, which it does not in any
    // daylight sky this world owns.
    const red = (cave.skyBottom >> 16) & 255, blue = cave.skyBottom & 255;
    assert.ok(red > blue * 1.5, 'the cave horizon is not warm');
    // And darker overhead, by a lot — that is the lid.
    assert.ok(luma709(cave.skyTop) < luma709(island.skyTop) * 0.45,
      `the cave roof is ${luma709(cave.skyTop).toFixed(2)} against an open sky at `
      + `${luma709(island.skyTop).toFixed(2)} — still a sky, not a ceiling`);
    // Lit from BELOW: the fill's ground half outshines its sky half, which is
    // true in a lava cavern and in nothing else in this game.
    assert.ok(luma709(cave.hemiGround) > luma709(cave.hemiSky) * 1.6,
      'the cave is lit from above like a meadow');
    assert.ok(cave.cloudTintAmt > 0.7, 'the cloud layer is not sunk into smoke');
  });

  await t.test('every declared sky stays inside the palette and leaves sunDir alone', () => {
    const base = frameFor(null);
    for (const key of Object.keys(LEVEL_SKY)) {
      const f = frameFor(key);
      assert.deepEqual(f.sunDir, base.sunDir,
        `${key}: a floor sky moved the key light — the shadow rig is derived from it`);
      for (const field of ['skyTop', 'skyMid', 'skyBottom', 'fogColor', 'hemiSky', 'hemiGround']) {
        const v = f[field];
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffff, `${key}.${field}`);
        // PAPER.inkTeal is the palette floor. Nothing, at any hour, in any
        // room, may go under it — that is the no-black law.
        const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
        const ink = [(PAPER.inkTeal >> 16) & 255, (PAPER.inkTeal >> 8) & 255, PAPER.inkTeal & 255];
        assert.ok(ch[0] + ch[1] + ch[2] >= ink[0] + ink[1] + ink[2] - 1,
          `${key}.${field} = #${v.toString(16)} is darker than PAPER.inkTeal`);
      }
      assert.ok(f.sunIntensity > 0.2, `${key}: the key light went out`);
      assert.ok(f.hemiIntensity > 0.15, `${key}: a five-year-old cannot see the floor`);
    }
  });

  await t.test('and EVERY floor has one — an hour is not a colour script', () => {
    // The resolution index.js performs: an explicit borrow first, the floor's
    // own theme key otherwise. A floor with neither would be lit by the island.
    for (const id of FLOORS) {
      const theme = LEVEL_THEMES[id];
      const key = theme.sky || theme.key;
      assert.ok(LEVEL_SKY[key],
        `floor ${id} ("${theme.name}") resolves to sky "${key}", which does not exist`
        + ' — it would stand under the island\'s meadow noon');
      if (theme.sky) {
        assert.ok(LEVEL_SKY[theme.sky], `floor ${id} names a sky that does not exist`);
      }
    }
    assert.equal(LEVEL_THEMES[4].sky, 'ember', 'floor 4 must not be under the island sky');
  });

  await t.test('no two floors are lit the same way', () => {
    // Nine rooms photographed at the same hour is the defect this table exists
    // to fix, so "they all have an entry" is not enough — they have to DIFFER.
    // The fill's two halves are the strongest single tell: hemiSky/hemiGround
    // is what decides the colour family of every shaded surface in the room.
    const seen = new Map();
    for (const id of FLOORS) {
      const t2 = LEVEL_THEMES[id];
      const f = frameFor(t2.sky || t2.key);
      const sig = `${f.hemiSky.toString(16)}/${f.hemiGround.toString(16)}/${f.skyTop.toString(16)}`;
      assert.ok(!seen.has(sig),
        `floors ${seen.get(sig)} and ${id} are lit identically (${sig})`);
      seen.set(sig, id);
    }
  });

  await t.test('a warm room is warm and a cold room is cold', () => {
    const warmth = (hex) => (((hex >> 16) & 255) - (hex & 255)) / 255;
    const fill = (id) => {
      const t2 = LEVEL_THEMES[id];
      return frameFor(t2.sky || t2.key).hemiGround;
    };
    // Ember (4), Market (7) and the Library (8) bounce warm paper; Frost (5)
    // and the Crystal Caverns (6) bounce cold. If those two groups ever cross,
    // the light is no longer saying which room you are standing in.
    for (const warm of [4, 7, 8]) {
      for (const cold of [5, 6]) {
        assert.ok(warmth(fill(warm)) > warmth(fill(cold)) + 0.10,
          `floor ${warm}'s fill is not warmer than floor ${cold}'s`);
      }
    }
  });
});

test('the Ember Caves read as caves', async (t) => {
  await t.test('the rim closes the horizon', () => {
    const { walls } = rigs.get(4);
    const ring = walls.filter((w) => w.ring);
    const far = ring.filter((w) => w.h > 6);
    assert.ok(far.length > ring.length * 0.5,
      `only ${far.length}/${ring.length} rim tiles clear 6 m — the caldera is a fence`);
    const tallest = ring.reduce((a, w) => Math.max(a, w.h), 0);
    assert.ok(tallest > 9, `the rim tops out at ${tallest.toFixed(1)} m`);
    // And the interior must NOT come up with it, or the floor is a solid block.
    const interior = walls.filter((w) => !w.ring).reduce((a, w) => Math.max(a, w.h), 0);
    assert.ok(interior < 4, `interior walls reached ${interior.toFixed(1)} m`);
  });

  await t.test('the vents are real places, spread out and off the spawn', () => {
    const { level, hf } = rigs.get(4);
    const vents = ventSpots(level, hf);
    assert.ok(vents.length >= 4, `only ${vents.length} vents — that is not a lit cavern`);
    for (const v of vents) {
      assert.ok(Math.hypot(v.u - 0.5 - level.startX, v.v - 0.5 - level.startY) >= 4,
        'a vent landed on the spawn');
      assert.ok(v.r > 2 && v.r < 7, `vent radius ${v.r}`);
      assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z));
    }
    for (let i = 0; i < vents.length; i++) {
      for (let j = i + 1; j < vents.length; j++) {
        assert.ok(Math.hypot(vents[i].u - vents[j].u, vents[i].v - vents[j].v) >= 6,
          'two vents landed in the same room');
      }
    }
    // Deterministic, like everything else the harness screenshots.
    assert.deepEqual(ventSpots(level, hf), vents);
    // And no other floor lights itself this way.
    assert.equal(ventSpots(rigs.get(1).level, rigs.get(1).hf).length > 0, true,
      'ventSpots is a pure placement query and must work anywhere it is asked');
    assert.ok(!LEVEL_THEMES[1].glow, 'only a floor with a glow paper gets vents built');
  });

  await t.test('the ember field thickens around the vents', () => {
    const { level, hf, theme, sampleHeight } = rigs.get(4);
    const vents = ventSpots(level, hf);
    const spots = groundScatter(level, hf, theme, sampleHeight, {});
    let near = 0, far = 0;
    for (const s of spots) {
      const u = s.x / TILE_M + level.width / 2, v = s.z / TILE_M + level.height / 2;
      let d = Infinity;
      for (const vt of vents) d = Math.min(d, Math.hypot(u - vt.u, v - vt.v));
      if (d < 5.5) near++; else far++;
    }
    assert.ok(near > 0 && far > 0, 'the scatter is all in one place or all in the other');
    // Area within 5.5 tiles of any of ~7 vents is a small share of the floor,
    // so a merely uniform field would put a small share of its pieces there.
    assert.ok(near / spots.length > 0.18,
      `only ${(100 * near / spots.length).toFixed(0)}% of the dressing is at a vent`
      + ' — the caves are lit from nowhere');
  });
});
