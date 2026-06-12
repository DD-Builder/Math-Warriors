/**
 * Celebration effects — reusable visual feedback for correct answers,
 * streaks, victories, and level-ups.
 */

import { PAPER, PAPER_CSS } from '../config.js';

export function confettiBurst(scene, x, y, count = 20) {
  const colors = [PAPER.gold, PAPER.coral, PAPER.teal, PAPER.leaf, PAPER.rose, PAPER.orange];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 120;
    const size = 4 + Math.random() * 8;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const p = scene.add.rectangle(x, y, size, size * 0.4, color);
    p.setAngle(Math.random() * 360);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist - 30,
      alpha: 0,
      angle: p.angle + (Math.random() - 0.5) * 540,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 600 + Math.random() * 400,
      ease: 'Cubic.out',
      onComplete: () => p.destroy(),
    });
  }
}

export function screenEdgeGlow(scene, color = PAPER.leaf, duration = 400) {
  const gfx = scene.add.graphics().setDepth(999);
  gfx.fillStyle(color, 0.25);
  gfx.fillRect(0, 0, 40, scene.cameras.main.height);
  gfx.fillRect(scene.cameras.main.width - 40, 0, 40, scene.cameras.main.height);
  gfx.fillRect(0, 0, scene.cameras.main.width, 30);
  gfx.fillRect(0, scene.cameras.main.height - 30, scene.cameras.main.width, 30);
  scene.tweens.add({
    targets: gfx, alpha: 0, duration, ease: 'Cubic.out',
    onComplete: () => gfx.destroy(),
  });
}

export function streakBanner(scene, streak, cx, cy) {
  let text, color;
  if (streak >= 8) {
    text = 'LEGENDARY!';
    color = PAPER_CSS.coralD;
  } else if (streak >= 5) {
    text = 'UNSTOPPABLE!';
    color = PAPER_CSS.orange;
  } else {
    text = 'ON FIRE!';
    color = PAPER_CSS.gold;
  }

  const banner = scene.add.text(cx, cy - 60, text, {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
    fontSize: '56px', color,
    stroke: PAPER_CSS.inkTeal, strokeThickness: 6,
  }).setOrigin(0.5).setScale(0.3).setAlpha(0).setDepth(998);

  scene.tweens.add({
    targets: banner, scaleX: 1.2, scaleY: 1.2, alpha: 1,
    duration: 250, ease: 'Back.out',
    onComplete: () => {
      scene.tweens.add({
        targets: banner, scaleX: 1, scaleY: 1,
        duration: 150, ease: 'Cubic.out',
      });
      scene.tweens.add({
        targets: banner, alpha: 0, y: banner.y - 40,
        duration: 600, delay: 800, ease: 'Cubic.in',
        onComplete: () => banner.destroy(),
      });
    },
  });

  confettiBurst(scene, cx, cy - 40, streak >= 8 ? 40 : streak >= 5 ? 30 : 20);
}

export function heroVictoryBounce(scene, heroSprite) {
  if (!heroSprite?.body) return;
  const origY = heroSprite.body.y;
  scene.tweens.add({
    targets: heroSprite.body,
    y: origY - 30,
    scaleX: heroSprite.body.scaleX * 1.15,
    scaleY: heroSprite.body.scaleY * 1.15,
    duration: 200,
    ease: 'Back.out',
    yoyo: true,
    onYoyo: () => {
      scene.tweens.add({
        targets: heroSprite.body,
        y: origY - 15,
        duration: 150,
        yoyo: true,
        ease: 'Sine.out',
      });
    },
  });
}

export function goldCoinScatter(scene, x, y, count = 8) {
  for (let i = 0; i < count; i++) {
    const coin = scene.add.circle(x, y, 6, PAPER.gold);
    coin.setStrokeStyle(1.5, PAPER.orange);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
    const dist = 40 + Math.random() * 80;
    scene.tweens.add({
      targets: coin,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      duration: 300 + Math.random() * 200,
      ease: 'Cubic.out',
      onComplete: () => {
        scene.tweens.add({
          targets: coin, y: coin.y + 60, alpha: 0,
          duration: 400, ease: 'Quad.in',
          onComplete: () => coin.destroy(),
        });
      },
    });
  }
}

export function starRating(scene, cx, cy, stars, maxStars = 3) {
  const gap = 60;
  const startX = cx - ((maxStars - 1) * gap) / 2;
  for (let i = 0; i < maxStars; i++) {
    const filled = i < stars;
    const star = scene.add.text(startX + i * gap, cy, '★', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '48px',
      color: filled ? PAPER_CSS.gold : PAPER_CSS.inkTeal,
      stroke: filled ? PAPER_CSS.orange : PAPER_CSS.inkTeal,
      strokeThickness: 3,
    }).setOrigin(0.5).setScale(0).setAlpha(0);

    scene.tweens.add({
      targets: star, scaleX: 1.3, scaleY: 1.3, alpha: 1,
      duration: 300, delay: 200 + i * 200, ease: 'Back.out',
      onComplete: () => {
        scene.tweens.add({
          targets: star, scaleX: 1, scaleY: 1,
          duration: 150, ease: 'Cubic.out',
        });
        if (filled) confettiBurst(scene, star.x, star.y, 8);
      },
    });
  }
}
