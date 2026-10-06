/**
 * #162 section 3 / #154: what a small terrain edit (a power-up activation) costs per cell and per
 * chunk, on the real code. Layouts: a compact cluster of N cells inside one 32 m chunk, straddling
 * one chunk border (2 chunks), or round a chunk corner (4 chunks). Kinds:
 *  - `carve`: the cells cleared through the shipped cell carve (`blastGround`, the edit session
 *    every ground rule uses), as the pressure pocket lance or the seam splitter would;
 *  - `swap`: material-only overrides (`withCellOverride` + `withChunkDelta`), as the ore-shifter's
 *    cell swaps would: density, contour and colliders unchanged, render colours changed.
 * Per activation: the authority edit, the render chunks it makes stale (chunk view version), the
 * JS rebuild of each (density halo + `buildChunkTileBatch` + refractory, as `chunkMeshPool`), and
 * the 4 m collision blocks under the edit (`wallSegmentsOf` + Rapier trimesh, as `groundHalo`).
 *
 *   node --expose-gc node_modules/vite-node/vite-node.mjs scripts/benchTerrainEdit.ts
 */
const REPS = Number(process.env.EDIT_REPS ?? '12')
const { createScriptedSession, PARAMS } = await import('../src/systems/authority/scriptedSession')
const fixtures = await import('../src/systems/authority/charges/chargeFixtures')
const { blastGround } = await import('../src/systems/world/blastGround')
const { CELL_KIND, isRemovableCell, kindOfCell } = await import('../src/systems/world/worldCell')
const { chunkViewVersionOf, isSameChunkView } =
  await import('../src/systems/render/chunkViewVersion')
const { chunkDensityHaloOf } = await import('../src/systems/render/densityHalo')
const { buildChunkTileBatch, NO_REFRACTORY_CELLS } =
  await import('../src/systems/render/chunkTileBatch')
const { refractoryCellsOf } = await import('../src/systems/render/refractoryCells')
const world = await import('../src/systems/world/worldState')
const { NO_CASING, withCellOverride } = await import('../src/systems/world/chunkDelta')
const { wallSegmentsOf } = await import('../src/systems/vehicle/colliderHalo')
const { groundReaderOf } = await import('../src/systems/world/groundReader')
const { chunkKey, chunkOfTile, cellIndexOfTile } = await import('../src/systems/world/tileGrid')
const { WALL_HALF_DEPTH } = await import('../src/constants/physics')
const RAPIER = (await import('@dimforge/rapier3d-compat')).default
await RAPIER.init()

type Tile = { tx: number; ty: number }
type State = ReturnType<ReturnType<typeof createScriptedSession>['state']>
type World = State['world']
const timed = <T>(work: () => T) => {
  const s = performance.now()
  const value = work()
  return { value, ms: performance.now() - s }
}
const r3 = (n: number) => Number(n.toFixed(3))
const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor(s.length * q))]
}

const session = createScriptedSession()
fixtures.prepareBlaster(session, 0)
const before = session.state()
const breaksAll = (_t: Tile, m: number) => isRemovableCell(m) && kindOfCell(m) !== CELL_KIND.core

/** N cells in a near-square, its centre at (cx, cy) in tiles. */
function cluster(n: number, centre: Tile): Tile[] {
  const side = Math.ceil(Math.sqrt(n))
  const tiles: Tile[] = []
  for (let i = 0; i < n; i++) {
    tiles.push({
      tx: centre.tx - Math.floor(side / 2) + (i % side),
      ty: centre.ty - Math.floor(side / 2) + Math.floor(i / side),
    })
  }
  return tiles
}
const LAYOUTS: Record<string, Tile> = {
  // Each centre has solid rock for 9 tiles round it (scanned on this seed), so every cell edits.
  oneChunk: { tx: 48, ty: 268 }, // inside chunk (1, 8)
  twoChunks: { tx: -64, ty: 236 }, // on the border of chunks (-3, 7) and (-2, 7)
  fourChunks: { tx: 64, ty: 256 }, // on the corner of chunks (1..2, 7..8)
}
const GROUND_CELL = world.materialCellAt(before.world, PARAMS, { tx: 48, ty: 268 })

function swapEdit(w: World, tiles: Tile[]): World {
  const byChunk = new Map<string, Tile[]>()
  for (const t of tiles) {
    const k = chunkKey(chunkOfTile(t.tx), chunkOfTile(t.ty))
    byChunk.set(k, [...(byChunk.get(k) ?? []), t])
  }
  let next = w
  for (const group of byChunk.values()) {
    const cx = chunkOfTile(group[0].tx)
    const cy = chunkOfTile(group[0].ty)
    let delta = world.deltaOfChunk(next, cx, cy)
    for (const t of group)
      delta = withCellOverride(delta, cellIndexOfTile(t.tx, t.ty), GROUND_CELL ^ 1)
    next = world.withChunkDelta(next, cx, cy, { ...delta, version: delta.version + 1 })
  }
  return next
}

