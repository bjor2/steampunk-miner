import { describe, expect, it } from 'vitest'
import type { AuthorityCommand, CommandIntent } from '../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { carveCircleCommand } from '../../systems/authority/groundCommands'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import { GROUND, poseAbove, poseInBay, WORLD_SEED } from '../../systems/authority/scriptedSession'
import { replayRun } from '../../systems/replay/replayRun'
import { FACING } from '../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../systems/world/sampleGrid'
import { LODESTONE_BEACON_ID } from './systems/lodestoneBeacon'
import { ORE_SHIFTER_ID } from './systems/oreShifter'
import { PRESSURE_POCKET_ID } from './systems/pressurePocket'
import { SEAM_SPLITTER_ID } from './systems/seamSplitter'
import { buriedTile, MM, press } from './terrainTestSession'

// #162 acceptance 5: replaying a run gives the same `editHash` for every `terrain_edit`, whether
// the clock jumps to each command or runs in render frames of 30 or 144 a second.

const PAIRS = [
  [ORE_SHIFTER_ID, SEAM_SPLITTER_ID],
  [PRESSURE_POCKET_ID, LODESTONE_BEACON_ID],
] as const

/** Two tools slotted; each used from its own pocket underground; then a dock. */
function runUsing(first: string, second: string): AuthorityCommand[] {
  const intents: [number, CommandIntent][] = [
    [0, setVehicleLoadoutCommand({ 'powerup.1': first, 'powerup.2': second })],
    [1, poseAbove(GROUND, FACING.right)],
    ...standIntents(5, 8),
    [10, press('powerup.1')],
    ...standIntents(40, 15),
    [45, press('powerup.2')],
    [80, { type: 'undock', payload: {} }],
    [90, poseInBay('sell')],
    [90, { type: 'dock', payload: { bay: 'sell' } }],
  ]
  return intents.map(([tick, intent], index) => ({
    playerId: 'p1',
    tick,
    seq: index + 1,
    ...intent,
  }))
}

function standIntents(tick: number, depth: number): [number, CommandIntent][] {
  const tile = buriedTile(depth)
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  const { payload } = poseAbove(GROUND, FACING.right)
  return [
    [tick, carveCircleCommand({ ...centre, radius: 900, amount: SOLID_DENSITY })],
    [tick, { type: 'reportPose', payload: { ...payload, ...centre } }],
  ]
}

function editHashesOf(events: readonly DomainEvent[]) {
  return events.flatMap((event) =>
    event.type === 'terrain-tools.TerrainEdited'
      ? [[event.tick, event.itemId, event.editHash]]
      : [],
  )
}

describe('terrain-tools replay', () => {
  it.each(PAIRS)('replays %s and %s to the same edit hashes at any frame rate', (first, second) => {
    const commands = runUsing(first, second)
    const jumped = replayRun(WORLD_SEED, commands, { endTick: 140 })
    const hashes = editHashesOf(jumped.events)
    expect(hashes.length).toBeGreaterThanOrEqual(2)
    for (const framesPerSecond of [30, 144]) {
      const framed = replayRun(WORLD_SEED, commands, { endTick: 140, framesPerSecond })
      expect(editHashesOf(framed.events)).toEqual(hashes)
      expect(framed.digests).toEqual(jumped.digests)
    }
  })
})
