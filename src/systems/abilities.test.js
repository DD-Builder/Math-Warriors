import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, getAbility, invokeAbility } from './abilities.js';

function makeCtx(overrides = {}) {
  const enemy = {
    hp: 100, maxHp: 100, atk: 10, def: 5,
    ability: 'crown_tally', ...(overrides.enemy || {}),
  };
  const hero = { name: 'Hero', hp: 50, maxHp: 50, atk: 10, def: 5, class: 'knight' };
  const party = overrides.party || [hero, { ...hero, name: 'H2' }, { ...hero, name: 'H3' }];
  const toasts = [];
  const scene = {
    showToast: (msg, color) => toasts.push({ msg, color }),
    updateEnemyHp: () => {},
    updateAllHeroHp: () => {},
    _consumeNextTurn: false,
    streak: overrides.streak || 0,
    ...(overrides.scene || {}),
  };
  return { enemy, party, scene, activeHero: party[0], toasts };
}

describe('ability registry', () => {
  it('getAbility returns NOOP for unknown', () => {
    const ab = getAbility('nonexistent');
    assert.ok(ab);
    assert.equal(typeof ab.onBattleStart, 'undefined');
  });
  it('invokeAbility does not throw for unknown ability', () => {
    assert.doesNotThrow(() => invokeAbility('nonexistent', 'onBattleStart', makeCtx()));
  });
  it('every enemy ability name resolves to an object', () => {
    const names = [
      'sporulate', 'accumulate', 'shell_split', 'consume', 'crown_tally',
      'sweet_add', 'pressure', 'sting_drain', 'ink_cloud', 'drain_current',
      'abs_reduction', 'thunder_mul', 'volley', 'spin_up', 'clap_charge',
      'mass_matters', 'ash_divide', 'split_tongue', 'shard_volley', 'core_divide',
      'chill_snap', 'freeze_ray', 'blizzard', 'ice_armor', 'deep_freeze',
      'refract', 'crystal_burst', 'light_split', 'mirror_shield', 'shape_shift',
      'steal_gold', 'levy', 'price_hike', 'interest', 'fake_coins',
      'page_turn', 'smudge', 'riddle_me', 'silence', 'reversal',
      'op_shift', 'geo_lock', 'flip_page', 'phase_lock', 'the_unknown',
    ];
    for (const n of names) {
      const ab = getAbility(n);
      assert.ok(ab, `${n} should resolve`);
      assert.notEqual(ab, undefined, `${n} should not be undefined`);
    }
  });
});

// ── FLOOR 1 BOSS: crown_tally ──
describe('crown_tally (Briar King)', () => {
  it('onHeroWrong increases ATK', () => {
    const ctx = makeCtx();
    invokeAbility('crown_tally', 'onBattleStart', ctx);
    invokeAbility('crown_tally', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.atk, 11);
    assert.equal(ctx.enemy._crownStacks, 1);
  });
});

// ── FLOOR 2 BOSS: abs_reduction ──
describe('abs_reduction (The Pressure)', () => {
  it('onHeroWrong increases DEF', () => {
    const ctx = makeCtx({ enemy: { def: 5 } });
    invokeAbility('abs_reduction', 'onBattleStart', ctx);
    invokeAbility('abs_reduction', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.def, 6);
  });
});

// ── FLOOR 3 BOSS: mass_matters ──
describe('mass_matters (Skywhale)', () => {
  it('onHeroWrong adds DEF, onHeroCorrect reduces DEF', () => {
    const ctx = makeCtx({ enemy: { def: 5 } });
    invokeAbility('mass_matters', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.def, 7);
    invokeAbility('mass_matters', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.def, 6);
  });
});

// ── FLOOR 4 BOSS: core_divide ──
describe('core_divide (Pyroclast)', () => {
  it('enters core meltdown at 30% HP', () => {
    const ctx = makeCtx({ enemy: { hp: 29, maxHp: 100, atk: 20, def: 9 } });
    invokeAbility('core_divide', 'onBattleStart', ctx);
    invokeAbility('core_divide', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._corePhase, true);
    assert.equal(ctx.enemy.atk, 30);
    assert.equal(ctx.enemy.def, 0);
  });
  it('does not trigger above 30% HP', () => {
    const ctx = makeCtx({ enemy: { hp: 50, maxHp: 100, atk: 20, def: 9 } });
    invokeAbility('core_divide', 'onBattleStart', ctx);
    invokeAbility('core_divide', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._corePhase, false);
    assert.equal(ctx.enemy.atk, 20);
  });
});

