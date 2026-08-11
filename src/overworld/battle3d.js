/**
 * battle3d — the fight happens IN THE WORLD.
 *
 * THE PROBLEM THIS FILE SOLVES
 * ----------------------------
 * Walking into a monster used to cut to a flat 2D screen: a painted
 * backdrop, sprite heroes, sprite monsters, and the world you were
 * standing in gone. That cut is the single loudest "this is two games
 * stapled together" moment in the product.
 *
 * So there is no scene change any more. The camera SWEEPS from the follow
 * boom into a battle framing, the party takes formation on one side of
 * where you were standing, the creature squares up on the other, and the
 * meadow / ruin / forge you were walking through stays right there behind
 * them. When it's over the camera sweeps back and you keep walking.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It is not a rules engine. Turn order, damage, momentum, hints, the class
 * multipliers, the enemy's dodge/block and the reward curve all live in
 * systems/battleRules.js (which composes systems/combat.js, math.js,
 * mastery.js, coach.js — every one of them already tested). This file is
 * CHOREOGRAPHY and STAGING only. If you find yourself typing a number that
 * decides how much damage something does, you are in the wrong file.
 *
 * THE MATH UI IS STILL 2D. A five-year-old reads an equation on a flat,
 * high-contrast band at the bottom of the screen, not floating in
 * perspective. battle3d never draws a glyph of it — it calls the `ui`
 * adapter (see DEPS below) and lets the Phaser overlay own the question
 * band, the numpad and the hint button.
 *
 * ART LAW: every colour here comes from PAPER (config.js) via the shared
 * creature palette C; shadows are teal, never grey; no outlines.
 * TECH LAW: three r170, no post, no depth reads, no fwidth. Repeats go
 * through InstancedMesh. update() allocates nothing.
 */

import * as THREE from 'three';
import { PAPER } from '../config.js';
import { papercutMaterial, paperColor } from './materials/toon.js';
import { applyAerialFog, applyAerialFogToTree } from './materials/aerialFog.js';
import { deckleDisc } from './materials/textures.js';
import { createHeroRig } from './heroRig.js';
import {
  SPECIES, buildSpeciesGeometry, C,
  ply, plies, blob, facet, drop, blade, spike, eyes, core, mirrorZ,
} from './creatures.js';
import {
  createBattleState, nextTurn, questionForTurn, applyAnswerOutcome,
  resolveHeroAttack, resolveHeroHeal, resolveEnemyAttack, chooseEnemyTarget,
  clearGuards, commandsForHero, battleRewards, recordAnswerStats,
  allEnemiesDead, COMMANDS,
} from '../systems/battleRules.js';
import { createCoachQuestionState, takeHint } from '../systems/coach.js';
import {
  phaseForHp, phaseScale, getPhaseBeat, MAX_PHASE,
} from '../systems/bossPhases.js';
import { spawnEnemy } from '../data/enemies.js';

const TAU = Math.PI * 2;

// ==================================================================
// SECTION 1 — STAGING MATH (pure, exported, tested)
// ==================================================================

/**
 * Every distance in the battle staging, in metres. These are tuned so a
 * 4:3 iPad frame holds three heroes, up to three creatures and a slice of
 * the world behind them, with the 2D question band owning the bottom
 * third of the screen and never covering a face.
 */
export const STAGE = {
  /** Half the distance between the hero line and the enemy line. */
  halfGap: 2.8,
  /** Spacing between adjacent heroes across the battle line. */
  heroSpread: 1.35,
  /** Spacing between adjacent enemies. */
  enemySpread: 1.7,
  /** Heroes stand slightly staggered so nobody hides behind anybody. */
  heroStagger: 0.42,
  /**
   * Camera sits off to the side of the battle line, three-quarter on.
   *
   * THESE THREE ARE A FRAMING BUDGET, not taste. The widest thing on stage is
   * the enemy line at halfGap + enemySpread ≈ 4.5 m from the stage centre. At
   * fov 50 on the design 4:3 frame the half-width available is 0.62 × distance,
   * so the eye must stand at least 4.5 / 0.62 ≈ 7.3 m off the line, and it
   * stands at 8.2 to leave a margin. `camBack` is small on purpose: every
   * metre of it pulls the party nearer the lens than the creature, and the
   * first cut of this rig had camBack 3.1, which put the outside hero past the
   * right edge of the screen on a 3-hero party.
   */
  camSide: 8.6,
  camBack: 0.8,
  camHeight: 3.9,
  /** Everything is framed a little above the ground, at chest height. */
  lookHeight: 1.35,
  /** How far the camera pushes in for an attack beat. */
  pushIn: 0.30,
  /** Follow-cam pose used on the way out, so the handback is not a jump. */
  exitDist: 6.6,
  exitHeight: 3.2,
  /** The stage disc that frames the fight underfoot. */
  discRadius: 5.0,
};

/**
 * Where the fight happens and which way it faces.
 *
 * The battle line runs from the player to whatever they bumped into, so
 * the fight stages itself along the direction the encounter already had.
 * `axis` points from the hero side toward the enemy side; `side` is the
 * left-hand perpendicular, which is the camera's rail.
 *
 * @param {{x:number,z:number}} playerPos
 * @param {{x:number,z:number}} enemyPos
 * @param {object} [out] scratch to write into (no allocation in the loop)
 */
export function stageFrame(playerPos, enemyPos, out = {}) {
  let dx = (enemyPos?.x ?? 0) - (playerPos?.x ?? 0);
  let dz = (enemyPos?.z ?? 0) - (playerPos?.z ?? 0);
  let len = Math.hypot(dx, dz);
  if (len < 1e-3) { dx = 0; dz = 1; len = 1; }
  dx /= len; dz /= len;

  out.ax = dx; out.az = dz;
  // Left-hand perpendicular in the XZ plane.
  out.sx = dz; out.sz = -dx;
  out.cx = (playerPos?.x ?? 0) + dx * (len * 0.5);
  out.cz = (playerPos?.z ?? 0) + dz * (len * 0.5);
  out.yaw = Math.atan2(dx, dz);
  return out;
}

/**
 * Formation offsets in stage-local space.
 *
 *   u — along the battle axis, positive toward the OTHER side
 *   v — across the battle line
 *
 * Heroes fan back from the line so the lead reads as the closest figure;
 * enemies fan the other way. Both are centred, so a party of one and a
 * party of three sit on the same middle line.
 *
 * @param {number} count
 * @param {'hero'|'enemy'} side
 * @returns {{u:number,v:number}[]}
 */
export function formationSlots(count, side = 'hero') {
  const n = Math.max(0, count | 0);
  const slots = [];
  const spread = side === 'hero' ? STAGE.heroSpread : STAGE.enemySpread;
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const v = (i - mid) * spread;
    // The middle figure stands a step forward; the wings sit back. A flat
    // rank of three reads as a police line-up.
    const depth = Math.abs(i - mid) * STAGE.heroStagger;
    slots.push({ u: -depth, v: side === 'hero' ? v : -v });
  }
  return slots;
}

/**
 * Stage-local (u, v) → world (x, z). `u` is measured from that side's own
 * anchor, which is `halfGap` back from the centre along the axis.
 *
 * @param {object} frame from stageFrame
 * @param {{u:number,v:number}} slot
 * @param {'hero'|'enemy'} side
 * @param {object} [out]
 */
export function placeOnStage(frame, slot, side = 'hero', out = {}) {
  // `slot.u` is measured TOWARD the opponent, so a negative u always pushes a
  // figure away from the centre line whichever side it is standing on.
  const sign = side === 'hero' ? -1 : 1;
  const dist = sign * (STAGE.halfGap - (slot.u || 0));
  out.x = frame.cx + frame.ax * dist + frame.sx * (slot.v || 0);
  out.z = frame.cz + frame.az * dist + frame.sz * (slot.v || 0);
  return out;
}

/** Which way a figure on `side` should face (toward the other side). */
export function facingYaw(frame, side = 'hero') {
  return side === 'hero' ? frame.yaw : frame.yaw + Math.PI;
}

/** Smoothstep-ish ease used by every sweep in this file. */
export function easeInOut(t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

/** Overshoot ease for a blow landing — fast out, tiny settle. */
export function easeOutBack(t, s = 1.35) {
  const k = (t < 0 ? 0 : t > 1 ? 1 : t) - 1;
  return k * k * ((s + 1) * k + s) + 1;
}

/**
 * The battle camera.
 *
 * Three shots, all on the same rail so cutting between them is a move,
 * never a jump:
 *   'wide'  — both lines in frame, the world visible behind them
 *   'hero'  — pushed in past the hero line onto the attacker
 *   'enemy' — pushed in the other way while a creature winds up
 *   'exit'  — approximately where the world's follow boom wants to be
 *
 * @param {object} frame stageFrame output
 * @param {string} shot
 * @param {number} groundY ground height at the stage centre
 * @param {object} [out] {px,py,pz,lx,ly,lz}
 */
export function battleCameraPose(frame, shot, groundY = 0, out = {}) {
  const push = shot === 'hero' || shot === 'enemy' ? STAGE.pushIn : 0;
  const bias = shot === 'hero' ? -1.1 : shot === 'enemy' ? 1.1 : 0;
  const side = STAGE.camSide * (1 - push);
  const back = STAGE.camBack * (1 - push * 0.5);
  const height = STAGE.camHeight * (1 - push * 0.28);

  out.px = frame.cx + frame.sx * side - frame.ax * back + frame.ax * bias;
  out.pz = frame.cz + frame.sz * side - frame.az * back + frame.az * bias;
  out.py = groundY + height;
  out.lx = frame.cx + frame.ax * bias * 0.8;
  out.lz = frame.cz + frame.az * bias * 0.8;
  out.ly = groundY + STAGE.lookHeight;
  return out;
}

/**
 * Where the world's follow boom will want the camera when we hand back.
 * Sweeping to this before releasing is the difference between "the camera
 * returned" and "the screen jumped".
 */
export function exitCameraPose(playerPos, yaw, groundY = 0, out = {}) {
  const bx = Math.sin(yaw), bz = Math.cos(yaw);
  out.px = playerPos.x - bx * STAGE.exitDist;
  out.pz = playerPos.z - bz * STAGE.exitDist;
  out.py = groundY + STAGE.exitHeight;
  out.lx = playerPos.x;
  out.lz = playerPos.z;
  out.ly = groundY + STAGE.lookHeight;
  return out;
}

/** Component-wise pose blend. Writes into `out`; allocates nothing. */
export function lerpPose(a, b, t, out = {}) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  out.px = a.px + (b.px - a.px) * k;
  out.py = a.py + (b.py - a.py) * k;
  out.pz = a.pz + (b.pz - a.pz) * k;
  out.lx = a.lx + (b.lx - a.lx) * k;
  out.ly = a.ly + (b.ly - a.ly) * k;
  out.lz = a.lz + (b.lz - a.lz) * k;
  return out;
}

