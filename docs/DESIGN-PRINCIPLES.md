# Math Warriors — Design Principles

**Status:** Living document. Synthesis of research on indie RPG design, turn-based combat, educational math games, and kids' engagement. These are the rules we're building to.

---

## Why this doc exists

Everything in this game should trace back to one of the principles here. If a feature doesn't serve at least one principle, cut it. If a principle conflicts with a feature, the principle wins. When we're unsure whether a design choice is good, we check it against this list.

---

## The prime directive

**Kids should feel like they're playing a real RPG that happens to require math, not a math app that happens to have RPG coating.**

This is the entire thesis. Every other principle supports it.

The research on Prodigy Math makes this vivid: *"being a powerful wizard who happens to be doing subtraction is a huge psychological win."* The math is the cost of entry to the fantasy, not the point of the session. When a kid closes the app, they should tell their parents "I beat the Blossom Fiend" — not "I did 40 addition problems."

If math becomes the foreground, we've lost.

---

## Core principles

### 1. Feedback is the invisible dialogue

Every player action deserves a response the player can see, hear, and *feel*. No silent turns. No "did that work?" moments.

**What this means concretely:**
- Correct answer → enemy flashes, shakes, damage number floats up, sound plays, hero sprite animates attack, momentum bar fills a notch
- Wrong answer → red flash, error stinger, hero sprite reels back, momentum drops visibly
- Tap any button → immediate visual press, then the actual effect
- Hit an enemy → screen shake + hit-pause (freeze everything for ~80ms on impact — it makes the hit feel like it *lands*)
- Level up → fanfare, particles, stat changes animate up, not just change value

**What it doesn't mean:**
- Juice is not a substitute for bad fundamentals. Screen shake can't fix unresponsive input. Particles can't fix confusing UI. Polish amplifies good design; it doesn't replace it.

### 2. Clarity before complexity

Players should always understand what their next move will do before they commit. Every UI element earns its real estate by answering a question the player is actively asking.

**Specific rules:**
- Always show current HP, current momentum, whose turn it is
- Show damage ranges / hit chances when they're relevant
- Never surprise the player with a mechanic the UI didn't hint at
- One question on screen at a time. No cramming.
- Touch targets minimum 44×44 points
- Important text should be readable at arm's length on an iPad

### 3. Snappy tempo, not slow ceremony

The research on turn-based combat is consistent: snappy transitions and short animations beat elaborate ones. A 400ms hit animation is more satisfying than a 1200ms one, because the player is back in control faster.

**Targets:**
- Answer button tap → damage lands: under 400ms
- Enemy turn total duration: under 2 seconds
- Scene transitions: 200–300ms fade, not 600ms
- Never more than 3 seconds between player inputs

**Anti-pattern:** the prototype's 900ms `setTimeout(nextTurn, 900)` between turns. Too slow for a kid.

### 4. Meaningful choices every turn

Every turn should present a small dilemma. If the only decision is "which of these four numbers is the right answer," combat becomes a quiz. Quizzes are what kids close apps to avoid.

**How we add depth without adding complexity:**
- **Potions** — use now to heal, or save for the boss? (already in design)
- **Streak gambling** — break the streak to use a special ability, or keep pushing?
- **Target choice** — later, multi-enemy fights let you pick which to attack
- **Momentum push vs. safety** — the HEAT zone is powerful but one wrong answer sends you reeling
- **Hero swap** — swap a tired hero to the back to rest, bring a fresh one forward

Not all of these ship in v0.4. But we design systems so they *can* slot in.

### 5. The dopamine loop is the engine

Prodigy's designers figured this out: kids don't play for math, they play for the loop. Battle → reward → visible progress → new battle. Cosmetic unlocks, rare drops, a shiny new thing to put on the shelf.

