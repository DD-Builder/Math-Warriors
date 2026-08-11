/**
 * abilities.test.js
 *
 * Drives the field verbs the way the game drives them: a player record, a
 * handful of body views, and a fake physics surface that records what was
 * asked of it. If a verb cannot be exercised from that alone, the host cannot
 * wire it in a handful of lines — which is the failure mode this project keeps
 * hitting, so it is the first thing this suite checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_ABILITIES, ABILITY_CLASSES, ABILITY_GATES, ABILITY_PROPS, ABILITY_PUZZLES,
  REACH_HEIGHT, HEAVY_DENSITY, BINDINGS, PHASE, EVENTS, BLOCKED, SWAP_LOCKOUT,
  abilityForClass, abilityForHero, heroClassOf, heroIdOf, abilityChip,
  pickTarget, isLiftable, isHeavy, createFieldAbilities, createPartyRing,
  gateNear, gateById, gateAudit, mergeToybox, reachCleared, STACK_RADIUS,
} from './abilities.js';
import { PAPER } from '../config.js';
import { createHeightfield } from './heightfield.js';
import { WORLD } from './worldSpec.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A player facing +z (yaw 0), standing at the origin, on the ground. */
function makePlayer(over = {}) {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    grounded: true,
    ...over,
  };
}

/** A physics stand-in: an array of bodies plus a log of every call. */
function makeWorld(bodies = []) {
  const log = { impulse: [], teleport: [] };
  return {
    bodies,
    log,
    bodyAt(id) { return bodies.find((b) => b.id === id) || null; },
    impulse(id, ix, iy, iz) { log.impulse.push({ id, ix, iy, iz }); return true; },
    teleport(id, x, y, z) {
      log.teleport.push({ id, x, y, z });
      const b = bodies.find((v) => v.id === id);
      if (b) { b.x = x; b.y = y; b.z = z; }
      return true;
    },
    groundAt() { return 0; },
  };
}

function ctxOf(world, player, extra = {}) {
  return {
    player,
    bodies: world.bodies,
    bodyAt: world.bodyAt,
    impulse: world.impulse,
    teleport: world.teleport,
    groundAt: world.groundAt,
    ...extra,
  };
}

// The real toybox numbers: physicsProps kindMass/kindVolume give a crate
// 0.401 at density 0.55, and a granite kerbstone 0.415 at density 2.40.
const crate = (id, x, z, over = {}) => ({ id, kind: 'crate', x, y: 0.4, z, mass: 0.401, density: 0.55, ...over });
const stone = (id, x, z) => ({ id, kind: 'stone', x, y: 0.3, z, mass: 0.415, density: 2.40 });
const leaf = (id, x, z) => ({ id, kind: 'leaf', x, y: 0.05, z, mass: 0.0009, density: 0.10 });

// ── The table ───────────────────────────────────────────────────────────────

test('every playable class has exactly one field verb', () => {
  for (const cls of ABILITY_CLASSES) {
    const a = FIELD_ABILITIES[cls];
    assert.ok(a, `${cls} has no verb`);
    assert.equal(a.cls, cls);
    assert.ok(a.verb.length <= 6, `${a.verb} will not fit the chip`);
    assert.equal(a.verb, a.verb.toUpperCase());
  }
  assert.equal(Object.keys(FIELD_ABILITIES).length, ABILITY_CLASSES.length);
});

test('the three verbs are three DIFFERENT verbs', () => {
  const ids = ABILITY_CLASSES.map((c) => FIELD_ABILITIES[c].id);
  assert.equal(new Set(ids).size, 3);
});

test('every tint is a PAPER colour — art law', () => {
  const paper = new Set(Object.values(PAPER));
  for (const cls of ABILITY_CLASSES) {
    assert.ok(paper.has(FIELD_ABILITIES[cls].tint), `${cls} tint is off-palette`);
  }
});

test('the ability button is bound on all three input sources', () => {
  assert.ok(BINDINGS.ability.keys.length > 0);
  assert.ok(BINDINGS.ability.pad.length > 0);
  assert.ok(BINDINGS.swapNext.keys.length > 0);
  // The bunny rides jump, so it must NOT claim the ability button.
  assert.equal(FIELD_ABILITIES.bunny.button, 'jump');
  assert.equal(FIELD_ABILITIES.knight.button, 'ability');
  assert.equal(FIELD_ABILITIES.wizard.button, 'ability');
});

test('the second hop reaches a shelf the first jump cannot', () => {
  // This is the whole justification for the REACH gate existing.
  const perch = ABILITY_GATES.find((g) => g.kind === 'reach');
  assert.ok(perch.standHeight > REACH_HEIGHT.single, 'one jump would already do it');
  assert.ok(perch.standHeight < REACH_HEIGHT.double, 'two jumps still would not do it');
});

