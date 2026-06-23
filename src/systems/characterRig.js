/**
 * Skeletal character rig — joint-rotation animation on body-part textures.
 *
 * Body parts are Phaser Images with their origin set to their joint pivot.
 * The rig rotates each part around that pivot and propagates parent-child
 * transforms so the skeleton moves as a connected body:
 *   - Torso rotation carries head, arms, and weapon
 *   - Thigh rotation carries shin (knee follows hip)
 *   - Upper arm rotation carries forearm (elbow follows shoulder)
 *
 * Poses are objects mapping part names to angles (radians).
 * Animations are sequences of keyframed poses with timing.
 */

const DEG_TO_RAD = Math.PI / 180;

// Parent-child chains for forward kinematics.
// Each entry: [parentName, childName]. Order matters — parents first.
const HIERARCHY = [
  // Torso carries upper body
  ['torso', 'head'],
  ['torso', 'upperArmL'],
  ['torso', 'upperArmR'],
  ['torso', 'weapon'],
  // Upper arm carries forearm
  ['upperArmL', 'forearmL'],
  ['upperArmR', 'forearmR'],
  // Thigh carries shin
  ['thighL', 'shinL'],
  ['thighR', 'shinR'],
];

export class CharacterRig {
  /**
   * @param {object} parts — { thighL, shinL, torso, upperArmL, forearmL, ... } Phaser Images
   * @param {Phaser.Scene} scene
   * @param {object} pivots — per-part origin fractions { partName: { x, y } }
   */
  constructor(parts, scene, pivots = null) {
    this.parts = parts;
    this.scene = scene;
    this._tweens = [];
    this._timeline = null;
    this._updateEvent = null;

    this._setPivots(pivots || DEFAULT_PIVOTS);
    this._startPropagation();
  }

  _setPivots(pivots) {
    for (const [name, part] of Object.entries(this.parts)) {
      if (!part || !part.setOrigin) continue;
      const pv = pivots[name] || { x: 0.5, y: 0.5 };
      const oldOx = part.originX, oldOy = part.originY;
      part.setOrigin(pv.x, pv.y);
      part.x += (pv.x - oldOx) * part.displayWidth;
      part.y += (pv.y - oldOy) * part.displayHeight;
      part._baseX = part.x;
      part._baseY = part.y;
    }
  }

  _startPropagation() {
    if (!this.scene || !this.scene.events) return;
    this._updateEvent = () => this.propagate();
    this.scene.events.on('update', this._updateEvent);
  }

  /**
   * Forward kinematics — propagate parent rotations to child positions.
   * Called every frame so children track their parents during tweened animations.
   */
  propagate() {
    const p = this.parts;
    if (!p) return;

    for (let i = 0; i < HIERARCHY.length; i++) {
      const [parentName, childName] = HIERARCHY[i];
      const parent = p[parentName];
      const child = p[childName];
      if (!parent || !child || parent._baseX === undefined || child._baseX === undefined) continue;

      // Cumulative angle: sum of all ancestors' angles up to this parent.
      // For two-level chains (torso → upperArm → forearm), the forearm
      // already got moved when torso → upperArm was processed (earlier in
      // the HIERARCHY array). We only need the DIRECT parent's angle here
      // because the child's _baseX/_baseY offset is relative to root space.
      // However, for the child's position we need to rotate around the
      // parent's CURRENT position (which may have been moved by its own parent).
      const parentAngle = parent.angle * DEG_TO_RAD;
      if (Math.abs(parentAngle) < 0.0005 && parent.x === parent._baseX && parent.y === parent._baseY) {
        // Parent hasn't moved — reset child to base position
        child.x = child._baseX;
        child.y = child._baseY;
        continue;
      }

      // Vector from parent's pivot to child's rest position (in root space)
      const dx = child._baseX - parent._baseX;
      const dy = child._baseY - parent._baseY;

      // Rotate that vector by the parent's angle
      const cos = Math.cos(parentAngle);
      const sin = Math.sin(parentAngle);
      const rotX = dx * cos - dy * sin;
      const rotY = dx * sin + dy * cos;

      // Child's new position: parent's CURRENT position + rotated offset
      child.x = parent.x + rotX;
      child.y = parent.y + rotY;
    }
  }

