/**
 * THE WIRING TEST.
 *
 * battle3d.test.js proves the staging is right. battleRules.test.js proves the
 * numbers are right. Neither proves the thing that was actually broken for a
 * whole release: that the two are CONNECTED — that a fight staged in the 3D
 * world ends by paying the child the same gold, the same XP, the same level-up
 * and the same floor completion the 2D battle would have paid.
 *
 * So this file drives a whole fight headlessly, end to end, through exactly the
 * calls OverworldScene makes:
 *
 *     createBattle3D(...)            ← overworld/index.js
 *         .begin(composeEncounter()) ← OverworldScene._startBattle
 *         → ui.showQuestion / answer ← overworld/battleOverlay3d.js
 *         → hooks.onVictory(result)  ← OverworldScene._onBattleVictory
 *             → applyBattleVictory   ← systems/battleRules.js
 *
 * If anybody re-wires the encounter path back to the 2D BattleScene, or drops
 * the reward call on the way out, this goes red.
 *
 * It runs under plain `node --test` with no WebGL context: three.js builds its
 * scene graph fine without a renderer, and every number here is CPU-side.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createBattle3D, PHASE } from './battle3d.js';
import {
  composeEncounter, applyBattleVictory, applyBattleDefeat, battleRewards,
} from '../systems/battleRules.js';
import { spawnHero, KNIGHTS, WIZARDS, BUNNIES } from '../data/heroes.js';
import { phaseForHp } from '../systems/bossPhases.js';

function freshSave() {
  return {
    gold: 100,
    grade: 3,
    party: [],
    unlockedHeroes: ['knight-shadow'],
    floors: Array.from({ length: 9 }, (_, i) => ({
      id: i + 1, unlocked: i === 0, complete: false, bestStreak: 0,
    })),
    stats: { totalBattles: 0, totalCorrect: 0, totalWrong: 0 },
    settings: {},
    quests: null,
  };
}

/**
 * A fight rigged the way OverworldScene rigs one, with a scripted child.
 *
 * @param {object} o
 * @param {'right'|'wrong'} [o.policy] how the "child" answers
 */
function stageFight({ policy = 'right', encounter = {}, save = null, party = null } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);
  camera.position.set(0, 3, -8);

  const seen = { questions: 0, hud: 0, boss: [], ended: null, victory: null, defeat: null };
  let queued = null;

  // The overlay's contract, reduced to the four calls that carry the fight.
  const ui = {
    onBattleBegin() {},
    showCommands(cmds, pick) { pick(cmds[0]); },
    showQuestion({ question, answer }) {
      seen.questions++;
      queued = () => answer(policy === 'right'
        ? question.correctIndex
        : (question.correctIndex + 1) % question.choices.length);
    },
    hideQuestion() {},
    hideCommands() {},
    markAnswer() {},
    onBossPhase(p) { seen.boss.push(p.phase); },
    setHud() { seen.hud++; },
    toast() {},
    flyReward() {},
    onBattleEnd(r) { seen.ended = r; },
  };

  const heroes = party || [
    spawnHero(KNIGHTS[0].id), spawnHero(WIZARDS[0].id), spawnHero(BUNNIES[0].id),
  ];

  const battle = createBattle3D({
    scene, camera,
    getPlayer: () => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }),
    groundAt: () => 0,
    viewport: () => ({ width: 1440, height: 1080 }),
    ui,
    save,
    grade: 3,
    rng: () => 0.99,               // no dodges, no blocks — deterministic
    party: heroes,
    // The two hooks OverworldScene installs, wired to the real seam.
    hooks: {
      onVictory: (r) => {
        seen.victory = applyBattleVictory(save, {
          floor: r.floor,
          correct: r.correct,
          wrong: r.wrong,
          streak: r.streak,
          party: r.party,
          damageTaken: r.damageTaken,
          markFloor: !!r.isBoss,
        });
      },
      onDefeat: (r) => {
        applyBattleDefeat(save, { correct: r.correct, wrong: r.wrong, party: r.party });
        seen.defeat = r;
      },
    },
  });

  const started = battle.begin({ floor: 1, grade: 3, worldPos: { x: 0, y: 0, z: 6 }, ...encounter });

  /** Run frames, flushing the queued "tap" between them, as a real tap arrives. */
  function run(seconds, dt = 1 / 60) {
    let t = 0;
    while (t < seconds && battle.isActive()) {
      if (queued) { const go = queued; queued = null; go(); }
      battle.update(dt);
      t += dt;
    }
  }

  return { battle, scene, camera, seen, run, started, heroes };
}

