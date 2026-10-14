import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import {
  createScriptedSession,
  PARAMS,
  surfaceOreTiles,
} from '../../systems/authority/scriptedSession'
import { vehicleMotionAt } from '../../systems/registries/vehicleMotionEffects'
import { signOfPush } from '../../systems/vehicle/driveSigns'
import { FACING } from '../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import {
  aheadCellOf,
  anchorSession,
  densityOf,
  drillAt,
  freshDensityOf,
  GRAV_ANCHOR,
  lifting,
  setUpAnchorRig,
  TARGET,
  toggleAnchor,
  TWIN_BIT,
} from './ceilingAnchorTestSession'
import { CEILING_ANCHOR_GEAR, CEILING_ANCHOR_ID } from './systems/ceilingAnchor'

// The ceiling anchor in play (ticket 288; the 14 Oct ruling on #288): anchored, lifting with a side
// pushed at least halfway, the twin bit cuts the up-diagonal cell on that side; with no anchor,
// no side, no combo, no twin bit, or only another player's anchor, it cuts nothing upward; a gate
// on a crossed cell refuses it through `canMine`; and the anchor letting go mid-cut stops the cut
// on that tick with the cell keeping its progress.

const DRILL_TICKS = 30
const UP_RIGHT = aheadCellOf(TARGET, FACING.up, 'right')
const UP_LEFT = aheadCellOf(TARGET, FACING.up, 'left')

/** The up-diagonal cell's density after one `DRILL_TICKS` drill lifting with `x` pushed. */
function upCellAfterDrill(
  session: ReturnType<typeof anchorSession>,
  x: -1 | 0 | 1,
  cell: TilePoint,
) {
  drillAt(session, 3 + DRILL_TICKS, x === 0 ? { x: 0, y: 1 } : lifting(x), {
    drillTicks: DRILL_TICKS,
  })
  return densityOf(session.state().world, cell)
}

describe('ceiling anchor: the up-cut', () => {
  it('cuts the up-diagonal cell on the side pushed at least halfway while anchored', () => {
    expect(signOfPush(0.5)).toBe(1)
    expect(upCellAfterDrill(anchorSession(), signOfPush(0.5), UP_RIGHT)).toBeLessThan(
      freshDensityOf(UP_RIGHT),
    )
    expect(upCellAfterDrill(anchorSession(), signOfPush(-0.5), UP_LEFT)).toBeLessThan(
      freshDensityOf(UP_LEFT),
    )
  })

  it('cuts nothing upward with the same input while not anchored', () => {
    const session = anchorSession({ isAnchored: false })
    expect(upCellAfterDrill(session, 1, UP_RIGHT)).toBe(freshDensityOf(UP_RIGHT))
  })

  it('cuts nothing upward lifting with no side pushed: no straight-up turn', () => {
    expect(signOfPush(0.4)).toBe(0)
    const session = anchorSession()
    drillAt(session, 3 + DRILL_TICKS, { x: signOfPush(0.4), y: 1 }, { drillTicks: DRILL_TICKS })
    const world = session.state().world
    expect(densityOf(world, UP_RIGHT)).toBe(freshDensityOf(UP_RIGHT))
    expect(densityOf(world, UP_LEFT)).toBe(freshDensityOf(UP_LEFT))
    expect(session.vehicle().aheadLatch?.bearing).toBe('facing')
  })

  it('cuts nothing upward for a player without the combo or without the twin bit', () => {
    const unowned = anchorSession({ owned: [] })
    expect(upCellAfterDrill(unowned, 1, UP_RIGHT)).toBe(freshDensityOf(UP_RIGHT))
    const noBit = anchorSession({ slots: { 'powerup.1': GRAV_ANCHOR }, owned: [CEILING_ANCHOR_ID] })
    expect(upCellAfterDrill(noBit, 1, UP_RIGHT)).toBe(freshDensityOf(UP_RIGHT))
  })

  it("never grants the up-cut through another player's anchor", () => {
    const beside = { tx: TARGET.tx + 8, ty: TARGET.ty }
    const session = createScriptedSession(['p1', 'p2'])
    setUpAnchorRig(session, { playerId: 'p2', target: beside })
    setUpAnchorRig(session, { playerId: 'p1', isAnchored: false })
    expect(vehicleMotionAt(session.state(), 'p2', 2).isClinging).toBe(true)
    drillAt(session, 3 + DRILL_TICKS, lifting(1), { drillTicks: DRILL_TICKS })
    expect(densityOf(session.state().world, UP_RIGHT)).toBe(freshDensityOf(UP_RIGHT))
    const theirs = aheadCellOf(beside, FACING.up, 'right')
    drillAt(session, 3 + DRILL_TICKS, lifting(1), {
      drillTicks: DRILL_TICKS,
      target: beside,
      playerId: 'p2',
    })
    expect(densityOf(session.state().world, theirs)).toBeLessThan(freshDensityOf(theirs))
  })

  it('stops the up-cut on the tick the anchor lets go, the cell keeping its progress', () => {
    const session = anchorSession()
    drillAt(session, 7, lifting(1), { drillTicks: 4 })
    const started = densityOf(session.state().world, UP_RIGHT)
    expect(started).toBeLessThan(freshDensityOf(UP_RIGHT))
    expect(started).toBeGreaterThan(0)
    session.submit(8, toggleAnchor())
    expect(vehicleMotionAt(session.state(), 'p1', 8).isClinging).toBe(false)
    drillAt(session, 12, lifting(1), { drillTicks: 4 })
    expect(densityOf(session.state().world, UP_RIGHT)).toBe(started)
    expect(session.vehicle().aheadLatch?.bearing).toBe('facing')
  })
})