function trimeshOf(segments: number[]) {
  const count = segments.length / 4
  const v = new Float32Array(count * 12)
  const idx = new Uint32Array(count * 6)
  for (let at = 0; at < count; at++) {
    const [ax, ay, bx, by] = segments.slice(at * 4, at * 4 + 4)
    v.set(
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
    const f = at * 4
    idx.set([f, f + 1, f + 2, f, f + 2, f + 3], at * 6)
  }
  return RAPIER.ColliderDesc.trimesh(v, idx)
}

const physics = new RAPIER.World({ x: 0, y: 0, z: 0 })
const rows: unknown[] = []
const rebuildSamples: Record<string, number[]> = { carve: [], swap: [] }
const colliderSamples: number[] = []
const configs: { layout: string; n: number; kind: 'carve' | 'swap' }[] = []
for (const layout of Object.keys(LAYOUTS))
  for (const n of [1, 4, 16, 32, 64, 128, 256])
    for (const kind of ['carve', 'swap'] as const) configs.push({ layout, n, kind })

for (let rep = 0; rep < REPS + 1; rep++) {
  for (const { layout, n, kind } of configs) {
    const tiles = cluster(n, LAYOUTS[layout])
    const edit = timed(() =>
      kind === 'carve'
        ? blastGround(before.world, PARAMS, tiles, breaksAll).world
        : swapEdit(before.world, tiles),
    )
    const after = edit.value
    const touched = new Set(tiles.map((t) => chunkKey(chunkOfTile(t.tx), chunkOfTile(t.ty))))
    const candidates = new Map<string, { cx: number; cy: number }>()
    for (const key of touched) {
      const [cx, cy] = key.split(',').map(Number)
      for (const [dx, dy] of [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ])
        candidates.set(`${cx + dx},${cy + dy}`, { cx: cx + dx, cy: cy + dy })
    }
    const stale = [...candidates.values()].filter(
      ({ cx, cy }) =>
        !isSameChunkView(
          chunkViewVersionOf(before.world, cx, cy),
          chunkViewVersionOf(after, cx, cy),
        ),
    )
    const renderMs = stale.map(
      ({ cx, cy }) =>
        timed(() => {
          const halo = chunkDensityHaloOf(
            (x, y) => world.currentDensityOfChunk(after, PARAMS, x, y),
            cx,
            cy,
          )
          const casing = world.currentCasingOfChunk(after, cx, cy)
          return buildChunkTileBatch(
            PARAMS,
            cx,
            cy,
            world.materialCellsOfChunk(after, PARAMS, cx, cy),
            halo,
            casing === NO_CASING ? NO_REFRACTORY_CELLS : refractoryCellsOf(casing),
          )
        }).ms,
    )
    const blocks = new Map<string, { bx: number; by: number }>()
    for (const t of tiles)
      blocks.set(`${Math.floor(t.tx / 4)},${Math.floor(t.ty / 4)}`, {
        bx: Math.floor(t.tx / 4),
        by: Math.floor(t.ty / 4),
      })
    const ground = groundReaderOf(after, PARAMS)
    const colliderMs = [...blocks.values()].map(
      (b) =>
        timed(() => {
          const seg = wallSegmentsOf(b, ground.densityAt)
          if (seg.length > 0) physics.removeCollider(physics.createCollider(trimeshOf(seg)), false)
        }).ms,
    )
    if (rep === 0) continue // JIT warm-up pass, not reported
    rebuildSamples[kind].push(...renderMs)
    colliderSamples.push(...colliderMs)
    rows.push({
      layout,
      n,
      kind,
      editMs: r3(edit.ms),
      chunksEdited: touched.size,
      staleRender: stale.length,
      renderSumMs: r3(renderMs.reduce((a, b) => a + b, 0)),
      renderMaxMs: r3(Math.max(0, ...renderMs)),
      collisionBlocks: blocks.size,
      colliderSumMs: r3(colliderMs.reduce((a, b) => a + b, 0)),
    })
  }
}
physics.free()

// One line per config: medians over the reps.
const summary = configs.map(({ layout, n, kind }) => {
  const mine = rows.filter(
    (r) =>
      (r as { layout: string }).layout === layout &&
      (r as { n: number }).n === n &&
      (r as { kind: string }).kind === kind,
  ) as Record<string, number>[]
  const m = (k: string) =>
    r3(
      pct(
        mine.map((r) => r[k]),
        0.5,
      ),
    )
  const p95 = (k: string) =>
    r3(
      pct(
        mine.map((r) => r[k]),
        0.95,
      ),
    )
  return {
    layout,
    n,
    kind,
    editP50Ms: m('editMs'),
    editP95Ms: p95('editMs'),
    chunksEdited: mine[0].chunksEdited,
    staleRender: mine[0].staleRender,
    renderSumP50Ms: m('renderSumMs'),
    renderMaxP95Ms: p95('renderMaxMs'),
    collisionBlocks: mine[0].collisionBlocks,
    colliderSumP50Ms: m('colliderSumMs'),
    colliderSumP95Ms: p95('colliderSumMs'),
  }
})
console.log(
  JSON.stringify({
    bench: 'terrainEdit',
    reps: REPS,
    renderChunkRebuild: Object.fromEntries(
      Object.entries(rebuildSamples).map(([k, xs]) => [
        k,
        {
          samples: xs.length,
          p50Ms: r3(pct(xs, 0.5)),
          p95Ms: r3(pct(xs, 0.95)),
          maxMs: r3(pct(xs, 1)),
        },
      ]),
    ),
    colliderBlock: {
      samples: colliderSamples.length,
      p50Ms: r3(pct(colliderSamples, 0.5)),
      p95Ms: r3(pct(colliderSamples, 0.95)),
      maxMs: r3(pct(colliderSamples, 1)),
    },
    summary,
  }),
)