**What we commit to:**
- **Visible progress.** World map shows cleared floors with a gold star and the boss defeated. Kids should be able to see how far they've come in one glance.
- **Collectible progression.** We will have cosmetic unlocks (hats, cloaks, weapons, pets) that kids can show off. Not in v0.4, but the system gets designed now.
- **Currency with meaning.** Gold from battles goes somewhere the player wants to go. Not just "stats up" — cosmetic drip.
- **Rare drops.** Occasionally a battle drops something special. Kids talk about rare drops. It's the entire conversation around Pokémon.

**What we avoid:**
- "Loot boxes" with randomized cost (predatory for kids)
- In-app purchases in general for v1 (COPPA + App Store safety)
- Streaks that punish you for missing a day (stress, not fun)

### 6. Confidence first, challenge second

The research is unanimous: the biggest learning gains come from *struggling* students, and the mechanism is confidence-building. A kid who thinks they're "bad at math" needs a lot of early wins before they'll try the hard stuff.

**What this means:**
- **First floor is easy.** The Garden should feel like a win from the first question.
- **Early failures are silly, not discouraging.** Wrong answer → goofy enemy gloat, not "GAME OVER."
- **Questions escalate *inside* a floor**, not between floors. A 3rd grader gets 3rd-grade-level questions across all five floors; the fantasy escalates, not the math difficulty.
- **Adaptive difficulty.** Track streak and shift the question pool one step easier on a losing streak, harder on a winning one. Both directions — the Zone of Proximal Development is a moving target.
- **Celebrate low-hanging fruit.** "10 correct in a row!" fanfare is more motivating for a struggling kid than a 50-streak achievement they'll never hit.

### 7. Respect session length

Kids play in bursts. 5 minutes on a car ride. 10 minutes before dinner. 3 minutes while the sibling is in the bathroom. The game must respect that.

**Hard requirements:**
- **Autosave** after every battle, every maze move, every floor complete
- **Resume anywhere.** Closing the app should drop you back where you left, never at the title screen
- **Battles under 2 minutes.** No boss fight longer than 5 minutes, and bosses are rare
- **No "wait to continue" mechanics.** No hearts that refill over time, no "come back tomorrow" nonsense
- **Pause always available.** One tap, top corner, resume exactly where you were

### 8. Failure is a restart, not a punishment

Kids bail when they feel bad. Adults push through frustration; kids don't. A defeat screen that feels like a scolding is a defeat screen that stops the play session.

**What defeat looks like in Math Warriors:**
- "The party retreats to camp to rest" — not "YOU DIED"
- Lose nothing except a small amount of progress on the current floor
- Back to the world map, full heal, try again
- No xp penalty, no gold penalty, no permadeath
- The *boss* you were fighting keeps its HP high-score (so a near-miss run is still worth remembering)
- Optional "hint" offered on repeated failures: "Wizard seems confused by subtraction. Try the Bunnies instead."

### 9. Character attachment

Good RPGs make you care about the party. Kids especially bond with characters. If the Bunny is just "the pink one with some trait," we've failed. It needs to feel like *your* Bunny.

**Tactics:**
- **Names matter.** Our heroes have names (Pepper, Nova, Duchess, Grand Mage, etc.). Use them in UI, not "Hero 1."
- **Catchphrases.** Each hero has one short line they say when joining the party and one when they land a critical hit. "Let's rumble!" "By my name!" Cheap and memorable.
- **Signature abilities.** Each hero's active ability should be *theirs*. Pepper's dash. Nova's starfield. Boulder's slam.
- **Visible personality** in how they stand, how they attack, how they react to damage. The papercut art direction makes this easy if we plan for it.

### 10. One great screen at a time

The temptation of indie games is to build ten half-finished screens. The discipline of good games is to ship one complete screen before starting the next. A polished title, party select, world map, maze, and battle — done one at a time — is better than a half-working everything.

This is our project discipline, not just a design principle.

---

## Decisions this doc locks in

Things we've been debating that are now locked:

### Grade selection

**Decision:** Grade is set once at the start and used to drive question difficulty throughout the game. Can be changed from Settings but requires a prompt ("Change grade level? Your progress stays."). No per-battle grade override.

### Difficulty within a grade

