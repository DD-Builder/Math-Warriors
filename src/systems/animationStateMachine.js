/**
 * Animation state machine for hero sprites.
 *
 * Manages transitions between idle, walk, guard, attack, hit, ko, victory,
 * cast, and selection-sway states. Each state owns the tweens it creates
 * and cleans them up on exit.
 */

import { CharacterRig } from './characterRig.js';
import {
  WALK_KNIGHT, WALK_WIZARD, WALK_BUNNY,
  IDLE_KNIGHT, IDLE_WIZARD, IDLE_BUNNY,
  KNIGHT_SLASH, WIZARD_CAST, BUNNY_PUNCH,
  GUARD_KNIGHT, HIT_FLINCH, KO_COLLAPSE, VICTORY_CHEER, SELECTION_SWAY,
} from '../data/characterAnimations.js';

const VALID_TRANSITIONS = {
  idle:      ['walk', 'guard', 'attack', 'hit', 'ko', 'victory', 'cast', 'selection-sway', 'breathe'],
  walk:      ['idle', 'hit', 'ko', 'attack', 'guard', 'selection-sway'],
  breathe:   ['idle', 'walk', 'guard', 'attack', 'hit', 'ko', 'victory', 'cast', 'selection-sway'],
  guard:     ['idle', 'hit', 'ko', 'attack', 'victory'],
  attack:    ['idle', 'guard', 'hit', 'ko'],
  hit:       ['idle', 'guard', 'ko'],
  ko:        ['victory', 'idle'],
  victory:   ['idle'],
  cast:      ['idle', 'guard', 'hit', 'ko'],
  'selection-sway': ['idle', 'walk', 'attack'],
};

const STATE_DEFS = {};

// ── IDLE — alive and breathing (rig-driven keyframe animation) ──
STATE_DEFS.idle = {
  enter(sm) {
    const idleAnim = sm.heroClass === 'wizard' ? IDLE_WIZARD
                   : sm.heroClass === 'bunny'  ? IDLE_BUNNY
                   : IDLE_KNIGHT;
    sm.rig.playAnimation(idleAnim);
  },
  exit(sm) {
    sm.rig.resetPose();
  },
};

// ── BREATHE — subtle background breathing for non-active battle heroes ──
STATE_DEFS.breathe = {
  enter(sm) {
    const idleAnim = sm.heroClass === 'wizard' ? IDLE_WIZARD
                   : sm.heroClass === 'bunny'  ? IDLE_BUNNY
                   : IDLE_KNIGHT;
    sm.rig.playAnimation(idleAnim);
  },
  exit(sm) {
    sm.rig.resetPose();
  },
};

// ── WALK — skeletal stride cycle driven by biomechanical keyframes ──
STATE_DEFS.walk = {
  enter(sm) {
    const walkAnim = sm.heroClass === 'wizard' ? WALK_WIZARD
                   : sm.heroClass === 'bunny'  ? WALK_BUNNY
                   : WALK_KNIGHT;
    sm.rig.playAnimation(walkAnim);
  },
  exit(sm) {
    sm.rig.resetPose();
  },
};

// ── GUARD — rig-driven defensive stance ──
STATE_DEFS.guard = {
  enter(sm) {
    sm.rig.playAnimation(GUARD_KNIGHT);
  },
  exit(sm) {
    sm.rig.resetPose();
  },
};

// ── ATTACK — rig-driven class-aware combat strikes ──
STATE_DEFS.attack = {
  enter(sm, opts = {}) {
    const { scene, heroClass } = sm;
    const subtype = opts.subtype ?? (heroClass === 'wizard' ? 'magic' : heroClass === 'bunny' ? 'kick' : 'slash');
    const duration = opts.duration ?? 350;

    const attackAnim = (subtype === 'magic' || subtype === 'cast') ? WIZARD_CAST
                     : (subtype === 'punch' || subtype === 'kick') ? BUNNY_PUNCH
                     : KNIGHT_SLASH;

    sm.rig.playAnimation(attackAnim, () => {
      if (sm.state === 'attack') {
        sm.transition(sm._returnState || 'idle');
      }
    });

    sm._returnTimer = scene.time.delayedCall(Math.max(duration, attackAnim.duration + 50), () => {
      if (sm.state === 'attack') {
        sm.transition(sm._returnState || 'idle');
      }
    });
  },
  exit(sm) {
    sm.rig.resetPose();
    if (sm._returnTimer) {
      sm._returnTimer.remove(false);
      sm._returnTimer = null;
    }
  },
};