/**
 * Camera shake. Deterministic (a sum of two incommensurate sines per
 * axis), decaying, and applied as a world-space offset to the camera
 * position only — shaking the look target as well reads as an earthquake
 * rather than an impact.
 */
export function shakeOffset(t, amp, out = {}) {
  const decay = Math.exp(-t * 9);
  const a = amp * decay;
  out.x = Math.sin(t * 61.7) * a;
  out.y = Math.sin(t * 47.3 + 1.7) * a * 0.75;
  out.z = Math.sin(t * 53.1 + 3.1) * a;
  return out;
}

// ------------------------------------------------------------------
// TURN CHOREOGRAPHY
// ------------------------------------------------------------------

/**
 * Class attack timelines, in seconds. Each is four beats and the sum is
 * the whole move — no move may run past ~1.6 s, because a child who has
 * just answered correctly wants the next question, not a cutscene.
 *
 *   knight — a run in, a wound-up overhead SMASH, a heavy recover
 *   wizard — stands their ground, CHANNELS (the longest wind-up in the
 *            game, which is what makes it read as power), then releases
 *   bunny  — a DASH per hit: in, tap, out, repeat
 */
export const ATTACK_TIMELINE = {
  knight: { approach: 0.34, windup: 0.30, strike: 0.12, recover: 0.46, reach: 0.78, lift: 0.55 },
  wizard: { approach: 0.14, windup: 0.62, strike: 0.16, recover: 0.42, reach: 0.18, lift: 0.30 },
  bunny:  { approach: 0.16, windup: 0.10, strike: 0.09, recover: 0.22, reach: 0.86, lift: 0.22 },
};

/** Total duration of one class's attack, including every flurry repeat. */
export function attackDuration(cls, hits = 1) {
  const T = ATTACK_TIMELINE[cls] || ATTACK_TIMELINE.knight;
  const one = T.approach + T.windup + T.strike + T.recover;
  if (cls === 'bunny' && hits > 1) return one * hits;
  return one;
}

/**
 * Pose the attacking hero at time `t` into their move.
 *
 * Returns pure numbers in stage-local terms:
 *   advance — metres toward the enemy line (0 = home slot)
 *   lift    — metres off the ground
 *   lean    — radians of forward pitch, the wind-up and the follow-through
 *   spin    — radians of yaw flourish
 *   impact  — true on the single frame the blow lands
 *   hit     — which strike of a flurry this is (0-based)
 *
 * @param {string} cls 'knight' | 'wizard' | 'bunny'
 * @param {number} t   seconds since the move started
 * @param {number} hits how many strikes (bunny flurry)
 * @param {number} power 0..1 — a correct answer empowers, a wrong one glances
 * @param {object} [out]
 */
export function heroAttackPose(cls, t, hits = 1, power = 1, out = {}) {
  const T = ATTACK_TIMELINE[cls] || ATTACK_TIMELINE.knight;
  const one = T.approach + T.windup + T.strike + T.recover;
  const flurry = cls === 'bunny' ? Math.max(1, hits) : 1;
  const total = one * flurry;

  const clamped = t < 0 ? 0 : t > total ? total : t;
  const hit = Math.min(flurry - 1, Math.floor(clamped / one));
  const lt = clamped - hit * one;

  // A glancing blow travels less far and leans less: the child SEES the
  // difference between an answer that landed and one that did not.
  const reach = T.reach * (0.45 + 0.55 * power);
  const lift = T.lift * (0.4 + 0.6 * power);

  let advance = 0, y = 0, lean = 0, spin = 0, phase = 'approach';
  let impactU = -1;

  if (lt < T.approach) {
    const u = lt / T.approach;
    phase = 'approach';
    advance = easeInOut(u) * reach * 0.62;
  } else if (lt < T.approach + T.windup) {
    const u = (lt - T.approach) / T.windup;
    phase = 'windup';
    advance = reach * 0.62 - easeInOut(u) * reach * 0.22;
    // The wind-up pulls BACK and up — the anticipation that makes the
    // strike read as heavy rather than as a shove.
    lean = -easeInOut(u) * 0.52 * power;
    y = easeInOut(u) * lift * (cls === 'wizard' ? 1 : 0.35);
    spin = cls === 'wizard' ? u * TAU * 0.35 : -easeInOut(u) * 0.3;
  } else if (lt < T.approach + T.windup + T.strike) {
    const u = (lt - T.approach - T.windup) / T.strike;
    phase = 'strike';
    advance = reach * 0.4 + easeOutBack(u) * reach * 0.6;
    lean = -0.52 * power + easeOutBack(u) * (0.52 + 0.62) * power;
    y = lift * (cls === 'wizard' ? 1 : 0.35) * (1 - u);
    impactU = u;
  } else {
    const u = (lt - T.approach - T.windup - T.strike) / T.recover;
    phase = 'recover';
    advance = reach * (1 - easeInOut(u));
    lean = 0.62 * power * (1 - easeInOut(u));
    y = 0;
    spin = 0;
  }

  out.advance = advance;
  out.lift = y;
  out.lean = lean;
  out.spin = spin;
  out.phase = phase;
  out.hit = hit;
  out.hits = flurry;
  out.total = total;
  // The blow lands at the START of the strike beat.
  out.impactU = impactU;
  out.done = clamped >= total;
  return out;
}

/** Absolute time of the n-th impact within a move — used to schedule FX. */
export function impactTimes(cls, hits = 1) {
  const T = ATTACK_TIMELINE[cls] || ATTACK_TIMELINE.knight;
  const one = T.approach + T.windup + T.strike + T.recover;
  const flurry = cls === 'bunny' ? Math.max(1, hits) : 1;
  const at = [];
  for (let i = 0; i < flurry; i++) at.push(i * one + T.approach + T.windup);
  return at;
}

/**
 * The enemy's turn: TELEGRAPH (rear up and hold, so the child can read it
 * coming), WIND UP (pull back), STRIKE (lunge), RECOVER.
 */
export const ENEMY_TIMELINE = { telegraph: 0.46, windup: 0.22, strike: 0.14, recover: 0.40 };

/** Pose a striking enemy. Same contract as heroAttackPose. */
export function enemyAttackPose(t, out = {}) {
  const T = ENEMY_TIMELINE;
  const total = T.telegraph + T.windup + T.strike + T.recover;
  const lt = t < 0 ? 0 : t > total ? total : t;
  let advance = 0, lift = 0, squash = 1, phase = 'telegraph';

  if (lt < T.telegraph) {
    const u = lt / T.telegraph;
    phase = 'telegraph';
    lift = Math.sin(u * Math.PI) * 0.22;
    squash = 1 + Math.sin(u * Math.PI * 2) * 0.09;
  } else if (lt < T.telegraph + T.windup) {
    const u = (lt - T.telegraph) / T.windup;
    phase = 'windup';
    advance = -easeInOut(u) * 0.55;
    squash = 1 - easeInOut(u) * 0.16;
  } else if (lt < T.telegraph + T.windup + T.strike) {
    const u = (lt - T.telegraph - T.windup) / T.strike;
    phase = 'strike';
    advance = -0.55 + easeOutBack(u) * 2.35;
    squash = 1 + u * 0.2;
  } else {
    const u = (lt - T.telegraph - T.windup - T.strike) / T.recover;
    phase = 'recover';
    advance = 1.8 * (1 - easeInOut(u));
    squash = 1;
  }

  out.advance = advance;
  out.lift = lift;
  out.squash = squash;
  out.phase = phase;
  out.total = total;
  out.impactAt = T.telegraph + T.windup + T.strike * 0.35;
  out.done = lt >= total;
  return out;
}

// ------------------------------------------------------------------
// PAPER BURSTS AND DRIFTING SCRAPS
// ------------------------------------------------------------------

/** Deterministic unit direction #i of n, spread over a dome. */
export function burstDir(i, n, out = {}) {
  const gold = 2.399963229728653;      // golden-angle spiral: even, no clumps
  const a = i * gold;
  const y = 0.15 + 0.85 * ((i + 0.5) / Math.max(1, n));
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  out.x = Math.cos(a) * r;
  out.y = y;
  out.z = Math.sin(a) * r;
  return out;
}

/**
 * One shard of a papercut burst at local time `t`.
 * Ballistic, spin-decaying, and it SHRINKS rather than fading — the
 * material is opaque so nothing has to sort.
 */
export function burstPose(i, n, t, life, power = 1, out = {}) {
  const d = burstDir(i, n, _dirScratch);
  const u = life > 0 ? t / life : 1;
  const speed = (2.6 + (i % 5) * 0.42) * (0.6 + 0.7 * power);
  out.x = d.x * speed * t;
  out.z = d.z * speed * t;
  out.y = d.y * speed * t - 4.2 * t * t;
  out.spin = (1 + (i % 7) * 0.3) * t * 6.5;
  out.scale = Math.max(0, 1 - u * u);
  out.alive = u < 1;
  return out;
}

/**
 * A defeated creature does not pop. It comes APART: the sheets it was cut
 * from lift off, turn over once in the air and drift away downwind. This
 * is the whole victory beat, and it is why there is no modal.
 */
export function scrapPose(i, n, t, life, out = {}) {
  const u = life > 0 ? t / life : 1;
  const a = i * 2.399963229728653;
  const r = 0.25 + ((i * 7) % n) / n * 0.75;
  const rise = 1.15 + ((i * 3) % 5) * 0.2;
  out.x = Math.cos(a) * r * (0.5 + u * 1.7);
  out.z = Math.sin(a) * r * (0.5 + u * 1.7);
  out.y = u * rise + Math.sin(u * 6 + i) * 0.14;
  out.spin = a + u * (2.4 + (i % 4) * 0.7);
  out.tumble = Math.sin(u * 4.5 + i * 1.7) * 1.2;
  out.scale = Math.max(0, 1 - Math.max(0, u - 0.55) / 0.45);
  out.alive = u < 1;
  return out;
}

const _dirScratch = { x: 0, y: 0, z: 0 };

// ------------------------------------------------------------------
// BIG PAPERCUT DAMAGE NUMBERS
// ------------------------------------------------------------------
//
// The number that pops out of a hit is CUT FROM PAPER like everything
// else: a seven-segment figure whose segments are extruded paper bars.
// No canvas, no font atlas, no texture — which also means it renders
// identically on the SwiftShader screenshot harness and on the device.
//
// Segment order is the classic one:  0 top, 1 top-right, 2 bottom-right,
// 3 bottom, 4 bottom-left, 5 top-left, 6 middle.

