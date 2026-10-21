import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { exportedSidecarOf, manifestEntryOf } from '../../../systems/art/artCatalogue'
import { slotItemAssetIdOf } from '../../../systems/art/artIds'
import type { SliceRegistrar } from '../../../registries/sliceDefinition'
import { contentOf } from '../../../systems/registries/content'
import { isArmouryLane } from '../../tech-tree'
import { slice } from '../register'
import { createTrackLookFrames, lookFrameAt } from './render/rigLookFrames'
import type { TrackLookRows } from './render/rigLookIndex'
import { partSwapsOf } from './render/rigLookParts'
import { RIG_LOOK_TABLE } from './rigLookTable'

/** The part a Mastered module adds (#310); every module has it, so it is never its own part. */
const GILDED_PLATE = 'gilded-plate'
const VEHICLE_ASSET = 'vehicle'

/** The registrations that would carry state, a codex page or a schedule row (FeatureUnlocked). */
const STATEFUL_REGISTRATIONS = [
  'content',
  'saveSection',
  'discovery',
  'discoveryKind',
  'discoveryAliases',
  'commandRules',
  'authorityReaction',
  'eventProjections',
  'runEvents',
]

/** Every item the Armoury lanes' nodes unlock: the ground-gun items. */
function groundGunItemIds(): string[] {
  return contentOf('tech-node')
    .filter((node) => isArmouryLane(node.lane))
    .map((node) => node.unlocks)
}

function partsOf(assetId: string) {
  return exportedSidecarOf(SHIPPED_ART, assetId)?.parts ?? []
}

/** The item's own parts on its asset, the Mastered plate aside. */
function ownPartIdsOf(itemId: string): string[] {
  return partsOf(slotItemAssetIdOf(itemId))
    .map((part) => part.id)
    .filter((partId) => partId !== GILDED_PLATE)
    .sort()
}

/** The draw order of every part a rig look step swaps in, over every track of the table. */
function lookPartDrawOrders(): number[] {
  return RIG_LOOK_TABLE.tracks.flatMap((rows) =>
    rows.steps.flatMap((step) => {
      if (step.part === null) return []
      const parts = partsOf(step.asset ?? VEHICLE_ASSET)
      return parts.filter((part) => part.id === step.part).map((part) => part.z)
    }),
  )
}

function itemPartDrawOrders(): number[] {
  return groundGunItemIds().flatMap((itemId) =>
    partsOf(slotItemAssetIdOf(itemId))
      .filter((part) => part.id !== GILDED_PLATE)
      .map((part) => part.z),
  )
}

/** A look track on `slot` whose first purchase swaps a part in. */
function lookOn(slot: string) {
  const rows: TrackLookRows = {
    track: 'combat',
    slot,
    glowSlots: [['turret']],
    glowCap: 'rigBody',
    steps: [{ from: 1, part: 'pintle-mount', card: null, colour: '#000003', glows: [0] }],
    tail: { delta: 1, palette: ['#000001', '#000002'], plating: ['a', 'b'], glow: [[0], [0]] },
  }
  return lookFrameAt(createTrackLookFrames(rows), 1)
}

/** The names of every registration the rig look slice makes. */
function rigLookRegistrations(): string[] {
  const names: string[] = []
  const recorder = new Proxy({} as SliceRegistrar, {
    get: (_, name) => () => names.push(String(name)),
  })
  slice.register(recorder)
  return names
}

describe('rig look: ground-gun item parts (ticket 589)', () => {
  it('gives each of the sixteen Armoury items its own final asset named from the item', () => {
    const itemIds = groundGunItemIds()
    expect(itemIds).toHaveLength(16)
    const assetIds = itemIds.map(slotItemAssetIdOf)
    expect(new Set(assetIds).size).toBe(itemIds.length)
    for (const assetId of assetIds) {
      expect(manifestEntryOf(SHIPPED_ART, assetId)?.status, assetId).toBe('final')
    }
  })

  it('shows a part of its own on every item besides the Mastered plate, no two items alike', () => {
    const partSets = groundGunItemIds().map((itemId) => ownPartIdsOf(itemId).join('+'))
    expect(partSets.filter((parts) => parts === '')).toEqual([])
    expect(new Set(partSets).size).toBe(partSets.length)
  })

  it('names no item in the look table, so an item keeps its own name and gets no step line', () => {
    const itemIds = groundGunItemIds()
    const named = RIG_LOOK_TABLE.tracks.filter((rows) => itemIds.includes(rows.track))
    expect(named).toEqual([])
  })

  it('draws every look part under every item part, so a fitted module shows where they meet', () => {
    const lookOrders = lookPartDrawOrders()
    expect(lookOrders.length).toBeGreaterThan(0)
    expect(Math.max(...lookOrders)).toBeLessThan(Math.min(...itemPartDrawOrders()))
  })

  it("yields the turret's point to a fitted module, and swaps the look in while none is", () => {
    const look = lookOn('hull.turret')
    expect(partSwapsOf([look], ['hull.turret'])).toEqual([])
    expect(partSwapsOf([look], [])).toHaveLength(1)
  })

  it('keeps every shipped look off the points the guns and their modules ride', () => {
    const slots = RIG_LOOK_TABLE.tracks.map((rows) => rows.slot)
    expect(slots).not.toContain('hull.front')
    expect(slots).not.toContain('hull.turret')
  })

  it('registers no save section, content, codex page, command or event', () => {
    const names = rigLookRegistrations()
    expect(names).toContain('vehicleLook')
    expect(names.filter((name) => STATEFUL_REGISTRATIONS.includes(name))).toEqual([])
  })
})