// ── CAST — rig-driven spell channeling ──
STATE_DEFS.cast = {
  enter(sm) {
    sm.rig.playAnimation(WIZARD_CAST);
  },
};

// ── HIT — rig-driven flinch with flash ──
STATE_DEFS.hit = {
  enter(sm, opts = {}) {
    const { parts, scene } = sm;
    const dur = opts.duration ?? 350;
    Object.values(parts).forEach(part => {
      if (part && part.setTint) part.setTint(0xff6666);
    });
    sm.rig.playAnimation(HIT_FLINCH, () => {
      if (sm.state === 'hit') sm.transition(sm._returnState || 'idle');
    });
    sm._returnTimer = scene.time.delayedCall(150, () => {
      Object.values(parts).forEach(part => {
        if (part && part.clearTint) part.clearTint();
      });
    });
    scene.time.delayedCall(dur, () => {
      if (sm.state === 'hit') sm.transition(sm._returnState || 'idle');
    });
  },
  exit(sm) {
    sm.rig.resetPose();
    Object.values(sm.parts).forEach(part => {
      if (part && part.clearTint) part.clearTint();
    });
    if (sm._returnTimer) {
      sm._returnTimer.remove(false);
      sm._returnTimer = null;
    }
  },
};

// ── KO — rig-driven staged collapse ──
STATE_DEFS.ko = {
  enter(sm) {
    const { parts } = sm;
    sm.rig.playAnimation(KO_COLLAPSE);
    Object.values(parts).forEach(part => {
      if (part) {
        sm._tweens.push(sm.scene.tweens.add({
          targets: part, alpha: 0.35, duration: 600, ease: 'Quad.in',
        }));
      }
    });
  },
  exit(sm) {
    sm.rig.resetPose();
    Object.values(sm.parts).forEach(part => {
      if (part) part.alpha = 1;
    });
  },
};

// ── VICTORY — rig-driven celebration ──
STATE_DEFS.victory = {
  enter(sm) {
    sm.rig.playAnimation(VICTORY_CHEER);
  },
  exit(sm) {
    sm.rig.resetPose();
  },
};

// ── SELECTION-SWAY — rig-driven living display for cards and gallery ──
STATE_DEFS['selection-sway'] = {
  enter(sm) {
    sm.rig.playAnimation(SELECTION_SWAY);
  },
  exit(sm) {
    sm.rig.resetPose();
  },
};

// ── STATE MACHINE CLASS ──

export class HeroAnimationSM {
  constructor(parts, scene, heroClass, heroId) {
    this.parts = parts;
    this.scene = scene;
    this.heroClass = heroClass;
    this.heroId = heroId;
    this.state = null;
    this._tweens = [];
    this._returnState = 'idle';
    this._returnTimer = null;
    this.visualMods = {};
    this.rig = new CharacterRig(parts, scene);
  }

  transition(toState, opts = {}) {
    if (toState === this.state) return false;
    if (this.state && VALID_TRANSITIONS[this.state] && !VALID_TRANSITIONS[this.state].includes(toState)) {
      return false;
    }
    if (this.state !== 'attack' && this.state !== 'hit' && this.state !== 'cast') {
      this._returnState = this.state || 'idle';
    }
    this._exitCurrent();
    this.state = toState;
    const def = STATE_DEFS[toState];
    if (def && def.enter) def.enter(this, opts);
    return true;
  }

  _exitCurrent() {
    this._tweens.forEach(t => {
      if (t && t.isPlaying && t.isPlaying()) t.stop();
      else if (t && t.stop) t.stop();
    });
    this._tweens = [];
    this._resetParts();
    const def = STATE_DEFS[this.state];
    if (def && def.exit) def.exit(this);
  }

  _resetParts() {
    if (!this.parts) return;
    Object.values(this.parts).forEach(part => {
      if (!part) return;
      if (this.scene && this.scene.tweens) this.scene.tweens.killTweensOf(part);
      part.x = part._baseX ?? 0;
      part.y = part._baseY ?? 0;
      part.angle = 0;
      part.scaleX = part._baseScaleX ?? part.scaleX;
      part.scaleY = part._baseScaleY ?? part.scaleY;
      part.alpha = 1;
    });
  }

  destroy() {
    this._exitCurrent();
    if (this.rig) { this.rig.destroy(); this.rig = null; }
    this.parts = null;
    this.scene = null;
  }
}

export { VALID_TRANSITIONS, STATE_DEFS };
