/**
 * #154 research bench: what one blast of radius R costs on every system it touches, measured on the
 * real code paths. Run one radius per process (the blast radius is read from economy.json when
 * `blastingCharges.ts` loads, so the script overrides it before importing anything that reads it):
 *
 *   BLAST_R=16 node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchBlast.ts
 *
 * Per process: 1 cold repetition (chunks round the blast not generated yet, as for a blast that
 * reaches past what the player has seen) and BLAST_REPS warm ones (default 5). Each repetition:
 *
 *  - authority: the real detonation tick (`advanceTicks` to the fuse tick of a real planted
 *    charge, scripted-session fixtures of the shipped #109 specs), plus its stages timed alone on
 *    the same pre-blast state: `blastGround` (carve + delta write + yield), `breakBlastGround`
 *    (carve + ore + events), `checkCollapseNearBlast`;
 *  - the same carve sliced per chunk (one edit session per chunk) and per row band, to price a
 *    time-sliced authority blast;
 *  - fan-out: `GroundChanged` count and dirty rectangles, render chunks made stale (chunk view
 *    version, which includes the left/below neighbours), 8 m render blocks and 4 m collision
 *    blocks under the dirty rectangles, run-log lines and bytes via the real projection;
 *  - render rebuild per stale chunk: density halo + `buildChunkTileBatch` + refractory cells
 *    (the JS half of `chunkMeshPool.buildChunkMesh`), and the bytes it uploads;
 *  - collider rebuild: the 3 x 3 halo of 4 m blocks round the vehicle (`HALO_RADIUS_BLOCKS` 1):
 *    `wallSegmentsOf` + a Rapier trimesh collider each (rapier3d-compat 0.14 in node), plus one
 *    `world.step()`; and, for comparison, every collision block under the blast;
 *  - persistence: `stateDigest` (periodic, every 3600 ticks) and `takeSnapshot` + `saveSlotOf` +
 *    `JSON.stringify` (the checkpoint), before and after;
 *  - memory: heap used after a forced GC before and after (state + density caches held).
 */
import { ECONOMY } from '../src/systems/economy/economy'
import { fromCanonical } from '../src/systems/money'

const RADIUS = process.env.BLAST_R ?? '2.5'
const REPS = Number(process.env.BLAST_REPS ?? '5')
;(ECONOMY.blastingCharges as { blastRadiusTiles: unknown }).blastRadiusTiles = fromCanonical(RADIUS)

const gc = (globalThis as { gc?: () => void }).gc ?? (() => {})

const { advanceTicks } = await import('../src/systems/authority/advanceTicks')
const { createScriptedSession, PARAMS } = await import('../src/systems/authority/scriptedSession')
const fixtures = await import('../src/systems/authority/charges/chargeFixtures')
const { blastTilesAround, breakBlastGround } =
  await import('../src/systems/authority/charges/blastOre')
const { checkCollapseNearBlast } = await import('../src/systems/authority/charges/blastCollapse')
const { blastGround } = await import('../src/systems/world/blastGround')
const charges = await import('../src/systems/economy/blastingCharges')
const { hardnessOfTile } = await import('../src/systems/authority/groundDrill')
const { CELL_KIND, isRemovableCell, kindOfCell } = await import('../src/systems/world/worldCell')
const { cmp } = await import('../src/systems/money')
const { chunkViewVersionOf, isSameChunkView } =
  await import('../src/systems/render/chunkViewVersion')
const { chunkDensityHaloOf, DENSITY_HALO_SIDE } = await import('../src/systems/render/densityHalo')
const { buildChunkTileBatch, NO_REFRACTORY_CELLS } =
  await import('../src/systems/render/chunkTileBatch')
const { refractoryCellsOf } = await import('../src/systems/render/refractoryCells')
const { visibleChunksAround } = await import('../src/systems/render/visibleChunks')
const world = await import('../src/systems/world/worldState')
const { NO_CASING } = await import('../src/systems/world/chunkDelta')
const { blocksAround, blockOfPoint, wallSegmentsOf } =
  await import('../src/systems/vehicle/colliderHalo')
