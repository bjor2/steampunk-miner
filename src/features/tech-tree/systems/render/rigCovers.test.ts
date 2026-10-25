import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../../scene/shippedArt'
import type { PartSwapRequest } from '../../../../systems/registries/partMotionRequests'
import { coveredItemIdsOf } from '../../../../systems/render/swapCovers'
import {
  EMPTY_LOADOUT,
  withItemsOwned,
  withSlotItem,
  type VehicleLoadout,
} from '../../../../systems/vehicle/loadoutState'
import { isVehicleItemId, type LoadoutSlotId } from '../../../../systems/registries/vehicleLoadout'
import { lookFrameAt, partSwapsOf, SHIPPED_RIG_LOOKS, type RigLookFrame } from '../../../rig-look'
import type { ForkChoices } from '../forkNode'
import { FORK_PIECES } from './forkPieces'
import {
  COVERED_GEAR_IDS,
  isDrawnOnce,
  itemDrawsOf,
  rigCoverProblemsOf,
  RigCoverError,
  readCoveredGearIds,
  uncoveredItemsOf,
} from './rigCovers'
import {
  mountItemIdsOf,
  rigItemsWithForksOf,
  rigMountsOf,
  rigSidecarOf,
  type RigMount,
} from './rigGear'
import { MOUNTED_GEAR, type MountedGear } from './techGear'
import type { MountedItem } from './techGearQuads'

const VEHICLE = rigSidecarOf(SHIPPED_ART)!

const TWIN_BIT = 'gear.twin_bit'
const CUTTERS = 'gear.side_cutters'
const BOOM = 'gear.reach_boom'

const NO_FORKS: ForkChoices = {}
const WIDE: ForkChoices = { 'drill-gear': 'wide' }

/** A drill-type look on the head as #623 will add it: its own part, standing for `covers`. */
function typeLookOf(track: string, partId: string, covers: readonly string[]): RigLookFrame {
  return {
    track,
    step: 1,
    partId,
    assetId: 'vehicle-look-drill-type',
    slot: 'drill.head',
    replacesSlot: 'drill-bit',
    covers,
    tint: '#c08040',
    glows: [0],
    finish: null,
    bandName: null,
  }
}

const TWIN_BIT_LOOK = typeLookOf(TWIN_BIT, 'twin-bit-head', [TWIN_BIT])
const CUTTERS_LOOK = typeLookOf(CUTTERS, 'cutter-yoke', [CUTTERS])
const BOOM_LOOK = typeLookOf(BOOM, 'boom-ram', [BOOM])

function loadoutOf(slots: Partial<Record<LoadoutSlotId, string>>): VehicleLoadout {
  const owned = withItemsOwned(EMPTY_LOADOUT, Object.values(slots))
  return Object.entries(slots).reduce(
    (loadout, [slot, itemId]) => withSlotItem(loadout, slot as LoadoutSlotId, itemId),
    owned,
  )
}

/** The rig's mounts with `covered`'s items stepped aside, as the vehicle piece draws them. */
function mountsOf(items: readonly MountedItem[], covered: readonly string[]): RigMount[] {
  return rigMountsOf(SHIPPED_ART, VEHICLE, uncoveredItemsOf(items, covered))
}

interface SettledRig {
  mounts: RigMount[]
  swaps: PartSwapRequest[]
}

/**
 * The rig as the scene settles it, step after step: the looks' swaps against what holds each
 * point, the covered art stepped aside, until the covered items stop changing.
 */
function settledRigOf(items: readonly MountedItem[], looks: readonly RigLookFrame[]): SettledRig {
  let covered: string[] = []
  for (let step = 0; step < 4; step++) {
    const swaps = partSwapsOf(looks, holdersOf(mountsOf(items, covered)))
    const next = coveredItemIdsOf(swaps)
    if (next.join() === covered.join()) return { mounts: mountsOf(items, covered), swaps }
    covered = next
  }
  throw new Error(`the rig never settles: ${covered.join(', ')}`)
}

