# Math Warriors — Roadmap

**Status:** Living document. Updated as we learn what's actually hard and what's actually done.

---

## Guiding principles

1. **Playable over polished.** At every milestone, the game should be *playable end-to-end* for the scope of that milestone. No "it looks great but the buttons don't work" states.
2. **Vertical slice first.** Finish one floor completely before starting a second floor. A complete floor teaches us more than five half-finished ones.
3. **Ship the loop, not the content.** The game loop (title → pick → explore → fight → win → next) matters more than having 25 enemies. One enemy that works beats twenty-five that are half-broken.
4. **Playtesting drives priority.** After every milestone, the user plays it on iPad. Their feedback beats any planned feature list.

---

## Milestone: v0.1 — "It boots"

**Goal:** Prove the stack. Prove the deploy pipeline. See the Math Warriors logo on an iPad.

- [x] Repo scaffolding (README, LICENSE, .gitignore)
- [x] Vite + Phaser installed
- [x] `index.html` entry point
- [x] BootScene that loads a single asset
- [x] TitleScene that displays "MATH WARRIORS" and a START button
- [x] GitHub Actions workflow that auto-deploys to Pages on push
- [x] Live URL bookmarked on iPad

**Done when:** The URL loads, shows the title, and the START button does *something* (even if it just prints to console).

**Time estimate:** 1–2 sessions.

---

## Milestone: v0.2 — "One hero, one enemy, one fight"

**Goal:** A single complete turn-based battle from start to finish.

- [ ] Placeholder hero sprite (any one class) rendered in BattleScene
- [ ] Placeholder enemy sprite (any one enemy) rendered in BattleScene
- [ ] Math question generator (working `generateQuestion` with all four operators)
- [ ] Four answer buttons wired to combat logic
- [ ] Hero attack → enemy HP bar decreases
- [ ] Wrong answer → enemy attacks → hero HP bar decreases
- [ ] Victory screen
- [ ] Defeat screen
- [ ] Return to title

**Done when:** A human can open the URL, see a fight, answer questions, and win or lose.

---

## Milestone: v0.3 — "Three heroes, party system"

**Goal:** Three heroes fighting together.

- [ ] PartySelectScene with three placeholder hero options
- [ ] Party of three carries through to BattleScene
- [ ] Turn order: hero 0 → enemy → hero 1 → enemy → hero 2 → enemy
- [ ] Active-hero indicator in battle
- [ ] Dead heroes skipped in rotation
- [ ] Party wipe triggers defeat

**Done when:** The user can pick three heroes and fight a battle where each hero takes turns.

---

## Milestone: v0.4 — "World Map + save persistence + battle juice"

**Goal:** Connect the existing scenes into a loop with real progression and real game feel. Prove the RPG-feel bar before adding the maze.

- [ ] `DESIGN-PRINCIPLES.md` drafted and committed (synthesis of RPG + educational game research)
- [ ] `src/systems/audio.js` stub so audio infrastructure is ready for real sounds
- [ ] WorldMapScene with 5 floor nodes and linear unlock logic
- [ ] Save system wired into battle victory — gold persists, floors unlock persistently, HP carries forward
- [ ] Battle juice pass:
  - [ ] Hit-pause (~80ms freeze on damage impact)
  - [ ] Particle burst on hit
  - [ ] Arcing damage numbers
  - [ ] Camera zoom on critical moments
  - [ ] Snappier turn transitions (tighten 900ms delays to ~400ms)
- [ ] TitleScene detects existing save, offers "Continue" vs. "New Game"

**Done when:** You can start a new game, pick a party, see the world map, tap Floor 1, fight a battle, win, return to the map with your progress saved, close the browser tab, re-open, and continue from where you left off.

**Scope note:** The walkable maze moves to v0.5. v0.4 connects what we already have into a complete loop.

## Milestone: v0.5 — "The walkable maze"

**Goal:** A walkable dungeon with random encounters. This was v0.4 originally; moved down because v0.4 became the polish/glue milestone.

- [ ] MazeScene with a 19×25 tilemap (floor 1 layout from prototype, or new)
- [ ] Party walks around (d-pad + touch)
- [ ] Camera follows party
- [ ] Fog of war reveals as you move
- [ ] Walking into a monster triggers BattleScene
- [ ] Victory returns to maze at the same position
- [ ] Chests give gold / potions
- [ ] Boss at end of maze
- [ ] Beating boss → "Floor complete!" → return to WorldMap

**Done when:** The user can play a complete floor from maze entry to floor complete.

---

## Milestone: v0.5 — "All five floors"

**Goal:** The full five-floor progression, one style per floor.