const { groundReaderOf } = await import('../src/systems/world/groundReader')
const { recordDomainEventsTo } = await import('../src/logging/domainEventLog')
const { createRunLog } = await import('../src/logging/runLog')
const { stateDigest } = await import('../src/systems/authority/stateDigest')
const { takeSnapshot } = await import('../src/systems/authority/sessionSnapshot')
const { saveSlotOf } = await import('../src/systems/save/saveSlot')
const { CHUNK_SAMPLE_SIDE } = await import('../src/systems/world/sampleGrid')
const { WALL_HALF_DEPTH } = await import('../src/constants/physics')
const { applyCommand } = await import('../src/systems/authority/applyCommand')
const RAPIER = (await import('@dimforge/rapier3d-compat')).default
await RAPIER.init()

type State = ReturnType<ReturnType<typeof createScriptedSession>['state']>
type Tile = { tx: number; ty: number }
const FUSE = charges.chargeFuseTicks()
const SAMPLES_PER_M = 4

function timed<T>(work: () => T): { value: T; ms: number } {
  const start = performance.now()
  const value = work()
  return { value, ms: performance.now() - start }
}
const r3 = (n: number) => Number(n.toFixed(3))

function heapMB(): number {
  gc()
  gc()
  return process.memoryUsage().heapUsed / 1048576
}

/** The shipped breakability rule (`blastOre.isBreakableOn`, not exported): copied verbatim. */
function isBreakableOn() {
  const cap = charges.blastHardnessCap(PARAMS.planetIndex)
  return (tile: Tile, material: number) =>
    isRemovableCell(material) &&
    kindOfCell(material) !== CELL_KIND.core &&
    cmp(hardnessOfTile(PARAMS, tile, material), cap) <= 0
}
/** "Destroys everything": no hardness cap, still never core, the dock pad or lava. */
const breaksAll = (_tile: Tile, material: number) =>
  isRemovableCell(material) && kindOfCell(material) !== CELL_KIND.core

/** The pre-blast state: frozen enemies, a planted charge one tick before its fuse runs out. */
function armed(): { state: State; tick: number } {
  const session = createScriptedSession()
  fixtures.prepareBlaster(session, 0)
  fixtures.plantOnWall(session, 1)
  session.advanceTo(FUSE)
  return { state: session.state(), tick: 1 + FUSE }
}

function staleRenderChunks(before: State, after: State, changed: { cx: number; cy: number }[]) {
  const candidates = new Map<string, { cx: number; cy: number }>()
  for (const { cx, cy } of changed) {
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ]) {
      candidates.set(`${cx + dx},${cy + dy}`, { cx: cx + dx, cy: cy + dy })
    }
  }
  return [...candidates.values()].filter(
    ({ cx, cy }) =>
      !isSameChunkView(
        chunkViewVersionOf(before.world, cx, cy),
        chunkViewVersionOf(after.world, cx, cy),
      ),
  )
}

/** Distinct grid squares of `side` metres under the dirty rectangles. */
function squaresUnder(
  changes: { cx: number; cy: number; x0: number; y0: number; x1: number; y1: number }[],
  side: number,
) {
  const squares = new Set<string>()
  for (const c of changes) {
    const sx0 = c.cx * CHUNK_SAMPLE_SIDE + c.x0
    const sx1 = c.cx * CHUNK_SAMPLE_SIDE + c.x1
    const sy0 = c.cy * CHUNK_SAMPLE_SIDE + c.y0
    const sy1 = c.cy * CHUNK_SAMPLE_SIDE + c.y1
    const per = side * SAMPLES_PER_M
    for (let by = Math.floor(sy0 / per); by <= Math.floor(sy1 / per); by++)
      for (let bx = Math.floor(sx0 / per); bx <= Math.floor(sx1 / per); bx++)
        squares.add(`${bx},${by}`)
  }
  return [...squares].map((key) => {
    const [bx, by] = key.split(',').map(Number)
    return { bx, by }
  })
}

