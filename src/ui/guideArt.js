/**
 * Guide portraits — the six realm guides (plus Elara, Marlow and the
 * narrator) finally get faces.
 *
 * Every named guide is a papercut bust inside a ringed medallion:
 * shoulders, head, hair/hat, face — layered flat shapes in the same
 * two-tone-plus-accent language as the hero art. Two expressions
 * ('neutral' and 'excited') swap the eyes, brows and mouth so story
 * beats can smile. Generic fairies get a tinted fairy medallion,
 * bosses an ominous crest, heroes and unknowns an initial medallion —
 * so EVERY speaker in dialogue.js renders something with character.
 */

import { PAPER } from '../config.js';

const SKIN = 0xf2c9a4;
const SKIN_SHADE = 0xdba97e;

/** Bespoke portrait painters, keyed by lowercase speaker name. */
const GUIDES = {
  elara: drawElara,
  marlow: drawMarlow,
  zephyr: drawZephyr,
  cinder: drawCinder,
  frost: drawFrost,
  faceta: drawFaceta,
  penny: drawPenny,
  folio: drawFolio,
};

export function hasGuidePortrait(speaker) {
  return !!GUIDES[String(speaker || '').toLowerCase()];
}

/**
 * Draw a portrait medallion for any speaker. Returns a container
 * centered at (x, y); r is the medallion radius.
 */
export function drawGuidePortrait(scene, x, y, speaker, { r = 90, expression = 'neutral' } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  c.add(g);

  const name = String(speaker || '').toLowerCase();
  const accent = speakerAccent(name);

  // Medallion: drop shadow, paper ring, tinted sky backing
  g.fillStyle(PAPER.shadow, 0.25);
  g.fillCircle(4, 6, r + 8);
  g.fillStyle(PAPER.cream, 1);
  g.fillCircle(0, 0, r + 8);
  g.fillStyle(accent, 0.28);
  g.fillCircle(0, 0, r);
  g.lineStyle(4, accent, 0.9);
  g.strokeCircle(0, 0, r + 8);

  const painter = GUIDES[name];
  if (painter) {
    painter(g, r, expression);
  } else if (name.includes('fairy') || name === 'all fairies') {
    drawGenericFairy(g, r, accent, expression);
  } else if (name === 'narrator') {
    drawNarrator(g, r);
  } else if (isVillain(name)) {
    drawVillainCrest(g, r, accent);
  } else {
    drawInitialMedallion(scene, c, g, r, speaker, accent);
  }

  // Mask everything inside the medallion? Papercut busts are drawn to
  // fit; a thin inner rim reads as the paper cut edge instead.
  g.lineStyle(2, PAPER.shadow, 0.25);
  g.strokeCircle(0, 0, r);
  return c;
}

function speakerAccent(name) {
  if (name.includes('elara') || name.includes('elder')) return PAPER.sky;
  if (name.includes('marlow') || name.includes('water')) return PAPER.teal;
  if (name.includes('zephyr') || name.includes('sky')) return PAPER.sky;
  if (name.includes('cinder') || name.includes('fire') || name.includes('ember')) return PAPER.coralD;
  if (name.includes('frost') || name.includes('ice')) return PAPER.tealL;
  if (name.includes('faceta') || name.includes('crystal')) return PAPER.lavender;
  if (name.includes('penny') || name.includes('market')) return PAPER.gold;
  if (name.includes('folio') || name.includes('book')) return PAPER.peach;
  if (name.includes('narrator')) return PAPER.gold;
  if (isVillain(name)) return PAPER.coralD;
  return PAPER.sky;
}

function isVillain(name) {
  return ['king', 'pressure', 'whale', 'prism', 'paradox', 'theorem', 'zero', 'counterfeit', 'pyroclast']
    .some((k) => name.includes(k));
}

/* ---------------------------- shared parts ---------------------------- */

