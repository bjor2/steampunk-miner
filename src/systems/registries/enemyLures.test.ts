import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../authority/authorityState'
import {
  CORRIDOR_MIDDLE,
  corridorCommands,
  prepareCorridor,
  spawnEnemy,
} from '../authority/combat/combatFixtures'
import { stepEnemy } from '../authority/combat/enemyBehaviour'
import { planetParamsOf } from '../authority/planetOfState'
import { createScriptedSession } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import type { Lure } from '../enemies/lureTarget'
import { FACING } from '../vehicle/vehiclePose'

// A slice's lure draws hunters off the vehicle while it sounds (ticket 361, the #262 split), only
// with the dev flag `enemy.lureRetarget` on. Fake slices register through withRegistrations, so no
// real slice is imported.

const LURE_ON: AuthorityDevFlags = { ...AUTHORITY_DEV_FLAGS, 'enemy.lureRetarget': true }

/** Five tiles left of the vehicle: past a crawler's 4-tile lunge, so it walks to the vehicle. */
const SPAWN_DX = -5
/** The corridor's left end, a tile past the crawler, away from the vehicle. */
const LURE_CELL = { tx: CORRIDOR_MIDDLE.tx - 6, ty: CORRIDOR_MIDDLE.ty }
const LURE_REACH_MM = 3000
const RETARGET_TICKS = 6

/** The tick the corridor fight starts at (`prepareCorridor`). */
const FIGHT_START = corridorCommands(FACING.right).at(-1)?.tick ?? 0
/** Ticks after the fight starts that the lure sounds from, and until. */
const SOUNDS_FROM = 10
const SOUNDS_UNTIL = 30

/** A slice sounding one lure on `LURE_CELL` from `fromTick` until `untilTick` of the fight. */
function whistleSlice(fromTick: number, untilTick: number, reachMm = LURE_REACH_MM) {
  const lure: Lure = { cell: LURE_CELL, reachMm, untilTick: FIGHT_START + untilTick }
  const luresAt = (tick: number) => (tick < FIGHT_START + fromTick ? [] : [lure])
  return {
    id: 'whistle',
    register: (r) => r.enemyLure({ id: 'whistle.lure', luresAt: (_, tick) => luresAt(tick) }),
  } satisfies SliceDefinition
}

/** A slice whose lures may never be asked for. */
const unaskedSlice: SliceDefinition = {
  id: 'unasked',
  register: (r) =>
    r.enemyLure({
      id: 'unasked.lure',
      luresAt: () => {
        throw new Error('lures read with enemy.lureRetarget off')
      },
    }),
}

function corridorFight() {
  const session = createScriptedSession()
  const start = prepareCorridor(session, FACING.right)
  session.submit(start, spawnEnemy('crawler', 1, SPAWN_DX))
  session.advanceTo(start)
  return { state: session.state(), start }
}

/** The crawler's x each tick for `ticks` ticks of its own step under `flags`, from the start. */
function crawlerXsWith(slices: readonly SliceDefinition[], flags: AuthorityDevFlags, ticks = 40) {
  return withRegistrations(slices, () => {
    const fight = corridorFight()
    let state: AuthorityState = fight.state
    const xs: number[] = [state.combat.enemies[0].x]
    for (let at = 1; at <= ticks; at++) {
      state = stepEnemy(state, 'e1', terrainOf(state), fight.start + at, flags).state
      xs.push(state.combat.enemies[0].x)
    }
    return xs
  })
}

function terrainOf(state: AuthorityState) {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('the corridor planet generates')
  return { world: state.world, params }
}

/** The first tick in [from, to] at which x has moved the way `sign` says since the tick before. */
function firstTickMoving(xs: readonly number[], sign: 1 | -1, from: number, to: number) {
  for (let at = from; at <= to; at++) if (Math.sign(xs[at] - xs[at - 1]) === sign) return at
  return null
}

const toward = { vehicle: 1, lure: -1 } as const

describe('enemy lures', () => {
  it('walks a crawler at the vehicle before the lure sounds', () => {
    const xs = crawlerXsWith([whistleSlice(SOUNDS_FROM, SOUNDS_UNTIL)], LURE_ON)
    expect(firstTickMoving(xs, toward.vehicle, 1, SOUNDS_FROM)).not.toBeNull()
  })

  it('turns a crawler in reach to the lure cell within 6 ticks of it sounding', () => {
    const xs = crawlerXsWith([whistleSlice(SOUNDS_FROM, SOUNDS_UNTIL)], LURE_ON)
    const turned = firstTickMoving(xs, toward.lure, SOUNDS_FROM, SOUNDS_FROM + RETARGET_TICKS)
    expect(turned).not.toBeNull()
  })

  it('keeps the crawler on the lure for the whole time it sounds', () => {
    const xs = crawlerXsWith([whistleSlice(SOUNDS_FROM, SOUNDS_UNTIL)], LURE_ON)
    const turned = firstTickMoving(xs, toward.lure, SOUNDS_FROM, SOUNDS_UNTIL) ?? SOUNDS_FROM
    expect(firstTickMoving(xs, toward.vehicle, turned + 1, SOUNDS_UNTIL - 1)).toBeNull()
  })

  it('sends the crawler back to the vehicle within 6 ticks of the lure ending', () => {
    const xs = crawlerXsWith([whistleSlice(SOUNDS_FROM, SOUNDS_UNTIL)], LURE_ON)
    const back = firstTickMoving(xs, toward.vehicle, SOUNDS_UNTIL, SOUNDS_UNTIL + RETARGET_TICKS)
    expect(back).not.toBeNull()
  })

  it('leaves a crawler beyond the reach on the vehicle', () => {
    const xs = crawlerXsWith([whistleSlice(SOUNDS_FROM, SOUNDS_UNTIL, 500)], LURE_ON)
    expect(firstTickMoving(xs, toward.lure, 1, SOUNDS_UNTIL)).toBeNull()
  })

  it('steps exactly as with nothing registered while the flag is off', () => {
    const flagOff = crawlerXsWith([whistleSlice(SOUNDS_FROM, SOUNDS_UNTIL)], AUTHORITY_DEV_FLAGS)
    expect(flagOff).toEqual(crawlerXsWith([], AUTHORITY_DEV_FLAGS))
  })

  it('never asks a lure source while the flag is off, so a session plays as before', () => {
    const fightWith = (slices: readonly SliceDefinition[]) =>
      withRegistrations(slices, () => {
        const session = createScriptedSession()
        const start = prepareCorridor(session, FACING.right)
        session.submit(start, spawnEnemy('crawler', 1, SPAWN_DX))
        session.advanceTo(start + 120)
        return stateDigest(session.state())
      })
    expect(fightWith([unaskedSlice])).toBe(fightWith([]))
  })
})
