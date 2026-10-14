import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { ECONOMY } from '../../economy/economy'
import { gunRangeTiles } from '../../economy/gunStats'
import type { TurretBurst, TurretShape } from '../../registries/autoGuns'
import { GUN_SHOT_FLOOR_QUANTA, GUN_SHOT_QUANTA } from '../../vehicle/energyQuanta'
import { createScriptedSession } from '../scriptedSession'
import {
  BASE_TURRET_SHAPE,
  checkedTurretShape,
  foldTurretShapes,
  turretShapeOf,
} from './turretShape'

/** Content's Overpressure on #319: 2 s at two thirds of the interval, then a 5 s vent. */
const OVERPRESSURE: TurretBurst = {
  burstTicks: 120,
  ventTicks: 300,
  intervalNumerator: 2,
  intervalDenominator: 3,
}

function shapeWith(fields: Partial<TurretShape>): TurretShape {
  return { ...BASE_TURRET_SHAPE, ...fields }
}

/** A probe slice whose provider answers `shape` for every player. */
function turretProbe(shape: TurretShape | null): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.autoGuns({ id: 'probe.auto-guns', turretShapeOf: () => shape })
    },
  }
}

describe("turret shape: the caps (ticket 382, Systems' auto_guns table on #322)", () => {
  it('reads range 10, energy down to half a shot, 5 targets, 4 knock cells and a 6-cell leg', () => {
    expect(ECONOMY.gun.turretCaps).toMatchObject({
      gunRangeCap: 10,
      maxGrapeTargets: 5,
      maxKnockCells: 4,
      maxBounceLegCells: 6,
    })
    expect(GUN_SHOT_FLOOR_QUANTA * 2).toBe(GUN_SHOT_QUANTA)
  })

  it('is the #107 guns with no turret module: range 8, a full shot, nearest first', () => {
    expect(BASE_TURRET_SHAPE).toMatchObject({
      rangeTiles: gunRangeTiles(),
      energyPerShotQuanta: GUN_SHOT_QUANTA,
      targetOrder: 'nearest',
      forwardConeAfterTicks: null,
      knock: null,
      grape: null,
      burst: null,
      bounceLegCells: null,
    })
    expect(gunRangeTiles()).toBe(8)
  })

  it('accepts a shape with every field whole and at its cap', () => {
    const full = shapeWith({
      rangeTiles: 10,
      energyPerShotQuanta: GUN_SHOT_FLOOR_QUANTA,
      targetOrder: 'director',
      retargetTicks: 15,
      forwardConeAfterTicks: 30,
      knock: { cells: 4, cooldownTicks: 90 },
      grape: { targets: 5, coneDeg: 30 },
      burst: { burstTicks: 240, ventTicks: 150, intervalNumerator: 2, intervalDenominator: 3 },
      bounceLegCells: 6,
    })
    expect(checkedTurretShape(full)).toBe(full)
  })

  it('throws for a range past 10 tiles', () => {
    expect(() => checkedTurretShape(shapeWith({ rangeTiles: 11 }))).toThrow(/rangeTiles is 11/)
  })

  it('throws for every field over its cap', () => {
    const overCap: [Partial<TurretShape>, RegExp][] = [
      [{ grape: { targets: 6, coneDeg: 30 } }, /grape.targets is 6/],
      [{ knock: { cells: 5, cooldownTicks: 90 } }, /knock.cells is 5/],
      [{ bounceLegCells: 7 }, /bounceLegCells is 7/],
      [{ energyPerShotQuanta: GUN_SHOT_FLOOR_QUANTA - 1 }, /energyPerShotQuanta/],
      [{ energyPerShotQuanta: GUN_SHOT_QUANTA + 1 }, /energyPerShotQuanta/],
      [{ grape: { targets: 2, coneDeg: 45 } }, /grape.coneDeg 45 has no exact cone/],
    ]
    for (const [fields, message] of overCap) {
      expect(() => checkedTurretShape(shapeWith(fields))).toThrow(message)
    }
  })

  it('throws for a field that is not whole or is below its floor', () => {
    const notWhole: Partial<TurretShape>[] = [
      { rangeTiles: 9.5 },
      { rangeTiles: 0 },
      { retargetTicks: -1 },
      { forwardConeAfterTicks: 30.5 },
      { knock: { cells: 2, cooldownTicks: -90 } },
      { burst: { ...OVERPRESSURE, burstTicks: 0 } },
      { burst: { ...OVERPRESSURE, intervalNumerator: 0 } },
      { targetOrder: 'loudest' as TurretShape['targetOrder'] },
    ]
    for (const fields of notWhole) {
      expect(() => checkedTurretShape(shapeWith(fields))).toThrow(RangeError)
    }
  })

  it('throws for a burst that would fire more shots a cycle than the gun track (ticket 383)', () => {
    const overRate: TurretBurst[] = [
      { ...OVERPRESSURE, ventTicks: 50 },
      { ...OVERPRESSURE, intervalNumerator: 4 },
    ]
    for (const burst of overRate) {
      expect(() => checkedTurretShape(shapeWith({ burst }))).toThrow(RangeError)
    }
    const evenRate = { ...OVERPRESSURE, burstTicks: 120, ventTicks: 60 }
    expect(checkedTurretShape(shapeWith({ burst: evenRate })).burst).toBe(evenRate)
  })

  it("throws from the kernel's read when the provider answers a shape over its caps", () => {
    withRegistrations([turretProbe(shapeWith({ rangeTiles: 12 }))], () => {
      const session = createScriptedSession()
      expect(() => turretShapeOf(session.state(), 'p1')).toThrow(RangeError)
    })
  })

  it('reads the #107 guns when the provider answers null, or there is none', () => {
    expect(turretShapeOf(createScriptedSession().state(), 'p1')).toBe(BASE_TURRET_SHAPE)
    withRegistrations([turretProbe(null)], () => {
      expect(turretShapeOf(createScriptedSession().state(), 'p1')).toBe(BASE_TURRET_SHAPE)
    })
  })
})

