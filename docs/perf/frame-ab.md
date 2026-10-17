# Frame-cost A/B on the packaged Electron soak (ticket 526)

The merge gate for the materials look (#450) and the per-act hero atlas (#451), set by the GD
ruling on #450 (issuecomment-6226278574, item 4) on the TD shape (issuecomment-6226270701,
"Merge gate"). The TD's cost figures (about 0.3 ms worst case on a 1 TFLOP/s iGPU at 1280x800) are
estimates, not measurements. The merge waits for a number this harness measured on a real GPU.

## The bar

- **View:** P1 band 5 (9500 bp of the radius, mid-band above the core), 20 m zoom, a 1280x800
  window, render quality `high` at render scale 1, enemies frozen, the vehicle parked. The look-on
  build draws every material kind as if met (`ui.showEveryKindLook()`, ticket 450), since a fresh
  save has met none; the look-off build has no such switch.
- **p50 frame time at most +0.5 ms**, look on minus look off.
- **No shader recompile:** no shader program linked while the look-on view is held.
- **Real GPU only** (a Steam Deck-class or iGPU machine). A SwiftShader run is a dry run of the
  harness. Its report says `SwiftShader: not GPU numbers` and `verdict: NOT A MEASUREMENT`, and its
  numbers go under their own ids. They never count for or against the bar. Nobody calls the
  estimate a measurement.

The bar and the view are constants in `scripts/soak/frameAb.mjs`, tested in
`scripts/soak/frameAb.test.mjs`.

## Build both sides

Two packaged builds of the same game: look **off** is the merge-base of the #450 (or #451) branch,
look **on** is the branch tip. Build each in its own checkout, so one `release/` folder never
overwrites the other:

```bash
git worktree add ../ab-off "$(git merge-base origin/main <branch>)"
git worktree add ../ab-on <branch>
(cd ../ab-off && npm ci && npm run electron:build)
(cd ../ab-on && npm ci && npm run electron:build)
```

On Linux the game is `release/linux-unpacked/steampunk-miner`; on Windows it is
`release/win-unpacked/Steampunk Miner.exe` (whatever `electron-builder --dir` wrote).

## Run

On the GPU machine, with a display (or a GPU-backed X server), from this repository:

```bash
node scripts/soak/soakMemory.mjs --gpu \
  --electron ../ab-on/release/linux-unpacked/steampunk-miner \
  --frame-ab ../ab-off/release/linux-unpacked/steampunk-miner \
  --out test-results/soak-frame-ab [--rounds 2] [--hold 60] [--phone-reading "<line from #482>"]
```

`--gpu` launches the builds on the machine's own GPU with vsync and the frame-rate limit off, so the
frame time is the cost of the frame and not the display's refresh. Without `--gpu` the builds draw
with SwiftShader, which is the dry run:

```bash
xvfb-run -a -s "-screen 0 1920x1080x24" node scripts/soak/soakMemory.mjs \
  --electron <look-on build> --frame-ab <look-off build> --rounds 1 --hold 10 --out test-results/soak-frame-ab
```

Each round launches one build fresh with `--debug-api`, sets the window to 1280x800, enters P1,
holds the view, waits 15 s for the band's chunks to stream and compile, then samples the game's
frame p50 (`ui.getRenderStats()`, the last full second) once a second for `--hold` seconds. It
counts every `linkProgram` call during the hold. The rounds alternate off, on, off, on, so drift on
the machine (heat, other load) falls on both sides. Close everything else that draws first.

## Read the result

The run prints, and writes into `<out>/frame-ab.json`:

```
frame A/B, P1 band 5, 20 m zoom, 1280x800
renderer: <the GPU as WebGL names it>
off: p50 8.1 ms over 2 round(s), 0 program(s) linked
on:  p50 8.5 ms over 2 round(s), 0 program(s) linked
delta: +0.4 ms (bar: at most +0.5 ms, no shader recompile)
verdict: PASS
phone reading: not available yet
record: npm run perf:record -- --source soak --from ... --commit <look-on sha> --env "..."
```

- Each side's p50 is the median over its rounds of each round's median per-second p50.
- `verdict` is `PASS` or `FAIL` on a real GPU (exit 1 on `FAIL`; each miss is listed under the
  delta). It is `NOT A MEASUREMENT` when the renderer is SwiftShader, whatever the numbers.
- A run that drew at anything but 1280x800 (a screen too small for the window) fails and says so.
- The last line is the phone reading. Until the real-device check in #482 has run it says
  `phone reading: not available yet`. Pass the #482 line with `--phone-reading`. It is reported
  and never blocks.

## Record it

Run the printed `record:` line with the look-on build's commit (the branch tip). It appends to
`docs/perf/history.ndjson` under `frameAbElectron.frameP50OffMs`, `.frameP50OnMs`,
`.frameP50DeltaMs` (budget 0.5) and `.shaderRecompiles` (budget 0) for a real GPU, or
`frameAbElectronSwiftShader.*` for a dry run. Put the GPU and machine in `--env`. Commit the history
line, and post the printed report on #450 (or #451), where whoever lands that PR checks for it.
