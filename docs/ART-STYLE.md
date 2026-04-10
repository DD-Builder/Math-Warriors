# Math Warriors — Art Style Guide

**Status:** Draft with live references. DD-Builder supplied the first batch of visual references on day 1; this doc is now tracking those plus the implications for gameplay.

---

## Reference boards

### Board 1 — DD-Builder's initial papercut references

Four images shared in conversation that lock in the target bar for what "papercut" means in this game. These are *not* the prototype's flat polygon look — they're genuine multi-layer dioramas with depth, lighting, and dramatic framing.

**Reference A — "Dark mountain diorama with crescent moon"**
- Source: storage.googleapis.com (wallpaper / reference find)
- Dark stage with layered paper mountains (teal), warm coral bushes, cream castle, crescent moon, paper clouds, small bird silhouettes
- Dominant palette: charcoal background, teal + coral + cream accents, warm orange highlights
- Mood: cinematic, dramatic, "final act"
- **Assignment: Floor 5 — The Mending Room** (the final floor deserves this weight)

**Reference B — "Round-framed forest with butterflies"**
- Source: DuckDuckGo image search, "papercut art"
- Round organic frame with layered green waves cut into hills; butterflies, flowers, trees inside; mint green background
- Dominant palette: soft greens, rose pink, coral, cream
- Mood: bright, whimsical, approachable, unmistakably for kids
- **Assignment: Floor 1 — The Garden** (this is exactly right for addition / first floor)

**Reference C — "Dark archway with glowing castle"**
- Source: DuckDuckGo image search, "papercut art"
- Dark silhouette trees framing an arched portal; glowing warm lantern light drawing the eye to a central castle
- Dominant palette: near-black silhouette, warm gold glow, amber highlights
- Mood: dramatic, mysterious, stage-lit
- **Assignment: Reference for battle background framing in ALL levels** — the glow-in-the-center composition tells us how to light a battle so heroes and enemy read clearly

**Reference D — "Monochrome cream forest arch"**
- Source: freepik.com
- Cream / white papercut trees framing a circular arch, distant castle, small blue water, birds
- Dominant palette: warm cream / white with subtle blue water, no saturation
- Mood: elegant, calm, music-box
- **Assignment: Title screen + menu backgrounds** — evokes the "open the storybook" moment before play begins

---

## The big idea

**Each floor feels like a different kind of game.** Instead of one unified art style across all five floors, every level gets its own distinct aesthetic. The player literally walks into a new visual world each time they complete a floor.

This is our single biggest differentiator in the educational game space — most kids' games pick one style and stick with it.

## The diorama-as-stage framing device

All four reference images share one thing: a **framing device** — a window, arch, or round portal — that presents the scene as something you're *peering into*. This isn't decoration; it's the core metaphor.

**Gameplay implication:** we treat every encounter as a stage inside a diorama box, not a flat background behind flat sprites.

- **Battle scene layout:** Heroes and enemy stand on a "stage floor" in front of a layered papercut backdrop. A decorative frame (arch / window / torn paper edge) vignettes the edges of the playfield. The HUD (momentum bar, answer buttons) lives *outside* the frame, like theater curtains or program notes.
- **Maze → battle transition:** Walking into an enemy on the top-down maze triggers a camera zoom into the player's tile, then a curtain-pull transition into the battle diorama. Reinforces "stepping into a scene."
- **Lighting:** Each diorama has a clear light source — moon, lantern, sun, glow — that draws the eye to the center. Heroes and enemies read as silhouettes against that light. This matters for gameplay clarity as much as style.

## Why it works

- **Variety keeps kids engaged.** A 7-year-old will get bored of one look after 20 minutes. Five looks buys us hours of novelty.
- **Each operator gets its own vibe.** Addition feels like growing things (garden). Subtraction feels like erosion (tidepool). Multiplication feels like stacking (clouds). Division feels like breaking (caves). Mixed ops feels like synthesis (mending room).
- **It's cheaper than we think.** With AI image generation, producing five distinct style buckets costs pennies compared to a human artist producing one consistent style.
- **It's modular.** If a style doesn't land, we swap that level's folder without touching code.

## The risk

**Consistency inside a level is critical.** A floor with five different-looking enemies in slightly-different-but-not-quite styles looks broken. A floor where every asset locks into one strong style feels like a *choice*. We need consistency *within* each bucket even more than we need variety *between* them.

**Mitigation:** Pick one reference image per level. Generate all assets for that level using the same reference + style prompt. Lock the palette before producing any sprites. Reject anything that doesn't match.

## Style buckets (updated with Board 1 references)

These are suggestions. You can change any of them.

### Floor 1 — The Garden — **Papercut diorama (Reference B)**
- **Reference:** Eric Carle books, *Creature Comforts*, papercut animation like *The Secret of Kells*
- **Palette:** Warm greens, cream paper, deep shadow, spot color in rose and gold
- **Textures:** Visible paper grain, torn edges, layered depth
- **Feel:** Handmade, cozy, inviting
- **Why here:** First impressions matter; papercut is approachable and immediately reads as "made with care"

### Floor 2 — Tidepool Ruins — **Claymation / stop-motion**
- **Reference:** Wallace & Gromit, *Chicken Run*, Laika studios
- **Palette:** Deep blues, bone white, coral accents, green-glass water
- **Textures:** Fingerprints in clay, subtle wobble in animation, matte surfaces
- **Feel:** Tactile, slightly creepy, old
- **Why here:** Subtraction is about things being worn away; claymation has natural erosion in the medium

