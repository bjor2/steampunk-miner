import { describe, expect, it } from 'vitest'
import { buySlicePurchases } from '../../../systems/bot/botSlicePurchases'
import { botPurchases } from '../../../systems/registries/botPurchases'
import { withoutPacingBotForkPicks } from '../forkPicksOff'
import { PLAYER, sessionOnPlanet } from '../treeTestSession'
import { FORK_CHOICE_BOT_PURCHASE, pacingBotPicksOf } from './forkBotPurchases'
import { forkPairOf, FORK_TIER } from './forkNode'
import { activeForkBranchOf } from './forkSection'
import { registeredCatalogue } from './techTree'

// The GD ruling on #392 (ticket 392): the pacing bot buys gear when it is affordable on its income
// curve, so it chooses the fork branch a lane marks as its pick, Deep on the drill-gear lane, once
// the authority opens the fork and the wallet pays. It never switches.

describe("tech tree: the pacing bot's fork pick", () => {
  it('offers Deep on the drill-gear lane and no branch of any other lane', () => {
    expect(pacingBotPicksOf(registeredCatalogue().nodes)).toEqual([
      { lane: 'drill-gear', branch: 'deep' },
    ])
  })

  it('refuses a pair that marks both its branches as the pick', () => {
    const branch = (name: string) => ({
      branch: name,
      name,
      iconId: 'icon-hud-depth',
      prereqs: [],
      unlocks: `gear.${name}`,
      description: 'A probe.',
      label: 'horizontal' as const,
      isPacingBotPick: true as const,
    })
    expect(() => forkPairOf('drill-gear', [branch('one'), branch('two')])).toThrow(/both/)
  })

  it('chooses Deep at the fork planet when the wallet pays', () => {
    const session = sessionOnPlanet(FORK_TIER)
    buySlicePurchases(session)
    expect(activeForkBranchOf(session.state(), PLAYER, 'drill-gear')).toBe('deep')
  })

  it('leaves the lane unchosen while the wallet cannot pay the choice', () => {
    const session = sessionOnPlanet(FORK_TIER, '0')
    const [pick] = FORK_CHOICE_BOT_PURCHASE.payloadsToTry(session.state(), PLAYER)
    expect(FORK_CHOICE_BOT_PURCHASE.isAvailable(session.state(), PLAYER, pick)).toBe(false)
    buySlicePurchases(session)
    expect(activeForkBranchOf(session.state(), PLAYER, 'drill-gear')).toBeNull()
  })

  it('drops only the fork pick from the bot purchases while it is switched off', () => {
    const ids = () => botPurchases().map((purchase) => purchase.id)
    const loaded = ids()
    const switchedOff = withoutPacingBotForkPicks(ids)
    expect(loaded).toContain(FORK_CHOICE_BOT_PURCHASE.id)
    expect(switchedOff).toEqual(loaded.filter((id) => id !== FORK_CHOICE_BOT_PURCHASE.id))
    expect(ids()).toEqual(loaded)
  })
})
