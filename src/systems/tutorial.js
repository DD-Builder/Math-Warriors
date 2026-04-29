/**
 * Tutorial manager — shows one-time hints for new players.
 *
 * Each tutorial triggers once per save file. Uses a bitmask stored
 * in save.stats.tutorialFlags to track which have been shown.
 */

import { loadSave, writeSave } from './save.js';

const FLAGS = {
  FIRST_MOVE:   1,
  FIRST_BATTLE: 2,
  FIRST_CHEST:  4,
  FIRST_WRONG:  8,
  FIRST_SHOP:   16,
  FIRST_FAIRY:  32,
};

const TIPS = {
  FIRST_MOVE:   'Tap on a path tile next to you to move!',
  FIRST_BATTLE: 'Pick the right answer to attack the enemy!',
  FIRST_CHEST:  'You found a chest! Earn gold to spend at the shop.',
  FIRST_WRONG:  "Don't worry — try again next turn! You got this!",
  FIRST_SHOP:   'Welcome to the shop! Spend gold on upgrades.',
  FIRST_FAIRY:  'A fairy chest! Free all 3 fairies to unlock the golden treasure.',
};

export function shouldShowTutorial(key) {
  const save = loadSave();
  const flags = save.stats.tutorialFlags || 0;
  const flag = FLAGS[key];
  if (!flag) return false;
  return (flags & flag) === 0;
}

export function markTutorialShown(key) {
  const save = loadSave();
  const flag = FLAGS[key];
  if (!flag) return;
  save.stats.tutorialFlags = (save.stats.tutorialFlags || 0) | flag;
  writeSave(save);
}

export function getTutorialText(key) {
  return TIPS[key] || '';
}

export { FLAGS as TUTORIAL_FLAGS };
