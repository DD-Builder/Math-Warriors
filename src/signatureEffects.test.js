/**
 * Unit tests for src/systems/signatureEffects.js
 *
 * All tests are deterministic: the dodge roll takes an injected rng,
 * and every other hook is pure given its inputs. Heroes are spawned
 * from the real roster so signature values stay in sync with data.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSignatureState,
  onHeroDamageDealt,
  onHeroDamageReceived,
  checkLastStand,
  onTurnStart,
  onEnemyTurnStart,
  applyBurnOnAttack,
  getSplashDamage,
  getEffectiveAtk,
  getEffectiveDef,
} from './systems/signatureEffects.js';
import { spawnHero } from './data/heroes.js';

/** Spawn a roster hero at a given level (level defaults to 1 like the scene). */
function hero(id, level = 1) {
  const h = spawnHero(id);
  assert.ok(h, `roster hero ${id} should exist`);
  h.level = level;
  return h;
}

// ------------------------------------------------------------------
// createSignatureState
// ------------------------------------------------------------------

describe('createSignatureState', () => {
  test('initializes per-hero flag arrays sized to the party', () => {
    const party = [hero('knight-shadow'), hero('bunny-pepper'), hero('wizard-stargazer')];
    const state = createSignatureState(party);
    assert.equal(state.lastStandUsed.length, 3);
    assert.deepEqual(state.lastStandUsed, [false, false, false]);
    assert.deepEqual(state.doubleDefActive, [true, true, true]);
    assert.equal(state.firstStrikeUsed, false);
    assert.deepEqual(state.burns, []);
  });

  test('revealWrong activates only when Stargazer is level 5+', () => {
    const low = createSignatureState([hero('wizard-stargazer', 4)]);
    assert.equal(low.revealWrongActive, false);

    const high = createSignatureState([hero('wizard-stargazer', 5)]);
    assert.equal(high.revealWrongActive, true);
  });

  test('Stargazer with no level defaults to level 1 (no reveal)', () => {
    const star = hero('wizard-stargazer');
    delete star.level;
    const state = createSignatureState([star]);
    assert.equal(state.revealWrongActive, false);
  });

  test('timer bonus applied when Bookworm is present', () => {
    const state = createSignatureState([hero('wizard-bookworm'), hero('knight-shadow')]);
    assert.equal(state.timerBonusSeconds, 5);
  });

  test('timer bonus is 0 without Bookworm and stacks if duplicated', () => {
    const none = createSignatureState([hero('knight-shadow')]);
    assert.equal(none.timerBonusSeconds, 0);

    const doubled = createSignatureState([hero('wizard-bookworm'), hero('wizard-bookworm')]);
    assert.equal(doubled.timerBonusSeconds, 10);
  });

  test('tolerates null slots and heroes without signatures', () => {
    const bare = { ...hero('knight-shadow'), signature: null };
    const state = createSignatureState([null, bare]);
    assert.equal(state.revealWrongActive, false);
    assert.equal(state.timerBonusSeconds, 0);
  });
});

// ------------------------------------------------------------------
// onHeroDamageDealt
// ------------------------------------------------------------------

describe('onHeroDamageDealt', () => {
  const enemy = { hp: 50, maxHp: 50 };

  test('hero without signature deals unmodified damage', () => {
    const plain = { ...hero('knight-shadow'), signature: null };
    assert.equal(onHeroDamageDealt(plain, enemy, 10, { battleState: {} }), 10);
  });

  test('Spellblade hybridDamage multiplies damage by 1.5', () => {
    const blade = hero('wizard-spellblade');
    const state = createSignatureState([blade]);
    assert.equal(onHeroDamageDealt(blade, enemy, 10, { battleState: state }), 15);
    // rounds, never truncates
    assert.equal(onHeroDamageDealt(blade, enemy, 9, { battleState: state }), Math.round(9 * 1.5));
  });

  test('Pepper firstStrike boosts the first attack only', () => {
    const pepper = hero('bunny-pepper');
    const state = createSignatureState([pepper]);

    const first = onHeroDamageDealt(pepper, enemy, 10, { battleState: state });
    assert.equal(first, 12); // 10 * (1 + 0.2)
    assert.equal(state.firstStrikeUsed, true);

    const second = onHeroDamageDealt(pepper, enemy, 10, { battleState: state });
    assert.equal(second, 10);
  });

  test('Grand Mage hardBonus triples damage on 4-5 star questions only', () => {
    const mage = hero('wizard-grandmage');
    const state = createSignatureState([mage]);

    assert.equal(onHeroDamageDealt(mage, enemy, 10, { battleState: state, questionStars: 3 }), 10);
    assert.equal(onHeroDamageDealt(mage, enemy, 10, { battleState: state, questionStars: 4 }), 30);
    assert.equal(onHeroDamageDealt(mage, enemy, 10, { battleState: state, questionStars: 5 }), 30);
  });

  test('null hero returns base damage', () => {
    assert.equal(onHeroDamageDealt(null, enemy, 7, { battleState: {} }), 7);
  });
});

