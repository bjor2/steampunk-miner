import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import {
  createScriptedSession,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
} from '../../../systems/authority/scriptedSession'
import { bodyGrowthMmAt } from '../../../systems/vehicle/drillBore'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../../systems/world/cellYield'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { drillGearAskOf, REACH_BOOM_ID, SIDE_CUTTERS_ID } from './cuttersAndBoom'

const DRILL_TICKS = 60

function engaged(...itemIds: string[]) {
  return (itemId: string) => itemIds.includes(itemId)
}

/**
 * A bore two width levels wide (ticket 749: the cutters' Mark 2 owned), the stamp 1.6 m round, so
 * the ore beside the bit's tile lies inside it.
 */
const WIDE_BORE: SliceDefinition = {
  id: 'drill-gear',
  register: (r) => r.boreWidth({ id: 'drill-gear.probe', widthLevelsOf: () => 2 }),
}

/** A #142 gate of `gateKind` on one ore tile, refusing the drill there. */
function gateOn(tile: TilePoint, gateKind: string): SliceDefinition {
  return {
    id: 'gate-probe',
    register: (r) =>
      r.gateCheck({
        id: 'gate-probe.one-tile',
        check: (query) =>
          query.tile.tx === tile.tx && query.tile.ty === tile.ty
            ? { outcome: 'refused', gateKind, required: '1', have: '0' }
            : null,
      }),
  }
}

/** A surface ore cell and the downward drill target with that ore right beside the bore. */
function oreBesideBore() {
  const [ore] = surfaceOreTiles(1)
  return { ore, target: { tx: ore.tx - 1, ty: ore.ty - 1 } }
}

/**
 * The wide rig's report above `tile`: the pose is the owned body's centre (ticket 750), so a rig
 * two levels wide stands its growth higher than the bare body, its face where the bare one's is.
 */
function wideRigAbove(tile: TilePoint, drillTicks = 0) {
  const report = poseAbove(tile, FACING.down, { drillTicks })
  return { ...report, payload: { ...report.payload, y: report.payload.y + bodyGrowthMmAt(2) } }
}

function drillDownWith(slices: readonly SliceDefinition[], tile: TilePoint) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    session.submit(1, wideRigAbove(tile))
    const events = session.submit(1 + DRILL_TICKS, wideRigAbove(tile, DRILL_TICKS))
    return { events, world: session.state().world }
  })
}

describe('side cutters and reach boom', () => {
  it('ask nothing of the drill while neither is switched on', () => {
    expect(drillGearAskOf(engaged())).toBeNull()
  })

  it('side cutters ask nothing of the drill: their switch leaves the width alone (ticket 749)', () => {
    expect(drillGearAskOf(engaged(SIDE_CUTTERS_ID))).toBeNull()
  })

  it('the reach boom asks one cell past the bit', () => {
    expect(drillGearAskOf(engaged(REACH_BOOM_ID))).toEqual({ aheadCells: 1 })
  })

  it('both switched on ask for the boom’s cell alone', () => {
    expect(drillGearAskOf(engaged(SIDE_CUTTERS_ID, REACH_BOOM_ID))).toEqual({ aheadCells: 1 })
  })

  it('widens the bore round an ungated ore cell and collects it', () => {
    const { ore, target } = oreBesideBore()
    const cut = drillDownWith([WIDE_BORE], target)
    expect(cut.events).toContainEqual(expect.objectContaining({ type: 'TileDestroyed', ...ore }))
  })

  // #205 acceptance 1 with #142 acceptance 5: side_drills never frees a gated cell, nor does the
  // wider bore its Marks cut (ticket 749, the HS condition on #662 Part B).
  it.each(['rig', 'dynamite'])('leaves a %s-gated cell beside the bore untouched', (gateKind) => {
    const { ore, target } = oreBesideBore()
    const cut = drillDownWith([WIDE_BORE, gateOn(ore, gateKind)], target)
    expect(cellDensitySum(cut.world, PARAMS, ore)).toBe(cellDensitySum(EMPTY_WORLD, PARAMS, ore))
    expect(kindOfCell(cellAt(cut.world, PARAMS, ore))).toBe(CELL_KIND.ore)
    expect(cut.events).toContainEqual(
      expect.objectContaining({ type: 'DrillGated', ...ore, gateKind, outcome: 'refused' }),
    )
  })
})
