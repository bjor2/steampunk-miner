import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { UPGRADE_IDS } from '../../../systems/economy/economyDefinition'
import { slotOfPartId } from '../../../systems/art/artIds'
import { vehicleLookSources } from '../../../systems/registries/vehicleLooks'
import DRILL_LOOK_554 from '../drillLook554Looks.json'
import { createRigLooks, SHIPPED_RIG_LOOKS } from './rigLooks'
import { createRigLookSources, rigLookSourceIdOf } from './rigLookSource'
import { readRigLookTable } from './rigLookTable'
import { RIG_LOOK_TABLE } from './rigLookTable'

const setUpgrade = (upgradeId: string, level: number) => ({
  type: 'debug.setUpgrade' as const,
  payload: { upgradeId, level },
})

const sourceOf = (track: string) =>
  vehicleLookSources().find((source) => source.id === rigLookSourceIdOf(track))!

/** `state` with one player's stored level on a track set, as a replica would hold it. */
function withLevel(state: AuthorityState, playerId: string, track: string, level: number) {
  const player = state.players[playerId]
  const levels = { ...player.vehicle.levels, [track]: level }
  const vehicle = { ...player.vehicle, levels }
  return { ...state, players: { ...state.players, [playerId]: { ...player, vehicle } } }
}

/** Every property path the look reads off the state. */
function pathsReadBy(read: (state: AuthorityState) => unknown, state: AuthorityState): string[] {
  const paths = new Set<string>()
  const watch = (value: unknown, path: string): unknown =>
    typeof value !== 'object' || value === null
      ? value
      : new Proxy(value, {
          get(target, key) {
            const at = `${path}.${String(key)}`
            paths.add(at)
            return watch(Reflect.get(target, key), at)
          },
        })
  read(watch(state, 'state') as AuthorityState)
  return [...paths].sort()
}

/** Part slots drawn by any asset other than the base vehicle and the rig's own look assets. */
function partSlotsOfOtherAssets(): Set<string> {
  const sidecars = [...SHIPPED_ART.placeholderSidecars, ...SHIPPED_ART.exportedSidecars]
  const rigAssetIds = ['vehicle', ...Object.keys(RIG_LOOK_TABLE.lookAssets)]
  return new Set(
    sidecars
      .filter((sidecar) => !rigAssetIds.includes(sidecar.assetId))
      .flatMap((sidecar) => sidecar.parts.map((part) => slotOfPartId(part.id))),
  )
}

type DrillLook554 = (typeof DRILL_LOOK_554.looks)[number]

/**
 * #554's look with its bit glow on `nose`: the drill tip's crowns stand in the bit's place
 * (ticket 579), so the bit's glow lights them too and the nose stays the brightest part (ticket
 * 590). Colours and glows stay #554's.
 */
function withNoseSlots(look: DrillLook554, nose: readonly string[]): DrillLook554 {
  if (look === null) return null
  return {
    ...look,
    glows: look.glows.map((glow, at) => (at === 0 ? { ...glow, slots: [...nose] } : glow)),
  }
}

