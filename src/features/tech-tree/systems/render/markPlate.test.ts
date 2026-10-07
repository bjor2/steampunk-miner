import { describe, expect, it } from 'vitest'
import { lastMarkOf } from '../markLadder'
import { markBearerOfItem, registeredTechTree } from '../techTree'
import { GEAR_ART, GEAR_PART_SIDE_M, vehicleWithPoints } from './gearArtFixture'
import { actingMarksOf, cradleMarksOf, markPlatesOf, type CradleMark } from './markPlate'
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
    const [atFive] = platesAt([SHIELD], 5)
    const [atSix] = platesAt([SHIELD], 6)
    expect(atFive?.rivets).toHaveLength(5)
    expect(atSix?.rivets).toHaveLength(6)
    expect(atSix?.size[1]).toBeCloseTo(2 * (atFive?.size[1] ?? 0))
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
