/**
 * On-screen number pad for FILL-IN answers — the input surface behind
 * the momentum SPECIAL (and, later, math doors). Typing the answer
 * instead of picking from four buttons is the point: it gates the
 * game's flashiest moment on real recall.
 *
 * The input logic lives in a pure reducer so it can be unit-tested
 * without Phaser; the view is a 3x4 PaperButton grid with a big typed
 * display and hardware-keyboard capture.
 */

import { PaperButton, PaperPanel } from './paperUI.js';
import { audio } from '../systems/audio.js';

export const NUMPAD_MAX_LEN = 6;

/** Pure input reducer. State: { value: string }. */
export function numpadReducer(state, key, opts = {}) {
  const maxLen = opts.maxLen ?? NUMPAD_MAX_LEN;
  const allowMinus = opts.allowMinus ?? false;
  let v = state.value || '';
  if (key >= '0' && key <= '9') {
    if (v === '0') v = key;               // collapse leading zero
    else if (v === '-0') v = '-' + key;
    else if (v.replace('-', '').length < maxLen) v = v + key;
  } else if (key === 'back') {
    v = v.slice(0, -1);
  } else if (key === 'clear') {
    v = '';
  } else if (key === 'minus' && allowMinus) {
    v = v.startsWith('-') ? v.slice(1) : '-' + v;
  }
  return { value: v };
}

/** Parsed numeric value, or null while empty/'-'. */
export function numpadValue(state) {
  const v = state.value;
  if (!v || v === '-') return null;
  return parseInt(v, 10);
}

/**
 * Build the numpad UI. Returns { setEnabled, getValue, clear, destroy }.
 * Layout: value display on top, 3x4 grid (1-9 / clear,0,back), big
 * submit button on the right.
 */
export function createNumpad(scene, { x, y, onSubmit, allowMinus = false, depth = 25 } = {}) {
  let state = { value: '' };
  const objs = [];
  const BTN = 92, GAP = 10;

  const panel = PaperPanel(scene, x, y, BTN * 4 + GAP * 5 + 130, BTN * 4 + GAP * 5 + 80, {
    color: 0xfff4e0, alpha: 0.97, radius: 20,
  });
  for (const k of ['bg', 'shadow']) if (panel[k]) { panel[k].setDepth(depth - 1).setScrollFactor(0); objs.push(panel[k]); }

  const display = scene.add.text(x, y - BTN * 1.9, '_', {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: '58px', color: '#2a1a08',
  }).setOrigin(0.5).setDepth(depth + 1).setScrollFactor(0);
  objs.push(display);

  let submitBtn = null;
  const refresh = () => {
    display.setText(state.value === '' ? '_' : state.value);
    const ready = numpadValue(state) != null;
    if (submitBtn?.label) submitBtn.label.setAlpha(ready ? 1 : 0.4);
  };

  const press = (key) => {
    audio.play('ui/click');
    state = numpadReducer(state, key, { allowMinus });
    refresh();
  };

  const KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['C', '0', '⌫']];
  KEYS.forEach((row, r) => {
    row.forEach((label, c) => {
      const bx = x - (BTN + GAP) + c * (BTN + GAP) - 60;
      const by = y - BTN * 1.1 + r * (BTN * 0.72 + GAP);
      const key = label === 'C' ? 'clear' : label === '⌫' ? 'back' : label;
      const btn = PaperButton(scene, bx, by, label, {
        w: BTN, h: BTN * 0.66, color: label === 'C' ? 0xc06840 : label === '⌫' ? 0x8a6a4a : 0x4a7ab8,
        fontSize: 26, seed: 9000 + r * 17 + c * 3,
        onClick: () => press(key),
      });
      for (const k of ['shadow', 'bg', 'label', 'zone']) {
        if (btn[k]) { btn[k].setDepth(depth + (k === 'zone' || k === 'label' ? 2 : k === 'bg' ? 1 : 0)).setScrollFactor(0); objs.push(btn[k]); }
      }
    });
  });

  submitBtn = PaperButton(scene, x + BTN * 1.7, y - BTN * 0.05, 'GO!', {
    w: 110, h: BTN * 2.1, color: 0x4aa848, fontSize: 34, seed: 9777,
    onClick: () => {
      const v = numpadValue(state);
      if (v == null) return;
      audio.play('ui/confirm');
      onSubmit?.(v);
    },
  });
  for (const k of ['shadow', 'bg', 'label', 'zone']) {
    if (submitBtn[k]) { submitBtn[k].setDepth(depth + (k === 'zone' || k === 'label' ? 2 : k === 'bg' ? 1 : 0)).setScrollFactor(0); objs.push(submitBtn[k]); }
  }

  // Hardware keyboard support
  const onKey = (ev) => {
    if (ev.key >= '0' && ev.key <= '9') press(ev.key);
    else if (ev.key === 'Backspace') press('back');
    else if (ev.key === 'Escape') press('clear');
    else if (ev.key === '-') press('minus');
    else if (ev.key === 'Enter') {
      const v = numpadValue(state);
      if (v != null) { audio.play('ui/confirm'); onSubmit?.(v); }
    }
  };
  scene.input.keyboard?.on('keydown', onKey);

  refresh();
  return {
    getValue: () => numpadValue(state),
    clear: () => { state = { value: '' }; refresh(); },
    destroy: () => {
      scene.input.keyboard?.off('keydown', onKey);
      objs.forEach(o => o.destroy());
    },
  };
}
