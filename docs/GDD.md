# Math Warriors — Game Design Document

**Status:** Draft, extracted from the v0 prototype. Open to revision.

---

## 1. Elevator pitch

A single-player, turn-based math RPG for kids K–5. Build a party of three heroes, explore a five-floor dungeon, and defeat the monsters guarding each operator (+, −, ×, ÷) by answering math problems in combat. Each floor is a small maze with treasures, friendly spirits to rescue, monsters to fight, and a boss at the end.

## 2. Core fantasy

> "The world's mathematical fabric is unraveling. Only you can press the pieces back into place."

The player is the hero the world is waiting for. Math is the weapon. Each operator is a living domain, and each floor is a different *kind* of world — a garden, a tidepool ruin, a cloud maze, ember caves, and a final mending room.

## 3. Target audience

- **Primary:** Kids ages 5–11 (roughly K–5).
- **Secondary:** Parents and teachers looking for educational games that are *actually* games.
- **Device:** iPad primary, iPhone possible. Landscape only.

## 4. Core loop

```
Title
 └── Grade select (drives math difficulty)
      └── Party select (pick 3 heroes from 15)
           └── World Map (choose an unlocked floor)
                └── Maze (explore, find treasure, rescue fairies)
                     ├── Random encounters → Battle → back to Maze
                     └── Boss → Battle → Floor complete → unlock next floor
                          └── Back to World Map
```

## 5. The math

The **Grade Select screen** drives a difficulty table that the question generator reads. Grade level affects:

- Number range (K: 1–5, 5th: 1–100+)
- Operator availability (K–1: +, −; 2–3: add ×; 4–5: add ÷)
- Question complexity (single-digit → multi-digit → multi-step)

The **floor's operator** determines the primary operator used on that floor. Floor 5 uses all four.

### Difficulty tiers (starting point — tune in playtest)

| Grade | Floors available | Max operand | Notes |
|---|---|---|---|
| K | +, − only | 5 | Single digit, counting feel |
| 1 | +, − | 10 | Simple facts |
| 2 | +, −, × | 20 | Intro to multiplication |
| 3 | All ops | 50 | Times tables to 10×10 |
| 4 | All ops | 100 | Multi-digit |
| 5 | All ops | 144+ | Full times tables, long division |

## 6. Heroes

Three classes, five heroes each, fifteen total. The player picks **three** for their party.

### Knights (melee tanks)
| # | Name | Trait |
|---|---|---|
| 1 | Shadow | Unseen. Unstoppable. |
| 2 | Crusader | Holy. Righteous. Relentless. |
| 3 | Paladin | Light in darkness. Grace in battle. |
| 4 | Berserker | Pure fury. Zero chill. |
| 5 | Great Helm | Noble. Steadfast. Legendary. |

**Base stats (all knights):** HP 50, MP 30, ATK 18, DEF 14
**v0 issue:** All 5 knights had identical stats in the prototype. In v1, each hero should have slightly different stats or a signature ability that matches its flavor.

### Wizards (ranged casters)
| # | Name | Trait |
|---|---|---|
| 1 | Stargazer | The cosmos bends to her will. |
| 2 | Toadstool | Brews chaos. Serves it hot. |
| 3 | Spellblade | Magic fists. Still counts. |
| 4 | Bookworm | Knows every spell. Uses them all. |
| 5 | Grand Mage | Ancient power. Zero patience. |

**Base stats:** HP 40, MP 50, ATK 22, DEF 8

### Battle Bunnies (fast melee)
| # | Name | Trait |
|---|---|---|
| 1 | Pepper | Tiny. Fast. Absolutely feral. |
| 2 | Nova | She sparkles. Then she wins. |
| 3 | Boulder | Heaviest punch in the kingdom. |
| 4 | Blaze | Fire magic. Fire attitude. |
| 5 | Duchess | Royal blood. Royal fury. |

**Base stats:** HP 45, MP 40, ATK 20, DEF 10

## 7. Enemies

Five enemies per floor. Each has a signature ability that creates a distinct combat puzzle.