test('overworld/battle3d wiring — the world fight pays out through battleRules', async (t) => {

  await t.test('an encounter composed by the shared seam stages in 3D', () => {
    const enemies = composeEncounter({ floor: 1, grade: 3, count: 2, rng: () => 0 });
    const h = stageFight({ encounter: { enemies } });
    assert.equal(h.started, true, 'the fight begins');
    assert.equal(h.battle.getPhase(), PHASE.SWEEP_IN, 'and it opens on the camera sweep');

    const foes = [];
    h.battle.group.traverse((o) => { if (o.name?.startsWith('battle-enemy-')) foes.push(o); });
    assert.equal(foes.length, 2, 'both creatures the seam composed are on stage');
    h.battle.dispose();
  });

  await t.test('a won fight banks gold, XP and lifetime stats — same as the 2D battle', () => {
    const save = freshSave();
    const h = stageFight({ save, encounter: { enemyId: 'sproutling', floor: 2 } });
    h.run(240);

    assert.equal(h.battle.isActive(), false, 'the fight ends on its own');
    assert.equal(h.seen.ended.outcome, 'victory');
    assert.ok(h.seen.questions > 0, 'the child was actually asked something');
    assert.ok(h.seen.victory, 'and the victory seam ran');

    const want = battleRewards(2, h.seen.ended.correct);
    assert.equal(h.seen.victory.gold, want.gold);
    assert.equal(save.gold, 100 + want.gold, 'the purse grew by the shared curve');
    assert.equal(save.stats.totalBattles, 1);
    assert.equal(save.stats.totalCorrect, h.seen.ended.correct);
    assert.ok(save.party[0].xp >= want.xp, 'the party carries XP out of the world fight');
    assert.equal(save.floors[0].complete, false,
      'a wandering creature never completes a floor');
  });

  await t.test('a won BOSS fight completes the floor and opens the next one', () => {
    const save = freshSave();
    const h = stageFight({
      save,
      encounter: { enemyId: 'briarking', isBoss: true, floor: 1 },
    });
    h.run(400);

    assert.equal(h.seen.ended.outcome, 'victory');
    assert.equal(h.seen.ended.isBoss, true);
    assert.equal(h.seen.victory.floorMarked, true);
    assert.equal(save.floors[0].complete, true);
    assert.equal(save.floors[1].unlocked, true);
  });

  await t.test('a boss crosses its HP thresholds and TRANSFORMS, on the shared table', () => {
    const save = freshSave();
    const h = stageFight({
      save,
      encounter: { enemyId: 'briarking', isBoss: true, floor: 1 },
    });
    h.run(400);

    // bossPhases.js owns the thresholds; battle3d only reacts to them. A boss
    // that died without ever getting serious means the phase layer is unwired.
    assert.ok(h.seen.boss.length > 0, 'the boss changed phase at least once');
    assert.deepEqual(h.seen.boss, [...h.seen.boss].sort((a, b) => a - b),
      'phases only ever go UP');
    assert.ok(h.seen.boss.every((p) => p >= 2 && p <= 3));
    assert.equal(h.seen.ended.bossPhase, h.seen.boss[h.seen.boss.length - 1]);
    // And the table agrees about where the last one should have fired.
    assert.equal(phaseForHp(0, 100), 3);
  });

  await t.test('a lost fight revives the party at half HP and never soft-locks', () => {
    const save = freshSave();
    // One fragile hero against a boss, answering everything wrong: a loss.
    const solo = [spawnHero(KNIGHTS[0].id)];
    solo[0].maxHp = 12;
    solo[0].hp = 12;
    const h = stageFight({
      save, policy: 'wrong', party: solo,
      encounter: { enemyId: 'briarking', isBoss: true, floor: 1 },
    });
    h.run(400);

    assert.equal(h.seen.ended.outcome, 'defeat');
    assert.ok(h.seen.defeat, 'the defeat seam ran');
    assert.equal(save.party[0].hp, 6, 'back on their feet at half HP');
    assert.equal(save.floors[0].complete, false, 'and the floor is still there to beat');
    assert.equal(save.gold, 100, 'a loss pays nothing');
  });

  await t.test('the world is handed back: input, encounters and the hero rig', () => {
    let locked = null;
    let encounters = null;
    const rig = { group: new THREE.Group() };
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.4, 600);
    const battle = createBattle3D({
      scene, camera,
      getPlayer: () => ({ pos: { x: 0, y: 0, z: 0 }, yaw: 0 }),
      groundAt: () => 0,
      setInputLocked: (v) => { locked = v; },
      setEncountersEnabled: (v) => { encounters = v; },
      playerRig: rig,
      ui: { showCommands: (c, pick) => pick(c[0]), showQuestion: ({ question, answer }) => answer(question.correctIndex) },
      rng: () => 0.99,
      party: [spawnHero(KNIGHTS[0].id)],
    });

    battle.begin({ enemyId: 'sproutling', floor: 1, worldPos: { x: 0, y: 0, z: 6 } });
    assert.equal(locked, true, 'the stick is frozen for the fight');
    assert.equal(encounters, false, 'and no second creature may wander in');
    assert.equal(rig.group.visible, false, 'the walking hero steps off screen');
    assert.equal(battle.group.visible, true);

    battle.end('fled');
    assert.equal(locked, false, 'the stick comes back');
    assert.equal(encounters, true);
    assert.equal(rig.group.visible, true, 'and so does the walking hero');
    assert.equal(battle.group.visible, false);
    assert.equal(battle.isActive(), false);
    battle.dispose();
  });
});