// ── Hero shapes ─────────────────────────────────────────────────────────────

test('a hero is understood as a record, a combatant or a bare id', () => {
  assert.equal(abilityForHero({ class: 'wizard' }).id, 'levitate');
  assert.equal(abilityForHero({ cls: 'bunny' }).id, 'doubleJump');
  assert.equal(abilityForHero('knight-shadow').id, 'shove');
  assert.equal(heroClassOf('bunny-pepper'), 'bunny');
  assert.equal(heroIdOf({ id: 'wizard-bookworm' }), 'wizard-bookworm');
});

test('an unknown class disarms instead of throwing', () => {
  assert.equal(abilityForClass('dragon'), null);
  assert.equal(abilityForHero(null), null);
  assert.equal(abilityForHero({}), null);
});

// ── Targeting ───────────────────────────────────────────────────────────────

test('the cone only sees what is in front', () => {
  const a = FIELD_ABILITIES.knight;
  const bodies = [crate('front', 0, 2), crate('behind', 0, -2)];
  const hit = pickTarget(bodies, { x: 0, z: 0, yaw: 0 }, a);
  assert.equal(hit.id, 'front');
});

test('out of reach is out of reach', () => {
  const a = FIELD_ABILITIES.knight;
  assert.equal(pickTarget([crate('far', 0, a.reach + 0.5)], { x: 0, z: 0, yaw: 0 }, a), null);
});

test('the nearest eligible body wins, not the most centred one', () => {
  const a = FIELD_ABILITIES.wizard;
  // 'near' is off to the side, 'far' is dead ahead. The child walked up to
  // 'near', so 'near' is what they mean.
  const bodies = [crate('far', 0, 4.0), crate('near', 0.9, 1.2)];
  assert.equal(pickTarget(bodies, { x: 0, z: 0, yaw: 0 }, a).id, 'near');
});

test('yaw is respected — turn around and the target changes', () => {
  const a = FIELD_ABILITIES.knight;
  const bodies = [crate('north', 0, 2), crate('south', 0, -2)];
  assert.equal(pickTarget(bodies, { x: 0, z: 0, yaw: 0 }, a).id, 'north');
  assert.equal(pickTarget(bodies, { x: 0, z: 0, yaw: Math.PI }, a).id, 'south');
});

test('the lift filter refuses a log and accepts a crate', () => {
  assert.ok(isLiftable({ kind: 'crate' }));
  assert.ok(!isLiftable({ kind: 'log' }));
  const a = FIELD_ABILITIES.wizard;
  const bodies = [{ id: 'log', kind: 'log', x: 0, y: 0, z: 1, mass: 60 }, crate('c', 0, 3)];
  assert.equal(pickTarget(bodies, { x: 0, z: 0, yaw: 0 }, a, isLiftable).id, 'c');
});

test('heavy is a DENSITY threshold — mass does not discriminate here', () => {
  // crate 0.401, log 0.428, kerbstone 0.415: by mass the log is the heaviest
  // thing in the world, which is not what anyone means by heavy.
  assert.ok(isHeavy({ density: HEAVY_DENSITY }));
  assert.ok(!isHeavy({ density: HEAVY_DENSITY - 0.01 }));
  assert.ok(isHeavy(stone('s', 0, 0)));
  assert.ok(!isHeavy(crate('c', 0, 0)));
  assert.ok(!isHeavy({ mass: 1000 }), 'mass alone must not make a thing heavy');
});

test('the shove scales its impulse by mass, so a leaf is not a missile', () => {
  const a = FIELD_ABILITIES.knight;
  const shoveOf = (body) => {
    const abl = createFieldAbilities();
    abl.setHero({ class: 'knight' });
    const world = makeWorld([body]);
    const p = makePlayer();
    abl.press();
    abl.update(0, ctxOf(world, p));
    abl.update(a.windup, ctxOf(world, p));
    return world.log.impulse[0];
  };
  const heavy = shoveOf(stone('s', 0, 2));
  const light = shoveOf(leaf('l', 0, 2));
  // Same departure speed for both...
  const speed = (imp, mass) => Math.hypot(imp.ix, imp.iz) / mass;
  assert.ok(Math.abs(speed(heavy, 0.415) - a.dv) < 1e-6);
  assert.ok(Math.abs(speed(light, 0.0009) - a.dv) < 1e-6);
  // ...which means wildly different impulses, which is the whole point.
  assert.ok(Math.hypot(heavy.ix, heavy.iz) > Math.hypot(light.ix, light.iz) * 100);
  // And nothing ever exceeds the Rust-panic guard.
  assert.ok(Math.hypot(heavy.ix, heavy.iz) <= a.maxImpulse);
});

