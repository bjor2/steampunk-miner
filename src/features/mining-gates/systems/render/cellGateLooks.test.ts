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
import { chunkDensityHaloOf } from '../../../../systems/render/densityHalo'
import { CHUNK_SIZE, chunkOfTile, firstTileOfChunk } from '../../../../systems/world/tileGrid'
import {
  cellAt,
  currentDensityOfChunk,
  EMPTY_WORLD,
  materialCellsOfChunk,
} from '../../../../systems/world/worldState'
import { paramsOn, sessionOn, worldCellOfGate } from '../gateFixtures'
import { GATE_ROWS } from '../gateRows'
import type { CellGateKind } from '../gateTable'
import {
  CELL_GATE_LOOK_ID,
  cellGateLookOf,
  markerTintOf,
  TERRAIN_KINDS,
  terrainKindOf,
} from './cellGateLooks'
import { motionSignatureOf } from './lockMarkers'
import { actTintOf } from './markerTints'

// Ticket 298: the gate each ore cell shows to the kernel's terrain gate channel.

const FIRE = 8
const FROST = 17

function gatedCellOn(planet: number, kind: CellGateKind) {
  const params = paramsOn(sessionOn(planet))
  const found = worldCellOfGate(params, (gate) => gate.kind === kind)
  return { params, ...found, cell: cellAt(EMPTY_WORLD, params, found.tile) }
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

describe('gate looks in the ground', () => {
  it('shows a dynamite cell as the cracked shell, locked', () => {
    const { params, tile, cell } = gatedCellOn(7, 'dynamite')
    expect(cellGateLookOf(params, cell, tile)).toEqual({
      kind: TERRAIN_KINDS.cracked_shell,
      state: GATE_STATE.locked,
    })
  })

  it('shows a dense cell as the hard rim', () => {
    const { params, tile, cell } = gatedCellOn(7, 'dense')
    expect(cellGateLookOf(params, cell, tile)?.kind).toBe(TERRAIN_KINDS.hard_rim)
  })

  it("shows an extractor cell as its extractor's surface motion, owned or not", () => {
    const { params, tile, cell, gate } = gatedCellOn(FIRE, 'rig')
    const motion = gate.kind === 'rig' ? motionSignatureOf(gate.rig.id) : null
    expect(cellGateLookOf(params, cell, tile)?.kind).toBe(TERRAIN_KINDS[motion ?? ''])
  })

  it('leaves rock, air and an ungated ore cell bare', () => {
    const { params, tile } = gatedCellOn(7, 'none')
    expect(cellGateLookOf(params, cellAt(EMPTY_WORLD, params, tile), tile)).toBeNull()
    expect(cellGateLookOf(params, 0, { tx: 0, ty: 0 })).toBeNull()
  })

  it('numbers every marker pattern apart, inside the channel, with room for later acts', () => {
    const kinds = Object.values(TERRAIN_KINDS)
    expect(new Set(kinds).size).toBe(kinds.length)
    kinds.forEach((kind) => expect(() => gateBitsOf({ kind, state: 0 })).not.toThrow())
    expect(Math.max(...kinds)).toBeLessThan(MAX_GATE_KIND)
  })

  it("gives each extractor's cells a pattern of their own, apart from the drill's and dynamite's", () => {
    const rigKinds = GATE_ROWS.rigs.map((rig) => terrainKindOf({ kind: 'rig', rig }))
    const others = [
      terrainKindOf({ kind: 'dense' }),
      terrainKindOf({ kind: 'dynamite', minCharge: 1 }),
    ]
    expect(new Set([...rigKinds, ...others]).size).toBe(GATE_ROWS.rigs.length + 2)
    expect(terrainKindOf({ kind: 'drillSignature' })).toBe(terrainKindOf({ kind: 'dense' }))
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
