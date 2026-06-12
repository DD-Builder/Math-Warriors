/**
 * Skeletal character rig — joint-rotation animation on body-part textures.
 *
 * Each hero's 7 body parts (leftLeg, rightLeg, torso, armL, armR, weapon,
 * head) are Phaser Images with their origin set to their joint pivot.
 * The rig rotates each part around that pivot to produce articulated
 * movement: walking gaits, sword swings, casting poses, etc.
 *
 * Poses are objects mapping part names to angles (radians).
 * Animations are sequences of keyframed poses with timing.
 */

export class CharacterRig {
  /**
   * @param {object} parts — { leftLeg, rightLeg, torso, armL, armR, weapon, head } Phaser Images
   * @param {Phaser.Scene} scene
   * @param {object} pivots — per-part origin fractions { partName: { x, y } },
   *   computed from the hero's art geometry so rotation happens at the
   *   actual joint (hip/shoulder/neck/waist/grip), not an arbitrary point.
   */
  constructor(parts, scene, pivots = null) {
    this.parts = parts;
    this.scene = scene;
    this._tweens = [];
    this._timeline = null;

    this._setPivots(pivots || DEFAULT_PIVOTS);
  }

  _setPivots(pivots) {
    // CRITICAL: a Phaser Image's (x, y) is the position of its ORIGIN.
    // Changing the origin without compensating the position shifts the
    // texture on screen — which scattered hero parts all over the place.
    // So: change origin, then move the image so its texture stays put.
    for (const [name, part] of Object.entries(this.parts)) {
      if (!part || !part.setOrigin) continue;
      const pv = pivots[name] || { x: 0.5, y: 0.5 };
      const oldOx = part.originX, oldOy = part.originY;
      part.setOrigin(pv.x, pv.y);
      part.x += (pv.x - oldOx) * part.displayWidth;
      part.y += (pv.y - oldOy) * part.displayHeight;
      // Base position: where the part rests with no animation applied.
      // State-machine resets must return here, NOT to (0, 0).
      part._baseX = part.x;
      part._baseY = part.y;
    }
  }

  setPose(pose) {
    const p = this.parts;
    if (pose.leftLeg  !== undefined && p.leftLeg)  p.leftLeg.angle  = rad2deg(pose.leftLeg);
    if (pose.rightLeg !== undefined && p.rightLeg) p.rightLeg.angle = rad2deg(pose.rightLeg);
    if (pose.torso    !== undefined && p.torso)    p.torso.angle    = rad2deg(pose.torso);
    if (pose.armL     !== undefined && p.armL)     p.armL.angle     = rad2deg(pose.armL);
    if (pose.armR     !== undefined && p.armR)     p.armR.angle     = rad2deg(pose.armR);
    if (pose.weapon   !== undefined && p.weapon)   p.weapon.angle   = rad2deg(pose.weapon);
    if (pose.head     !== undefined && p.head)     p.head.angle     = rad2deg(pose.head);
  }

  tweenToPose(pose, duration = 300, ease = 'Sine.inOut') {
    this.stopAll();
    const p = this.parts;
    const keys = ['leftLeg', 'rightLeg', 'torso', 'armL', 'armR', 'weapon', 'head'];
    for (const key of keys) {
      if (pose[key] !== undefined && p[key]) {
        const t = this.scene.tweens.add({
          targets: p[key],
          angle: rad2deg(pose[key]),
          duration,
          ease,
        });
        this._tweens.push(t);
      }
    }
  }

  playAnimation(anim, onComplete) {
    this.stopAll();
    if (!anim || !anim.keyframes || anim.keyframes.length < 2) return;

    const totalDur = anim.duration || 400;
    let loopCount = 0;
    const maxLoops = anim.loop ? 9999 : 1;

    const runCycle = () => {
      if (loopCount >= maxLoops) {
        if (onComplete) onComplete();
        return;
      }
      loopCount++;

      const kf = anim.keyframes;
      for (let i = 1; i < kf.length; i++) {
        const prev = kf[i - 1];
        const curr = kf[i];
        const segStart = prev.t * totalDur;
        const segDur = (curr.t - prev.t) * totalDur;

        const keys = Object.keys(curr.pose);
        for (const key of keys) {
          const part = this.parts[key];
          if (!part) continue;

          const startAngle = rad2deg(prev.pose[key] ?? 0);
          const endAngle = rad2deg(curr.pose[key] ?? 0);

          const tw = this.scene.tweens.add({
            targets: part,
            angle: endAngle,
            duration: segDur,
            delay: segStart + (loopCount > 1 ? 0 : 0),
            ease: anim.ease || 'Sine.inOut',
          });
          this._tweens.push(tw);
        }
      }

      // Schedule next cycle
      if (anim.loop) {
        const timer = this.scene.time.delayedCall(totalDur, () => {
          // Reset to frame 0 pose before next cycle
          if (kf[0]?.pose) this.setPose(kf[0].pose);
          runCycle();
        });
        this._tweens.push(timer);
      } else {
        this.scene.time.delayedCall(totalDur, () => {
          if (onComplete) onComplete();
        });
      }
    };

    // Set initial pose
    if (anim.keyframes[0]?.pose) this.setPose(anim.keyframes[0].pose);
    runCycle();
  }

  stopAll() {
    for (const t of this._tweens) {
      if (t && t.stop) t.stop();
      else if (t && t.remove) t.remove(false);
    }
    this._tweens = [];
  }

  resetPose() {
    this.stopAll();
    const keys = ['leftLeg', 'rightLeg', 'torso', 'armL', 'armR', 'weapon', 'head'];
    for (const key of keys) {
      if (this.parts[key]) this.parts[key].angle = 0;
    }
  }

  destroy() {
    this.stopAll();
    this.parts = null;
    this.scene = null;
  }
}

function rad2deg(r) { return r * (180 / Math.PI); }

// Fallback pivots when no art geometry is supplied. Y fractions are in
// full-canvas space (the hero occupies roughly the middle 60% of the
// canvas, feet near 0.85, head top near 0.15).
const DEFAULT_PIVOTS = {
  leftLeg:  { x: 0.5, y: 0.62 },  // hip
  rightLeg: { x: 0.5, y: 0.62 },  // hip
  torso:    { x: 0.5, y: 0.58 },  // waist
  armL:     { x: 0.5, y: 0.42 },  // shoulder
  armR:     { x: 0.5, y: 0.42 },  // shoulder
  weapon:   { x: 0.5, y: 0.48 },  // grip (hand height)
  head:     { x: 0.5, y: 0.33 },  // neck
};