test('a body with no mass reported still gets a sane shove', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'knight' });
  const world = makeWorld([{ id: 'x', kind: 'crate', x: 0, y: 0, z: 2 }]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.knight.windup, ctxOf(world, p));
  const imp = world.log.impulse[0];
  assert.ok(Number.isFinite(imp.iz) && imp.iz > 0 && imp.iz < FIELD_ABILITIES.knight.maxImpulse);
});

// ── SHOVE ───────────────────────────────────────────────────────────────────

test('the knight shoves after a windup, and the impulse points at the body', () => {
  const events = [];
  const abl = createFieldAbilities({ hooks: { onEvent: (e) => events.push({ ...e }) } });
  abl.setHero({ id: 'knight-shadow', class: 'knight' });
  const world = makeWorld([stone('s1', 0, 2)]);
  const player = makePlayer();

  abl.press();
  abl.update(1 / 60, ctxOf(world, player));
  assert.equal(abl.state.phase, PHASE.WINDUP);
  assert.equal(world.log.impulse.length, 0, 'the shove must not land on the press frame');
  assert.equal(events[0].type, EVENTS.WINDUP);

  abl.update(FIELD_ABILITIES.knight.windup, ctxOf(world, player));
  assert.equal(world.log.impulse.length, 1);
  const imp = world.log.impulse[0];
  assert.equal(imp.id, 's1');
  assert.ok(imp.iz > 0, 'the stone is north of the hero; it must go north');
  assert.ok(Math.abs(imp.ix) < 1e-9);
  assert.ok(imp.iy > 0, 'a shove hops the body a little');
  assert.equal(events.at(-1).type, EVENTS.SHOVE);
});

test('the shove direction is hero->body, not the hero facing', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'knight' });
  // Body at 45 degrees off the facing but inside the cone.
  const world = makeWorld([stone('s1', 2, 2)]);
  const player = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, player));
  abl.update(FIELD_ABILITIES.knight.windup, ctxOf(world, player));
  const imp = world.log.impulse[0];
  assert.ok(Math.abs(imp.ix - imp.iz) < 1e-6, 'it must fly along the line to the stone');
});

test('a shove with nothing in front is refused, kindly', () => {
  const events = [];
  const abl = createFieldAbilities({ hooks: { onEvent: (e) => events.push({ ...e }) } });
  abl.setHero({ class: 'knight' });
  const world = makeWorld([]);
  abl.press();
  abl.update(1 / 60, ctxOf(world, makePlayer()));
  assert.equal(events.at(-1).type, EVENTS.BLOCKED);
  assert.equal(events.at(-1).reason, BLOCKED.NO_TARGET);
  assert.equal(abl.state.phase, PHASE.READY, 'a refused press must not eat the cooldown');
});

