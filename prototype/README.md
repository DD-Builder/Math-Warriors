# Prototype v0 — Historical Record

This folder preserves the **design intent** of the original Math Warriors prototype that kicked off this project. It is not the foundation for v1 code — it is a **reference and historical marker**.

## What was it?

A single-file HTML5 game (roughly 100KB, ~2400 lines) that contained:

- A Canvas 2D "papercut" rendering system built from hand-authored polygon data
- 15 hero characters (5 Knights, 5 Wizards, 5 Battle Bunnies)
- 25 enemies (5 per floor × 5 floors)
- 5 bosses *(dead code — declared but never wired up)*
- A maze/dungeon explorer per floor
- A turn-based math-question battle system
- A world-map floor selector
- A title, grade-select, and hero-select flow

## Why we're not building on top of it

See [`AUDIT.md`](AUDIT.md) for the full finding list. The short version:

- Every CSS custom property in `:root` used `–` (en-dash) instead of `--` (double hyphen), so **no CSS variables worked at all**
- Font-family strings used curly quotes, likely breaking font loading
- Enemy selection logic picked from the wrong pool on floors 2+
- Battle-screen event listeners stacked on every re-entry (damage multiplied each battle)
- Boss system was complete dead code with crash-on-call bugs
- Potion button was never wired up
- Grade selection was a placebo (never affected difficulty)
- ~60 additional issues ranging from medium to minor

The prototype proved the **game design works**. The **code does not**. We preserved the design in `docs/GDD.md` and started clean.

## Raw HTML file

The original was received as a pasted file in conversation and not saved byte-for-byte to avoid character-fidelity issues (the en-dashes and curly quotes would have been ambiguous to transcribe). If a literal byte-level copy is ever needed, it can be recovered from the original paste and placed at `prototype/v0-index.html`.

What is preserved instead:

- [`AUDIT.md`](AUDIT.md) — comprehensive bug audit of the prototype
- [`../docs/GDD.md`](../docs/GDD.md) — extracted game design (rules, roster, mechanics)
- [`../docs/ART-STYLE.md`](../docs/ART-STYLE.md) — note on the papercut aesthetic and the plan for per-level style variation going forward

## What we kept from it

- The overall game loop (maze → battle → reward → next floor)
- The hero/enemy roster structure and names
- The momentum / turn system concept
- The world-map floor progression
- The papercut aesthetic as a direction *(to be rebuilt with real art assets, not polygon code)*

## What we threw out

- All the rendering code (replaced with Phaser 3 + sprite images)
- The single-file architecture (replaced with a proper Vite + modules layout)
- The bespoke polygon art pipeline (replaced with AI-generated / sourced PNGs)
- The CSS (rewritten with working custom properties)
- The broken plumbing around listeners, enemy selection, and turn handling
