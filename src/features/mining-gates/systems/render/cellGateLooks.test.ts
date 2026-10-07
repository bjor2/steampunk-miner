import { describe, expect, it } from 'vitest'
import { cellGateLookProvider } from '../../../../systems/registries/cellGateLook'
import {
  gateBitsOf,
  GATE_STATE,
  gateLookOfBits,
  MAX_GATE_KIND,
} from '../../../../systems/render/cellGateBits'
import { buildChunkTileBatch } from '../../../../systems/render/chunkTileBatch'
import { rgbOfHex } from '../../../../systems/render/colour'
import { drawnGateOf, gateKindOfPattern } from '../../../../systems/render/gatePatterns'
import { chunkDensityHaloOf } from '../../../../systems/render/densityHalo'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../../../../systems/world/tileGrid'
import {
  cellAt,
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
} from '../../../../systems/world/worldState'
import { canMine } from '../canMine'
import { paramsOn, sessionOn, setTipMajor, worldCellOfGate } from '../gateFixtures'
import { GATE_ROWS } from '../gateRows'
import type { CellGateKind } from '../gateTable'
import { CELL_GATE_LOOK_ID, cellGateLookOf, gatePatternOf, markerTintOf } from './cellGateLooks'
import { lockMarkerOf, motionSignatureOf } from './lockMarkers'
import { actTintOf } from './markerTints'

// Tickets 298 and 299: the gate each ore cell shows to the kernel's terrain gate channel.

const FIRE = 8
const FROST = 17

function gatedCellOn(planet: number, kind: CellGateKind) {
  const session = sessionOn(planet)
  const params = paramsOn(session)
  const found = worldCellOfGate(params, (gate) => gate.kind === kind)
  return { session, params, ...found, cell: cellAt(EMPTY_WORLD, params, found.tile) }
}

/** The tip major `canMine` names as the one a drill-gated cell needs, at tip 0. */
function requiredMajorOf(fixture: ReturnType<typeof gatedCellOn>): number {
  const { session, tile, cell, ore } = fixture
  const verdict = canMine({ state: session.state(), playerId: 'p1', tile, cell, ore, blast: null })
  return Number(verdict?.required.split(':')[1])
}

/** The look the chunk mesh writes for `tile`, read back from its per-cell bits. */
function drawnLookAt(planet: number, tile: { tx: number; ty: number }) {
  const params = paramsOn(sessionOn(planet))
  const [cx, cy] = [chunkOfTile(tile.tx), chunkOfTile(tile.ty)]
  const halo = chunkDensityHaloOf(
    (x, y) => currentDensityOfChunk(EMPTY_WORLD, params, x, y),
    cx,
    cy,
  )
  const batch = buildChunkTileBatch(
    params,
    cx,
    cy,
    materialCellsOfChunk(EMPTY_WORLD, params, cx, cy),
    halo,
  )
  const [lx, ly] = [tile.tx - firstTileOfChunk(cx), tile.ty - firstTileOfChunk(cy)]
  for (let at = 0; at < batch.count; at++) {
    if (batch.tiles[at * 2] === lx && batch.tiles[at * 2 + 1] === ly)
      return gateLookOfBits(batch.gates[at])
  }
  throw new Error(`tile ${tile.tx},${tile.ty} is not drawn (chunk side ${CHUNK_SIZE})`)
}

/** Every pattern the slice writes, by name: the shell, the rims and the extractor motions. */
const GATE_PATTERNS_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries([
  ...(['hard_rim', 'bare_rim', 'cracked_shell'] as const).map((pattern) => [
    pattern,
    gateKindOfPattern(pattern),
  ]),
  ...GATE_ROWS.rigs.map((rig) => [
    motionSignatureOf(rig.id) ?? '',
    gateKindOfPattern(gatePatternOf({ kind: 'rig', rig })),
  ]),
])

