import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS } from '../../../constants/balance'
import { tileOfMillimetres } from '../../vehicle/vehiclePose'
import { blockOfId, samplesOfBlock } from '../../world/collapseBlock'
import { SAMPLES_PER_TILE } from '../../world/sampleGrid'
import { isCarvedAirAt, openSampleLayers } from '../../world/sampleLayers'
import { ofType } from '../charges/chargeFixtures'
import { createScriptedSession, PARAMS, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import {
  BAND_2_Y,
  buildWeakTunnel,
  TUNNEL_FROM_X,
  TUNNEL_TO_X,
  WEAK_TUNNEL_HOLD_TICKS,
} from './collapseFixtures'

// Ticket 829: lining short of the grade its cell needs blinks, then bursts: the existing collapse
// path refills its block, with no crush, no cost and the rig never sealed in. The weak tunnel is
// lined at grade 1 in band 2, one grade short, so it holds 20 s.

const WARN_TICK = 10
const BURST_TICK = WARN_TICK + WEAK_TUNNEL_HOLD_TICKS
const SETTLED_TICK = BURST_TICK + COLLAPSE_FILL_TICKS + 5
const RIG = tileOfMillimetres((TUNNEL_FROM_X + TUNNEL_TO_X) / 2, BAND_2_Y)

function burstTunnel() {
  const session = createScriptedSession()
  buildWeakTunnel(session, WARN_TICK)
  return session
}

/** Whether any sample of the rig's cell in `block` is carved air. */
function isRigCellOpen(session: ScriptedSession, block: string): boolean {
  const named = blockOfId(block)
  if (named === null) throw new Error(`not a block id: ${block}`)
  const layers = openSampleLayers(session.state().world, PARAMS)
  return samplesOfBlock(named).some(
    ({ sx, sy }) =>
      Math.floor(sx / SAMPLES_PER_TILE) === RIG.tx &&
      Math.floor(sy / SAMPLES_PER_TILE) === RIG.ty &&
      isCarvedAirAt(layers, sx, sy),
  )
}

describe('casing burst (ticket 829)', () => {
  it('warns one grade short for 20 s, naming the planet, the cell, both grades and the shortfall', () => {
    const [warned] = ofType(burstTunnel().events(), 'CasingBurstWarned')
    expect(warned).toMatchObject({
      tick: WARN_TICK,
      system: '1',
      place: '1',
      grade: 1n,
      required: 2n,
      delta: 1n,
      holdTicks: WEAK_TUNNEL_HOLD_TICKS,
    })
    expect(Number.isSafeInteger(warned.tx) && Number.isSafeInteger(warned.ty)).toBe(true)
  })

  it('bursts each warned block when its hold runs out, beside its collapse', () => {
    const session = burstTunnel()
    session.advanceTo(BURST_TICK - 1)
    expect(ofType(session.events(), 'CasingBurst')).toEqual([])
    session.advanceTo(SETTLED_TICK)
    const warned = ofType(session.events(), 'CasingBurstWarned').map(({ block }) => block)
    const burst = ofType(session.events(), 'CasingBurst')
    expect(burst.map(({ block }) => block).sort()).toEqual([...warned].sort())
    expect(burst.every(({ tick }) => tick === BURST_TICK)).toBe(true)
    expect(ofType(session.events(), 'CollapseStarted').map(({ tick }) => tick)).toEqual(
      burst.map(({ tick }) => tick),
    )
  })

  it('never damages the rig or takes money in a burst round it', () => {
    const session = burstTunnel()
    const wallet = session.state().players.p1.wallet
    session.advanceTo(SETTLED_TICK)
    expect(ofType(session.events(), 'VehicleDamaged')).toEqual([])
    expect(
      ofType(session.events(), 'CollapseStarted').every(({ vehiclesHit }) => vehiclesHit === 0),
    ).toBe(true)
    expect(session.state().players.p1.wallet).toEqual(wallet)
  })

  it('never seals the rig in: its own cell stays open through the burst', () => {
    const session = burstTunnel()
    const rigBlocks = ofType(session.events(), 'CasingBurstWarned')
      .map(({ block }) => block)
      .filter((block) => isRigCellOpen(session, block))
    expect(rigBlocks.length).toBeGreaterThan(0)
    session.advanceTo(SETTLED_TICK)
    expect(rigBlocks.every((block) => isRigCellOpen(session, block))).toBe(true)
  })

  it('keeps its hold through a save and a load', () => {
    const session = burstTunnel()
    session.advanceTo(WARN_TICK + 100)
    const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
    if (!('state' in loaded)) throw new Error(loaded.problems.join('; '))
    expect(
      loaded.state.collapse.blocks.every((entry) => entry.holdTicks === WEAK_TUNNEL_HOLD_TICKS),
    ).toBe(true)
  })
})
