/**
 * Ability VFX — a visual for every enemy ability.
 *
 * v1 enemy abilities were stat mutations plus a text toast: forty-five
 * invisible powers. This module gives each one a papercut visual from
 * a six-word vocabulary, played from ONE choke point (invokeAbility
 * hooks the moment an ability announces itself via showToast):
 *
 *   buffSelf   — amber chevrons rise off the enemy, body swells
 *   debuffHero — a violet wisp streaks from enemy to hero
 *   trick      — paper '?' cards spin around the enemy (answer tampering)
 *   strike     — shards burst outward with a camera bump (party damage)
 *   heal       — soft green pluses drift up, body brightens
 *   drain      — gold motes arc FROM the hero TO the enemy
 *
 * Everything is defensive: no sprite, no scene, no tweens → no-op,
 * because abilities also run in unit tests with stub scenes.
 */

import { BATTLE_DEPTH } from '../ui/depths.js';

/** Category per ability id (kept exhaustive by abilityVfx.test.js). */
export const ABILITY_VFX = {
  // grow-stronger abilities
  sporulate: 'buffSelf', accumulate: 'buffSelf', pressure: 'buffSelf',
  spin_up: 'buffSelf', clap_charge: 'buffSelf', thunder_mul: 'buffSelf',
  mass_matters: 'buffSelf', abs_reduction: 'buffSelf', shell_split: 'buffSelf',
  crown_tally: 'buffSelf', core_divide: 'buffSelf', op_shift: 'buffSelf',
  levy: 'buffSelf', price_hike: 'buffSelf', interest: 'buffSelf',
  light_split: 'buffSelf', shape_shift: 'buffSelf', the_unknown: 'buffSelf',
  ice_armor: 'buffSelf', reversal: 'buffSelf',
  // weaken-the-hero abilities
  chill_snap: 'debuffHero', freeze_ray: 'debuffHero', phase_lock: 'debuffHero',
  deep_freeze: 'debuffHero',
  // answer-tampering sleight of hand
  consume: 'trick', ink_cloud: 'trick', geo_lock: 'trick',
  fake_coins: 'trick', smudge: 'trick', silence: 'trick', riddle_me: 'trick',
  // party-wide damage
  volley: 'strike', split_tongue: 'strike', shard_volley: 'strike',
  blizzard: 'strike', crystal_burst: 'strike', mirror_shield: 'strike',
  // self-healing
  sweet_add: 'heal', ash_divide: 'heal', flip_page: 'heal',
  page_turn: 'heal', refract: 'heal',
  // life/strength theft
  drain_current: 'drain', sting_drain: 'drain', steal_gold: 'drain',
};

export const VFX_CATEGORIES = ['buffSelf', 'debuffHero', 'trick', 'strike', 'heal', 'drain'];

export function abilityVfxCategory(abilityId) {
  return ABILITY_VFX[abilityId] || 'buffSelf';
}

function enemyBodyOf(scene, enemy) {
  const idx = scene.enemies?.indexOf?.(enemy);
  const sd = idx >= 0 ? scene.enemySprites?.[idx] : null;
  return sd?.body || null;
}

function heroBodyOf(scene, hero) {
  const idx = scene.party?.indexOf?.(hero);
  const sd = idx >= 0 ? scene.heroSprites?.[idx] : scene.heroSprites?.[0];
  return sd?.sprite || sd?.body || sd || null;
}