test('the cooldown blocks a second shove and then lets go', () => {
  const events = [];
  const abl = createFieldAbilities({ hooks: { onEvent: (e) => events.push({ ...e }) } });
  abl.setHero({ class: 'knight' });
  const world = makeWorld([stone('s1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.knight.windup, ctxOf(world, p));
  assert.equal(world.log.impulse.length, 1);

  abl.press();
  abl.update(0.1, ctxOf(world, p));
  assert.equal(events.at(-1).reason, BLOCKED.COOLDOWN);
  assert.equal(world.log.impulse.length, 1);

  abl.update(FIELD_ABILITIES.knight.cooldown, ctxOf(world, p));
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.knight.windup, ctxOf(world, p));
  assert.equal(world.log.impulse.length, 2);
});

// ── LEVITATE ────────────────────────────────────────────────────────────────

test('the wizard lifts a crate to the carry point and holds it there', () => {
  const abl = createFieldAbilities();
  const a = FIELD_ABILITIES.wizard;
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();

  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(a.windup, ctxOf(world, p));
  assert.equal(abl.state.phase, PHASE.CARRY);
  assert.equal(abl.carrying, 'c1');

  // Two seconds of holding: the body converges on (0, carryHeight, carryDist).
  for (let i = 0; i < 120; i++) abl.update(1 / 60, ctxOf(world, p));
  const b = world.bodyAt('c1');
  assert.ok(Math.abs(b.z - a.carryDist) < 0.05, `z was ${b.z}`);
  assert.ok(Math.abs(b.y - a.carryHeight) < 0.05, `y was ${b.y}`);
});

test('a held crate follows the hero when the hero turns', () => {
  const abl = createFieldAbilities();
  const a = FIELD_ABILITIES.wizard;
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(a.windup, ctxOf(world, p));
  for (let i = 0; i < 90; i++) abl.update(1 / 60, ctxOf(world, p));

  p.yaw = Math.PI / 2;             // face +x
  for (let i = 0; i < 90; i++) abl.update(1 / 60, ctxOf(world, p));
  const b = world.bodyAt('c1');
  assert.ok(Math.abs(b.x - a.carryDist) < 0.06, `x was ${b.x}`);
  assert.ok(Math.abs(b.z) < 0.06, `z was ${b.z}`);
});

test('the hold expires on its own — the spell is BRIEF', () => {
  const events = [];
  const abl = createFieldAbilities({ hooks: { onEvent: (e) => events.push({ ...e }) } });
  const a = FIELD_ABILITIES.wizard;
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(a.windup, ctxOf(world, p));

  for (let i = 0; i < Math.ceil(a.maxHold * 60) + 2; i++) abl.update(1 / 60, ctxOf(world, p));
  assert.equal(abl.carrying, null);
  assert.equal(events.at(-1).type, EVENTS.DROP);
  assert.equal(abl.state.phase, PHASE.COOLDOWN);
});

test('letting the button go drops it', () => {
  const abl = createFieldAbilities();
  const a = FIELD_ABILITIES.wizard;
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(a.windup, ctxOf(world, p));
  assert.equal(abl.carrying, 'c1');
  abl.releaseButton();
  abl.update(1 / 60, ctxOf(world, p));
  assert.equal(abl.carrying, null);
});

test('a body that vanishes under the spell does not freeze in the sky', () => {
  // The leash brings a strayed body home; the spell must notice.
  const abl = createFieldAbilities();
  const a = FIELD_ABILITIES.wizard;
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(a.windup, ctxOf(world, p));
  world.bodies.length = 0;
  abl.update(1 / 60, ctxOf(world, p));
  assert.equal(abl.carrying, null);
});

test('the chip says DROP while carrying', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  assert.equal(abl.chip().verb, 'LIFT');
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.wizard.windup, ctxOf(world, p));
  assert.equal(abl.chip().verb, 'DROP');
});

// ── DOUBLE JUMP ─────────────────────────────────────────────────────────────

test('the bunny gets exactly one mid-air hop per grounding', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'bunny' });
  const world = makeWorld([]);
  const p = makePlayer();

  abl.update(1 / 60, ctxOf(world, p));         // grounded: charge
  assert.equal(abl.hopsLeft(), 1);
  assert.equal(abl.jump(p), 0, 'on the ground the ordinary jump serves');

  p.grounded = false;
  abl.update(1 / 60, ctxOf(world, p));
  assert.equal(abl.jump(p), FIELD_ABILITIES.bunny.hopV);
  assert.equal(abl.jump(p), 0, 'and only one');

  p.grounded = true;
  abl.update(1 / 60, ctxOf(world, p));
  p.grounded = false;
  assert.equal(abl.jump(p), FIELD_ABILITIES.bunny.hopV, 'landing re-arms it');
});

test('the hop is refused mid-climb, mid-glide and mid-swim', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'bunny' });
  const world = makeWorld([]);
  for (const mode of ['climbing', 'gliding', 'swimming']) {
    const p = makePlayer({ grounded: false });
    abl.setHero({ class: 'bunny' });
    p.grounded = true;
    abl.update(1 / 60, ctxOf(world, p));
    p.grounded = false;
    p[mode] = true;
    assert.equal(abl.jump(p), 0, `${mode} owns the jump button`);
  }
});

test('the chip says which BUTTON its verb is on', () => {
  // The bunny's verb is on jump. A HUD that drew HOP on the ability chip would
  // be teaching a child to press the one button that does not do it.
  const abl = createFieldAbilities();
  abl.setHero({ class: 'bunny' });
  abl.update(1 / 60, ctxOf(makeWorld([]), makePlayer()));
  assert.equal(abl.chip().button, 'jump');
  assert.equal(abl.chip().charges, 1);
  abl.setHero({ class: 'knight' });
  assert.equal(abl.chip().button, 'ability');
  assert.equal(abl.chip().charges, null);
});

test('a knight gets no second hop', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'knight' });
  const p = makePlayer({ grounded: false });
  assert.equal(abl.jump(p), 0);
});

test('the hop velocity is below the ground jump on purpose', () => {
  assert.ok(FIELD_ABILITIES.bunny.hopV < 8.5, 'the second hop must not out-jump the first');
});

// ── Locking and switching ───────────────────────────────────────────────────

