import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../systems/authority/authorityCommand'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { createScriptedSession, type ScriptedSession } from '../systems/authority/scriptedSession'
import { serviceReserveOf } from '../systems/authority/serviceReserve'
import { stepPrice } from '../systems/economy/upgradePrices'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../systems/money'
import { recordDomainEventsTo } from './domainEventLog'
import type { RunEventData, RunEventName } from './eventNames'
import { createMemorySink } from './eventSink'
import { derivePurchaseChains, RELEASED_OR_FOCUS } from './purchaseChains'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'
import { createRunLog } from './runLog'
import { deriveSummary } from './runSummary'

const HOLD = 3

const buyStep = (chain: number): CommandIntent => ({
  type: 'buyUpgrade',
  payload: { upgradeId: 'drill_power', chain },
})

/** Docked at the planet 3 Upgrade bay with a dented hull, so the reserve is its repair. */
function dentedAtUpgradeBay(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: 3 } })
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.setHull', payload: { hull: '10' } })
  return session
}

/** Enough for `steps` drill power steps above the reserve, and half the step after them. */
function fundSteps(session: ScriptedSession, steps: number): void {
  const from = session.vehicle().levels.drill_power
  let wallet = serviceReserveOf(session.state(), 'p1')
  for (let step = from; step < from + steps; step += 1) {
    wallet = add(wallet, stepPrice('drill_power', step, 3))
  }
  const half = sub(stepPrice('drill_power', from + steps, 3), fromCanonical('1'))
  const amount = toCanonical(add(wallet, half))
  session.submit(0, { type: 'debug.setMoney', payload: { amount } })
}

/** The run log the session's events project to, as the game writes it. */
function runLogOf(events: readonly DomainEvent[]): readonly RunEvent[] {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_chains', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 3, depthTiles: 0 }, events)
  return sink.events
}

let nextSeq = 0

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  playerId = 'p1',
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: nextSeq++,
    tick,
    timestamp: 0,
    runId: 'run_test',
    playerId,
    planet: 3,
    depthTiles: 0,
    event,
    data,
  } as RunEvent
}

const casingStep = (tick: number, from: number, chain?: number, playerId = 'p1') =>
  line(
    tick,
    'casing_upgraded',
    chain === undefined
      ? { from, to: from + 1, price: '1e+2' }
      : { from, to: from + 1, price: '1e+2', chain, reserveLeft: '5e+1' },
    playerId,
  )

describe('purchase chains in the run log (ticket 226)', () => {
  it('logs the chain and the wallet above the reserve on a held step, and neither on a click', () => {
    const session = dentedAtUpgradeBay()
    fundSteps(session, 2)
    const held = session.submit(1, buyStep(HOLD))
    const state = session.state()
    const left = toCanonical(sub(state.players.p1.wallet, serviceReserveOf(state, 'p1')))
    const [heldLine, clickLine] = runLogOf([...held, ...session.submit(2, buyStep(0))])
    expect(heldLine).toMatchObject({
      event: 'upgrade_purchased',
      data: { chain: HOLD, reserveLeft: left },
    })
    expect(clickLine.event).toBe('upgrade_purchased')
    expect(clickLine.data).not.toHaveProperty('chain')
    expect(clickLine.data).not.toHaveProperty('reserveLeft')
  })

  it('derives a held chain the reserve stopped: its steps, levels, cost and what it kept', () => {
    const session = dentedAtUpgradeBay()
    fundSteps(session, 4)
    const from = session.vehicle().levels.drill_power
    const events = [1, 2, 3, 4, 5].flatMap((tick) => session.submit(tick, buyStep(HOLD)))
    const left = sub(session.state().players.p1.wallet, serviceReserveOf(session.state(), 'p1'))
    let cost = ZERO_MONEY
    for (let step = from; step < from + 4; step += 1) {
      cost = add(cost, stepPrice('drill_power', step, 3))
    }
    expect(derivePurchaseChains(runLogOf(events))).toEqual([
      {
        playerId: 'p1',
        track: 'drill_power',
        chain: HOLD,
        steps: 4,
        fromLevel: from,
        toLevel: from + 4,
        cost: toCanonical(cost),
        reserveLeft: toCanonical(left),
        stoppedBy: 'service_reserve',
        firstTick: 1,
        lastTick: 4,
      },
    ])
  })

  it('puts the chains in the run summary', () => {
    const session = dentedAtUpgradeBay()
    fundSteps(session, 2)
    const events = [1, 2].flatMap((tick) => session.submit(tick, buyStep(HOLD)))
    expect(deriveSummary(runLogOf(events)).purchaseChains).toMatchObject([
      { track: 'drill_power', chain: HOLD, steps: 2, stoppedBy: RELEASED_OR_FOCUS },
    ])
  })
})

describe('purchase chains derived from purchase lines (ticket 226)', () => {
  it('counts no chain for clicks', () => {
    expect(derivePurchaseChains([casingStep(1, 1), casingStep(2, 2)])).toEqual([])
  })

  it('ends a chain as released at a click, another hold or the end of the log', () => {
    const chains = derivePurchaseChains([
      casingStep(1, 1, 4),
      casingStep(2, 2, 4),
      casingStep(3, 3),
      casingStep(4, 4, 5),
      casingStep(5, 5, 6),
    ])
    expect(chains.map(({ chain, steps, stoppedBy }) => ({ chain, steps, stoppedBy }))).toEqual([
      { chain: 4, steps: 2, stoppedBy: RELEASED_OR_FOCUS },
      { chain: 5, steps: 1, stoppedBy: RELEASED_OR_FOCUS },
      { chain: 6, steps: 1, stoppedBy: RELEASED_OR_FOCUS },
    ])
  })

  it('names the row of guns and rack steps and keeps each player apart', () => {
    const chains = derivePurchaseChains([
      line(1, 'gun_mounted', { level: 10, price: '3e+2', chain: 2, reserveLeft: '9e+2' }),
      casingStep(2, 1, 2, 'p2'),
      line(3, 'gun_upgraded', { from: 10, to: 11, price: '4e+1', chain: 2, reserveLeft: '8e+2' }),
      line(4, 'command_rejected', { type: 'buyGun', reason: 'money_short', chain: 2 }),
      line(5, 'charge_rack_upgraded', {
        from: 0,
        to: 1,
        price: '7e+1',
        chain: 8,
        reserveLeft: '1',
      }),
    ])
    expect(chains).toMatchObject([
      { playerId: 'p1', track: 'auto_guns', fromLevel: 0, toLevel: 11, steps: 2, cost: '3.4e+2' },
      { playerId: 'p2', track: 'casing', steps: 1, stoppedBy: RELEASED_OR_FOCUS },
      { playerId: 'p1', track: 'blasting_charges', steps: 1, stoppedBy: RELEASED_OR_FOCUS },
    ])
    expect(chains[0]).toMatchObject({ reserveLeft: '8e+2', stoppedBy: 'money_short' })
  })

  it("never ends a chain at a refusal naming another hold, or a click's refusal", () => {
    const chains = derivePurchaseChains([
      casingStep(1, 1, 4),
      line(2, 'command_rejected', { type: 'buyCasingGrade', reason: 'money_short' }),
      line(3, 'command_rejected', { type: 'buyCasingGrade', reason: 'money_short', chain: 9 }),
      casingStep(4, 2, 4),
    ])
    expect(chains).toMatchObject([{ chain: 4, steps: 2, stoppedBy: RELEASED_OR_FOCUS }])
  })
})
