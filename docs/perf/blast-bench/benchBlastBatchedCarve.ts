/**
 * #154 prototype (NOT shipped code): the same blast carve as `blastGround`, with the per-sample
 * inner loop done on the chunk's typed arrays (one material/breakability lookup per tile, direct
 * sample indices, no per-sample string keys or objects). The session is closed by the real
 * `closeSession`, so the delta write, yield and digest-relevant output are the shipped code's.
 * Checks that its world deltas, yields and cleared count equal `blastGround`'s, then times both,
 * interleaved. BLAST_R picks the radius (shipped rules otherwise).
 *
 *   BLAST_R=32 node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchBlastBatchedCarve.ts
 */
import { ECONOMY } from '../src/systems/economy/economy'
import { fromCanonical } from '../src/systems/money'

const RADIUS = process.env.BLAST_R ?? '32'
const REPS = Number(process.env.BLAST_REPS ?? '7')
;(ECONOMY.blastingCharges as { blastRadiusTiles: unknown }).blastRadiusTiles = fromCanonical(RADIUS)

const { createScriptedSession, PARAMS } = await import('../src/systems/authority/scriptedSession')
const fixtures = await import('../src/systems/authority/charges/chargeFixtures')
const { blastTilesAround } = await import('../src/systems/authority/charges/blastOre')
const { blastGround } = await import('../src/systems/world/blastGround')
const charges = await import('../src/systems/economy/blastingCharges')
const { hardnessOfTile } = await import('../src/systems/authority/groundDrill')
const { CELL_KIND, isRemovableCell, kindOfCell } = await import('../src/systems/world/worldCell')
const { cmp } = await import('../src/systems/money')
const session = await import('../src/systems/world/groundEditSession')
const ws = await import('../src/systems/world/worldState')
const { CHUNK_SAMPLE_SIDE, SAMPLES_PER_TILE } = await import('../src/systems/world/sampleGrid')
const { chunkKey } = await import('../src/systems/world/tileGrid')

type Tile = { tx: number; ty: number }
type World = Parameters<typeof blastGround>[0]

const cap = charges.blastHardnessCap(PARAMS.planetIndex)
const isBreakable = (tile: Tile, material: number) =>
  isRemovableCell(material) &&
  kindOfCell(material) !== CELL_KIND.core &&
  cmp(hardnessOfTile(PARAMS, tile, material), cap) <= 0

function batchedBlast(world: World, tiles: readonly Tile[]) {
  const s = session.openSession(world, PARAMS)
  let cleared = 0
  for (const tile of tiles) {
    const material = ws.materialCellAt(world, PARAMS, tile)
    const kind = kindOfCell(material)
    if (kind === CELL_KIND.indestructible || kind === CELL_KIND.lava) continue
    if (!isBreakable(tile, material)) continue
    const sx0 = tile.tx * SAMPLES_PER_TILE
    const sy0 = tile.ty * SAMPLES_PER_TILE
    const cx = Math.floor(sx0 / CHUNK_SAMPLE_SIDE)
    const cy = Math.floor(sy0 / CHUNK_SAMPLE_SIDE)
    const key = chunkKey(cx, cy)
    let chunk = s.chunks.get(key)
    if (chunk === undefined) {
      chunk = {
        cx,
        cy,
        density: ws.currentDensityOfChunk(world, PARAMS, cx, cy).slice(),
        casing: null,
        change: { cx, cy, x0: CHUNK_SAMPLE_SIDE, y0: CHUNK_SAMPLE_SIDE, x1: -1, y1: -1 },
      }
      s.chunks.set(key, chunk)
    }
    const casing = ws.currentCasingOfChunk(world, cx, cy)
    const lx0 = sx0 - cx * CHUNK_SAMPLE_SIDE
    const ly0 = sy0 - cy * CHUNK_SAMPLE_SIDE
    let any = false
    let wrote = false
    for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
      const row = (ly0 + qy) * CHUNK_SAMPLE_SIDE
      for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
        const index = row + lx0 + qx
        if (casing.length > 0 && casing[index] !== 0) continue
        if (chunk.density[index] === 0) continue
        any = true
        chunk.density[index] = 0
        wrote = true
      }
    }
    if (wrote) {
      const c = chunk.change
      c.x0 = Math.min(c.x0, lx0)
      c.y0 = Math.min(c.y0, ly0)
      c.x1 = Math.max(c.x1, lx0 + 3)
      c.y1 = Math.max(c.y1, ly0 + 3)
      s.touchedTiles.set(`${tile.tx},${tile.ty}`, tile)
    }
    if (any) cleared++
  }
  return { ...session.closeSession(s), tilesCleared: cleared }
}

