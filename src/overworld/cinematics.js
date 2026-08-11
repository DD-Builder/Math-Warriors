/**
 * cinematics.js — the staged beats of the 3D island.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The world got beautiful and stayed silent about itself. A child walks onto
 * a 480 m island, and nothing tells them it is theirs. They free a hero who
 * has been in a cage for the whole game, and the game answers with a toast
 * that says "+1 HERO". They finish a floor's challenge, the bridge GROWS out
 * of the water behind them, and the camera is still glued to the back of
 * their head, pointing the other way.
 *
 * AAA games punctuate. Odyssey holds on the Odyssey lifting off. TotK holds
 * on the door opening. The hold is the point: it is the game saying *look at
 * what you just did*. This file is the machinery for holds.
 *
 * ── WHAT MAKES IT DIFFERENT FROM CutsceneScene ─────────────────────────────
 * CutsceneScene (2D) is a comic book: it LEAVES the game, draws panels, and
 * comes back. Nothing here leaves. The world keeps simulating — the grass
 * keeps moving, the sea keeps breathing, the hero keeps standing in the same
 * spot they were standing in — and the only thing that changes is who is
 * driving the camera. That is the whole trick, and it is what makes a
 * cinematic feel like the game rather than like an interruption.
 *
 * ── THE THREE LAWS ─────────────────────────────────────────────────────────
 * 1. NO ENGINE IMPORTS. This file imports exactly one thing: the palette.
 *    Every camera it moves, every scene it draws into, and every overlay it
 *    speaks through arrives as an injected driver. That is not purity for its
 *    own sake — it is what lets cinematics.test.js run the ENTIRE director,
 *    beat by beat, in plain Node, and assert that skipping a cinematic leaves
 *    the game in exactly the state that watching it would have.
 *
 * 2. SKIPPABLE, ALWAYS, WITHOUT LOSS. Children replay. A child who has seen
 *    the arrival four times must be able to kill it in one tap, and killing
 *    it must never cost them the hero it was about to unlock. skip() runs
 *    every remaining side effect in order and lands every visual channel on
 *    its terminal value. See the "skip is a fast-forward, not an abort"
 *    section on CinematicPlayer.
 *
 * 3. ONE TEXT SYSTEM. Lines go through the existing DialogueOverlay. There is
 *    no second speech renderer in this file and there must never be one.
 *
 * ── AUDIO ──────────────────────────────────────────────────────────────────
 * Every sound here is a KEY handed to the host's audio manager, which routes
 * through the one AudioContext and the master limiter in music/audioGraph.js.
 * This file creates no nodes, no context, and no listeners.
 */