describe("turret shape: the fold of the turret's modules (ticket 382)", () => {
  it('folds no module to no shape', () => {
    expect(foldTurretShapes([])).toBeNull()
  })

  it('takes the largest range and retarget wait, never their sum', () => {
    const folded = foldTurretShapes([
      shapeWith({ rangeTiles: 9 }),
      shapeWith({ rangeTiles: 10, retargetTicks: 15 }),
      shapeWith({ retargetTicks: 30 }),
    ])
    expect(folded).toMatchObject({ rangeTiles: 10, retargetTicks: 30 })
  })

  it("keeps the barrels' cheaper shot when another module answers a full one", () => {
    const folded = foldTurretShapes([
      shapeWith({ energyPerShotQuanta: 92 }),
      shapeWith({ targetOrder: 'director' }),
    ])
    expect(folded).toMatchObject({ energyPerShotQuanta: 92, targetOrder: 'director' })
  })

  it('takes the director over the nearest order when any module asks for it', () => {
    expect(foldTurretShapes([BASE_TURRET_SHAPE, BASE_TURRET_SHAPE])?.targetOrder).toBe('nearest')
    const directed = foldTurretShapes([BASE_TURRET_SHAPE, shapeWith({ targetOrder: 'director' })])
    expect(directed?.targetOrder).toBe('director')
  })

  it('takes the largest of each field of the nullable groups, and keeps unset ones null', () => {
    const folded = foldTurretShapes([
      shapeWith({ knock: { cells: 2, cooldownTicks: 180 }, forwardConeAfterTicks: 60 }),
      shapeWith({ knock: { cells: 4, cooldownTicks: 90 }, grape: { targets: 2, coneDeg: 30 } }),
      shapeWith({ burst: OVERPRESSURE, bounceLegCells: 3 }),
    ])
    expect(folded).toMatchObject({
      forwardConeAfterTicks: 60,
      knock: { cells: 4, cooldownTicks: 180 },
      grape: { targets: 2, coneDeg: 30 },
      burst: OVERPRESSURE,
      bounceLegCells: 3,
    })
    expect(foldTurretShapes([BASE_TURRET_SHAPE])).toEqual(BASE_TURRET_SHAPE)
  })
})