function holdersOf(mounts: readonly RigMount[]) {
  return mounts.map((mount) => ({ attachId: mount.attachId, itemIds: mountItemIdsOf(mount) }))
}

function drawsOf(items: readonly MountedItem[], looks: readonly RigLookFrame[]) {
  const { mounts, swaps } = settledRigOf(items, looks)
  return itemDrawsOf(items, mounts, swaps)
}

function pointsOf(mounts: readonly RigMount[]): string[] {
  return mounts.map((mount) => `${mount.attachId} ${mount.assetId}`)
}

const DRILL_TYPE_SLOTS: Partial<Record<LoadoutSlotId, string>> = {
  'drill.head': TWIN_BIT,
  'drill.flank': CUTTERS,
  'drill.collar': BOOM,
}

const DRILL_TYPES = loadoutOf(DRILL_TYPE_SLOTS)

describe('rig gear covers (ticket 892)', () => {
  it('draws every mount as before while nothing is covered', () => {
    const items = rigItemsWithForksOf(DRILL_TYPES, WIDE)
    expect(mountsOf(items, [])).toEqual(rigMountsOf(SHIPPED_ART, VEHICLE, items))
    expect(uncoveredItemsOf(items, [])).toEqual(items)
  })

  it("skips every mount of a covered item, the Wide branch's hang of the cutters included", () => {
    const slotted = rigItemsWithForksOf(DRILL_TYPES, NO_FORKS)
    const wideOnly = rigItemsWithForksOf(EMPTY_LOADOUT, WIDE)
    expect(pointsOf(mountsOf(wideOnly, []))).toEqual(['drill.flank vehicle-item-gear-side-cutters'])
    expect(pointsOf(mountsOf(wideOnly, [CUTTERS]))).toEqual([])
    expect(pointsOf(mountsOf(slotted, [CUTTERS, BOOM]))).toEqual([
      'drill.head vehicle-item-gear-twin-bit',
    ])
  })

  it('brings the item art back byte-identical once the covering swap stops showing', () => {
    const items = rigItemsWithForksOf(DRILL_TYPES, WIDE)
    const before = JSON.stringify(mountsOf(items, []))
    mountsOf(items, [TWIN_BIT, CUTTERS, BOOM])
    expect(JSON.stringify(mountsOf(items, []))).toBe(before)
  })

  it('draws only the look on the drill head while the twin bit is equipped', () => {
    const { mounts, swaps } = settledRigOf(rigItemsWithForksOf(DRILL_TYPES, NO_FORKS), [
      TWIN_BIT_LOOK,
    ])
    expect(mounts.filter((mount) => mount.attachId === 'drill.head')).toEqual([])
    expect(swaps).toEqual([
      expect.objectContaining({ attach: 'drill.head', partIds: ['twin-bit-head'] }),
    ])
  })

  it('still yields the head to the twin bit for a look that does not cover it', () => {
    const tip = { ...TWIN_BIT_LOOK, track: 'drill_tip', covers: [] }
    const { mounts, swaps } = settledRigOf(rigItemsWithForksOf(DRILL_TYPES, NO_FORKS), [tip])
    expect(swaps).toEqual([])
    expect(pointsOf(mounts)).toContain('drill.head vehicle-item-gear-twin-bit')
  })

  it.each([
    ['twin bit', loadoutOf({ 'drill.head': TWIN_BIT }), NO_FORKS, TWIN_BIT_LOOK],
    ['side cutters', loadoutOf({ 'drill.flank': CUTTERS }), NO_FORKS, CUTTERS_LOOK],
    ['reach boom', loadoutOf({ 'drill.collar': BOOM }), NO_FORKS, BOOM_LOOK],
    ['the Wide branch', EMPTY_LOADOUT, WIDE, CUTTERS_LOOK],
    ['the cutters slotted on Wide', loadoutOf({ 'drill.flank': CUTTERS }), WIDE, CUTTERS_LOOK],
  ])('draws %s exactly once while its look covers it', (_, loadout, forks, look) => {
    const items = rigItemsWithForksOf(loadout, forks)
    const draws = drawsOf(items, [look])
    expect(draws.filter((each) => !isDrawnOnce(each))).toEqual([])
    expect(draws.find((each) => each.itemId === look.track)).toMatchObject({ art: [] })
  })

  it('draws each of the drill types once with every look showing', () => {
    const items = rigItemsWithForksOf(DRILL_TYPES, WIDE)
    const draws = drawsOf(items, [TWIN_BIT_LOOK, CUTTERS_LOOK, BOOM_LOOK])
    expect(draws.filter((each) => !isDrawnOnce(each))).toEqual([])
  })

  it('names a covered id with no techGear.json row, and refuses it when the covers load', () => {
    const [first] = SHIPPED_RIG_LOOKS.tracks
    const unknown = { ...first.rows, covers: [TWIN_BIT, 'gear.no_such_bit'] }
    expect(rigCoverProblemsOf([unknown], MOUNTED_GEAR)).toEqual([
      `${first.rows.track}: covers gear.no_such_bit, which has no techGear.json row`,
    ])
    expect(() => readCoveredGearIds([unknown], MOUNTED_GEAR)).toThrow(RigCoverError)
  })

  it('loads the shipped covers, every one a gear row', () => {
    expect(
      COVERED_GEAR_IDS.filter((itemId) => !MOUNTED_GEAR.some((g) => g.itemId === itemId)),
    ).toEqual([])
  })
})

