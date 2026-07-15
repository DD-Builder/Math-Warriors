/**
 * Coach chip — a small speech medallion the floor's guide pops up to
 * offer a pre-answer hint. Thin UI over drawGuidePortrait; the scene
 * owns when it appears and force-destroys it when the turn advances.
 */

import { GAME_WIDTH, PAPER } from '../config.js';
import { paperRect, safeArea } from './paperUI.js';
import { drawGuidePortrait } from './guideArt.js';
import { BATTLE_DEPTH } from './depths.js';

/** Which realm guide speaks on each floor (floor 9 loops back to Elara). */
export const FLOOR_GUIDES = {
  1: 'Elara', 2: 'Marlow', 3: 'Zephyr', 4: 'Cinder', 5: 'Frost',
  6: 'Faceta', 7: 'Penny', 8: 'Folio', 9: 'Elara',
};

/**
 * Pop the floor guide's face + a line of help near the top of the
 * battle. Auto-dismisses after `duration`, or on tap. Returns a handle
 * with destroy() so the scene can clear it when the turn advances.
 */
export function showCoachChip(scene, floor, text, { duration = 4500, expression = 'neutral' } = {}) {
  const speaker = FLOOR_GUIDES[floor] || 'Elara';
  const area = safeArea(GAME_WIDTH, scene.scale.height);
  const cx = GAME_WIDTH / 2;
  const y = area.top + 132;

  const panelW = 470, panelH = 96, r = 46;
  const container = scene.add.container(cx, y).setDepth(BATTLE_DEPTH.HINT);

  const { bg, shadow } = paperRect(scene, 0, 0, panelW, panelH, PAPER.inkTeal, {
    radius: 20, alpha: 0.96, strokeColor: PAPER.teal, strokeAlpha: 0.6,
    strokeWidth: 3, shadowOff: 6, shadowAlpha: 0.3,
  });
  container.add(shadow);
  container.add(bg);

  const label = scene.add.text(-panelW / 2 + r + 26, 0, text, {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '18px', color: '#f5eedd', align: 'left',
    lineSpacing: 2,
    wordWrap: { width: panelW - r - 56 },
  }).setOrigin(0, 0.5);
  container.add(label);

  // Portrait overlaps the panel's left edge like a speech avatar.
  const portrait = drawGuidePortrait(scene, -panelW / 2 + 10, 0, speaker, { r, expression });
  container.add(portrait);

  // Tap-anywhere-on-chip to dismiss early.
  const zone = scene.add.zone(0, 0, panelW, panelH).setOrigin(0.5).setInteractive();
  container.add(zone);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    if (timer) timer.remove();
    if (container.scene) container.destroy();
  };
  zone.on('pointerdown', destroy);
  const timer = scene.time.delayedCall(duration, destroy);

  if (!scene.reducedMotion) {
    container.setScale(0.82);
    container.setAlpha(0);
    scene.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 200, ease: 'Back.out' });
  }

  return { destroy };
}
