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
} from './level3dBuild.js';
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
      if (!ring.length) continue;
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
