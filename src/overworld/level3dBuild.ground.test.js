/**
 * The ground surface — the tests that exist because of the white seams.
 *
 * Every floor shipped with bright white lines running between its path tiles
 * and its floor tiles. Nothing caught it because nothing here was asserted:
 * the ground was cut straight into a three.js sink inside the renderer, where
 * a unit test cannot reach, and the defect was a WINDING error — the vertical
 * risers under each raised path and the skirts around the level's rim were
 * emitted as `(a, below(a), below(b))`, whose right-hand-rule normal points
 * back INTO the tile. Under a FrontSide material every one of them was
 * back-face culled, and the player was looking through the riser and out of
 * the world at the pale sky behind it.
 *
 * So the two load-bearing assertions below are:
 *
 *   WINDING   every triangle's stored normal must agree with the normal its
 *             own vertex order implies. That is a one-line check that makes
 *             an invisible surface impossible to ship again.
 *   WELDING   every upward-facing vertex at a given (x, z) must have exactly
 *             one height and one colour. That is what "no interior seams"
 *             means as a property rather than as a screenshot: adjacent tiles
 *             cannot crack, cannot z-fight and cannot step, because they are
 *             not separate surfaces at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readLevel, distanceField, heightField, makeHeightSampler, themeForFloor,
  buildGroundSurface, groundScatter, groundFields, pavedAt, groundCharAt,
  maxAdjacentStep, stepDegrees, paperLinear, PATH_LIFT, SCATTER_MIX,
} from './level3dBuild.js';
import { PAPER } from '../config.js';

const FLOORS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Everything a floor's ground is built from, once. */
function floorRig(id) {
  const level = readLevel(id);
  const dist = distanceField(level);
  const hf = heightField(level, dist);
  const theme = themeForFloor(id);
  const { sampleHeight } = makeHeightSampler(hf, level.width, level.height);
  return { level, hf, theme, sampleHeight, surface: buildGroundSurface(level, hf, theme) };
}

const rigs = new Map(FLOORS.map((id) => [id, floorRig(id)]));

/** [triangleCount, mismatches, degenerates, nonFinite] for one attribute set. */
function auditWinding(part) {
  const p = part.position, n = part.normal;
  let tris = 0, bad = 0, degenerate = 0, nonFinite = 0;
  for (let i = 0; i < p.length; i += 9) {
    tris++;
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 1e-9)) { degenerate++; continue; }
    if ((nx * n[i] + ny * n[i + 1] + nz * n[i + 2]) / len <= 0) bad++;
  }
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nonFinite++;
  return { tris, bad, degenerate, nonFinite };
}