describe('rig look on the vehicle', () => {
  it('registers one look source per track of the table, keyed rig-look.<track>', () => {
    const ids = vehicleLookSources().map((source) => source.id)
    for (const rows of RIG_LOOK_TABLE.tracks) expect(ids).toContain(rigLookSourceIdOf(rows.track))
  })

  it("paints drill_power as #554 did for every count up to 100, its bit glow on the tip's crowns too", () => {
    const state = createScriptedSession().state()
    const looks = Array.from({ length: 101 }, (_, n) =>
      sourceOf('drill_power').lookOf(withLevel(state, 'p1', 'drill_power', n), 'p1', 0),
    )
    const crowns = SHIPPED_RIG_LOOKS.tracks.find((frames) => frames.rows.track === 'drill_tip')!
    const nose = ['drill-bit', ...crowns.rows.steps.flatMap((step) => step.part ?? [])]
    expect(looks).toEqual(
      DRILL_LOOK_554.stageOf.map((stage) => withNoseSlots(DRILL_LOOK_554.looks[stage], nose)),
    )
  })

  it('paints a new look at drill_power 101, where #554 held its last row', () => {
    const state = createScriptedSession().state()
    const lookAt = (n: number) =>
      sourceOf('drill_power').lookOf(withLevel(state, 'p1', 'drill_power', n), 'p1', 0)
    expect(lookAt(101)).not.toEqual(lookAt(100))
  })

  it('wears no look on a new vehicle, nor for a player not in the state', () => {
    const state = createScriptedSession().state()
    for (const source of createRigLookSources()) {
      expect(source.lookOf(state, 'p1', 0)).toBeNull()
      expect(source.lookOf(state, 'nobody', 0)).toBeNull()
    }
  })

  it('steps up when a track is bought past its first step', () => {
    const session = createScriptedSession()
    session.submit(1, setUpgrade('engine', 2))
    expect(sourceOf('engine').lookOf(session.state(), 'p1', 1)?.glows[0].slots).toEqual([
      'piston',
      'iron-track',
      'steel-track',
      'guild-track',
    ])
  })

  it("paints each player's rig from their own purchases", () => {
    const session = createScriptedSession(['p1', 'p2'])
    session.submit(1, setUpgrade('cargo_hold', 23), 'p2')
    expect(sourceOf('cargo_hold').lookOf(session.state(), 'p1', 1)).toBeNull()
    expect(sourceOf('cargo_hold').lookOf(session.state(), 'p2', 1)).not.toBeNull()
  })

  it("reads only the player's stored level on its own track, never a stat, price or planet", () => {
    const state = withLevel(createScriptedSession().state(), 'p1', 'hull', 500)
    const paths = pathsReadBy((watched) => sourceOf('hull').lookOf(watched, 'p1', 0), state)
    expect(paths).toEqual([
      'state.players',
      'state.players.p1',
      'state.players.p1.vehicle',
      'state.players.p1.vehicle.levels',
      'state.players.p1.vehicle.levels.hull',
    ])
  })

  it('answers the same kept look every frame', () => {
    const state = withLevel(createScriptedSession().state(), 'p1', 'boiler', 40)
    const source = sourceOf('boiler')
    expect(source.lookOf(state, 'p1', 1)).toBe(source.lookOf(state, 'p1', 9))
  })

  it('leaves the state and its digest as they were, at the lowest and the highest look', () => {
    for (const n of [0, 10_000]) {
      const state = UPGRADE_IDS.reduce(
        (each, track) => withLevel(each, 'p1', track, n),
        createScriptedSession().state(),
      )
      const digest = stateDigest(state)
      for (const source of createRigLookSources()) source.lookOf(state, 'p1', 0)
      expect(stateDigest(state)).toBe(digest)
    }
  })

  it('plays no flash for any event', () => {
    const session = createScriptedSession()
    const events = session.submit(1, setUpgrade('drill_tip', 70))
    for (const source of createRigLookSources()) {
      expect(events.map((event) => source.flashOf(event))).toEqual(events.map(() => null))
    }
  })

  it('paints a track added by data alone, with no code for it', () => {
    const table = readRigLookTable(
      {
        glowCaps: { rigBody: 1 },
        lookAssets: {},
        tracks: [
          {
            track: 'combat',
            slot: 'hull.turret',
            glowSlots: [['turret']],
            glowCap: 'rigBody',
            steps: [{ from: 6, part: null, card: 'Pintle mount', colour: '#a0b0c0', glows: [0.4] }],
            tail: {
              delta: 1,
              palette: ['#000001', '#000002'],
              plating: ['a', 'b'],
              glow: [[0.1], [0.2]],
            },
          },
        ],
      },
      [...UPGRADE_IDS, 'combat'],
    )
    const [source] = createRigLookSources(createRigLooks(table))
    const state = withLevel(createScriptedSession().state(), 'p1', 'combat', 6)
    expect(source.id).toBe('rig-look.combat')
    expect(source.lookOf(state, 'p1', 0)?.glows).toEqual([
      { slots: ['turret'], colour: '#a0b0c0', glow: 0.4 },
    ])
  })

  it("never lights a module's or item's part: every glow slot is the vehicle's or a rig look's own", () => {
    const otherSlots = partSlotsOfOtherAssets()
    const glowSlots = SHIPPED_RIG_LOOKS.tracks.flatMap((frames) => frames.rows.glowSlots.flat())
    expect(glowSlots.filter((slot) => otherSlots.has(slot))).toEqual([])
    expect(glowSlots.length).toBeGreaterThan(0)
  })

  it('never washes the whole car, so a fitted module keeps its own colour', () => {
    const state = UPGRADE_IDS.reduce(
      (each, track) => withLevel(each, 'p1', track, 1000),
      createScriptedSession().state(),
    )
    for (const source of createRigLookSources()) {
      expect(source.lookOf(state, 'p1', 0)).toMatchObject({ tint: null, outline: null, opacity: 1 })
    }
  })
})
