# Math Warriors

An educational RPG for kids K–5. Explore, fight, and learn math — one floor at a time.

## Status

**Pre-alpha / v0.1 in progress.** This repo is being scaffolded from a broken prototype into a proper game. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for where we are and where we're going.

## What it is

A single-player, turn-based math RPG where each floor of a dungeon teaches a different operation:

| Floor | Theme | Operation |
|---|---|---|
| 1 | The Garden | Addition |
| 2 | Tidepool Ruins | Subtraction |
| 3 | Cloud Maze | Multiplication |
| 4 | Ember Caves | Division |
| 5 | The Mending Room | Mixed operations |

Each floor is a small maze. You explore, find treasures, free friendly spirits, and fight monsters by answering math problems. A boss at the end of each floor gates your progression.

## The stack

- **[Phaser 3](https://phaser.io/)** — 2D HTML5 game engine
- **[Vite](https://vitejs.dev/)** — dev server and bundler
- **Vanilla JavaScript** — no TypeScript, no framework
- **GitHub Pages + GitHub Actions** — automated deploy
- **[Capacitor](https://capacitorjs.com/)** (later) — iOS wrapper for App Store submission

## How to play

There will be a live URL here after the first deploy lands. For now, the game doesn't run — it's being rebuilt.

## How to develop

You shouldn't need to. This repo is structured so that:

1. The AI co-developer edits source files
2. GitHub Actions auto-builds and deploys to Pages
3. You open the URL on your iPad to play

If you *do* want to run it locally:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Repo layout

```
Math-Warriors/
├── prototype/          # The original broken prototype, preserved as a reference
├── docs/               # Design docs (GDD, architecture, art style, roadmap)
├── src/                # Game source code
│   ├── scenes/         # Phaser scenes (title, battle, maze, etc.)
│   ├── systems/        # Shared systems (math generator, combat, save)
│   └── data/           # Static game data (hero roster, enemy roster, etc.)
├── public/             # Static assets (sprites, audio, fonts)
└── .github/workflows/  # CI/CD
```

## License

[MIT](LICENSE) — do what you want, credit appreciated, no warranty.

## Credits

- Game design & direction: DD-Builder
- Code: Claude (Anthropic)
