import { describe, expect, it } from 'vitest'
import { chargeTypes, DYNAMITE_LOOKS } from './chargeTypeLook'
import {
  DYNAMITE_LOOKS_FILE,
  dynamiteLookTableProblemsOf,
  readDynamiteLookTable,
  STICK_LUMA_STEP_MIN,
  type DynamiteLookTable,
} from './dynamiteLookTable'

// The per-upgrade look check's row for the blasting_charges line (ticket 809, D7 #866): one look
// row per charge type of the kernel ladder, each with its own stick colour, sparks and crater
// decal, readable in grey (ticket 830's luma rule), named in 3 words or fewer; and the Blast
// Casing (#862) and Blast Radius (#869) look rows beside them. A broken table is refused whole.

const TYPE_COUNT = chargeTypes().length

function tableWith(changes: Partial<DynamiteLookTable>): DynamiteLookTable {
  return { ...DYNAMITE_LOOKS, ...changes }
}

function withTypeRow(at: number, changes: object): DynamiteLookTable {
  const types = DYNAMITE_LOOKS.types.map((row, index) =>
    index === at ? { ...row, ...changes } : row,
  )
  return tableWith({ types })
}

describe('dynamite look rows (D7, ticket 866)', () => {
  it('has a look row for every charge type of the ladder, and passes every check', () => {
    expect(TYPE_COUNT).toBe(3)
    expect(DYNAMITE_LOOKS.types.map((row) => row.type)).toEqual(chargeTypes())
    expect(dynamiteLookTableProblemsOf(DYNAMITE_LOOKS_FILE, TYPE_COUNT)).toEqual([])
  })

  it('gives every type its own stick colour, sparks and crater decal', () => {
    const distinct = (key: 'stick' | 'spark' | 'crater' | 'soot') =>
      new Set(DYNAMITE_LOOKS.types.map((row) => row[key])).size
    expect([distinct('stick'), distinct('spark'), distinct('crater'), distinct('soot')]).toEqual([
      TYPE_COUNT,
      TYPE_COUNT,
      TYPE_COUNT,
      TYPE_COUNT,
    ])
  })

  it('refuses a ladder type with no row, and a row for a type the ladder lacks', () => {
    const missing = tableWith({ types: DYNAMITE_LOOKS.types.slice(0, 2) })
    expect(dynamiteLookTableProblemsOf(missing, TYPE_COUNT)).toEqual([
      'types list [1,2], the ladder has types [1,2,3]',
    ])
    expect(dynamiteLookTableProblemsOf(DYNAMITE_LOOKS, TYPE_COUNT + 1)).toHaveLength(1)
  })

  it('refuses two types whose sticks would match in grey', () => {
    const matched = withTypeRow(1, { stick: DYNAMITE_LOOKS.types[0].stick })
    expect(dynamiteLookTableProblemsOf(matched, TYPE_COUNT)).toEqual([
      `types 1 and 2: sticks under ${STICK_LUMA_STEP_MIN} apart in luma`,
    ])
  })

  it('refuses a long name, a colour that is not #rrggbb and a repeated crater part', () => {
    const broken = withTypeRow(2, {
      name: 'The very biggest charge',
      ring: 'blue',
      crater: DYNAMITE_LOOKS.types[0].crater,
    })
    expect(dynamiteLookTableProblemsOf(broken, TYPE_COUNT)).toEqual([
      'type 3: name is not 1 to 3 words',
      'type 3: ring is not #rrggbb',
      'crater part crater-1 is listed twice',
    ])
  })

  it('refuses fuse, casing and radius rows that cannot draw', () => {
    const broken = tableWith({
      fuse: { ...DYNAMITE_LOOKS.fuse, sparksPerSecond: 0 },
      casing: { ...DYNAMITE_LOOKS.casing, trimPart: DYNAMITE_LOOKS.casing.rimPart },
      radiusBands: { growPerBand: -1, growMax: 0.5 },
    })
    expect(dynamiteLookTableProblemsOf(broken, TYPE_COUNT)).toEqual([
      'fuse.sparksPerSecond is not a positive number',
      `casing part ${DYNAMITE_LOOKS.casing.rimPart} is listed twice`,
      'radiusBands.growPerBand is not positive',
      'radiusBands.growMax is under 1',
    ])
  })

  it('throws every problem at once when read', () => {
    expect(() => readDynamiteLookTable({ types: 'none' }, TYPE_COUNT)).toThrow(
      /types is not a list; fuse is not an object; casing is not an object; radiusBands/,
    )
  })
})