/** Only what the combo's source reads: the two items, the twin bit's ask and a clinging rig. */
const ANCHOR_PROBES: readonly SliceDefinition[] = [
  {
    id: 'combos',
    register: (r) => {
      r.content('vehicle-item', [
        { id: CEILING_ANCHOR_ID, iconId: 'item-combo-ceiling-anchor', slots: [], attach: null },
      ])
      r.drillGear(CEILING_ANCHOR_GEAR)
    },
  },
  {
    id: 'rig-probe',
    register: (r) => {
      r.content('vehicle-item', [
        { id: TWIN_BIT, iconId: 'item-gear-twin-bit', slots: ['drill.head'], attach: 'drill.head' },
      ])
      r.drillGear({ id: 'rig-probe.twin', gearOf: () => ({ aheadCells: 1, aheadAim: 'drive' }) })
      r.vehicleMotionEffect({ id: 'rig-probe.cling', effectOf: () => ({ cling: true }) })
    },
  },
]

/** A gate on one ore tile only, the way #142's dynamite shell refuses the drill. */
function shellOn(ore: TilePoint): SliceDefinition {
  return {
    id: 'shell-probe',
    register: (r) =>
      r.gateCheck({
        id: 'shell-probe.one-tile',
        check: ({ tile }) =>
          tile.tx === ore.tx && tile.ty === ore.ty
            ? { outcome: 'refused', gateKind: 'dynamite', required: '1', have: '0' }
            : null,
      }),
  }
}

/** A surface ore cell standing where the up-right cell sits over a plain ground target. */
function oreOverGround(): { ore: TilePoint; target: TilePoint } {
  const targetUnder = (ore: TilePoint) => ({
    tx: ore.tx + TARGET.tx - UP_RIGHT.tx,
    ty: ore.ty + TARGET.ty - UP_RIGHT.ty,
  })
  const isGround = (tile: TilePoint) =>
    kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile)) === CELL_KIND.ground
  const ore = surfaceOreTiles(40).find((tile) => isGround(targetUnder(tile)))
  if (ore === undefined) throw new Error('no ore cell over a ground target')
  return { ore, target: targetUnder(ore) }
}

describe('ceiling anchor: the gates', () => {
  it('refuses an up-diagonal cell a gate holds, through canMine', () => {
    const { ore, target } = oreOverGround()
    const cutWith = (slices: readonly SliceDefinition[]) =>
      withRegistrations(slices, () => {
        const session = createScriptedSession()
        setUpAnchorRig(session, { slots: { 'drill.head': TWIN_BIT }, isAnchored: false, target })
        drillAt(session, 3 + DRILL_TICKS, lifting(1), { drillTicks: DRILL_TICKS, target })
        return session.state().world
      })
    expect(densityOf(cutWith(ANCHOR_PROBES), ore)).toBeLessThan(freshDensityOf(ore))
    const gated = cutWith([...ANCHOR_PROBES, shellOn(ore)])
    expect(densityOf(gated, ore)).toBe(freshDensityOf(ore))
    expect(kindOfCell(cellAt(gated, PARAMS, ore))).toBe(CELL_KIND.ore)
  })
})
