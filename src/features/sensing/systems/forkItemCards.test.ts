import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { describeItem, type ItemDescription } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { flavourProblemsOf } from '../../descriptions'
import { lastMarkOf } from '../../tech-tree'
import {
  DIVINER_ROD,
  forkLadderOf,
  SCOUT_PINGER,
  SENSING_FORK_ITEM_IDS,
  type SensingForkItemId,
} from './sensingFork'

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 16, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

function cardAt(itemId: SensingForkItemId, level: number): ItemDescription {
  const card = describeItem(
    { kind: 'vehicle-item', id: itemId },
    { playerId: 'p1', planetIndex: 16, level, view },
  )
  if (card === null) throw new Error(`${itemId} has no card`)
  return card
}

function linesOf(card: ItemDescription): string[] {
  return card.statLines.map((line) => `${line.label}: ${line.now}`)
}

const FORK_NOTE = "Sensing fork: pick Scout or Diviner. The other branch's item won't fire."

describe('sensing fork item cards', () => {
  it('reads the scout pinger with Content’s lines and the fork’s numbers', () => {
    const card = cardAt(SCOUT_PINGER, 0)
    expect(card.flavour).toBe('A brass pinger shouts into the rock and maps whatever shouts back.')
    expect(linesOf(card)).toEqual([
      'Ping: marks lava, ore or open cave in every 4×4 block within 20 cells; never which cell, or what tier',
      'Lasts: marks stay until you dock',
      'Charges: 3, then 5 s to recharge',
      'Radius: +0 cells',
      FORK_NOTE,
    ])
  })

  it('reads the diviner rod with Content’s lines and the fork’s numbers', () => {
    const card = cardAt(DIVINER_ROD, 0)
    expect(card.flavour).toBe('A tuned rod that reads the rock dead ahead, cell by cell.')
    expect(linesOf(card)).toEqual([
      'Cone: reveals every cell 8 cells ahead of the drill in a narrow cone, with gate badges',
      'Lasts: 10 s',
      'Warns: shows roof collapses and enemies in the cone while the Diviner is your branch',
      'Charges: 3, then 5 s to recharge',
      'Length: +0 cells',
      FORK_NOTE,
    ])
  })

  it('shows the next Mark on the lines a Mark steps and none on the fixed lines', () => {
    const card = cardAt(DIVINER_ROD, 1)
    const nextByLabel = Object.fromEntries(card.statLines.map((line) => [line.label, line.next]))
    expect(nextByLabel.Charges).toBeDefined()
    expect(nextByLabel.Length).toBeDefined()
    expect(nextByLabel.Cone).toBeUndefined()
    expect(nextByLabel.Lasts).toBeUndefined()
  })

  it('grows the Mark line with the Marks the branch has researched', () => {
    const mastered = lastMarkOf(forkLadderOf(SCOUT_PINGER))
    const radiusLine = cardAt(SCOUT_PINGER, mastered).statLines.find((l) => l.label === 'Radius')
    expect(radiusLine?.now).not.toBe('+0 cells')
    expect(radiusLine?.next).toBeUndefined()
  })

  it('keeps both flavour lines inside the copy rules and clear of yield and price', () => {
    for (const itemId of SENSING_FORK_ITEM_IDS) {
      const card = cardAt(itemId, 1)
      expect(flavourProblemsOf(card.flavour)).toEqual([])
      expect(card.statLines.map((line) => line.label)).not.toContain('Price')
    }
  })
})
