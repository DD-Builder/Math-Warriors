/**
 * Animation state machine for hero sprites.
 *
 * Manages transitions between idle, walk, guard, attack, hit, ko, victory,
 * cast, and selection-sway states. Each state owns the tweens it creates
 * and cleans them up on exit.
 */

import { CharacterRig } from './characterRig.js';
import { WALK_KNIGHT, WALK_WIZARD, WALK_BUNNY } from '../data/characterAnimations.js';

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

// ── IDLE — alive and breathing ──
STATE_DEFS.idle = {
  enter(sm) {
    const { parts, scene, heroClass } = sm;
    if (parts.torso) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.torso,
        scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.04,
        y: -2,
        duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.head) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.head, y: -2, angle: 0.8,
        duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.weapon) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.weapon, angle: 1.5,
        duration: heroClass === 'wizard' ? 2200 : 2800,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.armL) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.armL, y: -1, angle: -1,
        duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.armR) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.armR, y: -1, angle: 1,
        duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        delay: 400,
      }));
    }
    if (heroClass === 'bunny' && parts.legs) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.legs, y: -3,
        duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
  },
};

// ── BREATHE — subtle background breathing for non-active battle heroes ──
STATE_DEFS.breathe = {
  enter(sm) {
    const { parts, scene } = sm;
    if (parts.torso) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.torso,
        scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.015,
        duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.head) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.head, y: -1,
        duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
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

// ── GUARD — class-specific defensive stance ──
STATE_DEFS.guard = {
  enter(sm) {
    const { parts, scene, heroClass } = sm;
    if (heroClass === 'knight') {
      if (parts.armL) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.armL, x: 8, y: -6, angle: -15, duration: 200, ease: 'Back.out',
        }));
      }
      if (parts.weapon) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.weapon, x: 6, y: -4, angle: -20, duration: 200, ease: 'Back.out',
        }));
      }
    } else if (heroClass === 'wizard') {
      if (parts.weapon) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.weapon, x: 10, y: -8, angle: 15, duration: 250, ease: 'Quad.out',
        }));
      }
      const arms = [parts.armL, parts.armR].filter(Boolean);
      arms.forEach(arm => {
        sm._tweens.push(scene.tweens.add({
          targets: arm, y: -5, duration: 250, ease: 'Quad.out',
        }));
      });
    } else {
      if (parts.torso) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.torso, y: 4, scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 0.92,
          duration: 200, ease: 'Quad.out',
        }));
      }
      if (parts.legs) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.legs, y: 4, duration: 200, ease: 'Quad.out',
        }));
      }
      if (parts.head) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.head, y: 2, duration: 200, ease: 'Quad.out',
        }));
      }
    }
    if (parts.torso) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.torso,
        scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.01,
        duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
  },
};

