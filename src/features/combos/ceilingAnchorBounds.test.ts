import { describe, expect, it } from 'vitest'
import { cutFollowAt } from '../../systems/authority/cutFollowRead'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { PARAMS, type ScriptedSession } from '../../systems/authority/scriptedSession'
import { entriesOf } from '../../systems/registries/seal'
import { ITEM_HOOK_REGISTRY } from '../../systems/registries/itemHooks'
import {
  VEHICLE_MOTION_EFFECT_REGISTRY,
  vehicleMotionAt,
} from '../../systems/registries/vehicleMotionEffects'
import type { DriveSigns } from '../../systems/vehicle/driveSigns'
import { FACING, type Facing } from '../../systems/vehicle/vehiclePose'
import { surfaceRowOfColumn, type TilePoint } from '../../systems/world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../systems/world/worldState'
import { comboItemOf } from '.'
import {
  aheadCellOf,
  anchorSession,
  drillAt,
  lifting,
  poseOver,
  pushingDown,
  TARGET,
  TWIN_BIT,
} from './ceilingAnchorTestSession'
import { CEILING_ANCHOR_ID } from './systems/ceilingAnchor'

// The Vertical Scaler's three unit asserts in place of a bot pace gate (GD ruling on #288, Pace):
// an up-cut cell takes at least the ticks the same cell takes cut downward, through the same drill
// path; it pays the same cargo, with no yield multiplier; and the combo leaves the travel bound
// while clinging as the anchor alone sets it. With no speed or yield bonus no 0.98x bot gate runs.

const MAX_TICKS = 600

/** Where `cell` sits from the target the bit's diagonal reaches it from, along `bearing`. */
function targetReaching(cell: TilePoint, facing: Facing, bearing: 'left' | 'right'): TilePoint {
  const ahead = aheadCellOf(TARGET, facing, bearing)
  return { tx: cell.tx + TARGET.tx - ahead.tx, ty: cell.ty + TARGET.ty - ahead.ty }
}

const kindAt = (tile: TilePoint) => kindOfCell(cellAt(EMPTY_WORLD, PARAMS, tile))

/** Every cell next to `target` but `cell` is plain ground: only `cell` can yield ore. */
function isGroundAround(target: TilePoint, cell: TilePoint): boolean {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tile = { tx: target.tx + dx, ty: target.ty + dy }
      const isCell = tile.tx === cell.tx && tile.ty === cell.ty
      if (!isCell && kindAt(tile) !== CELL_KIND.ground) return false
    }
  }
  return true
}

/** An ore cell a few rows down that both diagonals reach from plain ground. */
function oreReachedBothWays(): { ore: TilePoint; above: TilePoint; below: TilePoint } {
  for (let tx = 12; tx < 200; tx++) {
    for (let depth = 4; depth < 12; depth++) {
      const ore = { tx, ty: surfaceRowOfColumn(tx, PARAMS.radiusTiles) - depth }
      if (kindAt(ore) !== CELL_KIND.ore) continue
      const above = targetReaching(ore, FACING.down, 'left')
      const below = targetReaching(ore, FACING.up, 'right')
      if (isGroundAround(above, ore) && isGroundAround(below, ore)) return { ore, above, below }
    }
  }
  throw new Error('no ore cell both diagonals reach from plain ground')
}

interface CellCut {
  ticks: number
  cargo: DomainEvent[]
}

/** Drills one tick at a time over `target` until `cell` breaks: the ticks and the cargo. */
function cutCell(
  session: ScriptedSession,
  cell: TilePoint,
  target: TilePoint,
  how: { facing: Facing; drive: DriveSigns },
): CellCut {
  const cargo: DomainEvent[] = []
  for (let ticks = 1; ticks <= MAX_TICKS; ticks++) {
    const events = drillAt(session, 2 + ticks, how.drive, { target, facing: how.facing })
    cargo.push(...events.filter((event) => event.type === 'CargoAdded'))
    if (events.some((event) => isBreakOf(event, cell))) return { ticks, cargo }
  }
  throw new Error(`the cell did not break in ${MAX_TICKS} ticks`)
}

function isBreakOf(event: DomainEvent, cell: TilePoint): boolean {
  return event.type === 'TileDestroyed' && event.tx === cell.tx && event.ty === cell.ty
}

/** The same ore cell cut down-diagonally by the bare twin bit, and up-diagonally anchored. */
function cutBothWays(): { down: CellCut; up: CellCut } {
  const { ore, above, below } = oreReachedBothWays()
  const downward = anchorSession({
    slots: { 'drill.head': TWIN_BIT },
    owned: [],
    isAnchored: false,
    target: above,
    facing: FACING.down,
  })
  const down = cutCell(downward, ore, above, { facing: FACING.down, drive: pushingDown(1) })
  const up = cutCell(anchorSession({ target: below }), ore, below, {
    facing: FACING.up,
    drive: lifting(1),
  })
  return { down, up }
}

const cargoOf = (cut: CellCut) =>
  cut.cargo.map((event) => (event.type === 'CargoAdded' ? [event.oreId, event.value] : []))

describe('ceiling anchor: the pace bounds', () => {
  const { down, up } = cutBothWays()

  it('takes at least the ticks a cell takes cut downward, on the same cell and drill path', () => {
    expect(down.ticks).toBeGreaterThan(1)
    expect(up.ticks).toBeGreaterThanOrEqual(down.ticks)
  })

  it('pays an up-cut cell the same cargo as cut downward, with no yield multiplier', () => {
    expect(up.cargo.length).toBeGreaterThan(0)
    expect(cargoOf(up)).toEqual(cargoOf(down))
    expect(comboItemOf(CEILING_ANCHOR_ID)?.isIncomeCombo).toBe(false)
    const hooks = entriesOf(ITEM_HOOK_REGISTRY)
    expect(hooks.filter((hook) => hook.incomeItemId === CEILING_ANCHOR_ID)).toEqual([])
  })

  it('leaves the travel bound while clinging as the anchor alone sets it', () => {
    const owner = anchorSession()
    const bare = anchorSession({ owned: [] })
    const { x, y } = poseOver(TARGET, FACING.up)
    const step = { x, y, facing: FACING.up, isLifting: true, isDrilling: true }
    expect(cutFollowAt(owner.state(), 'p1', step)).toEqual(cutFollowAt(bare.state(), 'p1', step))
    const motionOf = (session: ScriptedSession) => vehicleMotionAt(session.state(), 'p1', 2)
    expect(motionOf(owner)).toEqual(motionOf(bare))
    expect(motionOf(owner).isClinging).toBe(true)
    const effects = entriesOf(VEHICLE_MOTION_EFFECT_REGISTRY).map((effect) => effect.id)
    expect(effects.filter((id) => id.startsWith('combos.'))).toEqual([])
  })
})