// ------------------------------------------------------------------
// onHeroDamageReceived
// ------------------------------------------------------------------

describe('onHeroDamageReceived', () => {
  const attacker = { atk: 12 };

  test('Shadow dodges when the rng rolls under 0.3', () => {
    const shadow = hero('knight-shadow');
    const ctx = { party: [shadow], battleState: createSignatureState([shadow]), heroIndex: 0 };

    const dodged = onHeroDamageReceived(shadow, attacker, 10, ctx, () => 0.29);
    assert.equal(dodged.dodged, true);
    assert.equal(dodged.damage, 0);
  });

  test('Shadow does not dodge when the rng rolls 0.3 or above', () => {
    const shadow = hero('knight-shadow');
    const ctx = { party: [shadow], battleState: createSignatureState([shadow]), heroIndex: 0 };

    const hit = onHeroDamageReceived(shadow, attacker, 10, ctx, () => 0.3);
    assert.equal(hit.dodged, false);
    assert.equal(hit.damage, 10);
  });

  test('Crusader partyDamageReduce shaves 15% off damage to allies', () => {
    const crusader = hero('knight-crusader');
    const pepper = hero('bunny-pepper');
    const party = [crusader, pepper];
    const state = createSignatureState(party);

    const r = onHeroDamageReceived(pepper, attacker, 20, { party, battleState: state, heroIndex: 1 }, () => 0.99);
    assert.equal(r.damage, 17); // round(20 * 0.85)
  });

  test('Crusader aura does not protect a dead Crusader party', () => {
    const crusader = hero('knight-crusader');
    crusader.hp = 0;
    const pepper = hero('bunny-pepper');
    const party = [crusader, pepper];

    const r = onHeroDamageReceived(pepper, attacker, 20, { party, battleState: createSignatureState(party), heroIndex: 1 }, () => 0.99);
    assert.equal(r.damage, 20);
  });

  test('Crusader aura does not apply to the Crusader herself', () => {
    const crusader = hero('knight-crusader');
    const party = [crusader];

    const r = onHeroDamageReceived(crusader, attacker, 20, { party, battleState: createSignatureState(party), heroIndex: 0 }, () => 0.99);
    assert.equal(r.damage, 20);
  });

  test('Boulder doubleDef reduces the first hit of the turn only', () => {
    const boulder = hero('bunny-boulder'); // def 13
    const party = [boulder];
    const state = createSignatureState(party);
    const ctx = { party, battleState: state, heroIndex: 0 };
    const defReduction = Math.round(boulder.def * 0.3);

    const first = onHeroDamageReceived(boulder, attacker, 20, ctx, () => 0.99);
    assert.equal(first.damage, 20 - defReduction);
    assert.equal(state.doubleDefActive[0], false);

    const second = onHeroDamageReceived(boulder, attacker, 20, ctx, () => 0.99);
    assert.equal(second.damage, 20);
  });

  test('onTurnStart re-arms Boulder doubleDef', () => {
    const boulder = hero('bunny-boulder');
    const party = [boulder];
    const state = createSignatureState(party);
    const ctx = { party, battleState: state, heroIndex: 0 };

    onHeroDamageReceived(boulder, attacker, 20, ctx, () => 0.99);
    assert.equal(state.doubleDefActive[0], false);
    onTurnStart(party, state);
    assert.equal(state.doubleDefActive[0], true);

    const rearmed = onHeroDamageReceived(boulder, attacker, 20, ctx, () => 0.99);
    assert.equal(rearmed.damage, 20 - Math.round(boulder.def * 0.3));
  });

  test('damage never reduced below 1 by stacked reductions', () => {
    const crusader = hero('knight-crusader');
    const boulder = hero('bunny-boulder');
    const party = [crusader, boulder];
    const state = createSignatureState(party);

    const r = onHeroDamageReceived(boulder, attacker, 2, { party, battleState: state, heroIndex: 1 }, () => 0.99);
    assert.ok(r.damage >= 1, `expected >= 1, got ${r.damage}`);
  });
});