// ── ATTACK — class-aware combat strikes ──
STATE_DEFS.attack = {
  enter(sm, opts = {}) {
    const { parts, scene, heroClass } = sm;
    const subtype = opts.subtype ?? (heroClass === 'wizard' ? 'magic' : heroClass === 'bunny' ? 'kick' : 'slash');
    const duration = opts.duration ?? 350;

    if (subtype === 'slash') {
      const targets = [parts.armR, parts.weapon].filter(Boolean);
      if (targets.length) {
        sm._tweens.push(scene.tweens.add({
          targets, x: 20, y: -14, angle: -30, duration: 100, yoyo: true, ease: 'Back.out',
        }));
      }
      if (parts.torso) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.torso, x: 4, angle: -5, duration: 100, yoyo: true, ease: 'Sine.out',
        }));
      }
    } else if (subtype === 'magic' || subtype === 'cast') {
      const arms = [parts.armL, parts.armR].filter(Boolean);
      if (arms.length) {
        sm._tweens.push(scene.tweens.add({
          targets: arms, y: -12, angle: -10, duration: 150, yoyo: true, ease: 'Quad.out',
        }));
      }
      if (parts.weapon) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.weapon, y: -10,
          scaleX: (parts.weapon._baseScaleX ?? parts.weapon.scaleX) * 1.15,
          scaleY: (parts.weapon._baseScaleY ?? parts.weapon.scaleY) * 1.15,
          duration: 200, yoyo: true, ease: 'Quad.out',
        }));
      }
      if (parts.head) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.head, y: -4, duration: 150, yoyo: true, ease: 'Quad.out',
        }));
      }
    } else if (subtype === 'punch') {
      if (parts.torso) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.torso, x: 16, angle: -8, duration: 80, yoyo: true, repeat: 1, ease: 'Sine.inOut',
        }));
      }
      if (parts.head) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.head, x: 12, duration: 80, yoyo: true, repeat: 1, ease: 'Sine.inOut',
        }));
      }
      if (parts.legs) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.legs, y: -4, duration: 80, yoyo: true, ease: 'Quad.out',
        }));
      }
    } else if (subtype === 'kick') {
      if (parts.legs) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.legs, x: 16, y: -8, angle: 22, duration: 120, yoyo: true, ease: 'Back.out',
        }));
      }
      if (parts.torso) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.torso, x: 6, angle: -10, duration: 120, yoyo: true, ease: 'Sine.inOut',
        }));
      }
      if (parts.head) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.head, x: 8, y: -4, duration: 120, yoyo: true, ease: 'Sine.inOut',
        }));
      }
    } else if (subtype === 'charge') {
      Object.values(parts).forEach(part => {
        sm._tweens.push(scene.tweens.add({
          targets: part,
          scaleX: (part._baseScaleX ?? part.scaleX) * 1.1,
          scaleY: (part._baseScaleY ?? part.scaleY) * 1.1,
          x: 10,
          duration: 200, ease: 'Quad.out',
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

// ── CAST — sustained spell channeling ──
STATE_DEFS.cast = {
  enter(sm) {
    const { parts, scene } = sm;
    const arms = [parts.armL, parts.armR].filter(Boolean);
    arms.forEach(arm => {
      sm._tweens.push(scene.tweens.add({
        targets: arm, y: -14, angle: -10, duration: 300, ease: 'Quad.out',
      }));
    });
    if (parts.weapon) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.weapon, y: -12,
        scaleX: (parts.weapon._baseScaleX ?? parts.weapon.scaleX) * 1.15,
        scaleY: (parts.weapon._baseScaleY ?? parts.weapon.scaleY) * 1.15,
        duration: 400, ease: 'Quad.out',
      }));
      sm._tweens.push(scene.tweens.add({
        targets: parts.weapon, alpha: 0.7, duration: 400,
        yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.head) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.head, y: -6, duration: 300, ease: 'Quad.out',
      }));
    }
    if (parts.torso) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.torso, y: -3,
        scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.04,
        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
  },
};

// ── HIT — flinch backward with flash ──
STATE_DEFS.hit = {
  enter(sm, opts = {}) {
    const { parts, scene } = sm;
    const dur = opts.duration ?? 350;
    Object.values(parts).forEach(part => {
      sm._tweens.push(scene.tweens.add({
        targets: part, x: -8, angle: -3, duration: 80, yoyo: true, ease: 'Sine.out',
      }));
      if (part.setTint) part.setTint(0xff6666);
    });
    sm._returnTimer = scene.time.delayedCall(150, () => {
      Object.values(parts).forEach(part => {
        if (part.clearTint) part.clearTint();
      });
    });
    scene.time.delayedCall(dur, () => {
      if (sm.state === 'hit') sm.transition(sm._returnState || 'idle');
    });
  },
  exit(sm) {
    Object.values(sm.parts).forEach(part => {
      if (part.clearTint) part.clearTint();
    });
    if (sm._returnTimer) {
      sm._returnTimer.remove(false);
      sm._returnTimer = null;
    }
  },
};

// ── KO — collapse ──
STATE_DEFS.ko = {
  enter(sm) {
    const { parts, scene } = sm;
    Object.values(parts).forEach(part => {
      sm._tweens.push(scene.tweens.add({
        targets: part, alpha: 0.35, y: 14, angle: 18, duration: 500, ease: 'Quad.in',
      }));
    });
  },
  exit(sm) {
    Object.values(sm.parts).forEach(part => {
      part.alpha = 1;
      part.y = 0;
      part.angle = 0;
    });
  },
};

// ── VICTORY — celebratory jump ──
STATE_DEFS.victory = {
  enter(sm) {
    const { parts, scene, heroClass } = sm;
    Object.values(parts).forEach(part => {
      sm._tweens.push(scene.tweens.add({
        targets: part, y: -20, duration: 250,
        yoyo: true, repeat: 2, ease: 'Quad.out',
      }));
    });
    if (heroClass === 'bunny') {
      if (parts.head) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.head, angle: -8, y: -16, duration: 300,
          yoyo: true, repeat: 2, ease: 'Back.out',
        }));
      }
      if (parts.torso) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.torso,
          scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.1,
          duration: 250, yoyo: true, repeat: 2, ease: 'Quad.out',
        }));
      }
    } else {
      const arms = [parts.armL, parts.armR].filter(Boolean);
      arms.forEach(arm => {
        sm._tweens.push(scene.tweens.add({
          targets: arm, y: -16, angle: -22, duration: 350, ease: 'Back.out',
        }));
      });
      if (parts.weapon) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.weapon, y: -18, angle: -35, duration: 400, ease: 'Back.out',
        }));
      }
    }
  },
};

// ── SELECTION-SWAY — living display for cards and gallery ──
STATE_DEFS['selection-sway'] = {
  enter(sm) {
    const { parts, scene, heroClass } = sm;

    if (parts.torso) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.torso,
        scaleY: (parts.torso._baseScaleY ?? parts.torso.scaleY) * 1.035,
        y: -2,
        duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }
    if (parts.head) {
      sm._tweens.push(scene.tweens.add({
        targets: parts.head, y: -3, angle: 2,
        duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      }));
    }

    if (heroClass === 'knight') {
      if (parts.weapon) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.weapon, angle: 2, y: -1,
          duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        }));
      }
      if (parts.armL) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.armL, angle: -1.5, y: -1,
          duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        }));
      }
    } else if (heroClass === 'wizard') {
      if (parts.weapon) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.weapon, angle: 3, y: -2,
          duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        }));
      }
      if (parts.armR) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.armR, y: -2, angle: 2,
          duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        }));
      }
    } else {
      if (parts.legs) {
        sm._tweens.push(scene.tweens.add({
          targets: parts.legs, y: -4,
          duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        }));
      }
      if (parts.head) {
        scene.tweens.killTweensOf(parts.head);
        sm._tweens.push(scene.tweens.add({
          targets: parts.head, y: -4, angle: 3,
          duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.inOut',
        }));
      }
    }
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