import { PAPER, PAPER_CSS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';

// ───────────────────────────────────────────────────────────────────────────
// THE SEQUENCE FORMAT
// ───────────────────────────────────────────────────────────────────────────
/**
 * A cinematic is data:
 *
 *   {
 *     id: 'arrival',            // save key — see hasSeenCinematic()
 *     once: true,               // remember it in the save once it has played
 *     skippable: true,          // false is never correct; the field exists so
 *                               //   a reader can see that it is always true
 *     music: 'music/map',       // optional track for the duration
 *     steps: [ Step, Step, … ]
 *   }
 *
 * A STEP is either one beat or an ARRAY of beats that play together. The step
 * ends when its longest beat ends, so "fly the camera while she talks" is
 * literally that:
 *
 *   [ { t: 'camera', to: …, dur: 4200 }, { t: 'say', lines: […] } ]
 *
 * A BEAT is one of:
 *
 *   { t:'camera',    from?, to, dur, ease }   fly the eye. `from` defaults to
 *                                             wherever the eye already is, so
 *                                             consecutive moves chain smoothly.
 *   { t:'hold',      dur }                    let the frame breathe. The most
 *                                             underrated beat in the list.
 *   { t:'say',       lines }                  DialogueOverlay. Blocks on the
 *                                             player's own tap — no timer.
 *   { t:'letterbox', on, dur }                paper bars in/out (PAPER.inkTeal)
 *   { t:'fade',      to, dur, color }         0 = clear, 1 = full paper
 *   { t:'card',      title, epithet, kind, dur }   layered-paper title card
 *   { t:'hero',      pose, yaw?, dur }        the hero ACTS — look up, cheer,
 *                                             step forward. Not a spectator.
 *   { t:'prop',      id, anim, dur }          a cage swings open, a bridge grows
 *   { t:'sfx',       key }                    one-shot, instant
 *   { t:'stinger',   name }                   musical phrase over a duck
 *   { t:'music',     key }                    change the score
 *   { t:'do',        run }                    a side effect (unlock, save…)
 *
 * A POINT (camera `pos` / `look`) is one of:
 *
 *   { x, y, z }                               literal world metres
 *   { from:'hero'|'target'|…, dx, dy, dz }    anchor plus an offset
 *   { from:'hero', dist, height, yaw|yawRel } anchor plus a polar orbit, where
 *                                             yawRel is relative to the
 *                                             anchor's own facing so a shot
 *                                             composes the same from any angle
 *
 * Anchors are resolved by the host through driver.resolve(name), ONCE at the
 * moment the step begins. Baking them at step start (not per frame) is
 * deliberate: a camera that re-resolves a moving anchor every frame chases and
 * jitters, and a staged shot must be a shot, not a follow.
 */

/** Beat type names, so a typo is a crash at compile() instead of a silent no-op. */
export const BEATS = [
  'camera', 'hold', 'say', 'letterbox', 'fade', 'card',
  'hero', 'prop', 'sfx', 'stinger', 'music', 'do',
];

/** Beats that have no duration of their own — they fire and the step moves on. */
const INSTANT = new Set(['sfx', 'stinger', 'music', 'do']);

// ───────────────────────────────────────────────────────────────────────────
// EASING
// ───────────────────────────────────────────────────────────────────────────
/**
 * Six curves, and only six. A camera language with twenty easings is a camera
 * language nobody can hold in their head, and 'sine.inOut' is the right answer
 * to roughly nine questions out of ten — it starts from rest and arrives at
 * rest, which is what a crane arm actually does.
 */
export const EASES = {
  linear: (t) => t,
  'sine.in': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'sine.out': (t) => Math.sin((t * Math.PI) / 2),
  'sine.inOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'quad.out': (t) => 1 - (1 - t) * (1 - t),
  'cubic.inOut': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** Clamped, named easing. An unknown name is sine.inOut, never a throw. */
export function ease(name, t) {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return (EASES[name] || EASES['sine.inOut'])(u);
}

const lerp = (a, b, t) => a + (b - a) * t;

// ───────────────────────────────────────────────────────────────────────────
// SHOTS
// ───────────────────────────────────────────────────────────────────────────
/** A resolved shot: absolute metres, absolute degrees. Nothing symbolic left. */
const shot = (px, py, pz, lx, ly, lz, fov) => ({
  pos: { x: px, y: py, z: pz },
  look: { x: lx, y: ly, z: lz },
  fov,
});

/** The lens the island's follow boom rests at (index.js PerspectiveCamera). */
export const DEFAULT_FOV = 50;

/**
 * Turn one symbolic POINT into metres.
 *
 * `resolve(name)` must return `{x, y, z, yaw?}` for every anchor a sequence
 * mentions. An anchor the host cannot resolve collapses to the origin rather
 * than throwing — a cinematic that mis-frames is a bad shot, a cinematic that
 * throws mid-flight is a soft-locked child.
 */
export function resolvePoint(point, resolve) {
  if (!point) return { x: 0, y: 0, z: 0 };
  if (point.from == null) {
    return { x: num(point.x), y: num(point.y), z: num(point.z) };
  }
  const a = (typeof resolve === 'function' && resolve(point.from)) || null;
  const ax = num(a?.x), ay = num(a?.y), az = num(a?.z);
  const aYaw = num(a?.yaw);

  if (point.dist != null || point.yawRel != null || point.yaw != null) {
    const yaw = point.yaw != null ? num(point.yaw) : aYaw + num(point.yawRel);
    const d = num(point.dist);
    return {
      // Forward is (sin yaw, cos yaw) everywhere in this codebase — see
      // index.js's look-ahead and gameFeel's heading. A shot authored at
      // yawRel: Math.PI therefore sits BEHIND the anchor, which is where a
      // third-person camera lives, so the numbers read the way they mean.
      x: ax + Math.sin(yaw) * d + num(point.dx),
      y: ay + num(point.height) + num(point.dy),
      z: az + Math.cos(yaw) * d + num(point.dz),
    };
  }
  return { x: ax + num(point.dx), y: ay + num(point.dy), z: az + num(point.dz) };
}

/** Resolve a whole shot reference. `look` defaults to the anchor's chest. */
export function resolveShot(ref, resolve, fallbackFov = DEFAULT_FOV) {
  const pos = resolvePoint(ref?.pos, resolve);
  const lookRef = ref?.look != null
    ? ref.look
    : { from: ref?.pos?.from || 'hero', dy: 1.4 };
  const look = resolvePoint(lookRef, resolve);
  return shot(pos.x, pos.y, pos.z, look.x, look.y, look.z,
    Number.isFinite(ref?.fov) ? ref.fov : fallbackFov);
}

/** Straight-line blend between two resolved shots. */
export function lerpShot(a, b, t) {
  return shot(
    lerp(a.pos.x, b.pos.x, t), lerp(a.pos.y, b.pos.y, t), lerp(a.pos.z, b.pos.z, t),
    lerp(a.look.x, b.look.x, t), lerp(a.look.y, b.look.y, t), lerp(a.look.z, b.look.z, t),
    lerp(a.fov, b.fov, t),
  );
}

function num(v, d = 0) { return Number.isFinite(v) ? v : d; }

// ───────────────────────────────────────────────────────────────────────────
// COMPILE
// ───────────────────────────────────────────────────────────────────────────
/**
 * Normalise an authored sequence into something the player can run without
 * defending itself on every frame: every step is an array, every beat has a
 * numeric duration, every unknown beat type is gone.
 *
 * `timeScale` shortens (or lengthens) everything at once. Reduced-motion
 * players get 0.5 here, which keeps every beat and every side effect and
 * simply stops the camera from swinging for four seconds at a time.
 *
 * @returns {{id:string, once:boolean, skippable:boolean, music:?string,
 *            steps:Array<{beats:Array, dur:number, open:boolean}>, dur:number}}
 */
export function compile(seq, { timeScale = 1, reducedMotion = false } = {}) {
  const scale = reducedMotion ? Math.min(timeScale, 1) * 0.5 : timeScale;
  const rawSteps = Array.isArray(seq?.steps) ? seq.steps : [];
  const steps = [];

  for (const raw of rawSteps) {
    const list = (Array.isArray(raw) ? raw : [raw]).filter(
      (b) => b && typeof b === 'object' && BEATS.includes(b.t),
    );
    if (!list.length) continue;

    let dur = 0;
    let open = false;
    const beats = list.map((b) => {
      const beat = { ...b };
      if (INSTANT.has(beat.t)) {
        beat.dur = 0;
      } else if (beat.t === 'say') {
        // A line is finished when the CHILD says it is finished. There is no
        // clock on reading — that is the entire reason the dialogue overlay
        // has a TAP target — so a say beat holds the step open.
        beat.dur = 0;
        open = true;
      } else {
        beat.dur = Math.max(0, Math.round(num(beat.dur, 600) * scale));
        dur = Math.max(dur, beat.dur);
      }
      return beat;
    });
    steps.push({ beats, dur, open });
  }

  return {
    id: String(seq?.id || 'cinematic'),
    once: seq?.once !== false,
    // Not a knob. Listed so that a reader looking for the escape hatch finds
    // the word `true` and stops looking for the case where it is false.
    skippable: true,
    music: seq?.music || null,
    steps,
    dur: steps.reduce((n, s) => n + s.dur, 0),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THE PLAYER
// ───────────────────────────────────────────────────────────────────────────
/**
 * Run a compiled sequence against a driver.
 *
 * THE DRIVER is every impure thing this file refuses to import, as a bag of
 * optional callbacks. Every one of them may be missing; a driver with nothing
 * in it runs a cinematic perfectly and silently, which is exactly what the
 * test suite does.
 *
 *   resolve(name)        -> {x,y,z,yaw}   anchors: 'hero', 'target', 'palace'…
 *   camera(shot)                          absolute eye, every frame it moves
 *   cameraRelease()                       hand the boom back
 *   letterbox(amount)                     0..1
 *   fade(amount, color)                   0..1
 *   card(spec|null)                       {title, epithet, kind, progress}
 *   say(lines) -> Promise|void            the DialogueOverlay
 *   endSay()                              dismiss it mid-line (skip)
 *   hero(action)                          {pose, yaw, progress}
 *   prop(action)                          {id, anim, progress, done}
 *   sfx(key) / stinger(name) / music(key)
 *   run(fn)                               defaults to fn()
 *   onEnd(reason)                         'finished' | 'skipped' | 'stopped'
 *
 * ── SKIP IS A FAST-FORWARD, NOT AN ABORT ───────────────────────────────────
 * skip() walks every step that has not run yet and, for each one, does the
 * thing that step would eventually have done: `do` callbacks fire, in order;
 * the camera lands on the last camera beat's destination; letterbox, fade and
 * card land on their terminal values; props finish their animation; sfx and
 * stingers are dropped (a skip should be quiet, not a pile-up — and a pile-up
 * is exactly what the master limiter exists to catch, so we do not make it
 * work for a living here). Then the sequence ends normally.
 *
 * The invariant is worth stating plainly, because cinematics.test.js asserts
 * it: FOR ANY SEQUENCE, THE SIDE EFFECTS OF skip() ARE THE SIDE EFFECTS OF
 * PLAYING THROUGH, IN THE SAME ORDER. A child who taps past the rescue scene
 * still gets the hero.
 */
export function createCinematicPlayer(compiled, driver = {}) {
  const seq = compiled;
  const d = driver || {};

  let stepIdx = -1;
  let stepT = 0;              // ms into the current step
  let state = 'idle';         // idle | playing | waiting | done
  let waiting = 0;            // outstanding open beats (say)
  let endReason = null;

  // The last shot we pushed. A camera beat with no `from` chains from here, so
  // an author writes destinations and never has to restate where they were.
  let current = null;
  // Live channel values, so skip() and the end-of-sequence tidy know what to
  // put back rather than guessing.
  let box = 0, fadeAmt = 0, cardOn = false;
  // Resolved endpoints for the camera beat running right now.
  let camFrom = null, camTo = null, camBeat = null;

  function push(s) { current = s; if (d.camera) d.camera(s); }

  function beginStep(i) {
    stepIdx = i;
    stepT = 0;
    camFrom = camTo = camBeat = null;
    const step = seq.steps[i];
    if (!step) return;

    for (const b of step.beats) {
      switch (b.t) {
        case 'camera': {
          camBeat = b;
          camTo = resolveShot(b.to, d.resolve, current?.fov ?? DEFAULT_FOV);
          camFrom = b.from
            ? resolveShot(b.from, d.resolve, current?.fov ?? DEFAULT_FOV)
            : (current || camTo);
          push(b.dur > 0 ? lerpShot(camFrom, camTo, 0) : camTo);
          break;
        }
        case 'say': {
          waiting++;
          const r = d.say ? d.say(b.lines || []) : null;
          if (r && typeof r.then === 'function') {
            const mine = stepIdx;
            r.then(() => { if (stepIdx === mine && state !== 'done') waiting--; },
              () => { if (stepIdx === mine && state !== 'done') waiting--; });
          } else {
            // A host without a dialogue overlay must not hang the world.
            waiting--;
          }
          break;
        }
        case 'letterbox': if (b.dur === 0) setBox(b.on === false ? 0 : 1); break;
        case 'fade': if (b.dur === 0) setFade(num(b.to), b.color); break;
        case 'card': if (d.card) { cardOn = true; d.card(cardSpec(b, 0)); } break;
        case 'hero': if (d.hero) d.hero({ pose: b.pose, yaw: b.yaw, progress: 0 }); break;
        case 'prop': if (d.prop) d.prop({ id: b.id, anim: b.anim, progress: 0, done: false }); break;
        case 'sfx': if (d.sfx) d.sfx(b.key); break;
        case 'stinger': if (d.stinger) d.stinger(b.name); break;
        case 'music': if (d.music) d.music(b.key); break;
        case 'do': runDo(b); break;
        default: break;
      }
    }
  }

  function runDo(b) {
    if (typeof b.run !== 'function') return;
    // A single authored callback must never be able to strand the player
    // inside a letterboxed frame with no input.
    try { (d.run || ((fn) => fn()))(b.run); } catch (err) {
      console.warn(`[cinematics] ${seq.id}: a 'do' beat threw`, err);
    }
  }

  function setBox(v) { box = v; if (d.letterbox) d.letterbox(v); }
  function setFade(v, color) { fadeAmt = v; if (d.fade) d.fade(v, color); }

  function cardSpec(b, p) {
    return {
      title: b.title || '', epithet: b.epithet || '', kind: b.kind || 'floor',
      tint: b.tint, progress: p, dur: b.dur,
    };
  }

  // Where the live fade beat started from. Captured when the previous fade
  // beat ended, so a fade-out chains from a fade-in instead of snapping.
  let fadeStart = 0;

  function tickStep(dt) {
    const step = seq.steps[stepIdx];
    if (!step) return;
    stepT += dt;

    for (const b of step.beats) {
      if (!b.dur) continue;
      const p = Math.min(1, stepT / b.dur);
      switch (b.t) {
        case 'camera':
          push(lerpShot(camFrom, camTo, ease(b.ease, p)));
          break;
        case 'letterbox':
          setBox(b.on === false ? 1 - ease('sine.inOut', p) : ease('sine.inOut', p));
          break;
        case 'fade': {
          const from = fadeStart ?? 0;
          setFade(lerp(from, num(b.to), ease(b.ease || 'sine.inOut', p)), b.color);
          break;
        }
        case 'card':
          if (d.card) d.card(cardSpec(b, p));
          break;
        case 'hero':
          if (d.hero) d.hero({ pose: b.pose, yaw: b.yaw, progress: p });
          break;
        case 'prop':
          if (d.prop) d.prop({ id: b.id, anim: b.anim, progress: p, done: p >= 1 });
          break;
        default: break;
      }
    }
  }

  function stepFinished() {
    const step = seq.steps[stepIdx];
    if (!step) return true;
    if (waiting > 0) return false;
    return stepT >= step.dur;
  }

  function endStep() {
    const step = seq.steps[stepIdx];
    if (!step) return;
    for (const b of step.beats) {
      if (b.t === 'card' && d.card) { cardOn = false; d.card(null); }
      if (b.t === 'camera' && camTo) push(camTo);
      if (b.t === 'fade') fadeStart = num(b.to);
    }
  }

  function advance() {
    endStep();
    if (stepIdx + 1 >= seq.steps.length) { finish('finished'); return; }
    beginStep(stepIdx + 1);
  }

  function finish(reason) {
    if (state === 'done') return;
    state = 'done';
    endReason = reason;
    if (cardOn && d.card) { cardOn = false; d.card(null); }
    if (box !== 0) setBox(0);
    if (fadeAmt !== 0) setFade(0);
    if (d.cameraRelease) d.cameraRelease();
    if (d.onEnd) d.onEnd(reason);
  }

  return {
    id: seq.id,
    get state() { return state; },
    get active() { return state === 'playing'; },
    get stepIndex() { return stepIdx; },
    get shot() { return current; },
    get reason() { return endReason; },

    /** Kick off. Safe to call twice; the second call is a no-op. */
    start() {
      if (state !== 'idle') return this;
      state = 'playing';
      if (seq.music && d.music) d.music(seq.music);
      if (!seq.steps.length) { finish('finished'); return this; }
      beginStep(0);
      return this;
    },

    /**
     * Advance by `dt` milliseconds.
     *
     * Leftover time CARRIES across step boundaries. That matters more than it
     * looks: a run of instant steps (`do`, `sfx`, `do`) would otherwise burn
     * one rendered frame each, and a 400 ms beat fed a 500 ms frame from a
     * stalled tab would leave 100 ms of the next beat unplayed and drift the
     * whole sequence out of sync with its own audio.
     */
    tick(dt = 16.7) {
      if (state !== 'playing') return state;
      let remaining = Math.max(0, num(dt));
      let guard = 128;   // 128 empty steps in a row is an authoring bug
      while (state === 'playing' && guard-- > 0) {
        const step = seq.steps[stepIdx];
        const need = step ? Math.max(0, step.dur - stepT) : 0;
        const use = Math.min(remaining, need);
        if (use > 0) { tickStep(use); remaining -= use; } else if (need > 0) break;
        if (!stepFinished()) break;
        advance();
      }
      return state;
    },

    /**
     * The escape hatch. Runs every remaining side effect, lands every visual
     * channel, and ends. Never leaves a bar, a fade, a card or a locked stick
     * behind — see finish().
     */
    skip() {
      if (state === 'done') return;
      if (state === 'idle') state = 'playing';
      if (d.endSay) d.endSay();
      waiting = 0;

      let lastCam = null;
      let lastBox = box, lastFade = fadeAmt, lastFadeColor;

      // The step that is mid-flight counts too: its `do` beats have already
      // fired (beginStep runs them), but its camera destination has not landed.
      if (camTo) lastCam = camTo;

      for (let i = stepIdx + 1; i < seq.steps.length; i++) {
        for (const b of seq.steps[i].beats) {
          switch (b.t) {
            case 'do': runDo(b); break;
            case 'camera':
              lastCam = resolveShot(b.to, d.resolve, lastCam?.fov ?? current?.fov ?? DEFAULT_FOV);
              break;
            case 'letterbox': lastBox = b.on === false ? 0 : 1; break;
            case 'fade': lastFade = num(b.to); lastFadeColor = b.color; break;
            case 'prop':
              // The cage still has to be open on the other side of the skip.
              if (d.prop) d.prop({ id: b.id, anim: b.anim, progress: 1, done: true });
              break;
            case 'hero':
              if (d.hero) d.hero({ pose: b.pose, yaw: b.yaw, progress: 1 });
              break;
            case 'music': if (d.music) d.music(b.key); break;
            // sfx/stinger/say/card/hold are deliberately dropped: a skip is a
            // request for silence and a clear screen, not for six overlapping
            // one-shots and a title card nobody will read.
            default: break;
          }
        }
      }

      if (lastCam) push(lastCam);
      if (lastBox !== box) setBox(lastBox);
      if (lastFade !== fadeAmt) setFade(lastFade, lastFadeColor);
      finish('skipped');
    },

    /** Hard stop — a scene shutdown, a context loss. No side effects run. */
    stop() {
      if (state === 'done') return;
      if (d.endSay) d.endSay();
      finish('stopped');
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// SAVE — additive, under save.overworld, no version bump
// ───────────────────────────────────────────────────────────────────────────
/**
 * `save.overworld.seen` is a flat list of cinematic ids.
 *
 * A LIST, not a map of booleans, for one reason: an old save simply does not
 * have the field, an absent list means "nothing has played", and that is the
 * correct answer for every pre-cinematics save in existence. No migration, no
 * version bump, no chance of a v6 save arriving with half the flags set.
 *
 * save.js's normalize() keeps the field (it filters to strings and dedupes);
 * everything below tolerates a save object that has never been near it.
 */
export function seenCinematics(save) {
  const list = save?.overworld?.seen;
  return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
}

export function hasSeenCinematic(save, id) {
  if (!id) return false;
  return seenCinematics(save).includes(id);
}

/** Idempotent. Returns true only the first time, so callers can log a beat. */
export function markCinematicSeen(save, id) {
  if (!save || !id) return false;
  if (!save.overworld || typeof save.overworld !== 'object') {
    save.overworld = { pos: null, yaw: 0, portalId: null, collected: [], seen: [] };
  }
  if (!Array.isArray(save.overworld.seen)) save.overworld.seen = [];
  if (save.overworld.seen.includes(id)) return false;
  save.overworld.seen.push(id);
  return true;
}

/** "Play them all again" — a Settings affordance, and how we test replays. */
export function resetCinematics(save) {
  if (save?.overworld) save.overworld.seen = [];
  return save;
}

// ── id helpers: one place that knows the shape of a save key ───────────────
export const CINE = {
  arrival: () => 'arrival',
  landmark: (floorId) => `landmark:${floorId}`,
  rescue: (heroId) => `rescue:${heroId}`,
  challenge: (floorId) => `challenge:${floorId}`,
  bossLair: (floorId) => `bosslair:${floorId}`,
  floorCard: (floorId) => `floorcard:${floorId}`,
  finale: () => 'finale',
};

// ───────────────────────────────────────────────────────────────────────────
// THE WRITING
// ───────────────────────────────────────────────────────────────────────────
/**
 * Floor names come from data/floors.js. The EPITHETS are new, and they are
 * the whole point of the title card: a name tells a child where they are, an
 * epithet tells them what kind of place it is. Nine lines, each one a small
 * promise about the maths inside, none of them frightening. "Ember Caves" is
 * "warm rock, patient fire" — not "the burning depths".
 */
export const FLOOR_CARDS = {
  1: { name: 'The Garden',        epithet: 'where every seed remembers a number', tint: PAPER.leaf },
  2: { name: 'Tidepool Ruins',    epithet: 'the sea counts, twice a day',         tint: PAPER.teal },
  3: { name: 'The Shattered Sky', epithet: 'put the pieces back where they belong', tint: PAPER.sky },
  4: { name: 'Ember Caves',       epithet: 'warm rock, patient fire',             tint: PAPER.coral },
  5: { name: 'Frozen Peak',       epithet: 'everything is still — and still adding up', tint: PAPER.tealL },
  6: { name: 'Crystal Caverns',   epithet: 'one light, split a hundred ways',     tint: PAPER.lavender },
  7: { name: 'Coinford Market',   epithet: 'everything costs exactly what it costs', tint: PAPER.gold },
  8: { name: 'Infinity Library',  epithet: 'a shelf with no last book',           tint: PAPER.sand },
  9: { name: 'The Mending Room',  epithet: 'where broken things are made whole',  tint: PAPER.lavenderD },
};

/** The island's own landmarks (worldSpec BIOMES), with a reason to look. */
export const LANDMARK_CARDS = {
  1: { name: 'Sprout Garden',     line: 'That green is where it starts. Small things, growing on purpose.' },
  2: { name: 'Tidepool Shallows', line: 'Low tide already. The sea leaves its homework on the rocks.' },
  3: { name: 'Sky Cliffs',        line: 'Look up. Look UP. Somebody cut the sky into steps.' },
  4: { name: 'Ember Slopes',      line: 'Warm from here, and it is only breathing. It will not hurt you.' },
  5: { name: 'Frost Fields',      line: 'Quiet ground. Every footprint you make will still be there tomorrow.' },
  6: { name: 'Crystal Hollow',    line: 'One sunbeam goes in and a hundred come out. I never get used to it.' },
  7: { name: 'Market Town',       line: 'Coinford! Mind your change — they will absolutely test you on it.' },
  8: { name: 'Canyon Library',    line: 'They carved the shelves into the canyon. It just kept going down.' },
  9: { name: 'Paper Palace',      line: 'The Paper Palace. Folded once, a very long time ago, and never unfolded.' },
};

const GUIDE = 'Elara';

// ───────────────────────────────────────────────────────────────────────────
// THE STAGED MOMENTS
// ───────────────────────────────────────────────────────────────────────────

/**
 * 1. ARRIVING ON THE ISLAND — the establishing shot of the whole game.
 *
 * The composition is the one worldSpec was BUILT for and has never been used:
 * the spawn meadow at z≈158 looking north up the Palace's long south-west
 * apron. The move is a single unbroken crane — out at sea, in over the water,
 * across the garden, up the road, and finally a lift to put the summit on the
 * upper third — because a reveal that cuts is a slideshow, and a reveal that
 * flies is a place.
 *
 * Then, and only then, the camera drops behind the hero and hands back. The
 * child's first frame of control is already the game's normal frame.
 */
export function islandArrival({ palace = { x: 0, y: 58, z: 0 }, lines } = {}) {
  return {
    id: CINE.arrival(),
    once: true,
    music: 'music/map',
    steps: [
      // Bars in over a held wide of the sea, so the very first thing that
      // happens is the frame becoming a FRAME.
      [
        { t: 'letterbox', on: true, dur: 700 },
        {
          t: 'camera', dur: 1, ease: 'linear',
          from: { pos: { from: 'hero', dist: 190, height: 78, yawRel: 0 }, look: { x: palace.x, y: palace.y * 0.55, z: palace.z }, fov: 46 },
          to: { pos: { from: 'hero', dist: 190, height: 78, yawRel: 0 }, look: { x: palace.x, y: palace.y * 0.55, z: palace.z }, fov: 46 },
        },
      ],
      { t: 'hold', dur: 500 },

      // The long one. In over the water, across the meadow.
      [
        {
          t: 'camera', dur: 5200, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: 46, height: 26, yawRel: 0.35 }, look: { x: palace.x, y: palace.y * 0.7, z: palace.z }, fov: 48 },
        },
        { t: 'say', lines: lines?.[0] ? [lines[0]] : [
          { speaker: GUIDE, text: 'There. That is the whole of it — the Paper Isle.' },
        ] },
      ],

      // The lift. Crane up the apron and put the summit on the upper third.
      [
        {
          t: 'camera', dur: 4600, ease: 'sine.inOut',
          to: { pos: { x: palace.x + 34, y: palace.y + 30, z: palace.z + 96 }, look: { x: palace.x, y: palace.y + 6, z: palace.z }, fov: 44 },
        },
        { t: 'stinger', name: 'discovery' },
        { t: 'sfx', key: 'world/secret' },
        {
          t: 'card', kind: 'world', dur: 4600,
          title: 'THE PAPER ISLE', epithet: 'cut, folded, and waiting for you',
          tint: PAPER.gold,
        },
      ],

      { t: 'say', lines: lines?.slice(1)?.length ? lines.slice(1) : [
        { speaker: GUIDE, text: 'Nine places, and every one of them stopped working on the same morning.' },
        { speaker: GUIDE, text: 'Numbers hold this island together. Somebody let go of them.' },
        { speaker: GUIDE, text: 'So — walk anywhere you like. I will be right here.' },
      ] },

      // Home. Land on the resting shot so the hand-back has nothing to lerp.
      [
        {
          t: 'camera', dur: 2400, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 900 },
        { t: 'hero', pose: 'look', dur: 2400 },
      ],
    ],
  };
}

/**
 * 2. FIRST APPROACH TO A FLOOR'S LANDMARK.
 *
 * Short on purpose — five seconds, one line, no bars-and-fade ceremony. This
 * fires nine times over a playthrough and the ninth one must not feel like a
 * tax. All it does is take the eye off the back of the hero's head for long
 * enough to SEE the thing they are walking toward, then give it straight back.
 */
export function landmarkApproach(floorId, { at, name, line } = {}) {
  const card = LANDMARK_CARDS[floorId] || {};
  const target = at || { x: 0, y: 8, z: 0 };
  return {
    id: CINE.landmark(floorId),
    once: true,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 450 },
        {
          t: 'camera', dur: 2600, ease: 'sine.out',
          to: { pos: { from: 'hero', dist: -16, height: 11, yawRel: 0 }, look: { x: target.x, y: target.y, z: target.z }, fov: 47 },
        },
        { t: 'sfx', key: 'world/fairy' },
      ],
      [
        {
          t: 'camera', dur: 3000, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -13, height: 8.5, yawRel: 0.22 }, look: { x: target.x, y: target.y, z: target.z }, fov: 45 },
        },
        { t: 'say', lines: [{ speaker: GUIDE, text: line || card.line || `${name || card.name}. Worth a look.` }] },
      ],
      [
        {
          t: 'camera', dur: 1500, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 700 },
      ],
    ],
  };
}

