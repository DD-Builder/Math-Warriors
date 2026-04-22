# Chess Coach — Project Handoff

> A personal chess coach built from the user's own games on chess.com. Analyzes real games to identify recurring mistakes, then teaches the user specifically what they're doing wrong.

---

## Vision

**End goal:** A private, AI-powered chess coach that learns from the user's complete chess.com game history and teaches them to fix their specific, recurring mistakes. Not generic chess lessons — lessons grounded in their actual blunders.

**Why this matters:** Generic puzzles teach generic patterns. This teaches the *specific* patterns the user is bad at, based on hard data from thousands of their own games.

---

## User Context

- **chess.com username:** `DinosaurDog`
- **Account:** Diamond member, joined Dec 14, 2021
- **Device target:** iPad and iPhone, iOS Safari (landscape preferred)
- **Platform preference:** single-file HTML for portability; runs offline after first load
- **Aesthetic direction (locked in for this project):** editorial antiquarian
  - Warm cream paper (`#f1e8d0`), ink black (`#141210`), oxblood accent (`#8b2332`), forest (`#2d4a2d`), brass (`#b89659`)
  - **Fraunces** variable serif for display/body (italic oxblood for emphasis)
  - **JetBrains Mono** for all data, numbers, labels
  - Newspaper/masthead composition — small caps eyebrows, horizontal rules, pull quotes
  - NOT the chess.com green or lichess khaki — intentionally distinct

---

## Roadmap

- **v1 Chronicle** — stats and patterns from metadata alone. *(shipping here)*
- **v2 Mistake Finder** — Stockfish runs on each game, flags blunders/mistakes/inaccuracies. *(next)*
- **v3 Pattern Detection** — cluster mistakes across games to find recurring flaws.
- **v4 Drill Mode** — turn mistake positions into spaced-repetition puzzles.
- **v5 Opening Repertoire Trainer** — build from actually-played lines.
- **v6 Coach Chat** — natural-language coaching grounded in user history (Claude API).

## Architecture choices (locked in)

- Single-file HTML through at least v2; pivot only if v4+ gets unwieldy.
- **No build step.** Stockfish + chess.js loaded from CDN at runtime.
- **IndexedDB** for caching games *and* analysis results (localStorage would cap out).
- **Inline SVG** for board + charts (matches Chronicle aesthetic, zero deps).

## Quick start

```bash
cd chess-coach
python3 -m http.server 8000
# open http://localhost:8000
```

Enter `DinosaurDog` (or any chess.com username), click Fetch.

## Known gotchas

- **null-origin iframes (Claude artifact viewer) block everything** — CORS + CSP reject both fetch and JSONP. Use a real browser or localhost.
- **ECOUrl can be missing** on old/variant games — opening defaults to "Unknown".
- **Chess960 / variants** have `rules !== "chess"` — Stockfish can't analyze them.
- **Accuracy field is sparse** — only games someone opened Game Review on have it.
- **chess.com API etiquette** — serial is unlimited, parallel is rate-limited. Fetch months one at a time.