function rebuildRenderChunk(state: State, cx: number, cy: number) {
  const halo = chunkDensityHaloOf(
    (x, y) => world.currentDensityOfChunk(state.world, PARAMS, x, y),
    cx,
    cy,
  )
  const casing = world.currentCasingOfChunk(state.world, cx, cy)
  const refractory = casing === NO_CASING ? NO_REFRACTORY_CELLS : refractoryCellsOf(casing)
  const batch = buildChunkTileBatch(
    PARAMS,
    cx,
    cy,
    world.materialCellsOfChunk(state.world, PARAMS, cx, cy),
    halo,
    refractory,
  )
  // chunkMeshPool uploads the 129 x 129 density texture and the 4 instance attributes (13 floats).
  return {
    count: batch.count,
    uploadBytes: DENSITY_HALO_SIDE * DENSITY_HALO_SIDE + batch.count * 13 * 4,
  }
}

function trimeshOf(segments: number[]) {
  const count = segments.length / 4
  const vertices = new Float32Array(count * 12)
  const indices = new Uint32Array(count * 6)
  for (let at = 0; at < count; at++) {
    const [ax, ay, bx, by] = segments.slice(at * 4, at * 4 + 4)
    vertices.set(
      [
        ax,
        ay,
        -WALL_HALF_DEPTH,
        bx,
        by,
        -WALL_HALF_DEPTH,
        bx,
        by,
        WALL_HALF_DEPTH,
        ax,
        ay,
        WALL_HALF_DEPTH,
      ],
      at * 12,
    )
    const first = at * 4
    indices.set([first, first + 1, first + 2, first, first + 2, first + 3], at * 6)
  }
  return RAPIER.ColliderDesc.trimesh(vertices, indices)
}

/** groundHalo.refreshWanted for `blocks` on a world that already holds the pre-blast colliders. */
function rebuildColliders(
  before: State,
  after: State,
  blocks: { bx: number; by: number }[],
  vehicle: { x: number; y: number },
) {
  const physics = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(vehicle.x, vehicle.y, 0),
  )
  physics.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.45, 0.45), body)
  const old = groundReaderOf(before.world, PARAMS)
  const colliders = blocks.map((block) => {
    const segments = wallSegmentsOf(block, old.densityAt)
    return segments.length === 0 ? null : physics.createCollider(trimeshOf(segments))
  })
  physics.step()
  const ground = groundReaderOf(after.world, PARAMS)
  let segmentsMs = 0
  let rapierMs = 0
  let segmentCount = 0
  const total = timed(() => {
    blocks.forEach((block, at) => {
      const seg = timed(() => wallSegmentsOf(block, ground.densityAt))
      segmentsMs += seg.ms
      segmentCount += seg.value.length / 4
      const rap = timed(() => {
        const prior = colliders[at]
        if (prior !== null) physics.removeCollider(prior, false)
        colliders[at] = seg.value.length === 0 ? null : physics.createCollider(trimeshOf(seg.value))
      })
      rapierMs += rap.ms
    })
  })
  const step = timed(() => physics.step())
  physics.free()
  return {
    blocks: blocks.length,
    segments: segmentCount,
    totalMs: r3(total.ms),
    segmentsMs: r3(segmentsMs),
    rapierMs: r3(rapierMs),
    stepAfterMs: r3(step.ms),
  }
}

function runLogCost(events: readonly unknown[]) {
  let bytes = 0
  let lines = 0
  const sink = {
    append: (event: unknown) => {
      bytes += JSON.stringify(event).length + 1
      lines++
    },
    appendCommand: () => undefined,
  }
  const log = createRunLog({ runId: 'bench', sink, secondsSinceStart: () => 0 })
  const ms = timed(() =>
    recordDomainEventsTo(log, { planet: 1, depth: 0 } as never, events as never),
  ).ms
  return { lines, bytes, ms: r3(ms) }
}

function saveCost(state: State) {
  const t = timed(() => JSON.stringify(saveSlotOf(takeSnapshot(state), 1)))
  return { ms: r3(t.ms), bytes: t.value.length }
}