test('a fight drops whatever the wizard was holding', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.wizard.windup, ctxOf(world, p));
  abl.update(1 / 60, ctxOf(world, p, { locked: true }));
  assert.equal(abl.carrying, null);
});

test('swapping hero mid-carry puts the crate down', () => {
  const abl = createFieldAbilities();
  abl.setHero({ class: 'wizard' });
  const world = makeWorld([crate('c1', 0, 2)]);
  const p = makePlayer();
  abl.press();
  abl.update(0, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.wizard.windup, ctxOf(world, p));
  abl.setHero({ class: 'knight' }, ctxOf(world, p));
  assert.equal(abl.carrying, null);
  assert.equal(abl.ability.id, 'shove');
});

test('a hero with no verb makes the whole layer inert, not broken', () => {
  const events = [];
  const abl = createFieldAbilities({ hooks: { onEvent: (e) => events.push({ ...e }) } });
  abl.setHero({ class: 'dragon' });
  assert.equal(abl.ability, null);
  assert.equal(abl.chip(), null);
  abl.press();
  abl.update(1 / 60, ctxOf(makeWorld([]), makePlayer()));
  assert.equal(events.at(-1).reason, BLOCKED.NO_ABILITY);
});

test('the prompt fires on change only, never every frame', () => {
  const prompts = [];
  const abl = createFieldAbilities({ hooks: { onPrompt: (p) => prompts.push(p && { ...p }) } });
  abl.setHero({ class: 'knight' });
  const world = makeWorld([stone('s1', 0, 2)]);
  const p = makePlayer();
  for (let i = 0; i < 30; i++) abl.update(1 / 60, ctxOf(world, p));
  assert.equal(prompts.length, 1, 'one prompt for one target');
  assert.equal(prompts[0].targetId, 's1');
  world.bodies.length = 0;
  for (let i = 0; i < 30; i++) abl.update(1 / 60, ctxOf(world, p));
  assert.equal(prompts.length, 2);
  assert.equal(prompts[1], null, 'walking away clears it');
});

test('update allocates no event object per frame', () => {
  // The host reads the record inside the callback; the same object comes back
  // every time. This is the no-garbage rule the loops in index.js run under.
  const seen = [];
  const abl = createFieldAbilities({ hooks: { onEvent: (e) => seen.push(e) } });
  abl.setHero({ class: 'knight' });
  const world = makeWorld([]);
  const p = makePlayer();
  abl.press();
  abl.update(1 / 60, ctxOf(world, p));
  abl.update(FIELD_ABILITIES.knight.cooldown + 0.1, ctxOf(world, p));
  abl.press();
  abl.update(1 / 60, ctxOf(world, p));
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1], 'the event record must be reused');
});

// ── The party ring ──────────────────────────────────────────────────────────

const PARTY = [
  { id: 'knight-shadow', name: 'Shadow', cls: 'knight', level: 3 },
  { id: 'wizard-stargazer', name: 'Stargazer', cls: 'wizard', level: 2 },
  { id: 'bunny-pepper', name: 'Pepper', cls: 'bunny', level: 4 },
];

test('the ring is the party, in party order', () => {
  const ring = createPartyRing({ save: { party: PARTY } });
  assert.equal(ring.members.length, 3);
  assert.equal(ring.active().id, 'knight-shadow');
  assert.equal(ring.active().ability.id, 'shove');
});

test('cycling walks forward and wraps', () => {
  const ring = createPartyRing({ save: { party: PARTY } });
  ring.cycle(1);
  assert.equal(ring.active().cls, 'wizard');
  ring.step(SWAP_LOCKOUT);
  ring.cycle(1);
  assert.equal(ring.active().cls, 'bunny');
  ring.step(SWAP_LOCKOUT);
  ring.cycle(1);
  assert.equal(ring.active().cls, 'knight');
});

test('the lockout stops a child strobing the ring', () => {
  const ring = createPartyRing({ save: { party: PARTY } });
  assert.ok(ring.cycle(1));
  assert.equal(ring.cycle(1), null, 'the second press inside the lockout does nothing');
  ring.step(SWAP_LOCKOUT + 0.01);
  assert.ok(ring.cycle(1));
});

test('you can ask for a CLASS, because that is the question a gate asks', () => {
  const ring = createPartyRing({ save: { party: PARTY } });
  const got = ring.select('bunny');
  assert.equal(got.id, 'bunny-pepper');
  assert.equal(ring.active().ability.id, 'doubleJump');
});

