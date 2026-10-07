import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentIconIds, contentOf, type ContentIconUse } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import type { TechNode } from '../tech-tree'
import { isUnlocked, LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import { MAGNET_ITEM_CARDS } from './systems/magnetCards'
import { LODESTONE_BEACON_NODE_ID, MAGNET_ITEMS, magnetVehicleItemOf } from './systems/magnetItems'
import { techNodeOf, terrainItemOf } from './systems/terrainItems'

// The terrain magnets' guard (GD lock on #246, Horizontal Scaler; ticket 282): the family enters
// at P25 with the magnetic planet, never as a tease at P24. Ticket 289 shipped `magnetic_planets`
// (spec #258 Q4) and released the vision-row pin: the effect builds may now register the family,
// and it shows from P25. Ticket 300 registers the two nodes, rooted at the beacon's, which stays
// the attract member exactly as #202 ships it.

const PLAYER = 'p1'

const MAGNETIC_PLANETS_ROW = 'magnetic_planets'

const FAMILY_ENTRY_PLANET = 25

const FAMILY_IDS = MAGNET_ITEMS.flatMap((item) => [item.itemId, item.node.id, item.iconId])

const ITEM_IDS = MAGNET_ITEMS.map((item) => item.itemId)

const BEACON_ITEM_ID = 'consumable.lodestone_beacon'

const mentionsTheFamily = (value: unknown) =>
  FAMILY_IDS.some((id) => JSON.stringify(value).includes(id))

/** A node shows in the tree from its unlock planet, so one later than `lastPlanet` is no trace. */
const isNodeOnOrBefore = (lastPlanet: number) => (node: TechNode) => node.unlockTier <= lastPlanet

/** A node's icon shows with its node; any other icon shows wherever its content does. */
function isIconShownBy(lastPlanet: number) {
  const laterNodeIds = new Set(
    contentOf('tech-node')
      .filter((node) => !isNodeOnOrBefore(lastPlanet)(node))
      .map((node) => node.id),
  )
  return (icon: ContentIconUse) => icon.kind !== 'tech-node' || !laterNodeIds.has(icon.id)
}

function magneticPlanetsRow() {
  const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === MAGNETIC_PLANETS_ROW)
  if (row === undefined) throw new RangeError(`no ${MAGNETIC_PLANETS_ROW} row in stats.json`)
  return row
}

/** A run that has reached `planetIndex` and met no other bind. */
function progressOn(planetIndex: number) {
  return {
    highestPlanetIndex: planetIndex,
    collectedArtefactRowIds: new Set<string>(),
    builtFacilityRowIds: new Set<string>(),
    manualUnlockRowIds: new Set<string>(),
  }
}

/** Player `p1` on `planetIndex` with money for anything. */
function richStateOn(planetIndex: number) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

/** Every trace of the family the loaded game shows on planets up to `lastPlanet`. */
function familyTracesThrough(lastPlanet: number): unknown[] {
  const state = richStateOn(lastPlanet)
  const payloads = botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
  const refs = ITEM_IDS.map((id) => ({ kind: 'vehicle-item' as const, id }))
  return [
    ...ITEM_IDS.filter(isVehicleItemId),
    ...contentOf('vehicle-item').filter(mentionsTheFamily),
    ...contentOf('power-up').filter(mentionsTheFamily),
    ...contentOf('tech-node').filter(isNodeOnOrBefore(lastPlanet)).filter(mentionsTheFamily),
    ...contentIconIds().filter(isIconShownBy(lastPlanet)).filter(mentionsTheFamily),
    ...listBuyableRefs(lastPlanet).filter(mentionsTheFamily),
    ...refs.map(itemDescriptionEntryOf).filter((entry) => entry !== null),
    ...payloads.filter(mentionsTheFamily),
  ]
}

