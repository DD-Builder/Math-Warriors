/**
 * Papercut toon materials.
 *
 * The whole 3D world obeys the 2D game's palette law (src/config.js PAPER):
 * layered cut paper, shadows that go TEAL — never gray, never black — and no
 * dark outlines anywhere. The workhorse here is a 3-step gradient ramp whose
 * dark texel is itself teal-tinted: MeshToonMaterial multiplies incoming light
 * by the ramp texel, so shaded faces slide toward teal instead of black
 * without any shader patching (SwiftShader-safe, cheap on iPad).
 */
import * as THREE from 'three';
import { PAPER } from '../../config.js';

let _ramp = null;

/** Shared 3-step ramp: shadow texel teal-tinted, mid neutral, lit full. */
export function toonRamp() {
  if (_ramp) return _ramp;
  // RGB per step. Dark step leans teal (multiplying warm sun light by a
  // teal-ish factor = teal-shadowed paper); values chosen so nothing on
  // screen ever drops below ~30% luminance.
  const steps = [
    [0.34, 0.47, 0.47],  // shade — teal lean (from PAPER.shadow hue)
    [0.72, 0.76, 0.74],  // half  — near-neutral, slight cool
    [1.00, 1.00, 1.00],  // lit
  ];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((s, i) => {
    data[i * 4 + 0] = Math.round(s[0] * 255);
    data[i * 4 + 1] = Math.round(s[1] * 255);
    data[i * 4 + 2] = Math.round(s[2] * 255);
    data[i * 4 + 3] = 255;
  });
  _ramp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  _ramp.minFilter = THREE.NearestFilter;
  _ramp.magFilter = THREE.NearestFilter;
  _ramp.generateMipmaps = false;
  _ramp.needsUpdate = true;
  return _ramp;
}

/**
 * Standard papercut surface. `color` is a PAPER palette int (0xRRGGBB).
 * Optional: { flatShading, vertexColors, transparent, opacity, side }.
 */
export function toonMaterial(color, opts = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: toonRamp(),
    fog: true,
    ...opts,
  });
  return mat;
}

/** Convert a PAPER int to a THREE.Color (convenience for lights/fog/sky). */
export function paperColor(colorInt) {
  return new THREE.Color(colorInt);
}

export { PAPER };