describe('gate looks in the ground', () => {
  it('shows a dynamite cell as the cracked shell, locked, which no tip opens', () => {
    const { params, tile, cell } = gatedCellOn(7, 'dynamite')
    expect(cellGateLookOf(params, cell, tile)).toEqual({
      kind: gateKindOfPattern('cracked_shell'),
      state: GATE_STATE.locked,
    })
  })

  it('shows a dense cell as the hard rim, opening at the tip major the gate asks for', () => {
    const dense = gatedCellOn(7, 'dense')
    expect(cellGateLookOf(dense.params, dense.cell, dense.tile)).toEqual({
      kind: gateKindOfPattern('hard_rim'),
      state: GATE_STATE.locked,
      opensAtTipMajor: requiredMajorOf(dense),
    })
  })

  it('opens the rim in the ground on the major where the lock marker opens', () => {
    const dense = gatedCellOn(7, 'dense')
    const { session, params, tile, cell } = dense
    const opensAt = requiredMajorOf(dense)
    const bits = gateBitsOf(cellGateLookOf(params, cell, tile))
    for (const tipMajor of [opensAt - 1, opensAt]) {
      setTipMajor(session, tipMajor)
      const isMarkerOpen = lockMarkerOf(session.state(), 'p1', tile).kind === 'hard_rim_open'
      const viewer = { tipMajor, isMotionReduced: false }
      expect(drawnGateOf(bits, viewer)?.isOpen).toBe(isMarkerOpen)
    }
  })

  it("shows an extractor cell as its extractor's surface motion, owned or not", () => {
    const { params, tile, cell, gate } = gatedCellOn(FIRE, 'rig')
    const motion = gate.kind === 'rig' ? motionSignatureOf(gate.rig.id) : null
    expect(cellGateLookOf(params, cell, tile)).toEqual({
      kind: GATE_PATTERNS_BY_NAME[motion ?? ''],
      state: GATE_STATE.locked,
    })
  })

  it('rims an ordinary ore cell from P7 until its tip major, as the lock marker does', () => {
    const ordinary = gatedCellOn(7, 'none')
    const { session, params, tile, cell } = ordinary
    const opensAt = requiredMajorOf(ordinary)
    const look = cellGateLookOf(params, cell, tile)
    expect(look).toEqual({
      kind: gateKindOfPattern('bare_rim'),
      state: GATE_STATE.locked,
      opensAtTipMajor: opensAt,
    })
    setTipMajor(session, opensAt)
    expect(lockMarkerOf(session.state(), 'p1', tile).kind).toBe('none')
    expect(drawnGateOf(gateBitsOf(look), { tipMajor: opensAt, isMotionReduced: false })).toBeNull()
  })

  it('leaves rock, air and an ungated ore cell before P7 bare', () => {
    const { params, tile } = gatedCellOn(5, 'none')
    expect(cellGateLookOf(params, cellAt(EMPTY_WORLD, params, tile), tile)).toBeNull()
    expect(cellGateLookOf(params, 0, { tx: 0, ty: 0 })).toBeNull()
  })

  it('keeps every pattern it writes inside the channel', () => {
    const kinds = Object.values(GATE_PATTERNS_BY_NAME)
    kinds.forEach((kind) => expect(() => gateBitsOf({ kind, state: 0 })).not.toThrow())
    expect(Math.max(...kinds)).toBeLessThan(MAX_GATE_KIND)
  })

  it("gives each extractor's cells a pattern of their own, apart from the drill's and dynamite's", () => {
    const rigPatterns = GATE_ROWS.rigs.map((rig) => gatePatternOf({ kind: 'rig', rig }))
    const others = [
      gatePatternOf({ kind: 'dense' }),
      gatePatternOf({ kind: 'dynamite', minCharge: 1 }),
    ]
    expect(new Set([...rigPatterns, ...others]).size).toBe(GATE_ROWS.rigs.length + 2)
    expect(gatePatternOf({ kind: 'drillSignature' })).toBe(gatePatternOf({ kind: 'dense' }))
  })

  it("tints the planet's markers with its act, Fire in its secondary out of the heat hues", () => {
    const params = (planet: number) => paramsOn(sessionOn(planet))
    expect(markerTintOf(params(FIRE))).toEqual(rgbOfHex(actTintOf('fire')?.secondary ?? ''))
    expect(markerTintOf(params(FROST))).toEqual(rgbOfHex(actTintOf('frost')?.rim ?? ''))
  })
})

describe('gate looks at the chunk mesh', () => {
  it('is the registered cellGateLook provider', () => {
    expect(cellGateLookProvider()?.id).toBe(CELL_GATE_LOOK_ID)
  })

  it("draws a gated cell's look into its tile's bits", () => {
    const { params, tile, cell } = gatedCellOn(7, 'dynamite')
    expect(drawnLookAt(7, tile)).toEqual(cellGateLookOf(params, cell, tile))
  })
})