/**
 * 3. FREEING A CAGED HERO — the character beat this game has been owing.
 *
 * The old version was `_flash('+1 HERO')`. A hero has been standing in a paper
 * cage since the floor was built, and the game's response was four characters
 * of toast in the corner.
 *
 * The shot: cut to a low three-quarter on the cage so it fills frame and the
 * child can see the bars. The cage opens ON CAMERA — the prop beat drives the
 * real animation, so the payoff is the thing itself, not a cross-fade. The
 * hero steps out. The camera arcs around behind them as they turn to face the
 * player, which is the oldest "you are one of us now" shot there is. Then the
 * lines, which are the existing rescue dialogue, in the existing overlay.
 *
 * `onFreed` is a `do` beat, and therefore SURVIVES A SKIP. The unlock is not
 * cosmetic and must not be skippable.
 */
export function heroFreed({ heroId, name, at, lines, onFreed } = {}) {
  const cage = at || { x: 0, y: 0, z: 0 };
  const who = name || 'A voice';
  return {
    id: CINE.rescue(heroId),
    once: true,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 450 },
        {
          t: 'camera', dur: 1200, ease: 'sine.out',
          from: { pos: { x: cage.x + 5.5, y: cage.y + 1.2, z: cage.z + 5.5 }, look: { x: cage.x, y: cage.y + 1.5, z: cage.z }, fov: 42 },
          to: { pos: { x: cage.x + 4.2, y: cage.y + 1.0, z: cage.z + 4.2 }, look: { x: cage.x, y: cage.y + 1.4, z: cage.z }, fov: 42 },
        },
      ],

      // The cage, opening. One second of nothing else happening.
      [
        { t: 'prop', id: 'cage', anim: 'open', dur: 1100 },
        { t: 'sfx', key: 'world/chest' },
        {
          t: 'camera', dur: 1100, ease: 'sine.inOut',
          to: { pos: { x: cage.x + 3.4, y: cage.y + 1.6, z: cage.z + 3.9 }, look: { x: cage.x, y: cage.y + 1.5, z: cage.z }, fov: 40 },
        },
      ],
      { t: 'hold', dur: 450 },

      // Out, and turning to face you.
      [
        { t: 'prop', id: 'cage', anim: 'freed', dur: 1400 },
        { t: 'stinger', name: 'rescue' },
        { t: 'sfx', key: 'world/rescue' },
        {
          t: 'camera', dur: 1800, ease: 'sine.inOut',
          to: { pos: { x: cage.x - 3.0, y: cage.y + 1.8, z: cage.z + 4.4 }, look: { x: cage.x, y: cage.y + 1.6, z: cage.z }, fov: 43 },
        },
        { t: 'hero', pose: 'greet', dur: 1800 },
      ],

      // The unlock. Before the talking, so a child who taps through the very
      // first frame still walks away with the hero.
      { t: 'do', run: () => { if (typeof onFreed === 'function') onFreed(); } },

      { t: 'say', lines: lines?.length ? lines : [
        { speaker: who, text: 'You... you found me. I had stopped counting the days.' },
        { speaker: who, text: 'Then let us make the rest of them count. I am with you.' },
      ] },

      [
        {
          t: 'camera', dur: 1300, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 700 },
      ],
    ],
  };
}