/** Local layout of each segment inside a 1-wide, 2-tall glyph box. */
export const SEG_BOXES = [
  { x: 0.00, y: 0.90, w: 0.62, h: 0.17, vertical: false }, // 0 top
  { x: 0.34, y: 0.47, w: 0.17, h: 0.66, vertical: true },  // 1 top-right
  { x: 0.34, y: -0.47, w: 0.17, h: 0.66, vertical: true }, // 2 bottom-right
  { x: 0.00, y: -0.90, w: 0.62, h: 0.17, vertical: false },// 3 bottom
  { x: -0.34, y: -0.47, w: 0.17, h: 0.66, vertical: true },// 4 bottom-left
  { x: -0.34, y: 0.47, w: 0.17, h: 0.66, vertical: true }, // 5 top-left
  { x: 0.00, y: 0.00, w: 0.62, h: 0.17, vertical: false }, // 6 middle
];

/** Which segments each glyph lights. */
export const DIGIT_SEGMENTS = {
  '0': [0, 1, 2, 3, 4, 5],
  '1': [1, 2],
  '2': [0, 1, 6, 4, 3],
  '3': [0, 1, 6, 2, 3],
  '4': [5, 6, 1, 2],
  '5': [0, 5, 6, 2, 3],
  '6': [0, 5, 6, 4, 3, 2],
  '7': [0, 1, 2],
  '8': [0, 1, 2, 3, 4, 5, 6],
  '9': [0, 1, 2, 3, 5, 6],
  '-': [6],
  '!': [0, 1],
};

/** Segments for one character, or an empty list for anything unknown. */
export function digitSegments(ch) {
  return DIGIT_SEGMENTS[ch] || [];
}

/** Advance between glyph centres, in glyph-box widths. */
export const GLYPH_ADVANCE = 0.86;

/**
 * Lay a string out as a centred row of segments.
 * @returns {{seg:number, x:number}[]} one entry per lit segment
 */
export function numberGlyphLayout(text) {
  const s = String(text);
  const out = [];
  const width = (s.length - 1) * GLYPH_ADVANCE;
  for (let i = 0; i < s.length; i++) {
    const gx = i * GLYPH_ADVANCE - width * 0.5;
    for (const seg of digitSegments(s[i])) out.push({ seg, x: gx });
  }
  return out;
}

/** Total instance count a string will need. */
export function glyphInstanceCount(text) {
  let n = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) n += digitSegments(s[i]).length;
  return n;
}

/**
 * How a damage number behaves over its life: a punchy pop-in, a slow rise
 * and a shrink-out. It never fades — opaque paper, no sorting.
 */
export function damageNumberPose(t, life = 1.15, out = {}) {
  const u = life > 0 ? t / life : 1;
  const pop = u < 0.16 ? easeOutBack(u / 0.16, 2.2) : 1;
  out.rise = easeInOut(Math.min(1, u * 1.4)) * 1.25;
  out.scale = pop * Math.max(0, 1 - Math.max(0, u - 0.68) / 0.32);
  out.tilt = Math.sin(u * 5.2) * 0.1 * (1 - u);
  out.alive = u < 1;
  return out;
}

// ------------------------------------------------------------------
// PROJECTION (rewards fly from a world point to a HUD point)
// ------------------------------------------------------------------

/**
 * World point → screen pixels, top-left origin.
 * @param {number} ndcX -1..1
 * @param {number} ndcY -1..1
 */
export function ndcToScreen(ndcX, ndcY, width, height, out = {}) {
  out.x = (ndcX * 0.5 + 0.5) * width;
  out.y = (-ndcY * 0.5 + 0.5) * height;
  return out;
}

// ==================================================================
// SECTION 2 — 3D PAPERCUT CREATURES FOR THE ENEMY LINE
// ==================================================================
//
// creatures.js already carries three hand-transcribed mobs per floor,
// built from the same silhouettes as data/monsterArt.js. Those are used
// verbatim — a creature you fought in the field is the SAME creature in
// the battle staging, which is most of why the fight reads as continuous.
//
// The remaining roster (the two mobs per floor that never wander, plus
// the nine bosses) is generated from one parametric papercut figure. It
// takes the floor's palette and a silhouette family, so a Blossom Fiend
// is unmistakably a floor-1 garden thing and the Theorem is unmistakably
// the end of the game — without eighteen more hand-authored builds.

/** Per-floor paper stack: [core, mid, face] plus an accent for ornament. */
export const FLOOR_PALETTE = {
  1: { cols: [C.gDark, C.gMid, C.gSage], accent: C.coral, glow: [C.gold, C.peach] },
  2: { cols: [C.tDeep, C.tMid, C.tLite], accent: C.tPale, glow: [C.tLite, C.tPale] },
  3: { cols: [C.tDeep, C.tMid, C.tPale], accent: C.white, glow: [C.white, C.tPale] },
  4: { cols: [C.emD, C.em, C.emL], accent: C.emG, glow: [C.emG, C.emO] },
  5: { cols: [C.iceD, C.iceM, C.ice], accent: C.iceL, glow: [C.iceL, C.ice] },
  6: { cols: [C.cryD, C.cry, C.cryS], accent: C.cryL, glow: [C.cryL, C.cryR] },
  7: { cols: [C.mkD, C.mk, C.mkP], accent: C.mkC, glow: [C.gold, C.mkP] },
  8: { cols: [C.lb, C.lbL, C.lbW], accent: C.lav, glow: [C.lav, C.lbW] },
  9: { cols: [C.lav, C.cry, C.cryL], accent: C.gold, glow: [C.gold, C.cryL] },
};

/** Fall back to the garden rather than to nothing. */
export function paletteForFloor(floor) {
  return FLOOR_PALETTE[floor] || FLOOR_PALETTE[1];
}

/**
 * The parametric papercut figure.
 *
 * One body silhouette cut as a deep core with lighter sheets on its face
 * (creatures.js `plies` — the move that makes 3D read as paper), a ring
 * of ornament (petals, spikes, wings, pages, coins), eyes that are never
 * black, and an optional lit core. Bosses add a halo disc behind them.
 *
 * Authored in the same canvas units as every other creature: y points
 * DOWN, the figure is ~100 units tall, and buildSpeciesGeometry
 * normalises it to `height` metres with its feet at y = 0.
 */
export function figureBuild(cfg) {
  return function build(s) {
    const w = cfg.width ?? 44;
    const cols = cfg.cols;
    const cy = -54;                 // body centre, above the feet
    const ry = cfg.ry ?? 42;

    // Halo — a boss arrives with a sheet of paper behind its head.
    if (cfg.halo) {
      ply(s, facet(0, cy - 6, w * 1.55, cfg.haloN ?? 14, 0.21, 0.94),
        { z: -w * 0.85, d: 5, c: cfg.halo, edge: 0.2 });
    }

    // Base — the sheet the figure stands on, so nothing floats.
    ply(s, blob(0, -7, w * 0.82, 11, 9, 0.12), { z: -w * 0.34, d: w * 0.68, c: cols[0] });

    // Ornament goes BEHIND the body so the body's cut edge stays on show.
    const backStart = s.pos.length;
    if (cfg.crest) {
      const cr = cfg.crest;
      const n = cr.n ?? 5;
      const spread = cr.spread ?? 0.44;
      const cc = cr.c ?? cfg.accent ?? C.cream;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * spread;
        const ox = Math.cos(a) * w * 0.66;
        const oy = cy + Math.sin(a) * ry * 0.66;
        if (cr.kind === 'spike') {
          ply(s, spike(ox, oy, cr.wid ?? 17, cr.len ?? 40, a), { z: -6, d: 12, c: cc });
        } else if (cr.kind === 'wing') {
          ply(s, blade(ox, oy, cr.len ?? 54, cr.wid ?? 22, a, 0.62), { z: -8, d: 11, c: cc });
        } else {
          ply(s, blade(ox, oy, cr.len ?? 44, cr.wid ?? 15, a, 0.45), { z: -6, d: 11, c: cc });
        }
      }
    }
    mirrorZ(s, backStart);

    // Body.
    let outline;
    switch (cfg.body) {
      case 'facet':
        outline = facet(0, cy, w, cfg.sides ?? 6, cfg.rot ?? 0.32, ry / w);
        break;
      case 'drop':
        outline = drop(0, cy + ry, w, ry * 2, 11);
        break;
      case 'slab':
        outline = [[-w, cy - ry], [w * 0.96, cy - ry * 0.94], [w, cy + ry], [-w * 0.94, cy + ry * 0.96]];
        break;
      case 'coil':
        outline = blob(0, cy, w, ry, 15, 0.19, 0.4);
        break;
      default:
        outline = blob(0, cy, w, ry, 12, cfg.lobe ?? 0.09, 0.2);
    }
    const face = plies(s, outline, cols, { step: 5, d: 6, shrink: cfg.shrink ?? 0.85 });

    // Front-face details — spots, coins, page edges. Never outlines.
    const dotStart = s.pos.length;
    if (cfg.dots) {
      const dotCol = cfg.accent ?? C.cream;
      for (let i = 0; i < cfg.dots; i++) {
        const a = i * 2.399963229728653;
        const r = 0.28 + ((i * 5) % 7) / 7 * 0.5;
        ply(s, blob(Math.cos(a) * w * r, cy + Math.sin(a) * ry * r, 6.5, 5.5, 6, 0.14, a),
          { z: face, d: 2, c: dotCol, back: false, edge: 0.16 });
      }
    }
    mirrorZ(s, dotStart);

    eyes(s, 0, cy + (cfg.eyeY ?? -6), cfg.eyeR ?? 8, face + 1, cfg.eyeSpread ?? 15, cfg.eyeTilt ?? 0.18);
    if (cfg.glow) core(s, 0, cy + (cfg.glowY ?? 26), cfg.glowR ?? 9, face + 1, cfg.glow[0], cfg.glow[1]);
  };
}

/**
 * The roster that creatures.js does not cover: two mobs a floor plus the
 * nine bosses. Family + a couple of numbers each; the palette comes from
 * the floor, so nothing here can drift out of PAPER.
 */