test('the swap hook carries the new verb', () => {
  const swaps = [];
  const ring = createPartyRing({ save: { party: PARTY }, hooks: { onSwap: (e) => swaps.push(e) } });
  ring.select('wizard');
  assert.equal(swaps.length, 1);
  assert.equal(swaps[0].from.cls, 'knight');
  assert.equal(swaps[0].to.cls, 'wizard');
  assert.equal(swaps[0].ability.id, 'levitate');
});

test('a gate can refuse the swap outright', () => {
  let fighting = true;
  const ring = createPartyRing({ save: { party: PARTY }, gate: () => !fighting });
  assert.equal(ring.cycle(1), null);
  fighting = false;
  assert.ok(ring.cycle(1));
});

test('a solo party cannot swap and says so', () => {
  const ring = createPartyRing({ save: { party: [PARTY[0]] } });
  assert.equal(ring.canSwap(), false);
  assert.equal(ring.cycle(1), null);
});

test('refresh keeps you as whoever you were', () => {
  const save = { party: PARTY.slice() };
  const ring = createPartyRing({ save });
  ring.select('bunny');
  save.party = [PARTY[2], PARTY[0]];       // party edited elsewhere
  ring.refresh();
  assert.equal(ring.active().id, 'bunny-pepper');
});

test('refresh falls back to slot one when the active hero left the party', () => {
  const save = { party: PARTY.slice() };
  const ring = createPartyRing({ save });
  ring.select('bunny');
  save.party = [PARTY[0], PARTY[1]];
  ring.refresh();
  assert.equal(ring.active().id, 'knight-shadow');
});

test('whoCan answers the only question a locked gate asks', () => {
  const ring = createPartyRing({ save: { party: PARTY } });
  assert.equal(ring.whoCan('levitate').id, 'wizard-stargazer');
  const noWiz = createPartyRing({ save: { party: [PARTY[0], PARTY[2]] } });
  assert.equal(noWiz.whoCan('levitate'), null);
});

test('the chips mark exactly one active hero', () => {
  const ring = createPartyRing({ save: { party: PARTY } });
  const chips = ring.chips();
  assert.equal(chips.filter((c) => c.active).length, 1);
  assert.equal(chips[0].verb, 'SHOVE');
});

test('an empty or absent party is survivable', () => {
  const ring = createPartyRing({ save: {} });
  assert.equal(ring.active(), null);
  assert.equal(ring.canSwap(), false);
  assert.deepEqual(ring.verbs(), []);
});

// ── Gates ───────────────────────────────────────────────────────────────────

test('there is one gate per class, so every class has a door only it opens', () => {
  const byClass = new Set(ABILITY_GATES.map((g) => g.cls));
  assert.deepEqual([...byClass].sort(), ['bunny', 'knight', 'wizard']);
});

test('a full party opens everything; a mono party does not', () => {
  const full = gateAudit(createPartyRing({ save: { party: PARTY } }));
  assert.equal(full.complete, true);
  assert.equal(full.shut.length, 0);

  const knightsOnly = gateAudit(createPartyRing({
    save: { party: [PARTY[0], { id: 'knight-paladin', cls: 'knight' }] },
  }));
  assert.equal(knightsOnly.open.length, 1);
  assert.equal(knightsOnly.shut.length, 2);
  assert.equal(knightsOnly.complete, false);
});

test('gateNear finds the gate you are standing at and nothing else', () => {
  const g = ABILITY_GATES[0];
  assert.equal(gateNear(g.at.x, g.at.z).id, g.id);
  assert.equal(gateNear(g.at.x + g.radius + 1, g.at.z), null);
  assert.equal(gateById(g.id).cls, g.cls);
  assert.equal(gateById('nope'), null);
});

test('every gate that names a puzzle names one that exists', () => {
  const ids = new Set(ABILITY_PUZZLES.map((p) => p.id));
  for (const g of ABILITY_GATES) {
    if (g.puzzleId) assert.ok(ids.has(g.puzzleId), `${g.id} points at a missing puzzle`);
  }
});

// ── The toybox additions ────────────────────────────────────────────────────

test('the ability puzzles obey the toybox schema', () => {
  for (const p of ABILITY_PUZZLES) {
    assert.ok(p.id && p.name && p.hint);
    assert.equal(typeof p.need, 'number');
    assert.ok(p.zones.length > 0);
    for (const z of p.zones) {
      assert.ok(Number.isFinite(z.x) && Number.isFinite(z.z) && z.r > 0);
      assert.ok(z.y1 > z.y0);
    }
    // The design rule the whole toybox runs on: the sign must not lie.
    assert.equal(p.answer, p.need);
  }
});

