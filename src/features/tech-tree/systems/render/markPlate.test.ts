import { describe, expect, it } from 'vitest'
import { lastMarkOf } from '../markLadder'
import { markBearerOfItem, registeredTechTree } from '../techTree'
import { GEAR_ART, GEAR_PART_SIDE_M, vehicleWithPoints } from './gearArtFixture'
import {
  actingMarksOf,
  cradleMarksOf,
  markPlatesOf,
  type CradleMark,
  type MarkPlate,
} from './markPlate'
import { rigMountsOf } from './rigGear'
import type { MountedItem } from './techGearQuads'

// The loaded mobility lane registers the shield and winch with their Mark ladders; the fixture's
// housings are 0.2 m squares centred on their point.
const vehicle = vehicleWithPoints([
  { id: 'hull.powerup.1', atM: [-0.3, -0.02], z: 6 },
  { id: 'hull.powerup.2', atM: [-0.15, -0.02], z: 6 },
  { id: 'hull.arm.right', atM: [0.36, -0.12], z: 6 },
])
const SHIELD: MountedItem = { itemId: 'power.steam_shield', slot: 'powerup.1' }
const WINCH: MountedItem = { itemId: 'power.grapple_winch', slot: 'powerup.2' }

function platesAt(items: readonly MountedItem[], mark: number) {
  const marks = cradleMarksOf(items, registeredTechTree(), () => mark)
  return markPlatesOf(vehicle, rigMountsOf(GEAR_ART, vehicle, items), marks)
}

function lastMarkOfItem(itemId: string): number {
  const bearer = markBearerOfItem(registeredTechTree(), itemId)
  return bearer === null ? 0 : lastMarkOf(bearer.ladder)
}

describe('mark plate', () => {
  it('shows each item at its highest researched Mark, and one researched none of at Mark 1 (#249)', () => {
    const unlocks = [
      { itemId: SHIELD.itemId, mark: 4 },
      { itemId: 'power.steam_boost', mark: 2 },
    ]
    expect(actingMarksOf([SHIELD, WINCH], unlocks)).toEqual({
      [SHIELD.itemId]: 4,
      [WINCH.itemId]: 1,
    })
  })

  it('hangs a brass plate with one rivet flush under the housing of a cradled item at Mark 1', () => {
    const [plate] = platesAt([SHIELD], 1)
    const housingBottom = -0.02 - GEAR_PART_SIDE_M / 2
    expect(plate?.isGilded).toBe(false)
    expect(plate?.rivets).toHaveLength(1)
    expect(plate?.centre[0]).toBeCloseTo(-0.3)
    expect((plate?.centre[1] ?? 0) + (plate?.size[1] ?? 0) / 2).toBeCloseTo(housingBottom)
  })

  it('steps up a rivet every Mark and a row every fifth Mark', () => {
    const [atOne] = platesAt([SHIELD], 1)
    const [atFive] = platesAt([SHIELD], 5)
    const [atSix] = platesAt([SHIELD], 6)
    expect(atFive?.rivets).toHaveLength(5)
    expect(atSix?.rivets).toHaveLength(6)
    expect(atFive?.size[1]).toBeCloseTo(atOne?.size[1] ?? 0)
    expect(atSix?.size[1]).toBeGreaterThan(atFive?.size[1] ?? 0)
  })

  it('gilds the plate once the item is Mastered, and not a Mark before', () => {
    const mastered = lastMarkOfItem(SHIELD.itemId)
    expect(platesAt([SHIELD], mastered)[0]?.isGilded).toBe(true)
    expect(platesAt([SHIELD], mastered - 1)[0]?.isGilded).toBe(false)
  })

  it('hangs the plate at the bare cradle point for an item drawn elsewhere, like the winch on its arm', () => {
    const [plate] = platesAt([WINCH], 1)
    expect(plate?.slot).toBe('powerup.2')
    expect(plate?.centre[0]).toBeCloseTo(-0.15)
    expect((plate?.centre[1] ?? 0) + (plate?.size[1] ?? 0) / 2).toBeCloseTo(-0.02)
  })

  it('gives no plate to an item outside a cradle or one with no Marks', () => {
    const marks: CradleMark[] = cradleMarksOf(
      [
        { itemId: 'power.steam_shield', slot: null },
        { itemId: 'slot.powerup_3', slot: 'powerup.3' },
        { itemId: 'power.grapple_winch', slot: 'drill.head' },
      ],
      registeredTechTree(),
      () => 1,
    )
    expect(marks).toEqual([])
  })
})

