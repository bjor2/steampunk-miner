import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentIconIds, contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import { LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import { MAGNET_ITEM_CARDS } from './systems/magnetCards'
import { MAGNET_ITEMS, magnetVehicleItemOf } from './systems/magnetItems'

// The terrain magnets' guard (GD lock on #246, Horizontal Scaler; ticket 282): the family enters
// at P25 with the magnetic planet, never as a tease at P24, and stays data only, with no trace in
// the loaded game, while the #71 magnetic-planet spec has not shipped `magnetic_planets`.

const PLAYER = 'p1'

const MAGNETIC_PLANETS_ROW = 'magnetic_planets'

const FAMILY_ENTRY_PLANET = 25

const LAST_SCHEDULED_PLANET = 40

const FAMILY_IDS = MAGNET_ITEMS.flatMap((item) => [item.itemId, item.node.id, item.iconId])

const ITEM_IDS = MAGNET_ITEMS.map((item) => item.itemId)

const mentionsTheFamily = (value: unknown) =>
  FAMILY_IDS.some((id) => JSON.stringify(value).includes(id))

function magneticPlanetsRow() {
  const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === MAGNETIC_PLANETS_ROW)
  if (row === undefined) throw new RangeError(`no ${MAGNETIC_PLANETS_ROW} row in stats.json`)
  return row
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
    ...contentOf('tech-node').filter(mentionsTheFamily),
    ...contentIconIds().filter(mentionsTheFamily),
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

  it('nothing of the family appears while `magnetic_planets` is a vision row', () => {
    const isVisionRow = magneticPlanetsRow().status === 'vision'
    expect(isVisionRow ? familyTracesThrough(LAST_SCHEDULED_PLANET) : []).toEqual([])
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
