/**
 * Skinned hero animation — the ORIGINAL hand-crafted hero art, truly
 * animated, never dismembered.
 *
 * HOW IT WORKS
 * Every hero in heroArt.js is drawn from layered vector primitives,
 * each tagged with a seed number that identifies its body region
 * (legs, torso, arms, weapon, head). Instead of cutting the finished
 * drawing into pieces (which always tears at the joints), we redraw
 * the ORIGINAL artwork every frame and deform its geometry on the way
 * to the canvas:
 *
 *   • every vertex of every shape is transformed by a SMOOTHLY
 *     WEIGHTED blend of "bones" (hip, knees, shoulders, elbows,
 *     spine, neck) — vertices near a joint move only partially, so
 *     shapes bend like paper, they never split;
 *   • left/right limbs are told apart per-vertex by x-position with a
 *     soft blend across the center line, so shared shapes flex
 *     smoothly instead of shearing;
 *   • whole-body bob / squash / lean run through the canvas transform
 *     so even raw decorative strokes (hat stars, sparkles) ride along.
 *
 * The result keeps every hero's original charm — same shapes, same
 * layer order, same wobble and paper shadows — and adds true walking,
 * breathing, striking and hopping, plus grounding depth (a contact
 * shadow that reacts to hops and a gentle lean into movement).
 */

import { Rndr } from './legacyRenderer.js';

// ── seed → body-region maps (from the original art conventions) ──
const REGIONS_DEFAULT = {
  legs:   new Set([1, 2, 3, 4, 10, 11, 12, 13, 20, 21]),
  torso:  new Set([30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]),
  arms:   new Set([50, 51, 52, 53, 54, 60, 61, 62, 63, 64, 65]),
  weapon: new Set([80, 81, 82, 83, 84, 85, 86, 87, 88, 89]),
  head:   new Set([55, 56, 57, 58, 59, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
                   90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100]),
};

const REGIONS_BUNNY = {
  legs:  new Set([10, 11, 20, 21]),
  torso: new Set([1, 2, 5, 6, 40]),
  arms:  new Set([30, 31, 32, 33, 34, 71, 72]),
  weapon: new Set([]),
  head:  new Set([50, 51, 53, 55, 56, 59, 61, 62, 63, 64, 65, 66, 67, 70, 73, 76]),
};

// ── joint pivots in art space (origin at chest, +y down) ──
const JOINTS_DEFAULT = {
  hipY: 22, kneeY: 48, groundY: 74,
  shoulderX: 16, shoulderY: -12, elbowX: 30,
  neckY: -10,
  blend: 12,          // vertical falloff distance for joint weights
  sideBlend: 9,       // horizontal falloff for left/right limb blending
};

const JOINTS_BUNNY = {
  hipY: 22, kneeY: 46, groundY: 70,
  shoulderX: 18, shoulderY: 4, elbowX: 34,
  neckY: 0, earY: -28,
  blend: 12,
  sideBlend: 9,
};