/**
 * 4. COMPLETING A FLOOR'S CHALLENGE — the world-transform payoff.
 *
 * applyFloorTransform() is the best thing in the whole floor: a bridge grows
 * across the gap, a tide drains out of a room. It currently happens behind the
 * player's head while a toast says "DONE!".
 *
 * So: pull the camera OFF the hero, put it on the thing that is about to
 * change, and hold there while it changes. The hold is not padding. The hold
 * IS the reward — the child watches the world rearrange itself because of an
 * answer they gave.
 */
export function challengeComplete({ floorId, at, lines, onTransform } = {}) {
  const t = at || { x: 0, y: 1, z: 0 };
  return {
    id: CINE.challenge(floorId),
    // Replayable: a child who restarts a floor should get the payoff again.
    once: false,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 500 },
        {
          t: 'camera', dur: 1600, ease: 'sine.out',
          to: { pos: { x: t.x + 11, y: t.y + 9, z: t.z + 13 }, look: { x: t.x, y: t.y + 1, z: t.z }, fov: 46 },
        },
        { t: 'sfx', key: 'world/floor-complete' },
      ],

      // The change itself, on camera, with a slow drift so the eye has
      // somewhere to travel while the geometry moves.
      [
        { t: 'do', run: () => { if (typeof onTransform === 'function') onTransform(); } },
        { t: 'prop', id: 'transform', anim: 'grow', dur: 2600 },
        { t: 'stinger', name: 'floor' },
        {
          t: 'camera', dur: 2600, ease: 'sine.inOut',
          to: { pos: { x: t.x - 6, y: t.y + 7, z: t.z + 15 }, look: { x: t.x, y: t.y + 1.2, z: t.z }, fov: 48 },
        },
      ],
      { t: 'hold', dur: 700 },

      ...(lines?.length ? [{ t: 'say', lines }] : []),

      [
        {
          t: 'camera', dur: 1500, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 700 },
      ],
    ],
  };
}