**Decision:** Adaptive. We track the player's streak and the last 10 questions. A winning streak (>4) shifts difficulty up one notch. A losing streak (>2) shifts difficulty down one notch. The base floor is set by grade.

### Permadeath

**Decision:** No. Heroes never permanently die. A wiped party returns to camp, fully heals, and can try again. This is an educational game for kids; frustration gates are counterproductive.

### HP between battles

**Decision:** Persists within a maze run (so you can't just heal to full by stepping outside a fight). Resets to full when you enter a new floor from the world map. Potions can be used mid-battle to heal.

### The momentum zones (revised)

**Decision:** Symmetric multipliers, per the v0.2 combat rewrite:
- COOL (0.0–0.33): hero ×0.85, enemy ×1.15
- ZONE (0.33–0.66): hero ×1.00, enemy ×1.00
- HEAT (0.66–1.0): hero ×1.20, enemy ×0.85

The prototype had this backwards for the player. Fixed.

### Session length

**Decision:** Design target is a satisfying 5-minute session. A player who gets interrupted at minute 2 should feel like they *accomplished something* before closing. This pushes us toward more frequent rewards and shorter battles.

### Monetization

**Decision for v1.0:** Paid app, no in-app purchases, no ads. Everything in the game is unlockable through play. COPPA-safe by construction.

### Cosmetic unlocks

**Decision:** Yes, but deferred to v0.8 or later. The *system* gets designed now (equip slots, unlock conditions, display logic) so the data model supports it even when v0.4 doesn't use it. Post-launch content can lean hard into this.

---

## What we explicitly reject

- **Paywalls on content.** Everything unlocks through play. Kids shouldn't be guilted into asking their parents for money.
- **"Streak" mechanics that punish missed days.** Duolingo's streak system is brilliant for adults, cruel for kids. We don't ship guilt.
- **Notifications that nag.** One welcome-back ping if the player has been away more than a week, maybe. That's it.
- **"Lives" or energy meters that regenerate over real-time.** Predatory. Also annoying.
- **Hidden difficulty ramps.** The player always knows approximately how hard the next battle is.
- **Reading as a gate.** A kid who can't read yet should still be able to play. Use icons, voice, and context over text.

---

## What "done" feels like when we ship v1.0

Close your eyes and imagine a 2nd grader picking up an iPad, opening Math Warriors, and playing for 15 minutes. Here's what that looks like if we've done our job:

- They tap the app icon. The title screen comes up immediately. No loading.
- They tap START. They already had a save from yesterday. They land directly on the world map, their party ready.
- They see Floor 2 is unlocked now — they beat Floor 1 yesterday. They tap Floor 2.
- Maze appears. They walk their heroes around, peeking behind corners.
- They find a chest. It glows. They tap it. A gold coin spins out. They got 5 gold.
- They walk further. A monster appears. Music shifts. Combat scene transitions in.
- The enemy is big and weird-looking and a little scary. The first question shows up: "12 − 5 = ?"
- They know this one. They tap 7. The Bunny runs forward, punches the enemy, screen shakes. Damage number bounces up. They grin.
- Enemy takes a turn. Hits the Knight. Knight reels back with a paper-tear sound. A "−4" floats up.
- Next question. "13 − 9 = ?" They hesitate. They try 5. Wrong. The enemy flashes green for the right answer (4). Then attacks them again.
- They learn that it was 4, not 5. They remember for next time.
- Few more questions. The enemy dies in a puff of papercut confetti. Their heroes cheer. 12 gold drops. Level-up jingle plays.
- They keep exploring. Mom calls them for dinner. They tap the pause button. It says "Adventure saved." They close the iPad.
- Tomorrow they open it again. They're in the exact spot they left off, healed up, 12 gold richer.

**If that scene is what happens, we've won.** Every design decision in this document is in service of making that scene real.

---

## Sources informing this doc

This synthesis draws on research about indie game feel and juice, educational math game engagement, Prodigy Math's design lessons, and turn-based RPG combat principles. Full citations live in the commit message of the doc's introduction.
