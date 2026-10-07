import { describe, expect, it } from 'vitest'
import { PLAYER, researchAll, sessionOnPlanet, withFixtureTree } from '../treeTestSession'
import { markLadderOfItem, researchedMarkOf } from './itemMarks'

const ECHO_SOUNDER = 'power.echo_sounder'

describe('tech tree: the Mark an item plays at', () => {
  it('reads Mark 0 for an item the player researched none of', () => {
    withFixtureTree(() => {
      expect(researchedMarkOf(sessionOnPlanet(11).state(), PLAYER, ECHO_SOUNDER)).toBe(0)
    })
  })

  it('reads Mark 1 once the capability is researched, then the highest Mark researched', () => {
    withFixtureTree(() => {
      const session = sessionOnPlanet(11)
      researchAll(session, ['tech.sensing.echo_sounder'])
      expect(researchedMarkOf(session.state(), PLAYER, ECHO_SOUNDER)).toBe(1)
      researchAll(session, [2, 3, 4].map((mark) => `tech.mark.${ECHO_SOUNDER}.${mark}`))
      expect(researchedMarkOf(session.state(), PLAYER, ECHO_SOUNDER)).toBe(4)
    })
  })

  it("hands out the ladder the item's capability carries, and none for an item without Marks", () => {
    withFixtureTree(() => {
      expect(markLadderOfItem(ECHO_SOUNDER)).toEqual({
        isIncomeItem: false,
        cooldown: 300,
        magnitude: { base: 600 },
        charges: 3,
      })
      expect(markLadderOfItem('slot.powerup_4')).toBeNull()
    })
  })
})
