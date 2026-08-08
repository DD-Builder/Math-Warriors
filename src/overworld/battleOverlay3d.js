/**
 * battleOverlay3d — the 2D math UI that sits ON TOP of the 3D fight.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * battle3d.js stages the fight in the world and refuses, deliberately, to draw
 * a single glyph of the maths. A five-year-old reads an equation on a flat,
 * high-contrast band — not floating in perspective, not orbiting a monster. So
 * the fight is 3D and the SUM is 2D, and this module is the adapter between
 * them: it implements battle3d's `ui` interface using the Phaser components the
 * 2D BattleScene already uses, so the two fights look like one game.
 *
 * NOTHING HERE IS NEW UI. Every surface below is an existing component:
 *   PaperPanel / PaperButton / PaperBar / paperUI.safeArea  — ui/paperUI.js
 *   createNumpad                                            — ui/numpad.js
 *   BATTLE_DEPTH                                            — ui/depths.js
 *   audio                                                   — systems/audio.js
 * The equation band is laid out with the same four lines (a / opB / rule / ans)
 * and the same star row BattleScene builds at its `eqLines`, because a child
 * who learned to read the sum in the maze must not have to relearn it here.
 *
 * WHAT IT MUST NOT DO
 * -------------------
 * Cover the fight. The band owns the bottom, the vitals own the top, and the
 * middle band of the screen — where the heroes and the creature are standing in
 * the actual world — stays clear. The one exception is the typed-answer numpad,
 * which is a deliberate full-attention mode and is opt-in behind a button.
 *
 * It owns no rules. Every number it prints arrives through battle3d, which got
 * it from systems/battleRules.js.
 *
 * ART LAW: every colour from PAPER. Shadows are teal (paperUI's shadows already
 * are). No dark outlines — text strokes are cream or inkTeal, never black.
 */
import { GAME_WIDTH, GAME_HEIGHT, PAPER, PAPER_CSS } from '../config.js';
import { PaperPanel, PaperButton, PaperBar, updatePaperBar, safeArea } from '../ui/paperUI.js';
import { createNumpad } from '../ui/numpad.js';
import { audio } from '../systems/audio.js';

/**
 * Depths. The overworld HUD lives at 94-97 and the dialogue overlay at 500+,
 * so the battle overlay claims the band between them and nothing has to be
 * re-depthed anywhere else.
 */
export const OVERLAY_DEPTH = {
  VITALS: 300,
  VITALS_TEXT: 302,
  PANEL_SHADOW: 309,
  PANEL: 310,
  PANEL_TEXT: 312,
  BUTTON: 320,
  BUTTON_TEXT: 322,
  TOAST: 380,
  HINT: 420,
  BANNER: 440,
};

/** The four answer buttons, in the order and colours BattleScene uses. */
const ANSWER_COLORS = [0x3888d8, 0xe84840, 0x4aa848, 0x9050c8];

const FONT = '"Fredoka One", "Baloo 2", sans-serif';

/** Operator glyphs a child actually reads (× and ÷, never * and /). */
function opSymbol(op) {
  return op === '*' ? '×' : op === '/' ? '÷' : op;
}

/**
 * Build the overlay. Nothing is drawn until `onBattleBegin` fires, and
 * everything is destroyed again on `onBattleEnd`, so an overworld with no
 * fight in it carries no battle UI at all.
 *
 * @param {Phaser.Scene} scene   the OverworldScene (it owns the 2D canvas)
 * @param {object} opts
 * @param {() => {x:number,y:number}} [opts.purseAt] where flown gold should land
 * @param {(n:number) => void} [opts.onGold] gold arrived — pulse the HUD chip
 * @returns {object} the `ui` adapter battle3d expects, plus destroy()
 */
