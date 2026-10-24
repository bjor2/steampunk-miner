import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { drillHeadQuadsOf } from '../../../systems/render/vehicleLook'
import {
  badgeAt,
  isInsideBox,
  markRectOf,
  pipRanksOf,
  type RigLookBadge,
} from './render/rigLookBadges'
import { bodyBoxOf, FUEL_TANK_LINE, rigLookBadgesOf } from './rigLookBadgeSet'
import { SHIPPED_RIG_LOOKS } from './rigLooks'
import { RIG_LOOK_TABLE } from './rigLookTable'

const VISUAL_TIERS = [1, 2, 3]
const FINISH = { colour: '#d8b45a', metalness: 0.9, roughness: 0.3 }

/** Every line at `n` purchases and the tank at `tankLevel`. */
function ownedAt(n: number, tankLevel = 1) {
  return { purchasesOf: () => n, tankLevel }
}

const badgesAt = (n: number, tankLevel: number, tier: number) =>
  rigLookBadgesOf(SHIPPED_RIG_LOOKS, ownedAt(n, tankLevel), SHIPPED_ART, tier)

function marksInsidePlate(badge: RigLookBadge): boolean {
  const plate = {
    left: badge.plate.x - badge.plate.width / 2,
    right: badge.plate.x + badge.plate.width / 2,
    bottom: badge.plate.y - badge.plate.height / 2,
    top: badge.plate.y + badge.plate.height / 2,
  }
  return badge.marks.every((mark) => isInsideBox(markRectOf(mark), plate))
}

describe('rig look pip ranks (ticket 809)', () => {
  it('shows the leading digit and its place, so magnitude reads at a glance', () => {
    expect(pipRanksOf(0)).toEqual({ place: 0, count: 0 })
    expect(pipRanksOf(7)).toEqual({ place: 0, count: 7 })
    expect(pipRanksOf(11)).toEqual({ place: 1, count: 1 })
    expect(pipRanksOf(90_909)).toEqual({ place: 4, count: 9 })
    expect(pipRanksOf(2_147_483_647)).toEqual({ place: 9, count: 2 })
  })

  it('never shows fewer marks of the same shape as the pips rise', () => {
    let before = pipRanksOf(0)
    for (let pips = 1; pips < 100_000; pips++) {
      const now = pipRanksOf(pips)
      expect(now.place > before.place || now.count >= before.count).toBe(true)
      before = now
    }
  })

  it('draws one mark per unit of each shown digit, in the shape of their place', () => {
    const badge = badgeAt('engine', FINISH, 34, [0, 0], { left: -2, right: 2, bottom: -1, top: 1 })
    expect(badge.marks).toHaveLength(3)
    expect(new Set(badge.marks.map((mark) => mark.shape))).toEqual(new Set(['bar']))
    expect(
      badgeAt('engine', FINISH, 340, [0, 0], { left: -2, right: 2, bottom: -1, top: 1 }).marks[0]
        .shape,
    ).toBe('diamond')
  })
})

describe('rig look badges on the rig (ticket 809)', () => {
  it('shows no badge while every line is on its authored steps or below them', () => {
    for (const tier of VISUAL_TIERS) {
      expect(badgesAt(0, 1, tier)).toEqual([])
      expect(badgesAt(5, 5, tier).filter((badge) => badge.line === 'boiler')).toEqual([])
    }
  })

  it('badges every line past its art, the fuel tank included, so no band renders invisible', () => {
    const lines = badgesAt(1_000_000, 1_000_000, 1).map((badge) => badge.line)
    expect(lines).toEqual([...RIG_LOOK_TABLE.tracks.map((rows) => rows.track), FUEL_TANK_LINE])
  })

  it('wears the band’s finish on the plate', () => {
    const [drill] = badgesAt(60, 1, 1)
    expect(drill).toMatchObject({
      line: 'drill_power',
      finishColour: RIG_LOOK_TABLE.finishes.gilt.colour,
    })
  })

  it.each(VISUAL_TIERS)(
    'keeps every plate and mark inside the rig body’s box at tier %i, maxed',
    (tier) => {
      const body = bodyBoxOf(SHIPPED_ART, tier)
      for (const n of [60, 1_000, 1_000_000, 2_147_483_647]) {
        for (const badge of badgesAt(n, n, tier)) {
          expect({ line: badge.line, n, inside: isInsideBox(badge.plate, body) }).toMatchObject({
            inside: true,
          })
          expect({ line: badge.line, n, marks: marksInsidePlate(badge) }).toMatchObject({
            marks: true,
          })
        }
      }
    },
  )

  it.each(VISUAL_TIERS)(
    'leaves the drill head where it is drawn at tier %i, so the tip stays on the cut face',
    (tier) => {
      const before = JSON.stringify(drillHeadQuadsOf(SHIPPED_ART, tier))
      badgesAt(1_000_000, 1_000_000, tier)
      expect(JSON.stringify(drillHeadQuadsOf(SHIPPED_ART, tier))).toBe(before)
    },
  )
})
