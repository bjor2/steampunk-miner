import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { ShotShape } from '../../registries/boreGun'
import { createScriptedSession } from '../scriptedSession'
import { BORE_STATS } from './boreFixtures'
import BORE_BEARINGS from './boreBearings.json'
import { strutReinforces } from './boreStrut'
import {
  checkedShotShape,
  foldShotShapes,
  liningTypeOfGrade,
  SHOT_SHAPE_CAPS,
  shotShapeOf,
} from './shotShape'

const ONE_LINE: ShotShape = {
  lineOffsets: [],
  seamTurns: 0,
  liningGrade: null,
  extraEnergyPerCellBp: 0,
  groundTicks: null,
  strutTicks: null,
}

/** A slice registering the kernel's strut answer, as a strut shape needs (ticket 379). */
const STRUT_REGISTERED: SliceDefinition = {
  id: 'probe',
  register: (r) => r.reinforcement({ id: 'probe.strut', reinforces: strutReinforces }),
}

function shapeWith(fields: Partial<ShotShape>): ShotShape {
  return { ...ONE_LINE, ...fields }
}

describe('shot shape: the caps (ticket 377, the TD lock on #318)', () => {
  it("reads Systems' caps from the bearing table: five lines and four seam turns", () => {
    expect(SHOT_SHAPE_CAPS).toEqual(BORE_BEARINGS.shotShapeCaps)
    expect(SHOT_SHAPE_CAPS).toEqual({ maxLines: 5, maxSeamTurns: 4 })
  })

  it('accepts a shape with every field whole and inside its cap, its strut registered', () =>
    withRegistrations([STRUT_REGISTERED], () => {
      const full = shapeWith({
        lineOffsets: [-16, -8, 8, 16],
        seamTurns: 4,
        liningGrade: 'refractory_lining',
        extraEnergyPerCellBp: 10000,
        groundTicks: 600,
        strutTicks: 840,
      })
      expect(checkedShotShape(full)).toBe(full)
    }))

  it('throws for strut ticks while no reinforcement provider answers for struts (ticket 379)', () =>
    withRegistrations([], () => {
      expect(() => checkedShotShape(shapeWith({ strutTicks: 600 }))).toThrow(
        /strutTicks is set, but no groundReinforcement provider answers with strutReinforces/,
      )
    }))

  it('throws for more lines than the cap, the aimed line counted', () => {
    expect(() => checkedShotShape(shapeWith({ lineOffsets: [-16, -8, 8, 16, 24] }))).toThrow(
      /lineOffsets holds 5 lines past the aimed one, the cap is 4/,
    )
  })

  it('throws for more seam turns than the cap', () => {
    expect(() => checkedShotShape(shapeWith({ seamTurns: 5 }))).toThrow(/seamTurns is 5/)
  })

  it('throws for a field that is not a whole number', () => {
    const notWhole: Partial<ShotShape>[] = [
      { lineOffsets: [8.5] },
      { seamTurns: 1.5 },
      { extraEnergyPerCellBp: 0.25 },
      { extraEnergyPerCellBp: -1 },
      { groundTicks: 600.5 },
      { strutTicks: -600 },
    ]
    for (const fields of notWhole) {
      expect(() => checkedShotShape(shapeWith(fields))).toThrow(RangeError)
    }
  })

  it('throws for a lining grade that is no casing_cement grade with a lining type', () => {
    expect(() => checkedShotShape(shapeWith({ liningGrade: 'casing_cement' }))).toThrow(
      /liningGrade casing_cement/,
    )
    expect(() => checkedShotShape(shapeWith({ liningGrade: 'standard_lining' }))).toThrow(
      RangeError,
    )
  })

  it("lays a grade's row in that grade's lining type", () => {
    expect(liningTypeOfGrade('refractory_lining')).toBe('refractory')
    expect(liningTypeOfGrade('standard_lining')).toBeNull()
  })

  it("throws from the kernel's read when the provider answers a shape over its caps", () => {
    const overCap: SliceDefinition = {
      id: 'probe',
      register(r) {
        r.boreGun({
          id: 'probe.bore-gun',
          boreGunOf: () => BORE_STATS,
          shotShapeOf: () => shapeWith({ seamTurns: 9 }),
        })
      },
    }
    withRegistrations([overCap], () => {
      const session = createScriptedSession()
      expect(() => shotShapeOf(session.state(), 'p1')).toThrow(RangeError)
    })
  })
})

describe("shot shape: the fold of one gun's modules (ticket 377)", () => {
  it('folds no module to no shape', () => {
    expect(foldShotShapes([])).toBeNull()
  })

  it('unions the line offsets, without repeats, in sorted order', () => {
    const folded = foldShotShapes([
      shapeWith({ lineOffsets: [8, -8] }),
      shapeWith({ lineOffsets: [-8, 16] }),
    ])
    expect(folded?.lineOffsets).toEqual([-8, 8, 16])
  })

  it('takes the largest turns, extra energy and ticks, never their sum', () => {
    const folded = foldShotShapes([
      shapeWith({ seamTurns: 1, extraEnergyPerCellBp: 10000, groundTicks: 600 }),
      shapeWith({ seamTurns: 3, extraEnergyPerCellBp: 5000, strutTicks: 840 }),
    ])
    expect(folded).toMatchObject({
      seamTurns: 3,
      extraEnergyPerCellBp: 10000,
      groundTicks: 600,
      strutTicks: 840,
    })
  })

  it('keeps a tick field null when no module sets it', () => {
    expect(foldShotShapes([ONE_LINE, ONE_LINE])).toEqual(ONE_LINE)
  })

  it('takes the highest casing_cement grade any module lines in', () => {
    const folded = foldShotShapes([
      shapeWith({ liningGrade: 'insulated_lining' }),
      shapeWith({ liningGrade: 'refractory_lining' }),
      ONE_LINE,
    ])
    expect(folded?.liningGrade).toBe('insulated_lining')
  })
})