describe('mark plate: milestone studs (ticket 277)', () => {
  it('sets a gilt stud over the rivet of each milestone reached, so the plate steps at Marks 3, 6 and 9', () => {
    expect(platesAt([SHIELD], 2)[0]?.studs).toEqual([])
    const [atThree] = platesAt([SHIELD], 3)
    expect(atThree?.milestoneMarks).toEqual([3])
    expect(atThree?.studs).toEqual([atThree?.rivets[2]])
    expect(platesAt([SHIELD], 5)[0]?.studs).toHaveLength(1)
    const [atNine] = platesAt([SHIELD], 9)
    expect(atNine?.milestoneMarks).toEqual([3, 6, 9])
    expect(atNine?.studs).toEqual([atNine?.rivets[2], atNine?.rivets[5], atNine?.rivets[8]])
    expect(atNine?.rivets).toHaveLength(9)
  })

  it('gives a plate no stud when its item reached no milestone, whatever its Mark', () => {
    const unreached: CradleMark = {
      itemId: 'power.steam_shield',
      slot: 'powerup.1',
      mark: 9,
      isGilded: false,
      milestoneMarks: [],
    }
    const [plate] = markPlatesOf(vehicle, [], [unreached])
    expect(plate?.rivets).toHaveLength(9)
    expect(plate?.studs).toEqual([])
  })
})

describe('mark plate: pips and finish bands past the milestones (ticket 884)', () => {
  const ECHO: MountedItem = { itemId: 'power.echo_sounder', slot: 'powerup.1' }
  /** The marks the GD lock pins the Echo Sounder plate at. */
  const GOLDEN_MARKS = [0, 1, 3, 10, 18, 1_000_000]

  /** Everything a plate draws that a Mark can change, as one line. */
  function plateLineOf(plate: MarkPlate | undefined): string {
    if (plate === undefined) return 'no plate'
    const { mark, isGilded, rivets, studs, pips, band, finish, size } = plate
    const gilded = isGilded ? ' gilded' : ''
    return `M${mark}: rivets ${rivets.length} studs ${studs.length} pips ${pips.length} band ${band} finish ${finish?.name ?? 'brass'} height ${size[1].toFixed(3)}${gilded}`
  }

  const echoLineAt = (mark: number) => plateLineOf(platesAt([ECHO], mark)[0])

  it('keeps the stud over each milestone rivet and stops the rivets at Mark 9', () => {
    const [atEighteen] = platesAt([SHIELD], 18)
    expect(atEighteen?.rivets).toHaveLength(9)
    expect(atEighteen?.studs).toEqual([
      atEighteen?.rivets[2],
      atEighteen?.rivets[5],
      atEighteen?.rivets[8],
    ])
    expect(platesAt([SHIELD], 1_000_000)[0]?.size).toEqual(atEighteen?.size)
  })

  it('draws the pips centred in their own row under the rivets, inside the plate', () => {
    const [plate] = platesAt([SHIELD], 11)
    const bottom = -(plate?.size[1] ?? 0) / 2
    const lowestRivet = Math.min(...(plate?.rivets ?? []).map(([, y]) => y))
    expect(plate?.pips).toHaveLength(2)
    for (const [x, y] of plate?.pips ?? []) {
      expect(y).toBeLessThan(lowestRivet)
      expect(y).toBeGreaterThan(bottom)
      expect(Math.abs(x)).toBeLessThan((plate?.size[0] ?? 0) / 2)
    }
    expect((plate?.pips[0]?.[0] ?? 0) + (plate?.pips[1]?.[0] ?? 0)).toBeCloseTo(0)
  })

  it('wears the committed Echo Sounder plate at Marks 0, 1, 3, 10, 18 and a million', async () => {
    const golden = `${GOLDEN_MARKS.map(echoLineAt).join('\n')}\n`
    await expect(golden).toMatchFileSnapshot('./__goldens__/markPlateEchoSounder.golden.txt')
  })

  it('never draws two neighbouring Marks of the Echo Sounder alike, to Mark 60 and around a million', () => {
    const runs = [
      Array.from({ length: 61 }, (_, at) => at),
      Array.from({ length: 30 }, (_, at) => 999_985 + at),
    ]
    const alike = runs.flatMap((marks) =>
      marks.slice(1).filter((mark) => echoLineAt(mark - 1) === echoLineAt(mark)),
    )
    expect(alike).toEqual([])
  })
})
