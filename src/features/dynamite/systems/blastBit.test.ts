import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import { cmp, fromCanonical, toCanonical, ZERO_MONEY } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { nodeCostOf } from '../../tech-tree'
import { BLAST_BIT_NODE_ID, ownsBlastBit } from './blastBit'

// D5 #864: the blast bit is a tech node priced by money alone, on the tree's node curve, with no
// planet gate and no cap; researched, it is owned on every planet.

const PLAYER = 'p1'
const FAR_PLANET = 200

function sessionOn(planetIndex: number, money: string): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } } as CommandIntent)
  session.submit({ type: 'debug.setMoney', payload: { amount: money } } as CommandIntent)
  return session
}

function researchBlastBit(session: BotSession): readonly DomainEvent[] {
  return session.submit({
    type: 'tech-tree.unlock_node',
    payload: { nodeId: BLAST_BIT_NODE_ID },
  } as CommandIntent)
}

function blastBitPrice(): string {
  return toCanonical(nodeCostOf(BLAST_BIT_NODE_ID) ?? fromCanonical('0'))
}

const refusalsOf = (events: readonly DomainEvent[]) =>
  events.flatMap((event) => (event.type === 'tech-tree.TechNodeRefused' ? [event.reason] : []))

describe('dynamite: the blast bit node (D5 #864)', () => {
  it('registers one drill-gear node under blasting_charges, unlocking no store item', () => {
    const nodes = contentOf('tech-node').filter((node) => node.id === BLAST_BIT_NODE_ID)
    expect(nodes).toMatchObject([
      { lane: 'drill-gear', requiresFeature: ['blasting_charges'], costKind: 'capability' },
    ])
    expect(vehicleItemOfferOf(nodes[0].unlocks)).toBeNull()
  })

  it('is researched on planet 1 for its price, and then owned', () => {
    const session = sessionOn(1, blastBitPrice())
    expect(ownsBlastBit(session.state(), PLAYER)).toBe(false)
    expect(refusalsOf(researchBlastBit(session))).toEqual([])
    expect(ownsBlastBit(session.state(), PLAYER)).toBe(true)
    expect(cmp(session.state().players[PLAYER].wallet, ZERO_MONEY)).toBe(0)
  })

  it('is refused only for money, on planet 1 as on planet 200', () => {
    const short = (planetIndex: number) => refusalsOf(researchBlastBit(sessionOn(planetIndex, '0')))
    expect(short(1)).toEqual(['money_short'])
    expect(short(FAR_PLANET)).toEqual(['money_short'])
    expect(refusalsOf(researchBlastBit(sessionOn(FAR_PLANET, blastBitPrice())))).toEqual([])
  })
})
