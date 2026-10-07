import { describe, expect, it } from 'vitest'
import { ofType } from '../../../systems/authority/charges/chargeFixtures'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { bayPoseAt } from '../../../systems/vehicle/vehiclePose'
import type { BayId } from '../../../systems/world/dockBays'
import { NO_TICKS } from '../../../systems/bot/botPose'
import { canMine } from './canMine'
import { BREAK_TICKS, drillFor, extractorSiteOn, touch } from './extractorFixtures'
import {
  EXTRACTOR_SECTION,
  extractorStateOf,
  IDLE_EXTRACTORS,
  withExtractorState,
  type ExtractorState,
} from './extractorState'
import { gatedCellOn, grantItems, paramsOn, queryOf, sessionOn } from './gateFixtures'
import { GATE_ROWS } from './gateRows'
import verbsFile from '../extractorVerbs.json'
import { readVerbRows, VERB_ROWS } from './verbRows'

// What the extractors run out of and get back (ticket 237): canisters and marks per dive, refilled
// with the recharge; one lump on the cable until the hold is sold; and a planet's tiles forgotten
// when the platform moves on. Plus the section's and the verb file's refusals.

/** `canMine` on a planet's first cell of `rigId`, owned, with the section set to `value`. */
function verdictWith(planet: number, rigId: string, value: ExtractorState) {
  const session = sessionOn(planet)
  grantItems(session, [rigId])
  const fixture = gatedCellOn(
    paramsOn(session),
    ({ gate }) => gate.kind === 'rig' && gate.rig.id === rigId,
  )
  const state = withExtractorState(session.state(), 'p1', value)
  return canMine({ ...queryOf(session, fixture), state })
}

/** Docks in `bay` of the session's own planet. */
function dockAt(session: ScriptedSession, tick: number, bay: BayId): void {
  const pose = bayPoseAt(dockSiteOfPlanet(session.state().planet)!, bay)
  session.submit(tick, {
    type: 'reportPose',
    payload: { ...pose, driving: false, thrusting: false, drilling: false, ...NO_TICKS },
  })
  session.submit(tick, { type: 'dock', payload: { bay } })
}

describe('extractor limits', () => {
  it('vents a containment cell once the dive has filled every canister', () => {
    const full = { ...IDLE_EXTRACTORS, canistersUsed: VERB_ROWS.capture.canistersPerDive }
    expect(verdictWith(12, 'rig.containment', full)).toEqual({
      outcome: 'lost',
      gateKind: 'rig',
      required: 'rig.containment:canister',
      have: 'rig.containment',
    })
  })

  it('lets a second lump drift off while one is on the cable', () => {
    const towing = { ...IDLE_EXTRACTORS, tow: { oreId: 'any', tier: 1, sinceTick: 0 } }
    expect(verdictWith(33, 'rig.aether_tether', towing)).toMatchObject({
      outcome: 'lost',
      required: 'rig.aether_tether:free_cable',
    })
  })

  it('opens nothing by standing by an etcher cell once the dive has no mark left', () => {
    const spent = { ...IDLE_EXTRACTORS, marksUsed: VERB_ROWS.mark.marksPerDive }
    const verdict = verdictWith(19, 'rig.acid_etcher', spent)
    expect(verdict).toMatchObject({ outcome: 'refused', required: 'rig.acid_etcher:etched' })
    expect(verdict).not.toHaveProperty('opensAfterTicks')
  })
})

describe('extractor refills and resets', () => {
  it('refills the canisters with the recharge at the dock, and says how many', () => {
    const { session, tile } = extractorSiteOn(12, 'rig.containment')
    drillFor(session, tile, BREAK_TICKS, BREAK_TICKS)
    session.submit(BREAK_TICKS + 1, { type: 'debug.grantMoney', payload: { amount: '1e60' } })
    session.submit(BREAK_TICKS + 1, { type: 'debug.setEnergy', payload: { energy: '1' } })
    dockAt(session, BREAK_TICKS + 2, 'sell')
    const recharged = session.submit(BREAK_TICKS + 3, { type: 'rechargeEnergy', payload: {} })
    expect(ofType(recharged, 'mining-gates.ExtractorsRefilled')).toEqual([
      expect.objectContaining({ canisters: 1, marks: 0 }),
    ])
    expect(extractorStateOf(session.state(), 'p1').canistersUsed).toBe(0)
  })

  it('frees the cable once the hold the lump went with is sold', () => {
    const { session, tile } = extractorSiteOn(33, 'rig.aether_tether')
    drillFor(session, tile, BREAK_TICKS, BREAK_TICKS)
    dockAt(session, BREAK_TICKS + 1, 'sell')
    session.submit(BREAK_TICKS + 2, { type: 'sellCargo', payload: { resourceTier: 'all' } })
    expect(extractorStateOf(session.state(), 'p1').tow).toBeNull()
  })

  it("forgets the planet's marks when the session enters another planet", () => {
    const { session, tile } = extractorSiteOn(19, 'rig.acid_etcher')
    touch(session, tile, 10)
    session.submit(11, { type: 'debug.setPlanet', payload: { planetIndex: 20 } })
    expect(extractorStateOf(session.state(), 'p1')).toMatchObject({ marks: [], marksUsed: 1 })
  })
})

describe('extractor section and verb rows', () => {
  it('accepts its initial value and lists what is malformed', () => {
    expect(EXTRACTOR_SECTION.problems(IDLE_EXTRACTORS)).toEqual([])
    expect(
      EXTRACTOR_SECTION.problems({ ...IDLE_EXTRACTORS, tuning: { tx: 1 }, marksUsed: -1 }),
    ).toEqual(['mining-gates.tuning is malformed', 'mining-gates.marksUsed must be a whole number'])
  })

  it('gives every extractor exactly one verb', () => {
    expect(readVerbRows(verbsFile, GATE_ROWS.rigs)).toHaveProperty('rows')
    const noTow = { ...verbsFile, tow: { ...verbsFile.tow, rig: 'rig.resonance' } }
    expect(readVerbRows(noTow, GATE_ROWS.rigs)).toEqual({
      problems: [
        'extractor rig.resonance must carry exactly one verb',
        'extractor rig.aether_tether must carry exactly one verb',
      ],
    })
  })
})