  setPose(pose) {
    const p = this.parts;
    if (pose.thighL !== undefined && p.thighL) p.thighL.angle = rad2deg(pose.thighL);
    if (pose.shinL  !== undefined && p.shinL)  p.shinL.angle  = rad2deg(pose.shinL);
    if (pose.thighR !== undefined && p.thighR) p.thighR.angle = rad2deg(pose.thighR);
    if (pose.shinR  !== undefined && p.shinR)  p.shinR.angle  = rad2deg(pose.shinR);
    if (pose.leftLeg !== undefined && p.thighL && pose.thighL === undefined) p.thighL.angle = rad2deg(pose.leftLeg);
    if (pose.rightLeg !== undefined && p.thighR && pose.thighR === undefined) p.thighR.angle = rad2deg(pose.rightLeg);
    if (pose.leftLeg  !== undefined && p.leftLeg && !p.thighL)  p.leftLeg.angle  = rad2deg(pose.leftLeg);
    if (pose.rightLeg !== undefined && p.rightLeg && !p.thighR) p.rightLeg.angle = rad2deg(pose.rightLeg);
    if (p.legs && !p.leftLeg && !p.rightLeg && !p.thighL && !p.thighR) {
      const lAngle = pose.leftLeg ?? pose.thighL ?? 0;
      const rAngle = pose.rightLeg ?? pose.thighR ?? 0;
      p.legs.angle = rad2deg((lAngle - rAngle) * 0.5);
      const strideSpread = Math.abs(lAngle - rAngle);
      p.legs.y = (p.legs._baseY ?? 0) + strideSpread * 18;
    }
    if (pose.torso !== undefined && p.torso) p.torso.angle = rad2deg(pose.torso);
    if (pose.upperArmL !== undefined && p.upperArmL) p.upperArmL.angle = rad2deg(pose.upperArmL);
    if (pose.forearmL  !== undefined && p.forearmL)  p.forearmL.angle  = rad2deg(pose.forearmL);
    if (pose.upperArmR !== undefined && p.upperArmR) p.upperArmR.angle = rad2deg(pose.upperArmR);
    if (pose.forearmR  !== undefined && p.forearmR)  p.forearmR.angle  = rad2deg(pose.forearmR);
    if (pose.armL !== undefined && p.upperArmL && pose.upperArmL === undefined) p.upperArmL.angle = rad2deg(pose.armL);
    if (pose.armR !== undefined && p.upperArmR && pose.upperArmR === undefined) p.upperArmR.angle = rad2deg(pose.armR);
    if (pose.armL !== undefined && p.armL && !p.upperArmL) p.armL.angle = rad2deg(pose.armL);
    if (pose.armR !== undefined && p.armR && !p.upperArmR) p.armR.angle = rad2deg(pose.armR);
    if (pose.weapon !== undefined && p.weapon) p.weapon.angle = rad2deg(pose.weapon);
    if (pose.head   !== undefined && p.head)   p.head.angle   = rad2deg(pose.head);

    this.propagate();
  }