// ── FLOOR 5 BOSS: deep_freeze ──
describe('deep_freeze (Absolute Zero)', () => {
  it('builds freeze stacks on wrong answers', () => {
    const ctx = makeCtx();
    invokeAbility('deep_freeze', 'onBattleStart', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._freezeStacks, 1);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._freezeStacks, 2);
  });
  it('triggers DEEP FREEZE at 3 stacks, resets to 0', () => {
    const ctx = makeCtx();
    invokeAbility('deep_freeze', 'onBattleStart', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    const defBefore = ctx.activeHero.def;
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._freezeStacks, 0);
    assert.equal(ctx.activeHero.def, defBefore - 3);
  });
  it('correct answers reduce stacks', () => {
    const ctx = makeCtx();
    invokeAbility('deep_freeze', 'onBattleStart', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    invokeAbility('deep_freeze', 'onHeroWrong', ctx);
    invokeAbility('deep_freeze', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._freezeStacks, 1);
  });
});

// ── FLOOR 6 BOSS: shape_shift ──
describe('shape_shift (The Prism)', () => {
  it('initializes base stats', () => {
    const ctx = makeCtx({ enemy: { atk: 24, def: 16 } });
    invokeAbility('shape_shift', 'onBattleStart', ctx);
    assert.equal(ctx.enemy._shiftCount, 0);
    assert.equal(ctx.enemy._baseAtk, 24);
    assert.equal(ctx.enemy._baseDef, 16);
  });
  it('shifts form every 3 correct answers', () => {
    const ctx = makeCtx({ enemy: { atk: 24, def: 16 } });
    invokeAbility('shape_shift', 'onBattleStart', ctx);
    invokeAbility('shape_shift', 'onHeroCorrect', ctx);
    invokeAbility('shape_shift', 'onHeroCorrect', ctx);
    invokeAbility('shape_shift', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._shiftCount, 3);
    assert.ok(ctx.toasts.length > 0);
  });
  it('wrong answers increase both ATK and DEF', () => {
    const ctx = makeCtx({ enemy: { atk: 24, def: 16 } });
    invokeAbility('shape_shift', 'onBattleStart', ctx);
    invokeAbility('shape_shift', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy.atk, 25);
    assert.equal(ctx.enemy.def, 17);
  });
});

// ── FLOOR 7 BOSS: fake_coins ──
describe('fake_coins (The Counterfeiter)', () => {
  it('plants fakes on wrong answers (consume + stack)', () => {
    const ctx = makeCtx();
    invokeAbility('fake_coins', 'onBattleStart', ctx);
    invokeAbility('fake_coins', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._fakeStacks, 1);
    assert.equal(ctx.scene._consumeNextTurn, true);
  });
  it('correct answers reduce fakes', () => {
    const ctx = makeCtx();
    invokeAbility('fake_coins', 'onBattleStart', ctx);
    ctx.enemy._fakeStacks = 2;
    invokeAbility('fake_coins', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._fakeStacks, 1);
  });
  it('3+ fakes trigger ATK surge on correct', () => {
    const ctx = makeCtx({ enemy: { atk: 25 } });
    invokeAbility('fake_coins', 'onBattleStart', ctx);
    ctx.enemy._fakeStacks = 4;
    invokeAbility('fake_coins', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.atk, 28);
    assert.equal(ctx.enemy._fakeStacks, 0);
  });
});

// ── FLOOR 8 BOSS: reversal ──
describe('reversal (The Paradox)', () => {
  it('starts in normal mode', () => {
    const ctx = makeCtx({ enemy: { atk: 26, def: 18 } });
    invokeAbility('reversal', 'onBattleStart', ctx);
    assert.equal(ctx.enemy._reversalMode, 'normal');
    assert.equal(ctx.enemy._reversalTimer, 0);
  });
  it('swaps ATK/DEF after 4 correct answers', () => {
    const ctx = makeCtx({ enemy: { atk: 26, def: 18 } });
    invokeAbility('reversal', 'onBattleStart', ctx);
    for (let i = 0; i < 4; i++) invokeAbility('reversal', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._reversalMode, 'reversed');
    assert.equal(ctx.enemy.atk, 18);
    assert.equal(ctx.enemy.def, 26);
  });
  it('reverts after another 4 correct', () => {
    const ctx = makeCtx({ enemy: { atk: 26, def: 18 } });
    invokeAbility('reversal', 'onBattleStart', ctx);
    for (let i = 0; i < 8; i++) invokeAbility('reversal', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._reversalMode, 'normal');
    assert.equal(ctx.enemy.atk, 26);
    assert.equal(ctx.enemy.def, 18);
  });
  it('wrong answers add +2 to timer and +1 ATK, swap on next correct', () => {
    const ctx = makeCtx({ enemy: { atk: 26, def: 18 } });
    invokeAbility('reversal', 'onBattleStart', ctx);
    invokeAbility('reversal', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._reversalTimer, 2);
    assert.equal(ctx.enemy.atk, 27);
    invokeAbility('reversal', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._reversalTimer, 4);
    assert.equal(ctx.enemy.atk, 28);
    assert.equal(ctx.enemy._reversalMode, 'normal');
    invokeAbility('reversal', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._reversalMode, 'reversed');
    assert.equal(ctx.enemy.atk, 18);
    assert.equal(ctx.enemy.def, 28);
  });
});