// amplitude scaling: cycles were authored for a side-view rig; the
// front-facing originals read best with gentler articulation
const AMP = {
  thigh: 0.55, knee: 0.5, shoulder: 0.4, elbow: 0.35,
  spine: 0.55, head: 0.8, weapon: 0.6,
};

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function rot(p, cx, cy, a) {
  if (!a) return p;
  const s = Math.sin(a), c = Math.cos(a);
  const dx = p[0] - cx, dy = p[1] - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

/**
 * Build the per-vertex transform for a pose. Returns xf(x, y, seed).
 */
function makeSkin(pose, heroClass) {
  const J = heroClass === 'bunny' ? JOINTS_BUNNY : JOINTS_DEFAULT;
  const R = heroClass === 'bunny' ? REGIONS_BUNNY : REGIONS_DEFAULT;
  const p = pose;

  const thighL = (p.thighL || 0) * AMP.thigh, thighR = (p.thighR || 0) * AMP.thigh;
  const kneeL = (p.kneeL || 0) * AMP.knee, kneeR = (p.kneeR || 0) * AMP.knee;
  const shL = (p.shoulderL || 0) * AMP.shoulder, shR = (p.shoulderR || 0) * AMP.shoulder;
  const elL = (p.elbowL || 0) * AMP.elbow, elR = (p.elbowR || 0) * AMP.elbow;
  const spine = (p.spine || 0) * AMP.spine;
  const headA = (p.head || 0) * AMP.head;
  const weaponA = (p.weapon || 0) * AMP.weapon;
  const earFlop = p.earFlop || 0;

  const regionOf = (seed) => {
    if (R.legs.has(seed)) return 'legs';
    if (R.torso.has(seed)) return 'torso';
    if (R.arms.has(seed)) return 'arms';
    if (R.weapon.has(seed)) return 'weapon';
    if (R.head.has(seed)) return 'head';
    return 'other';
  };

  return function xf(x, y, seed) {
    const region = regionOf(seed);
    let pt = [x, y];

    if (region === 'legs') {
      // left/right decided per-vertex with a soft center blend —
      // shared shapes flex instead of tearing
      const side = smooth(-J.sideBlend, J.sideBlend, x); // 0=left, 1=right
      const thigh = thighL + (thighR - thighL) * side;
      const knee = kneeL + (kneeR - kneeL) * side;
      const wHip = smooth(J.hipY, J.hipY + J.blend, y);
      pt = rot(pt, 0, J.hipY, thigh * wHip);
      const wKnee = smooth(J.kneeY, J.kneeY + J.blend, y);
      if (wKnee > 0) {
        const kx = (side - 0.5) * 24; // approximate per-side knee pivot
        pt = rot(pt, kx, J.kneeY, -knee * wKnee);
      }
    } else if (region === 'torso') {
      const wT = smooth(J.hipY, J.hipY - J.blend * 1.6, y);
      pt = rot(pt, 0, J.hipY, spine * wT);
    } else if (region === 'arms' || region === 'weapon') {
      // inherit torso lean, then swing from the shoulder with an
      // elbow follow-through further out along the limb
      pt = rot(pt, 0, J.hipY, spine * 0.8);
      const side = smooth(-J.sideBlend, J.sideBlend, pt[0]);
      const sh = shL + (shR - shL) * side;
      const el = elL + (elR - elL) * side;
      const sx = (side * 2 - 1) * J.shoulderX;
      const wArm = smooth(J.shoulderX * 0.4, J.shoulderX + 8, Math.abs(pt[0]));
      // arm swing reads as raise/lower in the front view; flip the
      // left side so a "forward" swing lifts both hands the same way
      const dir = side * 2 - 1;
      pt = rot(pt, sx, J.shoulderY, dir * sh * Math.max(wArm, region === 'weapon' ? 0.85 : 0));
      const wEl = smooth(J.elbowX, J.elbowX + 12, Math.abs(pt[0]));
      if (wEl > 0) pt = rot(pt, dir * J.elbowX, J.shoulderY + 8, dir * el * wEl);
      if (region === 'weapon') pt = rot(pt, dir * J.elbowX, 8, weaponA);
    } else if (region === 'head') {
      pt = rot(pt, 0, J.hipY, spine * 0.9);
      const wH = smooth(J.neckY + 6, J.neckY - 8, y);
      pt = rot(pt, 0, J.neckY, headA * wH);
      if (earFlop && J.earY !== undefined) {
        // bunny ears trail the hop with a soft flop above the crown
        const wE = smooth(J.earY, J.earY - 18, pt[1]);
        if (wE > 0) pt = rot(pt, 0, J.earY, earFlop * 0.5 * wE);
      }
    }
    return pt;
  };
}

/**
 * Draw a hero from its ORIGINAL art, deformed by the pose.
 *
 * @param {HTMLCanvasElement} cv  target canvas (cleared by caller)
 * @param {object} art            heroArt entry ({ draw, topExt, botExt })
 * @param {string} heroClass      'knight' | 'wizard' | 'bunny'
 * @param {object} pose           pose from poseAnimator
 * @param {object} geom           { cx, cy, sc } canvas placement
 */
export function drawSkinnedHero(cv, art, heroClass, pose, geom) {
  const base = new Rndr(cv);
  const G = base.G;
  const J = heroClass === 'bunny' ? JOINTS_BUNNY : JOINTS_DEFAULT;
  const xf = makeSkin(pose, heroClass);
  const hipYOff = pose.hipY || 0;
  const hipXOff = pose.hipX || 0;
  const squash = pose.squash || 1;

  // grounding contact shadow — lifts/shrinks with hops, sells weight
  const lift = Math.max(0, -hipYOff);
  G.save();
  G.translate(geom.cx, geom.cy);
  G.scale(geom.sc, geom.sc);
  G.globalAlpha = Math.max(0.08, 0.22 - lift * 0.008);
  G.fillStyle = '#1f3d3f';
  G.beginPath();
  G.ellipse(hipXOff * 0.6, J.groundY + 3, 26 + lift * 0.3, 7, 0, 0, Math.PI * 2);
  G.fill();
  G.restore();

  // whole-body bob / squash via the canvas transform so even raw-G
  // decorations (hat stars, sparkles) ride along with the body
  G.save();
  G.translate(geom.cx + hipXOff * geom.sc, geom.cy + hipYOff * geom.sc);
  if (squash !== 1) {
    G.translate(0, J.groundY * geom.sc);
    G.scale(1 / Math.sqrt(squash), squash);
    G.translate(0, -J.groundY * geom.sc);
  }

  // renderer proxy: identical drawing, skinned geometry
  const R = {
    G,
    L: (pts, col, seed, o) => base.L(pts.map(pt => xf(pt[0], pt[1], seed)), col, seed, o),
    Ld: (cx, cy, r, col, seed, o) => {
      // circles keep their radius; only the center rides the skeleton
      const c = xf(cx, cy, seed);
      base.Ld(c[0], c[1], r, col, seed, o);
    },
    glow: (cx, cy, rx, ry, col, alpha, blur) => {
      const c = xf(cx, cy, 0);
      base.glow(c[0], c[1], rx, ry, col, alpha, blur);
    },
    ellipse: (cx, cy, rx, ry, col, seed, o) => {
      const c = xf(cx, cy, seed);
      base.ellipse(c[0], c[1], rx, ry, col, seed, o);
    },
    clear: () => {},
  };

  // the art's own translate(cx,cy)/scale(sc) must NOT double-apply —
  // we already positioned the body transform, so hand it a neutral
  // origin and let the art's own G.save/translate work from there
  art.draw(R, 0, 0, geom.sc);

  G.restore();
}

export { REGIONS_DEFAULT, REGIONS_BUNNY, JOINTS_DEFAULT, JOINTS_BUNNY };