test('ground surface', async (t) => {
  await t.test('every triangle faces the way its normal claims (the seam bug)', () => {
    for (const id of FLOORS) {
      const { surface } = rigs.get(id);
      for (const part of [surface.solid, surface.transient]) {
        if (!part) continue;
        const a = auditWinding(part);
        assert.equal(a.bad, 0, `floor ${id}: ${a.bad}/${a.tris} triangles are wound inside out`);
        assert.equal(a.degenerate, 0, `floor ${id}: ${a.degenerate} degenerate triangles`);
        assert.equal(a.nonFinite, 0, `floor ${id}: non-finite positions`);
      }
    }
  });

  await t.test('no triangle faces the ground — a floor is never seen from below', () => {
    for (const id of FLOORS) {
      const { surface } = rigs.get(id);
      const n = surface.solid.normal;
      for (let i = 0; i < n.length; i += 3) {
        assert.ok(n[i + 1] > -0.05, `floor ${id}: a ground triangle points downward`);
      }
    }
  });

  await t.test('the walkable surface is welded — one height and one colour per (x,z)', () => {
    for (const id of FLOORS) {
      const { surface } = rigs.get(id);
      const p = surface.solid.position, n = surface.solid.normal, c = surface.solid.color;
      const seen = new Map();
      let checked = 0;
      for (let v = 0; v < p.length / 3; v++) {
        // Boundary skirts carry a deliberately different colour and a normal
        // tilted 40% skyward (ny ~ 0.39); the walkable surface never falls
        // below ny 0.6 at the steepest terrace ramp on any floor.
        if (n[v * 3 + 1] < 0.6) continue;
        const key = `${Math.round(p[v * 3] * 1000)},${Math.round(p[v * 3 + 2] * 1000)}`;
        const rec = [p[v * 3 + 1], c[v * 3], c[v * 3 + 1], c[v * 3 + 2]];
        const prev = seen.get(key);
        if (!prev) { seen.set(key, rec); continue; }
        checked++;
        for (let f = 0; f < 4; f++) {
          assert.ok(Math.abs(prev[f] - rec[f]) < 1e-6,
            `floor ${id}: two surface vertices at ${key} disagree (field ${f}) — that is a seam`);
        }
      }
      assert.ok(checked > 500, `floor ${id}: expected shared vertices, saw ${checked}`);
    }
  });

  await t.test('is byte-identical on a rebuild', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, surface } = rigs.get(id);
      const again = buildGroundSurface(level, hf, theme);
      assert.deepEqual(Array.from(again.solid.position), Array.from(surface.solid.position));
      assert.deepEqual(Array.from(again.solid.color), Array.from(surface.solid.color));
    }
  });

  await t.test('stays inside its triangle budget', () => {
    let worst = 0;
    for (const id of FLOORS) worst = Math.max(worst, rigs.get(id).surface.triangles);
    assert.ok(worst > 5000, 'a subdivided ground should not be this cheap — is sub 1?');
    assert.ok(worst < 80_000, `ground alone costs ${worst} triangles of the 500 k frame budget`);
  });

  await t.test('colours are in gamut and never black', () => {
    for (const id of FLOORS) {
      const c = rigs.get(id).surface.solid.color;
      let darkest = Infinity;
      for (let i = 0; i < c.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          assert.ok(Number.isFinite(c[i + k]) && c[i + k] >= 0 && c[i + k] <= 1.35,
            `floor ${id}: ground colour out of range (${c[i + k]})`);
        }
        darkest = Math.min(darkest, c[i] + c[i + 1] + c[i + 2]);
      }
      // The deepest thing on a floor is the underside of the skirt, which is
      // pulled most of the way to PAPER.shadow. It must not go past it: the
      // palette law has no black.
      const floorLimit = paperLinear(PAPER.shadow).reduce((a, b) => a + b, 0) * 0.9;
      assert.ok(darkest >= floorLimit,
        `floor ${id}: ground reaches ${darkest.toFixed(4)}, darker than PAPER.shadow (${floorLimit.toFixed(4)})`);
    }
  });
});

test('paver ribbons', async (t) => {
  await t.test('lift the height field itself, so the sampler and the surface agree', () => {
    // Repaint every 'P' as an 'F' and rebuild. Both chars are walkable, so the
    // BFS distance field — and therefore the terraces, the shelf noise and the
    // boss rise — comes out bit for bit identical; the ONLY thing that can
    // differ is the paver lift. If the lift had stayed where it used to be (a
    // constant added to the drawn quad inside the renderer) this difference
    // would be zero everywhere, and the 0.26 m of air it opened under every
    // ribbon is exactly what the white seams were.
    let totalPaths = 0;
    for (const id of FLOORS) {
      const { level, hf } = rigs.get(id);
      const flat = readLevel(id);
      const paths = [];
      for (let y = 0; y < flat.height; y++) {
        for (let x = 0; x < flat.width; x++) {
          if (flat.code[y][x] === 'P') { flat.code[y][x] = 'F'; paths.push(y * flat.width + x); }
        }
      }
      if (!paths.length) continue;
      totalPaths += paths.length;
      const flatH = heightField(flat, distanceField(flat));
      const pathSet = new Set(paths);
      for (let k = 0; k < hf.tileH.length; k++) {
        const delta = hf.tileH[k] - flatH.tileH[k];
        const want = pathSet.has(k) && groundCharAt(level, k % level.width, Math.floor(k / level.width)) === 'P'
          ? PATH_LIFT : 0;
        assert.ok(Math.abs(delta - want) < 1e-5,
          `floor ${id}: tile ${k} moved ${delta.toFixed(4)} m, expected ${want}`);
      }
    }
    assert.ok(totalPaths > 400, `expected paver ribbons across the tower, saw ${totalPaths} tiles`);
  });

  await t.test('have a border that wanders off the tile grid', () => {
    // A pavedness that only ever reads 0 or 1 on tile boundaries is a
    // rectangle; the warped field must produce intermediate values that do not
    // line up with the lattice.
    const { level } = rigs.get(8);
    const gf = groundFields(level);
    let partial = 0, offGrid = 0;
    for (let v = 0.25; v < level.height; v += 0.5) {
      for (let u = 0.25; u < level.width; u += 0.5) {
        const { paved } = pavedAt(gf, u, v, 8 * 7919);
        if (paved > 0.02 && paved < 0.98) partial++;
        const tileIsPath = groundCharAt(level, Math.floor(u), Math.floor(v)) === 'P';
        if (tileIsPath !== (paved > 0.5)) offGrid++;
      }
    }
    assert.ok(partial > 200, `expected a soft path border, saw ${partial} partial samples`);
    assert.ok(offGrid > 40, `expected the border to leave the tile grid, saw ${offGrid} samples`);
  });

  await t.test('never tilt the ground past a walkable slope', () => {
    for (const id of FLOORS) {
      const { level, hf } = rigs.get(id);
      const deg = stepDegrees(maxAdjacentStep(level, hf));
      assert.ok(deg < 45, `floor ${id}: worst adjacent slope is ${deg.toFixed(1)} degrees`);
    }
    assert.ok(PATH_LIFT > 0 && PATH_LIFT < 0.5, 'the lift must stay well under the controller step-up');
  });
});