// ── FLOOR 9 BOSS: the_unknown ──
describe('the_unknown (The Theorem)', () => {
  it('evolves every 4 correct answers', () => {
    const ctx = makeCtx({ enemy: { atk: 24, def: 12 } });
    invokeAbility('the_unknown', 'onBattleStart', ctx);
    for (let i = 0; i < 4; i++) invokeAbility('the_unknown', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy.atk, 26);
    assert.equal(ctx.enemy.def, 13);
  });
  it('wrong answers accelerate phase + add ATK', () => {
    const ctx = makeCtx({ enemy: { atk: 24, def: 12 } });
    invokeAbility('the_unknown', 'onBattleStart', ctx);
    invokeAbility('the_unknown', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._unknownPhase, 2);
    assert.equal(ctx.enemy.atk, 25);
  });
});

// ── MOB ABILITIES: spot-check a few ──
describe('mob abilities (floors 5-8)', () => {
  it('chill_snap reduces hero ATK', () => {
    const ctx = makeCtx();
    invokeAbility('chill_snap', 'onHeroWrong', ctx);
    assert.equal(ctx.activeHero.atk, 9);
  });
  it('blizzard damages all heroes', () => {
    const ctx = makeCtx();
    invokeAbility('blizzard', 'onHeroWrong', ctx);
    ctx.party.forEach(h => assert.equal(h.hp, 48));
  });
  it('ice_armor starts with 3 layers, correct cracks them', () => {
    const ctx = makeCtx();
    invokeAbility('ice_armor', 'onBattleStart', ctx);
    assert.equal(ctx.enemy._iceShield, 3);
    invokeAbility('ice_armor', 'onHeroCorrect', ctx);
    assert.equal(ctx.enemy._iceShield, 2);
    assert.equal(ctx.enemy.def, 7);
  });
  it('crystal_burst does 5 damage on wrong', () => {
    const ctx = makeCtx();
    ctx.activeHero.hp = 30;
    invokeAbility('crystal_burst', 'onHeroWrong', ctx);
    assert.equal(ctx.activeHero.hp, 25);
  });
  it('mirror_shield reflects then drops', () => {
    const ctx = makeCtx();
    invokeAbility('mirror_shield', 'onBattleStart', ctx);
    assert.equal(ctx.enemy._mirrorUp, true);
    ctx.activeHero.hp = 30;
    invokeAbility('mirror_shield', 'onHeroCorrect', ctx);
    assert.equal(ctx.activeHero.hp, 27);
    assert.equal(ctx.enemy._mirrorUp, false);
  });
  it('steal_gold reduces hero ATK', () => {
    const ctx = makeCtx();
    invokeAbility('steal_gold', 'onHeroWrong', ctx);
    assert.equal(ctx.activeHero.atk, 9);
  });
  it('smudge sets consumeNextTurn', () => {
    const ctx = makeCtx();
    invokeAbility('smudge', 'onHeroWrong', ctx);
    assert.equal(ctx.scene._consumeNextTurn, true);
  });
  it('silence reduces all hero ATK', () => {
    const ctx = makeCtx();
    invokeAbility('silence', 'onHeroWrong', ctx);
    ctx.party.forEach(h => assert.equal(h.atk, 9));
  });
  it('riddle_me triggers at 2 wrong, resets on correct', () => {
    const ctx = makeCtx({ enemy: { atk: 10 } });
    invokeAbility('riddle_me', 'onBattleStart', ctx);
    invokeAbility('riddle_me', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._riddleCount, 1);
    assert.equal(ctx.enemy.atk, 10);
    invokeAbility('riddle_me', 'onHeroWrong', ctx);
    assert.equal(ctx.enemy._riddleCount, 0);
    assert.equal(ctx.enemy.atk, 13);
  });
});
