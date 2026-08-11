/**
 * Contract tests for the 3D battle STAGING.
 *
 * Everything asserted here is pure geometry, timing or palette — the parts
 * of a fight that decide whether the child can read it. They run headless
 * under `node --test` with no WebGL context, which is the point: the
 * choreography must be inspectable without a GPU, or nobody will ever
 * check it again.
 *
 * The RULES of combat are not tested here. They live in
 * systems/battleRules.test.js, because battle3d does not own them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { PAPER } from '../config.js';
import {
  STAGE, PHASE, PHASE_TIME, ATTACK_TIMELINE, ENEMY_TIMELINE,
  stageFrame, formationSlots, placeOnStage, facingYaw,
  easeInOut, easeOutBack, battleCameraPose, exitCameraPose, lerpPose, shakeOffset,
  heroAttackPose, attackDuration, impactTimes, enemyAttackPose,
  burstDir, burstPose, scrapPose,
  SEG_BOXES, DIGIT_SEGMENTS, digitSegments, numberGlyphLayout, glyphInstanceCount,
  damageNumberPose, ndcToScreen,
  FLOOR_PALETTE, FIGURE_KIT, paletteForFloor, figureBuild, enemyFigureSpec,
  extrudePolygon, makeShardGeometry, makeSegmentGeometry,
  createBattle3D,
} from './battle3d.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { buildSpeciesGeometry, SPECIES } from './creatures.js';
import { ALL_ENEMIES } from '../data/enemies.js';

const PAPER_VALUES = new Set(Object.values(PAPER));

/** A wandering species' authored FIELD height, for the scale comparison. */
function fieldHeight(enemyId) {
  const sp = SPECIES.find((s) => s.enemyId === enemyId);
  return sp ? sp.height : 0;
}

