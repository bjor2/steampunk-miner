import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { describeItem, type ItemRef } from '../../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../../systems/registries/itemSnapshotView'
import { lastMarkOf } from '../../tech-tree'
import { FOAM_CARD_LINES, foamLineTextAt } from './foamCards'
import { magnitudeAt, terrainItemNamed } from './itemMagnitude'
import { STABILISER_FOAM_ID } from './stabiliserFoam'
import { markLadderOf } from './terrainItems'

// Stabiliser foam's card (Content on #381, matched to the GD default ruling): Content's flavour
// and lines with their numbers read from the data, a cone Mark capped at +2 (radius 4), and no
// line that says "brace", so foam never reads like the lode clamp.

const FOAM = terrainItemNamed(STABILISER_FOAM_ID)
const LAST_MARK = lastMarkOf(markLadderOf(FOAM))

function cardAt(mark: number) {
  const state = createAuthorityState({ planetIndex: 3, planetSeed: 1, playerIds: ['p1'] })
  const ref: ItemRef = { kind: 'vehicle-item', id: STABILISER_FOAM_ID }
  const view = itemSnapshotViewOf(state, 'p1')
  return describeItem(ref, { playerId: 'p1', planetIndex: 3, level: mark, view })
}

const textsAt = (mark: number) => FOAM_CARD_LINES.map((line) => foamLineTextAt(line, mark))

describe('stabiliser foam card', () => {
  it("reads Content's lines at Mark 1: a 2-cell cone lasting 10 s", () => {
    expect(textsAt(1)).toEqual([
      'sets foam in a forward cone 2 cells deep; the rock there hardens and holds',
      '10 s; foaming again resets the timer',
      'the roof warns again before it can fall',
      'foamed rock keeps its hardness and price',
      '+0 cells, up to +2',
    ])
  })

  it('caps the cone Mark at +2: radius 4 once Mastered, never more', () => {
    expect(magnitudeAt(FOAM, LAST_MARK)).toBe(4)
    expect(magnitudeAt(FOAM, LAST_MARK + 3)).toBe(4)
    expect(textsAt(LAST_MARK)[4]).toBe('+2 cells, up to +2')
  })

  it('never says "brace", and labels the crumble line with no stray comma', () => {
    const words = [FOAM.description, ...FOAM_CARD_LINES.map((line) => line.label)]
    const lines = [...words, ...textsAt(1), ...textsAt(LAST_MARK)]
    expect(lines.filter((line) => /brac/i.test(line))).toEqual([])
    expect(FOAM_CARD_LINES.map((line) => line.label)).toContain('When it crumbles')
  })

  it("shows Content's flavour and lines, then the stack and the price per unit", () => {
    const card = cardAt(1)
    expect(card?.flavour).toBe(
      'Sprays a quick-setting aether foam that hardens loose rock in place.',
    )
    expect(card?.statLines.map((line) => line.label)).toEqual([
      'Tap',
      'Lasts',
      'When it crumbles',
      'Note',
      'Cone',
      'Stack',
      'Price per unit',
    ])
  })
})
