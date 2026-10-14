import { describe, expect, it } from 'vitest'
import {
  CORRIDOR_MIDDLE,
  prepareCorridor,
  spawnEnemy,
} from '../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../systems/authority/scriptedSession'
import { FACING, tileOfMillimetres } from '../../systems/vehicle/vehiclePose'
import { chargesLeftOf, intentToUseSlot } from '../power-up-core'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { WARNING_CHIME_ID } from './systems/aethericCombos'
import { WHISTLE_ID } from './systems/whistleItem'
import { whistleOf } from './systems/whistleSection'

// Warning chime (ticket 373, aetheric × sensing): the periscope sights an enemy starting its
// lunge's wind-up and the whistle, off cooldown, is pressed on its own to sound on that enemy's
// tile, at its own reach and duration, spending its charge and energy and cooling down as usual.
// In the corridor fight of `combatFixtures.ts`: a crawler walks in from five tiles left, well inside
// the periscope's ten, and winds up its lunge once it is close enough.

const PERISCOPE_ID = 'passive.threat_periscope'
const WHISTLE = AETHERIC_ECONOMY.resonanceWhistle
const SLOTS = { 'powerup.1': WHISTLE_ID }
const OWNED = [PERISCOPE_ID, WARNING_CHIME_ID]
/** Long enough for the crawler to close in and wind up, and the chimed blow to act. */
const FIGHT_TICKS = 240

interface ChimeFight {
  session: ScriptedSession
  start: number
}

function chimeFight({ owned = OWNED, pressByHand = false } = {}): ChimeFight {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, setVehicleLoadoutCommand(SLOTS, owned))
  if (pressByHand) session.submit(start, intentToUseSlot('powerup.1'))
  session.submit(start, spawnEnemy('crawler', 1, -5))
  session.advanceTo(start + FIGHT_TICKS)
  return { session, start }
}

const ofType = (session: ScriptedSession, type: string): DomainEvent[] =>
  session.events().filter((event) => event.type === type)

/** The chime's event: the tick the crawler first wound up, and the tile it stood on then. */
function chimedOf(session: ScriptedSession): DomainEvent {
  const [chimed] = ofType(session, 'aetheric.WarningChimed')
  return chimed
}

describe('warning chime', () => {
  it('presses the whistle on its own when the periscope sights a wind-up', () => {
    const { session } = chimeFight()
    const chimed = chimedOf(session)
    expect(chimed).toMatchObject({ playerId: 'p1', itemId: WARNING_CHIME_ID })
    const auto = ofType(session, 'power-up-core.PowerUpAutoFired')
    expect(auto).toHaveLength(1)
    expect(auto[0]).toMatchObject({ itemId: WHISTLE_ID, tick: chimed.tick })
  })

  it("sounds on the sighted enemy's tile at the whistle's own reach and duration", () => {
    const { session } = chimeFight()
    const chimed = chimedOf(session)
    const [sounded] = ofType(session, 'aetheric.WhistleSounded')
    expect(sounded.tick).toBe(chimed.tick + WHISTLE.windupTicks)
    expect(sounded).toMatchObject({
      tx: 'tx' in chimed ? chimed.tx : null,
      ty: 'ty' in chimed ? chimed.ty : null,
      reachTiles: WHISTLE.reachTiles,
      durationTicks: WHISTLE.durationTicks,
      energy: WHISTLE.energyQuanta,
    })
    expect('tx' in sounded && sounded.tx).not.toBe(CORRIDOR_MIDDLE.tx)
    expect(whistleOf(session.state(), 'p1').chime).toBeUndefined()
  })

  it('names the enemy the periscope sighted and the tile it wound up on', () => {
    const { session } = chimeFight()
    const chimed = chimedOf(session)
    const crawler = session.state().combat.enemies[0]
    expect('enemyId' in chimed && chimed.enemyId).toBe(crawler.id)
    const atWindup = tileOfMillimetres(crawler.x, crawler.y)
    expect('ty' in chimed && chimed.ty).toBe(atWindup.ty)
  })

  it('logs power_up_used beside warning_chimed and spends one charge', () => {
    const { session } = chimeFight()
    const used = ofType(session, 'power-up-core.PowerUpUsed')
    expect(used.map((event) => 'itemId' in event && event.itemId)).toEqual([WHISTLE_ID])
    expect(chargesLeftOf(session.state(), 'p1', WHISTLE_ID)).toBe(WHISTLE.charges - 1)
  })

  it('never chimes inside the gap after a press by hand: the hand blow is the only one', () => {
    const { session, start } = chimeFight({ pressByHand: true })
    expect(ofType(session, 'aetheric.WarningChimed')).toEqual([])
    const [sounded] = ofType(session, 'aetheric.WhistleSounded')
    expect(sounded.tick).toBe(start + WHISTLE.windupTicks)
    expect(sounded).toMatchObject({ tx: CORRIDOR_MIDDLE.tx, ty: CORRIDOR_MIDDLE.ty })
  })

  it('never chimes without the combo, or without the periscope owned', () => {
    ;[[], [PERISCOPE_ID], [WARNING_CHIME_ID]].forEach((owned) => {
      const { session } = chimeFight({ owned })
      expect(ofType(session, 'aetheric.WarningChimed')).toEqual([])
      expect(ofType(session, 'power-up-core.PowerUpAutoFired')).toEqual([])
    })
  })
})