### Floor 1 — The Garden (Addition)
| Name | HP | Ability |
|---|---|---|
| Sproutling | 10 | **Sporulate** — builds up a counter that releases bonus damage |
| Thornwall | 14 | **Accumulate** — attack power grows each turn |
| Blossom Fiend | 12 | **Sweet Addition** — lure-heals itself from player wrong answers |
| Puffshroom | 16 | **Pressure Build** — charges then releases a burst |
| Briar King | 24 | **Crown Tally** — gains a stacking damage bonus from correct answers |

### Floor 2 — Tidepool Ruins (Subtraction)
| Name | HP | Ability |
|---|---|---|
| Drifter | 12 | **Sting Drain** — drains player momentum on every hit |
| Gulper | 18 | **Consume** — locks an answer button after a wrong answer |
| Inkspitter | 14 | **Ink Cloud** — obscures questions for several turns |
| Abyssal Eel | 20 | **Drain Current** — reduces hero stats temporarily |
| The Pressure | 30 | **Absolute Reduction** — permanently lowers a hero's max HP on hit |

### Floor 3 — Cloud Maze (Multiplication)
| Name | HP | Ability |
|---|---|---|
| Stormwing | 16 | **Thunder Multiply** — damage scales with player's wrong-answer streak |
| Hailshot | 14 | **Hailstorm Volley** — multi-hit attack |
| Cyclone Imp | 12 | **Spin Up** — damage increases each idle turn |
| Thunderclap | 20 | **Clap Charge** — charges then releases a multiplicative burst |
| Skywhale | 36 | **Mass Matters** — enrages below half HP |

### Floor 4 — Ember Caves (Division)
| Name | HP | Ability |
|---|---|---|
| Cindercrab | 18 | **Shell Split** — splits into two smaller enemies at half HP |
| Ashwalker | 20 | **Ash Divide** — divides player momentum on hit |
| Magma Toad | 22 | **Split Tongue** — attacks two heroes at once |
| Spineshard | 16 | **Shard Volley** — attack power scales with its remaining HP |
| Pyroclast | 28 | **Core Divide** — explodes on countdown if not finished |

### Floor 5 — The Mending Room (All Operations)
| Name | HP | Ability |
|---|---|---|
| Runebound | 24 | **Operator Shift** — changes active operator every 2 turns |
| Hexweave | 20 | **Geometric Lock** — locks an answer choice each turn |
| Grimoire | 22 | **Flip to Page** — changes operator every turn |
| Familiar | 16 | **Phase Lock** — immune to one class of hero at a time |
| The Theorem | 40 | **The Unknown** — wields all four operators in a rotating pattern |

## 8. Combat system

### Turn order
Party of 3 heroes and 1 enemy alternate: hero 0 → enemy → hero 1 → enemy → hero 2 → enemy → repeat. Dead heroes are skipped.

### Hero turns
The game shows a math question. Four answer buttons. Tap the right one:

- **Correct answer** → hero attacks the enemy for base damage + streak bonus
- **Wrong answer** → enemy counter-attacks the hero for base damage

### Enemy turns
Enemy picks a random living hero and attacks. Ability may modify damage or have a side effect.

### Momentum
A 0.0–1.0 meter displayed above the battle UI. Divided into three zones:

- **COOL (0.0–0.33):** Hero damage reduced 25%. *(Prototype bug: enemy got no penalty — v1 should penalize both sides or neither.)*
- **ZONE (0.33–0.66):** Hero damage +25%. Normal enemy damage.
- **HEAT (0.66–1.0):** Enemy damage +40%. *(Prototype bug: hero got no bonus — v1 should reward both or neither.)*

**v1 decision needed:** Should HEAT be a *player advantage* (high damage, risky) or *player disadvantage* (overextended, enemy rallies)? Currently it's purely a penalty, which is harsh.

Correct answers increase momentum. Wrong answers drop it. Streaks boost the increase.

### Damage
Base damage 4 + streak bonus for heroes; 4–6 random for enemies. Momentum multipliers apply. Hero class should affect this (Knight +def, Wizard +atk, Bunny balanced).

