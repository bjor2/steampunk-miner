/**
 * K6 (#189) and docs/perf/blast-frame-budget.md acceptance 1: while a blast is live, the authority's
 * terrain work stays at 2 ms or less per tick (p95; max 4 ms), on the reference machine. Measured
 * and logged here, not gated, because this box and CI machines vary. Run with `npm run bench:blast`.
 *
 * An R24 blast (1,793 tiles, the largest dynamite size, GD on #153) goes live in band-3 rock of
 * planet 1 with its chunks generated beforehand, as the fuse prefetch does, and the clock moves one
 * tick at a time until it resolves; each tick is timed whole. A second run adds 4 players drilling
 * and a 32-cell power-up pocket queued on the blast's first tick, timing each tick's clock and
 * commands together. With `-- --log` it also writes `benchmark_result` lines (#124).
 *
 * K8 (#218): every size of the dynamite ladder then blows alone at the same site, its radius read
 * from `blastingCharges.sizes`, and its ticks to clear, p95 and max are printed under `sizes` (the
 * perf recorder keeps only the R24 fields, as before).
 */
import { loadFeatures } from '../src/features'
import { BLAST_TILES_PER_TICK } from '../src/constants/terrainBudget'
import { blastChunksOf } from '../src/systems/authority/charges/blastPrefetch'
import {
  chargeRadiusMm,
  chargeSizeCount,
  chargeSizesUpTo,
} from '../src/systems/economy/chargeSizes'
import {
  blastAt,
  liveBlastSession,
  R24_MM,
  SOLID_SITE,
} from '../src/systems/authority/charges/liveBlastFixtures'
import {
  queueTerrainEdit,
  type TerrainCellEdit,
} from '../src/systems/authority/terrain/terrainEdits'
import {
  continueScriptedSession,
  drill,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../src/systems/authority/scriptedSession'
import { FACING } from '../src/systems/vehicle/vehiclePose'
import { surfaceRowOfColumn, type TilePoint } from '../src/systems/world/tileGrid'
import { generatedChunkOf } from '../src/systems/world/worldState'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'

loadFeatures()

const REPS = 5
const BUDGET = { tickP95Ms: 2, tickMaxMs: 4 }
const PLAYERS = ['p1', 'p2', 'p3', 'p4']
const DIG_START_TICK = 20
const BLAST_TICK = DIG_START_TICK + 1
const BREAK_TICK = BLAST_TICK + 19
const POCKET_CORNER: TilePoint = { tx: 160, ty: 128 }

function timed(work: () => void): number {
  const start = performance.now()
  work()
  return performance.now() - start
}

/** What the fuse prefetch would have generated before the blast. */
function prefetchBlastChunks(): void {
  for (const { cx, cy } of blastChunksOf(SOLID_SITE, R24_MM)) generatedChunkOf(PARAMS, cx, cy)
}

function digTileOf(at: number): TilePoint {
  const tx = 20 + 4 * at
  return { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) }
}

function pocketCells(): TerrainCellEdit[] {
  const cells: TerrainCellEdit[] = []
  for (let dy = -2; dy < 2; dy++) {
    for (let dx = -4; dx < 4; dx++) {
      cells.push({
        kind: 'density',
        tx: POCKET_CORNER.tx + dx,
        ty: POCKET_CORNER.ty + dy,
        density: 0,
      })
    }
  }
  return cells
}

function startDigging(session: ScriptedSession): void {
  PLAYERS.forEach((playerId, at) =>
    session.submit(0, poseAbove(digTileOf(at), FACING.down), playerId),
  )
  PLAYERS.forEach((playerId, at) =>
    session.submit(DIG_START_TICK, drill(digTileOf(at), DIG_START_TICK), playerId),
  )
}

/** Each tick's time, one tick at a time, until the blast and the queue are done. */
function timeTicksUntilSettled(session: ScriptedSession, onTick: (tick: number) => void): number[] {
  const times: number[] = []
  let tick = session.state().tick
  while (session.state().liveBlasts.length > 0 || session.state().terrainEdits.length > 0) {
    tick += 1
    times.push(
      timed(() => {
        session.advanceTo(tick)
        onTick(tick)
      }),
    )
  }
  return times
}

function benchBlastAlone(): number[] {
  const session = liveBlastSession([blastAt(SOLID_SITE, R24_MM, { size: 10 })])
  return timeTicksUntilSettled(session, () => undefined)
}

/** One blast of `size` alone at the R24 site, its radius from the ladder. */
function benchSizeAlone(size: number): number[] {
  const blast = blastAt(SOLID_SITE, chargeRadiusMm(size), { size })
  return timeTicksUntilSettled(liveBlastSession([blast]), () => undefined)
}

function sizeReportOf(size: number) {
  const times = repeated(() => benchSizeAlone(size))
  return {
    size,
    radiusMm: chargeRadiusMm(size),
    ticks: times.length / REPS,
    tickP95Ms: round(percentile(times, 0.95)),
    tickMaxMs: round(Math.max(...times)),
  }
}

function benchBlastWithDiggersAndPocket(): number[] {
  const prepared = liveBlastSession(
    [blastAt(SOLID_SITE, R24_MM, { tick: BLAST_TICK, size: 10 })],
    PLAYERS,
    startDigging,
  )
  const session = continueScriptedSession(
    queueTerrainEdit(prepared.state(), {
      playerId: 'p1',
      source: 'bench.pocket',
      cells: pocketCells(),
    }),
  )
  return timeTicksUntilSettled(session, (tick) => {
    if (tick !== BREAK_TICK) return
    PLAYERS.forEach((playerId, at) => session.submit(tick, drill(digTileOf(at), 20), playerId))
  })
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const round = (ms: number) => Number(ms.toFixed(3))

function repeated(bench: () => number[]): number[] {
  bench()
  return Array.from({ length: REPS }, bench).flat()
}

prefetchBlastChunks()
const alone = repeated(benchBlastAlone)
const shared = repeated(benchBlastWithDiggersAndPocket)
const report = {
  bench: 'liveBlast',
  radiusTiles: 24,
  tilesPerTick: BLAST_TILES_PER_TICK,
  ticksPerBlast: alone.length / REPS,
  tickP50Ms: round(percentile(alone, 0.5)),
  tickP95Ms: round(percentile(alone, 0.95)),
  tickMaxMs: round(Math.max(...alone)),
  sharedTickP95Ms: round(percentile(shared, 0.95)),
  sharedTickMaxMs: round(Math.max(...shared)),
  budget: BUDGET,
  sizes: chargeSizesUpTo(chargeSizeCount()).map(sizeReportOf),
}
console.log(JSON.stringify(report))
logBenchmarkSeriesWhenAsked('blast', [
  { name: 'liveBlast.tick', planet: 1, timesMs: alone },
  { name: 'liveBlast.sharedTick', planet: 1, timesMs: shared },
])
