import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { onCurveHullShareOf } from '../../economy/magneticHazard'
import { cmp, sub } from '../../money'
import type { ContactEffectRow, ContactFactor } from '../../registries/contactEffects'
import type { HazardPocketsProvider } from '../../registries/hazardPockets'
import { vehicleMotionAt } from '../../registries/vehicleMotionEffects'
import { FACING } from '../../vehicle/vehiclePose'
import { energyMaxQuantaOf } from '../../vehicle/vehicleState'
import { cellDensitySum } from '../../world/cellYield'
import { surfaceRowOfColumn } from '../../world/tileGrid'
import { planetParamsOf } from '../planetOfState'
import { createAuthorityState } from '../authorityState'
import type { DomainEvent } from '../domainEvent'
import {
  continueScriptedSession,
  createScriptedSession,
  GROUND,
  mineTile,
  PARAMS,
  poseAbove,
  type ScriptedSession,
} from '../scriptedSession'
import { stateDigest } from '../stateDigest'
import { placeHazardCommand } from './hazardDebugRules'

// The four contact effects of #651's hazards on the kernel's registry (ticket 848; the GD lock on
// #823 Q1): a hazard cell the drill breaks plays its row's effect on that rig, scaled by the row's
// factor. The loaded ores rows play here through `debug.placeHazard` on planet 1; the factor-0
// replay registers a fake pocket provider and rows on planet 2, so no real slice is imported there.

const START = 100
const BELOW = { tx: GROUND.tx, ty: GROUND.ty - 1 }
const DEEPER = { tx: GROUND.tx, ty: GROUND.ty - 2 }

function eventsOfType<T extends DomainEvent['type']>(
  events: readonly DomainEvent[],
  type: T,
): Extract<DomainEvent, { type: T }>[] {
  return events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)
}

/** A session on planet 1 with `kind` placed in `tile`. */
function sessionWithHazard(kind: string, tile = GROUND): ScriptedSession {
  const session = createScriptedSession()
  session.submit(START, placeHazardCommand(kind, tile.tx, tile.ty))
  return session
}

/** The surface tile and the one below it mined, the rig standing in the surface tile. */
function sessionInShaft(): ScriptedSession {
  const session = createScriptedSession()
  mineTile(session, START, GROUND)
  mineTile(session, START + 50, BELOW)
  return session
}

describe('hazard contacts', () => {
  it('bites the hull once for a spinecrystal cell, a frontal hit at a quarter of the share', () => {
    const session = sessionWithHazard('spinecrystal')
    const hullBefore = session.vehicle().hull
    const events = mineTile(session, START + 1, GROUND)
    expect(eventsOfType(events, 'HazardBit')).toMatchObject([
      { type: 'HazardBit', kind: 'spinecrystal', ...GROUND, hullBp: 50, arc: 'front' },
    ])
    const lost = sub(hullBefore, session.vehicle().hull)
    expect(cmp(lost, onCurveHullShareOf(1, 50))).toBe(0)
    expect(session.vehicle().hazardHullBp).toBe(50)
    expect(eventsOfType(mineTile(session, START + 100, GROUND), 'HazardBit')).toEqual([])
  })

  it('refills a rockfall cell farthest from the rig first and crushes the rig once', () => {
    const session = sessionWithHazard('rockfall')
    const events = mineTile(session, START + 1, GROUND)
    const [refill] = eventsOfType(events, 'HazardRefilled')
    expect(refill).toMatchObject({ kind: 'rockfall', ...GROUND, hullBp: 75, arc: 'front' })
    expect(refill.samples).toBeGreaterThan(0)
    expect(cellDensitySum(session.state().world, PARAMS, GROUND)).toBe(refill.samples * 255)
    expect(eventsOfType(events, 'GroundChanged').length).toBeGreaterThan(1)
    const again = mineTile(session, START + 100, GROUND)
    expect(eventsOfType(again, 'HazardRefilled')).toEqual([])
    expect(eventsOfType(again, 'CargoAdded')).toEqual([])
  })

  it('shoves the rig up its open shaft along the vent normal as a glide, scalding the hull', () => {
    const session = sessionInShaft()
    session.submit(START + 99, placeHazardCommand('steamvent', DEEPER.tx, DEEPER.ty))
    const events = mineTile(session, START + 100, DEEPER)
    const [shove] = eventsOfType(events, 'HazardShoved')
    const tick = START + 140
    expect(shove).toMatchObject({
      type: 'HazardShoved',
      kind: 'steamvent',
      ...DEEPER,
      hullBp: 50,
      arc: 'front',
      tiles: 3,
      toTx: BELOW.tx,
      toTy: BELOW.ty + 3,
      untilTick: tick + 20,
    })
    const running = vehicleMotionAt(session.state(), 'p1', tick + 5).glide
    expect(running?.to).toEqual({ x: BELOW.tx + 0.5, y: BELOW.ty + 3.5 })
    expect(vehicleMotionAt(session.state(), 'p1', tick + 20).glide).toBeNull()
  })

  it('never shoves the rig into ground: refilled rubble above stops the shove', () => {
    const session = sessionInShaft()
    session.submit(START + 98, {
      type: 'debug.fillCircle',
      payload: { x: GROUND.tx * 1000 + 500, y: GROUND.ty * 1000 + 500, radius: 600, amount: 255 },
    })
    session.submit(START + 99, placeHazardCommand('steamvent', DEEPER.tx, DEEPER.ty))
    const [shove] = eventsOfType(mineTile(session, START + 100, DEEPER), 'HazardShoved')
    expect(shove).toMatchObject({ tiles: 0, toTx: BELOW.tx, toTy: BELOW.ty })
    expect(session.vehicle().hazardShove).toBeUndefined()
  })

  it('drains a share of the owned energy track while the rig stands in a cut firedamp pocket', () => {
    const session = sessionWithHazard('firedamp')
    mineTile(session, START + 1, GROUND)
    session.submit(START + 60, poseAbove(BELOW, FACING.down))
    const before = session.vehicle().energy
    const events = session.submit(START + 240, poseAbove(BELOW, FACING.down))
    const quanta = Math.floor((energyMaxQuantaOf(session.vehicle()) * 1500) / 10000)
    expect(eventsOfType(events, 'HazardDrained')).toMatchObject([
      { type: 'HazardDrained', kind: 'firedamp', ...GROUND, ticks: 180, quanta },
    ])
    expect(session.vehicle().energy).toBe(before - quanta)
  })

  it('never drains the tank below the floor of a quarter of the track', () => {
    const session = sessionWithHazard('firedamp')
    mineTile(session, START + 1, GROUND)
    session.submit(START + 60, poseAbove(BELOW, FACING.down))
    for (let tick = START + 240; tick <= START + 3600; tick += 180) {
      session.submit(tick, poseAbove(BELOW, FACING.down))
    }
    const floor = Math.floor((energyMaxQuantaOf(session.vehicle()) * 2500) / 10000)
    expect(session.vehicle().energy).toBe(floor)
    expect(session.vehicle().mode).toBe('active')
  })

  it('plays a contact on the rig that cut the cell alone', () => {
    const session = createScriptedSession(['p1', 'p2'])
    session.submit(START, placeHazardCommand('spinecrystal', GROUND.tx, GROUND.ty))
    const other = session.vehicle('p2').hull
    mineTile(session, START + 1, GROUND, 'p1')
    expect(session.vehicle('p1').hazardHullBp).toBe(50)
    expect(session.vehicle('p2').hull).toBe(other)
    expect(session.vehicle('p2').hazardHullBp).toBeUndefined()
  })

  it('refuses to place a kind no contact-effect row plays, and places nothing', () => {
    const session = createScriptedSession()
    const before = stateDigest(session.state())
    const events = session.submit(START, placeHazardCommand('quicksand', GROUND.tx, GROUND.ty))
    expect(events).toMatchObject([{ type: 'CommandRejected', reason: 'invalid_payload' }])
    expect(stateDigest(session.state())).toBe(before)
  })
})

