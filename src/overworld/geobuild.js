/**
 * Papercut geometry kit — the primitive sink shared by props.js and
 * vegetation.js.
 *
 * WHY it is its own module: both files build their silhouettes the same way —
 * stamp a handful of cheap primitives into one interleaved buffer with the
 * layer shade baked into the vertex colour, then hand the result to a single
 * InstancedMesh. That is the whole papercut model (one sheet of coloured paper
 * cut into lighter and darker plies) and it must be identical in both, or a
 * tree and a market stall stop looking like they were cut from the same stock.
 *
 * Hand-rolled rather than BufferGeometryUtils.mergeGeometries because that
 * lives in three/examples and this build only imports the `three` package
 * proper.
 *
 * Everything here is BUILD-TIME ONLY. Allocation is free; nothing in this file
 * may ever be called from an update loop.
 */
import * as THREE from 'three';

/** GLSL float literal (never emits an int — "1" would fail to compile). */
export const g = (n) => Number(n).toFixed(4);

/** PAPER int -> linear-space rgb triple, optionally scaled (layer shading). */
export function lin(hex, scale = 1) {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  if (scale !== 1) c.multiplyScalar(scale);
  return [c.r, c.g, c.b];
}

// Scratch for mixHex — it runs once per ground-cover instance during the
// build, and every caller hands the result straight to setColorAt (which
// copies), so a shared colour saves ~100 k allocations at load with no
// aliasing risk.
const _mixA = new THREE.Color();
const _mixB = new THREE.Color();

/** Linear-space blend of two PAPER ints. Returns SHARED scratch — copy it. */
export function mixHex(a, b, t) {
  _mixA.setHex(a, THREE.SRGBColorSpace);
  _mixB.setHex(b, THREE.SRGBColorSpace);
  return _mixA.lerp(_mixB, t);
}

/** Relative layer shade (multiplied by instanceColor at draw time). */
export const shade = (v) => [v, v, v];

/** Compose a TRS matrix. Build-time only — allocation here is free. */
export function trs(px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** A fresh primitive sink. `withAlpha` widens the colour attribute to vec4. */
export function sink(withAlpha = false) {
  return { pos: [], nrm: [], col: [], alpha: withAlpha };
}

/**
 * Stamp a primitive into the sink. CONSUMES `geo` (disposes it) — every call
 * site constructs the primitive inline, so nothing leaks.
 */
export function stamp(s, geo, matrix, rgb, a = 1) {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  if (matrix) ni.applyMatrix4(matrix);
  const p = ni.attributes.position.array;
  const n = ni.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) {
    s.pos.push(p[i], p[i + 1], p[i + 2]);
    s.nrm.push(n[i], n[i + 1], n[i + 2]);
    if (s.alpha) s.col.push(rgb[0], rgb[1], rgb[2], a);
    else s.col.push(rgb[0], rgb[1], rgb[2]);
  }
  if (ni !== geo) ni.dispose();
  geo.dispose();
}

/**
 * Stamp one raw triangle. Cheaper than a primitive for the leaf/blade shapes
 * vegetation is made of, where a triangle IS the papercut, and it lets the
 * caller hand-author normals so a near-vertical scrap still picks up the lit
 * step of the toon ramp instead of reading as a dark vertical.
 */
export function tri(s, p0, p1, p2, nrm, c0, c1 = c0, c2 = c1) {
  s.pos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  for (let i = 0; i < 3; i++) s.nrm.push(nrm[0], nrm[1], nrm[2]);
  if (s.alpha) {
    s.col.push(c0[0], c0[1], c0[2], 1, c1[0], c1[1], c1[2], 1, c2[0], c2[1], c2[2], 1);
  } else {
    s.col.push(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]);
  }
}

/** Freeze a sink into a BufferGeometry with bounds already computed. */
export function bake(s) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(s.nrm), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(s.col), s.alpha ? 4 : 3));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/**
 * Fan a closed 2D outline into triangles around a centre point, in the XY
 * plane (normal +Z). `pts` is [[x,y], ...] in order. Alpha ramps centre->rim,
 * which is how a glow gets its soft edge with no texture and no derivatives.
 */
export function fanXY(s, pts, cx, cy, z, rgb, aCentre, aRim) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    s.pos.push(cx, cy, z, p0[0], p0[1], z, p1[0], p1[1], z);
    for (let k = 0; k < 3; k++) s.nrm.push(0, 0, 1);
    s.col.push(rgb[0], rgb[1], rgb[2], aCentre);
    s.col.push(rgb[0], rgb[1], rgb[2], aRim);
    s.col.push(rgb[0], rgb[1], rgb[2], aRim);
  }
}