function bust(g, r, { skin = SKIN, robe = PAPER.teal } = {}) {
  // shoulders
  g.fillStyle(robe, 1);
  g.fillEllipse(0, r * 0.78, r * 1.3, r * 0.8);
  // neck + head
  g.fillStyle(skin === SKIN ? SKIN_SHADE : skin, 1);
  g.fillRect(-r * 0.12, r * 0.18, r * 0.24, r * 0.3);
  g.fillStyle(skin, 1);
  g.fillEllipse(0, -r * 0.08, r * 0.92, r * 1.0);
}

function face(g, r, expression, { eye = PAPER.inkTeal, blush = true } = {}) {
  const ey = -r * 0.12;
  if (expression === 'excited') {
    // wide-open eyes with sparkle + open smile
    g.fillStyle(eye, 1);
    g.fillCircle(-r * 0.2, ey, r * 0.085);
    g.fillCircle(r * 0.2, ey, r * 0.085);
    g.fillStyle(PAPER.white, 1);
    g.fillCircle(-r * 0.17, ey - r * 0.03, r * 0.032);
    g.fillCircle(r * 0.23, ey - r * 0.03, r * 0.032);
    g.fillStyle(eye, 1);
    g.fillEllipse(0, r * 0.22, r * 0.26, r * 0.2);
    g.fillStyle(0xe86a6a, 0.9);
    g.fillEllipse(0, r * 0.27, r * 0.16, r * 0.08);
  } else {
    // soft eyes + gentle closed smile
    g.fillStyle(eye, 1);
    g.fillEllipse(-r * 0.2, ey, r * 0.13, r * 0.16);
    g.fillEllipse(r * 0.2, ey, r * 0.13, r * 0.16);
    g.fillStyle(PAPER.white, 1);
    g.fillCircle(-r * 0.17, ey - r * 0.04, r * 0.03);
    g.fillCircle(r * 0.23, ey - r * 0.04, r * 0.03);
    g.lineStyle(3, eye, 1);
    g.beginPath();
    g.arc(0, r * 0.18, r * 0.14, 0.25, Math.PI - 0.25);
    g.strokePath();
  }
  if (blush) {
    g.fillStyle(PAPER.rose, 0.45);
    g.fillEllipse(-r * 0.38, r * 0.08, r * 0.16, r * 0.09);
    g.fillEllipse(r * 0.38, r * 0.08, r * 0.16, r * 0.09);
  }
}

/* ----------------------------- the guides ----------------------------- */

// Elara — fairy elder of the Garden: silver bun, leaf crown, wise warmth.
function drawElara(g, r, expression) {
  bust(g, r, { robe: 0x3f7d4e });
  // silver hair with bun
  g.fillStyle(0xd8d2e8, 1);
  g.fillEllipse(0, -r * 0.38, r * 1.0, r * 0.62);
  g.fillCircle(0, -r * 0.72, r * 0.26);
  g.fillStyle(0xbfb7d8, 1);
  g.fillCircle(0, -r * 0.72, r * 0.16);
  // leaf crown
  g.fillStyle(0x5aa860, 1);
  for (const dx of [-0.42, -0.14, 0.14, 0.42]) {
    g.fillEllipse(r * dx, -r * 0.5, r * 0.2, r * 0.1);
  }
  face(g, r, expression);
  // tiny wings peeking over the shoulders
  g.fillStyle(PAPER.white, 0.7);
  g.fillEllipse(-r * 0.62, r * 0.5, r * 0.3, r * 0.5);
  g.fillEllipse(r * 0.62, r * 0.5, r * 0.3, r * 0.5);
}