/**
 * 5. THE BOSS LAIR APPROACH.
 *
 * The only shot in the file that is allowed to be still. Everything else
 * cranes; this one just moves forward, slowly, low to the ground, toward a
 * closed door. The bars come in further than usual (0.20 of the screen per
 * bar against the house 0.14 — see the stage's `depth` option) and the score
 * steps up.
 *
 * AWE, NOT HORROR. No shadow, no snarl, no shake. The frame says "this one is
 * bigger than the others" and stops there — a five-year-old is going to walk
 * through that door in about four seconds.
 */
export function bossLairApproach({ floorId, at, bossName, lines } = {}) {
  const door = at || { x: 0, y: 1, z: 0 };
  return {
    id: CINE.bossLair(floorId),
    once: true,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 800, depth: 0.20 },
        {
          t: 'camera', dur: 2400, ease: 'sine.out',
          to: { pos: { x: door.x, y: door.y + 2.6, z: door.z + 15 }, look: { x: door.x, y: door.y + 3.2, z: door.z }, fov: 44 },
        },
        { t: 'music', key: 'music/boss' },
      ],
      [
        {
          t: 'camera', dur: 3400, ease: 'sine.inOut',
          to: { pos: { x: door.x, y: door.y + 1.7, z: door.z + 7.5 }, look: { x: door.x, y: door.y + 3.6, z: door.z }, fov: 41 },
        },
        { t: 'say', lines: lines?.length ? lines : [
          { speaker: GUIDE, text: `${bossName || 'Something'} is behind that door. It has been there a long while.` },
          { speaker: GUIDE, text: 'Go in when you are ready. Not a moment sooner.' },
        ] },
      ],
      { t: 'hold', dur: 500 },
      [
        {
          t: 'camera', dur: 1600, ease: 'sine.inOut',
          to: { pos: { from: 'hero', dist: -9.5, height: 4.6, yawRel: 0 }, look: { from: 'hero', dy: 1.5 } },
        },
        { t: 'letterbox', on: false, dur: 800 },
      ],
    ],
  };
}