function glyphAt(scene, x, y, text, { size = 30, color = '#f0c040' } = {}) {
  return scene.add.text(x, y, text, {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${size}px`,
    color,
    stroke: '#2a1808',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(BATTLE_DEPTH.VFX).setScrollFactor(0);
}

/**
 * Play the category visual for an ability. Safe to call with partial
 * scenes (unit tests) — silently no-ops when pieces are missing.
 */
export function playAbilityVfx(scene, abilityId, enemy, activeHero) {
  if (!scene?.tweens?.add || !scene.add?.text) return;
  const body = enemyBodyOf(scene, enemy);
  if (!body) return;
  const cat = abilityVfxCategory(abilityId);
  const ex = body.x, ey = body.y - (body.displayHeight || 300) * 0.2;

  switch (cat) {
    case 'buffSelf': {
      for (let i = 0; i < 3; i++) {
        const g = glyphAt(scene, ex + (i - 1) * 40, ey + 40, '▲', { size: 24, color: '#f0a030' });
        scene.tweens.add({
          targets: g, y: ey - 60 - i * 14, alpha: 0,
          duration: 620, delay: i * 90, ease: 'Quad.out',
          onComplete: () => g.destroy(),
        });
      }
      const osx = body.scaleX, osy = body.scaleY;
      scene.tweens.add({
        targets: body, scaleX: osx * 1.06, scaleY: osy * 1.06,
        duration: 180, yoyo: true, ease: 'Sine.inOut',
        onComplete: () => body.setScale(osx, osy),
      });
      break;
    }
    case 'debuffHero': {
      const hb = heroBodyOf(scene, activeHero);
      const wisp = glyphAt(scene, ex, ey, '✦', { size: 34, color: '#b070e8' });
      const tx = hb?.x ?? ex - 400, ty = hb?.y ?? ey + 200;
      scene.tweens.add({
        targets: wisp, x: tx, y: ty - 60, alpha: 0.2,
        duration: 480, ease: 'Quad.in',
        onComplete: () => {
          wisp.destroy();
          const mark = glyphAt(scene, tx, ty - 90, '↓', { size: 34, color: '#b070e8' });
          scene.tweens.add({ targets: mark, y: ty - 50, alpha: 0, duration: 420, onComplete: () => mark.destroy() });
        },
      });
      break;
    }
    case 'trick': {
      for (let i = 0; i < 3; i++) {
        const card = glyphAt(scene, ex, ey, '?', { size: 30, color: '#c0a0f0' });
        const ang = (i / 3) * Math.PI * 2;
        scene.tweens.add({
          targets: card,
          x: ex + Math.cos(ang) * 90, y: ey + Math.sin(ang) * 50 - 30,
          angle: 200 + i * 40, alpha: 0,
          duration: 640, delay: i * 70, ease: 'Quad.out',
          onComplete: () => card.destroy(),
        });
      }
      break;
    }
    case 'strike': {
      for (let i = 0; i < 5; i++) {
        const shard = glyphAt(scene, ex, ey, '◆', { size: 20, color: '#f06040' });
        const ang = -Math.PI * 0.9 + (i / 4) * Math.PI * 0.8;
        scene.tweens.add({
          targets: shard,
          x: ex + Math.cos(ang) * 220, y: ey + Math.sin(ang) * 160,
          alpha: 0, angle: 160,
          duration: 460, ease: 'Quad.out',
          onComplete: () => shard.destroy(),
        });
      }
      scene.cameras?.main?.shake?.(140, 0.006);
      break;
    }
    case 'heal': {
      for (let i = 0; i < 3; i++) {
        const plus = glyphAt(scene, ex + (i - 1) * 44, ey + 30, '+', { size: 30, color: '#58c858' });
        scene.tweens.add({
          targets: plus, y: ey - 70 - i * 12, alpha: 0,
          duration: 700, delay: i * 110, ease: 'Sine.out',
          onComplete: () => plus.destroy(),
        });
      }
      break;
    }
    case 'drain': {
      const hb = heroBodyOf(scene, activeHero);
      const sx = hb?.x ?? ex - 400, sy = (hb?.y ?? ey + 200) - 80;
      for (let i = 0; i < 3; i++) {
        const mote = glyphAt(scene, sx, sy, '●', { size: 16, color: '#f0d060' });
        scene.tweens.add({
          targets: mote, x: ex + (i - 1) * 20, y: ey, alpha: 0.15,
          duration: 520, delay: i * 90, ease: 'Quad.in',
          onComplete: () => mote.destroy(),
        });
      }
      break;
    }
  }
}