test('ground scatter', async (t) => {
  await t.test('dresses every floor with several themed archetypes', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      assert.ok(spots.length > 150, `floor ${id}: only ${spots.length} pieces of ground dressing`);
      assert.ok(spots.length <= 1600, `floor ${id}: ${spots.length} pieces blows the instance budget`);
      const kinds = new Set(spots.map((s) => s.kind));
      assert.ok(kinds.size >= 3, `floor ${id}: scatter uses only ${kinds.size} archetype(s)`);
      const allowed = new Set((SCATTER_MIX[theme.key] || []).map((m) => m[0]));
      for (const k of kinds) assert.ok(allowed.has(k), `floor ${id}: off-theme scatter "${k}"`);
      for (const s of spots) {
        assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
        assert.ok(s.scale > 0.3 && s.scale < 2, `floor ${id}: scatter scale ${s.scale}`);
      }
    }
  });

  await t.test('stays off the paver ribbon, which is the player\'s guide', () => {
    for (const id of FLOORS) {
      const { level, hf, theme, sampleHeight } = rigs.get(id);
      const gf = groundFields(level);
      const spots = groundScatter(level, hf, theme, sampleHeight, {});
      for (const s of spots) {
        const u = s.x / 4 + level.width / 2, v = s.z / 4 + level.height / 2;
        const { paved } = pavedAt(gf, u, v, level.id * 7919);
        assert.ok(paved <= 0.30001, `floor ${id}: scatter landed on the path (paved ${paved.toFixed(2)})`);
      }
    }
  });

  await t.test('is deterministic and scales with the density dial', () => {
    const { level, hf, theme, sampleHeight } = rigs.get(4);
    const a = groundScatter(level, hf, theme, sampleHeight, {});
    const b = groundScatter(level, hf, theme, sampleHeight, {});
    assert.deepEqual(a, b);
    const low = groundScatter(level, hf, theme, sampleHeight, { density: 0.3 });
    assert.ok(low.length < a.length * 0.6, 'the low quality tier must actually thin the scatter');
  });
});

test('paperLinear matches three\'s sRGB decode', () => {
  // Same curve three.js Color.setHex(hex, SRGBColorSpace) applies, so a colour
  // computed in this pure module lands on the same linear value as one built
  // with geobuild's lin().
  const srgb = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
  for (const hex of [PAPER.white, PAPER.shadow, PAPER.leaf, PAPER.coralD, 0x000000, 0xffffff]) {
    const got = paperLinear(hex);
    assert.ok(Math.abs(got[0] - srgb(((hex >> 16) & 255) / 255)) < 1e-6);
    assert.ok(Math.abs(got[1] - srgb(((hex >> 8) & 255) / 255)) < 1e-6);
    assert.ok(Math.abs(got[2] - srgb((hex & 255) / 255)) < 1e-6);
  }
  assert.deepEqual(paperLinear(PAPER.white, 0.5).map((v) => v * 2), paperLinear(PAPER.white));
});