describe('hazard contacts at factor 0', () => {
  const BITE_ROW: ContactEffectRow = {
    id: 'probe.spinecrystal',
    kind: 'spinecrystal',
    effect: 'bite',
    factorBp: 0,
    diveHullCapBp: 2500,
    hullShareBp: 200,
  }
  const EVERY_GROUND_CELL: HazardPocketsProvider = {
    id: 'probe.pockets',
    pocketTestOf: () => () => 'spinecrystal',
  }

  function probeSlice(
    rows: readonly ContactEffectRow[],
    factors: readonly ContactFactor[],
  ): SliceDefinition {
    return {
      id: 'probe',
      register: (r) => {
        r.hazardPockets(EVERY_GROUND_CELL)
        rows.forEach((row) => r.contactEffect(row))
        factors.forEach((factor) => r.contactFactor(factor))
      },
    }
  }

  /** The same dig down a planet 2 column, with the given rows and factor hooks registered. */
  function digestOfDig(rows: readonly ContactEffectRow[], factors: readonly ContactFactor[] = []) {
    return withRegistrations([probeSlice(rows, factors)], () => {
      const state = createAuthorityState({ planetIndex: 2, planetSeed: 83921, playerIds: ['p1'] })
      const session = continueScriptedSession(state)
      const params = planetParamsOf(state.planet)
      if (params === null) throw new Error('planet 2 has no params')
      const top = { tx: 20, ty: surfaceRowOfColumn(20, params.radiusTiles) }
      const column = [0, 1, 2].map((depth) => ({ tx: top.tx, ty: top.ty - depth }))
      column.forEach((tile, at) => mineTile(session, START + at * 50, tile))
      return { digest: stateDigest(session.state()), events: session.events() }
    })
  }

  it('replays byte-identical to no rows at all with every factor at 0', () => {
    const off = digestOfDig([BITE_ROW])
    const none = digestOfDig([])
    expect(off.digest).toBe(none.digest)
    expect(off.events).toEqual(none.events)
  })

  it('scales each bite by a tool hook while it answers, never stacking two hooks', () => {
    const hooks: ContactFactor[] = [
      { id: 'probe.tongs', kind: 'spinecrystal', factorBpOf: () => 4000 },
      { id: 'probe.salve', kind: 'spinecrystal', factorBpOf: () => 5000 },
    ]
    const tonged = digestOfDig([{ ...BITE_ROW, factorBp: 10000 }], hooks)
    const bites = eventsOfType(tonged.events, 'HazardBit')
    expect(bites.length).toBeGreaterThan(0)
    expect(bites.every((bite) => bite.hullBp === 20)).toBe(true)
  })

  it('bites again once the factor is back on', () => {
    const on = digestOfDig([{ ...BITE_ROW, factorBp: 10000 }])
    expect(eventsOfType(on.events, 'HazardBit').length).toBeGreaterThan(0)
    expect(on.digest).not.toBe(digestOfDig([]).digest)
  })
})
