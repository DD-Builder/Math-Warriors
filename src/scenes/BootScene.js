import Phaser from 'phaser';
import { SCENES, COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { unlockAudio } from '../systems/synthAudio.js';
import { makeDefaultSave, writeSave } from '../systems/save.js';

/**
 * BootScene
 *
 * First scene that runs. Its job is to:
 *  1. Load the bare minimum assets needed to show the TitleScene.
 *  2. Show a simple progress bar while loading.
 *  3. Hand off to TitleScene.
 *
 * Heavier per-level asset loading will happen later in dedicated loaders,
 * not here. This keeps the first paint fast.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.BOOT });
  }

  preload() {
    this.buildProgressBar();
    // No real assets to load yet — the progress bar just flashes briefly
    // so the user sees something before TitleScene paints.
  }

  create() {
    // Dismiss the HTML loading overlay now that Phaser is rendering.
    this.game.events.emit('ready');

    // Unlock Web Audio on first user gesture (iOS Safari requirement)
    this.input.once('pointerdown', () => unlockAudio());

    // Dev/testing shortcut: ?dev=mazeN boots straight into floor N with
    // a stock party, skipping all menus. Lets anyone playtest a level
    // without clicking through onboarding.
    const dev = new URLSearchParams(window.location.search).get('dev');
    if (dev && /^maze[1-9]$/.test(dev)) {
      const floor = Number(dev.slice(-1));
      const save = makeDefaultSave();
      save.slotName = 'DEV';
      save.party = [
        { id: 'bunny-pepper', name: 'PEPPER', hp: 30, maxHp: 30 },
        { id: 'knight-shadow', name: 'SHADOW', hp: 30, maxHp: 30 },
        { id: 'wizard-stargazer', name: 'STARGAZER', hp: 26, maxHp: 26 },
      ];
      save.floors.forEach(f => { f.unlocked = f.id <= floor; });
      writeSave(save, 1);
      this.registry.set('activeSlot', 1);
      this.scene.start(SCENES.MAZE, { floor });
      return;
    }
    // Dev/testing shortcut: ?dev=battleN[-count] or ?dev=bossN drops straight
    // into a battle on floor N so the encounter framing can be verified.
    const devBattle = dev && dev.match(/^battle([1-9])(?:-([123]))?$/);
    const devBoss = dev && dev.match(/^boss([1-9])$/);
    if (devBattle || devBoss) {
      const floor = Number((devBattle || devBoss)[1]);
      this.registry.set('grade', 3);
      this.scene.start(SCENES.BATTLE, {
        floor,
        grade: 3,
        isBoss: !!devBoss,
        devCount: devBattle && devBattle[2] ? Number(devBattle[2]) : undefined,
      });
      return;
    }

    this.scene.start(SCENES.TITLE);
  }

  /**
   * Draws a basic loading bar while preload runs. This is the only UI
   * the user will see before the title appears, so it should look OK
   * on its own but doesn't need to be pretty.
   */
  buildProgressBar() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const barW = 400;
    const barH = 12;

    const outline = this.add.rectangle(cx, cy, barW + 4, barH + 4)
      .setStrokeStyle(2, COLORS.paper);
    const fill = this.add.rectangle(cx - barW / 2, cy, 0, barH, COLORS.gold)
      .setOrigin(0, 0.5);

    const label = this.add.text(cx, cy - 40, 'LOADING', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
      fontSize: '16px',
      color: '#f0e4cc',
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      fill.width = barW * value;
    });

    this.load.on('complete', () => {
      outline.destroy();
      fill.destroy();
      label.destroy();
    });
  }
}
