import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { ArtCatalogue } from '../../../systems/art/artCatalogue'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { contentOf } from '../../../systems/registries/content'
import type { PartSwapRequest } from '../../../systems/registries/partMotionRequests'
import { isVehicleItemId } from '../../../systems/registries/vehicleLoadout'
import {
  hiddenSlotsOf,
  lookBodyQuadsOf,
  lookHeadQuadsOf,
} from '../../../systems/render/lookPartQuads'
import { drillHeadQuadsOf } from '../../../systems/render/vehicleLook'
import { TECH_LANES } from '../../tech-tree'
import { FORK_EQUIP, itemLookFrameAt, type RigItemLookFrames } from './render/rigItemLooks'
import { lookFrameAt, type RigLookFrame } from './render/rigLookFrames'
import { partSwapsOf } from './render/rigLookParts'
import { itemLookCountOf, type ActiveForkBranchRead } from './rigItemLookCounts'
import { SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'
import { RIG_LOOK_TABLE, readRigLookTable, RigLookTableError } from './rigLookTable'
import type { RigLookTable } from './rigLookTableChecks'

// The drill types on the rig (ticket 623; GD locks of 21 and 25 Oct on #623, TD rulings
// 6307937801 and 6402023994): each is a rig-look track keyed by its item id, reading n = 0 unless
// equipped and its owned Mark while it is; the first equipped one in row order takes the drill
// head over the drill tip's step, whose level look stays on as the tint on the type's parts.

const PLAYER = 'p1'
const TWIN_BIT = 'gear.twin_bit'
const REAMERS = 'gear.gallery_reamers'
const CROWN = 'gear.plunge_crown'
const CUTTERS = 'gear.side_cutters'
const BOOM = 'gear.reach_boom'
const CUTTERS_MARK_2 = 'gear.side_cutters_mark_2'
/** The precedence on the drill head, pinned (GD lock of 25 Oct): new types go in by row. */
const PRECEDENCE = [TWIN_BIT, REAMERS, CROWN, CUTTERS, BOOM]
const DRILL_TYPE_ASSET = 'vehicle-look-drill-type'
const HEAD = 'drill.head'
const DRILL_TIP_FRAMES = trackLookFramesOf(SHIPPED_RIG_LOOKS, 'drill_tip')!

type Forks = Readonly<Record<string, string>>

function framesOf(track: string): RigItemLookFrames {
  return SHIPPED_RIG_LOOKS.items.find((frames) => frames.rows.track === track)!
}

function forkReadOf(forks: Forks): ActiveForkBranchRead {
  return (_state, _playerId, lane) => forks[lane] ?? null
}

/** A rig with `slots` filled and `owned` bought, through the loadout's debug command. */
function rigWith(slots: Record<string, string>, owned: readonly string[] = []): AuthorityState {
  const session = createScriptedSession()
  session.submit(1, setVehicleLoadoutCommand(slots, [...Object.values(slots), ...owned]))
  return session.state()
}

function countsOf(state: AuthorityState, forks: Forks = {}): Record<string, number> {
  const read = forkReadOf(forks)
  return Object.fromEntries(
    SHIPPED_RIG_LOOKS.items.map((frames) => [
      frames.rows.track,
      itemLookCountOf(frames.rows, state, PLAYER, read),
    ]),
  )
}

/** Each type's frame at `n`, in row order, then the drill tip at `drillN`: the scene's order. */
function ownedFrames(counts: Readonly<Record<string, number>>, drillN: number): RigLookFrame[] {
  return [
    ...SHIPPED_RIG_LOOKS.items.map((frames) =>
      itemLookFrameAt(frames, counts[frames.rows.track] ?? 0),
    ),
    lookFrameAt(DRILL_TIP_FRAMES, drillN),
  ]
}

function headSwapsOf(owned: readonly RigLookFrame[]): PartSwapRequest[] {
  return partSwapsOf(owned, []).filter((swap) => swap.attach === HEAD)
}

function swapOfType(track: string, n = 1): PartSwapRequest {
  const [swap] = partSwapsOf([itemLookFrameAt(framesOf(track), n)], [])
  return swap
}

function withoutAsset(art: ArtCatalogue, assetId: string): ArtCatalogue {
  return {
    manifest: { assets: art.manifest.assets.filter((entry) => entry.id !== assetId) },
    placeholderSidecars: art.placeholderSidecars.filter((sidecar) => sidecar.assetId !== assetId),
    exportedSidecars: art.exportedSidecars.filter((sidecar) => sidecar.assetId !== assetId),
  }
}

function pairsOf<T>(items: readonly T[]): [T, T][] {
  return items.flatMap((first, at) => items.slice(at + 1).map((second): [T, T] => [first, second]))
}

describe('drill type looks: what n each type reads (ticket 623)', () => {
  it('reads 0 for every type on a new rig, so nothing unowned is ever previewed', () => {
    const counts = countsOf(createScriptedSession().state())
    expect(Object.values(counts)).toEqual(PRECEDENCE.map(() => 0))
    expect(headSwapsOf(ownedFrames(counts, 0))).toEqual([])
  })

  it('reads 1 for a slotted one-off in any slot and 0 while it is only owned', () => {
    expect(countsOf(rigWith({ 'drill.head': TWIN_BIT }))[TWIN_BIT]).toBe(1)
    expect(countsOf(rigWith({ 'drill.collar': BOOM }))[BOOM]).toBe(1)
    expect(countsOf(rigWith({}, [TWIN_BIT, BOOM]))).toMatchObject({ [TWIN_BIT]: 0, [BOOM]: 0 })
  })

  it("reads the side cutters' owned Mark while they are slotted, 0 once they are not", () => {
    expect(countsOf(rigWith({ 'drill.flank': CUTTERS }))[CUTTERS]).toBe(1)
    expect(countsOf(rigWith({ 'drill.flank': CUTTERS }, [CUTTERS_MARK_2]))[CUTTERS]).toBe(2)
    expect(countsOf(rigWith({}, [CUTTERS, CUTTERS_MARK_2]))[CUTTERS]).toBe(0)
  })

  it('reads a fork type as 1 while its branch is active, whatever the loadout holds', () => {
    const state = createScriptedSession().state()
    expect(countsOf(state, { 'drill-gear': 'wide' })).toMatchObject({ [REAMERS]: 1, [CROWN]: 0 })
    expect(countsOf(state, { 'drill-gear': 'deep' })).toMatchObject({ [REAMERS]: 0, [CROWN]: 1 })
  })
})

describe('drill type looks: what each type shows (ticket 623)', () => {
  it("swaps each type's own parts onto the drill head from the drill type asset, hiding the bit", () => {
    for (const track of PRECEDENCE) {
      expect(swapOfType(track)).toMatchObject({
        attach: HEAD,
        assetId: DRILL_TYPE_ASSET,
        replacesSlot: 'drill-bit',
      })
    }
    const looks = [...PRECEDENCE.map((track) => swapOfType(track)), swapOfType(CUTTERS, 2)]
    const partSets = looks.map((swap) => swap.partIds.join('+'))
    expect(new Set(partSets).size).toBe(looks.length)
  })

  it('covers only the art of the item a slotted type stands for, and a fork type covers none', () => {
    const coversOf = (track: string) => swapOfType(track).covers ?? []
    expect(PRECEDENCE.map(coversOf)).toEqual([[TWIN_BIT], [], [], [CUTTERS], [BOOM]])
  })

  it("shows the cutters' Mark 2 head from Mark 2 on, the same three parts at Mark 101 and 1e6", () => {
    const frames = framesOf(CUTTERS)
    const [mark1, mark2, mark101, mark1e6] = [1, 2, 101, 1_000_000].map((n) =>
      itemLookFrameAt(frames, n),
    )
    expect(mark1.partIds).toEqual(['cutter-yoke-1', 'cutter-arm-up-1', 'cutter-arm-down-1'])
    expect(mark2.partIds).toEqual(['cutter-yoke-2', 'cutter-arm-up-2', 'cutter-arm-down-2'])
    expect(mark101).toBe(mark2)
    expect(mark1e6).toBe(mark2)
  })

  it('answers each one-off as a pure function of n, the same look at 1, 101 and 1e6', () => {
    for (const track of [TWIN_BIT, REAMERS, CROWN, BOOM]) {
      const frames = framesOf(track)
      const looks = [1, 101, 1_000_000].map((n) => itemLookFrameAt(frames, n))
      expect(new Set(looks).size).toBe(1)
      expect(itemLookFrameAt(frames, 0)).toBe(frames.base)
    }
  })

  it('draws every type on the drill head, so it turns with the head, never on the body', () => {
    for (const track of PRECEDENCE) {
      const looks = [swapOfType(track)]
      const drawn = lookHeadQuadsOf(SHIPPED_ART, looks).map((look) => look.quad.partId)
      expect(drawn.sort()).toEqual([...looks[0].partIds].sort())
      expect(lookBodyQuadsOf(SHIPPED_ART, looks)).toEqual([])
      expect(hiddenSlotsOf(SHIPPED_ART, looks)).toEqual(['drill-bit'])
    }
  })

  it('brings the rig bit back byte-identical once the type is unequipped', () => {
    for (const tier of [1, 2, 3]) {
      const bare = JSON.stringify(drillHeadQuadsOf(SHIPPED_ART, tier))
      const unequipped = partSwapsOf(ownedFrames({}, 0), [])
      const fitted = drillHeadQuadsOf(SHIPPED_ART, tier, [], [swapOfType(TWIN_BIT)])
      expect(JSON.stringify(fitted)).not.toBe(bare)
      expect(JSON.stringify(drillHeadQuadsOf(SHIPPED_ART, tier, [], unequipped))).toBe(bare)
    }
  })

  it('falls back to the base head when the asset is missing at run time', () => {
    const art = withoutAsset(SHIPPED_ART, DRILL_TYPE_ASSET)
    const looks = [swapOfType(CUTTERS, 2)]
    expect(lookHeadQuadsOf(art, looks)).toEqual([])
    expect(hiddenSlotsOf(art, looks)).toEqual([])
    expect(JSON.stringify(drillHeadQuadsOf(art, 1, [], looks))).toBe(
      JSON.stringify(drillHeadQuadsOf(art, 1)),
    )
  })
})

describe('drill type looks: who takes the drill head (ticket 623)', () => {
  it('pins the precedence on the drill head to rigLook.json row order', () => {
    expect((RIG_LOOK_TABLE.itemTracks ?? []).map((rows) => rows.track)).toEqual(PRECEDENCE)
    expect(RIG_LOOK_TABLE.sharedSlots).toEqual([HEAD])
  })

  it.each(pairsOf(PRECEDENCE))(
    'gives the head to %s over %s, which swaps nothing',
    (first, second) => {
      const swaps = headSwapsOf(ownedFrames({ [first]: 1, [second]: 1 }, 101))
      expect(swaps).toEqual([swapOfType(first)])
    },
  )

  it.each(PRECEDENCE)(
    "takes the head over the drill tip's step for %s, the tip's tint changing on its parts at drill n = 1, 101 and a wrap",
    (track) => {
      const tipFrames = DRILL_TIP_FRAMES
      const top = tipFrames.rows.steps[tipFrames.rows.steps.length - 1].from
      const firstFinish = top + tipFrames.rows.band.step
      const wrap = firstFinish + tipFrames.lap.length * tipFrames.rows.band.step
      for (const n of [1, 101, firstFinish, wrap]) {
        expect(headSwapsOf(ownedFrames({ [track]: 1 }, n))).toEqual([swapOfType(track)])
      }
      const tints = [1, 101, wrap].map((n) => lookFrameAt(tipFrames, n).tint)
      expect(tints[0]).toBeNull()
      expect(new Set(tints).size).toBe(3)
      expect(lookFrameAt(tipFrames, wrap)).toBe(lookFrameAt(tipFrames, firstFinish))
      expect(tipFrames.rows.glowSlots[0]).toEqual(
        expect.arrayContaining([...swapOfType(track).partIds]),
      )
    },
  )

  it("shows the drill tip's own step again once no type is equipped", () => {
    const [swap] = headSwapsOf(ownedFrames({}, 101))
    expect(swap).toMatchObject({ assetId: 'vehicle-look-drill-tip', partIds: ['steel-cone'] })
  })

  it("yields the head to any other item's art on it, as every look does", () => {
    const owned = ownedFrames({ [REAMERS]: 1 }, 0)
    expect(partSwapsOf(owned, [{ attachId: HEAD, itemIds: [TWIN_BIT] }])).toEqual([])
  })
})

/** A table with `itemTracks` swapped for the twin bit's row merged with `row`. */
function tableWithItem(row: Record<string, unknown>, extra: Partial<RigLookTable> = {}) {
  const [twinBit, ...others] = RIG_LOOK_TABLE.itemTracks ?? []
  return { ...RIG_LOOK_TABLE, itemTracks: [{ ...twinBit, ...row }, ...others], ...extra }
}

function problemsOfItem(row: Record<string, unknown>, extra: Partial<RigLookTable> = {}): string {
  try {
    readRigLookTable(tableWithItem(row, extra) as RigLookTable)
    return ''
  } catch (error) {
    if (!(error instanceof RigLookTableError)) throw error
    return error.problems.join('; ')
  }
}

describe('drill type looks: the table loads only sound item tracks (ticket 623)', () => {
  it('loads the shipped item tracks', () => {
    expect(problemsOfItem({})).toBe('')
  })

  it.each([
    ['an id that is not an item id', { track: 'twin_bit' }, 'twin_bit: item id has no category'],
    ['an upgrade track', { track: 'drill_tip' }, 'item id has no category'],
    ['an id taken twice', { track: REAMERS }, `${REAMERS}: has more than one row block`],
    ['an unknown equip', { equip: { kind: 'held' } }, 'equip held is not slotted or fork'],
    [
      'a fork with no branch',
      { equip: { kind: FORK_EQUIP, lane: 'drill-gear' } },
      'needs its lane and branch',
    ],
    [
      'a Mark that does not rise',
      { marks: [{ mark: 1, itemId: CUTTERS_MARK_2 }] },
      'does not rise from 2',
    ],
    [
      'a first step past 1',
      { steps: [{ from: 2, parts: ['twin-bit-head'], asset: DRILL_TYPE_ASSET }] },
      'the first step is not from 1',
    ],
    [
      'a part its asset lacks',
      { steps: [{ from: 1, parts: ['no-such-head'], asset: DRILL_TYPE_ASSET }] },
      'part no-such-head is not a part of',
    ],
    [
      'an asset that is not a look asset',
      { steps: [{ from: 1, parts: ['twin-bit-head'], asset: 'vehicle' }] },
      'asset vehicle is not a look asset',
    ],
    [
      'a point another track owns alone',
      { slot: 'hull.boiler', replaces: undefined },
      "slot hull.boiler is another track's",
    ],
    ['a module point', { slot: 'hull.nose' }, 'is a module or wagon point'],
    ['an unknown covered id', { covers: ['twin_bit'] }, 'covers twin_bit, which is not an item id'],
  ])('refuses %s', (_, row, problem) => {
    expect(problemsOfItem(row)).toContain(problem)
  })

  it('refuses a second claim on the drill head once it is no longer declared shared', () => {
    expect(problemsOfItem({}, { sharedSlots: [] })).toContain(`slot ${HEAD} is another track's`)
  })

  it('refuses a declared shared point that fewer than two tracks claim', () => {
    expect(problemsOfItem({}, { sharedSlots: [HEAD, 'hull.cargo'] })).toContain(
      'shared slot hull.cargo is claimed by 1 tracks',
    )
  })
})

describe('drill type looks: the shipped ids name real gear (ticket 623)', () => {
  const items = RIG_LOOK_TABLE.itemTracks ?? []

  it('names a sold vehicle item for every slotted type and every later Mark', () => {
    const slotted = items.filter((rows) => rows.equip.kind !== FORK_EQUIP)
    const ids = [
      ...slotted.map((rows) => rows.track),
      ...items.flatMap((rows) => rows.marks ?? []).map((m) => m.itemId),
    ]
    expect(ids.filter((itemId) => !isVehicleItemId(itemId))).toEqual([])
  })

  it('names a registered fork branch that unlocks the track for every fork type', () => {
    const branches = contentOf('tech-node').map(
      (node) => node as { unlocks: unknown; lane: string; branch?: string },
    )
    for (const rows of items.filter((each) => each.equip.kind === FORK_EQUIP)) {
      expect(TECH_LANES as readonly string[]).toContain(rows.equip.lane)
      const branch = branches.find(
        (node) => node.lane === rows.equip.lane && node.branch === rows.equip.branch,
      )
      expect(branch?.unlocks).toBe(rows.track)
    }
  })
})