/** Every lane's first dressed branch active: the most fork pieces the rig can hang. */
function everyFirstBranch(): ForkChoices {
  const choices: Record<string, string> = {}
  for (const piece of FORK_PIECES) choices[piece.lane] ??= piece.branch
  return choices
}

/**
 * The max loadout: every gear row owned, the drill types in their sockets, the first five
 * registered cradle housings in the five power-up slots, and every lane's first branch active.
 */
function maxLoadout(): VehicleLoadout {
  const housings = MOUNTED_GEAR.filter(isRegisteredHousing).slice(0, 5)
  const cradles = Object.fromEntries(housings.map((gear, at) => [`powerup.${at + 1}`, gear.itemId]))
  const slotted = loadoutOf({ ...cradles, ...DRILL_TYPE_SLOTS })
  return withItemsOwned(
    slotted,
    MOUNTED_GEAR.map((gear) => gear.itemId),
  )
}

function isRegisteredHousing(gear: MountedGear): boolean {
  return gear.kind === 'slot' && isVehicleItemId(gear.itemId)
}

/** Every shipped look at the largest count it reads: the most look parts the rig can show. */
function everyShippedLook(): RigLookFrame[] {
  return SHIPPED_RIG_LOOKS.tracks.map((frames) => lookFrameAt(frames, Number.MAX_SAFE_INTEGER))
}

function drawLineOf(draws: ReturnType<typeof itemDrawsOf>[number]): string {
  const by = [
    ...draws.art.map((name) => `art ${name}`),
    ...draws.looks.map((name) => `look ${name}`),
  ]
  return `${draws.itemId}: ${by.join(', ') || 'nothing'}`
}

describe('rig gear at the max loadout (ticket 892)', () => {
  const items = rigItemsWithForksOf(maxLoadout(), everyFirstBranch())

  it('draws every equipped item exactly once, by its art or by one look', () => {
    const draws = drawsOf(items, everyShippedLook())
    expect(draws.filter((each) => !isDrawnOnce(each)).map(drawLineOf)).toEqual([])
  })

  it('draws what the committed golden lists for each equipped item', async () => {
    const golden = `${drawsOf(items, everyShippedLook()).map(drawLineOf).join('\n')}\n`
    await expect(golden).toMatchFileSnapshot('./__goldens__/rigCoversMaxLoadout.golden.txt')
  })
})