// Marlow — Ebbport harbormaster: sou'wester hat, grey beard, tide scarf.
function drawMarlow(g, r, expression) {
  bust(g, r, { robe: 0x2b5876 });
  // beard first (under the face features)
  g.fillStyle(0xcfd4d8, 1);
  g.fillEllipse(0, r * 0.3, r * 0.74, r * 0.6);
  face(g, r, expression, { blush: false });
  // re-cover the chin line where beard meets mouth
  if (expression !== 'excited') {
    g.lineStyle(3, PAPER.inkTeal, 1);
    g.beginPath();
    g.arc(0, r * 0.18, r * 0.14, 0.25, Math.PI - 0.25);
    g.strokePath();
  }
  // sou'wester rain hat
  g.fillStyle(0xe8b13a, 1);
  g.fillEllipse(0, -r * 0.42, r * 1.24, r * 0.34);
  g.fillEllipse(0, -r * 0.6, r * 0.78, r * 0.45);
  g.fillStyle(0xc99425, 1);
  g.fillEllipse(0, -r * 0.44, r * 1.24, r * 0.12);
  // teal scarf knot
  g.fillStyle(PAPER.teal, 1);
  g.fillEllipse(0, r * 0.52, r * 0.5, r * 0.2);
}

// Zephyr — sky guide: windswept pale hair, brass goggles up on the brow.
function drawZephyr(g, r, expression) {
  bust(g, r, { robe: 0x7d9fd3 });
  // windswept hair, all blown to one side
  g.fillStyle(0xeef3fa, 1);
  g.fillEllipse(-r * 0.1, -r * 0.42, r * 1.05, r * 0.55);
  g.fillEllipse(-r * 0.55, -r * 0.3, r * 0.5, r * 0.3);
  g.fillEllipse(-r * 0.72, -r * 0.14, r * 0.34, r * 0.2);
  face(g, r, expression);
  // goggles resting on the brow
  g.lineStyle(4, 0xb8862e, 1);
  g.strokeCircle(-r * 0.2, -r * 0.42, r * 0.14);
  g.strokeCircle(r * 0.2, -r * 0.42, r * 0.14);
  g.lineStyle(3, 0xb8862e, 1);
  g.lineBetween(-r * 0.06, -r * 0.42, r * 0.06, -r * 0.42);
  g.fillStyle(0xcfe6f5, 0.8);
  g.fillCircle(-r * 0.2, -r * 0.42, r * 0.1);
  g.fillCircle(r * 0.2, -r * 0.42, r * 0.1);
}

// Cinder — ember guide: flame-orange spiked hair, smith's apron strap.
function drawCinder(g, r, expression) {
  bust(g, r, { skin: 0xc98d5f, robe: 0x6b3226 });
  // spiky flame hair
  g.fillStyle(0xe85d20, 1);
  g.fillTriangle(-r * 0.5, -r * 0.3, -r * 0.3, -r * 0.95, -r * 0.1, -r * 0.35);
  g.fillTriangle(-r * 0.2, -r * 0.35, 0, -r * 1.05, r * 0.2, -r * 0.35);
  g.fillTriangle(r * 0.1, -r * 0.35, r * 0.32, -r * 0.9, r * 0.5, -r * 0.3);
  g.fillStyle(0xf0a028, 1);
  g.fillTriangle(-r * 0.32, -r * 0.36, -r * 0.22, -r * 0.75, -r * 0.1, -r * 0.38);
  g.fillTriangle(r * 0.05, -r * 0.38, r * 0.18, -r * 0.8, r * 0.3, -r * 0.36);
  face(g, r, expression, { blush: false });
  // apron strap
  g.fillStyle(0x40241c, 1);
  g.fillRect(-r * 0.5, r * 0.5, r * 1.0, r * 0.14);
  g.fillStyle(0xe8a030, 1);
  g.fillCircle(0, r * 0.57, r * 0.06);
}

