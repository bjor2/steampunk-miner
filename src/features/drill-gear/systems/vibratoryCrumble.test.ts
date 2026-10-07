import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { drillGearItemOf, vehicleItemOf, type DrillGearItem } from './drillGearItems'
import { VIBRATORY_BIT_ID, VIBRATORY_CRUMBLE_REACTION } from './vibratoryCrumble'

const BIT = drillGearItemOf(VIBRATORY_BIT_ID) as DrillGearItem

/** The bit's row and its reaction alone, so the spec reads the crumble and nothing else. */
const BIT_SLICE: SliceDefinition = {
  id: 'drill-gear',
  register(r) {
    r.content('vehicle-item', [vehicleItemOf(BIT)])
    r.authorityReaction(VIBRATORY_CRUMBLE_REACTION)
  },
}

/** Planet-1 band-1 ground (hardness 1) six rows under the surface, with ground below it. */
const SOFT_GROUND: TilePoint = { tx: 30, ty: 285 }
/** Band-1 ground whose next cell down is an ore cell. */
const ABOVE_ORE: TilePoint = { tx: 30, ty: 280 }
/** Drill tip 2.48 on planet 1: band-1 ground is under half of it. */
const SHARP_TIP_LEVEL = 40
/** Drill tip 1.97: band-1 ground is just over half of it. */
const BLUNT_TIP_LEVEL = 30
const DRILL_TICKS = 60

interface DrillSetup {
  head: string | null
  tipLevel: number
  tile: TilePoint
}

/** One reported downward drill command over `tile`, then a tick for the terrain queue. */
function drillDown({ head, tipLevel, tile }: DrillSetup) {
  return withRegistrations([BIT_SLICE], () => {
    const session = createScriptedSession()
    session.submit(0, {
      type: 'debug.setUpgrade',
      payload: { upgradeId: 'drill_tip', level: tipLevel },
    })
    if (head !== null) session.submit(0, setVehicleLoadoutCommand({ 'drill.head': head }))
    session.submit(1, poseAbove(tile, FACING.down))
    const events = session.submit(
      1 + DRILL_TICKS,
      poseAbove(tile, FACING.down, { drillTicks: DRILL_TICKS }),
    )
    session.submit(3 + DRILL_TICKS, poseAbove(tile, FACING.down))
    return { events, world: session.state().world }
  })
}

function nextCellDown(tile: TilePoint): TilePoint {
  return { tx: tile.tx, ty: tile.ty - 1 }
}

function crumbledOf(events: readonly DomainEvent[]) {
  return events.filter((event) => event.type === 'drill-gear.GroundCrumbled')
}

describe('vibratory bit', () => {
  it('crumbles soft common ground one cell ahead of the bit', () => {
    const setup = { head: VIBRATORY_BIT_ID, tipLevel: SHARP_TIP_LEVEL, tile: SOFT_GROUND }
    const ahead = nextCellDown(SOFT_GROUND)
    const plain = drillDown({ ...setup, head: null })
    const shaken = drillDown(setup)
    expect(cellDensitySum(plain.world, PARAMS, ahead)).toBeGreaterThan(0)
    expect(cellDensitySum(shaken.world, PARAMS, ahead)).toBe(0)
    expect(crumbledOf(shaken.events)).toEqual([
      expect.objectContaining({ playerId: 'p1', tx: ahead.tx, ty: ahead.ty }),
    ])
  })

  it('leaves ground harder than half the drill tip standing', () => {
    const setup = { head: VIBRATORY_BIT_ID, tipLevel: BLUNT_TIP_LEVEL, tile: SOFT_GROUND }
    const shaken = drillDown(setup)
    expect(shaken.world).toEqual(drillDown({ ...setup, head: null }).world)
    expect(crumbledOf(shaken.events)).toEqual([])
  })

  it('never crumbles ore: the drill mines it normally', () => {
    const setup = { head: VIBRATORY_BIT_ID, tipLevel: SHARP_TIP_LEVEL, tile: ABOVE_ORE }
    const shaken = drillDown(setup)
    expect(shaken.world).toEqual(drillDown({ ...setup, head: null }).world)
    expect(crumbledOf(shaken.events)).toEqual([])
  })

  it('does nothing with the default bit on the head', () => {
    const plain = drillDown({ head: null, tipLevel: SHARP_TIP_LEVEL, tile: SOFT_GROUND })
    expect(crumbledOf(plain.events)).toEqual([])
  })
})
