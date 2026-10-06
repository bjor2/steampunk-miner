import { describe, expect, it } from 'vitest'
import { CONTENT_REGISTRY, contentRegistrationOf } from '../registries/content'
import { addToRegistry, withFreshRegistrySet } from '../registries/seal'
import {
  LOADOUT_SLOT_IDS,
  type LoadoutSlotId,
  type VehicleItem,
} from '../registries/vehicleLoadout'
import { EMPTY_LOADOUT } from '../vehicle/loadoutState'
import type { DomainEvent } from './domainEvent'
import { equipItemCommand, setVehicleLoadoutCommand } from './loadoutCommands'
import { ownsItem } from './loadoutRules'
import { createScriptedSession, typesOf } from './scriptedSession'

const POWERUP_SLOTS: readonly LoadoutSlotId[] = LOADOUT_SLOT_IDS.filter((slot) =>
  slot.startsWith('powerup.'),
)

function item(id: string, slots: readonly LoadoutSlotId[], extra: Partial<VehicleItem> = {}) {
  return { id, iconId: `icon-${id}`, slots, attach: null, ...extra }
}

/** A few #162 catalogue rows, as the item slices will register them. */
const CATALOGUE: readonly VehicleItem[] = [
  item('drill-gear.vibratory_bit', ['drill.head']),
  item('drill-gear.twin_bit', ['drill.head']),
  item('drill-gear.spoil_auger', ['drill.collar']),
  item('drill-gear.sampling_corer', ['drill.collar']),
  item('drill-gear.side_cutters', ['drill.flank']),
  item('drill-gear.flank_rasp', ['drill.flank']),
  item('sensing.echo_sounder', POWERUP_SLOTS),
  item('mobility.steam_boost', POWERUP_SLOTS),
  item('mobility.cradle_3', [], { opensSlot: 'powerup.3' }),
  item('rig.resonance', [], { attach: 'drill.hood' }),
]

function withCatalogue<T>(run: () => T): T {
  return withFreshRegistrySet(
    () =>
      CATALOGUE.forEach((entry) =>
        addToRegistry(CONTENT_REGISTRY, 'items', contentRegistrationOf('vehicle-item', entry)),
      ),
    run,
  )
}

/** Docked at the Upgrade bay owning `owned` (unslotted) and the items in `slots`. */
function dockedWith(slots: Readonly<Record<string, string>> = {}, owned: readonly string[] = []) {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, setVehicleLoadoutCommand(slots, owned))
  return session
}

const refusalIn = (events: readonly DomainEvent[]) =>
  events.find((event) => event.type === 'EquipRefused')

describe('equipping at the platform (#162, K4)', () => {
  it('puts an owned item in a slot that takes it and logs one ItemEquipped', () =>
    withCatalogue(() => {
      const session = dockedWith({}, ['drill-gear.vibratory_bit'])
      const events = session.submit(1, equipItemCommand('drill.head', 'drill-gear.vibratory_bit'))
      expect(events).toMatchObject([
        { type: 'ItemEquipped', slot: 'drill.head', itemId: 'drill-gear.vibratory_bit' },
      ])
      expect(session.vehicle().loadout.slots['drill.head']).toBe('drill-gear.vibratory_bit')
    }))

  it('empties a slot for a null item, keeping the item owned', () =>
    withCatalogue(() => {
      const session = dockedWith({ 'drill.collar': 'drill-gear.spoil_auger' })
      session.submit(1, equipItemCommand('drill.collar', null))
      expect(session.vehicle().loadout.slots['drill.collar']).toBeNull()
      expect(ownsItem(session.state(), 'p1', 'drill-gear.spoil_auger')).toBe(true)
    }))

  it('moves an item already in another power-up slot, emptying that slot first', () =>
    withCatalogue(() => {
      const session = dockedWith({ 'powerup.1': 'sensing.echo_sounder' })
      const events = session.submit(1, equipItemCommand('powerup.2', 'sensing.echo_sounder'))
      expect(events).toMatchObject([
        { type: 'ItemEquipped', slot: 'powerup.1', itemId: null },
        { type: 'ItemEquipped', slot: 'powerup.2', itemId: 'sensing.echo_sounder' },
      ])
    }))

  it('swaps the item in a slot that is not exclusive', () =>
    withCatalogue(() => {
      const session = dockedWith({ 'drill.flank': 'drill-gear.side_cutters' }, [
        'drill-gear.flank_rasp',
      ])
      session.submit(1, equipItemCommand('drill.flank', 'drill-gear.flank_rasp'))
      expect(session.vehicle().loadout.slots['drill.flank']).toBe('drill-gear.flank_rasp')
    }))
})

