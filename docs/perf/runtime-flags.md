# Heap and stack flags: none (#102)

**Decision.** The game and its tooling run on the runtimes' default heap and stack. Nobody sets:

- `--max-old-space-size`, in `NODE_OPTIONS`, `--js-flags` or `app.commandLine.appendSwitch`
- `--js-flags` of any kind in the shipped game (`electron/main.cts`, `electron-builder.yml`)
- `--stack-size`
- `NODE_OPTIONS` in `package.json` scripts, CI workflows or the Electron main process

Changing this needs a planner decision on a new issue, with a soak that shows why.

## Why

- **Heap.** The renderer peaks at about 48 MiB of JS heap against a default ceiling of 4,192 MiB
  (`jsHeapSizeLimit` 4,395,630,592 B in both Chromium and Electron), so the headroom is about 88×. A
  heap flag would only lower a ceiling the game is nowhere near. Raising it would let a leak run
  longer before anyone saw it. The perf pass found Node tooling peaking far below Node 20's 4,144 MB
  default (its report, section 5), so `NODE_OPTIONS` stays empty too.
- **Stack.** Real state nests 6 levels (authority state) and 7 (a snapshot). The two recursive JSON
  walkers refuse anything past `MAX_JSON_NESTING_DEPTH` (64, `src/systems/jsonNesting.ts`, #100):
  hand-made input 100,000 levels deep is refused on Node's default stack, with no `RangeError`.
  Raising V8's `--stack-size` past the OS thread stack crashes the renderer outright, where the
  default throws a `RangeError` that can be caught.

## The numbers

Measured on 2026-10-06 at commit `d4c6849` with the memory soak (`scripts/soak/`, #99): five
10-minute runs in each runtime, interleaved Electron, Chromium, Electron and so on, all on the
same `dist` bundle. The box was shared (1-min load 7 to 23). Heap is `usedJSHeapSize` after a
forced GC, in MiB. Each cell is the median over the five runs, with min to max in brackets. The
records are in `history.ndjson` (`soak.*` for Chromium, `soakElectron.*` for Electron).

|                                                  | Chromium: headless Chrome 154, `vite preview ?debug` | Electron 44.5.1 (Chrome 152): packaged, `--debug-api` |
| ------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------- |
| Gate                                             | 4 PASS, 1 FAIL on cycle count only (14 at load ~25)  | 5 PASS                                                |
| Cycles                                           | 17 [14–18]                                           | 17 [16–18]                                            |
| Peak heap, all samples                           | 48.7 [48.0–49.0]                                     | 47.7 [47.1–48.0]                                      |
| Peak `totalJSHeapSize`                           | 52.4 [50.6–52.7]                                     | 51.1 [50.1–51.8]                                      |
| Steady heap (median boundary after warm-up)      | 46.9 [46.2–47.3]                                     | 46.4 [45.9–46.5]                                      |
| Retained growth the gate judges (fails above 20) | 1.94 [1.55–2.14]                                     | 0.67 [0.58–1.41]                                      |
| Heap slope after warm-up, MiB/min                | 0.34 [0.27–0.38]                                     | 0.13 [0.10–0.25]                                      |
| Geometries / textures / colliders, last boundary | 35 / 21 / 4                                          | 35 / 21 / 4                                           |
| Same, highest sample inside a cycle              | 37 / 23 / 10                                         | 37 / 23 / 9                                           |
| Rapier WASM peak                                 | 1.38                                                 | 1.31                                                  |
| Page errors / console errors per run             | 0 / 1 (a `favicon.ico` 404 from `vite preview`)      | 0 / 0                                                 |

The two runtimes agree within about a megabyte. Electron's heap slope is lower, which fits its
shell: it writes the run log to disk over IPC and keeps none of it in the renderer. The browser
shell keeps the NDJSON text in memory (about 0.08 MiB/min). Frame times are SwiftShader software
GL on a loaded box, so they say nothing about a GPU.

The soak passes its own switches to both runtimes: precise `performance.memory`, `--expose-gc` for
the sampler, and SwiftShader (`scripts/soak/soakTarget.mjs`). Without SwiftShader, Electron under
Xvfb cannot create a WebGL context. These switches belong to the measurement and never ship in the game.

## When to revisit

- A memory soak fails its heap or count rule, in either runtime. Find the leak; do not raise the limit.
  A FAIL on the cycle-count rule alone on a loaded box is a short run, so re-run it.
- Peak heap in a soak or a player report goes above 1 GB.
- A `RangeError: Maximum call stack size exceeded` comes from real state, or a Node tool dies with
  "JavaScript heap out of memory". Measure that tool's peak first.
- Electron or Chromium moves up a major version: run the Electron soak once and compare with the table.

## Re-measuring

```bash
npm run soak:memory                     # Chromium; on a box with no Playwright browser:
npm run build && node scripts/soak/soakMemory.mjs --browser /usr/bin/google-chrome --out test-results/soak
npm run electron:build                  # then, on Linux under Xvfb:
xvfb-run -a node scripts/soak/soakMemory.mjs --electron release/linux-unpacked/steampunk-miner --out test-results/soak-electron
npm run perf:record -- --source soak --from <out>/summary.json --from <out>/soak.json --env "<load, what ran>"
```

The recorder files an Electron run under `soakElectron.*`. Raw runs for the table are on the build box
under `/workspace/claude-sessions/perf-loop/logs/perf-102/`.
