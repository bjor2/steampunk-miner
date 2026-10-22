import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { planetParamsOf } from '../authority/planetOfState'
import { createScriptedSession, mineTile, surfaceOreTiles } from '../authority/scriptedSession'
import { kindLookProvider, type KindLookProvider } from '../registries/kindLook'
import type { TilePoint } from '../world/tileGrid'
import { CELL_KIND, kindOfCell, kindSlotOfCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import { speciesRevealsBetween } from './speciesReveal'

// The first-contact flourish's trigger (GD ruling on #698, option 2): a step reveals a species
// once, when the codex first records the player meeting it, and never on a later touch, a
// switch flip or a step that met nothing new. Run under the loaded slices (roster and codex).

function provider(): KindLookProvider {
  const registered = kindLookProvider()
  if (registered === null) throw new Error('no kind look provider registered')
  return registered
}

function slotAt(state: AuthorityState, tile: TilePoint): number {
  const cell = cellAt(state.world, planetParamsOf(state.planet)!, tile)
  return kindOfCell(cell) === CELL_KIND.ore ? kindSlotOfCell(cell) : 0
}

/** Two surface ore cells of one species, the first the drill reaches. */
function sameSpeciesTiles(state: AuthorityState): [TilePoint, TilePoint] {
  const [first, ...rest] = surfaceOreTiles(40, planetParamsOf(state.planet)!)
  const same = rest.find((tile) => slotAt(state, tile) === slotAt(state, first))
  if (same === undefined) throw new Error('no second surface cell of the first species')
  return [first, same]
}

describe('species reveals (ticket 698)', () => {
  it('reveals the species of the first cell the drill touches, once, with its slot and rarity', () => {
    const session = createScriptedSession()
    const before = session.state()
    const [first] = sameSpeciesTiles(before)
    mineTile(session, 1, first)
    const reveals = speciesRevealsBetween(before, session.state(), 'p1', provider())
    const look = provider().kindLooksOf(planetParamsOf(before.planet)!)[slotAt(before, first) - 1]
    expect(reveals).toEqual([
      { slot: slotAt(before, first), speciesId: look?.speciesId, rarityLead: look?.rarityLead },
    ])
  })

  it('reveals nothing when a second cell of a species already met is mined', () => {
    const session = createScriptedSession()
    const [first, same] = sameSpeciesTiles(session.state())
    mineTile(session, 1, first)
    const before = session.state()
    mineTile(session, 100, same)
    expect(speciesRevealsBetween(before, session.state(), 'p1', provider())).toEqual([])
  })

  it('reveals nothing between two states with the same sightings', () => {
    const state = createScriptedSession().state()
    expect(speciesRevealsBetween(state, state, 'p1', provider())).toEqual([])
  })

  it('reveals nothing when the material switch was off before the step', () => {
    const session = createScriptedSession()
    const before = session.state()
    mineTile(session, 1, sameSpeciesTiles(before)[0])
    const switchedOff = { ...before, devFlagDelta: { 'codex.materialContact': false } }
    expect(speciesRevealsBetween(switchedOff, session.state(), 'p1', provider())).toEqual([])
  })

  it('reveals nothing across a change of planet', () => {
    const session = createScriptedSession()
    const before = session.state()
    mineTile(session, 1, sameSpeciesTiles(before)[0])
    const elsewhere = { ...before, planet: { ...before.planet, index: 2 } }
    expect(speciesRevealsBetween(elsewhere, session.state(), 'p1', provider())).toEqual([])
  })
})