function oneRep(label: string) {
  const { state: before, tick } = armed()
  const charge = before.players.p1.vehicle.charges.planted as Tile
  const pose = before.players.p1.vehicle.pose as { x: number; y: number }
  const vehicle = { x: pose.x / 1000, y: pose.y / 1000 }
  const tiles = blastTilesAround(charge)
  const heapBefore = heapMB()

  // Stages alone, each on the same pre-blast state (cold rep: the first stage pays generation).
  const carve = timed(() => blastGround(before.world, PARAMS, tiles, isBreakableOn()))
  const carveAll = timed(() => blastGround(before.world, PARAMS, tiles, breaksAll))
  const ground = timed(() => breakBlastGround(before, PARAMS, 'p1', charge))
  const collapse = timed(() =>
    checkCollapseNearBlast({ ...before, world: carve.value.world }, PARAMS, charge),
  )

  // Sliced carve: one session per chunk, and 8 row bands, to price a time-sliced blast.
  const byChunk = new Map<string, Tile[]>()
  for (const t of tiles) {
    const key = `${Math.floor(t.tx / 32)},${Math.floor(t.ty / 32)}`
    byChunk.set(key, [...(byChunk.get(key) ?? []), t])
  }
  const chunkSliceMs: number[] = []
  let w = before.world
  for (const group of byChunk.values()) {
    const s = timed(() => blastGround(w, PARAMS, group, isBreakableOn()))
    w = s.value.world
    chunkSliceMs.push(s.ms)
  }
  const ringSliceMs: number[] = []
  const reach = charges.blastReachTiles()
  const bands = 8
  w = before.world
  for (let b = 0; b < bands; b++) {
    const lo = -reach + Math.floor(((2 * reach + 1) * b) / bands)
    const hi = -reach + Math.floor(((2 * reach + 1) * (b + 1)) / bands)
    const group = tiles.filter((t) => t.ty - charge.ty >= lo && t.ty - charge.ty < hi)
    if (group.length === 0) continue
    const s = timed(() => blastGround(w, PARAMS, group, isBreakableOn()))
    w = s.value.world
    ringSliceMs.push(s.ms)
  }

  // Tile-budgeted slices in distance order (an expanding front): K tiles per slice.
  const byDistance = [...tiles].sort(
    (a, b) =>
      (a.tx - charge.tx) ** 2 +
      (a.ty - charge.ty) ** 2 -
      ((b.tx - charge.tx) ** 2 + (b.ty - charge.ty) ** 2),
  )
  const frontSlices: Record<
    string,
    { slices: number; maxMs: number; p95Ms: number; sumMs: number }
  > = {}
  for (const k of [64, 128, 256]) {
    const ms: number[] = []
    let fw = before.world
    for (let at = 0; at < byDistance.length; at += k) {
      const s = timed(() => blastGround(fw, PARAMS, byDistance.slice(at, at + k), isBreakableOn()))
      fw = s.value.world
      ms.push(s.ms)
    }
    const sorted = [...ms].sort((a, b) => a - b)
    frontSlices[`k${k}`] = {
      slices: ms.length,
      maxMs: r3(sorted[sorted.length - 1]),
      p95Ms: r3(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
      sumMs: r3(ms.reduce((a, b) => a + b, 0)),
    }
  }

  // The debug API's carveCircle (disc stamp) at the same centre and radius, as the browser run uses.
  const radiusMm = Math.min(32000, Math.round(Number(RADIUS) * 1000))
  const debugCarve = timed(() =>
    applyCommand(before, {
      playerId: 'p1',
      tick: before.tick,
      seq: before.players.p1.lastSeq + 1,
      type: 'debug.carveCircle',
      payload: {
        x: charge.tx * 1000 + 500,
        y: charge.ty * 1000 + 500,
        radius: radiusMm,
        amount: 255,
      },
    } as never),
  )

  // The real detonation tick, end to end.
  const auth = timed(() => advanceTicks(before, tick))
  const after = auth.value.state
  const events = auth.value.events
  const heapAfter = heapMB()
  const byType: Record<string, number> = {}
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1
  const changes = events.filter((e) => e.type === 'GroundChanged') as unknown as {
    cx: number
    cy: number
    x0: number
    y0: number
    x1: number
    y1: number
  }[]

  const stale = staleRenderChunks(before, after, changes)
  const renderMs: number[] = []
  let uploadBytes = 0
  for (const { cx, cy } of stale) {
    const r = timed(() => rebuildRenderChunk(after, cx, cy))
    renderMs.push(r.ms)
    uploadBytes += r.value.uploadBytes
  }
  const staleKeys = new Set(stale.map(({ cx, cy }) => `${cx},${cy}`))
  const visible = (radius: number) =>
    visibleChunksAround(vehicle, radius, PARAMS.radiusTiles).filter(({ cx, cy }) =>
      staleKeys.has(`${cx},${cy}`),
    ).length
  const halo = rebuildColliders(before, after, blocksAround(blockOfPoint(vehicle), 1), vehicle)
  // Worst case for the halo: the vehicle just outside the rim, every block of it on the new wall.
  const rim = { x: charge.tx + 0.5 + Number(RADIUS) + 1, y: charge.ty + 0.5 }
  const rimHalo = rebuildColliders(before, after, blocksAround(blockOfPoint(rim), 1), rim)
  const collisionBlocks = squaresUnder(changes, 4)
  const allColliders = rebuildColliders(before, after, collisionBlocks, vehicle)

  const digestBefore = timed(() => stateDigest(before))
  const digestAfter = timed(() => stateDigest(after))
  const saveBefore = saveCost(before)
  const saveAfter = saveCost(after)
  const log = runLogCost(events)

  return {
    label,
    tiles: tiles.length,
    tilesCleared: carve.value.tilesCleared,
    tilesClearedNoCap: carveAll.value.tilesCleared,
    authorityTickMs: r3(auth.ms),
    carveMs: r3(carve.ms),
    carveNoCapMs: r3(carveAll.ms),
    breakGroundMs: r3(ground.ms),
    collapseCheckMs: r3(collapse.ms),
    collapseChecks: collapse.value.checks,
    chunksInBlast: byChunk.size,
    chunkSliceMaxMs: r3(Math.max(...chunkSliceMs)),
    chunkSliceSumMs: r3(chunkSliceMs.reduce((a, b) => a + b, 0)),
    bandSliceMaxMs: r3(Math.max(...ringSliceMs)),
    bandSliceSumMs: r3(ringSliceMs.reduce((a, b) => a + b, 0)),
    events: events.length,
    byType,
    groundChanged: changes.length,
    staleRenderChunks: stale.length,
    staleVisibleDefaultZoom: visible(12.24),
    staleVisibleMaxZoom: visible(20.4),
    renderBlocks8m: squaresUnder(changes, 8).length,
    collisionBlocks4m: collisionBlocks.length,
    renderChunkMaxMs: r3(Math.max(0, ...renderMs)),
    renderChunkMedianMs: r3(
      [...renderMs].sort((a, b) => a - b)[Math.floor(renderMs.length / 2)] ?? 0,
    ),
    renderAllMs: r3(renderMs.reduce((a, b) => a + b, 0)),
    renderUploadKB: r3(uploadBytes / 1024),
    haloColliders: halo,
    rimHaloColliders: rimHalo,
    frontSlices,
    debugCarveMs: r3(debugCarve.ms),
    debugCarveChunks: debugCarve.value.events.filter((e) => e.type === 'GroundChanged').length,
    allBlastColliders: allColliders,
    runLog: log,
    digestBeforeMs: r3(digestBefore.ms),
    digestAfterMs: r3(digestAfter.ms),
    saveBeforeMs: saveBefore.ms,
    saveAfterMs: saveAfter.ms,
    saveBeforeBytes: saveBefore.bytes,
    saveAfterBytes: saveAfter.bytes,
    heapBeforeMB: r3(heapBefore),
    heapAfterMB: r3(heapAfter),
    vehicleHull: String(after.players.p1.vehicle.hull ?? ''),
    vehicleMode: after.players.p1.vehicle.mode,
  }
}

const reps = [oneRep('cold')]
for (let i = 0; i < REPS; i++) reps.push(oneRep('warm'))
console.log(
  JSON.stringify({
    bench: 'blast',
    radiusTiles: Number(RADIUS),
    planetRadiusTiles: PARAMS.radiusTiles,
    chargeTile: fixtures.WALL_TILE,
    reps,
  }),
)
