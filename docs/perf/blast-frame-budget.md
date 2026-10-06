# Blast frame budget: a screen-and-beyond blast (#154)

Technical Director research for [#154](https://github.com/bjor2/steampunk-miner/issues/154). It blocks the dynamite spec [#143](https://github.com/bjor2/steampunk-miner/issues/143) and the build [#149](https://github.com/bjor2/steampunk-miner/issues/149), and gives Art/VFX [#145](https://github.com/bjor2/steampunk-miner/issues/145) its particle and debris limits. It also answers the chunk-rebuild check in [#162](https://github.com/bjor2/steampunk-miner/issues/162) section 3 (see "Terrain-edit power-ups" below).

The question: what does clearing the largest blast in one go cost (tile destruction, chunk rebuild, colliders, particles, debris), which technique should the dynamite build use, and what budget must it meet?

Every number below was either measured for this doc (shown as median [min–max] over runs) or taken from a cited source. Budgets marked **derived** are computed from an existing budget, and the derivation is shown. The doc doesn't introduce any new frame budget.

## TL;DR

- **One-shot is not viable for a screen-sized blast.** The shipped `blasting_charges` detonation runs synchronously in one authority tick. That tick costs 16 ms at R=14 tiles (the smallest radius that covers the screen at default zoom), 43 ms at R=22 (covers it at max zoom) and 98 ms at R=32. That is 1 to 6 whole 16.7 ms frames, and R=32 is a long task (>50 ms). The first carve on cold chunks (generated on the spot) costs 102 ms (R=22) and 252 ms (R=32).
- **Cost scales with tiles, roughly 26–30 µs per tile all-in** on this box. About 80% of that is the per-sample carve (`blastGround`): string-keyed Map lookups, single-threaded.
- **Technique: a deterministic, time-sliced expanding front.** The blast clears at most **K = 64 tiles per authority tick**, nearest first, keyed only by ticks since detonation. Chunks are prefetched during the fuse, halo colliders are rebuilt in the same step, render chunks rebuild at the existing 1 per frame, logging is aggregated, and debris is GPU-only.
- **Budget per frame while a blast is live: ≤ 4 ms of blast work** (derived). That is ≤ 2 ms for the authority slice and ≤ 2 ms for presentation (one chunk rebuild plus the collider halo), taken from the existing terrain budgets of #4 and #36 and kept well inside RAIL's ~10 ms app share per frame.
- **Max frames for a full rebuild: ceil(tiles / 64) + 9.** That is 10 + 9 frames at R=14, 24 + 9 at R=22 (0.55 s) and 51 + 9 at R=32 (1.0 s).

## Setup

| Item            | Value                                                                                                                                                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit          | `af0d3db8f1887662ece3b2f603dfcc1454e03716` (origin/main, scratch worktree, game code unchanged)                                                                                                                                                                                                      |
| Machine         | Shared box: 8 vCPU Intel(R) Xeon(R) Processor, 15 GB RAM (13 GB used by other sessions), Linux, node v20.19.2                                                                                                                                                                                        |
| Load            | 1-min load **7.2–22 on 8 vCPU** during measurements (recorded per run in every raw file). Competing processes: other sessions' vite-node probes, vitest workers, Chrome soak/bot runs and Claude Code sessions (top processes: `node` at 70–90% CPU each, see the `busy` field in `raw/sweep.jsonl`) |
| When            | 2026-10-06, final datasets recorded 20:27–20:50 CEST                                                                                                                                                                                                                                                 |
| Node benches    | Real game code (authority, carve, chunk mesh build, Rapier 0.14 in node). Each process does 1 cold rep plus 5 warm reps; each radius is run 5 times, interleaved and rotated, to show variance                                                                                                       |
| Browser probe   | `vite build` → `vite preview`, Chrome with the soak harness switches `--use-gl=swiftshader --enable-unsafe-swiftshader` (`scripts/soak/soakTarget.mjs`). **Software rendering: these frame times are not GPU numbers and are never used as a budget below**                                          |
| Blast placement | `chargeFixtures` `prepareBlaster` / `plantOnWall`: planet 1 (radius 300 tiles, seed 83921), charge at tile (-20, 252) in band-mixed rock                                                                                                                                                             |

On this box p95 numbers are dominated by preemption. The repo's own history shows this. `buildChunkTileBatch` p50 is stable across load (1.09 ms at load 2.1 and 1.26 ms at load 19). Its p95 is not: 1.58–1.81 ms at load 2–7, but 8.7 ms at load 19 (`docs/perf/history.ndjson`, commits ca732b5, f844c61 and 704fef2). **Read p50 as the cost and p95 here as an upper bound.** The acceptance gates below are set for the reference machine (#4: "4-core, integrated-GPU laptop at 1280x800 (Steam Deck class)").

### Reproduce

The scripts are in `docs/perf/blast-bench/` (copy them into `scripts/` of a checkout at the commit above, then run `npm ci`):

```bash
# One-shot cost by radius (5 runs, interleaved, load recorded)
bash runSweep.sh <repo> raw 5 2.5 4 8 13 16 21 32
bash runSweep.sh <repo> raw-screen 5 14 22
node aggregate.mjs raw/sweep.jsonl raw-screen/sweep.jsonl          # warm medians; COLD=1 for cold reps

# A single radius
BLAST_R=22 node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchBlast.ts

# Batched-carve prototype (checks identical output against blastGround) and sliced front
BLAST_R=32 BLAST_REPS=5 node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchBlastBatchedCarve.ts

# Terrain-edit power-ups (#162): cells × chunks × kind
EDIT_REPS=12 node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchTerrainEdit.ts

# Debris as Rapier bodies
node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchDebrisBodies.ts

# CPU profile of the detonation tick
BLAST_R=32 node --cpu-prof --cpu-prof-dir=prof node_modules/vite-node/vite-node.mjs scripts/profileBlast.ts

# Browser (SwiftShader) probe: carve, rebuild frames, vehicle drop, memory seams
npx vite build && node scripts/blastProbe.mjs --radii 4,8,14,22,32 --runs 3 --out raw/probe
```

The raw data is in `raw/`, `raw-screen/` and `raw/probe/`. The aggregates are in `agg-sweep.txt`, `agg-terrain.txt` and `agg-probe.txt`.

## What "screen and beyond" means in tiles

- The camera short axis is 12 m by default, 8–20 m with zoom (#39). Chunk culling uses half the screen diagonal (`viewRadiusOf`). At 16:9 that is **12.24 m at default zoom and 20.4 m at max zoom**, the same as #38's 12.2 m and 20.4 m. Resolution doesn't change it (#38: "4K changes only the pixel (fill-rate) cost, never how much world is drawn").
- The charge sits 1 m from the vehicle, and the shipped stamp keeps full weight only to r/√2, so the effective crater edge is about 0.87 R (`stampShape.ts`). Covering the whole screen therefore needs **R ≥ 14 tiles at default zoom and R ≥ 22 tiles at max zoom**. That's why this doc measured 14 and 22. R=32 is the debug `carveCircle` maximum, used here as an upper bound.
- The shipped `blasting_charges` radius is 2.5 (spec #109, `economy.json`). The largest dynamite radius is still open in #153.

## Raw results

### 1. One-shot detonation (shipped code, node)

Warm medians [min–max over 5 runs]. Load 12–16 for most radii, ~8 for R=14 and R=22 (that's why R=14 reads lower than R=13).

| R (tiles) | Tiles in disc | Cleared | **Authority tick ms** | Carve ms | Collapse check ms | GroundChanged chunks | Stale render chunks | 8 m render blocks | 4 m collision blocks |
| --------- | ------------- | ------- | --------------------- | -------- | ----------------- | -------------------- | ------------------- | ----------------- | -------------------- |
| 2.5       | 21            | 21      | 2.42 [1.97–3.74]      | 0.91     | 0.59              | 1                    | 4                   | 1                 | 4                    |
| 4         | 49            | 49      | 3.77 [2.94–7.59]      | 1.73     | 1.05              | 2                    | 6                   | 3                 | 7                    |
| 8         | 197           | 197     | 8.95 [6.25–19.6]      | 6.42     | 2.00              | 2                    | 6                   | 9                 | 23                   |
| 13        | 529           | 487     | 17.8 [15.8–28.9]      | 13.4     | 3.23              | 3                    | 8                   | 17                | 50                   |
| **14**    | 613           | 554     | **16.1 [14.4–19.9]**  | 12.8     | 3.57              | 4                    | 9                   | 23                | 60                   |
| 16        | 797           | 714     | 27.0 [21.6–39.2]      | 25.0     | 5.21              | 4                    | 9                   | 23                | 74                   |
| 21        | 1373          | 1199    | 41.1 [36.8–100]       | 36.1     | 8.22              | 6                    | 12                  | 39                | 123                  |
| **22**    | 1517          | 1323    | **42.8 [36.9–45.9]**  | 29.6     | 5.61              | 6                    | 12                  | 41                | 129                  |
| 32        | 3209          | 2977    | **97.6 [95.6–117]**   | 85.6     | 16.5              | 8                    | 15                  | 75                | 257                  |

- "Authority tick" is the whole `advanceTicks` step that detonates the charge (`detonateChargesDue`), including ore, events and collapse checks. The stage columns are timed separately.
- The first carve in a fresh process, which includes generating the chunks, costs R=22 102 ms [74–107] and R=32 252 ms [238–329]. Once those chunks are cached, the authority tick is the warm figure above.
- The all-in cost per tile comes to 26 µs (R=14), 28 µs (R=22) and 30 µs (R=32).
- Events at R=32: 3165 domain events in one tick (2977 `TileDestroyed`, 168 `StorageFull`, 10 `CargoAdded`, 8 `GroundChanged`).

### 2. Rebuild fan-out after the edit (node)

| R   | Render rebuild per chunk, median ms | per chunk, max | All stale chunks at once | Upload (all stale chunks) | Stale & visible (default / max zoom) |
| --- | ----------------------------------- | -------------- | ------------------------ | ------------------------- | ------------------------------------ |
| 2.5 | 1.84                                | 3.08           | 7.9 ms                   | 266 KB                    | 2 / 2                                |
| 14  | 1.14                                | 1.53           | 10.5 ms                  | 554 KB                    | 4 / 4                                |
| 22  | 1.19                                | 1.84           | 14.1 ms                  | 715 KB                    | 4 / 4                                |
| 32  | 1.16                                | 6.25           | 31.1 ms                  | 821 KB                    | 4 / 4                                |

- A rebuild is `chunkDensityHaloOf` (129×129) + `buildChunkTileBatch` + `refractoryCellsOf` + a new DataTexture and geometry, done at `CHUNK_BUILDS_PER_FRAME = 1`.
- An edit in one chunk makes **4** render chunks stale (the chunk and the three whose view reads it, `chunkViewVersion`). That's why stale render chunks exceed edited chunks.
- In this placement only 4 stale chunks were visible at either zoom. #38 bounds the drawn set at ≤ 9 chunks at max zoom.

| R   | 9-block halo at the vehicle, ms | 9-block halo at the crater rim (worst) | Rapier step after | All collision blocks under the blast |
| --- | ------------------------------- | -------------------------------------- | ----------------- | ------------------------------------ |
| 2.5 | 0.63                            | 0.44 (43 segments)                     | 0.02              | 0.34 ms (4 blocks)                   |
| 14  | 0.46                            | 0.64 (64 segments)                     | 0.04              | 3.90 ms (60)                         |
| 22  | 0.44                            | 0.54 (60 segments)                     | 0.04              | 7.74 ms (129)                        |
| 32  | 0.46                            | 0.72 (127 segments)                    | 0.07              | 18.2 ms (257)                        |

The game only builds the 3×3 halo of 4 m blocks round the vehicle (`groundHalo.syncAround`, `HALO_RADIUS_BLOCKS = 1`). Building colliders for the whole blast would cost 18 ms at R=32 for nothing.

### 3. Persistence, logging and memory (node)

Warm medians, with the cold first rep (fresh process, chunks just generated) in brackets.

| R   | Run-log lines | Run-log bytes | Projection ms | stateDigest after | Save bytes (before → after) | Save ms     | Node heap delta |
| --- | ------------- | ------------- | ------------- | ----------------- | --------------------------- | ----------- | --------------- |
| 2.5 | 30            | 4.6 KB        | 0.20 (0.61)   | 0.19 (0.74) ms    | 2015 → 2498                 | 0.23 (0.82) | +0.08 (0.40) MB |
| 14  | 591           | 87 KB         | 2.36 (2.49)   | 0.45 (2.10) ms    | 2015 → 6383                 | 0.74 (5.12) | +0.52 (1.31) MB |
| 22  | 1404          | 206 KB        | 4.30 (4.51)   | 0.93 (8.12) ms    | 2015 → 13131                | 1.08 (4.82) | +1.18 (2.14) MB |
| 32  | 3157          | 463 KB        | 17.1 (18.7)   | 1.57 (13.9) ms    | 2015 → 19633                | 1.71 (17.3) | +2.34 (3.52) MB |

The digest runs every 3600 ticks, and the checkpoint save only runs at dock and on travel or `RescueTriggered`, so neither lands on the blast tick unless a rescue fires. The run-log projection does land on it: one `tile_destroyed` line per yielded tile (3157 lines and 17–19 ms at R=32).

### 4. Where the time goes (CPU profile, R=32, 8 detonation ticks)

- `blastGround` takes about 80% of the tick. Most of that is per-sample `blastTile` work (`isCarvable`, `casingGradeOf`, `editSample`, `materialOfSample`, `editChunkOf`: string-keyed Map lookups for every density sample). `closeSession` takes about 20% (`cellsNowYielding`, `withYieldedCells`).
- Collapse checks take about 8%, and GC took 268 ms over the 8 ticks.
- The limiter is single-threaded per-sample Map and string-key work. Profiles are in `/workspace/tmp/blast-prof/`.

### 5. Options measured for spreading the work (node)

**Slicing the shipped carve** (R=32, same load as table 1; per-slice max / sum over all slices):

| Slicing                  | Slices at R=14 / 22 / 32 | Max slice ms at R=32 | Sum ms at R=32 | Mean slice ms at R=14 / 22 / 32 |
| ------------------------ | ------------------------ | -------------------- | -------------- | ------------------------------- |
| Per chunk                | 4 / 6 / 8                | 23.5 [20.2–28.4]     | 78.6           | — (a chunk can hold 1024 tiles) |
| 8 row bands              | 8                        | 15.7                 | 75.1           | —                               |
| **Front, 64 tiles/tick** | 10 / 24 / 51             | **4.86 [4.32–7.78]** | 89.3           | **1.17 / 1.43 / 1.75**          |
| Front, 128 tiles/tick    | 5 / 12 / 26              | 6.51                 | 79.7           | 2.46 / 2.53 / 3.07              |
| Front, 256 tiles/tick    | 3 / 6 / 13               | 9.87                 | 77.9           | 3.90 / 4.83 / 5.99              |

The expanding front (nearest tiles first, fixed tiles per tick) is the only option that bounds each slice, and slicing changes total work by only −9% to +16% (K=64 sums against the one-shot carve). Per-chunk and band slices don't: one chunk can hold 1024 tiles.

**Batched-carve prototype** (`benchBlastBatchedCarve.ts`, not shipped code): a typed-array per-tile inner loop that reuses the real `openSession` / `closeSession`. The output was **identical** to `blastGround` (deltas, yields, cleared count) in every run.

| R   | Shipped ms | Batched ms           | Load |
| --- | ---------- | -------------------- | ---- |
| 8   | 5.1        | 2.1                  | ~7.5 |
| 14  | 11.3       | 4.0                  | ~7.5 |
| 22  | 27.9       | 9.4                  | ~7.5 |
| 32  | 60.7       | 22.2 (≈ 6.9 µs/tile) | ~7.5 |
| 32  | 155.7      | 41.1                 | ~18  |

Whole blasts get 2.7× faster. **But a sliced batched front did not get cheaper per slice.** At K=128, R=32 measured slice p95 7.0–19.3 ms and sum 60–111 ms (load 9.5–18, `raw/batched-front*.jsonl`) against a 22–56 ms whole. Each slice pays a fixed `closeSession` cost (RLE re-encode and yield scan per touched chunk). The prototype only pays off per slice if the edit session stays open across a blast's slices, which still needs to be built and measured.

**Debris as Rapier dynamic bodies** (`benchDebrisBodies.ts`: 0.25 m cuboids plus a vehicle on trimesh walls, 120 steps × 3, load ~18):

| Dynamic debris bodies | 0         | 50        | 100       | 200      | 400     | 800   |
| --------------------- | --------- | --------- | --------- | -------- | ------- | ----- |
| Step p50 ms           | 0.02–0.03 | 0.65–0.75 | 1.42–1.44 | 2.7–4.4  | 5.7–7.5 | 13–22 |
| Step p95 ms           | 0.04      | 4.7–6.0   | 5.1       | 9.4–11.3 | 15.5    | 38.9  |

Rapier only stops simulating bodies once they sleep, and they sleep only after not moving "during a few seconds" ([Rapier rigid bodies: Sleeping](https://rapier.rs/docs/user_guides/javascript/rigid_bodies#sleeping)). Freshly thrown debris is awake for exactly the window that matters.

### 6. Browser probe (SwiftShader software GL; not a GPU budget)

The probe builds the game, drives off the dock pad, and then calls `debug.carveCircle` under the vehicle. It records every rAF frame for 2 s before and 6 s after, with `ui.getRenderStats` / `getPhysicsStats` and the GC'd memory seams before and after. 3 runs per radius, load 16.7–21.7.

| R   | carveCircle in page, ms | terrainMs max after | Frames with a chunk rebuild | Vehicle drop (m) | Draw calls before → after | Geometries / textures | WASM bytes | JS heap delta |
| --- | ----------------------- | ------------------- | --------------------------- | ---------------- | ------------------------- | --------------------- | ---------- | ------------- |
| 4   | 50 [45–57]              | 6.0 [3.9–7.5]       | 4                           | 4.96             | 25 → 25                   | 34 → 34 / 20 → 20     | +0         | +0.57 MB      |
| 8   | 63 [28–78]              | 1.5 [1.4–1.9]       | 4                           | 10.4             | 25 → 25                   | 34 → 34 / 20 → 20     | +0         | −0.01 MB      |
| 14  | 175 [120–382]           | 8.0 [3.0–13.1]      | 4                           | 18.5             | 25 → 24                   | 34 → 34 / 20 → 20     | +0         | +0.71 MB      |
| 22  | 194 [109–426]           | 4.8 [4.1–13.0]      | 5 [4–6]                     | 29.4             | 25 → 23                   | 34 → 32 / 20 → 18     | +0         | +0.39 MB      |
| 32  | 422 [303–682]           | 9.2 [2.0–10.4]      | 6 [6–7]                     | 43.0             | 25 → 25                   | 34 → 34 / 20 → 20     | +0         | +1.10 MB      |

- The software frame p50 was 167–617 ms (before the carve), so the frame times are only useful as relative evidence.
- What the probe shows:
  - The real renderer spreads the rebuild over 4–7 frames at 1 chunk per frame.
  - The vehicle falls to the crater floor and doesn't fall through. Its drop matches the crater geometry at every radius.
  - Live colliders stay at 4–6, far under #4/#36's 600.
  - Old chunk geometries and textures are disposed (counts don't grow), and WASM memory doesn't grow.
  - Draw calls are 23–25 in this scene.

## Analysis

1. **Budgets that already exist** (no new ones):
   - #4: "60 frames per second … terrain updates at most 2 ms per frame", reference machine "4-core, integrated-GPU laptop at 1280x800".
   - #36: "Total terrain work at most 2 ms per frame while drilling continuously", "carving plus re-meshing one 8 m block at most 1 ms at the 95th percentile", "at most 600 live colliders".
   - #38: ≤ 150 draw calls (ground 1–2, particles ≤ 4), ≤ 48 ground blocks and ≤ 9 chunks drawn at 20 m zoom, frame budget 16.7 ms.
   - RAIL: "browsers need about 6 ms to render each frame, hence the guideline of 10 ms per frame", and do background work "in 50 ms or less" ([web.dev RAIL](https://web.dev/articles/rail)). A task over 50 ms is a long task ([MDN PerformanceLongTaskTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming)).
2. **One-shot:**
   - A screen-covering blast costs 16 ms (R=14) to 43 ms (R=22) of authority work in a single tick. That is 1.6–4× RAIL's whole 10 ms app share, and 8–21× the 2 ms terrain budget.
   - R=32 (98 ms warm, 252 ms cold) is a long task twice over.
   - A one-frame hitch might be acceptable at the moment of an explosion. 2.5–6 dropped frames are not, and neither is a 100–250 ms freeze.
   - The batched carve (2.7×) still leaves R=22 at 9.4 ms (load ~7.5) to 32 ms (load ~18), and R=32 at 22–56 ms. Speed-ups alone don't fix it, so the work has to be spread out.
3. **Which costs scale with the blast:**
   - These grow with the blast: the authority edit (tiles), events and run-log lines (yielded tiles), collapse checks (blocks on the rim) and stale chunks (8 → 15).
   - These don't, because the game already bounds them by what's near the vehicle or on screen: per-frame render rebuild (1 chunk per frame, ~1.1–1.8 ms), the collider halo (9 blocks, ≤ 0.9 ms) and drawn chunks (≤ 9).
   - So the authority edit and its bookkeeping are what must be spread out.
4. **Spread over ticks deterministically.** Any slicing must be a pure function of (blast, ticks since detonation), so replay, the state digest and multiplayer stay identical. The expanding front satisfies this. The disc's tiles are sorted by (distance, tile index) and slice k takes tiles [64k, 64k+64). It also reads right: the crater opens outward from the charge.
5. **K = 64 tiles per tick:** 2 ms ÷ the measured 26–30 µs per tile = 66–77, rounded down to 64. The direct measurement of the shipped carve at K=64 gives mean slices of 1.17–1.75 ms (carve only) and max 1.7–7.0 ms at load 8–16. Collapse checks add about 5 µs/tile, or ≈ 0.33 ms per slice. On an idle reference machine the mean should sit near 2 ms, and the p95 still has to be confirmed there (acceptance 1).
6. **Presentation stays bounded as it is today:**
   - One chunk rebuild per frame (p50 1.1–1.8 ms) plus the halo (≤ 0.9 ms) is about 2 ms, the #36 line.
   - The visible result is final at most 9 frames after the last slice (≤ 9 drawn chunks per #38; the probe measured 4–7).
7. **Prefetch during the fuse.** The fuse is 120 ticks, and the cold path (chunk generation) is what makes R=32 cost 252 ms. Pre-generating the disc's chunks plus one ring (≤ 15 at R=32) during the fuse, at 1 per tick, fits #4's `generateChunk` p95 < 2 ms budget and finishes long before detonation.

## Options considered

| Option                                                    | Verdict                                   | Evidence                                                                                                                                                                                                     |
| --------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. One-shot (today's `detonateChargesDue`)                | Rejected beyond R≈8                       | 16 / 43 / 98 ms at R=14 / 22 / 32; cold up to 252 ms                                                                                                                                                         |
| B. One-shot with the batched carve                        | Not sufficient alone; adopt as a speed-up | 2.7× faster, identical output, still 9–41 ms at R=22–32                                                                                                                                                      |
| C. Slice per chunk or per row band                        | Rejected                                  | Max slice 23.5 ms (per chunk) and 15.7 ms (bands) at R=32; unbounded because a chunk can hold 1024 tiles                                                                                                     |
| **D. Expanding front, K tiles per tick**                  | **Chosen**, K = 64                        | Mean slice 1.17–1.75 ms, max 4.9 ms at R=32; total work within −9% to +16% of one-shot; deterministic                                                                                                        |
| E. Web Worker for the carve                               | Deferred                                  | The carve mutates authority state that the same tick reads (collapse, hits, cargo). Moving it off-thread breaks the single-tick authority model. Revisit only if D fails acceptance on the reference machine |
| F. Colliders for the whole blast                          | Rejected                                  | 18 ms at R=32. The halo covers what the vehicle can touch (0.4–0.9 ms)                                                                                                                                       |
| G. Debris as Rapier bodies                                | Rejected                                  | 50 bodies already p95 4.7–6 ms per step                                                                                                                                                                      |
| H. Debris and particles GPU-only (fixed pools, instanced) | **Chosen**                                | No authority or physics cost; see the draw-call budget below                                                                                                                                                 |

## Recommendation (the budget #149 must meet)

1. **Sliced blast in the authority.**
   - Detonation (tick T0) resolves the hits on the vehicle and enemies, the self-hit and the charge itself immediately, as now. It also records a _live blast_ `{chargeId, centre, radiusMm, cursor}` in authority state.
   - Each following tick processes the next **≤ 64 tiles** in (distance, tile index) order through the same `blastTile` rules (hardness cap, core, dock pad, lava, lining), the same ore yield and the collapse checks for the blocks touched by that slice. It emits one `GroundChanged` per touched chunk per slice.
   - The live blast is part of the snapshot and the state digest, so a checkpoint (including `RescueTriggered`) taken mid-blast resumes identically. Multiple live blasts share the same 64 tiles per tick, oldest first.
2. **Budget while a blast is live (derived):** at most **4 ms of blast work per frame**, split as follows:
   - **≤ 2 ms authority slice**, from #4's "terrain updates at most 2 ms per frame", applied to the authoritative edit;
   - **≤ 2 ms presentation**, from #36's "total terrain work at most 2 ms per frame", applied to the render chunk rebuild plus the collider halo.
   - This reads #4 and #36 as two lines (authority, presentation). If the Producer reads them as one shared 2 ms, set K = 32 and double the durations below.
   - Either way it stays within RAIL's ~10 ms app share per frame. How much of that 10 ms the rest of the frame uses on the reference GPU is still unmeasured (open question).
3. **Duration:** the edit completes in **ceil(tiles / 64) ticks** (R=14: 10, R=22: 24 = 0.40 s, R=32: 51 = 0.85 s). Every visible chunk is final **≤ 9 frames later**. While a blast is live the render pool should rebuild the oldest stale chunk first rather than the nearest, so no chunk starves while the front keeps re-staling the near ones.
4. **Fuse prefetch:** generate the disc's chunks plus one ring during the fuse, ≤ 1 chunk per tick, so no slice pays chunk generation.
5. **Colliders:** halo only, rebuilt in the same step the slice lands (measured 0.4–0.9 ms for 9 blocks). Never build colliders beyond the halo. Live colliders stay ≤ 600.
6. **Logging:**
   - Don't project one `tile_destroyed` line per tile for blasts (3157 lines / 463 KB / 17–19 ms at R=32). Emit one `charge_detonated` / blast summary (tiles cleared, ore by type, chunks) when the live blast completes, plus the existing ore and cargo lines.
   - Coalesce `StorageFull` to at most one per tick (168 at R=32).
   - The domain events can stay; only the run-log projection changes. This is a logging-schema decision (open question).
7. **Particles and debris (derived from #38):**
   - #38 gives particles at most 4 draw calls. The game already has four fixed-pool `Points` systems (sparks 256, cement 96, collapse dust 320, refinery smoke 64; each is one draw call and is never frustum-culled). Whenever all four can be on screen together, the particle line is fully allocated.
   - **Blast VFX must reuse the existing spark and collapse-dust pools (0 new particle draw calls)**, or replace one of them.
   - **Debris is GPU-only**: one `InstancedMesh` with a fixed capacity, **1 draw call**, taken from #38's 150-call headroom (the probe measured 23–25 draw calls in play). three.js documents `InstancedMesh` for rendering "a large number of objects with the same geometry and material(s) but with different world transformations", which "will help you to reduce the number of draw calls" ([three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)). The R3F docs count each mesh as a draw call and say "no more than 1000 as the very maximum, and optimally a few hundred or less" ([R3F scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)).
   - No Rapier bodies for debris; it doesn't collide with the vehicle. The pool sizes are for Art (#145) to pick inside these draw-call limits; this doc has no measurement that would set them.
8. **Follow-ups (optional):**
   - Adopt the batched inner loop (2.7× on whole blasts) and keep one edit session open across a blast's slices. If that is re-measured on the reference machine, K can rise.
   - An edge-aware `chunkViewVersion` (only re-stale neighbours when the dirty rect touches the shared edge) should cut an interior single-chunk edit from 4 rebuilds to 1. That is not measured; today every single-chunk edit measured 4 stale chunks.

## Acceptance for #149 (testable)

The bench numbers are gates on the reference machine (#4). On the shared box they are recorded with load, as report-only.

1. **Per-tick blast work:** a `bench:blast` (from `benchBlast.ts`) at the largest size records the authority work per tick across the live blast. **p95 ≤ 2 ms, max ≤ 4 ms**, logged to `docs/perf/history.ndjson` with machine and load.
2. **Duration:** the live blast finishes in exactly `ceil(tilesInDisc / 64)` ticks after detonation (unit test on the fixture blast).
3. **Same result as one-shot:** after completion, the chunk deltas, yielded cells, cleared count and ore are identical to a one-shot `blastGround` of the same charge (unit test; `benchBlastBatchedCarve.ts` already does this comparison).
4. **Determinism:**
   - same seed + inputs → identical `stateDigest` after completion;
   - save at T0 + k mid-blast, reload, finish → the same digest.
5. **No long tasks:** in the browser at the largest size, default and max zoom, no main-thread task over 50 ms from detonation to completion (PerformanceObserver `longtask`), and `ui.getRenderStats().terrainMs` p95 ≤ 2 ms across the blast. Reference machine only; SwiftShader can't meet any frame gate.
6. **Visual completion:** every chunk in `drawnChunks` is rebuilt within `ceil(tiles/64) + 9` frames of detonation (rebuild frames counted the way `blastProbe.mjs` does).
7. **Physics:**
   - the vehicle ends on the crater floor (drop within 0.5 m of the floor depth under it; this probe: R=22 29.4 m, R=32 43.0 m) and never below it;
   - the halo is rebuilt in the same step as each slice;
   - `getPhysicsStats` live colliders ≤ 600;
   - no dynamic debris bodies.
8. **Memory (debug-API seams, 10 s after completion):** geometries and textures ≤ the pre-blast count and WASM bytes unchanged (the probe already checks both). Heap delta is report-only (measured −0.3 to +1.4 MB in the browser, and in node +2.3 MB warm / +3.5 MB cold at R=32).
9. **Draw calls:** ≤ 150 throughout and particle draw calls ≤ 4 (#38). Debris adds ≤ 1.
10. **Log size:** one summary line per detonation instead of one line per tile. Run-log bytes for the largest blast are recorded (report-only until the schema decision).
11. **Prefetch:** no `generateChunk` call happens inside a slice tick (counter in the bench).

## Terrain-edit power-ups (#162 section 3)

The same harness, `benchTerrainEdit.ts`, was run at load 16–20, 5 runs × 12 reps.

- Edit kinds:
  - "carve" uses `blastGround`, a density edit that breaks all cells;
  - "swap" uses `withCellOverride` + `withChunkDelta`, a material swap.
- Layouts are solid-rock clusters inside one chunk, across 2 chunks and across 4 chunks.

| Cells changed | Carve edit p50 ms (1 / 2 / 4 chunks) | Swap edit p50 ms (1 / 2 / 4 chunks) |
| ------------- | ------------------------------------ | ----------------------------------- |
| 1             | 0.21 / 0.22 / 0.20                   | 0.03 / 0.03 / 0.03                  |
| 16            | 0.50 / 0.52 / 0.66                   | 0.07 / 0.06 / 0.06                  |
| 32            | 0.95 / 1.04 / 0.98                   | 0.11 / 0.09 / 0.10                  |
| 64            | 3.81 / 1.63 / 3.76                   | 0.19 / 0.17 / 0.17                  |
| 128           | 7.84 / 8.65 / 8.11                   | 0.57 / 0.39 / 0.33                  |
| 256           | 14.4 / 16.0 / 15.0                   | 3.19 / 1.27 / 0.66                  |

| Chunks touched | Stale render chunks | Render rebuild sum (1 per frame) | Collision blocks | Collider rebuild |
| -------------- | ------------------- | -------------------------------- | ---------------- | ---------------- |
| 1              | 4                   | 12–17 ms over 4 frames           | 1–16             | 0.07–1.72 ms     |
| 2              | 6                   | 16–20 ms over 6 frames           | 4–16             | 0.19–1.51 ms     |
| 4              | 9                   | 29–35 ms over 9 frames           | 4–16             | 0.21–1.37 ms     |

- **One render chunk rebuild:** p50 **1.26–1.32 ms** [1.18–1.87], p95 **11.9–12.1 ms** at load 16–20. The repo history at load 2–7 shows p95 1.58–1.81 ms (`buildChunkTileBatch`), so the tail here is preemption.
- **One collision block:** p50 0.05 ms, p95 0.19 ms.
- **Recommended caps** (derived from the 2 ms authority line above, shared with blasts and drilling):
  - density edits ≤ **32 cells per tick** (p50 ≤ 1.04 ms);
  - swaps ≤ **64 cells per tick** (p50 ≤ 0.19 ms);
  - **≤ 2 chunks touched per tick**, which is ≤ 6 render rebuilds, final within 6 frames.
  - Larger activations (lodestone) apply over successive ticks, or at trip start before the first rendered frame.
  - A tick that applies a power-up edit clears at most 32 tiles of a live blast, so the tick stays within 2 ms.
  - The full comment for #162 is `/workspace/tmp/c162-terrain-cost.md`.

## Open questions

- **Largest radius (Game Director, #153):** 14 tiles covers the screen at default zoom and 22 tiles at max zoom. R=32 is 51 ticks (0.85 s) of crater growth at K=64. Is a crater that opens outward over 0.4–0.85 s acceptable, given that hits and VFX land on the detonation tick?
- **Blast logging granularity (Producer):** one summary line per blast instead of one `tile_destroyed` line per tile?
- **Reference machine (Producer):** acceptance 1, 5 and 6 need a GPU run on the #4 reference machine. Every frame number here comes from a loaded 8-vCPU box or software GL.
- **One 2 ms or two (Producer/TD):** do #4 and #36 mean one shared terrain budget (then K = 32) or separate authority and presentation lines (K = 64)?

## Sources

- #4 planet representation decision (budgets, reference machine): https://github.com/bjor2/steampunk-miner/issues/4
- #36 fluid-ground decision (terrain ≤ 2 ms/frame, ≤ 1 ms p95 per block, ≤ 600 colliders): https://github.com/bjor2/steampunk-miner/issues/36
- #38 render budget (≤ 150 draw calls, particles ≤ 4, ≤ 9 chunks at 20 m zoom): https://github.com/bjor2/steampunk-miner/issues/38
- #39 camera framing (12 m default, 8–20 m): https://github.com/bjor2/steampunk-miner/issues/39
- RAIL model (10 ms per frame for the app, 50 ms work chunks): https://web.dev/articles/rail
- Long tasks (> 50 ms): https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming
- R3F scaling performance (each mesh is a draw call): https://r3f.docs.pmnd.rs/advanced/scaling-performance
- three.js InstancedMesh: https://threejs.org/docs/pages/InstancedMesh.html
- three.js Points: https://threejs.org/docs/pages/Points.html
- Rapier rigid bodies, sleeping: https://rapier.rs/docs/user_guides/javascript/rigid_bodies#sleeping
- Rapier colliders: https://rapier.rs/docs/user_guides/javascript/colliders