// ------------------------------------------------------------------
// checkLastStand
// ------------------------------------------------------------------

describe('checkLastStand', () => {
  test('Great Helm survives a lethal hit once at 1 HP', () => {
    const helm = hero('knight-greathelm');
    const state = createSignatureState([helm]);

    helm.hp = 0;
    assert.equal(checkLastStand(helm, 0, state), true);
    assert.equal(helm.hp, 1);
    assert.equal(state.lastStandUsed[0], true);
  });

  test('second lethal hit kills Great Helm for good', () => {
    const helm = hero('knight-greathelm');
    const state = createSignatureState([helm]);

    helm.hp = 0;
    checkLastStand(helm, 0, state);
    helm.hp = -3;
    assert.equal(checkLastStand(helm, 0, state), false);
    assert.equal(helm.hp, -3);
  });

  test('does not fire while the hero is still alive', () => {
    const helm = hero('knight-greathelm');
    const state = createSignatureState([helm]);
    assert.equal(checkLastStand(helm, 0, state), false);
    assert.equal(state.lastStandUsed[0], false);
  });

  test('heroes without lastStand stay dead', () => {
    const pepper = hero('bunny-pepper');
    const state = createSignatureState([pepper]);
    pepper.hp = 0;
    assert.equal(checkLastStand(pepper, 0, state), false);
    assert.equal(pepper.hp, 0);
  });
});

// ------------------------------------------------------------------
// getEffectiveAtk / getEffectiveDef
// ------------------------------------------------------------------

describe('getEffectiveAtk', () => {
  test('Berserker rageAtk grows as HP drops (+2 per 10 HP lost)', () => {
    const zerker = hero('knight-berserker'); // atk 17, maxHp 50
    const party = [zerker];

    assert.equal(getEffectiveAtk(zerker, party), zerker.atk); // full HP

    zerker.hp = zerker.maxHp - 9;  // < 10 lost, no step yet
    assert.equal(getEffectiveAtk(zerker, party), zerker.atk);

    zerker.hp = zerker.maxHp - 10;
    assert.equal(getEffectiveAtk(zerker, party), zerker.atk + 2);

    zerker.hp = zerker.maxHp - 25;
    assert.equal(getEffectiveAtk(zerker, party), zerker.atk + 4);

    zerker.hp = 1; // 49 lost -> 4 steps
    assert.equal(getEffectiveAtk(zerker, party), zerker.atk + 8);
  });

  test('rageAtk is monotone: lower HP never lowers ATK', () => {
    const zerker = hero('knight-berserker');
    let prev = -Infinity;
    for (let hp = zerker.maxHp; hp >= 1; hp--) {
      zerker.hp = hp;
      const atk = getEffectiveAtk(zerker, [zerker]);
      assert.ok(atk >= prev || hp === zerker.maxHp, `atk dropped at hp ${hp}`);
      prev = Math.max(prev, atk);
    }
  });

  test('Duchess leaderAura buffs other heroes but not herself', () => {
    const duchess = hero('bunny-duchess');
    const pepper = hero('bunny-pepper');
    const party = [duchess, pepper];

    assert.equal(getEffectiveAtk(pepper, party), pepper.atk + 1);
    assert.equal(getEffectiveAtk(duchess, party), duchess.atk);
    assert.equal(getEffectiveDef(pepper, party), pepper.def + 1);
    assert.equal(getEffectiveDef(duchess, party), duchess.def);
  });

  test('a dead Duchess grants no aura', () => {
    const duchess = hero('bunny-duchess');
    duchess.hp = 0;
    const pepper = hero('bunny-pepper');
    assert.equal(getEffectiveAtk(pepper, [duchess, pepper]), pepper.atk);
  });

  test('null hero yields 0 ATK', () => {
    assert.equal(getEffectiveAtk(null, []), 0);
  });
});

