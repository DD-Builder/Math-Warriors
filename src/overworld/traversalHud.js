/**
 * traversalHud — the stamina ring, and the traversal-mode chip beside it.
 *
 * ── THE PROBLEM A STAMINA METER HAS ────────────────────────────────────────
 * A stamina bar is a threat. It sits on screen saying "you are running out",
 * and for a five-year-old halfway up a paper cliff that is exactly the wrong
 * message. So this gauge is built around three rules:
 *
 *   1. IT IS NOT THERE WHEN IT DOES NOT MATTER. A full pool draws nothing at
 *      all — the ring fades in the moment the pool is being spent and fades
 *      back out a beat after it refills. A HUD element that is always on is
 *      furniture; one that appears when you grab a wall is FEEDBACK.
 *   2. IT LIVES AT THE HERO, NOT IN A CORNER. The ring is drawn around the
 *      hero's screen position, because that is where a child is looking while
 *      they climb. A corner meter is a meter nobody reads.
 *   3. IT NEVER GOES RED. Papercut law and kindness agree here: the arc runs
 *      gold -> coral -> a soft peach flicker, and even "spent" is a friendly
 *      colour. Nothing in this game glows danger-red at a child.
 *
 * ── SHAPE OF THIS MODULE ───────────────────────────────────────────────────
 *   PURE (node-testable, no Phaser/DOM at import time):
 *     GAUGE          the one tuning table
 *     describeGauge  state -> everything the widget needs to draw, as numbers
 *     easeAlpha      the fade integrator (frame-rate independent)
 *     modeChip       traversal mode -> the little label beside the ring
 *
 *   IMPURE (a thin Phaser widget, duck-typed on `scene`):
 *     createStaminaGauge  three Graphics layers + a label, one update()
 *
 * Nothing allocates per frame: describeGauge writes into a caller-supplied
 * `out` record and the widget redraws into Graphics objects it already owns.
 */
import { PAPER } from '../config.js';
import { MODES, DEFAULT_TRAVERSAL_TUNING, staminaFraction } from './traversal.js';

const TAU = Math.PI * 2;

/** THE tuning table. Every number annotated with the feel it buys. */
export const GAUGE = {
  radius: 62,          // px of ring radius around the hero's screen point
  thickness: 13,       // px of arc weight — thick enough to read at arm's length
  backAlpha: 0.30,     // the unfilled remainder of the ring
  shadowDX: 0,         // papercut law: a teal shadow, offset DOWN, never black
  shadowDY: 7,
  shadowAlpha: 0.30,
  gap: 0.30,           // rad of gap at the TOP of the ring, so the arc has a
                       // readable start and end instead of being a closed O —
                       // and so the mode chip has somewhere to sit
  lift: -70,           // px the ring centre sits above the hero's feet point:
                       // around the chest, where the eye already is
  fadeIn: 9,           // 1/s — appears in ~110 ms, which reads as instant
  fadeOut: 2.2,        // 1/s — lingers ~450 ms after it stops mattering, so a
                       // quick regen does not make the HUD strobe
  holdFull: 0.45,      // s the full ring stays up before it starts fading
  lowAt: 0.28,         // fraction below which the arc warms toward coral
  pulseHz: 3.2,        // low-pool heartbeat: a gentle breathe, not a strobe
  pulseAmp: 0.18,      // …of this much alpha. Deliberately subtle.
  segments: 44,        // arc tessellation. 44 is smooth at 62 px and cheap.
  chipDY: -80,         // px from the ring centre to the mode chip — ABOVE the
                       // ring, in its gap, clear of the hero's own silhouette
  chipSize: 17,
};

/** The little word under the ring. Null means "draw no chip at all". */
export function modeChip(mode) {
  switch (mode) {
    case MODES.CLIMB: return 'CLIMB';
    case MODES.MANTLE: return 'UP!';
    case MODES.GLIDE: return 'GLIDE';
    case MODES.SWIM: return 'SWIM';
    default: return null;
  }
}

/**
 * Frame-rate independent exponential ease toward `target`.
 * Exported because the fade is the part that is easy to get subtly wrong and
 * the test pins it at 30, 60 and 144 Hz.
 */
export function easeAlpha(current, target, rate, dt) {
  const k = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  return current + (target - current) * k;
}

/**
 * Everything the widget needs, as plain numbers. Pure: no clock of its own —
 * `simT` comes from the traversal state, so a frozen pose draws a frozen ring
 * and the screenshot harness is reproducible.
 *
 * `out` is reused across frames; the widget owns exactly one.
 *
 * @param {object} state a traversal state (or null)
 * @param {object} [tuning] the merged traversal tuning
 * @param {object} [out]
 */
