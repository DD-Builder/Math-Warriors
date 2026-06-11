import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { PaperButton, TEXT, safeArea } from '../ui/paperUI.js';
import { audio } from '../systems/audio.js';
import { transitionTo } from '../ui/sceneHelpers.js';
import { getHeroById, getPersonality } from '../data/heroes.js';
import { getEvolutionModifiers } from '../data/heroEvolutionArt.js';

/**
 * EvolutionScene — the dramatic ceremony when a hero evolves.
 *
 * Receives data via scene.start(SCENES.EVOLUTION, { ... }):
 *   heroId, heroName, evolvedName, evolvedTitle, stage,
 *   statBoosts, newSuper, pathName, pathDescription, personality,
 *   displayColor
 *
 * After the ceremony, returns to PartySelectScene.
 */
export class EvolutionScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.EVOLUTION });
  }

  init(data) {
    this.evoData = data;
  }

  create() {
    const d = this.evoData;
    const hero = getHeroById(d.heroId);
    if (!hero) {
      transitionTo(this, SCENES.PARTY_SELECT, undefined, 300);
      return;
    }

    const isStage3 = d.stage === 3;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // ---- Phase 0: Dark backdrop with sparkles ----
    this.cameras.main.setBackgroundColor(PAPER.inkTeal);
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Dark indigo background gradient overlay
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(PAPER.inkTeal, 1);
    bgGfx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Subtle radial glow at center
    const glowRadius = 400;
    for (let i = 8; i >= 1; i--) {
      bgGfx.fillStyle(PAPER.tealD, 0.04 * i);
      bgGfx.fillCircle(cx, cy, glowRadius + i * 30);
    }

    // Ambient sparkles in the background
    for (let i = 0; i < 40; i++) {
      const sx = Math.random() * GAME_WIDTH;
      const sy = Math.random() * GAME_HEIGHT;
      const size = 1 + Math.random() * 2;
      const sparkle = this.add.circle(sx, sy, size, PAPER.white, 0.2 + Math.random() * 0.3);
      this.tweens.add({
        targets: sparkle,
        alpha: 0.05,
        scale: 0.5,
        duration: 1200 + Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
      });
    }

    // ---- Phase 1: Hero appears (delay 0.3s) ----
    const heroSpriteY = cy - 30;
    const heroSprite = drawHeroSprite(this, cx, heroSpriteY, hero, { scale: 1 });
    heroSprite.setAlpha(0);

    const nameText = this.add.text(cx, heroSpriteY + 120, d.heroName.toUpperCase(), {
      ...TEXT.heading(),
      fontSize: '28px',
      color: PAPER_CSS.sand,
      stroke: PAPER_CSS.inkTeal,
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    const stageLabel = this.add.text(cx, heroSpriteY + 150, 'Stage 1', {
      ...TEXT.body(),
      fontSize: '16px',
      color: PAPER_CSS.sand,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [heroSprite, nameText, stageLabel],
      alpha: 1,
      duration: 600,
      delay: 300,
      ease: 'Sine.out',
    });

    // ---- Phase 1.5: Building anticipation — heartbeat pulse ----
    const pulseDelay = 900;
    const pulseDuration = 2000;
    const heroColor = hero.displayColor || 0x2e4e88;

    this.time.delayedCall(pulseDelay, () => {
      // Heartbeat pulse: scale 1.0 -> 1.05 -> 1.0 at increasing speed
      const pulseSpeeds = [500, 420, 340, 280, 220, 180, 150, 130];
      let elapsed = 0;
      for (let pi = 0; pi < pulseSpeeds.length; pi++) {
        const dur = pulseSpeeds[pi];
        this.time.delayedCall(elapsed, () => {
          this.tweens.add({
            targets: heroSprite,
            scaleX: 1.05,
            scaleY: 1.05,
            duration: dur / 2,
            yoyo: true,
            ease: 'Sine.inOut',
          });
        });
        elapsed += dur;
      }
    });

    // ---- Phase 2: Energy gathering (starts after pulse) ----
    const gatherDelay = pulseDelay + pulseDuration + 200;
    const gatherDuration = isStage3 ? 2000 : 1500;
    const particleCount = isStage3 ? 45 : 30;

    this.time.delayedCall(gatherDelay, () => {
      audio.play('ui/confirm');

      // Pulsing glow on the hero
      const heroGlow = this.add.circle(cx, heroSpriteY, 80, heroColor, 0);
      this.tweens.add({
        targets: heroGlow,
        alpha: 0.3,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: gatherDuration,
        ease: 'Sine.in',
      });

      // Energy particles spiraling inward (rotation added to path)
      const colors = [PAPER.white, PAPER.gold, heroColor];
      for (let i = 0; i < particleCount; i++) {
        const startAngle = Math.random() * Math.PI * 2;
        const dist = 350 + Math.random() * 200;
        const startX = cx + Math.cos(startAngle) * dist;
        const startY = cy + Math.sin(startAngle) * dist;
        const size = 2 + Math.random() * 4;
        const color = colors[Math.floor(Math.random() * colors.length)];

        const p = this.add.circle(startX, startY, size, color, 0.7 + Math.random() * 0.3);
        const totalDur = gatherDuration * 0.6 + Math.random() * gatherDuration * 0.4;
        const delay = Math.random() * gatherDuration * 0.4;
        const spiralDir = Math.random() > 0.5 ? 1 : -1;
        const spiralSpeed = 2 + Math.random() * 3; // rotations during travel

        this.tweens.add({
          targets: p,
          alpha: 0,
          scale: 0.3,
          duration: totalDur,
          delay,
          ease: 'Cubic.easeIn',
          onUpdate: (tween) => {
            const progress = tween.progress;
            const curDist = dist * (1 - progress);
            const curAngle = startAngle + spiralDir * spiralSpeed * progress * Math.PI * 2;
            p.x = cx + Math.cos(curAngle) * curDist;
            p.y = heroSpriteY + Math.sin(curAngle) * curDist;
          },
          onComplete: () => p.destroy(),
        });
      }
    });

    // ---- Phase 3: Flash ----
    const flashDelay = gatherDelay + gatherDuration + 200;
    const flashRect = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, PAPER.white, 0).setDepth(100);

    const doFlash = (delay) => {
      this.time.delayedCall(delay, () => {
        audio.play('ui/confirm');
        this.tweens.add({
          targets: flashRect,
          alpha: { from: 0, to: 1 },
          duration: 200,
          yoyo: true,
          hold: 50,
          ease: 'Quad.out',
        });
      });
    };

    doFlash(flashDelay);
    if (isStage3) {
      // Second flash for stage 3
      doFlash(flashDelay + 400);
    }

    // ---- Phase 4: New form revealed ----
    const revealDelay = flashDelay + (isStage3 ? 900 : 500);
    const newScale = isStage3 ? 2 : 1.5;

    this.time.delayedCall(revealDelay, () => {
      // Morph transition: old sprite → white tint → silhouette hold → new form
      // Step 1: Tint old sprite white (200ms)
      nameText.setAlpha(0);
      stageLabel.setAlpha(0);

      // Create a white overlay rectangle matching the hero sprite area for the silhouette
      const spriteBounds = heroSprite.getBounds();
      const silhouette = this.add.rectangle(
        cx, heroSpriteY,
        spriteBounds.width + 10, spriteBounds.height + 10,
        PAPER.white, 0
      );

      this.tweens.add({
        targets: silhouette,
        alpha: 0.9,
        duration: 200,
        ease: 'Sine.in',
        onComplete: () => {
          // Step 2: Hold silhouette (300ms), then hide old and reveal new
          heroSprite.setAlpha(0);
          this.time.delayedCall(300, () => {
            // Fade out the silhouette
            this.tweens.add({
              targets: silhouette,
              alpha: 0,
              duration: 300,
              ease: 'Sine.out',
              onComplete: () => silhouette.destroy(),
            });
          });
        },
      });

      // Brighten the background
      const brightBg = this.add.graphics();
      if (isStage3) {
        // Use hero's display color as tint
        brightBg.fillStyle(heroColor, 0.15);
      } else {
        brightBg.fillStyle(PAPER.inkTeal, 0.5);
      }
      brightBg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      brightBg.setAlpha(0);
      this.tweens.add({
        targets: brightBg,
        alpha: 1,
        duration: 600,
        ease: 'Sine.out',
      });

      // FINAL FORM text for stage 3
      if (isStage3) {
        const finalFormText = this.add.text(cx, heroSpriteY - 150, 'FINAL FORM', {
          ...TEXT.title(),
          fontSize: '36px',
          color: PAPER_CSS.gold,
          stroke: PAPER_CSS.inkTeal,
          strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0);
        this.tweens.add({
          targets: finalFormText,
          alpha: 1,
          y: heroSpriteY - 160,
          duration: 600,
          ease: 'Back.out',
        });
        // Sparkle around FINAL FORM text
        for (let i = 0; i < 10; i++) {
          const sp = this.add.circle(
            cx - 100 + Math.random() * 200,
            heroSpriteY - 170 + Math.random() * 30,
            2 + Math.random() * 3,
            PAPER.gold, 0.6
          );
          this.tweens.add({
            targets: sp,
            alpha: 0.1,
            scale: 0.3,
            duration: 600 + Math.random() * 600,
            yoyo: true,
            repeat: -1,
            delay: Math.random() * 500,
          });
        }
      }

      // ── Apply evolution modifiers to the new form ──
      const evoMods = getEvolutionModifiers(d.heroId, d.stage, d.pathId || null);
      const finalScale = evoMods ? newScale * evoMods.scaleBoost : newScale;

      // Colored glow circle behind the hero (from evolution modifiers)
      if (evoMods) {
        const glowCircle = this.add.circle(cx, heroSpriteY, evoMods.auraRadius, evoMods.glowColor, 0);
        this.tweens.add({
          targets: glowCircle,
          alpha: evoMods.glowAlpha,
          duration: 600,
          delay: 500, // appear after silhouette fades
          ease: 'Sine.out',
        });
        // Gentle pulsing aura
        this.tweens.add({
          targets: glowCircle,
          scaleX: 1.15,
          scaleY: 1.15,
          alpha: evoMods.glowAlpha * 0.6,
          duration: 1200,
          delay: 1100,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }

      // New hero sprite — delayed to appear after the silhouette hold (500ms)
      const newHeroSprite = drawHeroSprite(this, cx, heroSpriteY, hero, { scale: finalScale });
      newHeroSprite.setAlpha(0).setScale(finalScale * 0.5);

      // Apply tint from evolution modifiers
      if (evoMods && evoMods.tintColor != null) {
        newHeroSprite.setTint(evoMods.tintColor);
      }

      this.tweens.add({
        targets: newHeroSprite,
        alpha: 1,
        scaleX: finalScale,
        scaleY: finalScale,
        duration: 500,
        delay: 500, // wait for silhouette hold to finish
        ease: 'Back.out',
      });

      // Stage 3 orbiting particles (4 small circles tweened in a circle path)
      if (evoMods && evoMods.particleCount > 0 && evoMods.particleColor != null) {
        const orbitRadius = evoMods.auraRadius + 15;
        const orbitDuration = 3000;
        for (let oi = 0; oi < evoMods.particleCount; oi++) {
          const startAngle = (oi / evoMods.particleCount) * Math.PI * 2;
          const orbitDot = this.add.circle(
            cx + Math.cos(startAngle) * orbitRadius,
            heroSpriteY + Math.sin(startAngle) * orbitRadius,
            4, evoMods.particleColor, 0
          );
          // Fade in after the new sprite appears
          this.tweens.add({
            targets: orbitDot,
            alpha: 0.8,
            duration: 400,
            delay: 800,
            ease: 'Sine.out',
          });
          // Continuous orbit
          this.tweens.add({
            targets: orbitDot,
            duration: orbitDuration,
            delay: 800,
            repeat: -1,
            ease: 'Linear',
            onUpdate: (tween) => {
              const angle = startAngle + tween.progress * Math.PI * 2;
              orbitDot.x = cx + Math.cos(angle) * orbitRadius;
              orbitDot.y = heroSpriteY + Math.sin(angle) * orbitRadius;
            },
          });
        }
      }

      // Light rays emanating from the hero after flash reveal
      const rayCount = 8;
      for (let ri = 0; ri < rayCount; ri++) {
        const rayAngle = (ri / rayCount) * Math.PI * 2;
        const rayLen = 20;
        const rayX = cx + Math.cos(rayAngle) * 10;
        const rayY = heroSpriteY + Math.sin(rayAngle) * 10;
        const ray = this.add.rectangle(rayX, rayY, 3, rayLen, PAPER.white, 0.7);
        ray.setOrigin(0.5, 0);
        ray.setRotation(rayAngle - Math.PI / 2);
        ray.setAlpha(0);

        this.tweens.add({
          targets: ray,
          alpha: 0.6,
          scaleY: 8,
          duration: 600,
          delay: 100 + ri * 40,
          ease: 'Cubic.out',
          onComplete: () => {
            this.tweens.add({
              targets: ray,
              alpha: 0,
              duration: 800,
              ease: 'Sine.in',
              onComplete: () => ray.destroy(),
            });
          },
        });
      }

      // Dramatic pause (500ms) before showing the new name
      const nameRevealDelay = 700;

      // New name and title
      const newNameText = this.add.text(cx, heroSpriteY + 100 + (newScale - 1) * 40, d.evolvedName.toUpperCase(), {
        ...TEXT.title(),
        fontSize: '34px',
        color: PAPER_CSS.gold,
        stroke: PAPER_CSS.inkTeal,
        strokeThickness: 5,
      }).setOrigin(0.5).setAlpha(0);

      const newTitleText = this.add.text(cx, heroSpriteY + 138 + (newScale - 1) * 40, d.evolvedTitle, {
        ...TEXT.body(),
        fontSize: '18px',
        color: PAPER_CSS.sand,
        fontStyle: 'italic',
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({
        targets: [newNameText, newTitleText],
        alpha: 1,
        duration: 600,
        delay: nameRevealDelay,
        ease: 'Sine.out',
      });

      // Celebration particle burst outward
      audio.play('battle/victory');
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const burstColor = [PAPER.white, PAPER.gold, heroColor, PAPER.orange][i % 4];
        const bp = this.add.circle(cx, heroSpriteY, 3 + Math.random() * 3, burstColor, 0.8);
        this.tweens.add({
          targets: bp,
          x: cx + Math.cos(angle) * (200 + Math.random() * 100),
          y: heroSpriteY + Math.sin(angle) * (200 + Math.random() * 100),
          alpha: 0,
          scale: 0.2,
          duration: 700 + Math.random() * 500,
          ease: 'Quad.out',
          onComplete: () => bp.destroy(),
        });
      }

      // Path info for stage 3
      if (isStage3 && d.pathName) {
        const pathDelay = 600;
        this.time.delayedCall(pathDelay, () => {
          const pathText = this.add.text(cx, heroSpriteY + 180 + (newScale - 1) * 40,
            `${d.heroName} chose the path of the ${d.pathName}!`, {
            ...TEXT.body(),
            fontSize: '16px',
            color: PAPER_CSS.sand,
            wordWrap: { width: 500 },
            align: 'center',
          }).setOrigin(0.5).setAlpha(0);
          this.tweens.add({
            targets: pathText,
            alpha: 1,
            duration: 500,
            ease: 'Sine.out',
          });
        });
      }

      // ---- Phase 5: Stat gains shown ----
      const statDelay = isStage3 ? 1000 : 700;
      const boosts = d.statBoosts || {};
      const statEntries = [];
      if (boosts.maxHp) statEntries.push({ label: `+${boosts.maxHp} HP`, color: '#7d9f6d' });
      if (boosts.atk) statEntries.push({ label: `+${boosts.atk} ATK`, color: '#e39a4a' });
      if (boosts.def) statEntries.push({ label: `+${boosts.def} DEF`, color: '#7fb3ae' });

      const statBaseY = cy + 180 + (isStage3 ? 40 : 0);
      statEntries.forEach((entry, idx) => {
        const fromLeft = idx % 2 === 0;
        const startX = fromLeft ? -200 : GAME_WIDTH + 200;
        const targetX = cx;
        const targetY = statBaseY + idx * 36;

        this.time.delayedCall(statDelay + idx * 300, () => {
          audio.play('battle/correct');
          const statText = this.add.text(startX, targetY, entry.label, {
            ...TEXT.heading(),
            fontSize: '26px',
            color: entry.color,
            stroke: PAPER_CSS.inkTeal,
            strokeThickness: 4,
          }).setOrigin(0.5).setAlpha(0);

          this.tweens.add({
            targets: statText,
            x: targetX,
            alpha: 1,
            duration: 400,
            ease: 'Back.out',
          });

          // Pop effect
          this.tweens.add({
            targets: statText,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 100,
            delay: 400,
            yoyo: true,
            ease: 'Quad.out',
          });
        });
      });

      // ---- Phase 6: New super move ----
      const superDelay = statDelay + statEntries.length * 300 + 400;
      if (d.newSuper && d.newSuper.name) {
        this.time.delayedCall(superDelay, () => {
          audio.play('battle/correct');
          const superText = this.add.text(cx, statBaseY + statEntries.length * 36 + 20,
            `NEW MOVE: ${d.newSuper.name}!`, {
            ...TEXT.heading(),
            fontSize: '24px',
            color: PAPER_CSS.gold,
            stroke: PAPER_CSS.inkTeal,
            strokeThickness: 4,
          }).setOrigin(0.5).setAlpha(0).setScale(0.5);

          this.tweens.add({
            targets: superText,
            alpha: 1,
            scaleX: 1,
            scaleY: 1,
            duration: 500,
            ease: 'Back.out',
          });

          // Golden sparkles around the new move text
          for (let i = 0; i < 12; i++) {
            const sp = this.add.circle(
              cx - 120 + Math.random() * 240,
              superText.y - 10 + Math.random() * 20,
              2 + Math.random() * 2,
              PAPER.gold, 0.7
            );
            this.tweens.add({
              targets: sp,
              alpha: 0,
              y: sp.y - 20 - Math.random() * 20,
              duration: 600 + Math.random() * 400,
              delay: Math.random() * 300,
              onComplete: () => sp.destroy(),
            });
          }
        });
      }

      // ---- Phase 7: Battle cry ----
      const cryDelay = superDelay + (d.newSuper ? 700 : 200);
      const personality = d.personality || getPersonality(d.heroId);
      const victoryCry = personality?.battleCries?.victory;

      if (victoryCry) {
        this.time.delayedCall(cryDelay, () => {
          const cryText = this.add.text(cx, statBaseY + statEntries.length * 36 + (d.newSuper ? 60 : 20),
            victoryCry, {
            ...TEXT.body(),
            fontSize: '20px',
            color: PAPER_CSS.sand,
            fontStyle: 'italic',
            wordWrap: { width: 400 },
            align: 'center',
          }).setOrigin(0.5).setAlpha(0);

          this.tweens.add({
            targets: cryText,
            alpha: 1,
            duration: 400,
            ease: 'Sine.out',
          });
        });
      }

      // ---- Phase 8: Continue button ----
      const btnDelay = cryDelay + 600;
      this.time.delayedCall(btnDelay, () => {
        const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
        const btn = PaperButton(this, cx, area.bottom - 50, 'AMAZING!', {
          w: 260, h: 64, color: PAPER.coralD, fontSize: 24, textColor: PAPER_CSS.cream,
          onClick: () => {
            if (this._leaving) return; // double-tap = double scene transition
            this._leaving = true;
            audio.play('ui/confirm');
            const psState = d.partySelectState || {};
            transitionTo(this, SCENES.PARTY_SELECT, {
              grade: psState.grade,
              returnScene: psState.returnScene,
            }, 400);
          },
        });

        // Fade in the button
        [btn.bg, btn.shadow, btn.label, btn.zone].forEach(obj => {
          if (obj) {
            obj.setAlpha(0);
            this.tweens.add({
              targets: obj,
              alpha: 1,
              duration: 400,
              ease: 'Sine.out',
            });
          }
        });

        // Golden sparkle border around the AMAZING button
        const btnX = cx;
        const btnY = area.bottom - 50;
        const sparkleCount = 12;
        for (let si = 0; si < sparkleCount; si++) {
          const createSparkle = () => {
            // Position along the button border perimeter
            const side = Math.random();
            let sx, sy;
            if (side < 0.25) { sx = btnX - 130 + Math.random() * 260; sy = btnY - 32; }
            else if (side < 0.5) { sx = btnX - 130 + Math.random() * 260; sy = btnY + 32; }
            else if (side < 0.75) { sx = btnX - 130; sy = btnY - 32 + Math.random() * 64; }
            else { sx = btnX + 130; sy = btnY - 32 + Math.random() * 64; }

            const sp = this.add.circle(sx, sy, 2 + Math.random() * 2, PAPER.gold, 0);
            this.tweens.add({
              targets: sp,
              alpha: 0.8,
              scale: 1.5,
              duration: 200 + Math.random() * 200,
              yoyo: true,
              ease: 'Sine.inOut',
              onComplete: () => {
                sp.destroy();
                if (this.scene.isActive()) {
                  this.time.delayedCall(Math.random() * 600, () => {
                    if (this.scene.isActive()) createSparkle();
                  });
                }
              },
            });
          };
          this.time.delayedCall(si * 150, () => {
            if (this.scene.isActive()) createSparkle();
          });
        }
      });
    });
  }
}