### Floor 3 — Cloud Maze — **Pencil sketch / watercolor**
- **Reference:** Quentin Blake, *Winnie the Pooh*, Studio Ghibli concept art
- **Palette:** Soft blues and whites, golden sunlight, muted pastels
- **Textures:** Visible pencil lines, wet-on-wet bleeds, paper texture
- **Feel:** Whimsical, light, airy
- **Why here:** Multiplication is about things compounding; soft media suggests things growing gently

### Floor 4 — Ember Caves — **Pixel art**
- **Reference:** *Celeste*, *Hyper Light Drifter*, *Stardew Valley*
- **Palette:** Deep reds, orange glow, charcoal black, embers
- **Textures:** Hard pixel edges, limited palette (16 colors max per tile)
- **Feel:** Retro, dangerous, determined
- **Why here:** Division is sharp and precise; pixel art's hard edges reinforce the cutting metaphor

### Floor 5 — The Mending Room — **Papercut diorama, cinematic (Reference A)**
- **Reference:** Board 1 Reference A — the dark mountain/castle/moon diorama
- **Palette:** Deep charcoal background, teal mountains, coral accents, cream castle, crescent moonlight
- **Textures:** Deep-layered paper with strong silhouettes; moonlight as the only major light source
- **Feel:** Cinematic, dramatic, "the final act"
- **Why here:** Returning to papercut for the final floor bookends the journey. The player started in Floor 1's bright whimsical garden and ends in the same medium but now it's *cinematic*. Same art language, grown up. This is more interesting than jumping to a new style because it shows how the world *matured* alongside the player.

### Battle scene framing — applies to ALL floors — **Reference C**
- **Reference:** Board 1 Reference C — the dark archway with glowing castle
- **Lesson:** Every battle background needs a central light source that pulls the eye to the middle of the stage. Heroes and enemies stand *in front of* that light so they read as clear silhouettes against a hot center.
- **Implementation note:** The specific backdrop changes per floor, but the *lighting composition* (dark edges, warm center glow) stays consistent. This is how we keep combat readable while letting the art direction shift.

### Title screen — **Reference D**
- **Reference:** Board 1 Reference D — the monochrome cream forest arch
- **Lesson:** The title screen is the "open the storybook" moment. Calm, elegant, not loud. Lets the logo breathe.

## Cross-cutting elements

These are the things that must stay **consistent across all five levels**, regardless of art bucket:

- **UI chrome** (health bars, momentum meter, answer buttons) — one consistent look, period. Probably simple and clean so it doesn't fight the art.
- **Font** — one font for questions, one for labels. Readability trumps style.
- **Hero sprites** — the player picks their three heroes on the title screen. Those three heroes have to be **recognizable** across all five levels. Options:
  1. Heroes have one "true" look that never changes (simpler)
  2. Heroes are re-styled to match each level (ambitious, expensive)
  3. Heroes stay in their true look but get a level-appropriate "lighting" overlay (cheap, effective)
  
  **Recommendation:** Start with option 1 for v0.5, try option 3 in v1.0 if we have time.

## Placeholder strategy

For v0.1, we don't need final art. We need **placeholder art** that proves the pipeline works:

- Free assets from [Kenney.nl](https://kenney.nl/) (CC0, no attribution required)
- Free assets from [OpenGameArt.org](https://opengameart.org/)
- Simple colored rectangles with text labels for quick iteration

Once the pipeline works and the game is *playable*, we replace placeholder art with the real thing one level at a time.

## Sprite specifications

- **Hero sprites:** 128×128 or 256×256, facing right, one idle frame + one attack frame minimum
- **Enemy sprites:** 256×256, one idle frame + one attack frame minimum
- **Tilemaps:** 32×32 or 64×64 tiles, power of two
- **UI elements:** Vector-equivalent PNG at 2× size (so 44pt buttons = 88px PNG)
- **Backgrounds:** Parallax layers, each at 1920×1080 or larger
- **Format:** PNG-8 or PNG-24 with alpha; WebP if file size matters
- **Compression:** Run through [TinyPNG](https://tinypng.com/) or `pngquant` before committing

## Tools we can use (cheap or free)

- **AI image generation:** Midjourney, DALL-E, Stable Diffusion, Flux — pick whichever the user has access to
- **Pixel art:** Aseprite (paid, worth it) or Piskel (free, browser)
- **Tilemaps:** Tiled (free)
- **Animation sprite sheets:** TexturePacker (free tier) or Aseprite
- **Audio:** Bfxr for SFX, Bosca Ceoil for music (both free)

## Open questions

1. **Do we commit to style variety across all 5 levels, or do we prove it on 1–2 and reassess?**
   *Current plan:* Floor 1 (whimsical papercut) and Floor 5 (cinematic papercut) now share a medium but very different moods. Floors 2–4 are still the clay / sketch / pixel plan. Worth revisiting once Floor 1 is real.
2. **Who produces the art?** AI gen by Claude + you directing? A hired artist per level? Mix?
3. **Hero consistency strategy** — one true look, re-style per level, or overlay?
4. **Font choice** — Press Start 2P is the prototype default but might be too "retro" for the kid audience. Worth exploring friendlier fonts.
5. **Audio style per level** — does each floor get its own music genre too? (Probably yes — it's as cheap as the art variety and doubles the effect.)
6. **Diorama frame per level** — does every floor get its own frame shape (round for garden, arched for mending room, cracked for ember caves)? Or is there one consistent frame? *Leaning:* one consistent frame that tints/weathers per level for unity.
