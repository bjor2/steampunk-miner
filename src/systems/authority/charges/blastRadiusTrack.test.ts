import { describe, expect, it } from 'vitest'
import { blastRadiusLevelPrice } from '../../economy/blastingCharges'
import { chargePrice } from '../../economy/chargeSizes'
import { toCanonical } from '../../money'
import { createAuthorityState } from '../authorityState'
import { applyCommand, type CommandOutcome } from '../applyCommand'
import type { CommandIntent } from '../authorityCommand'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, WORLD_SEED, type ScriptedSession } from '../scriptedSession'
import { baseR2Of, groundR2Of } from './blastDisc'
import {
  BACKED_OFF_TILE,
  ofType,
  plantOnWall,
  poseOnTile,
  prepareBlaster,
  setChargesIntent,
} from './chargeFixtures'

const BUY_LEVEL: CommandIntent<'buyBlastRadiusLevel'> = {
  type: 'buyBlastRadiusLevel',
  payload: { chain: 0 },
}

const FUSE_TICKS = 120
const SIZE_1_RADIUS_MM = 2500

function setLevel(level: number): CommandIntent<'debug.setBlastRadiusLevel'> {
  return { type: 'debug.setBlastRadiusLevel', payload: { level } }
}

/** A session on `planetIndex` with money, docked at one bay, answering each intent's events. */
function shopOn(planetIndex: number, bay: 'sell' | 'upgrade' = 'upgrade', money = '1e30') {
  let outcome: CommandOutcome = {
    state: createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    events: [],
  }
  let seq = 0
  const submit = (intent: CommandIntent) => {
    seq += 1
    outcome = applyCommand(outcome.state, { playerId: 'p1', tick: seq, seq, ...intent })
    return outcome.events
  }
  submit({ type: 'debug.setMoney', payload: { amount: money } })
  submit({ type: 'debug.teleportToDock', payload: { bay } })
  return {
    submit,
    charges: () => outcome.state.players.p1.vehicle.charges,
    wallet: () => outcome.state.players.p1.wallet,
  }
}

/** Plants a size-1 charge from the stand, backs off and answers the blast's `BlastStarted`. */
function blastStartedOf(session: ScriptedSession, plantTick: number) {
  plantOnWall(session, plantTick)
  session.submit(plantTick + 1, poseOnTile(BACKED_OFF_TILE))
  const before = session.events().length
  session.advanceTo(plantTick + FUSE_TICKS + 5)
  const [started] = ofType(session.events().slice(before) as DomainEvent[], 'BlastStarted')
  return started
}

describe('the Blast Radius track at the Upgrade bay (D9 #869)', () => {
  it('raises the level one step on planet 1 for the track price, logged with its chain', () => {
    const shop = shopOn(1)
    expect(shop.submit(BUY_LEVEL)).toEqual([
      expect.objectContaining({
        type: 'BlastRadiusUpgraded',
        from: 0,
        to: 1,
        price: toCanonical(blastRadiusLevelPrice(0, 1)),
        chain: 0,
      }),
    ])
    expect(shop.charges().radiusLevel).toBe(1)
  })

  it('prices each next level on the curve times the planet, with no planet gate', () => {
    const shop = shopOn(40)
    shop.submit(BUY_LEVEL)
    expect(shop.submit(BUY_LEVEL)).toMatchObject([
      {
        type: 'BlastRadiusUpgraded',
        from: 1,
        to: 2,
        price: toCanonical(blastRadiusLevelPrice(1, 40)),
      },
    ])
  })

  it('has no top: a rig at level 1e6 still buys the next level', () => {
    const shop = shopOn(1, 'upgrade', '1e300000')
    shop.submit(setLevel(1_000_000))
    expect(shop.submit(BUY_LEVEL)).toMatchObject([
      { type: 'BlastRadiusUpgraded', from: 1_000_000, to: 1_000_001 },
    ])
  })

  it('sells at the Upgrade bay only and never for less than the price, changing nothing', () => {
    const atSell = shopOn(1, 'sell')
    expect(atSell.submit(BUY_LEVEL)).toMatchObject([{ reason: 'wrong_bay' }])
    const broke = shopOn(1, 'upgrade', '0')
    expect(broke.submit(BUY_LEVEL)).toMatchObject([{ reason: 'money_short' }])
    expect(broke.charges()).not.toHaveProperty('radiusLevel')
  })

  it('never reprices a charge: a size costs the same at every level', () => {
    const shop = shopOn(5)
    shop.submit(BUY_LEVEL)
    shop.submit(setLevel(10))
    expect(shop.submit({ type: 'restockCharges', payload: { size: 6, count: 1 } })).toMatchObject([
      { type: 'ChargesRestocked', price: toCanonical(chargePrice(6, 1, 5)) },
    ])
  })

  it('keeps no level key on a rig that owns none, so its state hashes as before', () => {
    const shop = shopOn(1)
    shop.submit(setLevel(3))
    shop.submit(setLevel(0))
    expect(shop.charges()).toEqual({
      isRackMounted: false,
      slotLevel: 0,
      carriedBySize: {},
      planted: null,
    })
  })
})

describe("a blast reads the planter's owned Blast Radius level (D9 #869)", () => {
  it('blows a charge carried from before the level at the new radius: stock is never stranded', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    session.submit(0, setLevel(10))
    const started = blastStartedOf(session, 1)
    const disc = { radiusMm: SIZE_1_RADIUS_MM, radiusLevel: 10 }
    expect(started).toMatchObject({
      radiusLevel: 10,
      baseR2: String(baseR2Of({ radiusMm: SIZE_1_RADIUS_MM, radiusLevel: 0 })),
      groundR2: String(groundR2Of(disc)),
    })
  })

  it('keeps the level after a rack is refilled, every charge after it blowing at it too', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    session.submit(0, setLevel(10))
    session.submit(0, setChargesIntent(2))
    expect(blastStartedOf(session, 1).radiusLevel).toBe(10)
  })

  it('blows at level 0 for a rig that never bought one, the rung as shipped', () => {
    const session = createScriptedSession()
    prepareBlaster(session, 0)
    expect(blastStartedOf(session, 1)).toMatchObject({
      radiusLevel: 0,
      groundR2: String(baseR2Of({ radiusMm: SIZE_1_RADIUS_MM, radiusLevel: 0 })),
    })
  })
})