  tweenToPose(pose, duration = 300, ease = 'Sine.inOut') {
    this.stopAll();
    const p = this.parts;
    const allKeys = [
      'thighL', 'shinL', 'thighR', 'shinR',
      'leftLeg', 'rightLeg',
      'torso',
      'upperArmL', 'forearmL', 'upperArmR', 'forearmR',
      'armL', 'armR',
      'weapon', 'head',
    ];
    for (const key of allKeys) {
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
    // Unified legs fallback
    if (p.legs && !p.leftLeg && !p.rightLeg && !p.thighL && !p.thighR) {
      const lAngle = pose.leftLeg ?? pose.thighL ?? 0;
      const rAngle = pose.rightLeg ?? pose.thighR ?? 0;
      const strideSpread = Math.abs(lAngle - rAngle);
      this._tweens.push(this.scene.tweens.add({
        targets: p.legs,
        angle: rad2deg((lAngle - rAngle) * 0.5),
        y: (p.legs._baseY ?? 0) + strideSpread * 18,
        duration,
        ease,
      }));
    }
  }

  playAnimation(anim, onComplete) {
    this.stopAll();
    if (!anim || !anim.keyframes || anim.keyframes.length < 2) return;

    const totalDur = anim.duration || 400;
    const p = this.parts;
    const hasUnifiedLegs = p.legs && !p.leftLeg && !p.rightLeg && !p.thighL && !p.thighR;
    // Map legacy pose keys to articulated part names
    const LEGACY_MAP = {
      leftLeg: p.thighL ? 'thighL' : (p.leftLeg ? 'leftLeg' : null),
      rightLeg: p.thighR ? 'thighR' : (p.rightLeg ? 'rightLeg' : null),
      armL: p.upperArmL ? 'upperArmL' : (p.armL ? 'armL' : null),
      armR: p.upperArmR ? 'upperArmR' : (p.armR ? 'armR' : null),
    };
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
        const ease = anim.ease || 'Sine.inOut';

        const keys = Object.keys(curr.pose);
        for (const key of keys) {
          if (hasUnifiedLegs && (key === 'leftLeg' || key === 'rightLeg')) continue;
          const mappedKey = LEGACY_MAP[key] || key;
          const part = p[mappedKey];
          if (!part) continue;

          const tw = this.scene.tweens.add({
            targets: part,
            angle: rad2deg(curr.pose[key] ?? 0),
            duration: segDur,
            delay: segStart,
            ease,
          });
          this._tweens.push(tw);
        }

        // Unified legs: blend leftLeg/rightLeg into single part
        if (hasUnifiedLegs && (curr.pose.leftLeg !== undefined || curr.pose.rightLeg !== undefined)) {
          const lA = curr.pose.leftLeg ?? 0;
          const rA = curr.pose.rightLeg ?? 0;
          const spread = Math.abs(lA - rA);
          this._tweens.push(this.scene.tweens.add({
            targets: p.legs,
            angle: rad2deg((lA - rA) * 0.5),
            y: (p.legs._baseY ?? 0) + spread * 18,
            duration: segDur,
            delay: segStart,
            ease,
          }));
        }
      }

      if (anim.loop) {
        const timer = this.scene.time.delayedCall(totalDur, () => {
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
    const keys = [
      'thighL', 'shinL', 'thighR', 'shinR',
      'leftLeg', 'rightLeg', 'legs',
      'torso',
      'upperArmL', 'forearmL', 'upperArmR', 'forearmR',
      'armL', 'armR',
      'weapon', 'head',
    ];
    for (const key of keys) {
      if (!this.parts[key]) continue;
      this.parts[key].angle = 0;
      this.parts[key].x = this.parts[key]._baseX ?? this.parts[key].x;
      this.parts[key].y = this.parts[key]._baseY ?? this.parts[key].y;
    }
  }

  destroy() {
    this.stopAll();
    if (this.scene && this.scene.events && this._updateEvent) {
      this.scene.events.off('update', this._updateEvent);
    }
    this._updateEvent = null;
    this.parts = null;
    this.scene = null;
  }
}

function rad2deg(r) { return r * (180 / Math.PI); }

// Fallback pivots when no art geometry is supplied. Y fractions are in
// full-canvas space (the hero occupies roughly the middle 60% of the
// canvas, feet near 0.85, head top near 0.15).
const DEFAULT_PIVOTS = {
  // Articulated legs
  thighL:   { x: 0.5, y: 0.15 },  // hip (top of thigh)
  shinL:    { x: 0.5, y: 0.10 },  // knee (top of shin)
  thighR:   { x: 0.5, y: 0.15 },  // hip (top of thigh)
  shinR:    { x: 0.5, y: 0.10 },  // knee (top of shin)
  // Legacy leg pivots
  leftLeg:  { x: 0.5, y: 0.62 },  // hip
  rightLeg: { x: 0.5, y: 0.62 },  // hip
  legs:     { x: 0.5, y: 0.62 },  // hip (unified)
  torso:    { x: 0.5, y: 0.58 },  // waist
  // Articulated arms
  upperArmL: { x: 0.5, y: 0.15 }, // shoulder (top of upper arm)
  forearmL:  { x: 0.5, y: 0.10 }, // elbow (top of forearm)
  upperArmR: { x: 0.5, y: 0.15 }, // shoulder (top of upper arm)
  forearmR:  { x: 0.5, y: 0.10 }, // elbow (top of forearm)
  // Legacy arm pivots
  armL:     { x: 0.5, y: 0.42 },  // shoulder
  armR:     { x: 0.5, y: 0.42 },  // shoulder
  weapon:   { x: 0.5, y: 0.48 },  // grip (hand height)
  head:     { x: 0.5, y: 0.33 },  // neck
};
