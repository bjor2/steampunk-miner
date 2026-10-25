import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { continueScriptedSession, poseInBay } from '../authority/scriptedSession'
import { casingUpgradePrice } from '../economy/casingPrices'
import { fromCanonical, sub, toCanonical } from '../money'
import { buyCasingGradeCommand } from '../platform/platformCommands'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import { readMigratedSaveSlot } from './saveMigrations'

/** The pre-#175 fixture's one player: casing grade 2 and 999897 held, written before #894. */
const PLAYER = 'player_1'

const undock = { type: 'undock', payload: {} } as const
const dockAt = (bay: 'sell' | 'upgrade') => ({ type: 'dock', payload: { bay } }) as const
/** A hop's fuel into the empty 10-unit tank: P1 -> P2 and P2 -> P3 take 5, P3 -> P1 takes 6. */
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const jumpTo = (planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system: '1', planet } }) as const

function restoredState(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** From the loaded save, docked on P1: out to P2 and P3, so P1-P3 are visited, fuelled on P3. */
function visitPlanetsTwoAndThree(start: AuthorityState) {
  const session = continueScriptedSession(start)
  const tick = start.tick
  session.submit(tick + 1, buyFuel(5), PLAYER)
  session.submit(tick + 2, jumpTo('2'), PLAYER)
  session.submit(tick + 3, buyFuel(5), PLAYER)
  session.submit(tick + 4, jumpTo('3'), PLAYER)
  session.submit(tick + 5, buyFuel(6), PLAYER)
  return session
}

const walletOf = (state: AuthorityState) => state.players[PLAYER].wallet

const rejectionsOf = (events: readonly DomainEvent[]) =>
  events.filter((event) => event.type === 'CommandRejected')

const casingBuysOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'CasingUpgraded' ? [event] : []))

// #894 done-when (TD): a save stores no prices, so an old save keeps its grades and money and
// buys at the rows of the build that loads it; nothing migrates.
describe('casing prices on an old save (#894)', () => {
  it('loads the pre-#894 save with its casing grade and money as saved', () => {
    const state = restoredState(PLANET_1_SAVE)
    const saved = PLANET_1_SAVE.profile.players[PLAYER]
    expect(state.players[PLAYER].vehicle.casingGrade).toBe(saved.vehicle.casingGrade)
    expect(toCanonical(walletOf(state))).toBe(toCanonical(fromCanonical(saved.wallet)))
  })

  it('travels P3 -> P1 for fuel only, then pays the new grade row for its next grade', () => {
    const session = visitPlanetsTwoAndThree(restoredState(PLANET_1_SAVE))
    const beforeJump = walletOf(session.state())
    const tick = session.state().tick
    session.submit(tick + 1, jumpTo('1'), PLAYER)
    expect(session.state().planet.index).toBe(1)
    expect(rejectionsOf(session.events())).toEqual([])
    expect(walletOf(session.state())).toEqual(beforeJump)

    session.submit(tick + 2, undock, PLAYER)
    session.submit(tick + 2, poseInBay('upgrade'), PLAYER)
    session.submit(tick + 3, dockAt('upgrade'), PLAYER)
    const bought = session.submit(tick + 4, buyCasingGradeCommand(CLICK_CHAIN), PLAYER)
    expect(casingBuysOf(bought)).toEqual([
      expect.objectContaining({ from: 2, to: 3, price: '2.94e+2' }),
    ])
    expect(toCanonical(casingUpgradePrice(2))).toBe('2.94e+2')
    expect(rejectionsOf(session.events())).toEqual([])
    expect(walletOf(session.state())).toEqual(sub(beforeJump, casingUpgradePrice(2)))
  })

  it.todo('pays the C2 core cost on its first jump to P4 (the planet unlock of #895)')
})