/** What the effect builds will register, so the probes below are shown to see the family. */
const SHIPPED_PROBE: SliceDefinition = {
  id: 'terrain-tools',
  register(r) {
    r.content('vehicle-item', MAGNET_ITEMS.map(magnetVehicleItemOf))
    r.itemDescriptionEntries(MAGNET_ITEM_CARDS)
  },
}

describe('terrain magnets guard', () => {
  it('no magnet item, node or icon appears before P25', () => {
    expect(MAGNET_ITEMS.filter((item) => item.node.unlockTier < FAMILY_ENTRY_PLANET)).toEqual([])
    expect(familyTracesThrough(FAMILY_ENTRY_PLANET - 1)).toEqual([])
  })

  it('the family appears from P25 once `magnetic_planets` is shipped', () => {
    const row = magneticPlanetsRow()
    expect(row).toMatchObject({ planetIndex: FAMILY_ENTRY_PLANET, status: 'shipped' })
    expect(isUnlocked(row, progressOn(FAMILY_ENTRY_PLANET - 1))).toBe(false)
    expect(isUnlocked(row, progressOn(FAMILY_ENTRY_PLANET))).toBe(true)
    withRegistrations([SHIPPED_PROBE], () => {
      expect(familyTracesThrough(FAMILY_ENTRY_PLANET)).not.toEqual([])
    })
  })

  it('the lodestone beacon is unchanged at P23', () => {
    const beacon = terrainItemOf(BEACON_ITEM_ID)
    if (beacon === null) throw new RangeError(`no ${BEACON_ITEM_ID} row`)
    const node = contentOf('tech-node').find((entry) => entry.id === LODESTONE_BEACON_NODE_ID)
    expect(node).toEqual(techNodeOf(beacon))
    expect(node).toMatchObject({
      unlockTier: 23,
      prereqs: ['tech.terrain.ore_shifter'],
      unlocks: BEACON_ITEM_ID,
      marks: { isIncomeItem: true, magnitude: { base: 10 }, charges: 1 },
    })
    expect(node).not.toHaveProperty('requiresDiscovery')
    expect(isVehicleItemId(BEACON_ITEM_ID)).toBe(true)
  })

  it('roots both new nodes at the beacon, the repulsor coil behind the magnetic hazard too', () => {
    const nodes = contentOf('tech-node').filter(mentionsTheFamily)
    expect(
      nodes.map(({ id, unlockTier, prereqs, requiresDiscovery, unlocks }) => ({
        id,
        unlockTier,
        prereqs,
        requiresDiscovery,
        unlocks,
      })),
    ).toEqual([
      {
        id: 'tech.terrain.lode_clamp',
        unlockTier: 28,
        prereqs: [LODESTONE_BEACON_NODE_ID],
        requiresDiscovery: undefined,
        unlocks: 'power.lode_clamp',
      },
      {
        id: 'tech.terrain.repulsor_coil',
        unlockTier: 25,
        prereqs: [LODESTONE_BEACON_NODE_ID],
        requiresDiscovery: 'hazard:magnetic',
        unlocks: 'power.repulsor_coil',
      },
    ])
  })

  it('enters no earlier than the magnetic planet itself', () => {
    const entry = Math.min(...MAGNET_ITEMS.map((item) => item.node.unlockTier))
    expect(entry).toBeGreaterThanOrEqual(magneticPlanetsRow().planetIndex)
  })

  it('would see the family once a slice registered it, so the probes above can fail', () => {
    withRegistrations([SHIPPED_PROBE], () => {
      expect(ITEM_IDS.filter(isVehicleItemId)).toEqual(ITEM_IDS)
      expect(contentIconIds().filter(mentionsTheFamily)).toHaveLength(ITEM_IDS.length)
      const refs = ITEM_IDS.map((id) => ({ kind: 'vehicle-item' as const, id }))
      expect(refs.map(itemDescriptionEntryOf).map((entry) => entry?.id)).toEqual([
        'terrain-tools.repulsor_coil',
        'terrain-tools.lode_clamp',
      ])
    })
  })
})