export const FIGURE_KIT = {
  // Floor 1 — the Garden
  blossomfiend: { floor: 1, height: 1.05, body: 'blob', crest: { kind: 'petal', n: 7, len: 46, spread: 0.5 }, dots: 5, glow: true },
  briarking:    { floor: 1, height: 2.6, boss: true, body: 'blob', width: 52, crest: { kind: 'spike', n: 7, len: 56, spread: 0.42 }, dots: 6, glow: true },
  // Floor 2 — Tidepool Ruins
  abyssaleel:   { floor: 2, height: 1.15, body: 'coil', width: 34, ry: 50, crest: { kind: 'wing', n: 5, len: 48, spread: 0.6 }, glow: true },
  pressure:     { floor: 2, height: 2.5, boss: true, body: 'blob', width: 50, crest: { kind: 'wing', n: 7, len: 62, spread: 0.5 }, dots: 7, glow: true },
  // Floor 3 — Sky Palace
  thunderclap:  { floor: 3, height: 1.2, body: 'facet', sides: 5, crest: { kind: 'spike', n: 5, len: 46, spread: 0.55 }, glow: true },
  skywhale:     { floor: 3, height: 2.7, boss: true, body: 'blob', width: 58, ry: 34, crest: { kind: 'wing', n: 6, len: 66, spread: 0.52 }, dots: 5, glow: true },
  // Floor 4 — Ember Forge
  ashwalker:    { floor: 4, height: 1.1, body: 'drop', crest: { kind: 'spike', n: 6, len: 34, spread: 0.4 }, dots: 4, glow: true },
  pyroclast:    { floor: 4, height: 2.6, boss: true, body: 'facet', sides: 7, width: 52, crest: { kind: 'spike', n: 9, len: 52, spread: 0.36 }, glow: true },
  // Floor 5 — Frostwind
  glacial:      { floor: 5, height: 1.2, body: 'facet', sides: 5, crest: { kind: 'spike', n: 5, len: 44, spread: 0.5 }, glow: true },
  absolutezero: { floor: 5, height: 2.6, boss: true, body: 'facet', sides: 6, width: 50, crest: { kind: 'spike', n: 8, len: 58, spread: 0.4 }, dots: 5, glow: true },
  // Floor 6 — Crystal Caverns
  facetling:    { floor: 6, height: 1.0, body: 'facet', sides: 6, crest: { kind: 'spike', n: 4, len: 36, spread: 0.6 }, glow: true },
  theprism:     { floor: 6, height: 2.7, boss: true, body: 'facet', sides: 8, width: 52, crest: { kind: 'spike', n: 8, len: 60, spread: 0.4 }, dots: 6, glow: true },
  // Floor 7 — The Market
  banker:       { floor: 7, height: 1.15, body: 'slab', width: 38, crest: { kind: 'petal', n: 3, len: 30, spread: 0.7 }, dots: 6 },
  counterfeiter:{ floor: 7, height: 2.5, boss: true, body: 'slab', width: 50, crest: { kind: 'petal', n: 7, len: 48, spread: 0.44 }, dots: 8, glow: true },
  // Floor 8 — The Library
  archivist:    { floor: 8, height: 1.2, body: 'slab', width: 36, crest: { kind: 'petal', n: 5, len: 38, spread: 0.5 }, dots: 4 },
  theparadox:   { floor: 8, height: 2.6, boss: true, body: 'coil', width: 46, crest: { kind: 'wing', n: 8, len: 58, spread: 0.44 }, dots: 6, glow: true },
  // Floor 9 — The Theorem's Sanctum
  grimoire:     { floor: 9, height: 1.25, body: 'slab', width: 38, crest: { kind: 'petal', n: 5, len: 40, spread: 0.48 }, dots: 5, glow: true },
  theorem:      { floor: 9, height: 3.0, boss: true, body: 'facet', sides: 9, width: 56, crest: { kind: 'spike', n: 11, len: 66, spread: 0.31 }, dots: 9, glow: true },
};

// `facet` is both a creature id and an exported polygon helper, so the kit
// stores it under an alias and this map resolves the collision.
const FIGURE_ALIAS = { facet: 'facetling' };

/**
 * Resolve an enemy id to something buildSpeciesGeometry can bake.
 *
 * Order of preference:
 *   1. the hand-transcribed wandering species (identical to the field)
 *   2. the parametric figure kit
 *   3. a generic floor-coloured blob, so an unknown id is still a
 *      creature and never an invisible fight
 *
 * @returns {{ id:string, height:number, build:Function, source:string }}
 */
export function enemyFigureSpec(enemy) {
  const id = typeof enemy === 'string' ? enemy : enemy?.id;
  const floor = (typeof enemy === 'object' && enemy?.floor) || FIGURE_KIT[id]?.floor || 1;
  const isBoss = typeof enemy === 'object' ? !!enemy?.isBoss : !!FIGURE_KIT[id]?.boss;

  const species = SPECIES.find((sp) => sp.enemyId === id);
  if (species && !isBoss) {
    return {
      id,
      // Battle staging reads at a distance the field never does: the
      // wandering scale is honest but small on screen, so a fighting
      // creature stands a third taller.
      height: species.height * 1.34,
      build: species.build,
      source: 'species',
    };
  }

  const kitKey = FIGURE_ALIAS[id] || id;
  const kit = FIGURE_KIT[kitKey];
  const pal = paletteForFloor(kit?.floor ?? floor);
  const cfg = {
    ...(kit || { body: 'blob', height: isBoss ? 2.5 : 1.05, dots: 4, glow: true }),
    cols: pal.cols,
    accent: pal.accent,
  };
  if (cfg.crest) cfg.crest = { ...cfg.crest, c: cfg.crest.c ?? pal.accent };
  if (cfg.glow === true) cfg.glow = pal.glow;
  if (cfg.boss || isBoss) cfg.halo = pal.accent;

  return {
    id,
    height: cfg.height ?? (isBoss ? 2.5 : 1.05),
    build: figureBuild(cfg),
    source: kit ? 'kit' : 'generic',
  };
}

// ==================================================================
// SECTION 3 — THE RUNTIME
// ==================================================================

/** Phases of a fight. Exported so the integrator can log/assert on them. */
export const PHASE = {
  IDLE: 'idle',
  SWEEP_IN: 'sweepIn',
  INTRO: 'intro',
  COMMAND: 'command',
  QUESTION: 'question',
  HERO_ATTACK: 'heroAttack',
  ENEMY_TURN: 'enemyTurn',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  SWEEP_OUT: 'sweepOut',
};

/** How long each non-interactive phase runs, in seconds. */
export const PHASE_TIME = {
  sweepIn: 1.05,
  intro: 0.70,
  victory: 1.55,
  defeat: 1.30,
  sweepOut: 0.85,
  /** Beat between an answer resolving and the next turn opening. */
  beat: 0.34,
};

const MAX_SHARDS = 96;
const MAX_GLYPH_SEGMENTS = 96;
const MAX_NUMBERS = 3;
const DAMAGE_NUMBER_LIFE = 1.15;
const BURST_LIFE = 0.62;
const SCRAP_LIFE = 1.45;
const SCRAPS_PER_ENEMY = 22;

// Module scratch — update() must never allocate.
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _eul = new THREE.Euler(0, 0, 0, 'YXZ');
const _col = new THREE.Color();
const _pose = { advance: 0, lift: 0, lean: 0, spin: 0, phase: '', hit: 0, hits: 1, total: 0, impactU: -1, done: false };
const _epose = { advance: 0, lift: 0, squash: 1, phase: '', total: 0, impactAt: 0, done: false };
const _shake = { x: 0, y: 0, z: 0 };
const _scrap = { x: 0, y: 0, z: 0, spin: 0, tumble: 0, scale: 1, alive: true };
const _dnum = { rise: 0, scale: 1, tilt: 0, alive: true };
const _screen = { x: 0, y: 0 };
const _slotPos = { x: 0, z: 0 };

/**
 * Build the battle runtime.
 *
 * ── DEPS ────────────────────────────────────────────────────────────
 * Required:
 *   scene            THREE.Scene the world is already drawing
 *   camera           THREE.PerspectiveCamera — battle3d writes it while
 *                    isActive() is true, and nothing else may
 *
 * World interface (all optional, all no-op by default):
 *   getPlayer()      → { pos:{x,y,z}, yaw }  live controller state
 *   groundAt(x,z)    → y
 *   setInputLocked(v)
 *   setEncountersEnabled(v)
 *   playerRig        the overworld hero rig; its `group` is hidden for the
 *                    duration so the lead hero is not on screen twice
 *   viewport()       → { width, height } for reward projection
 *
 * Content:
 *   party            hero records (spawnHero shape). May also be passed
 *                    per-encounter.
 *   save, grade, floor, reducedMotion, rng
 *
 * The 2D overlay adapter (`ui`) — the ONLY route to the math UI:
 *   ui.onBattleBegin({ party, enemies, floor, grade, isBoss })
 *   ui.showCommands(commands, pick)         pick(cmd)
 *   ui.hideCommands()
 *   ui.showQuestion({ question, stars, hero, command, answer, hint })
 *                                           answer(choiceIndex), hint()
 *   ui.hideQuestion()
 *   ui.markAnswer({ index, correct, correctIndex })
 *   ui.showHint({ tier, text })
 *   ui.onBossPhase({ phase, beat, enemy }) a boss crossed an HP threshold
 *   ui.setHud(snapshot)                     momentum / streak / HP bars
 *   ui.toast(text, cssColor)
 *   ui.flyReward({ gold, xp, from:{x,y} })  from = screen px of the kill
 *   ui.onBattleEnd({ outcome, rewards })
 *
 * Lifecycle hooks:
 *   hooks.onBegin(encounter) / onVictory(result) / onDefeat() / onEnd(result)
 */