// Frost — ice guide: pale hood with a snowflake pin, white side-braid.
function drawFrost(g, r, expression) {
  bust(g, r, { skin: 0xf6ded1, robe: 0x8fc4dd });
  // hood
  g.fillStyle(0xbfe2f0, 1);
  g.fillEllipse(0, -r * 0.34, r * 1.16, r * 0.72);
  g.fillStyle(0xa5d2e6, 1);
  g.fillEllipse(0, -r * 0.18, r * 1.02, r * 0.4);
  // face opening
  g.fillStyle(0xf6ded1, 1);
  g.fillEllipse(0, -r * 0.06, r * 0.78, r * 0.82);
  // white braid over one shoulder
  g.fillStyle(PAPER.white, 1);
  g.fillCircle(r * 0.42, r * 0.32, r * 0.12);
  g.fillCircle(r * 0.48, r * 0.52, r * 0.11);
  g.fillCircle(r * 0.52, r * 0.72, r * 0.1);
  face(g, r, expression, { eye: 0x3a6c88 });
  // snowflake pin
  g.lineStyle(3, PAPER.white, 1);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    g.lineBetween(
      -r * 0.52 - Math.cos(a) * r * 0.09, -r * 0.42 - Math.sin(a) * r * 0.09,
      -r * 0.52 + Math.cos(a) * r * 0.09, -r * 0.42 + Math.sin(a) * r * 0.09,
    );
  }
}

// Faceta — crystal guide: angular amethyst hair cut in facets.
function drawFaceta(g, r, expression) {
  bust(g, r, { robe: 0x7d5bb5 });
  // faceted hair: hard triangles instead of curves
  g.fillStyle(0x9a6fd8, 1);
  g.fillTriangle(-r * 0.55, -r * 0.05, -r * 0.4, -r * 0.85, 0, -r * 0.4);
  g.fillTriangle(0, -r * 0.4, r * 0.05, -r * 0.95, r * 0.5, -r * 0.2);
  g.fillStyle(0xb890ea, 1);
  g.fillTriangle(-r * 0.35, -r * 0.3, -r * 0.05, -r * 0.8, r * 0.1, -r * 0.35);
  face(g, r, expression, { eye: 0x5a3f88 });
  // prism earring
  g.fillStyle(0xe6d8fa, 1);
  g.fillTriangle(r * 0.5, r * 0.05, r * 0.58, r * 0.22, r * 0.42, r * 0.22);
  // collar gem
  g.fillStyle(0xd8c2f5, 1);
  g.fillTriangle(0, r * 0.46, r * 0.1, r * 0.6, -r * 0.1, r * 0.6);
}

// Penny — market guide: copper curls, coin hairpin, freckles, big grin.
function drawPenny(g, r, expression) {
  bust(g, r, { robe: 0xb5652e });
  // copper curls
  g.fillStyle(0xc06a28, 1);
  g.fillEllipse(0, -r * 0.4, r * 1.05, r * 0.6);
  for (const [dx, dy] of [[-0.48, -0.2], [0.48, -0.2], [-0.34, -0.52], [0.34, -0.52], [0, -0.66]]) {
    g.fillCircle(r * dx, r * dy, r * 0.16);
  }
  face(g, r, expression);
  // freckles
  g.fillStyle(0xa5622e, 0.7);
  g.fillCircle(-r * 0.3, r * 0.05, r * 0.02);
  g.fillCircle(-r * 0.24, r * 0.1, r * 0.02);
  g.fillCircle(r * 0.28, r * 0.06, r * 0.02);
  g.fillCircle(r * 0.34, r * 0.11, r * 0.02);
  // coin hairpin
  g.fillStyle(PAPER.gold, 1);
  g.fillCircle(r * 0.4, -r * 0.5, r * 0.1);
  g.lineStyle(2, 0xa87818, 1);
  g.strokeCircle(r * 0.4, -r * 0.5, r * 0.06);
}

// Folio — librarian: round spectacles, page-fold hat, quill behind ear.
function drawFolio(g, r, expression) {
  bust(g, r, { skin: 0xe8c9b0, robe: 0x8a6a4a });
  // neat brown hair
  g.fillStyle(0x6a4a30, 1);
  g.fillEllipse(0, -r * 0.4, r * 0.98, r * 0.55);
  face(g, r, expression, { blush: false });
  // round spectacles OVER the eyes
  g.lineStyle(3.5, 0x3a2c1c, 1);
  g.strokeCircle(-r * 0.2, -r * 0.12, r * 0.15);
  g.strokeCircle(r * 0.2, -r * 0.12, r * 0.15);
  g.lineBetween(-r * 0.05, -r * 0.12, r * 0.05, -r * 0.12);
  // folded-page hat
  g.fillStyle(PAPER.cream, 1);
  g.fillTriangle(-r * 0.5, -r * 0.52, 0, -r * 0.95, r * 0.5, -r * 0.52);
  g.lineStyle(2, 0xc9b490, 1);
  g.lineBetween(-r * 0.3, -r * 0.6, r * 0.05, -r * 0.85);
  // quill behind the ear
  g.fillStyle(PAPER.white, 1);
  g.fillEllipse(r * 0.55, -r * 0.2, r * 0.1, r * 0.32);
  g.fillStyle(0x3a2c1c, 1);
  g.fillRect(r * 0.53, 0, r * 0.04, r * 0.14);
}