/**
 * 6. THE FINALE.
 *
 * The reverse of the arrival, and deliberately shot to rhyme with it: the same
 * crane, run backwards, off the Palace summit and up into the sky, with the
 * whole island underneath. Then a fade to CREAM — not to black. Nothing in
 * this game fades to black.
 *
 * `onDone` runs after the fade lands, which is where the host hands off to
 * EndingScene under cover of a full-screen paper wash, so the scene change is
 * invisible.
 */
export function finale({ palace = { x: 0, y: 58, z: 0 }, lines, onDone } = {}) {
  return {
    id: CINE.finale(),
    once: false,
    steps: [
      [
        { t: 'letterbox', on: true, dur: 900 },
        {
          t: 'camera', dur: 3000, ease: 'sine.out',
          to: { pos: { from: 'hero', dist: -7, height: 3.2, yawRel: 0 }, look: { from: 'hero', dy: 1.6 }, fov: 46 },
        },
        { t: 'hero', pose: 'cheer', dur: 3000 },
        { t: 'stinger', name: 'victory' },
      ],

      { t: 'say', lines: lines?.length ? lines : [
        { speaker: GUIDE, text: 'Listen. Every number on this island is back where it belongs.' },
        { speaker: GUIDE, text: 'You did that. Not me, not the Palace — you.' },
      ] },

      // Up, and up, until the whole island is one small bright shape.
      [
        {
          t: 'camera', dur: 6000, ease: 'sine.inOut',
          to: { pos: { x: palace.x + 20, y: palace.y + 150, z: palace.z + 190 }, look: { x: palace.x, y: palace.y * 0.5, z: palace.z }, fov: 52 },
        },
        {
          t: 'card', kind: 'world', dur: 6000,
          title: 'THE PAPER ISLE', epithet: 'whole again, and warm', tint: PAPER.gold,
        },
      ],

      [{ t: 'fade', to: 1, dur: 1600, color: PAPER.cream }],
      { t: 'do', run: () => { if (typeof onDone === 'function') onDone(); } },
    ],
  };
}

/**
 * 7 & 8. THE CARDS.
 *
 * A title card is a cinematic with one beat in it. That is not a shortcut —
 * it means the card gets skip, the card gets the save flag, and the card is
 * authored, timed and tested by exactly the same machinery as the six-second
 * crane. One system.
 *
 * The card does NOT take the camera. A child walking into The Garden should
 * keep walking while the name settles onto the screen.
 */
export function floorTitleCard(floorId, { dur = 3200 } = {}) {
  const c = FLOOR_CARDS[floorId] || { name: `Floor ${floorId}`, epithet: '' };
  return {
    id: CINE.floorCard(floorId),
    once: false,
    steps: [[
      { t: 'card', kind: 'floor', title: c.name, epithet: c.epithet, tint: c.tint, dur },
      { t: 'stinger', name: 'discovery' },
      { t: 'sfx', key: 'world/portal' },
    ]],
  };
}

export function floorCompleteCard(floorId, { dur = 3000 } = {}) {
  const c = FLOOR_CARDS[floorId] || { name: `Floor ${floorId}`, epithet: '' };
  return {
    id: `floorcomplete:${floorId}`,
    once: false,
    steps: [[
      {
        t: 'card', kind: 'complete', title: c.name,
        epithet: 'mended', tint: c.tint, dur,
      },
      { t: 'stinger', name: 'floor' },
      { t: 'sfx', key: 'world/floor-complete' },
    ]],
  };
}

/** Every builder, by the id prefix the save will store. */
export const BUILDERS = {
  arrival: islandArrival,
  landmark: landmarkApproach,
  rescue: heroFreed,
  challenge: challengeComplete,
  bosslair: bossLairApproach,
  finale,
  floorcard: floorTitleCard,
  floorcomplete: floorCompleteCard,
};

// ───────────────────────────────────────────────────────────────────────────
// THE STAGE — letterbox, cards, fade, skip chip
// ───────────────────────────────────────────────────────────────────────────
/**
 * The 2D furniture, drawn into the host Phaser scene.
 *
 * Duck-typed on purpose: this function calls `scene.add.graphics()` and
 * `scene.add.text()` and nothing else it cannot see, so the module still
 * imports no Phaser and still loads under node --test. Nothing in here runs
 * unless a host actually builds a stage.
 *
 * ── THE BARS ARE PAPER ─────────────────────────────────────────────────────
 * Not black. PAPER.inkTeal, with a torn cream deckle along the inside edge
 * drawn from a fixed sine so it is the same tear every time. The bars close
 * like two sheets sliding over the frame, which is what a papercut film would
 * do if a papercut film existed.
 */
