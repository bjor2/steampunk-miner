import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { describeItem, type ItemRef } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { flavourProblemsOf } from '../../descriptions'
import { boreGunCards, cardPriceOf } from './boreGunCards'
import { BORE_GUN_KIND, MOUNT_PART_ID, trackPartIdOf } from './boreGunContent'
import { mountedLevels, UNMOUNTED_GUN, withGunLevels } from './gunLevels'
import { mountPrice, nextLevelPrice } from './gunPurchase'
import { wallLevelOf } from './gunTracks'

const state = withGunLevels(
  createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] }),
  'p1',
  mountedLevels(),
)

function cardOf(id: string, level: number) {
  const ref: ItemRef = { kind: BORE_GUN_KIND, id }
  const ctx = { playerId: 'p1', planetIndex: 1, level, view: itemSnapshotViewOf(state, 'p1') }
  const card = describeItem(ref, ctx)
  if (card === null) throw new Error(`no card for ${id}`)
  return card
}

const lineOf = (id: string, level: number, label: string) => {
  const line = cardOf(id, level).statLines.find((candidate) => candidate.label === label)
  if (line === undefined) throw new Error(`no ${label} line on ${id}`)
  return line
}

describe('ground-gun: the cards (#159)', () => {
  it('writes every flavour line to the #159 voice rules', () => {
    for (const card of boreGunCards()) {
      expect(flavourProblemsOf(card.flavour as string)).toEqual([])
    }
  })

  it('reaches every part from planet 1, where the bore_gun row opens', () => {
    expect(boreGunCards().flatMap((card) => card.refs?.(1) ?? [])).toEqual(
      [MOUNT_PART_ID, ...['rate', 'penetration', 'energy'].map((id) => `ground-gun.${id}`)].map(
        (id) => ({ kind: BORE_GUN_KIND, id }),
      ),
    )
  })

  it('prices each part at the debit its buy takes: the mount until bought, then each next level', () => {
    expect(cardPriceOf(UNMOUNTED_GUN, MOUNT_PART_ID)).toEqual(mountPrice())
    expect(cardPriceOf(UNMOUNTED_GUN, trackPartIdOf('rate'))).toBeNull()
    expect(cardPriceOf(mountedLevels(), MOUNT_PART_ID)).toBeNull()
    expect(cardPriceOf(mountedLevels(), trackPartIdOf('energy'))).toEqual(
      nextLevelPrice(mountedLevels(), 'energy'),
    )
    const atWall = { ...mountedLevels(), rate: wallLevelOf('rate') }
    expect(cardPriceOf(atWall, trackPartIdOf('rate'))).toBeNull()
  })

  it('shows the next level on each track', () => {
    const penetration = lineOf(trackPartIdOf('penetration'), 1, 'Bore power (% of the drill)')
    expect([penetration.now, penetration.next]).toEqual(['49', '52'])
  })

  it('shows the energy track falling toward the drill share', () => {
    const energy = lineOf(trackPartIdOf('energy'), 1, 'Energy a cell (% of drilling)')
    expect([energy.now, energy.next]).toEqual(['198', '191'])
  })

  it('shows more shots a minute in open ground for each rate level, none past the wall', () => {
    const label = 'Shots a minute in open ground'
    expect([
      lineOf(trackPartIdOf('rate'), 1, label).now,
      lineOf(trackPartIdOf('rate'), 1, label).next,
    ]).toEqual(['80', '85'])
    expect(lineOf(trackPartIdOf('rate'), wallLevelOf('rate'), label).next).toBeUndefined()
  })
})