export function createBattleOverlay3D(scene, opts = {}) {
  const area = safeArea(GAME_WIDTH, GAME_HEIGHT);
  const purseAt = opts.purseAt || (() => ({ x: 130, y: 96 }));

  /** Everything currently on screen for this fight. Destroyed wholesale. */
  let els = [];
  let live = false;
  let bandY = 0;

  let eq = null;              // { a, opB, bar, ans, stars }
  let bandPaper = [];         // the band's own paper, hidden with its text
  let turnLabel = null;
  let answerBtns = [];        // [{ bg, shadow, label, zone }]
  let hintBtn = null;
  let typeBtn = null;
  let commandBtns = [];
  let numpad = null;
  let hintPanel = null;
  let vitals = null;          // { momentum, heroes:[], foes:[] }
  const toasts = [];

  let currentQuestion = null;
  let answerFn = null;
  let hintFn = null;
  let answered = false;

  // ── small helpers ───────────────────────────────────────────────────

  function keep(...objs) {
    for (const o of objs) if (o) els.push(o);
    return objs[0];
  }

  /** Depth + pin a PaperButton's four parts in one go. */
  function placeButton(btn, base = OVERLAY_DEPTH.BUTTON) {
    if (!btn) return btn;
    if (btn.shadow) btn.shadow.setDepth(base - 1).setScrollFactor(0);
    if (btn.bg) btn.bg.setDepth(base).setScrollFactor(0);
    if (btn.label) btn.label.setDepth(base + 2).setScrollFactor(0);
    if (btn.zone) btn.zone.setDepth(base + 2).setScrollFactor(0);
    keep(btn.shadow, btn.bg, btn.label, btn.zone);
    return btn;
  }

  function destroyButton(btn) {
    if (!btn) return;
    for (const k of ['shadow', 'bg', 'label', 'zone']) {
      const o = btn[k];
      if (o) {
        const i = els.indexOf(o);
        if (i >= 0) els.splice(i, 1);
        if (o.scene) o.destroy();
      }
    }
  }

  function text(x, y, str, style, depth = OVERLAY_DEPTH.PANEL_TEXT) {
    return keep(scene.add.text(x, y, str, {
      fontFamily: FONT, resolution: 2, ...style,
    }).setDepth(depth).setScrollFactor(0));
  }

  // ── vitals: who is still standing, and how the roll is going ────────
  //
  // Top of screen, so the battle line in the middle of the frame stays
  // uncovered. Party on the left, creatures on the right, momentum between.

  function buildVitals(info) {
    const heroes = [];
    const foes = [];
    const topY = area.top + 6;

    for (let i = 0; i < info.party.length && i < 3; i++) {
      const h = info.party[i];
      if (!h) continue;
      const y = topY + i * 46;
      const plate = keep(scene.add.rectangle(area.left, y, 270, 40, PAPER.inkTeal, 0.82)
        .setOrigin(0, 0.5).setDepth(OVERLAY_DEPTH.VITALS).setScrollFactor(0));
      const name = text(area.left + 12, y, (h.name || 'HERO').toUpperCase(), {
        fontSize: '18px', color: PAPER_CSS.cream,
      }, OVERLAY_DEPTH.VITALS_TEXT).setOrigin(0, 0.5);
      const bar = PaperBar(scene, area.left + 150, y, 108, 16,
        Math.max(0, h.hp) / Math.max(1, h.maxHp), PAPER.forestL, { bgColor: PAPER.shadow });
      for (const k of Object.keys(bar)) {
        if (bar[k]?.setDepth) keep(bar[k].setDepth(OVERLAY_DEPTH.VITALS_TEXT).setScrollFactor(0));
      }
      heroes.push({ hero: h, bar, name, plate });
    }

    for (let i = 0; i < info.enemies.length && i < 3; i++) {
      const e = info.enemies[i];
      if (!e) continue;
      const y = topY + i * 46;
      const plate = keep(scene.add.rectangle(area.right, y, 300, 40, PAPER.inkTeal, 0.82)
        .setOrigin(1, 0.5).setDepth(OVERLAY_DEPTH.VITALS).setScrollFactor(0));
      const name = text(area.right - 12, y, (e.name || 'FOE').toUpperCase(), {
        fontSize: '18px', color: PAPER_CSS.gold,
      }, OVERLAY_DEPTH.VITALS_TEXT).setOrigin(1, 0.5);
      const bar = PaperBar(scene, area.right - 292, y, 120, 16,
        Math.max(0, e.hp) / Math.max(1, e.maxHp), PAPER.coral, { bgColor: PAPER.shadow });
      for (const k of Object.keys(bar)) {
        if (bar[k]?.setDepth) keep(bar[k].setDepth(OVERLAY_DEPTH.VITALS_TEXT).setScrollFactor(0));
      }
      foes.push({ enemy: e, bar, name, plate });
    }

    const momentum = PaperBar(scene, area.cx - 130, area.top + 8, 260, 20, 0.5, PAPER.gold,
      { bgColor: PAPER.shadow });
    for (const k of Object.keys(momentum)) {
      if (momentum[k]?.setDepth) keep(momentum[k].setDepth(OVERLAY_DEPTH.VITALS_TEXT).setScrollFactor(0));
    }
    const streakLabel = text(area.cx, area.top + 36, '', {
      fontSize: '18px', color: PAPER_CSS.gold,
    }, OVERLAY_DEPTH.VITALS_TEXT).setOrigin(0.5);

    vitals = { heroes, foes, momentum, streakLabel };
  }

  // ── the equation band ───────────────────────────────────────────────

  function buildBand(grade) {
    const noteW = 420;
    const noteH = 130;
    bandY = area.bottom - 250;

    // The PAPER of the band hides with its text. A cream card sitting empty
    // over the fight while the child picks FIGHT/GUARD reads as a bug.
    bandPaper = [];
    const panel = PaperPanel(scene, area.cx, bandY, noteW, noteH, {
      color: 0xf7edd6, alpha: 1, radius: 18, shadowOff: 5, shadowAlpha: 0.3,
    });
    if (panel.shadow) bandPaper.push(keep(panel.shadow.setDepth(OVERLAY_DEPTH.PANEL_SHADOW).setScrollFactor(0)));
    if (panel.bg) bandPaper.push(keep(panel.bg.setDepth(OVERLAY_DEPTH.PANEL).setScrollFactor(0)));

    const eqFont = grade <= 2 ? '58px' : '48px';
    const line = (dx, dy, str, size, color) => text(area.cx + dx, bandY + dy, str, {
      fontSize: size, color, letterSpacing: 1,
    });
    eq = {
      a: line(24, -34, '', eqFont, '#3a2410').setOrigin(1, 0.5),
      opB: line(24, 4, '', eqFont, '#c06a10').setOrigin(1, 0.5),
      bar: line(0, 30, '', '22px', '#8a7050').setOrigin(0.5),
      ans: line(0, 50, '?', eqFont, '#d08020').setOrigin(0.5, 0.5),
      stars: line(noteW / 2 - 12, -noteH / 2 + 12, '', '18px', '#8a5010').setOrigin(1, 0),
    };

    const turnY = bandY - noteH / 2 - 30;
    const turnPanel = PaperPanel(scene, area.cx, turnY, 560, 44, {
      color: 0xf5ead0, alpha: 0.94, radius: 14, shadowOff: 3, shadowAlpha: 0.2,
    });
    if (turnPanel.shadow) bandPaper.push(keep(turnPanel.shadow.setDepth(OVERLAY_DEPTH.PANEL_SHADOW).setScrollFactor(0)));
    if (turnPanel.bg) bandPaper.push(keep(turnPanel.bg.setDepth(OVERLAY_DEPTH.PANEL).setScrollFactor(0)));
    turnLabel = text(area.cx, turnY, '', {
      fontSize: '26px', color: '#3a2410', letterSpacing: 1,
    }).setOrigin(0.5);

    setBandVisible(false);
  }

  function setBandVisible(v) {
    if (!eq) return;
    for (const k of Object.keys(eq)) eq[k]?.setVisible(v);
    for (const o of bandPaper) o?.setVisible(v);
    turnLabel?.setVisible(v);
  }

  function buildAnswerButtons() {
    const y = area.bottom - 96;
    const btnW = Math.min(250, (area.w - 3 * 18 - 40) / 4);
    const gap = 18;
    const totalW = 4 * btnW + 3 * gap;
    const startX = area.cx - totalW / 2 + btnW / 2;
    answerBtns = [];
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (btnW + gap);
      const btn = PaperButton(scene, x, y, '?', {
        w: btnW, h: 88, color: ANSWER_COLORS[i], fontSize: 40, seed: 7000 + i * 211,
        onClick: () => pick(i),
      });
      placeButton(btn);
      // Geometry is kept because paperRect draws a Graphics, not a Rectangle:
      // there is no setFillStyle to recolour on a right/wrong mark, so the
      // mark is drawn as its own wash over the known rect instead.
      btn.rect = { x, y, w: btnW, h: 88 };
      answerBtns.push(btn);
    }
    setAnswerButtonsVisible(false);

    // The coach chip. Same warm amber "?" BattleScene uses, same job:
    // a rung of the hint ladder, never a block on answering.
    hintBtn = PaperButton(scene, area.right - 58, bandY - 8, '?', {
      w: 62, h: 62, color: 0xf0a83c, fontSize: 36, textColor: '#3a2410', seed: 7777,
      onClick: () => {
        if (!hintFn || answered) return;
        const hint = hintFn();
        if (!hint) toast('No more hints — you can do it!', PAPER_CSS.gold);
      },
    });
    placeButton(hintBtn);
    setBtnVisible(hintBtn, false);

    // Typed answers, for children who would rather write the number than
    // hunt for it. Opens ui/numpad.js — the same pad the 2D SPECIAL uses.
    typeBtn = PaperButton(scene, area.left + 58, bandY - 8, '123', {
      w: 78, h: 62, color: PAPER.teal, fontSize: 24, seed: 7778,
      onClick: () => openNumpad(),
    });
    placeButton(typeBtn);
    setBtnVisible(typeBtn, false);
  }

  function setBtnVisible(btn, v) {
    if (!btn) return;
    for (const k of ['shadow', 'bg', 'label', 'zone']) btn[k]?.setVisible(v);
    if (btn.zone) { if (v) btn.zone.setInteractive(); else btn.zone.disableInteractive(); }
  }

  function setAnswerButtonsVisible(v) {
    for (const b of answerBtns) setBtnVisible(b, v);
  }

  /** Wash one answer button green (right) or warm coral (wrong), briefly. */
  function mark(i, right) {
    const btn = answerBtns[i];
    if (!btn?.rect) return;
    const { x, y, w, h } = btn.rect;
    const wash = scene.add.rectangle(x, y, w, h, right ? PAPER.forestL : PAPER.coralD, 0.85)
      .setDepth(OVERLAY_DEPTH.BUTTON + 1).setScrollFactor(0);
    const glyph = scene.add.text(x, y, right ? '✓' : '✗', {
      fontFamily: FONT, fontSize: '52px', color: PAPER_CSS.cream, resolution: 2,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.BUTTON + 3).setScrollFactor(0);
    els.push(wash, glyph);
    scene.tweens.add({
      targets: [wash, glyph], alpha: 0, delay: 420, duration: 260,
      onComplete: () => {
        for (const o of [wash, glyph]) {
          const k = els.indexOf(o); if (k >= 0) els.splice(k, 1);
          if (o.scene) o.destroy();
        }
      },
    });
  }

  function pick(i) {
    if (answered || !answerFn || !currentQuestion) return;
    audio.play('ui/click');
    answered = true;
    answerFn(i);
  }

  /**
   * The typed pad. A typed value is matched back to the choice that carries
   * it, so the rules engine still receives an INDEX and battle3d's contract
   * is untouched. A number that is on nobody's button is simply wrong — which
   * is exactly what it is.
   */
  function openNumpad() {
    if (numpad || answered || !currentQuestion) return;
    setAnswerButtonsVisible(false);
    setBtnVisible(typeBtn, false);
    numpad = createNumpad(scene, {
      x: area.cx, y: area.cy + 40, depth: OVERLAY_DEPTH.HINT,
      allowMinus: true,
      onSubmit: (value) => {
        const idx = currentQuestion.choices.findIndex((c) => Number(c) === Number(value));
        closeNumpad();
        if (idx >= 0) { pick(idx); return; }
        // Wrong, and not on any button: hand the rules a wrong index so the
        // fight resolves it exactly as a mis-tap would.
        const wrong = currentQuestion.correctIndex === 0 ? 1 : 0;
        pick(wrong);
      },
    });
  }

  function closeNumpad() {
    if (!numpad) return;
    numpad.destroy();
    numpad = null;
    if (!answered && currentQuestion) {
      setAnswerButtonsVisible(true);
      setBtnVisible(typeBtn, true);
    }
  }

  // ── toasts ──────────────────────────────────────────────────────────

  function toast(message, color = PAPER_CSS.cream) {
    if (!live || !message) return;
    const y = area.bottom - 340 - toasts.length * 46;
    const t = scene.add.text(area.cx, y, String(message), {
      fontFamily: FONT, fontSize: '26px', color,
      backgroundColor: PAPER_CSS.inkTeal,
      padding: { x: 20, y: 10 },
      resolution: 2,
    }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.TOAST).setScrollFactor(0);
    toasts.push(t);
    els.push(t);
    scene.tweens.add({
      targets: t, y: y - 30, alpha: 0, delay: 1100, duration: 500,
      onComplete: () => {
        const i = toasts.indexOf(t); if (i >= 0) toasts.splice(i, 1);
        const j = els.indexOf(t); if (j >= 0) els.splice(j, 1);
        if (t.scene) t.destroy();
      },
    });
  }

  // ── the adapter battle3d calls ──────────────────────────────────────

  const ui = {
    onBattleBegin(info) {
      if (live) ui.destroy();
      live = true;
      answered = false;
      currentQuestion = null;
      buildVitals(info);
      buildBand(info.grade ?? 3);
      buildAnswerButtons();
      const names = info.enemies.map((e) => e.name).join(' & ');
      toast(info.isBoss ? `${names.toUpperCase()} — BOSS!` : `${names} blocks the way!`,
        PAPER_CSS.gold);
    },

    /**
     * FIGHT / MAGIC / GUARD. Sits where the answer row will be, so the
     * child's thumb never has to travel between choosing and answering.
     */
    showCommands(cmds, choose) {
      ui.hideCommands();
      setBandVisible(false);
      const n = Math.max(1, cmds.length);
      const w = 220, gap = 20;
      const totalW = n * w + (n - 1) * gap;
      const startX = area.cx - totalW / 2 + w / 2;
      const y = area.bottom - 96;
      const colors = [PAPER.coralD, PAPER.lavenderD, PAPER.tealD];
      commandBtns = cmds.map((cmd, i) => placeButton(PaperButton(
        scene, startX + i * (w + gap), y, String(cmd).toUpperCase(),
        {
          w, h: 88, color: colors[i % colors.length], fontSize: 30, seed: 8100 + i * 37,
          onClick: () => { audio.play('ui/click'); choose(cmd); },
        },
      )));
    },

    hideCommands() {
      for (const b of commandBtns) destroyButton(b);
      commandBtns = [];
    },

    showQuestion({ question, stars, hero, answer, hint }) {
      currentQuestion = question;
      answerFn = answer;
      hintFn = hint;
      answered = false;
      ui.hideHint();

      if (turnLabel) turnLabel.setText(`${(hero?.name || 'HERO').toUpperCase()}'S TURN`);
      setBandVisible(true);

      // The same four lines BattleScene writes, including the word-problem
      // and fraction shapes that carry their whole prompt in `text`.
      if (question.text) {
        eq.a.setText('');
        eq.opB.setText(question.text);
        eq.bar.setText('');
        eq.ans.setText('');
      } else {
        eq.a.setText(`  ${question.a}`);
        eq.opB.setText(`${opSymbol(question.op)} ${question.b}`);
        eq.bar.setText('─'.repeat(Math.max(3, String(Math.max(question.a, question.b)).length + 2)));
        eq.ans.setText('?');
      }
      const s = stars ?? question.stars ?? 0;
      eq.stars.setText(s ? '★'.repeat(s) + '☆'.repeat(Math.max(0, 5 - s)) : '');

      for (let i = 0; i < answerBtns.length; i++) {
        const has = i < question.choices.length;
        setBtnVisible(answerBtns[i], has);
        if (has) answerBtns[i].label.setText(String(question.choices[i]));
      }
      setBtnVisible(hintBtn, true);
      setBtnVisible(typeBtn, true);
    },

    hideQuestion() {
      currentQuestion = null;
      answerFn = null;
      hintFn = null;
      closeNumpad();
      setAnswerButtonsVisible(false);
      setBtnVisible(hintBtn, false);
      setBtnVisible(typeBtn, false);
      setBandVisible(false);
      if (turnLabel) turnLabel.setText('');
    },

    /**
     * Green wash + tick on the tapped button; a warm wash and the tick moved
     * to the right answer when it was wrong. Never a red X on the child's
     * choice alone — the correct one is always SHOWN, which is the whole
     * difference between a mistake and a telling-off.
     */
    markAnswer({ index, correct, correctIndex }) {
      mark(index, correct);
      if (!correct) mark(correctIndex, true);
      opts.onAnswer?.(correct);
    },

    /** The hint ladder's rung, in a cream panel the child dismisses. */
    showHint(hint) {
      if (!hint || !live) return;
      ui.hideHint();
      const w = 720, h = 240;
      const panel = PaperPanel(scene, area.cx, area.cy, w, h, {
        color: 0xfff6e2, alpha: 1, radius: 20, shadowOff: 6, shadowAlpha: 0.3,
      });
      const objs = [];
      if (panel.shadow) objs.push(panel.shadow.setDepth(OVERLAY_DEPTH.HINT - 1).setScrollFactor(0));
      if (panel.bg) objs.push(panel.bg.setDepth(OVERLAY_DEPTH.HINT).setScrollFactor(0));
      objs.push(scene.add.text(area.cx, area.cy - h / 2 + 34, `HINT ${hint.tier || 1}`, {
        fontFamily: FONT, fontSize: '22px', color: '#b06a10', resolution: 2,
      }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.HINT + 1).setScrollFactor(0));
      objs.push(scene.add.text(area.cx, area.cy + 10, String(hint.text || ''), {
        fontFamily: FONT, fontSize: '28px', color: '#3a2410',
        align: 'center', wordWrap: { width: w - 80 }, resolution: 2,
      }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.HINT + 1).setScrollFactor(0));
      const close = PaperButton(scene, area.cx, area.cy + h / 2 - 6, 'GOT IT', {
        w: 200, h: 58, color: PAPER.teal, fontSize: 24, seed: 7811,
        onClick: () => ui.hideHint(),
      });
      for (const k of ['shadow', 'bg', 'label', 'zone']) {
        if (close[k]) objs.push(close[k].setDepth(OVERLAY_DEPTH.HINT + 2).setScrollFactor(0));
      }
      for (const o of objs) els.push(o);
      hintPanel = objs;
      scene.time?.delayedCall?.(7000, () => ui.hideHint());
    },

    hideHint() {
      if (!hintPanel) return;
      for (const o of hintPanel) {
        const i = els.indexOf(o); if (i >= 0) els.splice(i, 1);
        if (o?.scene) o.destroy();
      }
      hintPanel = null;
    },

    /** A boss crossed a threshold — announce the act, loudly and briefly. */
    onBossPhase({ phase, beat }) {
      if (!live || !beat) return;
      const t = scene.add.text(area.cx, area.cy - 160, `${beat.title}\nPHASE ${phase}`, {
        fontFamily: FONT, fontSize: '46px', color: PAPER_CSS.gold,
        align: 'center', stroke: PAPER_CSS.inkTeal, strokeThickness: 8, resolution: 2,
      }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.BANNER).setScrollFactor(0).setScale(0.6);
      els.push(t);
      scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.out' });
      scene.tweens.add({
        targets: t, alpha: 0, delay: 1700, duration: 500,
        onComplete: () => {
          const i = els.indexOf(t); if (i >= 0) els.splice(i, 1);
          if (t.scene) t.destroy();
        },
      });
    },

    setHud(snap) {
      if (!snap || !vitals) return;
      updatePaperBar(vitals.momentum, Math.max(0, Math.min(1, snap.momentum ?? 0.5)), PAPER.gold);
      vitals.streakLabel.setText(snap.streak > 1 ? `STREAK ${snap.streak}` : '');
      for (const row of vitals.heroes) {
        const pct = Math.max(0, row.hero.hp) / Math.max(1, row.hero.maxHp);
        updatePaperBar(row.bar, pct, pct > 0.3 ? PAPER.forestL : PAPER.coralD);
        row.name.setAlpha(row.hero.hp > 0 ? 1 : 0.45);
      }
      for (const row of vitals.foes) {
        const pct = Math.max(0, row.enemy.hp) / Math.max(1, row.enemy.maxHp);
        updatePaperBar(row.bar, pct, PAPER.coral);
        const dead = row.enemy.hp <= 0;
        row.name.setAlpha(dead ? 0.35 : 1);
        row.plate.setAlpha(dead ? 0.4 : 0.82);
      }
    },

    toast,

    /** Gold flies from where the creature fell to the HUD purse. */
    flyReward({ gold, xp, from }) {
      if (!live) return;
      const dest = purseAt();
      const coin = scene.add.text(from?.x ?? area.cx, from?.y ?? area.cy, `+${gold}`, {
        fontFamily: FONT, fontSize: '40px', color: PAPER_CSS.gold,
        stroke: PAPER_CSS.inkTeal, strokeThickness: 6, resolution: 2,
      }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.BANNER).setScrollFactor(0);
      els.push(coin);
      scene.tweens.add({
        targets: coin, x: dest.x, y: dest.y, scale: 0.6, duration: 900, ease: 'Cubic.in',
        onComplete: () => {
          const i = els.indexOf(coin); if (i >= 0) els.splice(i, 1);
          if (coin.scene) coin.destroy();
          opts.onGold?.(gold);
        },
      });
      toast(`+${xp} XP`, PAPER_CSS.cream);
    },

    /**
     * The fight is over and the world has the camera back. The result card is
     * a BANNER, not a modal: the whole promise of the 3D battle is that play
     * never stops, so nothing here waits for a tap.
     */
    onBattleEnd() {
      ui.destroy();
    },

    /**
     * Victory / defeat headline. Called by the host after it has applied the
     * rewards, because only the host knows whether anybody levelled up.
     */
    banner(title, lines = [], color = PAPER_CSS.gold) {
      const objs = [];
      const y = area.cy - 60;
      const t = scene.add.text(area.cx, y, title, {
        fontFamily: FONT, fontSize: '64px', color,
        stroke: PAPER_CSS.inkTeal, strokeThickness: 9, resolution: 2,
      }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.BANNER).setScrollFactor(0).setScale(0.5);
      objs.push(t);
      if (lines.length) {
        objs.push(scene.add.text(area.cx, y + 66, lines.join('\n'), {
          fontFamily: FONT, fontSize: '30px', color: PAPER_CSS.cream,
          align: 'center', stroke: PAPER_CSS.inkTeal, strokeThickness: 5, resolution: 2,
        }).setOrigin(0.5).setDepth(OVERLAY_DEPTH.BANNER).setScrollFactor(0));
      }
      scene.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.out' });
      scene.tweens.add({
        targets: objs, alpha: 0, delay: 2200, duration: 600,
        onComplete: () => { for (const o of objs) if (o.scene) o.destroy(); },
      });
      return objs;
    },

    /** Is a fight's UI currently on screen? */
    isLive() { return live; },

    destroy() {
      live = false;
      closeNumpad();
      ui.hideHint();
      ui.hideCommands();
      toasts.length = 0;
      for (const o of els) {
        if (o?.scene) o.destroy();
        else if (o?.destroy && !o.scene) { try { o.destroy(); } catch { /* already gone */ } }
      }
      els = [];
      eq = null;
      bandPaper = [];
      turnLabel = null;
      answerBtns = [];
      hintBtn = null;
      typeBtn = null;
      vitals = null;
      currentQuestion = null;
      answerFn = null;
      hintFn = null;
    },
  };

  return ui;
}