test('the stacking puzzle has the 6 m window physicsProps asked for', () => {
  const stack = ABILITY_PUZZLES.find((p) => p.id === 'phz-market-stack');
  assert.equal(stack.requires, 'levitate');
  assert.equal(stack.zones[0].y1, 6.0);
  assert.equal(stack.need, 3);
});

test('the shelf is geometrically too narrow for three crates to stand on', () => {
  // This is THE load-bearing claim of the whole wizard gate, and the first
  // draft of this file failed it: a 1.9 m plate was authored, and three 0.9 m
  // crates fit on it side by side with room to spare, so the carry verb was
  // never needed. The maths, not the eyeball:
  const CRATE_SIDE = 0.9;                       // physicsProps PROP_KINDS.crate
  const threeFlat = CRATE_SIDE / Math.sqrt(3);  // 0.520 — circumradius of the
  const twoFlat = CRATE_SIDE / 2;               // 0.450   tightest packings
  const stack = ABILITY_PUZZLES.find((p) => p.id === 'phz-market-stack');
  const r = stack.zones[0].r;
  assert.equal(r, STACK_RADIUS);
  assert.ok(r < threeFlat, `r=${r} lets all three crates stand on the ground`);
  assert.ok(r >= twoFlat, `r=${r} does not even fit two — there is no base`);
  // ...and the plate a child SEES is the circle the puzzle COUNTS. A plate
  // drawn wider than its zone is a puzzle that lies about where to put things.
  assert.equal(stack.plates[0].r, r);
});

test('a puzzle plate matches the zone it stands for', () => {
  for (const p of ABILITY_PUZZLES) {
    if (!p.plates) continue;
    for (const plate of p.plates) {
      const zone = p.zones.find((z) => Math.hypot(z.x - plate.x, z.z - plate.z) < 0.01);
      assert.ok(zone, `${p.id} has a plate with no zone under it`);
      assert.equal(plate.r, zone.r, `${p.id}: the plate and the zone disagree`);
    }
  }
});

test('the stone puzzle asks for fewer stones than exist', () => {
  const puz = ABILITY_PUZZLES.find((p) => p.id === 'phz-garden-stones');
  const stones = ABILITY_PROPS.filter((p) => p.kind === 'stone');
  assert.ok(stones.length > puz.need, 'exact-N is only a choice if there is a spare');
  assert.ok(stones.every((s) => s.heavy));
});

test('there are enough crates for the stack, with a spare', () => {
  const puz = ABILITY_PUZZLES.find((p) => p.id === 'phz-market-stack');
  const crates = ABILITY_PROPS.filter((p) => p.kind === 'crate');
  assert.ok(crates.length > puz.need);
});

test('mergeToybox is additive, idempotent and survives a missing toybox', () => {
  const base = [{ id: 'phx-g-crate-1', kind: 'crate', x: 0, z: 0 }];
  const once = mergeToybox(base, []);
  assert.equal(once.placements.length, base.length + ABILITY_PROPS.length);
  const twice = mergeToybox(once.placements, once.puzzles);
  assert.equal(twice.placements.length, once.placements.length, 'not idempotent');

  const empty = mergeToybox();
  assert.equal(empty.placements.length, ABILITY_PROPS.length);
  assert.equal(empty.puzzles.length, ABILITY_PUZZLES.length);
});

test('ability placements never collide with each other', () => {
  for (let i = 0; i < ABILITY_PROPS.length; i++) {
    for (let j = i + 1; j < ABILITY_PROPS.length; j++) {
      const a = ABILITY_PROPS[i], b = ABILITY_PROPS[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1.2, `${a.id} is inside ${b.id}`);
    }
  }
});

test('every ability placement is near the gate it belongs to', () => {
  // A stone thirty metres from its slab is a stone nobody will ever connect
  // to the puzzle it is for.
  const near = (p, g) => Math.hypot(p.x - g.at.x, p.z - g.at.z) < g.radius + 12;
  const stones = ABILITY_PROPS.filter((p) => p.kind === 'stone');
  const stoneGate = gateById('gate-garden-stones');
  assert.ok(stones.every((s) => near(s, stoneGate)));
  const crates = ABILITY_PROPS.filter((p) => p.kind === 'crate');
  const stackGate = gateById('gate-market-stack');
  assert.ok(crates.every((c) => near(c, stackGate)));
});

// ── REACH ───────────────────────────────────────────────────────────────────

