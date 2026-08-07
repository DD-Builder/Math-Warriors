import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { listSlots, clearSave, loadSave } from '../systems/save.js';
import { audio } from '../systems/audio.js';
import { drawPapercutBackground } from '../systems/papercut.js';
import { PaperButton, PaperPanel, TEXT, safeArea } from '../ui/paperUI.js';
import { drawHeroSprite } from '../ui/heroSprites.js';
import { spawnHero } from '../data/heroes.js';
import { transitionTo, fadeInScene } from '../ui/sceneHelpers.js';
import { goHub } from '../ui/hubRouter.js';

export class SaveSlotScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENES.SAVE_SELECT });
  }

  create() {
    const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
    fadeInScene(this);
    drawPapercutBackground(this, 'menu', GAME_WIDTH, GAME_HEIGHT, 999);

    this.add.text(area.cx, area.top + 50, 'SAVE SLOTS', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '48px', color: PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(area.cx, area.top + 100, 'Choose a slot to play', {
      ...TEXT.body(), fontSize: '24px', color: PAPER_CSS.cream,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 3,
    }).setOrigin(0.5);

    const slots = listSlots();
    const cardW = 380;
    const cardH = 580;
    const gap = 30;
    const totalW = 3 * cardW + 2 * gap;
    const startX = area.cx - totalW / 2 + cardW / 2;
    const cardY = area.top + 130 + cardH / 2;

    for (let i = 0; i < 3; i++) {
      this.drawSlotCard(startX + i * (cardW + gap), cardY, cardW, cardH, slots[i], i + 1);
    }

    PaperButton(this, area.cx, area.bottom - 30, 'BACK', {
      w: 200, h: 60, color: PAPER.teal, fontSize: 22,
      onClick: () => {
        audio.play('ui/back');
        transitionTo(this, SCENES.TITLE, undefined, 200);
      },
    });
  }

  drawSlotCard(x, y, w, h, meta, slot) {
    const isEmpty = !meta.exists;

    PaperPanel(this, x, y, w, h, {
      color: isEmpty ? PAPER.inkTeal : PAPER.tealD, alpha: 0.85, radius: 18,
    });

    const top = y - h / 2;

    const slotLabel = meta.name || (isEmpty ? 'Empty Slot' : `Slot ${slot}`);
    this.add.text(x, top + 30, slotLabel, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '28px', color: isEmpty ? PAPER_CSS.sand : PAPER_CSS.gold,
      stroke: PAPER_CSS.inkTeal, strokeThickness: 3,
    }).setOrigin(0.5);

    if (isEmpty) {
      this.add.text(x, y - 20, '+ NEW GAME', {
        fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
        fontSize: '32px', color: PAPER_CSS.sand,
      }).setOrigin(0.5);

      PaperButton(this, x, y + h / 2 - 60, 'START', {
        w: 260, h: 60, color: 0x58c848, fontSize: 24,
        onClick: () => {
          audio.play('ui/confirm');
          this.showNamePicker(slot);
        },
      });
    } else {
      const gradeNames = ['K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
      const gradeTxt = gradeNames[meta.grade] || `Grade ${meta.grade}`;

      this.add.text(x, top + 70, gradeTxt, {
        ...TEXT.body(), fontSize: '18px', color: PAPER_CSS.sand,
      }).setOrigin(0.5);

      const save = loadSave(slot);

      if (meta.partyNames.length > 0) {
        const heroY = top + 150;
        for (let hi = 0; hi < save.party.length; hi++) {
          const hero = save.party[hi];
          if (!hero) continue;
          const hx = x - 100 + hi * 100;
          const heroDef = spawnHero(hero.id);
          if (heroDef) drawHeroSprite(this, hx, heroY, heroDef, { scale: 0.4 });
          this.add.text(hx, heroY + 50, hero.name || '', {
            ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.cream,
            stroke: PAPER_CSS.inkTeal, strokeThickness: 2,
          }).setOrigin(0.5);
        }
      }

      const infoY = top + 260;
      const infoStyle = { ...TEXT.body(), fontSize: '20px', color: PAPER_CSS.cream };
      this.add.text(x, infoY, `Floor: ${meta.floorsComplete}/9`, infoStyle).setOrigin(0.5);

      // 9 small circles showing floor progress
      const dotRadius = 4;
      const dotGap = 4;
      const dotDiameter = dotRadius * 2;
      const totalDotsW = 9 * dotDiameter + 8 * dotGap;
      const dotStartX = x - totalDotsW / 2 + dotRadius;
      const dotY = infoY + 30;
      const gfx = this.add.graphics();
      for (let fi = 0; fi < 9; fi++) {
        const dx = dotStartX + fi * (dotDiameter + dotGap);
        const floorData = save.floors?.[fi];
        if (floorData?.complete) {
          // Gold filled
          gfx.fillStyle(PAPER.gold, 1);
          gfx.fillCircle(dx, dotY, dotRadius);
        } else if (floorData?.unlocked) {
          // White hollow (stroke only)
          gfx.lineStyle(2, PAPER.white, 1);
          gfx.strokeCircle(dx, dotY, dotRadius);
        } else {
          // Dark gray
          gfx.fillStyle(PAPER.tealD, 1);
          gfx.fillCircle(dx, dotY, dotRadius);
        }
        // Dark stroke border for better contrast
        gfx.lineStyle(1, PAPER.inkTeal, 0.5);
        gfx.strokeCircle(dx, dotY, dotRadius);
      }

      this.add.text(x, dotY + 35, `Gold: ${meta.gold}`, infoStyle).setOrigin(0.5);

      if (meta.lastPlayed) {
        const ago = this.timeAgo(meta.lastPlayed);
        this.add.text(x, dotY + 65, `Last played: ${ago}`, {
          ...TEXT.stat(), fontSize: '16px', color: PAPER_CSS.sand,
        }).setOrigin(0.5);
      }

      PaperButton(this, x - 70, y + h / 2 - 60, 'PLAY', {
        w: 180, h: 60, color: 0xf0a030, fontSize: 24,
        onClick: () => {
          audio.play('ui/confirm');
          this.registry.set('activeSlot', slot);
          goHub(this, undefined, 300);
        },
      });

      PaperButton(this, x + 70, y + h / 2 - 60, 'DELETE', {
        w: 140, h: 60, color: PAPER.coralD, fontSize: 18,
        onClick: () => {
          audio.play('ui/click');
          this.confirmDelete(slot, meta.name || `Slot ${slot}`);
        },
      });
    }
  }

  confirmDelete(slot, name) {
    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.75).setInteractive();
    const panel = [];
    panel.push(bg);

    const t1 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80, `Delete "${name}"?`, {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '36px', color: PAPER_CSS.coralD, stroke: PAPER_CSS.inkTeal, strokeThickness: 4,
    }).setOrigin(0.5);
    panel.push(t1);

    const t2 = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, 'This cannot be undone!', {
      ...TEXT.body(), fontSize: '22px', color: PAPER_CSS.cream,
    }).setOrigin(0.5);
    panel.push(t2);

    const cleanup = () => panel.forEach(o => o.destroy());

    const yesBtn = PaperButton(this, GAME_WIDTH / 2 - 120, GAME_HEIGHT / 2 + 50, 'DELETE', {
      w: 200, h: 60, color: PAPER.coralD, fontSize: 22,
      onClick: () => {
        audio.play('ui/confirm');
        clearSave(slot);
        for (let f = 1; f <= 9; f++) {
          this.registry.remove(`mazeState_${f}`);
          try { localStorage.removeItem(`mw_maze_${f}_slot${slot}`); } catch (e) { /* */ }
        }
        cleanup();
        yesBtn.bg.destroy(); yesBtn.shadow.destroy(); yesBtn.label.destroy();
        if (yesBtn.zone) yesBtn.zone.destroy();
        noBtn.bg.destroy(); noBtn.shadow.destroy(); noBtn.label.destroy();
        if (noBtn.zone) noBtn.zone.destroy();
        this.scene.restart();
      },
    });

    const noBtn = PaperButton(this, GAME_WIDTH / 2 + 120, GAME_HEIGHT / 2 + 50, 'CANCEL', {
      w: 200, h: 60, color: PAPER.teal, fontSize: 22,
      onClick: () => {
        audio.play('ui/back');
        cleanup();
        yesBtn.bg.destroy(); yesBtn.shadow.destroy(); yesBtn.label.destroy();
        if (yesBtn.zone) yesBtn.zone.destroy();
        noBtn.bg.destroy(); noBtn.shadow.destroy(); noBtn.label.destroy();
        if (noBtn.zone) noBtn.zone.destroy();
      },
    });
  }

  showNamePicker(slot) {
    this._pickerObjects = [];
    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, PAPER.shadow, 0.8).setInteractive();
    this._pickerObjects.push(bg);

    const title = this.add.text(GAME_WIDTH / 2, 120, 'NAME YOUR ADVENTURE', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '36px', color: PAPER_CSS.gold, stroke: PAPER_CSS.inkTeal, strokeThickness: 5,
    }).setOrigin(0.5);
    this._pickerObjects.push(title);

    let currentName = '';
    const MAX_LEN = 12;

    const preview = this.add.text(GAME_WIDTH / 2, 200, '_', {
      fontFamily: '"Fredoka One", "Baloo 2", sans-serif', fontStyle: 'bold',
      fontSize: '48px', color: PAPER_CSS.cream, stroke: PAPER_CSS.inkTeal, strokeThickness: 4,
      letterSpacing: 4,
    }).setOrigin(0.5);
    this._pickerObjects.push(preview);

    const updatePreview = () => {
      preview.setText(currentName.length > 0 ? currentName : '_');
    };

    const rows = [
      'QWERTYUIOP',
      'ASDFGHJKL',
      'ZXCVBNM',
    ];

    const btnSize = 60;
    const btnGap = 6;
    const startY = 280;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const rowW = row.length * (btnSize + btnGap) - btnGap;
      const rowStartX = GAME_WIDTH / 2 - rowW / 2 + btnSize / 2;
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        const bx = rowStartX + c * (btnSize + btnGap);
        const by = startY + r * (btnSize + btnGap);
        const btn = PaperButton(this, bx, by, ch, {
          w: btnSize, h: btnSize, color: PAPER.inkTeal, fontSize: 22,
          onClick: () => {
            if (currentName.length < MAX_LEN) {
              currentName += ch;
              updatePreview();
              audio.play('ui/click');
            }
          },
        });
        this._pickerObjects.push(btn.bg, btn.shadow, btn.label);
        if (btn.zone) this._pickerObjects.push(btn.zone);
      }
    }

    // Hardware keyboard support
    const keyHandler = (event) => {
      const key = event.key;
      if (key === 'Backspace') {
        if (currentName.length > 0) {
          currentName = currentName.slice(0, -1);
          updatePreview();
          audio.play('ui/click');
        }
        event.preventDefault();
      } else if (key === 'Enter') {
        const name = currentName.trim() || `Slot ${slot}`;
        audio.play('ui/confirm');
        this.closePicker();
        this.startNewGame(slot, name);
        event.preventDefault();
      } else if (key === 'Escape') {
        audio.play('ui/back');
        this.closePicker();
        event.preventDefault();
      } else if (key.length === 1 && /[a-zA-Z0-9 ]/.test(key) && currentName.length < MAX_LEN) {
        currentName += key.toUpperCase();
        updatePreview();
        audio.play('ui/click');
      }
    };
    window.addEventListener('keydown', keyHandler);
    this._pickerKeyHandler = keyHandler;

    const controlY = startY + 3 * (btnSize + btnGap) + 10;

    const delBtn = PaperButton(this, GAME_WIDTH / 2 - 160, controlY, 'DELETE', {
      w: 180, h: 60, color: PAPER.orange, fontSize: 20,
      onClick: () => {
        if (currentName.length > 0) {
          currentName = currentName.slice(0, -1);
          updatePreview();
          audio.play('ui/click');
        }
      },
    });
    this._pickerObjects.push(delBtn.bg, delBtn.shadow, delBtn.label);
    if (delBtn.zone) this._pickerObjects.push(delBtn.zone);

    const okBtn = PaperButton(this, GAME_WIDTH / 2 + 160, controlY, 'OK', {
      w: 180, h: 60, color: 0x58c848, fontSize: 24,
      onClick: () => {
        const name = currentName.trim() || `Slot ${slot}`;
        audio.play('ui/confirm');
        this.closePicker();
        this.startNewGame(slot, name);
      },
    });
    this._pickerObjects.push(okBtn.bg, okBtn.shadow, okBtn.label);
    if (okBtn.zone) this._pickerObjects.push(okBtn.zone);

    const cancelBtn = PaperButton(this, GAME_WIDTH / 2, controlY + 80, 'CANCEL', {
      w: 200, h: 56, color: PAPER.teal, fontSize: 20,
      onClick: () => {
        audio.play('ui/back');
        this.closePicker();
      },
    });
    this._pickerObjects.push(cancelBtn.bg, cancelBtn.shadow, cancelBtn.label);
    if (cancelBtn.zone) this._pickerObjects.push(cancelBtn.zone);
  }

  closePicker() {
    if (this._pickerKeyHandler) {
      window.removeEventListener('keydown', this._pickerKeyHandler);
      this._pickerKeyHandler = null;
    }
    if (this._pickerObjects) {
      this._pickerObjects.forEach(o => { if (o && o.destroy) o.destroy(); });
      this._pickerObjects = null;
    }
  }

  startNewGame(slot, name) {
    this.registry.set('activeSlot', slot);
    this.registry.set('newSlotName', name);

    for (let f = 1; f <= 9; f++) {
      this.registry.remove(`mazeState_${f}`);
      try { localStorage.removeItem(`mw_maze_${f}`); } catch (e) { /* */ }
    }
    this.registry.remove('battleReturnScene');
    this.registry.remove('battleReturnData');
    this.registry.remove('battleVariant');

    transitionTo(this, SCENES.GRADE_SELECT, undefined, 300);
  }

  timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  }
}
