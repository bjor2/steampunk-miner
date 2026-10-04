# Steampunk Miner

Infinite 2D steampunk mining game. See [docs/design.md](docs/design.md) for the design and team structure.

Planning happens as a wayfinder map on this repo's issues.

## Getting started

```bash
npm install
npm run dev            # browser, http://localhost:5173 (arrow keys / A, D drive the placeholder vehicle)
npm run typecheck && npm test
npm run build          # production build into dist/
npm run electron:dev   # Electron window around the dev server
npm run electron:build # unpacked Electron game folder in release/ (for Steam depots)
```

Engineering rules for contributors and agents: [CLAUDE.md](CLAUDE.md). Steam status and what remains:
[docs/steam.md](docs/steam.md). Debug/scenario API for tests and bots: [docs/TESTING_INSTRUCTIONS.md](docs/TESTING_INSTRUCTIONS.md).