/* ------------------------------ fallbacks ----------------------------- */

function drawGenericFairy(g, r, accent, expression) {
  // little glowing fairy: wings, round body, antenna sparkle
  g.fillStyle(PAPER.white, 0.55);
  g.fillEllipse(-r * 0.4, -r * 0.05, r * 0.42, r * 0.7);
  g.fillEllipse(r * 0.4, -r * 0.05, r * 0.42, r * 0.7);
  g.fillStyle(accent, 0.95);
  g.fillCircle(0, 0, r * 0.5);
  g.fillStyle(PAPER.white, 0.35);
  g.fillCircle(-r * 0.12, -r * 0.14, r * 0.24);
  face(g, r * 0.62, expression);
  g.fillStyle(PAPER.gold, 1);
  g.fillCircle(0, -r * 0.66, r * 0.07);
  g.lineStyle(2, PAPER.gold, 0.8);
  g.lineBetween(0, -r * 0.5, 0, -r * 0.62);
}

function drawNarrator(g, r) {
  // an open storybook
  g.fillStyle(PAPER.cream, 1);
  g.fillRoundedRect(-r * 0.62, -r * 0.34, r * 0.6, r * 0.72, 6);
  g.fillRoundedRect(r * 0.02, -r * 0.34, r * 0.6, r * 0.72, 6);
  g.fillStyle(0xd8c8a8, 1);
  g.fillRect(-r * 0.02, -r * 0.34, r * 0.04, r * 0.72);
  g.lineStyle(2, 0xb8a888, 0.9);
  for (const dy of [-0.16, -0.02, 0.12, 0.26]) {
    g.lineBetween(-r * 0.5, r * dy, -r * 0.12, r * dy);
    g.lineBetween(r * 0.12, r * dy, r * 0.5, r * dy);
  }
  g.fillStyle(PAPER.gold, 1);
  g.fillCircle(0, -r * 0.5, r * 0.08);
}

function drawVillainCrest(g, r, accent) {
  // ominous horned crest — villains keep their mystery
  g.fillStyle(0x2a1a2e, 0.9);
  g.fillEllipse(0, 0, r * 1.1, r * 1.1);
  g.fillStyle(accent, 0.9);
  g.fillTriangle(-r * 0.5, -r * 0.1, -r * 0.3, -r * 0.72, -r * 0.12, -r * 0.2);
  g.fillTriangle(r * 0.12, -r * 0.2, r * 0.3, -r * 0.72, r * 0.5, -r * 0.1);
  g.fillStyle(0xf0e040, 1);
  g.fillEllipse(-r * 0.18, 0, r * 0.14, r * 0.08);
  g.fillEllipse(r * 0.18, 0, r * 0.14, r * 0.08);
}

function drawInitialMedallion(scene, container, g, r, speaker, accent) {
  g.fillStyle(accent, 0.85);
  g.fillCircle(0, 0, r * 0.55);
  const initial = String(speaker || '?').trim().charAt(0).toUpperCase() || '?';
  const t = scene.add.text(0, 0, initial, {
    fontFamily: '"Fredoka One", "Baloo 2", sans-serif',
    fontSize: `${Math.round(r * 0.7)}px`,
    color: '#fdf6e3',
    stroke: '#2a3a3a',
    strokeThickness: 4,
  }).setOrigin(0.5);
  container.add(t);
}