export function describeGauge(state, tuning = DEFAULT_TRAVERSAL_TUNING, out = {}) {
  const frac = staminaFraction(state, tuning);
  const mode = state?.mode || MODES.WALK;
  const tired = !!state?.tired;
  const onWall = mode === MODES.CLIMB || mode === MODES.MANTLE;

  // WANTED, not shown: the widget's own fade decides what is actually drawn.
  // Climbing always shows the ring — that is the one activity where knowing
  // the number changes what a child does next.
  out.wanted = onWall || tired || frac < 0.999;
  out.fraction = frac;
  out.mode = mode;
  out.tired = tired;
  out.chip = modeChip(mode);
  out.low = frac < (tuning.staminaLowAt ?? GAUGE.lowAt);

  // Colour: gold while there is plenty, warming to coral as it goes, and peach
  // once it is actually spent. Never red, never grey.
  out.color = tired ? PAPER.peach : (out.low ? PAPER.coral : PAPER.gold);
  out.backColor = PAPER.inkTeal;

  // The heartbeat, keyed to the traversal sim clock so it is deterministic.
  const t = typeof state?.simT === 'number' ? state.simT : 0;
  out.pulse = out.low || tired
    ? 1 - GAUGE.pulseAmp * (0.5 - 0.5 * Math.cos(t * GAUGE.pulseHz * TAU))
    : 1;

  // Arc geometry: start just clockwise of twelve o'clock and sweep round, so
  // a draining pool retreats the way a clock hand does.
  const span = TAU - GAUGE.gap;
  out.start = -Math.PI / 2 + GAUGE.gap / 2;
  out.end = out.start + span * frac;
  out.span = span;
  return out;
}

/**
 * The Phaser widget. Duck-typed on `scene` exactly like controls3d's
 * factories, so a headless test can hand it a stub and a real scene can hand
 * it itself.
 *
 * @param {Phaser.Scene} scene
 * @param {{tuning?:object, depth?:number}} [opts]
 * @returns {{update(state, dt, screenX, screenY):void, setVisible(v):void,
 *            alpha:number, destroy():void}}
 */
export function createStaminaGauge(scene, opts = {}) {
  const tuning = opts.tuning || DEFAULT_TRAVERSAL_TUNING;
  const depth = opts.depth ?? 93;

  // Three layers, back to front: the teal drop shadow, the unfilled ring, the
  // filled arc. Three Graphics objects rather than one, because the shadow has
  // to sit at a different offset and redrawing one path three times a frame is
  // cheaper than three transforms on a shared path.
  const shadow = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  const back = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);
  const arc = scene.add.graphics().setDepth(depth + 2).setScrollFactor(0);
  const chip = scene.add.text(0, 0, '', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${GAUGE.chipSize}px`,
    color: '#f5eedd',
    stroke: '#143f42',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(depth + 3).setScrollFactor(0);

  const desc = {};        // reused every frame — describeGauge writes into it
  let alpha = 0;
  let holdT = 0;
  let visible = true;

  /** Stroke an arc into `g` by hand: Phaser's arc() is fill-only on Graphics. */
  function strokeArc(g, cx, cy, r, from, to, color, a, width) {
    if (a <= 0.004 || to <= from) return;
    g.lineStyle(width, color, a);
    g.beginPath();
    const steps = Math.max(2, Math.ceil(GAUGE.segments * ((to - from) / TAU)));
    for (let i = 0; i <= steps; i++) {
      const th = from + (to - from) * (i / steps);
      const x = cx + Math.cos(th) * r;
      const y = cy + Math.sin(th) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }

  /**
   * @param {object} state traversal state
   * @param {number} dt seconds since the last update (0 freezes the fade,
   *        which is what the screenshot harness wants)
   * @param {number} screenX hero's screen x
   * @param {number} screenY hero's screen y (feet)
   */
  function update(state, dt, screenX, screenY) {
    describeGauge(state, tuning, desc);

    // The hold: a ring that has just filled stays up for a moment, so the
    // child sees it FINISH rather than watching it vanish mid-refill.
    if (desc.wanted) holdT = GAUGE.holdFull;
    else if (holdT > 0) holdT = Math.max(0, holdT - dt);
    const want = (desc.wanted || holdT > 0) && visible ? 1 : 0;
    alpha = easeAlpha(alpha, want, want > alpha ? GAUGE.fadeIn : GAUGE.fadeOut, dt);

    shadow.clear();
    back.clear();
    arc.clear();
    if (alpha <= 0.004) { chip.setVisible(false); return; }

    const cx = screenX;
    const cy = screenY + GAUGE.lift;
    const a = alpha * desc.pulse;

    strokeArc(shadow, cx + GAUGE.shadowDX, cy + GAUGE.shadowDY, GAUGE.radius,
      desc.start, desc.start + desc.span, PAPER.shadow,
      a * GAUGE.shadowAlpha, GAUGE.thickness + 2);
    strokeArc(back, cx, cy, GAUGE.radius,
      desc.start, desc.start + desc.span, desc.backColor,
      a * GAUGE.backAlpha, GAUGE.thickness);
    strokeArc(arc, cx, cy, GAUGE.radius,
      desc.start, desc.end, desc.color, a, GAUGE.thickness);

    if (desc.chip) {
      chip.setVisible(true).setAlpha(a).setText(desc.chip).setPosition(cx, cy + GAUGE.chipDY);
    } else {
      chip.setVisible(false);
    }
  }

  return {
    update,
    setVisible(v) { visible = !!v; },
    get alpha() { return alpha; },
    /** Read-only view of the last describeGauge() result, for tests/debug. */
    get described() { return desc; },
    destroy() {
      shadow.destroy();
      back.destroy();
      arc.destroy();
      chip.destroy();
    },
  };
}