### Death
A hero at 0 HP is dead for the rest of the battle. A wiped party = game over → back to World Map.

## 9. The maze

Each floor is a small grid-based maze drawn from a tilemap. Tiles:

- **Wall** — blocks movement
- **Floor** — walkable
- **Path** — walkable, decorative
- **Water** — walkable decorative
- **Secret** — TBD

### Maze objects
- **Chests** — gold, potions, or rescued fairies
- **Golden chest** — holds the exit key, unlocks after rescuing all 3 fairies
- **Exit portal** — appears when the key is found; blocked until the boss is defeated
- **Boss** — one per floor, placed near the exit
- **Monsters** — random encounters
- **Loose gold / potions** — pickup items

### Fog of war
The player can only see a few tiles in each direction. Walking reveals more. A scroll can be found that unlocks a minimap.

### Movement
- Desktop: arrow keys / WASD
- Mobile: on-screen d-pad in the corner OR touch-and-drag on the screen
- Party moves in a conga line — lead hero + two followers behind

## 10. Progression & saves

- **Floors unlock linearly:** beat floor 1 to unlock floor 2, etc.
- **Gold** persists across battles and floors.
- **HP** persists *within* a maze run but fully heals between runs (v1 decision).
- **Potions** heal a hero during battle.
- **Save:** `localStorage` auto-save after every floor complete. No manual save slots for v0.1 — one save per device. Multi-slot can come later.

## 11. UI flow (screens)

1. **Title** — logo + START
2. **Grade Select** — six buttons (K through 5)
3. **Party Select** — three class tabs, hero grid, party strip, confirm
4. **World Map** — five floor nodes with paths, unlock state, tooltip on hover
5. **Maze** — full-screen tilemap, HUD with HP/potions/gold, minimap button
6. **Battle** — hero sprites left, enemy sprite right, math question + 4 answers below, momentum bar, potion button
7. **Victory / Defeat** — end screen with continue button

## 12. Audio plan

(All TBD — no audio in the prototype.)

- **Music:** One loop per floor, themed to the operator.
- **SFX:** Correct-answer chime, wrong-answer thud, attack, hurt, chest-open, fairy-rescued, level-complete fanfare, boss-intro sting, UI click.
- **Voice:** Optional hero-specific "hit" grunts and fairy-rescue cheers. Probably v1.5+.

## 13. Accessibility

- **Color:** Do not rely on color alone for correct/wrong feedback (use shape and position too).
- **Text:** Large, readable, dyslexia-friendly font option.
- **Dyscalculia:** Show visual representations of quantities when helpful (e.g., 3 apples + 2 apples).
- **Motor:** Touch targets ≥ 44×44pt.
- **Pause:** Always available; battle turn should not time out.
- **No reading required:** The game should be playable by a 5-year-old who can't read yet. Use icons and short labels.

## 14. Open design questions

These need answers before v0.5:

1. **HEAT zone** — player advantage or disadvantage?
2. **Between-battle healing** — full heal? partial? none (potions only)?
3. **Permadeath?** — If a hero hits 0 HP, are they out for the whole run, or healed at the next maze entry?
4. **Hero variation** — do the 5 knights have different stats/abilities, or are they purely cosmetic?
5. **Multi-level art styles** — confirm yes/no and sketch a plan (see `ART-STYLE.md`)
6. **Grade switching mid-game** — can a player change their grade? Is it locked per save?
7. **Adult / parent mode** — a "free play" mode with no progression, just math practice?
8. **Post-floor-5** — endless mode? new game plus? just credits?

## 15. What "done" means for v1.0

- All 5 floors playable end-to-end
- All 25 enemies and 5 bosses working (real bosses, not placeholder monsters)
- Grade-select actually drives difficulty
- Audio (music + SFX) in place
- Save / resume working across app closes
- Tutorial covering movement, combat, math answering, and momentum
- Runs well on iPad (60fps, no memory bloat)
- Submitted to App Store via Capacitor
