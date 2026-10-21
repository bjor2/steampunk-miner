import { describe, expect, it } from 'vitest'
import { createScriptedSession, mineTile, surfaceOreTiles } from '../authority/scriptedSession'
import { sellCargoCommand } from '../platform/platformCommands'
import { teleportToDockCommand } from '../vehicle/vehicleCommands'
import { DESIGN_TOKENS } from './designSystem'
import { holdSheetOf } from './holdSheet'

// The Hold (spec #678, ticket 688): the Sell bay's ore panel as the base sheet's cargo tab. It
// reads the hold anywhere; its Sell cards act only docked at the Sell bay.

type Session = ReturnType<typeof createScriptedSession>

function sessionWithOre(tiles = 4): Session {
  const session = createScriptedSession()
  surfaceOreTiles(tiles).forEach((tile, index) => mineTile(session, 1 + index * 50, tile))
  return session
}

const wordsOf = (text: string) => text.trim().split(/\s+/).length

describe('hold sheet', () => {
  it('lists a Sell card per held tier, by number, and values Sell all exactly as the sale pays', () => {
    const session = sessionWithOre()
    session.submit(400, teleportToDockCommand('sell'))
    const hold = holdSheetOf(session.state(), 'p1')
    expect(hold.tiers.length).toBeGreaterThan(0)
    expect(hold.tiers.every((card) => card.family === 'mixed' && card.tier > 0)).toBe(true)
    expect(hold.tiers.map((card) => card.title)).toEqual(
      hold.tiers.map((card) => `Tier ${card.tier} ore`),
    )
    const sold = session
      .submit(401, sellCargoCommand('all'))
      .find((event) => event.type === 'ResourceSold')
    expect(sold?.type === 'ResourceSold' && sold.value).toBe(hold.sellAll.value.exact)
  })

  it('sells one tier from its card, with the command the card names', () => {
    const session = sessionWithOre()
    session.submit(400, teleportToDockCommand('sell'))
    const [card] = holdSheetOf(session.state(), 'p1').tiers
    expect(card.sell).toMatchObject({
      reason: null,
      action: { kind: 'submit', intent: sellCargoCommand(card.tier) },
    })
  })

  it('reads the hold away from the dock but greys every Sell with the refusal', () => {
    const hold = holdSheetOf(sessionWithOre().state(), 'p1')
    expect(hold.tiers.length).toBeGreaterThan(0)
    expect(hold.buttons.every((button) => button.reason !== null)).toBe(true)
  })

  it('refuses the sale at the Upgrade bay as the wrong bay', () => {
    const session = sessionWithOre(2)
    session.submit(200, teleportToDockCommand('upgrade'))
    expect(holdSheetOf(session.state(), 'p1').sellAll.sell.reason).toBe('wrong_bay')
  })

  it('offers Sell all even with an empty hold, as the one focus stop', () => {
    const hold = holdSheetOf(createScriptedSession().state(), 'p1')
    expect(hold.tiers).toEqual([])
    expect(hold.focusStops.map((stop) => stop.id)).toEqual(['hold-sell-all'])
  })

  it('steps focus over every Sell in reading order, the tiers then Sell all', () => {
    const hold = holdSheetOf(sessionWithOre().state(), 'p1')
    expect(hold.focusStops.map((stop) => stop.id)).toEqual([
      ...hold.tiers.map((card) => `hold-sell-${card.tier}`),
      'hold-sell-all',
    ])
  })

  it('keeps every card title to 3 words and its line to 12', () => {
    const hold = holdSheetOf(sessionWithOre().state(), 'p1')
    const cards = [...hold.tiers, hold.sellAll]
    expect(cards.every((card) => wordsOf(card.title) <= DESIGN_TOKENS.copy.titleWordsMax)).toBe(
      true,
    )
    expect(cards.every((card) => wordsOf(card.line) <= DESIGN_TOKENS.copy.hoverWordsMax)).toBe(true)
  })
})