test('the reach gate reads clearance over the ground, not sea level', () => {
  const g = gateById('gate-garden-perch');
  const at = (y, groundY) => ({ pos: { x: g.at.x, y, z: g.at.z }, groundY });
  // Standing on a 40 m hill is not the same as being 2.6 m up it.
  assert.equal(reachCleared(at(40, 40)), null);
  assert.equal(reachCleared(at(42.7, 40)).id, g.id);
  // One jump's worth of air is not enough. Two is.
  assert.equal(reachCleared(at(REACH_HEIGHT.single, 0)), null);
  assert.ok(reachCleared(at(REACH_HEIGHT.double, 0)));
});

test('the reach gate only fires where the gate is', () => {
  const g = gateById('gate-garden-perch');
  const far = { pos: { x: g.at.x + 40, y: 10, z: g.at.z }, groundY: 0 };
  assert.equal(reachCleared(far), null);
});

test('reachCleared falls back to a groundAt sampler', () => {
  const g = gateById('gate-garden-perch');
  const p = { pos: { x: g.at.x, y: 5.0, z: g.at.z } };
  assert.ok(reachCleared(p, () => 2.0), 'clearance 3.0 >= 2.6');
  assert.equal(reachCleared(p, () => 3.0), null, 'clearance 2.0 < 2.6');
});

// ── The ground these things actually sit on ─────────────────────────────────
//
// The toybox lost a whole puzzle to placements that passed their unit tests
// while sitting on a 40-degree slope, because the tests only ever checked that
// the numbers added up. These four check the TERRAIN.

const hf = createHeightfield(WORLD.SEED);
const H = (x, z) => hf.sampleHeight(x, z);
/** Gradient magnitude — the same metric physicsProps.test.js budgets against. */
const slopeAt = (x, z, d = 1.2) => Math.hypot(
  (H(x + d, z) - H(x - d, z)) / (2 * d),
  (H(x, z + d) - H(x, z - d)) / (2 * d),
);
const footSlope = (x, z, r) => {
  let m = slopeAt(x, z);
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    m = Math.max(m, slopeAt(x + Math.cos(t) * r, z + Math.sin(t) * r));
  }
  return m;
};
const SLOPE_BUDGET = { crate: 0.13, stone: 0.17 };
const FOOTPRINT = { crate: 1.1, stone: 0.7 };

test('every ability placement is on ground its own kind can sit on', () => {
  for (const p of ABILITY_PROPS) {
    const s = footSlope(p.x, p.z, FOOTPRINT[p.kind]);
    assert.ok(s <= SLOPE_BUDGET[p.kind],
      `${p.id} (${p.kind}) is on a ${s.toFixed(3)} slope; budget is ${SLOPE_BUDGET[p.kind]}`);
  }
});

test('nothing an ability puzzle needs is in the sea', () => {
  const dry = (x, z, what) => assert.ok(H(x, z) > WORLD.WATER_Y + 1,
    `${what} at (${x}, ${z}) is at y=${H(x, z).toFixed(2)} — that is the beach or worse`);
  for (const p of ABILITY_PROPS) dry(p.x, p.z, p.id);
  for (const g of ABILITY_GATES) dry(g.at.x, g.at.z, g.id);
  for (const p of ABILITY_PUZZLES) {
    for (const z of p.zones) dry(z.x, z.z, `${p.id}/${z.id}`);
    if (p.sign) dry(p.sign.x, p.sign.z, `${p.id}/sign`);
  }
});

test('no ability puzzle starts itself already solved', () => {
  // A stone born on the slab is a puzzle the child never gets to do.
  for (const puz of ABILITY_PUZZLES) {
    for (const zone of puz.zones) {
      for (const p of ABILITY_PROPS) {
        if (zone.kind && p.kind !== zone.kind) continue;
        const d = Math.hypot(p.x - zone.x, p.z - zone.z);
        assert.ok(d > zone.r + 1.5,
          `${p.id} spawns ${d.toFixed(1)} m from ${puz.id}/${zone.id} (r ${zone.r})`);
      }
    }
  }
});

test('the reach gate stands on ground flat enough to land on', () => {
  const g = gateById('gate-garden-perch');
  // A child coming down off a double jump needs somewhere to put their feet.
  assert.ok(footSlope(g.at.x, g.at.z, 2.5) < 0.12,
    `landing gradient ${footSlope(g.at.x, g.at.z, 2.5).toFixed(3)} is a hillside`);
});

test('every gate sits within reach of the puzzle it gates', () => {
  for (const g of ABILITY_GATES) {
    if (!g.puzzleId) continue;
    const puz = ABILITY_PUZZLES.find((p) => p.id === g.puzzleId);
    const zone = puz.zones[0];
    const d = Math.hypot(g.at.x - zone.x, g.at.z - zone.z);
    assert.ok(d <= g.radius + 4,
      `${g.id} prompts ${d.toFixed(1)} m from the thing it is about`);
  }
});