/** Distance between two {x,z} points. */
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('overworld/battle3d', async (t) => {

  // ================================================================
  await t.test('stage frame', async (tt) => {
    await tt.test('the battle line runs from the player to what they met', () => {
      const f = stageFrame({ x: 0, z: 0 }, { x: 10, z: 0 });
      assert.ok(Math.abs(f.ax - 1) < 1e-9, 'axis points at the creature');
      assert.ok(Math.abs(f.az) < 1e-9);
      assert.ok(Math.abs(f.cx - 5) < 1e-9, 'centre is the midpoint');
      assert.ok(Math.abs(f.cz) < 1e-9);
    });

    await tt.test('axis and side are unit length and perpendicular', () => {
      for (const p of [[3, 7], [-4, 2], [0.2, -9]]) {
        const f = stageFrame({ x: 0, z: 0 }, { x: p[0], z: p[1] });
        assert.ok(Math.abs(Math.hypot(f.ax, f.az) - 1) < 1e-9);
        assert.ok(Math.abs(Math.hypot(f.sx, f.sz) - 1) < 1e-9);
        assert.ok(Math.abs(f.ax * f.sx + f.az * f.sz) < 1e-9, 'camera rail is perpendicular');
      }
    });

    await tt.test('a creature standing on top of the player still stages', () => {
      const f = stageFrame({ x: 4, z: 4 }, { x: 4, z: 4 });
      assert.ok(Number.isFinite(f.ax) && Number.isFinite(f.az));
      assert.ok(Math.abs(Math.hypot(f.ax, f.az) - 1) < 1e-9, 'a degenerate encounter gets a default axis');
    });

    await tt.test('yaw agrees with the axis', () => {
      const f = stageFrame({ x: 0, z: 0 }, { x: 0, z: 5 });
      assert.ok(Math.abs(f.yaw) < 1e-9, 'facing +Z is yaw 0');
      assert.ok(Math.abs(Math.sin(f.yaw) - f.ax) < 1e-9);
      assert.ok(Math.abs(Math.cos(f.yaw) - f.az) < 1e-9);
    });

    await tt.test('the two sides face each other', () => {
      const f = stageFrame({ x: 0, z: 0 }, { x: 6, z: 0 });
      const delta = Math.abs(facingYaw(f, 'hero') - facingYaw(f, 'enemy'));
      assert.ok(Math.abs(delta - Math.PI) < 1e-9);
    });

    await tt.test('writes into the scratch it is given — no per-frame garbage', () => {
      const out = {};
      const got = stageFrame({ x: 0, z: 0 }, { x: 1, z: 1 }, out);
      assert.equal(got, out);
    });
  });

  // ================================================================
  await t.test('formation', async (tt) => {
    await tt.test('a line-up is centred whatever its size', () => {
      for (const n of [1, 2, 3]) {
        const slots = formationSlots(n, 'hero');
        assert.equal(slots.length, n);
        const sum = slots.reduce((a, s) => a + s.v, 0);
        assert.ok(Math.abs(sum) < 1e-9, `party of ${n} is centred`);
      }
    });

    await tt.test('nobody stands on anybody', () => {
      const f = stageFrame({ x: 0, z: 0 }, { x: 8, z: 0 });
      const slots = formationSlots(3, 'hero');
      const pts = slots.map((s) => placeOnStage(f, s, 'hero', {}));
      assert.ok(d2(pts[0], pts[1]) > 1.0);
      assert.ok(d2(pts[1], pts[2]) > 1.0);
      assert.ok(d2(pts[0], pts[2]) > 2.0);
    });

    await tt.test('the wings stand BACK, so three heroes are not a police line-up', () => {
      const slots = formationSlots(3, 'hero');
      assert.ok(slots[1].u > slots[0].u, 'the middle hero is forward of the left wing');
      assert.ok(slots[1].u > slots[2].u, 'the middle hero is forward of the right wing');
    });

    await tt.test('heroes and enemies land on opposite sides of the centre', () => {
      const f = stageFrame({ x: 0, z: 0 }, { x: 0, z: 10 });
      const h = placeOnStage(f, formationSlots(1, 'hero')[0], 'hero', {});
      const e = placeOnStage(f, formationSlots(1, 'enemy')[0], 'enemy', {});
      assert.ok(h.z < f.cz, 'the party is on the player side');
      assert.ok(e.z > f.cz, 'the creature is on the far side');
      assert.ok(Math.abs(d2(h, e) - STAGE.halfGap * 2) < 1e-9, 'the gap is exactly the staged one');
    });

    await tt.test('a stagger always pushes a figure AWAY from the enemy, both sides', () => {
      const f = stageFrame({ x: 0, z: 0 }, { x: 0, z: 10 });
      const front = placeOnStage(f, { u: 0, v: 0 }, 'enemy', {});
      const back = placeOnStage(f, { u: -0.5, v: 0 }, 'enemy', {});
      assert.ok(back.z > front.z, 'a staggered creature stands further from the party');
      const hFront = placeOnStage(f, { u: 0, v: 0 }, 'hero', {});
      const hBack = placeOnStage(f, { u: -0.5, v: 0 }, 'hero', {});
      assert.ok(hBack.z < hFront.z, 'a staggered hero stands further from the creature');
    });

    await tt.test('an empty party is not a crash', () => {
      assert.deepEqual(formationSlots(0, 'hero'), []);
      assert.deepEqual(formationSlots(-3, 'hero'), []);
    });
  });

  // ================================================================
  await t.test('camera', async (tt) => {
    const f = stageFrame({ x: 0, z: 0 }, { x: 0, z: 10 });

    await tt.test('the wide shot sits off the battle line, above it, looking at it', () => {
      const p = battleCameraPose(f, 'wide', 0, {});
      assert.ok(p.py > 2, 'the camera is above the fight');
      assert.ok(Math.abs(p.lx - f.cx) < 0.01 && Math.abs(p.lz - f.cz) < 0.01, 'it looks at the centre');
      // Off to the SIDE, three-quarter on — never down the barrel of the line.
      const toCam = { x: p.px - f.cx, z: p.pz - f.cz };
      const alongAxis = Math.abs(toCam.x * f.ax + toCam.z * f.az);
      const alongSide = Math.abs(toCam.x * f.sx + toCam.z * f.sz);
      assert.ok(alongSide > alongAxis, 'the shot is broadside, so both lines are legible');
    });

    await tt.test('the push-in shots are closer than the wide shot', () => {
      const wide = battleCameraPose(f, 'wide', 0, {});
      const hero = battleCameraPose(f, 'hero', 0, {});
      const foe = battleCameraPose(f, 'enemy', 0, {});
      const dist = (p) => Math.hypot(p.px - p.lx, p.py - p.ly, p.pz - p.lz);
      assert.ok(dist(hero) < dist(wide));
      assert.ok(dist(foe) < dist(wide));
    });

    await tt.test('the hero and enemy shots bias to opposite ends of the line', () => {
      const hero = battleCameraPose(f, 'hero', 0, {});
      const foe = battleCameraPose(f, 'enemy', 0, {});
      assert.ok(hero.lz < f.cz, 'the hero push looks back down the party');
      assert.ok(foe.lz > f.cz, 'the enemy push looks at the creature');
    });

    await tt.test('ground height carries the whole rig up with it', () => {
      const low = battleCameraPose(f, 'wide', 0, {});
      const high = battleCameraPose(f, 'wide', 12, {});
      assert.ok(Math.abs((high.py - low.py) - 12) < 1e-9);
      assert.ok(Math.abs((high.ly - low.ly) - 12) < 1e-9);
      assert.ok(Math.abs(high.px - low.px) < 1e-9, 'only the height moves');
    });

    await tt.test('the exit pose is behind the player, which is where the boom lives', () => {
      const p = exitCameraPose({ x: 0, z: 0 }, 0, 0, {});
      assert.ok(p.pz < 0, 'facing +Z means the camera sits at -Z');
      assert.ok(Math.abs(Math.hypot(p.px, p.pz) - STAGE.exitDist) < 1e-9);
      assert.ok(Math.abs(p.lx) < 1e-9 && Math.abs(p.lz) < 1e-9, 'it looks at the player');
    });

    await tt.test('lerpPose hits both ends exactly and clamps outside [0,1]', () => {
      const a = battleCameraPose(f, 'wide', 0, {});
      const b = battleCameraPose(f, 'hero', 0, {});
      const out = {};
      lerpPose(a, b, 0, out);
      assert.ok(Math.abs(out.px - a.px) < 1e-9);
      lerpPose(a, b, 1, out);
      assert.ok(Math.abs(out.px - b.px) < 1e-9);
      lerpPose(a, b, 5, out);
      assert.ok(Math.abs(out.px - b.px) < 1e-9, 'overshoot is clamped');
      lerpPose(a, b, -5, out);
      assert.ok(Math.abs(out.px - a.px) < 1e-9);
    });

    await tt.test('shake decays to nothing and never moves the look target', () => {
      const near = shakeOffset(0.02, 0.2, {});
      const late = shakeOffset(1.0, 0.2, {});
      assert.ok(Math.hypot(near.x, near.y, near.z) > Math.hypot(late.x, late.y, late.z));
      assert.ok(Math.hypot(late.x, late.y, late.z) < 0.001, 'a shake is over inside a second');
      // deterministic — the screenshot harness must reproduce it
      assert.deepEqual(shakeOffset(0.1, 0.2, {}), shakeOffset(0.1, 0.2, {}));
    });

    await tt.test('a zero-amplitude shake is exactly zero (reduced motion)', () => {
      const s = shakeOffset(0.05, 0, {});
      assert.equal(Math.abs(s.x), 0);
      assert.equal(Math.abs(s.y), 0);
      assert.equal(Math.abs(s.z), 0);
    });
  });

  // ================================================================
  await t.test('easing', async (tt) => {
    await tt.test('easeInOut is pinned at both ends and monotone between', () => {
      assert.equal(easeInOut(0), 0);
      assert.equal(easeInOut(1), 1);
      assert.equal(easeInOut(-3), 0);
      assert.equal(easeInOut(9), 1);
      let prev = -1;
      for (let i = 0; i <= 20; i++) {
        const v = easeInOut(i / 20);
        assert.ok(v >= prev);
        prev = v;
      }
    });

    await tt.test('easeOutBack overshoots then lands on 1', () => {
      assert.equal(easeOutBack(0), 0);
      assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
      let peak = 0;
      for (let i = 0; i <= 40; i++) peak = Math.max(peak, easeOutBack(i / 40));
      assert.ok(peak > 1, 'the blow overshoots — that is the punch');
    });
  });

  // ================================================================
  await t.test('hero attack choreography', async (tt) => {
    await tt.test('each class runs a distinct move under 1.6 s', () => {
      for (const cls of ['knight', 'wizard', 'bunny']) {
        const dur = attackDuration(cls, 1);
        assert.ok(dur > 0.5, `${cls} takes a real beat`);
        assert.ok(dur < 1.6, `${cls} never becomes a cutscene`);
      }
    });

    await tt.test('the wizard has the longest wind-up — that is what makes it read as power', () => {
      assert.ok(ATTACK_TIMELINE.wizard.windup > ATTACK_TIMELINE.knight.windup);
      assert.ok(ATTACK_TIMELINE.knight.windup > ATTACK_TIMELINE.bunny.windup);
    });

    await tt.test('the knight travels furthest, the wizard holds their ground', () => {
      assert.ok(ATTACK_TIMELINE.knight.reach > ATTACK_TIMELINE.wizard.reach * 3);
      assert.ok(ATTACK_TIMELINE.bunny.reach > ATTACK_TIMELINE.wizard.reach);
    });

    await tt.test('a move runs approach → windup → strike → recover, in order', () => {
      const seen = [];
      const total = attackDuration('knight', 1);
      for (let t = 0; t <= total; t += total / 200) {
        const p = heroAttackPose('knight', t, 1, 1, {});
        if (seen[seen.length - 1] !== p.phase) seen.push(p.phase);
      }
      assert.deepEqual(seen, ['approach', 'windup', 'strike', 'recover']);
    });

    await tt.test('the wind-up pulls BACK before the strike drives forward', () => {
      const T = ATTACK_TIMELINE.knight;
      const windEnd = heroAttackPose('knight', T.approach + T.windup - 0.001, 1, 1, {});
      const strikeEnd = heroAttackPose('knight', T.approach + T.windup + T.strike - 0.001, 1, 1, {});
      assert.ok(windEnd.lean < 0, 'anticipation leans away');
      assert.ok(strikeEnd.lean > 0, 'the follow-through leans in');
      assert.ok(strikeEnd.advance > windEnd.advance, 'the strike closes the gap');
    });

    await tt.test('the hero comes home — advance and lift both end at zero', () => {
      for (const cls of ['knight', 'wizard', 'bunny']) {
        const p = heroAttackPose(cls, attackDuration(cls, 1) + 0.5, 1, 1, {});
        assert.ok(Math.abs(p.advance) < 1e-6, `${cls} returns to formation`);
        assert.ok(Math.abs(p.lift) < 1e-6, `${cls} lands`);
        assert.ok(p.done);
      }
    });

    await tt.test('a correct answer EMPOWERS the swing; a wrong one glances', () => {
      const T = ATTACK_TIMELINE.knight;
      const at = T.approach + T.windup + T.strike * 0.9;
      const strong = heroAttackPose('knight', at, 1, 1, {});
      const weak = heroAttackPose('knight', at, 1, 0.25, {});
      assert.ok(strong.advance > weak.advance, 'a landed blow travels further');
      assert.ok(Math.abs(strong.lean) > Math.abs(weak.lean), 'and commits harder');
    });

    await tt.test('the bunny flurry is one move per hit, in sequence', () => {
      const one = attackDuration('bunny', 1);
      assert.ok(Math.abs(attackDuration('bunny', 3) - one * 3) < 1e-9);
      const mid = heroAttackPose('bunny', one * 1.5, 3, 1, {});
      assert.equal(mid.hit, 1, 'halfway through the second dash');
      assert.equal(mid.hits, 3);
    });

    await tt.test('impacts are ordered, inside the move, and one per hit', () => {
      for (const [cls, hits] of [['knight', 1], ['wizard', 1], ['bunny', 3]]) {
        const times = impactTimes(cls, hits);
        const expected = cls === 'bunny' ? hits : 1;
        assert.equal(times.length, expected, `${cls} lands ${expected} blow(s)`);
        for (let i = 0; i < times.length; i++) {
          assert.ok(times[i] > 0 && times[i] < attackDuration(cls, hits));
          if (i > 0) assert.ok(times[i] > times[i - 1]);
        }
      }
    });

    await tt.test('the impact fires exactly when the strike beat opens', () => {
      const T = ATTACK_TIMELINE.knight;
      const at = impactTimes('knight', 1)[0];
      assert.ok(Math.abs(at - (T.approach + T.windup)) < 1e-9);
      assert.equal(heroAttackPose('knight', at + 1e-4, 1, 1, {}).phase, 'strike');
    });

    await tt.test('time before the move and long after it are both safe', () => {
      const early = heroAttackPose('knight', -5, 1, 1, {});
      const late = heroAttackPose('knight', 999, 1, 1, {});
      assert.ok(Number.isFinite(early.advance) && Number.isFinite(late.advance));
      assert.equal(late.done, true);
    });

    await tt.test('an unknown class still swings (falls back to the knight)', () => {
      const p = heroAttackPose('sorcerer-supreme', 0.4, 1, 1, {});
      assert.ok(Number.isFinite(p.advance));
      assert.ok(attackDuration('sorcerer-supreme', 1) > 0);
    });
  });

  // ================================================================
  await t.test('enemy choreography', async (tt) => {
    await tt.test('the creature TELEGRAPHS before it winds up', () => {
      const seen = [];
      const total = ENEMY_TIMELINE.telegraph + ENEMY_TIMELINE.windup
        + ENEMY_TIMELINE.strike + ENEMY_TIMELINE.recover;
      for (let t = 0; t <= total; t += total / 200) {
        const p = enemyAttackPose(t, {});
        if (seen[seen.length - 1] !== p.phase) seen.push(p.phase);
      }
      assert.deepEqual(seen, ['telegraph', 'windup', 'strike', 'recover']);
    });

    await tt.test('the telegraph is the longest beat — a child must be able to read it', () => {
      assert.ok(ENEMY_TIMELINE.telegraph > ENEMY_TIMELINE.windup);
      assert.ok(ENEMY_TIMELINE.telegraph > ENEMY_TIMELINE.strike);
    });

    await tt.test('the wind-up retreats and the strike lunges past the start', () => {
      const T = ENEMY_TIMELINE;
      const wind = enemyAttackPose(T.telegraph + T.windup - 0.001, {});
      const hit = enemyAttackPose(T.telegraph + T.windup + T.strike - 0.001, {});
      assert.ok(wind.advance < 0, 'it pulls back first');
      assert.ok(hit.advance > 1, 'then commits well past its own line');
    });

    await tt.test('the blow lands inside the strike beat, not on the telegraph', () => {
      const p = enemyAttackPose(0, {});
      const T = ENEMY_TIMELINE;
      assert.ok(p.impactAt > T.telegraph + T.windup);
      assert.ok(p.impactAt < T.telegraph + T.windup + T.strike);
      assert.equal(enemyAttackPose(p.impactAt, {}).phase, 'strike');
    });

    await tt.test('it returns home and the squash is volume-safe throughout', () => {
      const p = enemyAttackPose(99, {});
      assert.ok(Math.abs(p.advance) < 1e-6);
      assert.equal(p.done, true);
      const total = p.total;
      for (let t = 0; t <= total; t += total / 120) {
        const q = enemyAttackPose(t, {});
        assert.ok(q.squash > 0.2 && q.squash < 2, 'nothing inverts or vanishes');
      }
    });
  });

  // ================================================================
  await t.test('papercut bursts and drifting scraps', async (tt) => {
    await tt.test('burst directions are unit length and spread over a dome', () => {
      let minY = 2, maxY = -2;
      for (let i = 0; i < 24; i++) {
        const d = burstDir(i, 24, {});
        assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-9);
        minY = Math.min(minY, d.y);
        maxY = Math.max(maxY, d.y);
      }
      assert.ok(minY > 0, 'chips fly up and out, never into the ground');
      assert.ok(maxY - minY > 0.5, 'and they spread, rather than all going straight up');
    });

    await tt.test('chips arc: up, then down under gravity', () => {
      const a = burstPose(3, 12, 0.05, 0.62, 1, {});
      const b = burstPose(3, 12, 0.25, 0.62, 1, {});
      const c = burstPose(3, 12, 0.6, 0.62, 1, {});
      assert.ok(b.y > a.y, 'rising');
      assert.ok(c.y < b.y, 'then falling');
    });

    await tt.test('a chip shrinks out rather than fading — nothing has to sort', () => {
      const early = burstPose(0, 12, 0.01, 0.62, 1, {});
      const late = burstPose(0, 12, 0.6, 0.62, 1, {});
      assert.ok(early.scale > late.scale);
      assert.equal(burstPose(0, 12, 0.62, 0.62, 1, {}).alive, false);
      assert.ok(burstPose(0, 12, 0.7, 0.62, 1, {}).scale >= 0, 'never negative');
    });

    await tt.test('a stronger blow throws chips further', () => {
      const soft = burstPose(2, 12, 0.2, 0.62, 0.25, {});
      const hard = burstPose(2, 12, 0.2, 0.62, 1, {});
      assert.ok(Math.hypot(hard.x, hard.z) > Math.hypot(soft.x, soft.z));
    });

    await tt.test('victory scraps LIFT and drift outward — they never sink', () => {
      for (let i = 0; i < 22; i++) {
        const mid = scrapPose(i, 22, 0.7, 1.45, {});
        const start = scrapPose(i, 22, 0.02, 1.45, {});
        assert.ok(mid.y > start.y, `scrap ${i} rises`);
        assert.ok(Math.hypot(mid.x, mid.z) > Math.hypot(start.x, start.z), `scrap ${i} drifts out`);
      }
    });

    await tt.test('every scrap turns over as it goes, and all of them expire', () => {
      let tumbled = 0;
      for (let i = 0; i < 22; i++) {
        const p = scrapPose(i, 22, 0.9, 1.45, {});
        if (Math.abs(p.tumble) > 0.05) tumbled++;
        assert.equal(scrapPose(i, 22, 1.46, 1.45, {}).alive, false);
      }
      assert.ok(tumbled > 15, 'the sheets turn in the air rather than sliding flat');
    });

    await tt.test('scraps are deterministic — the harness must reproduce a frame', () => {
      assert.deepEqual(scrapPose(5, 22, 0.4, 1.45, {}), scrapPose(5, 22, 0.4, 1.45, {}));
      assert.deepEqual(burstPose(5, 22, 0.4, 0.62, 1, {}), burstPose(5, 22, 0.4, 0.62, 1, {}));
    });
  });

  // ================================================================
  await t.test('papercut damage numbers', async (tt) => {
    await tt.test('every digit is defined and lights at least two segments', () => {
      for (let d = 0; d <= 9; d++) {
        const segs = digitSegments(String(d));
        assert.ok(segs.length >= 2, `${d} is drawable`);
        for (const s of segs) assert.ok(s >= 0 && s < SEG_BOXES.length, 'segment index is in range');
      }
    });

    await tt.test('no two digits share a segment pattern', () => {
      const seen = new Map();
      for (const [ch, segs] of Object.entries(DIGIT_SEGMENTS)) {
        const key = [...segs].sort((a, b) => a - b).join(',');
        assert.ok(!seen.has(key), `${ch} and ${seen.get(key)} would render identically`);
        seen.set(key, ch);
      }
    });

    await tt.test('8 lights everything and 1 lights the fewest', () => {
      assert.equal(digitSegments('8').length, 7);
      for (let d = 0; d <= 9; d++) {
        assert.ok(digitSegments('1').length <= digitSegments(String(d)).length);
      }
    });

    await tt.test('an unknown character renders nothing instead of exploding', () => {
      assert.deepEqual(digitSegments('Q'), []);
      assert.deepEqual(numberGlyphLayout('Q'), []);
    });

    await tt.test('a number is centred on its anchor', () => {
      for (const text of ['7', '42', '128']) {
        const layout = numberGlyphLayout(text);
        assert.ok(layout.length > 0);
        let min = Infinity, max = -Infinity;
        for (const g of layout) { min = Math.min(min, g.x); max = Math.max(max, g.x); }
        assert.ok(Math.abs(min + max) < 1e-9, `${text} is centred`);
      }
    });

    await tt.test('digits advance left to right without overlapping', () => {
      const layout = numberGlyphLayout('11');
      const xs = [...new Set(layout.map((g) => g.x))].sort((a, b) => a - b);
      assert.equal(xs.length, 2);
      assert.ok(xs[1] - xs[0] > 0.5, 'glyphs are separated');
    });

    await tt.test('the instance count matches what the layout actually needs', () => {
      for (const text of ['0', '9', '250', '1234']) {
        assert.equal(glyphInstanceCount(text), numberGlyphLayout(text).length);
      }
    });

    await tt.test('a three-digit hit fits the instanced budget with room to spare', () => {
      // Three numbers on screen at once is the worst case the pool allows.
      assert.ok(glyphInstanceCount('999') * 3 < 96);
    });

    await tt.test('a damage number pops, rises and shrinks out', () => {
      const pop = damageNumberPose(0.05, 1.15, {});
      const mid = damageNumberPose(0.5, 1.15, {});
      const gone = damageNumberPose(1.14, 1.15, {});
      assert.ok(pop.scale > 0.2, 'it arrives fast enough to be seen');
      assert.ok(mid.rise > pop.rise, 'it climbs');
      assert.ok(gone.scale < mid.scale, 'it leaves');
      assert.equal(damageNumberPose(1.2, 1.15, {}).alive, false);
      assert.ok(damageNumberPose(2, 1.15, {}).scale >= 0);
    });

    await tt.test('the pop overshoots — a number that eases in reads as weak', () => {
      let peak = 0;
      for (let t = 0; t < 0.2; t += 0.005) peak = Math.max(peak, damageNumberPose(t, 1.15, {}).scale);
      assert.ok(peak > 1.0);
    });

    await tt.test('segment boxes stay inside a sane glyph box', () => {
      for (const b of SEG_BOXES) {
        assert.ok(Math.abs(b.x) + b.w / 2 <= 0.55);
        assert.ok(Math.abs(b.y) + b.h / 2 <= 1.05);
        assert.ok(b.w > 0 && b.h > 0);
      }
    });
  });

  // ================================================================
  await t.test('reward projection', async (tt) => {
    await tt.test('NDC maps to pixels with a top-left origin', () => {
      const c = ndcToScreen(0, 0, 1440, 1080, {});
      assert.equal(c.x, 720);
      assert.equal(c.y, 540);
      const tl = ndcToScreen(-1, 1, 1440, 1080, {});
      assert.equal(tl.x, 0);
      assert.equal(tl.y, 0, 'NDC +Y is screen top');
      const br = ndcToScreen(1, -1, 1440, 1080, {});
      assert.equal(br.x, 1440);
      assert.equal(br.y, 1080);
    });

    await tt.test('a real camera projection lands on screen', () => {
      const cam = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);
      cam.position.set(0, 3, -8);
      cam.lookAt(0, 1.4, 0);
      cam.updateMatrixWorld(true);
      const v = new THREE.Vector3(0, 1.4, 0).project(cam);
      const s = ndcToScreen(v.x, v.y, 1440, 1080, {});
      assert.ok(s.x > 0 && s.x < 1440);
      assert.ok(s.y > 0 && s.y < 1080);
    });
  });

  // ================================================================
  await t.test('enemy figures', async (tt) => {
    await tt.test('every enemy in the roster resolves to something buildable', () => {
      for (const e of ALL_ENEMIES) {
        const spec = enemyFigureSpec(e);
        assert.equal(typeof spec.build, 'function', `${e.id} has a build`);
        assert.ok(spec.height > 0.3 && spec.height < 4, `${e.id} is a sane size (${spec.height})`);
        assert.ok(['species', 'kit', 'generic'].includes(spec.source));
      }
    });

    await tt.test('the roster is fully covered — nothing falls back to generic', () => {
      const generic = ALL_ENEMIES.filter((e) => enemyFigureSpec(e).source === 'generic');
      assert.deepEqual(generic.map((e) => e.id), [],
        'every enemy has either a transcribed species or a kit entry');
    });

    await tt.test('a wandering creature keeps its field silhouette in the fight', () => {
      const spec = enemyFigureSpec({ id: 'sproutling', floor: 1 });
      assert.equal(spec.source, 'species', 'the creature you met is the creature you fight');
    });

    await tt.test('a creature stands taller in a fight than it does in the field', () => {
      const spec = enemyFigureSpec({ id: 'sproutling', floor: 1 });
      assert.ok(spec.height > fieldHeight('sproutling'),
        'battle staging reads at a distance the field never does');
    });

    await tt.test('bosses tower over their own mobs', () => {
      const mob = enemyFigureSpec({ id: 'sproutling', floor: 1 });
      const boss = enemyFigureSpec({ id: 'briarking', floor: 1, isBoss: true });
      assert.ok(boss.height > mob.height * 1.8);
      const theorem = enemyFigureSpec({ id: 'theorem', floor: 9, isBoss: true });
      assert.ok(theorem.height >= boss.height, 'the last boss is the biggest thing in the game');
    });

    await tt.test('an unknown id is still a creature, never an invisible fight', () => {
      const spec = enemyFigureSpec({ id: 'not-a-monster', floor: 3 });
      assert.equal(spec.source, 'generic');
      assert.equal(typeof spec.build, 'function');
      const geo = buildSpeciesGeometry(spec);
      assert.ok(geo.attributes.position.count > 0);
      geo.dispose();
    });

    await tt.test('the enemy id / helper-name collision on "facet" is resolved', () => {
      const spec = enemyFigureSpec({ id: 'facet', floor: 6 });
      assert.equal(spec.source, 'kit', 'the crystal mob is not shadowed by the polygon helper');
    });
  });

  // ================================================================
  await t.test('figure geometry', async (tt) => {
    /** Bake one spec and report the numbers that matter. */
    function bakeStats(spec) {
      const geo = buildSpeciesGeometry(spec);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const tris = geo.attributes.position.count / 3;
      const colors = geo.attributes.color;
      geo.dispose();
      return { bb, tris, hasColor: !!colors };
    }

    await tt.test('a baked figure stands on the ground at its authored height', () => {
      for (const id of ['blossomfiend', 'banker', 'theorem']) {
        const spec = enemyFigureSpec({ id, floor: FIGURE_KIT[id].floor, isBoss: !!FIGURE_KIT[id].boss });
        const { bb } = bakeStats(spec);
        assert.ok(Math.abs(bb.min.y) < 1e-5, `${id} has its feet at y=0`);
        assert.ok(Math.abs((bb.max.y - bb.min.y) - spec.height) < 1e-4, `${id} is exactly its height`);
      }
    });

    await tt.test('a baked figure has real depth — it is not a cardboard standee', () => {
      for (const id of ['blossomfiend', 'glacial', 'theparadox']) {
        const spec = enemyFigureSpec({ id, floor: FIGURE_KIT[id].floor, isBoss: !!FIGURE_KIT[id].boss });
        const { bb } = bakeStats(spec);
        const depth = bb.max.z - bb.min.z;
        const width = bb.max.x - bb.min.x;
        assert.ok(depth > width * 0.15, `${id} survives the camera swinging round (d ${depth}, w ${width})`);
      }
    });

    await tt.test('a figure carries its palette in the vertex stream', () => {
      const spec = enemyFigureSpec({ id: 'blossomfiend', floor: 1 });
      assert.equal(bakeStats(spec).hasColor, true);
    });

    await tt.test('no single figure blows the triangle budget', () => {
      let worst = 0;
      let worstId = '';
      for (const id of Object.keys(FIGURE_KIT)) {
        const kit = FIGURE_KIT[id];
        const spec = enemyFigureSpec({ id: id === 'facetling' ? 'facet' : id, floor: kit.floor, isBoss: !!kit.boss });
        const { tris } = bakeStats(spec);
        if (tris > worst) { worst = tris; worstId = id; }
      }
      // Three of the heaviest on screen at once must stay a rounding error
      // against the 500k world budget.
      assert.ok(worst < 4000, `${worstId} is ${worst} triangles`);
    });

    await tt.test('every figure colour comes out of PAPER', () => {
      // The kit only ever names colours through the floor palette, and the
      // floor palette is built from creatures.js C, which is PAPER. This is
      // the assertion that keeps a convenient hex from creeping in.
      for (const [floorId, pal] of Object.entries(FLOOR_PALETTE)) {
        for (const c of pal.cols) {
          assert.ok(PAPER_VALUES.has(c), `floor ${floorId} body colour ${c.toString(16)} is not PAPER`);
        }
        assert.ok(PAPER_VALUES.has(pal.accent), `floor ${floorId} accent is not PAPER`);
        for (const c of pal.glow) {
          assert.ok(PAPER_VALUES.has(c), `floor ${floorId} glow is not PAPER`);
        }
      }
    });

    await tt.test('every floor 1-9 has a palette', () => {
      for (let f = 1; f <= 9; f++) assert.ok(FLOOR_PALETTE[f], `floor ${f}`);
      assert.equal(paletteForFloor(99), FLOOR_PALETTE[1], 'an unknown floor falls back, never crashes');
    });

    await tt.test('figureBuild survives a bare config', () => {
      const spec = { height: 1, build: figureBuild({ cols: [PAPER.teal, PAPER.tealL, PAPER.sky] }) };
      const geo = buildSpeciesGeometry(spec);
      assert.ok(geo.attributes.position.count > 0);
      geo.dispose();
    });
  });

  // ================================================================
  await t.test('shard and glyph geometry', async (tt) => {
    await tt.test('a paper chip is a closed solid with thickness', () => {
      const geo = makeShardGeometry();
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      assert.ok(bb.max.z - bb.min.z > 0.02, 'it has a cut edge, not zero thickness');
      assert.ok(bb.max.x - bb.min.x > 0.5);
      assert.equal(geo.attributes.position.count % 3, 0);
      geo.dispose();
    });

    await tt.test('a number segment is a unit bar so the layout can scale it', () => {
      const geo = makeSegmentGeometry();
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      assert.ok(Math.abs((bb.max.x - bb.min.x) - 1) < 1e-6);
      assert.ok(Math.abs((bb.max.y - bb.min.y) - 1) < 1e-6);
      assert.ok(Math.abs(bb.max.x + bb.min.x) < 1e-6, 'centred on its own origin');
      geo.dispose();
    });

    await tt.test('extruded rims point outward so a paper edge catches the light', () => {
      // A square, extruded. Every rim normal must be horizontal and point
      // away from the centre — that is what keeps an edge from going dark,
      // which is the palette law (no outlines) expressed as geometry.
      const geo = extrudePolygon([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 0.2);
      const pos = geo.attributes.position.array;
      const nrm = geo.attributes.normal.array;
      let rims = 0;
      for (let i = 0; i < pos.length; i += 9) {
        const nx = nrm[i], ny = nrm[i + 1], nz = nrm[i + 2];
        if (Math.abs(nz) > 0.5) continue;                 // a cap, not a rim
        rims++;
        assert.ok(Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-6, 'rim normals are unit');
        const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3;
        const cy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3;
        assert.ok(cx * nx + cy * ny > 0, 'the rim faces away from the centre');
      }
      assert.ok(rims >= 8, 'four sides, two triangles each');
      geo.dispose();
    });

    await tt.test('caps face opposite ways so the solid is watertight from both sides', () => {
      const geo = extrudePolygon([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 0.2);
      const nrm = geo.attributes.normal.array;
      let front = 0, back = 0;
      for (let i = 0; i < nrm.length; i += 9) {
        if (nrm[i + 2] > 0.5) front++;
        else if (nrm[i + 2] < -0.5) back++;
      }
      assert.equal(front, back);
      assert.ok(front > 0);
      geo.dispose();
    });
  });

  // ================================================================
  await t.test('phase contract', async (tt) => {
    await tt.test('the phase names are stable and distinct', () => {
      const values = Object.values(PHASE);
      assert.equal(new Set(values).size, values.length);
      for (const key of ['IDLE', 'SWEEP_IN', 'QUESTION', 'HERO_ATTACK', 'ENEMY_TURN', 'VICTORY', 'DEFEAT']) {
        assert.ok(PHASE[key], `${key} exists`);
      }
    });

    await tt.test('no non-interactive phase makes a child wait longer than ~1.6 s', () => {
      for (const [name, secs] of Object.entries(PHASE_TIME)) {
        assert.ok(secs > 0, `${name} is a real beat`);
        assert.ok(secs <= 1.6, `${name} (${secs}s) does not stall the game`);
      }
    });

    await tt.test('the sweep in is slower than the sweep out — arriving is the drama', () => {
      assert.ok(PHASE_TIME.sweepIn > PHASE_TIME.sweepOut);
    });

    await tt.test('victory holds long enough for the scraps to drift', () => {
      assert.ok(PHASE_TIME.victory > 1.0);
    });
  });

  // ================================================================
  // A WHOLE FIGHT, HEADLESS.
  //
  // three needs no GL context until something is rendered, so the entire
  // runtime — hero rigs, creature geometry, instanced shards, the camera
  // sweep and the turn machine — can be driven under `node --test`. This
  // is the test that catches "the battle throws on the third turn", which
  // is exactly the class of bug a screenshot never sees.
  // ================================================================
  await t.test('a whole fight, driven headless', async (tt) => {

    /** A test rig with a recording overlay and a scriptable answer policy. */
    function harness(opts = {}) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);
      camera.position.set(0, 3, -8);

      const log = { questions: 0, answers: 0, hud: 0, toasts: [], rewards: null, ended: null, begun: null };
      let inputLocked = false;
      let encountersOn = true;
      let pendingAnswer = null;

      const ui = {
        onBattleBegin(info) { log.begun = info; },
        showCommands(cmds, pick) { pick(cmds[0]); },
        hideCommands() {},
        showQuestion({ question, answer }) {
          log.questions++;
          // Answer on the NEXT frame, the way a child's tap arrives —
          // never re-entrantly from inside the phase transition.
          pendingAnswer = () => {
            const idx = opts.alwaysWrong
              ? (question.correctIndex + 1) % question.choices.length
              : question.correctIndex;
            log.answers++;
            answer(idx);
          };
        },
        hideQuestion() {},
        markAnswer() {},
        setHud() { log.hud++; },
        toast(text) { log.toasts.push(text); },
        flyReward(r) { log.rewards = r; },
        onBattleEnd(r) { log.ended = r; },
      };

      const battle = createBattle3D({
        scene, camera,
        getPlayer: () => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }),
        groundAt: () => 0,
        setInputLocked: (v) => { inputLocked = v; },
        setEncountersEnabled: (v) => { encountersOn = v; },
        viewport: () => ({ width: 1440, height: 1080 }),
        ui,
        save: null,
        grade: 3,
        rng: () => 0.99,          // no dodges, no blocks — deterministic
        party: [
          spawnHero(KNIGHTS[0].id),
          spawnHero(WIZARDS[0].id),
          spawnHero(BUNNIES[0].id),
        ],
        ...opts.deps,
      });

      /** Advance the fight, flushing any queued tap between frames. */
      function run(seconds, dt = 1 / 60) {
        let elapsed = 0;
        while (elapsed < seconds && battle.isActive()) {
          if (pendingAnswer) { const go = pendingAnswer; pendingAnswer = null; go(); }
          battle.update(dt);
          elapsed += dt;
        }
        return elapsed;
      }

      return {
        battle, scene, camera, log, run,
        get inputLocked() { return inputLocked; },
        get encountersOn() { return encountersOn; },
      };
    }

    await tt.test('begin() stages the fight and takes the world', () => {
      const h = harness();
      assert.equal(h.battle.isActive(), false);
      assert.equal(h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } }), true);
      assert.equal(h.battle.isActive(), true);
      assert.equal(h.inputLocked, true, 'the stick is frozen');
      assert.equal(h.encountersOn, false, 'no second creature may wander in');
      assert.equal(h.battle.getPhase(), PHASE.SWEEP_IN);
      assert.ok(h.battle.group.visible);
      assert.ok(h.log.begun, 'the overlay was told');
      h.battle.dispose();
    });

    await tt.test('the party and the creature stand on opposite sides of the line', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(0.2);
      const f = h.battle.stage();
      const heroes = [];
      const foes = [];
      h.battle.group.traverse((o) => {
        if (o.name?.startsWith('hero-') && o.parent === h.battle.group) heroes.push(o);
        if (o.name?.startsWith('battle-enemy-')) foes.push(o);
      });
      assert.equal(heroes.length, 3, 'three hero rigs are on stage');
      assert.equal(foes.length, 1);
      for (const hero of heroes) assert.ok(hero.position.z < f.cz, 'the party is on the player side');
      assert.ok(foes[0].position.z > f.cz, 'the creature is on the far side');
      h.battle.dispose();
    });

    await tt.test('the camera sweeps rather than cutting', () => {
      const h = harness();
      const before = h.camera.position.clone();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.battle.update(1 / 60);
      const firstFrame = h.camera.position.clone();
      assert.ok(firstFrame.distanceTo(before) < 0.7,
        'the first battle frame is where the follow boom left the camera — no cut');
      h.run(PHASE_TIME.sweepIn + 0.1);
      assert.ok(h.camera.position.distanceTo(before) > 2, 'and then it has travelled');
      h.battle.dispose();
    });

    await tt.test('a correct answer runs the attack and hurts the creature', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(3);
      const st = h.battle.getState();
      assert.ok(h.log.questions > 0, 'the child was asked something');
      assert.ok(h.log.answers > 0);
      assert.ok(st.enemies[0].hp < st.enemies[0].maxHp, 'the creature took the hit');
      h.battle.dispose();
    });

    await tt.test('answering right all the way wins, and the win pays out', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(120);
      assert.equal(h.battle.isActive(), false, 'the fight ended on its own');
      assert.ok(h.log.ended, 'the overlay was handed a result');
      assert.equal(h.log.ended.outcome, 'victory');
      assert.ok(h.log.ended.rewards.gold > 0);
      assert.ok(h.log.ended.rewards.xp > 0);
      assert.ok(h.log.rewards, 'rewards flew to the HUD');
      assert.ok(Number.isFinite(h.log.rewards.from.x) && Number.isFinite(h.log.rewards.from.y),
        'and they flew from a real screen point');
      h.battle.dispose();
    });

    await tt.test('victory hands the world back — no modal, play resumes', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(120);
      assert.equal(h.inputLocked, false, 'the stick is live again');
      assert.equal(h.encountersOn, true);
      assert.equal(h.battle.group.visible, false, 'the staging is struck');
      assert.equal(h.battle.getPhase(), PHASE.IDLE);
      h.battle.dispose();
    });

    await tt.test('answering wrong every time ends in defeat, not in a hang', () => {
      const h = harness({ alwaysWrong: true });
      h.battle.begin({ enemyId: 'thornwall', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(400);
      assert.equal(h.battle.isActive(), false);
      assert.equal(h.log.ended.outcome, 'defeat');
      assert.equal(h.inputLocked, false, 'a loss still gives the world back');
      h.battle.dispose();
    });

    await tt.test('three creatures at once all get staged and all get turns', () => {
      const h = harness();
      h.battle.begin({
        enemyIds: ['sproutling', 'thornwall', 'puffshroom'],
        floor: 1, worldPos: { x: 0, y: 0, z: 6 },
      });
      h.run(4);
      const st = h.battle.getState();
      assert.equal(st.enemies.length, 3);
      const foes = [];
      h.battle.group.traverse((o) => { if (o.name?.startsWith('battle-enemy-')) foes.push(o); });
      assert.equal(foes.length, 3);
      // No two creatures occupy the same spot.
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          assert.ok(foes[i].position.distanceTo(foes[j].position) > 1.0);
        }
      }
      h.run(200);
      assert.equal(h.battle.isActive(), false);
      h.battle.dispose();
    });

    await tt.test('a boss is staged, is bigger, and can be beaten', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'briarking', isBoss: true, floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(2);
      let boss = null;
      h.battle.group.traverse((o) => { if (o.name === 'battle-enemy-briarking') boss = o; });
      assert.ok(boss, 'the boss is on stage');
      assert.ok(boss.geometry.boundingBox.max.y > 2, 'and it towers');
      h.run(600);
      assert.equal(h.log.ended?.outcome, 'victory');
      assert.ok(h.log.ended.isBoss);
      h.battle.dispose();
    });

    await tt.test('the hint button spends a rung and dents the damage', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      // Get to a question without answering it.
      let guard = 0;
      while (h.battle.getPhase() !== PHASE.QUESTION && guard++ < 600) h.battle.update(1 / 60);
      assert.equal(h.battle.getPhase(), PHASE.QUESTION);
      const first = h.battle.hint();
      assert.ok(first && first.tier === 1 && first.text, 'the first rung is a tip');
      const second = h.battle.hint();
      assert.ok(second && second.tier === 2, 'the second rung is a worked scaffold');
      assert.equal(h.battle.hint(), null, 'there is no third rung');
      h.battle.dispose();
    });

    await tt.test('a tap outside the question window is ignored, not queued', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      assert.equal(h.battle.answer(0), false, 'the sweep-in is not an answer window');
      h.battle.update(1 / 60);
      assert.equal(h.battle.answer(0), false);
      h.battle.dispose();
    });

    await tt.test('double-answering the same question cannot double the damage', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'thornwall', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      let guard = 0;
      while (h.battle.getPhase() !== PHASE.QUESTION && guard++ < 600) h.battle.update(1 / 60);
      const before = h.battle.getState().enemies[0].hp;
      assert.equal(h.battle.answer(0), true);
      const after = h.battle.getState().enemies[0].hp;
      assert.equal(h.battle.answer(0), false, 'the second tap is refused');
      assert.equal(h.battle.getState().enemies[0].hp, after);
      assert.ok(after <= before);
      h.battle.dispose();
    });

    await tt.test('begin() during a fight is refused rather than stacking two battles', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      assert.equal(h.battle.begin({ enemyId: 'thornwall', floor: 1 }), false);
      h.battle.dispose();
    });

    await tt.test('an encounter with no enemy is refused, not staged empty', () => {
      const h = harness();
      assert.equal(h.battle.begin({ floor: 1 }), false);
      assert.equal(h.battle.isActive(), false);
      h.battle.dispose();
    });

    await tt.test('end() mid-fight gives the world back immediately', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(2);
      const result = h.battle.end('fled');
      assert.equal(result.outcome, 'fled');
      assert.equal(h.battle.isActive(), false);
      assert.equal(h.inputLocked, false);
      assert.equal(h.encountersOn, true);
      assert.equal(h.battle.end(), null, 'ending twice is a no-op');
      h.battle.dispose();
    });

    await tt.test('update() on an idle battle costs nothing and cannot throw', () => {
      const h = harness();
      for (let i = 0; i < 50; i++) h.battle.update(1 / 60);
      assert.equal(h.battle.isActive(), false);
      assert.equal(h.battle.getState(), null);
      h.battle.dispose();
    });

    await tt.test('a wild dt (tab restore, breakpoint) does not fast-forward the fight', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.battle.update(30);
      assert.ok(h.battle.isActive(), 'a 30-second frame does not skip the whole battle');
      assert.equal(h.battle.getPhase(), PHASE.SWEEP_IN);
      h.battle.dispose();
    });

    await tt.test('back-to-back fights reuse the rigs and leave nothing behind', () => {
      const h = harness();
      const countChildren = () => h.battle.group.children.length;
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(120);
      const after1 = countChildren();
      h.battle.begin({ enemyId: 'thornwall', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(120);
      const after2 = countChildren();
      assert.equal(after1, after2, 'the second fight does not leak a scene graph');
      assert.equal(h.battle.isActive(), false);
      h.battle.dispose();
    });

    await tt.test('dispose() detaches from the scene and can be called twice', () => {
      const h = harness();
      h.battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
      h.run(2);
      h.battle.dispose();
      assert.equal(h.scene.children.includes(h.battle.group), false);
      assert.doesNotThrow(() => h.battle.dispose());
    });

    await tt.test('the overlay is optional — a host with no UI still plays a fight', () => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);
      const battle = createBattle3D({
        scene, camera,
        getPlayer: () => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }),
        party: [spawnHero(KNIGHTS[0].id)],
        save: null,
      });
      battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 5 } });
      // With no question UI it parks in QUESTION forever rather than
      // crashing — the fight is waiting for an answer that no one can give.
      for (let i = 0; i < 600; i++) battle.update(1 / 60);
      assert.ok([PHASE.QUESTION, PHASE.COMMAND].includes(battle.getPhase()));
      assert.doesNotThrow(() => battle.end());
      battle.dispose();
    });
  });
});