describe('equip refusals (#162 equip_refused)', () => {
  it('refuses away from the platform with not_docked and changes nothing', () =>
    withCatalogue(() => {
      const session = dockedWith({}, ['drill-gear.twin_bit'])
      session.submit(1, { type: 'undock', payload: {} })
      const before = session.vehicle().loadout
      const events = session.submit(2, equipItemCommand('drill.head', 'drill-gear.twin_bit'))
      expect(refusalIn(events)).toMatchObject({
        slot: 'drill.head',
        itemId: 'drill-gear.twin_bit',
        reason: 'not_docked',
      })
      expect(session.vehicle().loadout).toEqual(before)
    }))

  it('refuses a rig slot with wrong_slot, since extractors take none', () =>
    withCatalogue(() => {
      const events = dockedWith({}, ['rig.resonance']).submit(
        1,
        equipItemCommand('rig.1', 'rig.resonance'),
      )
      expect(refusalIn(events)).toMatchObject({ slot: 'rig.1', reason: 'wrong_slot' })
    }))

  it('refuses an extractor in any slot with wrong_slot', () =>
    withCatalogue(() => {
      const session = dockedWith({}, ['rig.resonance'])
      const refusals = LOADOUT_SLOT_IDS.map((slot, index) =>
        refusalIn(session.submit(index + 1, equipItemCommand(slot, 'rig.resonance'))),
      )
      expect(refusals).toEqual(
        LOADOUT_SLOT_IDS.map(() => expect.objectContaining({ reason: 'wrong_slot' })),
      )
      expect(session.vehicle().loadout.slots).toEqual(EMPTY_LOADOUT.slots)
    }))

  it('refuses a drill head in a power-up slot with wrong_slot', () =>
    withCatalogue(() => {
      const events = dockedWith({}, ['drill-gear.twin_bit']).submit(
        1,
        equipItemCommand('powerup.1', 'drill-gear.twin_bit'),
      )
      expect(refusalIn(events)).toMatchObject({ reason: 'wrong_slot' })
    }))

  it('keeps powerup.3 locked until its cradle is owned', () =>
    withCatalogue(() => {
      const locked = dockedWith({}, ['mobility.steam_boost'])
      expect(
        refusalIn(locked.submit(1, equipItemCommand('powerup.3', 'mobility.steam_boost'))),
      ).toMatchObject({ reason: 'slot_locked' })
      const opened = dockedWith({}, ['mobility.steam_boost', 'mobility.cradle_3'])
      expect(
        typesOf(opened.submit(1, equipItemCommand('powerup.3', 'mobility.steam_boost'))),
      ).toEqual(['ItemEquipped'])
    }))

  it('refuses an item the player does not own with not_owned', () =>
    withCatalogue(() => {
      const events = dockedWith().submit(1, equipItemCommand('powerup.1', 'sensing.echo_sounder'))
      expect(refusalIn(events)).toMatchObject({ reason: 'not_owned' })
    }))

  it('refuses a second item in drill.head or drill.collar with exclusive_taken', () =>
    withCatalogue(() => {
      const session = dockedWith(
        { 'drill.head': 'drill-gear.vibratory_bit', 'drill.collar': 'drill-gear.spoil_auger' },
        ['drill-gear.twin_bit', 'drill-gear.sampling_corer'],
      )
      const head = session.submit(1, equipItemCommand('drill.head', 'drill-gear.twin_bit'))
      const collar = session.submit(
        2,
        equipItemCommand('drill.collar', 'drill-gear.sampling_corer'),
      )
      expect([head, collar].map((events) => refusalIn(events))).toMatchObject([
        { reason: 'exclusive_taken' },
        { reason: 'exclusive_taken' },
      ])
      expect(session.vehicle().loadout.slots['drill.head']).toBe('drill-gear.vibratory_bit')
    }))
})

describe('the scenario loadout (debug.setVehicleLoadout)', () => {
  it('replaces the loadout: the named slots filled, the rest empty, the items owned', () =>
    withCatalogue(() => {
      const session = dockedWith({ 'powerup.4': 'sensing.echo_sounder' }, ['rig.resonance'])
      expect(session.vehicle().loadout).toEqual({
        slots: { ...EMPTY_LOADOUT.slots, 'powerup.4': 'sensing.echo_sounder' },
        owned: ['rig.resonance', 'sensing.echo_sounder'],
      })
    }))

  it('is refused whole for an unknown slot, a slot the item does not take or an unknown item', () =>
    withCatalogue(() => {
      const session = createScriptedSession()
      const events = session.submit(
        0,
        setVehicleLoadoutCommand(
          { 'rig.1': 'rig.resonance', 'drill.head': 'sensing.echo_sounder' },
          ['nope'],
        ),
      )
      expect(events).toMatchObject([{ type: 'CommandRejected', reason: 'invalid_loadout' }])
      expect(events[0]).toHaveProperty('problems', [
        expect.stringContaining('"rig.1" is not a loadout slot'),
        '"sensing.echo_sounder" does not go in drill.head',
        '"nope" is not a vehicle item',
      ])
      expect(session.vehicle().loadout).toEqual(EMPTY_LOADOUT)
    }))

  it('refuses one item named for two slots', () =>
    withCatalogue(() => {
      const events = createScriptedSession().submit(
        0,
        setVehicleLoadoutCommand({
          'powerup.1': 'sensing.echo_sounder',
          'powerup.2': 'sensing.echo_sounder',
        }),
      )
      expect(events).toMatchObject([{ type: 'CommandRejected', reason: 'invalid_loadout' }])
    }))
})
