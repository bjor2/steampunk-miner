/* eslint-disable -- archived bench script for docs/perf/blast-frame-budget.md, not product code */
// Aggregates the #154 raw runs: per radius, median [min-max] over runs of each run's warm median
// (5 warm reps per run), plus the cold rep separately. Usage: node aggregate.mjs raw/sweep.jsonl [...]
import { readFileSync } from 'node:fs'
const files = process.argv.slice(2)
const lines = files.flatMap((f) =>
  readFileSync(f, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l)),
)
const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor((s.length - 1) / 2)]
}
const get = (o, path) => path.split('.').reduce((v, k) => v?.[k], o) ?? 0
const fmt = (xs) => {
  const m = med(xs)
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const f = (n) => (Math.abs(n) >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2))
  return `${f(m)} [${f(lo)}–${f(hi)}]`
}
const radii = [...new Set(lines.map((l) => l.radius))].sort((a, b) => a - b)
const metrics = process.env.METRICS?.split(',') ?? [
  'tiles',
  'tilesCleared',
  'authorityTickMs',
  'carveMs',
  'breakGroundMs',
  'collapseCheckMs',
  'collapseChecks',
  'events',
  'groundChanged',
  'staleRenderChunks',
  'staleVisibleDefaultZoom',
  'staleVisibleMaxZoom',
  'renderBlocks8m',
  'collisionBlocks4m',
  'renderChunkMedianMs',
  'renderChunkMaxMs',
  'renderAllMs',
  'renderUploadKB',
  'haloColliders.totalMs',
  'haloColliders.segments',
  'rimHaloColliders.totalMs',
  'rimHaloColliders.segments',
  'rimHaloColliders.stepAfterMs',
  'allBlastColliders.blocks',
  'allBlastColliders.totalMs',
  'allBlastColliders.stepAfterMs',
  'frontSlices.k64.slices',
  'frontSlices.k64.maxMs',
  'frontSlices.k64.sumMs',
  'frontSlices.k128.slices',
  'frontSlices.k128.maxMs',
  'frontSlices.k128.sumMs',
  'frontSlices.k256.slices',
  'frontSlices.k256.maxMs',
  'frontSlices.k256.sumMs',
  'chunksInBlast',
  'chunkSliceMaxMs',
  'chunkSliceSumMs',
  'bandSliceMaxMs',
  'bandSliceSumMs',
  'debugCarveMs',
  'runLog.lines',
  'runLog.bytes',
  'runLog.ms',
  'digestBeforeMs',
  'digestAfterMs',
  'saveBeforeBytes',
  'saveAfterBytes',
  'saveAfterMs',
  'heapDeltaMB',
  'byType.TileDestroyed',
  'byType.StorageFull',
  'byType.CargoAdded',
]
const out = {}
for (const r of radii) {
  const runs = lines.filter((l) => l.radius === r)
  out[r] = { runs: runs.length, load: runs.map((l) => Number(l.loadBefore.split(' ')[0])) }
  for (const m of metrics) {
    const warmPerRun = runs.map((l) =>
      med(
        l.result.reps
          .filter((x) => x.label === 'warm')
          .map((x) => (m === 'heapDeltaMB' ? x.heapAfterMB - x.heapBeforeMB : get(x, m))),
      ),
    )
    const cold = runs.map((l) => {
      const x = l.result.reps.find((y) => y.label === 'cold')
      return m === 'heapDeltaMB' ? x.heapAfterMB - x.heapBeforeMB : get(x, m)
    })
    out[r][m] = { warm: fmt(warmPerRun), cold: fmt(cold) }
  }
}
if (process.env.JSON) console.log(JSON.stringify(out, null, 1))
else
  for (const m of ['load', ...metrics])
    console.log(
      m.padEnd(28),
      radii
        .map((r) =>
          (m === 'load'
            ? `${Math.min(...out[r].load)}–${Math.max(...out[r].load)}`
            : out[r][m].warm
          ).padEnd(22),
        )
        .join(''),
    )
if (process.env.COLD) {
  console.log('--- cold')
  for (const m of metrics)
    console.log(m.padEnd(28), radii.map((r) => out[r][m].cold.padEnd(22)).join(''))
}
