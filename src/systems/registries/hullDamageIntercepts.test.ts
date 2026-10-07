import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS, COLLAPSE_WARN_TICKS } from '../../constants/balance'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { BAND_1_Y, digAlong, prepareDigger } from '../authority/collapse/collapseFixtures'
import { forceCollapseCommand } from '../authority/collapse/collapseCommands'
import { prepareCorridor, spawnEnemy } from '../authority/combat/combatFixtures'
import type { DomainEvent } from '../authority/domainEvent'
import { createScriptedSession } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import { fromCanonical, mul } from '../money'
import { FACING } from '../vehicle/vehiclePose'
import { blockContaining, blockIdOf } from '../world/collapseBlock'
import type { InterceptedDamageSource } from './hullDamageIntercepts'

// A slice's shield scales enemy hits and collapse crush, never below half (ticket 233, the GD
// lock on #204); fake slices register through withRegistrations, so no real slice is imported.

/** A slice whose intercept answers `scaleBp` for the sources it names, every tick. */
function shieldSlice(
  id: string,
  scaleBp: number,
  sources: readonly InterceptedDamageSource[] = ['drill-contact enemy', 'collapse'],
): SliceDefinition {
  return {
    id,
    register: (r) =>
      r.hullDamageIntercept({
        id: `${id}.shield`,
        damageScaleBpOf: (_state, _playerId, source) => (sources.includes(source) ? scaleBp : null),
      }),
  }
}

const share = (amount: string, fraction: string) =>
  mul(fromCanonical(amount), fromCanonical(fraction))

const damageOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'VehicleDamaged' ? [event] : []))

/** A crawler's first hit on a vehicle facing away from it: a rear hit of 2x its base. */
function rearHitWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    const start = prepareCorridor(session, FACING.left)
    session.submit(start, spawnEnemy('crawler', 1, 3))
    session.advanceTo(start + 300)
    return { hit: damageOf(session.events())[0], digest: stateDigest(session.state()) }
  })
}

/** A band-1 tunnel collapsing on the stopped vehicle: 8% of its 100 hull. */
function crushWith(slices: readonly SliceDefinition[]) {
  return withRegistrations(slices, () => {
    const session = createScriptedSession()
    prepareDigger(session, 0)
    const dug = digAlong(session, 0, BAND_1_Y, 20500, 30500)
    const back = digAlong(session, dug, BAND_1_Y, 30500, 26500, 0)
    const block = blockIdOf(blockContaining({ xMm: 26500, yMm: BAND_1_Y }))
    session.submit(back, forceCollapseCommand(block))
    session.advanceTo(back + COLLAPSE_WARN_TICKS + COLLAPSE_FILL_TICKS)
    return damageOf(session.events()).filter((event) => event.source === 'collapse')
  })
}

describe('hull damage intercepts', () => {
  it('leaves every hit and the state as they were with no shield or one that lets all through', () => {
    const plain = rearHitWith([])
    expect(plain.hit).toMatchObject({ source: 'drill-contact enemy', arc: 'rear' })
    expect(rearHitWith([shieldSlice('no-shield', 10000)])).toEqual(plain)
  })

  it('scales an enemy hit by the share the shield lets through', () => {
    const plain = rearHitWith([]).hit
    const shielded = rearHitWith([shieldSlice('shield', 8000)]).hit
    expect(fromCanonical(shielded.amount)).toEqual(share(plain.amount, '0.8'))
  })

  it('never takes an enemy hit below half, however many shields stack', () => {
    const plain = rearHitWith([]).hit
    const blocked = rearHitWith([shieldSlice('shield-a', 0), shieldSlice('shield-b', 6000)]).hit
    expect(fromCanonical(blocked.amount)).toEqual(share(plain.amount, '0.5'))
  })

  it('floors a collapse crush at half too: 4 of the 8 hull a full block would take', () => {
    expect(crushWith([]).map((crush) => crush.amount)).toEqual(['8e+0'])
    expect(crushWith([shieldSlice('shield', 0)])).toMatchObject([
      { amount: '4e+0', hullAfter: '9.6e+1' },
    ])
  })

  it('asks only about the source the intercept names', () => {
    const enemyOnly = shieldSlice('shield', 0, ['drill-contact enemy'])
    expect(crushWith([enemyOnly]).map((crush) => crush.amount)).toEqual(['8e+0'])
  })
})
