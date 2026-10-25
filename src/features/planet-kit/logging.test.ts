import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { runEventProblems } from '../../logging/runEventSchema'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { createScriptedSession } from '../../systems/authority/scriptedSession'
import { oreSalePrice } from '../../systems/economy/oreEconomy'
import { add, fromSafeInteger, mul, toCanonical } from '../../systems/money'
import { tileOfPose, type VehiclePose } from '../../systems/vehicle/vehiclePose'
import { dropContainerIntent, pickupContainerIntent } from './systems/containerRules'
import { buyKitItemIntent } from './systems/kitBuyRules'

// The planet kits' log lines, each checked against its registered schema: a kit item bought
// (ticket 850), and the Cache Crate's drop and pickup (ticket 823, the TD's final ruling on #823,
// point 8).

function linesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_823', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events)
  return sink.events
}

/** A scenario container picked up, the hold dropped as a crate, half of it picked up again. */
function droppedAndPickedUp(): { events: DomainEvent[]; cell: { tx: number; ty: number } } {
  const session = createScriptedSession()
  const cell = tileOfPose(session.vehicle().pose as VehiclePose)
  session.submit(1, {
    type: 'debug.planet-kit.placeContainer',
    payload: {
      kind: 'cache_crate',
      ownerId: 'p1',
      ...cell,
      ore: { '1': '3', '4': '2' },
      coreFragments: 0,
    },
  })
  session.submit(2, pickupContainerIntent(1))
  session.submit(2, { type: 'debug.planet-kit.grantKitItem', payload: { itemId: 'cache_crate' } })
  session.submit(3, dropContainerIntent('cache_crate'))
  session.submit(4, pickupContainerIntent(2))
  return { events: session.events(), cell }
}

describe('kit item log lines (ticket 850)', () => {
  it('logs a buy with the item, its kind, the planet (s,p), the g, the price and units held', () => {
    const session = createScriptedSession()
    session.submit(0, { type: 'debug.grantMoney', payload: { amount: '1e6' } })
    session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
    session.submit(1, buyKitItemIntent('cache_crate'))
    const [line] = linesOf(session.events()).filter((line) => line.event.startsWith('planet-kit.'))
    expect(line).toMatchObject({
      event: 'planet-kit.kit_item_purchased',
      data: { itemId: 'cache_crate', kind: 'consumable', system: '1', place: '1', g: '1' },
    })
    expect(line.data).toMatchObject({ held: '1' })
    expect(runEventProblems(line)).toEqual([])
  })
})

describe('cache crate log lines (ticket 823)', () => {
  it('logs a drop and a pickup with the planet’s (s,p), cell, kind, owner, id, units and value', () => {
    const { events, cell } = droppedAndPickedUp()
    const lines = linesOf(events).filter((line) => line.event.startsWith('planet-kit.'))
    const value = toCanonical(
      add(mul(oreSalePrice(1), fromSafeInteger(3)), mul(oreSalePrice(4), fromSafeInteger(2))),
    )
    const where = {
      system: '1',
      place: '1',
      cell: [cell.tx, cell.ty],
      kind: 'cache_crate',
      ownerId: 'p1',
    }
    expect(lines.map(({ event, data }) => ({ event, data }))).toEqual([
      {
        event: 'planet-kit.container_pickup',
        data: { ...where, containerId: 1, units: 5, value, unitsLeft: 0 },
      },
      { event: 'planet-kit.container_drop', data: { ...where, containerId: 2, units: 5, value } },
      {
        event: 'planet-kit.container_pickup',
        data: { ...where, containerId: 2, units: 5, value, unitsLeft: 0 },
      },
    ])
    lines.forEach((line) => expect(runEventProblems(line)).toEqual([]))
  })

  it('logs a scenario’s placed container only as a debug command, never as play', () => {
    const { events } = droppedAndPickedUp()
    const lines = linesOf(events.slice(0, 1))
    expect(lines.map((line) => line.event)).toEqual(['debug_command_applied'])
  })
})
