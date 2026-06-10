import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blobPoints, waveEdgePoints, hillPoints, organicRectPoints, rotatePoints,
  PAPER, PAPER_CSS,
} from './papercutArt.js';

test('blobPoints is deterministic for the same seed', () => {
  const a = blobPoints(100, 100, 50, 40, { seed: 7 });
  const b = blobPoints(100, 100, 50, 40, { seed: 7 });
  assert.deepEqual(a, b);
});

test('blobPoints differs across seeds', () => {
  const a = blobPoints(100, 100, 50, 40, { seed: 7 });
  const b = blobPoints(100, 100, 50, 40, { seed: 8 });
  assert.notDeepEqual(a, b);
});

test('blobPoints stays within wobble bounds and returns requested count', () => {
  const pts = blobPoints(0, 0, 50, 50, { seed: 3, points: 60, wobble: 0.12 });
  assert.equal(pts.length, 60);
  for (const p of pts) {
    const r = Math.hypot(p.x, p.y);
    assert.ok(r > 50 * 0.6 && r < 50 * 1.4, `radius ${r} out of bounds`);
  }
});

test('waveEdgePoints spans x0..x1 and stays near baseY', () => {
  const pts = waveEdgePoints(0, 500, 200, { seed: 5, amplitude: 20 });
  assert.equal(pts[0].x, 0);
  assert.equal(pts[pts.length - 1].x, 500);
  for (const p of pts) {
    assert.ok(Math.abs(p.y - 200) <= 20 * 1.4 + 0.001, `y ${p.y} too far from base`);
  }
});

test('hillPoints closes the polygon at the bottom corners', () => {
  const pts = hillPoints(10, 300, 100, 400, { seed: 2 });
  const last = pts[pts.length - 1];
  const secondLast = pts[pts.length - 2];
  assert.deepEqual({ x: last.x, y: last.y }, { x: 10, y: 400 });
  assert.deepEqual({ x: secondLast.x, y: secondLast.y }, { x: 300, y: 400 });
});

test('organicRectPoints is deterministic and bounded', () => {
  const a = organicRectPoints(0, 0, 200, 100, { seed: 9, wobble: 8 });
  const b = organicRectPoints(0, 0, 200, 100, { seed: 9, wobble: 8 });
  assert.deepEqual(a, b);
  for (const p of a) {
    assert.ok(Math.abs(p.x) <= 100 + 8 * 2.2, `x ${p.x} exceeds bounds`);
    assert.ok(Math.abs(p.y) <= 50 + 8 * 2.2, `y ${p.y} exceeds bounds`);
  }
});

test('rotatePoints by 2π returns (approximately) the original points', () => {
  const pts = [{ x: 10, y: 0 }, { x: 0, y: 10 }];
  const rotated = rotatePoints(pts, 0, 0, Math.PI * 2);
  for (let i = 0; i < pts.length; i++) {
    assert.ok(Math.abs(rotated[i].x - pts[i].x) < 1e-9);
    assert.ok(Math.abs(rotated[i].y - pts[i].y) < 1e-9);
  }
});

test('PAPER palette values are valid 24-bit colors with CSS twins', () => {
  for (const [key, value] of Object.entries(PAPER)) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff, `${key} invalid`);
    assert.match(PAPER_CSS[key], /^#[0-9a-f]{6}$/);
  }
});
