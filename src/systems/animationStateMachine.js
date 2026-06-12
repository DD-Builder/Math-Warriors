/**
 * Animation state machine for hero sprites.
 *
 * Manages transitions between idle, walk, guard, attack, hit, ko, victory,
 * cast, and selection-sway states. Each state drives a CharacterRig
 * (joint-rotation animation) when available, falling back to raw tweens.
 */

import {
  WALK_CYCLE, IDLE_BREATHE, SELECTION_SWAY,
  KNIGHT_SLASH, WIZARD_CAST, BUNNY_PUNCH,
  GUARD_STANCE, HIT_FLINCH, KO_COLLAPSE, VICTORY_CHEER,
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

// ──────────────────────────────────────────────────────────────
// IDLE — subtle breathing, weapon micro-sway
// ──────────────────────────────────────────────────────────────
STATE_DEFS.idle = {
  enter(sm) {
    if (sm.rig) {
      sm.rig.playAnimation(IDLE_BREATHE);
    }
  },
};

// ──────────────────────────────────────────────────────────────
// BREATHE — like idle but even subtler (for non-active heroes in battle)
// ──────────────────────────────────────────────────────────────
STATE_DEFS.breathe = {
  enter(sm) {
    const { parts, scene } = sm;
    if (parts.torso) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.torso, scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.015, duration: 2600,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
  },
};

// ──────────────────────────────────────────────────────────────
// WALK — legs pump, arms counter-swing, torso/head bob
// ──────────────────────────────────────────────────────────────
STATE_DEFS.walk = {
  enter(sm) {
    if (sm.rig) {
      sm.rig.playAnimation(WALK_CYCLE);
    }
  },
};

// ──────────────────────────────────────────────────────────────
// GUARD — class-specific defensive stance
// ──────────────────────────────────────────────────────────────
STATE_DEFS.guard = {
  enter(sm) {
    if (sm.rig) sm.rig.playAnimation(GUARD_STANCE);
  },
};

// ──────────────────────────────────────────────────────────────
// ATTACK — subtype-driven: 'slash', 'magic', 'punch', or heroId-specific
// Returns to previous state via _returnState after the attack duration.
// ──────────────────────────────────────────────────────────────
STATE_DEFS.attack = {
  enter(sm, opts = {}) {
    const { parts, scene, heroClass } = sm;
    const subtype = opts.subtype ?? (heroClass === 'wizard' ? 'magic' : heroClass === 'bunny' ? 'punch' : 'slash');
    const duration = opts.duration ?? 300;

    if (sm.rig) {
      const animMap = { slash: KNIGHT_SLASH, magic: WIZARD_CAST, cast: WIZARD_CAST, punch: BUNNY_PUNCH, kick: BUNNY_PUNCH };
      const anim = animMap[subtype] || KNIGHT_SLASH;
      sm.rig.playAnimation(anim);
    } else if (subtype === 'slash') {
      const targets = [parts.armR, parts.weapon].filter(Boolean);
      if (targets.length) {
        sm._tweens.push(scene.tweens.add({
          targets, x: 18, y: -12, angle: -25, duration: 100,
          yoyo: true, ease: 'Back.out',
        }));
      }
      if (parts.legs) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.legs, y: -3, duration: 80, yoyo: true, ease: 'Quad.out',
        }));
      }
    } else if (subtype === 'kick') {
      if (parts.legs) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.legs, x: 12, y: -6, angle: 20, duration: 120,
          yoyo: true, ease: 'Back.out',
        }));
      }
      if (parts.torso) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.torso, angle: -8, duration: 120, yoyo: true, ease: 'Sine.inOut',
        }));
      }
    } else if (subtype === 'charge') {
      Object.values(parts).forEach(part => {
        sm._tweens.push(scene.tweens.add({
          targets: part, scaleX: (part._baseScaleX ?? part.scaleX) * 1.08, scaleY: (part._baseScaleY ?? part.scaleY) * 1.08, duration: 200, ease: 'Quad.out',
        }));
      });
    }

    sm._returnTimer = scene.time.delayedCall(duration, () => {
      if (sm.state === 'attack') {
        sm.transition(sm._returnState || 'idle');
      }
    });
  },
  exit(sm) {
    if (sm._returnTimer) {
      sm._returnTimer.remove(false);
      sm._returnTimer = null;
    }
  },
};