export function createBattle3D(deps = {}) {
  const {
    scene = null,
    camera = null,
    getPlayer = () => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }),
    groundAt = () => 0,
    setInputLocked = () => {},
    setEncountersEnabled = () => {},
    playerRig = null,
    viewport = () => ({ width: 1440, height: 1080 }),
    ui = {},
    audio = null,
    hooks = {},
    save = null,
    reducedMotion = false,
    rng = Math.random,
    castShadow = true,
  } = deps;

  let party = deps.party || [];
  let grade = deps.grade ?? 3;
  let floor = deps.floor ?? 1;

  // ── Persistent scene furniture (built once, reused every fight) ──────
  const group = new THREE.Group();
  group.name = 'battle3d';
  group.visible = false;
  if (scene) scene.add(group);

  const disposables = [];

  /**
   * TWO materials, and the split is not cosmetic:
   *   bodyMat — creatures carry their whole palette in the VERTEX stream
   *             (that is how creatures.js gets thirty species out of one
   *             shader), so it must declare vertexColors.
   *   chipMat — shards and damage-number segments are one colour each,
   *             supplied per INSTANCE. A material cannot take both without
   *             the two colour sources multiplying into mud.
   */
  const bodyMat = papercutMaterial(0xffffff, {
    vertexColors: true, space: 'local', scale: 0.35, grain: 0.055, normal: 0.07, bleach: 0.05,
  });
  const chipMat = papercutMaterial(0xffffff, {
    space: 'local', scale: 0.5, grain: 0.06, normal: 0.08, bleach: 0.1,
  });
  disposables.push(bodyMat, chipMat);

  // The stage disc: a teal-tinted sheet under the fight that says "this
  // patch of ground is the arena" without walling the world off.
  const discGeo = new THREE.CircleGeometry(STAGE.discRadius, 40);
  // Hand-fogged: index.js sweeps applyAerialFogToTree over the scene once at
  // boot, long before this group exists, so a material born here has to opt
  // into the world's atmosphere itself or it will sit outside the one sky.
  const discMat = applyAerialFog(new THREE.MeshBasicMaterial({
    color: paperColor(PAPER.shadow), transparent: true, opacity: 0.17,
    depthWrite: false, fog: true, alphaMap: deckleDisc(),
  }));
  disposables.push(discGeo, discMat);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 1;
  group.add(disc);

  // Shards: burst confetti AND victory scraps come out of the same pool,
  // so a whole fight's particle budget is one draw call.
  const shardGeo = makeShardGeometry();
  disposables.push(shardGeo);
  const shards = new THREE.InstancedMesh(shardGeo, chipMat, MAX_SHARDS);
  shards.name = 'battle-shards';
  shards.frustumCulled = false;
  shards.castShadow = false;
  shards.count = 0;
  shards.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHARDS * 3), 3);
  group.add(shards);

  // Damage numbers: one instanced segment bar, every digit of every
  // number on screen. Also one draw call.
  const segGeo = makeSegmentGeometry();
  disposables.push(segGeo);
  const glyphs = new THREE.InstancedMesh(segGeo, chipMat, MAX_GLYPH_SEGMENTS);
  glyphs.name = 'battle-damage-numbers';
  glyphs.frustumCulled = false;
  glyphs.castShadow = false;
  glyphs.count = 0;
  glyphs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GLYPH_SEGMENTS * 3), 3);
  group.add(glyphs);

  // ── Pools ───────────────────────────────────────────────────────────
  const shardPool = [];
  for (let i = 0; i < MAX_SHARDS; i++) {
    shardPool.push({ live: false, kind: 'burst', t: 0, life: 0, i: 0, n: 1, power: 1, ox: 0, oy: 0, oz: 0, r: 0, g: 0, b: 0, size: 1 });
  }
  const numberPool = [];
  for (let i = 0; i < MAX_NUMBERS; i++) {
    numberPool.push({ live: false, t: 0, text: '', x: 0, y: 0, z: 0, size: 1, r: 0, g: 0, b: 0, layout: null });
  }

  /** Hero rigs, cached across fights by hero id — rebuilding is expensive. */
  const heroRigs = new Map();
  /** Enemy geometries, cached by enemy id. */
  const enemyGeos = new Map();
  /** Live enemy figures for the current fight. */
  const enemyFigures = [];
  /** Live hero entries for the current fight. */
  const heroEntries = [];

  // ── Battle state ────────────────────────────────────────────────────
  let phase = PHASE.IDLE;
  let pt = 0;                 // seconds in the current phase
  let clock = 0;              // seconds since begin()
  let state = null;           // battleRules BattleState
  let frame = { ax: 0, az: 1, sx: 1, sz: 0, cx: 0, cz: 0, yaw: 0 };
  let stageY = 0;
  let coach = null;
  let question = null;
  let command = COMMANDS.FIGHT;
  let activeHero = -1;
  let attackPower = 1;        // 1 = correct, 0.25 = glancing
  let attackHits = 1;
  let attackClass = 'knight';
  let pendingResult = null;   // resolved damage waiting on the impact frame
  let impactIdx = 0;
  let enemyQueue = [];
  let enemyIdx = 0;
  let enemyTarget = null;
  let enemyStruck = false;
  let answerLocked = true;
  let rewards = null;
  let outcome = null;
  let shakeT = 999;
  let shakeAmp = 0;
  /** Boss act, 1..3. Driven by systems/bossPhases.js — the same thresholds,
   *  the same lines and the same swell the 2D fight uses. */
  let bossPhase = 1;
  /** Impact times for the move in flight — precomputed so update() never allocates. */
  let attackImpacts = [];

  // Camera: `camNow` is what we write, `camGoal` is where we are heading.
  const camNow = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
  const camGoal = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
  const camFrom = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
  let camBlend = 1;
  let camBlendDur = 1;

  // ── Small helpers ───────────────────────────────────────────────────

  function play(key) { try { audio?.play?.(key); } catch { /* audio is a nicety */ } }
  function toast(text, color) { try { ui.toast?.(text, color); } catch { /* overlay optional */ } }

  function setShot(shot, dur = 0.55) {
    camFrom.px = camNow.px; camFrom.py = camNow.py; camFrom.pz = camNow.pz;
    camFrom.lx = camNow.lx; camFrom.ly = camNow.ly; camFrom.lz = camNow.lz;
    if (shot === 'exit') {
      const p = getPlayer();
      exitCameraPose(p.pos, p.yaw, groundAt(p.pos.x, p.pos.z), camGoal);
    } else {
      battleCameraPose(frame, shot, stageY, camGoal);
    }
    camBlend = 0;
    camBlendDur = Math.max(0.001, dur);
  }

  function shake(amp) {
    if (reducedMotion) return;
    shakeT = 0;
    shakeAmp = amp;
  }

  function hudSnapshot() {
    if (!state) return null;
    return {
      momentum: state.momentum,
      streak: state.streak,
      turn: state.turn,
      activeHero,
      party: state.party,
      enemies: state.enemies,
      floor: state.floor,
      isBoss: state.isBoss,
      bossPhase: state.isBoss ? bossPhase : 0,
      phase,
    };
  }

  function pushHud() { try { ui.setHud?.(hudSnapshot()); } catch { /* overlay optional */ } }

  // ── Spawning FX ─────────────────────────────────────────────────────

  function spawnShard(kind, x, y, z, colorInt, i, n, power, size) {
    for (let k = 0; k < shardPool.length; k++) {
      const sh = shardPool[k];
      if (sh.live) continue;
      _col.set(colorInt);
      sh.live = true;
      sh.kind = kind;
      sh.t = 0;
      sh.life = kind === 'burst' ? BURST_LIFE : SCRAP_LIFE;
      sh.i = i; sh.n = n; sh.power = power;
      sh.ox = x; sh.oy = y; sh.oz = z;
      sh.r = _col.r; sh.g = _col.g; sh.b = _col.b;
      sh.size = size;
      return sh;
    }
    return null;
  }

  /** The impact: a fan of paper chips off the point of contact. */
  function paperBurst(x, y, z, power, colorInt) {
    const n = reducedMotion ? 6 : Math.round(10 + power * 10);
    for (let i = 0; i < n; i++) {
      spawnShard('burst', x, y, z, i % 3 === 0 ? PAPER.cream : colorInt, i, n, power, 0.16 + (i % 4) * 0.035);
    }
  }

  /** Victory: the creature comes apart into drifting sheets. */
  function paperDissolve(x, y, z, colorInt, height) {
    const n = reducedMotion ? 10 : SCRAPS_PER_ENEMY;
    for (let i = 0; i < n; i++) {
      spawnShard('scrap', x, y + height * 0.35, z,
        i % 4 === 0 ? PAPER.cream : colorInt, i, n, 1, 0.2 + (i % 5) * 0.04);
    }
  }

  function spawnNumber(text, x, y, z, colorInt, size) {
    let slot = null;
    for (let i = 0; i < numberPool.length; i++) {
      if (!numberPool[i].live) { slot = numberPool[i]; break; }
    }
    if (!slot) slot = numberPool[0];         // recycle the oldest rather than drop the beat
    _col.set(colorInt);
    slot.live = true;
    slot.t = 0;
    slot.text = String(text);
    slot.layout = numberGlyphLayout(slot.text);
    slot.x = x; slot.y = y; slot.z = z;
    slot.size = size;
    slot.r = _col.r; slot.g = _col.g; slot.b = _col.b;
    return slot;
  }

  // ── Figures ─────────────────────────────────────────────────────────

  function acquireHeroRig(hero) {
    const key = hero?.id || hero?.class || 'knight';
    let rig = heroRigs.get(key);
    if (!rig) {
      rig = createHeroRig(hero, { castShadow, rim: true, contactShadow: true });
      heroRigs.set(key, rig);
    }
    return rig;
  }

  function acquireEnemyGeo(enemy) {
    const spec = enemyFigureSpec(enemy);
    let geo = enemyGeos.get(spec.id);
    if (!geo) {
      geo = buildSpeciesGeometry(spec);
      enemyGeos.set(spec.id, geo);
    }
    return { geo, spec };
  }

  // ── Turn flow ───────────────────────────────────────────────────────

  function goPhase(p) { phase = p; pt = 0; }

  function openTurn() {
    const turn = nextTurn(state);
    pushHud();
    if (turn.who === 'victory') return startVictory();
    if (turn.who === 'defeat') return startDefeat();
    if (turn.who === 'enemy') return startEnemyTurn();
    return startHeroTurn(turn.heroIndex);
  }

  function startHeroTurn(heroIndex) {
    activeHero = heroIndex;
    const hero = state.party[heroIndex];
    attackClass = hero?.class || 'knight';
    coach = createCoachQuestionState();
    state.guardActive[heroIndex] = false;
    setShot('wide', 0.5);
    goPhase(PHASE.COMMAND);

    const cmds = commandsForHero(hero, state.grade);
    let picked = false;
    const pick = (cmd) => {
      if (picked || phase !== PHASE.COMMAND) return;
      picked = true;
      chooseCommand(cmd);
    };
    try { ui.showCommands?.(cmds, pick); } catch { /* overlay optional */ }
    // A host with no command UI still plays: FIGHT is the default and the
    // COMMAND phase falls through on its own after a beat.
    if (!ui.showCommands) pick(cmds[0] || COMMANDS.FIGHT);
  }

  function chooseCommand(cmd) {
    command = cmd;
    try { ui.hideCommands?.(); } catch { /* overlay optional */ }
    if (cmd === COMMANDS.GUARD) {
      state.guardActive[activeHero] = true;
      toast(`${state.party[activeHero]?.name || 'Hero'} guards!`, '#48a848');
      play('battle/guard');
      // GUARD skips the math and ends the hero's turn — the sequence puts
      // the creatures next all by itself.
      openTurn();
      return;
    }
    askQuestion();
  }

  function askQuestion() {
    question = questionForTurn(state, command);
    answerLocked = false;
    goPhase(PHASE.QUESTION);
    setShot('hero', 0.6);
    try {
      ui.showQuestion?.({
        question,
        stars: question.stars,
        hero: state.party[activeHero],
        command,
        answer: submitAnswer,
        hint: requestHint,
      });
    } catch { /* overlay optional */ }
    pushHud();
  }

  /**
   * The 2D overlay calls this with the index of the choice the child
   * tapped. Everything downstream — bookkeeping, momentum, damage — is
   * battleRules; this function only decides what the camera does about it.
   */
  function submitAnswer(index) {
    if (answerLocked || phase !== PHASE.QUESTION || !question) return false;
    answerLocked = true;
    const correct = index === question.correctIndex;

    recordAnswerStats(save, question, correct);
    applyAnswerOutcome(state, { correct, heroIndex: activeHero, hintTier: coach?.tier || 0 });

    try { ui.markAnswer?.({ index, correct, correctIndex: question.correctIndex }); } catch { /* optional */ }
    try { ui.hideQuestion?.(); } catch { /* optional */ }
    play(correct ? 'battle/correct' : 'battle/wrong');

    const hero = state.party[activeHero];
    const cls = hero?.class || 'knight';
    attackClass = cls;

    if (correct) {
      // Bunny MAGIC is a heal, not a swing.
      if (cls === 'bunny' && command === COMMANDS.MAGIC) {
        const healed = resolveHeroHeal(state, { heroIndex: activeHero, question });
        if (healed) {
          toast(`${healed.hero.name} healed ${healed.amount} HP!`, '#60ff60');
          const slot = heroEntries.find((e) => e.hero === healed.hero);
          if (slot) spawnNumber(healed.amount, slot.x, stageY + 1.9, slot.z, PAPER.forestL, 0.34);
        }
        pendingResult = null;
        attackPower = 1;
        attackHits = 1;
        beginHeroMove();
        return true;
      }
      pendingResult = resolveHeroAttack(state, {
        heroIndex: activeHero,
        question,
        command,
        hintTier: coach?.tier || 0,
      });
      attackPower = pendingResult.reduced ? 0.7 : 1;
      attackHits = pendingResult.hits;
      if (pendingResult.allyHeal) {
        toast(`${pendingResult.allyHeal.hero.name} healed ${pendingResult.allyHeal.amount} HP!`, '#60ff60');
      }
    } else {
      // A wrong answer still SWINGS — it just glances off. Nothing about
      // this beat is a punishment screen.
      pendingResult = null;
      attackPower = 0.25;
      attackHits = 1;
      toast('Glancing blow!', '#c8a86a');
    }

    beginHeroMove();
    return true;
  }

  function requestHint() {
    if (!coach || !question || phase !== PHASE.QUESTION) return null;
    const hint = takeHint(coach, question);
    if (hint) {
      try { ui.showHint?.(hint); } catch { /* optional */ }
      play('ui/tap');
    }
    return hint;
  }

  function beginHeroMove() {
    goPhase(PHASE.HERO_ATTACK);
    setShot(attackPower > 0.5 ? 'hero' : 'wide', 0.35);
    impactIdx = 0;
    attackImpacts = impactTimes(attackClass, attackHits);
    pushHud();
  }

  function landHeroImpact() {
    const enemy = enemyFigures[state.target];
    if (!enemy) return;
    const px = enemy.x, pz = enemy.z, py = stageY + enemy.height * 0.55;

    if (pendingResult && pendingResult.damage > 0) {
      const perHit = Math.max(1, Math.round(pendingResult.damage / Math.max(1, attackHits)));
      const shown = impactIdx === attackHits - 1
        ? pendingResult.damage - perHit * (attackHits - 1)
        : perHit;
      spawnNumber(shown, px, py + 0.7, pz, PAPER.gold, 0.42 + Math.min(0.3, shown / 90));
      paperBurst(px, py, pz, attackPower, enemy.color);
      shake(reducedMotion ? 0 : 0.09 + 0.08 * attackPower);
      play('battle/hit-enemy');
      enemy.hitT = 0;
    } else {
      paperBurst(px, py, pz, 0.3, PAPER.creamD);
      shake(0.03);
      enemy.hitT = 0;
    }
    impactIdx++;
    pushHud();
  }

  /**
   * THE BOSS PATH. A boss is not a big slime: it crosses two visible HP
   * thresholds and TRANSFORMS at each — bigger silhouette, a line of its own,
   * a burst of paper and the music one notch up.
   *
   * The thresholds, the acts and the lines all come from systems/bossPhases.js,
   * which is the same pure table the 2D BattleScene reads. Nothing about "when
   * does he get serious" is decided in this file.
   *
   * @returns {boolean} true if a transformation just fired
   */
  function checkBossPhase() {
    if (!state?.isBoss) return false;
    const rec = state.enemies[0];
    const fig = enemyFigures[0];
    if (!rec || !fig || fig.dying || rec.hp <= 0) return false;
    const want = phaseForHp(rec.hp, rec.maxHp);
    if (want <= bossPhase) return false;

    bossPhase = Math.min(MAX_PHASE, want);
    const beat = getPhaseBeat(rec.id, bossPhase);
    // The swell is the read: the same creature, MORE of it.
    fig.phaseScale = phaseScale(bossPhase);
    paperBurst(fig.x, stageY + fig.height * 0.6, fig.z, 1, beat.aura ?? fig.color);
    shake(reducedMotion ? 0 : 0.18);
    setShot('enemy', 0.45);
    toast(beat.line, '#e8a030');
    toast(beat.tell, '#f0c040');
    play('battle/boss-phase');
    try { audio?.setMusicIntensity?.(bossPhase); } catch { /* audio is a nicety */ }
    try { ui.onBossPhase?.({ phase: bossPhase, beat, enemy: rec }); } catch { /* overlay optional */ }
    pushHud();
    return true;
  }

  function finishHeroMove() {
    // Did the blow finish the creature? Dissolve it now, before the beat.
    for (let i = 0; i < enemyFigures.length; i++) {
      const fig = enemyFigures[i];
      const rec = state.enemies[i];
      if (rec && rec.hp <= 0 && !fig.dying) {
        fig.dying = true;
        fig.dieT = 0;
        paperDissolve(fig.x, stageY, fig.z, fig.color, fig.height);
        play('battle/enemy-defeat');
      }
    }
    if (allEnemiesDead(state)) return startVictory();
    // A boss that just crossed a threshold transforms BEFORE the next turn
    // opens, so the child sees the change and then faces it.
    checkBossPhase();
    // Hand back to the TURN SEQUENCE rather than jumping straight into an
    // enemy round. buildTurnSequence already alternates hero/enemy, so
    // firing a round here as well gave every creature two swings per hero
    // turn and doubled the length of every fight.
    openTurn();
  }

  function beginEnemyRound() {
    enemyQueue = [];
    for (let i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i] && state.enemies[i].hp > 0) enemyQueue.push(i);
    }
    enemyIdx = 0;
    if (enemyQueue.length === 0) return startVictory();
    startEnemyStrike();
  }

  function startEnemyTurn() {
    goPhase(PHASE.ENEMY_TURN);
    beginEnemyRound();
  }

  function startEnemyStrike() {
    const idx = enemyQueue[enemyIdx];
    const fig = enemyFigures[idx];
    if (!fig) { advanceEnemyQueue(); return; }
    fig.attacking = true;
    fig.attackT = 0;
    enemyStruck = false;
    enemyTarget = chooseEnemyTarget(state, rng);
    setShot('enemy', 0.4);
    const name = state.enemies[idx]?.name || 'The creature';
    toast(`${name} winds up!`, '#e8a030');
  }

  function landEnemyImpact() {
    if (!enemyTarget) return;
    const idx = enemyQueue[enemyIdx];
    const attacker = state.enemies[idx];
    const res = resolveEnemyAttack(state, { attacker, target: enemyTarget, rng });
    const entry = heroEntries.find((e) => e.hero === res.target);
    const hx = entry ? entry.x : frame.cx;
    const hz = entry ? entry.z : frame.cz;

    if (res.dodged) {
      toast(`${res.target.name} DODGES!`, '#e86898');
      if (entry) entry.dodgeT = 0;
      play('battle/hit-hero');
    } else {
      if (res.guarded) toast(`${res.target.name} GUARDS! Half damage!`, '#48a848');
      else if (res.blocked) toast(`${res.target.name} BLOCKS! Half damage!`, '#5a7ab8');
      spawnNumber(res.damage, hx, stageY + 2.1, hz, PAPER.coralD, 0.38);
      paperBurst(hx, stageY + 1.2, hz, 0.8, PAPER.coral);
      shake(reducedMotion ? 0 : 0.12);
      play('battle/hit-hero');
      if (entry?.rig?.setState) entry.rig.setState('stagger');
    }
    pushHud();
  }

  function advanceEnemyQueue() {
    const idx = enemyQueue[enemyIdx];
    const fig = enemyFigures[idx];
    if (fig) fig.attacking = false;
    enemyIdx++;
    if (enemyIdx < enemyQueue.length) {
      startEnemyStrike();
      return;
    }
    clearGuards(state);
    if (state.party.every((h) => !h || h.hp <= 0)) return startDefeat();
    openTurn();
  }

  // ── Endings ─────────────────────────────────────────────────────────

  function startVictory() {
    if (phase === PHASE.VICTORY || phase === PHASE.SWEEP_OUT) return;
    outcome = 'victory';
    goPhase(PHASE.VICTORY);
    setShot('wide', 0.7);
    try { ui.hideQuestion?.(); ui.hideCommands?.(); } catch { /* optional */ }

    for (const fig of enemyFigures) {
      if (!fig.dying) {
        fig.dying = true;
        fig.dieT = 0;
        paperDissolve(fig.x, stageY, fig.z, fig.color, fig.height);
      }
    }
    for (const e of heroEntries) {
      if (e.hero.hp > 0) e.rig?.setState?.('victory');
    }

    rewards = battleRewards(state.floor, state.correct);
    play('battle/victory');

    // Rewards fly from where the creature stood to wherever the HUD keeps
    // its purse — the overlay owns the arc, we only supply the origin.
    const from = worldToScreen(frame.cx + frame.ax * STAGE.halfGap, stageY + 1.2, frame.cz + frame.az * STAGE.halfGap);
    try { ui.flyReward?.({ gold: rewards.gold, xp: rewards.xp, from: { x: from.x, y: from.y } }); } catch { /* optional */ }
  }

  function startDefeat() {
    if (phase === PHASE.DEFEAT || phase === PHASE.SWEEP_OUT) return;
    outcome = 'defeat';
    goPhase(PHASE.DEFEAT);
    setShot('wide', 0.6);
    try { ui.hideQuestion?.(); ui.hideCommands?.(); } catch { /* optional */ }
    rewards = null;
    play('battle/defeat');
  }

  function worldToScreen(x, y, z) {
    if (!camera) { _screen.x = 0; _screen.y = 0; return _screen; }
    const vp = viewport() || { width: 1440, height: 1080 };
    _v3.set(x, y, z).project(camera);
    return ndcToScreen(_v3.x, _v3.y, vp.width, vp.height, _screen);
  }

  // ── Per-frame ───────────────────────────────────────────────────────

  function updateCamera(dt) {
    if (!camera) return;
    camBlend = Math.min(1, camBlend + dt / camBlendDur);
    lerpPose(camFrom, camGoal, easeInOut(camBlend), camNow);
    shakeT += dt;
    if (shakeT < 0.45 && shakeAmp > 0) {
      shakeOffset(shakeT, shakeAmp, _shake);
      camera.position.set(camNow.px + _shake.x, camNow.py + _shake.y, camNow.pz + _shake.z);
    } else {
      camera.position.set(camNow.px, camNow.py, camNow.pz);
    }
    _v3.set(camNow.lx, camNow.ly, camNow.lz);
    camera.lookAt(_v3);
  }

  function updateHeroes(dt) {
    for (let i = 0; i < heroEntries.length; i++) {
      const e = heroEntries[i];
      let ax = e.homeX, az = e.homeZ, ay = stageY, lean = 0, spin = 0;

      if (phase === PHASE.HERO_ATTACK && i === activeHero) {
        heroAttackPose(attackClass, pt, attackHits, attackPower, _pose);
        ax = e.homeX + frame.ax * _pose.advance;
        az = e.homeZ + frame.az * _pose.advance;
        ay = stageY + _pose.lift;
        lean = _pose.lean;
        spin = _pose.spin;
      } else if (e.hero.hp <= 0) {
        ay = stageY;
      }

      // Velocity is derived, never stored as an authored curve: the rig's
      // own state machine reads it and picks walk / run / idle for free.
      const vx = dt > 0 ? (ax - e.x) / dt : 0;
      const vz = dt > 0 ? (az - e.z) / dt : 0;
      e.x = ax; e.z = az;

      e.rigState.pos.x = ax;
      e.rigState.pos.y = ay;
      e.rigState.pos.z = az;
      e.rigState.vel.x = vx;
      e.rigState.vel.y = 0;
      e.rigState.vel.z = vz;
      e.rigState.yaw = e.yaw + spin;
      e.rigState.grounded = ay <= stageY + 0.02;
      e.rig.update(dt, e.rigState);

      // Lean is a whole-body pitch the rig does not own — the attack's
      // anticipation and follow-through live here.
      e.rig.group.rotation.x = lean;
      if (e.dodgeT != null && e.dodgeT < 0.35) {
        e.dodgeT += dt;
        e.rig.group.position.x += frame.sx * Math.sin(e.dodgeT * 9) * 0.35;
        e.rig.group.position.z += frame.sz * Math.sin(e.dodgeT * 9) * 0.35;
      }
      // A downed hero STAYS on stage, slumped. Deleting them mid-fight is
      // how a five-year-old concludes their favourite hero is gone forever.
      e.rig.group.visible = true;
    }
  }

  function updateEnemies(dt) {
    for (let i = 0; i < enemyFigures.length; i++) {
      const fig = enemyFigures[i];
      const mesh = fig.mesh;
      if (!mesh) continue;

      if (fig.dying) {
        fig.dieT += dt;
        const k = Math.max(0, 1 - fig.dieT / 0.45);
        mesh.scale.set(k, k, k);
        mesh.visible = k > 0.02;
        continue;
      }

      let advance = 0, lift = 0, squash = 1;
      if (fig.attacking) {
        fig.attackT += dt;
        enemyAttackPose(fig.attackT, _epose);
        advance = -_epose.advance;      // enemies advance toward the heroes
        lift = _epose.lift;
        squash = _epose.squash;
      } else {
        // Idle: a slow paper breath so nothing on screen is ever static.
        lift = Math.sin(clock * 1.7 + i * 1.3) * 0.055 + 0.055;
        squash = 1 + Math.sin(clock * 1.7 + i * 1.3) * 0.03;
      }

      // Getting hit knocks the creature back a hand's width.
      if (fig.hitT != null && fig.hitT < 0.3) {
        fig.hitT += dt;
        advance -= Math.sin((fig.hitT / 0.3) * Math.PI) * 0.34;
        squash *= 1 + Math.sin((fig.hitT / 0.3) * Math.PI) * 0.12;
      }

      const x = fig.homeX + frame.ax * advance;
      const z = fig.homeZ + frame.az * advance;
      fig.x = x; fig.z = z;
      mesh.position.set(x, stageY + lift, z);
      mesh.rotation.y = fig.yaw;
      // A boss's phase swell multiplies the squash rather than replacing it,
      // so it keeps breathing while it grows.
      const ps = fig.phaseScale || 1;
      const sxz = ps / Math.sqrt(Math.max(0.2, squash));
      mesh.scale.set(sxz, squash * ps, sxz);
      mesh.visible = true;
    }
  }

  function updateShards(dt) {
    let n = 0;
    for (let k = 0; k < shardPool.length; k++) {
      const sh = shardPool[k];
      if (!sh.live) continue;
      sh.t += dt;
      let px, py, pz, spin, tumble, scale;
      if (sh.kind === 'burst') {
        burstPose(sh.i, sh.n, sh.t, sh.life, sh.power, _scrap);
        px = sh.ox + _scrap.x; py = sh.oy + _scrap.y; pz = sh.oz + _scrap.z;
        spin = _scrap.spin; tumble = _scrap.spin * 0.7; scale = _scrap.scale;
      } else {
        scrapPose(sh.i, sh.n, sh.t, sh.life, _scrap);
        px = sh.ox + _scrap.x; py = sh.oy + _scrap.y; pz = sh.oz + _scrap.z;
        spin = _scrap.spin; tumble = _scrap.tumble; scale = _scrap.scale;
      }
      if (!_scrap.alive || scale <= 0.001) { sh.live = false; continue; }
      if (n >= MAX_SHARDS) { sh.live = false; continue; }

      _v3.set(px, py, pz);
      _eul.set(tumble, spin, spin * 0.5);
      _q.setFromEuler(_eul);
      _s3.set(sh.size * scale, sh.size * scale, sh.size * scale);
      _m4.compose(_v3, _q, _s3);
      shards.setMatrixAt(n, _m4);
      shards.instanceColor.setXYZ(n, sh.r, sh.g, sh.b);
      n++;
    }
    shards.count = n;
    shards.visible = n > 0;
    if (n > 0) {
      shards.instanceMatrix.needsUpdate = true;
      shards.instanceColor.needsUpdate = true;
    }
  }

  function updateNumbers(dt) {
    let n = 0;
    // Damage numbers always face the camera, but only in yaw: a number
    // that pitches to meet the camera stops reading as a cut-paper sign.
    const billboard = camera
      ? Math.atan2(camera.position.x - frame.cx, camera.position.z - frame.cz)
      : 0;

    for (let k = 0; k < numberPool.length; k++) {
      const num = numberPool[k];
      if (!num.live) continue;
      num.t += dt;
      damageNumberPose(num.t, DAMAGE_NUMBER_LIFE, _dnum);
      if (!_dnum.alive) { num.live = false; continue; }

      const size = num.size * _dnum.scale;
      const cy = num.y + _dnum.rise;
      for (let g = 0; g < num.layout.length; g++) {
        if (n >= MAX_GLYPH_SEGMENTS) break;
        const item = num.layout[g];
        const box = SEG_BOXES[item.seg];
        const lx = (item.x + box.x) * size;
        const ly = box.y * size;
        const cos = Math.cos(billboard), sin = Math.sin(billboard);
        _v3.set(num.x + cos * lx, cy + ly, num.z - sin * lx);
        _eul.set(0, billboard, _dnum.tilt);
        _q.setFromEuler(_eul);
        _s3.set(box.w * size, box.h * size, Math.min(box.w, box.h) * size * 0.9);
        _m4.compose(_v3, _q, _s3);
        glyphs.setMatrixAt(n, _m4);
        glyphs.instanceColor.setXYZ(n, num.r, num.g, num.b);
        n++;
      }
    }
    glyphs.count = n;
    glyphs.visible = n > 0;
    if (n > 0) {
      glyphs.instanceMatrix.needsUpdate = true;
      glyphs.instanceColor.needsUpdate = true;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Stage a fight where the player is standing.
   *
   * @param {object} encounter
   * @param {string} [encounter.enemyId]   single enemy
   * @param {string[]} [encounter.enemyIds] multiple enemies (max 3)
   * @param {object[]} [encounter.enemies] pre-spawned enemy records
   * @param {boolean} [encounter.isBoss]
   * @param {number} [encounter.floor]
   * @param {number} [encounter.grade]
   * @param {object[]} [encounter.party]   overrides the constructor party
   * @param {{x:number,y:number,z:number}} [encounter.worldPos] where the
   *        creature was standing; the battle line is drawn through it
   * @returns {boolean} false if a fight is already running
   */
  function begin(encounter = {}) {
    if (phase !== PHASE.IDLE) return false;

    floor = encounter.floor ?? floor;
    grade = encounter.grade ?? grade;
    if (encounter.party) party = encounter.party;

    // ── Rules state ──
    const enemyRecords = encounter.enemies
      ? encounter.enemies.map((e) => ({ ...e }))
      : (encounter.enemyIds || [encounter.enemyId])
        .filter(Boolean)
        .slice(0, 3)
        .map((id) => spawnEnemy(id, { grade, isBoss: !!encounter.isBoss }))
        .filter(Boolean);
    if (enemyRecords.length === 0) return false;

    state = createBattleState({
      party, enemies: enemyRecords, grade, floor, isBoss: !!encounter.isBoss,
    });
    outcome = null;
    rewards = null;
    clock = 0;
    activeHero = -1;
    pendingResult = null;
    bossPhase = 1;

    // ── Staging ──
    const p = getPlayer();
    const foe = encounter.worldPos || {
      x: p.pos.x + Math.sin(p.yaw) * 4,
      z: p.pos.z + Math.cos(p.yaw) * 4,
    };
    stageFrame(p.pos, foe, frame);
    stageY = groundAt(frame.cx, frame.cz);
    disc.position.set(frame.cx, stageY + 0.04, frame.cz);

    // ── Party figures ──
    heroEntries.length = 0;
    const heroSlots = formationSlots(party.length, 'hero');
    const heroYaw = facingYaw(frame, 'hero');
    for (let i = 0; i < party.length; i++) {
      const hero = party[i];
      const rig = acquireHeroRig(hero);
      placeOnStage(frame, heroSlots[i], 'hero', _slotPos);
      if (!rig.group.parent) group.add(rig.group);
      // YXZ so the attack's forward LEAN pitches about the hero's own axis
      // after the yaw is applied. In the default XYZ order a leaning hero
      // facing sideways would tip over sideways.
      rig.group.rotation.order = 'YXZ';
      rig.reset();
      heroEntries.push({
        hero, rig,
        homeX: _slotPos.x, homeZ: _slotPos.z,
        x: _slotPos.x, z: _slotPos.z,
        yaw: heroYaw,
        dodgeT: null,
        rigState: {
          pos: { x: _slotPos.x, y: stageY, z: _slotPos.z },
          vel: { x: 0, y: 0, z: 0 },
          yaw: heroYaw, grounded: true,
        },
      });
    }

    // ── Enemy figures ──
    for (const fig of enemyFigures) {
      if (fig.mesh) { group.remove(fig.mesh); }
    }
    enemyFigures.length = 0;
    const foeSlots = formationSlots(enemyRecords.length, 'enemy');
    const foeYaw = facingYaw(frame, 'enemy');
    for (let i = 0; i < enemyRecords.length; i++) {
      const rec = enemyRecords[i];
      const { geo, spec } = acquireEnemyGeo(rec);
      const mesh = new THREE.Mesh(geo, bodyMat);
      mesh.name = `battle-enemy-${rec.id}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
      placeOnStage(frame, foeSlots[i], 'enemy', _slotPos);
      enemyFigures.push({
        rec, mesh, height: spec.height,
        homeX: _slotPos.x, homeZ: _slotPos.z,
        x: _slotPos.x, z: _slotPos.z,
        yaw: foeYaw,
        color: paletteForFloor(rec.floor || floor).cols[1],
        attacking: false, attackT: 0, hitT: null,
        dying: false, dieT: 0,
        phaseScale: 1,
      });
    }

    // ── Hand the world over ──
    setInputLocked(true);
    setEncountersEnabled(false);
    if (playerRig?.group) playerRig.group.visible = false;
    // The hero rigs and creature meshes staged above were BORN just now, long
    // after index.js swept the scene at boot, so they have to opt into the
    // world's one atmosphere themselves or the fight sits in front of the sky
    // instead of inside it. Idempotent, and cheap: a dozen materials.
    applyAerialFogToTree(group);
    group.visible = true;

    // The sweep starts from wherever the follow boom left the camera, so
    // there is no cut at all — the shot simply moves.
    if (camera) {
      camNow.px = camera.position.x; camNow.py = camera.position.y; camNow.pz = camera.position.z;
      _v3.set(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(8).add(camera.position);
      camNow.lx = _v3.x; camNow.ly = _v3.y; camNow.lz = _v3.z;
    }
    setShot('wide', PHASE_TIME.sweepIn);
    goPhase(PHASE.SWEEP_IN);

    // `grade` rides along because the overlay sizes its digits by it — K-2 read
    // numerals at a glance only at the larger face.
    try {
      ui.onBattleBegin?.({ party, enemies: enemyRecords, floor, grade, isBoss: !!encounter.isBoss });
    } catch { /* optional */ }
    pushHud();
    play(encounter.isBoss ? 'battle/boss-start' : 'battle/start');
    try { hooks.onBegin?.(encounter); } catch { /* host hook */ }
    return true;
  }

  /**
   * One frame. Safe to call every frame regardless of phase; returns
   * immediately when no fight is running.
   */
  function update(dt) {
    if (phase === PHASE.IDLE) return;
    const d = Math.min(Math.max(dt || 0, 0), 0.05);
    clock += d;
    pt += d;

    updateCamera(d);
    updateHeroes(d);
    updateEnemies(d);
    updateShards(d);
    updateNumbers(d);

    switch (phase) {
      case PHASE.SWEEP_IN: {
        if (pt >= PHASE_TIME.sweepIn) {
          goPhase(PHASE.INTRO);
          const lead = state.enemies[0];
          if (lead) toast(`${lead.name}${state.enemies.length > 1 ? ' and friends' : ''} block the way!`, '#e8a030');
        }
        break;
      }

      case PHASE.INTRO:
        if (pt >= PHASE_TIME.intro) openTurn();
        break;

      case PHASE.COMMAND:
      case PHASE.QUESTION:
        // Waiting on the child. The world keeps breathing behind them.
        break;

      case PHASE.HERO_ATTACK: {
        while (impactIdx < attackImpacts.length && pt >= attackImpacts[impactIdx]) landHeroImpact();
        heroAttackPose(attackClass, pt, attackHits, attackPower, _pose);
        if (_pose.done && pt >= _pose.total + PHASE_TIME.beat) finishHeroMove();
        break;
      }

      case PHASE.ENEMY_TURN: {
        const idx = enemyQueue[enemyIdx];
        const fig = enemyFigures[idx];
        if (!fig || !fig.attacking) { advanceEnemyQueue(); break; }
        enemyAttackPose(fig.attackT, _epose);
        if (!enemyStruck && fig.attackT >= _epose.impactAt) {
          enemyStruck = true;
          landEnemyImpact();
        }
        if (_epose.done) advanceEnemyQueue();
        break;
      }

      case PHASE.VICTORY:
        if (pt >= PHASE_TIME.victory) {
          setShot('exit', PHASE_TIME.sweepOut);
          goPhase(PHASE.SWEEP_OUT);
        }
        break;

      case PHASE.DEFEAT:
        if (pt >= PHASE_TIME.defeat) {
          setShot('exit', PHASE_TIME.sweepOut);
          goPhase(PHASE.SWEEP_OUT);
        }
        break;

      case PHASE.SWEEP_OUT:
        if (pt >= PHASE_TIME.sweepOut) teardown();
        break;

      default:
        break;
    }
  }

  /**
   * End the fight early (a retreat, a scene change, a context loss).
   * Runs the same teardown the natural ending does.
   */
  function end(reason = 'fled') {
    if (phase === PHASE.IDLE) return null;
    if (!outcome) outcome = reason;
    return teardown();
  }

  function teardown() {
    const result = {
      outcome: outcome || 'fled',
      rewards,
      floor: state?.floor ?? floor,
      correct: state?.correct ?? 0,
      wrong: state?.wrong ?? 0,
      streak: state?.streak ?? 0,
      bossPhase: state?.isBoss ? bossPhase : 0,
      damageTaken: state?.damageTaken ?? false,
      party: state?.party ?? party,
      enemies: state?.enemies ?? [],
      isBoss: state?.isBoss ?? false,
    };

    for (const fig of enemyFigures) {
      if (fig.mesh) group.remove(fig.mesh);
    }
    enemyFigures.length = 0;
    for (const e of heroEntries) {
      e.rig.setState?.(null);
      e.rig.reset?.();
      if (e.rig.group.parent === group) group.remove(e.rig.group);
    }
    heroEntries.length = 0;
    for (const sh of shardPool) sh.live = false;
    for (const num of numberPool) num.live = false;
    shards.count = 0;
    glyphs.count = 0;
    group.visible = false;

    if (playerRig?.group) playerRig.group.visible = true;
    setInputLocked(false);
    setEncountersEnabled(true);

    phase = PHASE.IDLE;
    pt = 0;
    question = null;
    coach = null;
    state = null;

    try { ui.hideQuestion?.(); ui.hideCommands?.(); ui.onBattleEnd?.(result); } catch { /* optional */ }
    try {
      if (result.outcome === 'victory') hooks.onVictory?.(result);
      else if (result.outcome === 'defeat') hooks.onDefeat?.(result);
      hooks.onEnd?.(result);
    } catch { /* host hook */ }

    return result;
  }

  function dispose() {
    if (phase !== PHASE.IDLE) teardown();
    for (const rig of heroRigs.values()) {
      if (rig.group.parent) rig.group.parent.remove(rig.group);
      rig.dispose();
    }
    heroRigs.clear();
    for (const geo of enemyGeos.values()) geo.dispose();
    enemyGeos.clear();
    group.clear();
    if (scene) scene.remove(group);
    for (const d of disposables) d.dispose?.();
    shards.dispose();
    glyphs.dispose();
  }

  return {
    /** The battle's scene graph. Already parented to `scene` if one was given. */
    group,

    begin,
    update,
    end,
    isActive() { return phase !== PHASE.IDLE; },
    dispose,

    // ── Extras the integrator will want ───────────────────────────────
    /** Current phase (see PHASE). */
    getPhase() { return phase; },
    /** Boss act 1..3 (bossPhases.js), or 1 when this is not a boss fight. */
    getBossPhase() { return bossPhase; },
    /** Read-only snapshot for the HUD; null when idle. */
    getState() { return hudSnapshot(); },
    /** The 2D overlay routes the child's tap here. Returns false if ignored. */
    answer(index) { return submitAnswer(index); },
    /** The hint button. Returns { tier, text } or null. */
    hint() { return requestHint(); },
    /** The command menu routes here (FIGHT / MAGIC / GUARD). */
    chooseCommand(cmd) { if (phase === PHASE.COMMAND) chooseCommand(cmd); },
    /**
     * The camera pose battle3d wants this frame. Hosts that prefer to own
     * the camera can read this instead of letting update() write it.
     */
    cameraPose() { return camNow; },
    /** Live staging frame — where the battle line is. */
    stage() { return frame; },
  };
}

// ------------------------------------------------------------------
// GEOMETRY HELPERS
// ------------------------------------------------------------------

/**
 * One paper chip: a slightly irregular pentagon with real thickness, so a
 * burst reads as torn paper rather than as sparks. Built once, instanced
 * everywhere.
 */
function makeShardGeometry() {
  const pts = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.3;
    const r = 0.5 * (0.78 + ((i * 3) % 4) * 0.09);
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return extrudePolygon(pts, 0.09);
}

/** One damage-number segment: a unit bar with paper thickness. */
function makeSegmentGeometry() {
  // A chamfered bar — the little cut corners are what make a seven-segment
  // figure read as CUT rather than as a calculator display.
  const c = 0.34;
  const pts = [
    -0.5 + c * 0.5, -0.5,
    0.5 - c * 0.5, -0.5,
    0.5, -0.5 + c * 0.5,
    0.5, 0.5 - c * 0.5,
    0.5 - c * 0.5, 0.5,
    -0.5 + c * 0.5, 0.5,
    -0.5, 0.5 - c * 0.5,
    -0.5, -0.5 + c * 0.5,
  ];
  return extrudePolygon(pts, 1.0);
}

/**
 * Extrude a closed 2D polygon (flat array of x,y) along z. Front cap,
 * back cap and a rim whose normals point outward — the same construction
 * creatures.js uses, and the reason a paper edge catches the lit step of
 * the toon ramp instead of going dark.
 */
function extrudePolygon(flat, depth) {
  const n = flat.length / 2;
  const half = depth * 0.5;
  const pos = [];
  const nrm = [];

  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += flat[i * 2]; cy += flat[i * 2 + 1]; }
  cx /= n; cy /= n;

  const push = (ax, ay, az, bx, by, bz, dx, dy, dz, nx, ny, nz) => {
    pos.push(ax, ay, az, bx, by, bz, dx, dy, dz);
    nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };

  for (let i = 0; i < n; i++) {
    const ax = flat[i * 2], ay = flat[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = flat[j * 2], by = flat[j * 2 + 1];
    push(cx, cy, half, ax, ay, half, bx, by, half, 0, 0, 1);
    push(cx, cy, -half, bx, by, -half, ax, ay, -half, 0, 0, -1);
    let ex = by - ay, ey = ax - bx;
    const el = Math.hypot(ex, ey) || 1;
    ex /= el; ey /= el;
    push(ax, ay, -half, bx, by, -half, bx, by, half, ex, ey, 0);
    push(ax, ay, -half, bx, by, half, ax, ay, half, ex, ey, 0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

export { extrudePolygon, makeShardGeometry, makeSegmentGeometry };
