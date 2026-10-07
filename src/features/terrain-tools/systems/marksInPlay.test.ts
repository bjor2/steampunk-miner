import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { buriedTile, ofType, press, sessionWith, standAt } from '../terrainTestSession'
import { SEAM_SPLITTER_ID } from './seamSplitter'
import { statPreview } from './statPreview'

// Marks in play (#249, #162 4.6): a terrain tool edits at the size its ladder gives at the Mark
// researched when it acts, and logs that Mark. The seam splitter unlocks at P10; as a consumable
// its first step is the fissure, at Mark 2 (P13): 8 x 1.15, whole cells.

/** Every node through `planetIndex` researched, as the debug "jump to depth" grants it. */
function researchThrough(session: ScriptedSession, planetIndex: number): void {
  session.submit(2, {
    type: 'debug.tech-tree.unlockThrough',
    payload: { planetIndex },
  } as CommandIntent)
}

const DEPTHS = [8, 10, 12, 14, 16, 18]

function splitAfterResearching(planetIndex: number, depth: number) {
  const session = sessionWith({ 'powerup.1': SEAM_SPLITTER_ID })
  researchThrough(session, planetIndex)
  standAt(session, 5, buriedTile(depth), FACING.right)
  session.submit(10, press())
  session.advanceTo(20)
  return ofType(session.events(), 'terrain-tools.TerrainEdited').flatMap((edited) =>
    edited.type === 'terrain-tools.TerrainEdited' ? [edited] : [],
  )
}

function fissureAt(mark: number): number {
  const size = statPreview(SEAM_SPLITTER_ID, mark, 1)?.lines.find((line) => line.stat === 'size')
  if (size === undefined) throw new Error('no fissure line')
  return size.value
}

describe('terrain-tools marks in play', () => {
  it('splits up to a longer fissure at a researched Mark 2 than as bought, and logs the Mark', () => {
    expect(fissureAt(2)).toBeGreaterThan(fissureAt(1))
    const asBought = DEPTHS.flatMap((depth) => splitAfterResearching(10, depth))
    const marked = DEPTHS.flatMap((depth) => splitAfterResearching(13, depth))
    expect(asBought.length).toBeGreaterThan(2)
    expect(marked.length).toBeGreaterThan(2)
    expect(
      asBought.every(({ mark, cellsChanged }) => mark === 1 && cellsChanged <= fissureAt(1)),
    ).toBe(true)
    expect(
      marked.every(({ mark, cellsChanged }) => mark === 2 && cellsChanged <= fissureAt(2)),
    ).toBe(true)
    expect(marked.some(({ cellsChanged }) => cellsChanged === fissureAt(2))).toBe(true)
  })
})