export function createCinematicStage(scene, {
  width = GAME_WIDTH, height = GAME_HEIGHT, depth = 480, onSkip = null,
} = {}) {
  // Fraction of screen height per bar. 0.14 is the house crop; a sequence
  // can ask for more (the boss lair does) through its letterbox beat.
  const BAR_FRAC = 0.14;
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  const fadeG = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);
  const cardG = scene.add.graphics().setDepth(depth + 6).setScrollFactor(0);

  const titleTxt = scene.add.text(width / 2, height * 0.46, '', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '76px', color: PAPER_CSS.inkTeal,
    stroke: PAPER_CSS.cream, strokeThickness: 4,
  }).setOrigin(0.5).setDepth(depth + 7).setScrollFactor(0).setVisible(false);

  const epiTxt = scene.add.text(width / 2, height * 0.46 + 62, '', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '28px', color: PAPER_CSS.tealD,
  }).setOrigin(0.5).setDepth(depth + 7).setScrollFactor(0).setVisible(false);

  // SKIP lives top-right, outside the bars, and is the only interactive thing
  // this stage owns. It is a pointerup on its own small zone — never a
  // document listener, never a preventDefault, because the iOS unlock path in
  // main.js needs real gestures to keep reaching it.
  let skipZone = null, skipBg = null, skipTxt = null;
  if (typeof onSkip === 'function' && scene.add.zone) {
    skipBg = scene.add.graphics().setDepth(depth + 8).setScrollFactor(0).setVisible(false);
    skipTxt = scene.add.text(width - 118, 54, 'SKIP', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '24px', color: PAPER_CSS.inkTeal,
    }).setOrigin(0.5).setDepth(depth + 9).setScrollFactor(0).setVisible(false);
    skipZone = scene.add.zone(width - 118, 54, 168, 66)
      .setDepth(depth + 9).setScrollFactor(0).setVisible(false);
    skipZone.on('pointerup', () => onSkip());
  }

  let boxAmt = 0, fadeAmt = 0, boxFrac = BAR_FRAC;
  let fadeColor = PAPER.cream;

  function drawBars() {
    g.clear();
    if (boxAmt <= 0.001) return;
    const h = Math.round(height * boxFrac) * boxAmt;
    for (const top of [true, false]) {
      const y0 = top ? 0 : height - h;
      g.fillStyle(PAPER.inkTeal, 1);
      g.fillRect(0, y0, width, h);
      // Torn deckle on the inside edge — a fixed 24-step sine, so the tear is
      // identical on every play and the bars never shimmer.
      const edge = top ? y0 + h : y0;
      g.fillStyle(PAPER.cream, 0.5);
      const seg = width / 24;
      for (let i = 0; i < 24; i++) {
        const bump = 2 + Math.sin(i * 1.7 + (top ? 0 : 2.1)) * 1.8;
        g.fillRect(i * seg, top ? edge - bump : edge, seg + 1, bump);
      }
    }
  }

  function drawCard(spec) {
    cardG.clear();
    if (!spec) { titleTxt.setVisible(false); epiTxt.setVisible(false); return; }

    // in 18% / hold 60% / out 22% — long enough to read, short enough that a
    // child who already knows the floor's name is not held hostage by it.
    const p = spec.progress;
    const a = p < 0.18 ? p / 0.18 : p > 0.78 ? Math.max(0, (1 - p) / 0.22) : 1;
    const slide = (1 - ease('quad.out', Math.min(1, p / 0.18))) * 44;

    const cx = width / 2;
    const cy = (spec.kind === 'complete' ? height * 0.40 : height * 0.44) + slide;
    const w = Math.min(width - 200, 900);
    const h = spec.epithet ? 198 : 138;
    const tint = spec.tint || PAPER.gold;

    // Three sheets of paper, each rotated a hair off the last. That tiny
    // misregistration is the entire papercut look — a card with square
    // corners and no offset reads as a web banner.
    const layers = [
      { dx: 10, dy: 14, rot: 0.012, color: PAPER.shadow, alpha: 0.22 * a },
      { dx: -6, dy: -6, rot: -0.014, color: tint, alpha: 0.92 * a },
      { dx: 0, dy: 0, rot: 0.006, color: PAPER.cream, alpha: 0.97 * a },
    ];
    for (const L of layers) {
      cardG.fillStyle(L.color, L.alpha);
      cardG.save();
      cardG.translateCanvas(cx + L.dx, cy + L.dy);
      cardG.rotateCanvas(L.rot);
      cardG.fillRect(-w / 2, -h / 2, w, h);
      cardG.restore();
    }
    // A single gold rule under the name — the one straight line on the card.
    cardG.fillStyle(tint, 0.85 * a);
    cardG.fillRect(cx - w * 0.30, cy + (spec.epithet ? 12 : 34), w * 0.60, 4);

    titleTxt.setVisible(a > 0.02).setAlpha(a).setPosition(cx, cy - (spec.epithet ? 34 : 4))
      .setText(String(spec.title || '').toUpperCase());
    epiTxt.setVisible(!!spec.epithet && a > 0.02).setAlpha(a * 0.95)
      .setPosition(cx, cy + 46).setText(spec.epithet || '');
  }

  function drawFade() {
    fadeG.clear();
    if (fadeAmt <= 0.001) return;
    fadeG.fillStyle(fadeColor, Math.min(1, fadeAmt));
    fadeG.fillRect(0, 0, width, height);
  }

  function showSkip(on) {
    if (!skipZone) return;
    [skipBg, skipTxt, skipZone].forEach((o) => o?.setVisible(on));
    if (on) skipZone.setInteractive(); else skipZone.disableInteractive();
    if (!skipBg) return;
    skipBg.clear();
    if (!on) return;
    skipBg.fillStyle(PAPER.shadow, 0.2);
    skipBg.fillRoundedRect(width - 204, 26, 172, 58, 26);
    skipBg.fillStyle(PAPER.cream, 0.9);
    skipBg.fillRoundedRect(width - 208, 22, 172, 58, 26);
  }

  return {
    /**
     * @param {number} v      0..1, how far the bars are closed
     * @param {object} [opts] `depth` = fraction of screen height per bar,
     *                        clamped to a third so a cinematic can never
     *                        close the frame entirely on a child.
     */
    letterbox(v, opts) {
      boxAmt = Math.max(0, Math.min(1, num(v)));
      if (opts && Number.isFinite(opts.depth)) {
        boxFrac = Math.max(0.05, Math.min(0.33, opts.depth));
      }
      drawBars();
    },
    fade(v, color) {
      fadeAmt = Math.max(0, Math.min(1, num(v)));
      if (Number.isFinite(color)) fadeColor = color;
      drawFade();
    },
    card: drawCard,
    showSkip,
    /** Everything off, immediately. Called on skip, end and scene shutdown. */
    clear() {
      boxAmt = 0; fadeAmt = 0; boxFrac = BAR_FRAC;
      drawBars(); drawFade(); drawCard(null); showSkip(false);
    },
    destroy() {
      [g, fadeG, cardG, titleTxt, epiTxt, skipBg, skipTxt, skipZone]
        .forEach((o) => { try { o?.destroy(); } catch { /* already gone */ } });
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// THE DIRECTOR — one object for OverworldScene to hold
// ───────────────────────────────────────────────────────────────────────────
/**
 * Wraps player + stage + save into the three calls a host actually wants:
 * `play(seq)`, `tick(dtMs)`, `active`.
 *
 * ── WHO WRITES THE CAMERA ──────────────────────────────────────────────────
 * index.js is emphatic that the camera has exactly one writer per frame, and
 * it is right. This director never touches a three.js object. It computes an
 * ABSOLUTE shot and hands it to `deps.setCamera(shot)`, which the host wires
 * to the world's cinematic-camera slot (see the wiring notes at the bottom of
 * this file). When the sequence ends it calls `setCamera(null)` exactly once
 * and the follow boom lerps home on its own.
 *
 * ── THE SAVE ───────────────────────────────────────────────────────────────
 * `play()` refuses a `once` sequence whose id is already in save.overworld.seen
 * and returns false, so a caller can simply fire the trigger every time and
 * let the director decide. The flag is written the moment the cinematic
 * STARTS, not when it finishes — a child who quits the app halfway through the
 * arrival should not be shown it again on relaunch.
 */
export function createCinematicDirector(deps = {}) {
  const {
    scene = null,
    save = null,
    persist = null,            // () => writeSave(save, slot)
    dialogue = null,           // the existing DialogueOverlay instance
    setCamera = null,          // (shot|null) => void
    setInputLocked = null,     // (bool) => void
    resolve = null,            // (anchor) => {x,y,z,yaw}
    hero = null,               // (action) => void   the hero ACTS
    prop = null,               // (action) => void   cages, bridges
    audio: aud = null,         // the audio manager singleton
    reducedMotion = false,
    timeScale = 1,
    onPlay = null,
    onEnd = null,
  } = deps;

  const stage = scene ? createCinematicStage(scene, { onSkip: () => api.skip() }) : null;
  let player = null;
  let boxDepth = 0.14;

  const driver = {
    resolve: (name) => (resolve ? resolve(name) : { x: 0, y: 0, z: 0, yaw: 0 }),
    camera: (s) => { if (setCamera) setCamera(s); },
    cameraRelease: () => { if (setCamera) setCamera(null); },
    letterbox: (v) => stage?.letterbox(v, { depth: boxDepth }),
    fade: (v, c) => stage?.fade(v, c),
    card: (spec) => stage?.card(spec),
    say: (lines) => (dialogue && lines?.length ? dialogue.show(lines) : null),
    endSay: () => { try { dialogue?.hide(); } catch { /* nothing showing */ } },
    hero: (a) => { if (hero) hero(a); },
    prop: (a) => { if (prop) prop(a); },
    sfx: (k) => { try { aud?.play?.(k); } catch { /* audio not up yet */ } },
    stinger: (n) => { try { aud?.playStinger?.(n); } catch { /* ditto */ } },
    music: (k) => { try { aud?.playMusic?.(k); } catch { /* ditto */ } },
    onEnd: (reason) => {
      player = null;
      stage?.clear();
      if (setInputLocked) setInputLocked(false);
      if (onEnd) onEnd(reason);
    },
  };

  const api = {
    get active() { return !!player && player.active; },
    get id() { return player?.id || null; },

    /** Has this one already played for this save? */
    seen(id) { return hasSeenCinematic(save, id); },

    /**
     * Start a sequence. Returns false when it is already-seen, already-running
     * or empty — callers can fire triggers unconditionally.
     */
    play(seq) {
      if (!seq) return false;
      if (player && player.active) return false;
      const compiled = compile(seq, { timeScale, reducedMotion });
      if (!compiled.steps.length) return false;
      if (compiled.once && hasSeenCinematic(save, compiled.id)) return false;

      // Remembered up front: a quit mid-cinematic must not replay it.
      if (compiled.once && markCinematicSeen(save, compiled.id)) {
        try { persist?.(); } catch (err) { console.warn('[cinematics] save failed', err); }
      }

      // Bar depth is authored per sequence (the boss lair crops harder).
      boxDepth = 0.14;
      for (const s of compiled.steps) {
        for (const b of s.beats) if (b.t === 'letterbox' && Number.isFinite(b.depth)) boxDepth = b.depth;
      }

      if (setInputLocked) setInputLocked(true);
      stage?.showSkip(compiled.skippable);
      player = createCinematicPlayer(compiled, driver);
      if (onPlay) onPlay(compiled.id);
      player.start();
      // A one-beat card sequence can finish inside start(); do not leave a
      // dead player behind for tick() to poke at.
      if (player && !player.active) player = null;
      return true;
    },

    tick(dtMs) {
      if (!player) return;
      player.tick(dtMs);
      if (player && !player.active) player = null;
    },

    /** The SKIP chip, the B button, and anything else a child can reach. */
    skip() { player?.skip(); player = null; },

    /** Scene shutdown / context loss. No side effects, no save write. */
    stop() { player?.stop(); player = null; stage?.clear(); },

    destroy() { api.stop(); stage?.destroy(); },
  };

  return api;
}

/**
 * ── WIRING (the host's side; none of it lives in this file) ────────────────
 *
 * src/overworld/index.js — the camera slot. Three lines:
 *
 *   let cineCam = null;                       // beside `let poseCam = null`
 *
 *   // top of updateCamera(), before the poseCam branch:
 *   if (cineCam) {
 *     camera.position.set(cineCam.pos.x, cineCam.pos.y, cineCam.pos.z);
 *     camera.lookAt(cineCam.look.x, cineCam.look.y, cineCam.look.z);
 *     if (Number.isFinite(cineCam.fov)) updateFov(cineCam.fov);
 *     return;
 *   }
 *
 *   // on the `world` object:
 *   setCinematicCamera(shot) { cineCam = shot || null; if (!shot) snapCamera(); },
 *   cinematicActive() { return !!cineCam; },
 *
 * src/scenes/OverworldScene.js:
 *
 *   import { createCinematicDirector, islandArrival, landmarkApproach,
 *            heroFreed, challengeComplete, bossLairApproach, finale,
 *            floorTitleCard, floorCompleteCard, CINE } from '../overworld/cinematics.js';
 *
 *   // after `this.dialogue = new DialogueOverlay(this);`
 *   this._cine = createCinematicDirector({
 *     scene: this, save: this.save, persist: () => writeSave(this.save, this.slot),
 *     dialogue: this.dialogue, audio,
 *     setCamera: (s) => this.app?.setCinematicCamera(s),
 *     setInputLocked: (v) => this.app?.setInputLocked(v),
 *     resolve: (name) => this._cineAnchor(name),
 *     hero: (a) => this.app?.setHeroAction?.(a),
 *     prop: (a) => this.app?.setCinematicProp?.(a),
 *     reducedMotion: !!this.save?.settings?.reducedMotion,
 *   });
 *
 *   // update(): first line of the body
 *   this._cine?.tick((dt || 1 / 60) * 1000);
 *   // and add to the `locked` expression:  || this._cine?.active
 *
 *   // shutdown/destroy:  this._cine?.destroy();
 *
 * TRIGGERS
 *   _boot(), after the first frame reveals:
 *     this._cine.play(islandArrival({ palace: { x: 0, y: 58, z: 0 } }));
 *   proximity check in update() against worldSpec BIOMES centres (~90 m):
 *     this._cine.play(landmarkApproach(floorId, { at: biomeCentre }));
 *   _rescueHero(obj): replace the audio.play + unlock + _say block with
 *     this._cine.play(heroFreed({ heroId: obj.heroId, name: heroDef.name,
 *       at: { x: obj.worldX, y: 0, z: obj.worldZ },
 *       lines: getRescueDialogue(this.floorId, [obj.heroId]),
 *       onFreed: () => { unlockHero(this.save, obj.heroId); writeSave(this.save, this.slot); } }));
 *   _challengeItem(), the `!step.phase2 && step.done` branch: drop the direct
 *     applyFloorTransform() call and hand it to the cinematic instead —
 *     this._cine.play(challengeComplete({ floorId: this.floorId,
 *       at: { x: obj.worldX, y: 0, z: obj.worldZ }, lines: DIALOGUE[p1Key],
 *       onTransform: () => this.app.applyFloorTransform() }));
 *   _interact() case 'boss', before the gate check:
 *     this._cine.play(bossLairApproach({ floorId: this.floorId,
 *       at: { x: obj.worldX, y: 0, z: obj.worldZ }, bossName: … }));
 *   _openFloor(), last line:  this._cine.play(floorTitleCard(floorId));
 *   _finishFloor():           this._cine.play(floorCompleteCard(floorId));
 *   _finishFloor(), floor 9:  this._cine.play(finale({ onDone: () =>
 *                               transitionTo(this, SCENES.ENDING, undefined, 400) }));
 */