const s0 = createScriptedSession()
fixtures.prepareBlaster(s0, 0)
fixtures.plantOnWall(s0, 1)
s0.advanceTo(charges.chargeFuseTicks())
const before = s0.state()
const charge = before.players.p1.vehicle.charges.planted as Tile
const tiles = blastTilesAround(charge)

// Correctness: same deltas (minus the dirty rectangle, which the prototype rounds to whole tiles
// only where it wrote), same yields, same cleared count.
const ref = blastGround(before.world, PARAMS, tiles, isBreakable)
const fast = batchedBlast(before.world, tiles)
const strip = (w: World) =>
  JSON.stringify(Object.entries(w.chunks).sort(([a], [b]) => a.localeCompare(b)))
const same =
  strip(ref.world) === strip(fast.world) &&
  JSON.stringify(ref.yielded) === JSON.stringify(fast.yielded) &&
  ref.tilesCleared === fast.tilesCleared
const shipped: number[] = []
const batched: number[] = []
for (let i = 0; i < REPS; i++) {
  let t = performance.now()
  blastGround(before.world, PARAMS, tiles, isBreakable)
  shipped.push(performance.now() - t)
  t = performance.now()
  batchedBlast(before.world, tiles)
  batched.push(performance.now() - t)
}
// The batched carve as an expanding front: K tiles per tick, nearest first.
const byDistance = [...tiles].sort(
  (a, b) =>
    (a.tx - charge.tx) ** 2 +
    (a.ty - charge.ty) ** 2 -
    ((b.tx - charge.tx) ** 2 + (b.ty - charge.ty) ** 2),
)
const front: Record<string, { slices: number; maxMs: number; p95Ms: number; sumMs: number }> = {}
for (const k of [128, 256, 512]) {
  const all: number[] = []
  let sums = 0
  for (let rep = 0; rep < 3; rep++) {
    let w = before.world
    for (let at = 0; at < byDistance.length; at += k) {
      const t = performance.now()
      w = batchedBlast(w, byDistance.slice(at, at + k)).world
      const ms = performance.now() - t
      all.push(ms)
      sums += ms
    }
  }
  const sorted = [...all].sort((a, b) => a - b)
  front[`k${k}`] = {
    slices: Math.ceil(byDistance.length / k),
    maxMs: Number(sorted.at(-1)!.toFixed(3)),
    p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(3)),
    sumMs: Number((sums / 3).toFixed(3)),
  }
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const r3 = (n: number) => Number(n.toFixed(3))
console.log(
  JSON.stringify({
    bench: 'blastBatchedCarve',
    radiusTiles: Number(RADIUS),
    tiles: tiles.length,
    tilesCleared: ref.tilesCleared,
    identicalOutput: same,
    reps: REPS,
    shippedMedianMs: r3(med(shipped)),
    shippedMinMs: r3(Math.min(...shipped)),
    shippedMaxMs: r3(Math.max(...shipped)),
    batchedFront: front,
    batchedMedianMs: r3(med(batched)),
    batchedMinMs: r3(Math.min(...batched)),
    batchedMaxMs: r3(Math.max(...batched)),
  }),
)
