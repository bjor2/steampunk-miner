import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import { createScriptedSession, dockInBay } from '../../../systems/authority/scriptedSession'
import { buyUpgradeCommand } from '../../../systems/platform/platformCommands'
import { grantMoneyCommand } from '../../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { createRigLookSources, rigLookSourceIdOf } from './rigLookSource'
import { RIG_LOOK_TABLE } from './rigLookTable'

const GLINT = RIG_LOOK_TABLE.glint
const SOURCES = createRigLookSources()
const sourceOf = (track: string) =>
  SOURCES.find((source) => source.id === rigLookSourceIdOf(track))!

/** One click on `track` at the Upgrade bay from `level` owned; the events it answers. */
function buyOneFrom(track: string, level: number): DomainEvent[] {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e60'))
  session.submit(1, setUpgradeCommand(track, level))
  dockInBay(session, 2, 'upgrade')
  return session.submit(3, buyUpgradeCommand(track, CLICK_CHAIN))
}

function flashesOf(track: string, events: readonly DomainEvent[]) {
  return events.map((event) => sourceOf(track).flashOf(event)).filter((flash) => flash !== null)
}

describe('rig look glint (ticket 809)', () => {
  it('glints once on the purchase that takes the engine into its next band', () => {
    const events = buyOneFrom('engine', 4)
    expect(events.map((event) => event.type)).toContain('UpgradePurchased')
    const [flash, ...more] = flashesOf('engine', events)
    expect(more).toEqual([])
    expect(flash.ticks).toBe(GLINT.ticks)
  })

  it('plays nothing for a purchase inside a band', () => {
    expect(flashesOf('engine', buyOneFrom('engine', 5))).toEqual([])
  })

  it("plays nothing on another track's source", () => {
    const events = buyOneFrom('engine', 4)
    for (const rows of RIG_LOOK_TABLE.tracks.filter((each) => each.track !== 'engine')) {
      expect(flashesOf(rows.track, events)).toEqual([])
    }
  })

  it("lights the track's own glow slots in the glint's colour, fading to nothing", () => {
    const [flash] = flashesOf('engine', buyOneFrom('engine', 4))
    const engine = RIG_LOOK_TABLE.tracks.find((rows) => rows.track === 'engine')!
    const first = flash.lookAt(0)!
    expect(first.glows).toEqual(
      engine.glowSlots.map((slots) => ({ slots, colour: GLINT.colour, glow: GLINT.glow })),
    )
    const glows = Array.from({ length: GLINT.ticks }, (_, age) => flash.lookAt(age)!.glows[0].glow)
    glows.slice(1).forEach((glow, at) => expect(glow).toBeLessThan(glows[at]))
    expect(flash.lookAt(GLINT.ticks)).toBeNull()
    expect(first).toMatchObject({ tint: null, outline: null, opacity: 1 })
  })

  it('answers the same kept looks every frame, so a frame allocates nothing', () => {
    const [flash] = flashesOf('engine', buyOneFrom('engine', 4))
    const [again] = flashesOf('engine', buyOneFrom('engine', 9))
    expect(again).toBe(flash)
    expect(flash.lookAt(3)).toBe(flash.lookAt(3))
  })

  it('glints on every line when its purchase crosses a band, the two-tier hull included', () => {
    for (const rows of RIG_LOOK_TABLE.tracks) {
      const lastBefore = rows.band.edges[0] - 1
      expect({
        track: rows.track,
        glints: flashesOf(rows.track, buyOneFrom(rows.track, lastBefore)).length,
      }).toEqual({ track: rows.track, glints: 1 })
    }
  })
})