// ------------------------------------------------------------------
// Poison / burn ticks (onEnemyTurnStart)
// ------------------------------------------------------------------

describe('onEnemyTurnStart poison and burn ticks', () => {
  test('Toadstool poison ticks every living enemy, skips dead ones', () => {
    const toad = hero('wizard-toadstool');
    const party = [toad];
    const state = createSignatureState(party);
    const enemies = [{ hp: 10 }, { hp: 0 }, { hp: 5 }];

    const ticks = onEnemyTurnStart(enemies, party, state);
    assert.deepEqual(ticks, [
      { enemyIndex: 0, damage: 3, type: 'poison' },
      { enemyIndex: 2, damage: 3, type: 'poison' },
    ]);
  });

  test('a downed Toadstool does not poison', () => {
    const toad = hero('wizard-toadstool');
    toad.hp = 0;
    const state = createSignatureState([toad]);
    assert.deepEqual(onEnemyTurnStart([{ hp: 10 }], [toad], state), []);
  });

  test('Blaze burn ticks for 2 turns then expires', () => {
    const blaze = hero('bunny-blaze');
    const party = [blaze];
    const state = createSignatureState(party);
    const enemies = [{ hp: 30 }];

    applyBurnOnAttack(blaze, 0, state);
    assert.deepEqual(state.burns, [{ enemyIndex: 0, damage: 2, turnsLeft: 2 }]);

    const tick1 = onEnemyTurnStart(enemies, party, state);
    assert.deepEqual(tick1, [{ enemyIndex: 0, damage: 2, type: 'burn' }]);

    const tick2 = onEnemyTurnStart(enemies, party, state);
    assert.deepEqual(tick2, [{ enemyIndex: 0, damage: 2, type: 'burn' }]);

    const tick3 = onEnemyTurnStart(enemies, party, state);
    assert.deepEqual(tick3, []);
    assert.deepEqual(state.burns, []);
  });

  test('re-attacking refreshes the burn instead of stacking it', () => {
    const blaze = hero('bunny-blaze');
    const state = createSignatureState([blaze]);

    applyBurnOnAttack(blaze, 0, state);
    onEnemyTurnStart([{ hp: 30 }], [blaze], state); // burns down to 1 turn
    applyBurnOnAttack(blaze, 0, state);              // refresh

    assert.equal(state.burns.length, 1);
    assert.equal(state.burns[0].turnsLeft, 2);
  });

  test('burn on a dead enemy does not tick', () => {
    const blaze = hero('bunny-blaze');
    const state = createSignatureState([blaze]);
    applyBurnOnAttack(blaze, 0, state);
    assert.deepEqual(onEnemyTurnStart([{ hp: 0 }], [blaze], state), []);
  });
});

// ------------------------------------------------------------------
// Nova splash (bonus coverage — deterministic streak input)
// ------------------------------------------------------------------

describe('getSplashDamage', () => {
  test('Nova splashes 30% to other living enemies at streak 3+', () => {
    const nova = hero('bunny-nova');
    const enemies = [{ hp: 20 }, { hp: 20 }, { hp: 0 }];
    const splashes = getSplashDamage(nova, 0, 10, enemies, 3);
    assert.deepEqual(splashes, [{ enemyIndex: 1, damage: 3 }]);
  });

  test('no splash below the streak threshold', () => {
    const nova = hero('bunny-nova');
    assert.deepEqual(getSplashDamage(nova, 0, 10, [{ hp: 20 }, { hp: 20 }], 2), []);
  });
});