- [ ] WorldMapScene with 5 floor nodes, linear unlock
- [ ] All 5 floor maze layouts
- [ ] 5 enemies per floor = 25 enemies total (stats + abilities)
- [ ] 5 bosses, one per floor (real bosses this time, not placeholder monsters)
- [ ] Floor 1: papercut placeholder art
- [ ] Floor 2: claymation placeholder art
- [ ] Floor 3: pencil sketch placeholder art
- [ ] Floor 4: pixel art placeholder art
- [ ] Floor 5: painterly placeholder art
- [ ] GradeSelectScene actually drives math difficulty
- [ ] Per-floor background music
- [ ] Save/load via localStorage

**Done when:** The user can play a complete run from title → grade → party → floor 1 → ... → floor 5 → victory, with a save/load cycle in the middle.

---

## Milestone: v0.6 — "Polish pass"

**Goal:** Playtest feedback has been addressed. The game feels good.

- [ ] Screen transitions (fades, slides)
- [ ] Feedback on every button press (sound + visual)
- [ ] Damage numbers float up and fade
- [ ] Momentum meter animates smoothly
- [ ] Correct answer has a satisfying sting, wrong answer has a clear thud
- [ ] Hero idle animations
- [ ] Enemy idle animations
- [ ] Boss intro cinematic (can be a single stinger + zoom)
- [ ] Victory animation + fanfare
- [ ] Tutorial covering movement, combat, and momentum on first run

**Done when:** Playtesting no longer produces "this feels rough" feedback. All remaining issues are about content, not feel.

---

## Milestone: v0.7 — "Real art"

**Goal:** Placeholder art replaced with final art for each level.

- [ ] Floor 1 final art (papercut, consistent across all assets)
- [ ] Floor 2 final art (claymation)
- [ ] Floor 3 final art (pencil)
- [ ] Floor 4 final art (pixel)
- [ ] Floor 5 final art (painterly)
- [ ] Hero sprites finalized (one true look, maybe with level-overlay lighting)
- [ ] UI chrome finalized (one consistent look across all floors)

**Done when:** Every asset in the game looks intentional, not placeholder.

---

## Milestone: v0.8 — "Real audio"

**Goal:** Placeholder audio replaced with final audio.

- [ ] Five final music tracks (one per floor)
- [ ] Title / world map music
- [ ] Full SFX library (correct, wrong, attack, hurt, chest, fairy, level-complete, boss, click, UI tick)
- [ ] Audio volume settings page
- [ ] Audio respects iOS silent switch

**Done when:** Playing with sound is meaningfully better than playing with sound off.

---

## Milestone: v0.9 — "Capacitor wrap"

**Goal:** The web game runs as a native iOS app.

- [ ] Capacitor installed and configured
- [ ] Xcode project generated
- [ ] App runs in iOS Simulator
- [ ] App runs on a real iPad via cable
- [ ] App icon, splash screen, Info.plist configured
- [ ] Orientation locked to landscape
- [ ] Status bar handled
- [ ] Safe areas handled for iPhone notch
- [ ] TestFlight build submitted

**Done when:** The user's own iPad can launch Math Warriors as a native app, not a browser tab.

---

## Milestone: v1.0 — "App Store submission"

**Goal:** Listed on the iPad App Store.

- [ ] Apple Developer account active ($99/year)
- [ ] App Store Connect app record created
- [ ] App icon 1024×1024
- [ ] Screenshots for iPad 12.9" (required) and iPad 11" (required)
- [ ] App description, keywords, age rating (4+)
- [ ] Privacy policy (even if "we collect nothing")
- [ ] Privacy nutrition labels
- [ ] Parent gate if any external links
- [ ] Review build submitted
- [ ] Review passed
- [ ] Release

**Done when:** Someone who isn't us can download Math Warriors from the App Store.

---

## Not-yet-scheduled (v1.1+)

Features worth considering after v1.0 ships:

- **Android build** via Capacitor
- **iPhone support** (it's mostly there if we respect safe areas)
- **Additional hero variety** (distinct stats/abilities per hero, not just cosmetics)
- **Endless mode** after floor 5
- **New Game Plus** with harder math and the same characters
- **Achievements** via GameCenter
- **iCloud save sync**
- **Leaderboards** for "fastest floor clear"
- **Localization** (Spanish first, French second)
- **Teacher / parent dashboard** showing progress
- **Custom difficulty override** for parents who want to tune specific areas
- **Boss rematch mode**
- **Hidden 6th floor** with time-attack challenges

## Explicitly out of scope, maybe forever

- Multiplayer (sync or async)
- User-generated content
- In-app purchases
- Ads
- Account system
- Analytics beyond basic "how many people opened the app"