// ──────────────────────────────────────────────────────────────
// CAST — arms raised, weapon glows, sustained until cancelled
// ──────────────────────────────────────────────────────────────
STATE_DEFS.cast = {
  enter(sm) {
    const { parts, scene } = sm;
    const arms = [parts.armL, parts.armR].filter(Boolean);
    arms.forEach(arm => {
      sm._tweens.push(scene.tweens.add({
        targets: arm, y: -12, duration: 300, ease: 'Quad.out',
      }));
    });
    if (parts.weapon) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.weapon, y: -10, scaleX: (parts.weapon._baseScaleX ?? parts.weapon.scaleX) * 1.15, scaleY: (parts.weapon._baseScaleY ?? parts.weapon.scaleY) * 1.15,
        duration: 400, ease: 'Quad.out',
      }));
      sm._tweens.push(scene.tweens.add({
        targets: parts.weapon, alpha: 0.7, duration: 400,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
  },
};

// ──────────────────────────────────────────────────────────────
// HIT — flinch backward, brief red tint (on parts, not whole sprite)
// ──────────────────────────────────────────────────────────────
STATE_DEFS.hit = {
  enter(sm, opts = {}) {
    const { parts, scene } = sm;
    const dur = opts.duration ?? 350;
    if (sm.rig) sm.rig.playAnimation(HIT_FLINCH);
    Object.values(parts).forEach(part => {
      if (part && part.setTint) part.setTint(0xff6666);
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
    Object.values(sm.parts).forEach(part => {
      if (part && part.clearTint) part.clearTint();
    });
    if (sm._returnTimer) {
      sm._returnTimer.remove(false);
      sm._returnTimer = null;
    }
  },
};

// ──────────────────────────────────────────────────────────────
// KO — slump / fall
// ──────────────────────────────────────────────────────────────
STATE_DEFS.ko = {
  enter(sm) {
    if (sm.rig) {
      sm.rig.playAnimation(KO_COLLAPSE);
      Object.values(sm.parts).forEach(part => {
        if (part) sm.scene.tweens.add({ targets: part, alpha: 0.4, duration: 500, ease: 'Quad.in' });
      });
    }
  },
  exit(sm) {
    if (sm.rig) sm.rig.resetPose();
    Object.values(sm.parts).forEach(part => {
      if (!part) return;
      part.alpha = 1;
      part.y = 0;
      part.angle = 0;
    });
  },
};

// ──────────────────────────────────────────────────────────────
// VICTORY — jump + arm raise
// ──────────────────────────────────────────────────────────────
STATE_DEFS.victory = {
  enter(sm) {
    if (sm.rig) sm.rig.playAnimation(VICTORY_CHEER);
  },
};

// ──────────────────────────────────────────────────────────────
// SELECTION-SWAY — gentle rocking for party select / gallery
// ──────────────────────────────────────────────────────────────
STATE_DEFS['selection-sway'] = {
  enter(sm) {
    if (sm.rig) sm.rig.playAnimation(SELECTION_SWAY);
  },
};

// ──────────────────────────────────────────────────────────────
// STATE MACHINE CLASS
// ──────────────────────────────────────────────────────────────

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
      part.x = 0;
      part.y = 0;
      part.angle = 0;
      part.scaleX = part._baseScaleX ?? part.scaleX;
      part.scaleY = part._baseScaleY ?? part.scaleY;
      part.alpha = 1;
    });
  }

  destroy() {
    this._exitCurrent();
    this.parts = null;
    this.scene = null;
  }
}

export { VALID_TRANSITIONS, STATE_DEFS };
