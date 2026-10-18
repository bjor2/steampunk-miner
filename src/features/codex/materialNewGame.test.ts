import { beforeEach, describe, expect, it } from 'vitest'
import { readAuthorityState } from '../../store/authorityLink'
import { readAuthorityTick, resetGameStore, useGameStore } from '../../store/gameStore'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { poseAbove, surfaceOreTiles, drill } from '../../systems/authority/scriptedSession'
import { FACING } from '../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../systems/world/tileGrid'
import { hasContacted } from './systems/codexReads'
import { speciesIdAt } from './systems/materialFixtures'

// New Game (ticket 403) replaces the session with the planet 1 baseline, so the species the
// player met go with it (ticket 546, HS on #450: "cleared by New Game").

const game = () => useGameStore.getState()
const DRILL_TICKS = 40

/** Drills `tile` from above through the store's fast-forward. */
function mineFromAbove(tile: TilePoint): void {
  if (game().vehicle.mode === 'docked') game().undock()
  const start = readAuthorityTick() + 1
  game().fastForward(DRILL_TICKS + 10, [
    { tick: start, ...poseAbove(tile, FACING.down) },
    { tick: start + DRILL_TICKS, ...drill(tile, DRILL_TICKS) },
  ])
}

function firstSpeciesTile(): { tile: TilePoint; speciesId: string } {
  const state = readAuthorityState()
  const tiles = surfaceOreTiles(20, planetParamsOf(state.planet)!)
  const tile = tiles.find((candidate) => speciesIdAt(state, candidate) !== null)!
  return { tile, speciesId: speciesIdAt(state, tile)! }
}

describe('codex: material record and New Game (ticket 546)', () => {
  beforeEach(() => resetGameStore())

  it('clears the species the player met when a New Game starts', () => {
    const { tile, speciesId } = firstSpeciesTile()
    mineFromAbove(tile)
    const met = () => hasContacted(readAuthorityState(), game().playerId, `material:${speciesId}`)
    expect(met()).toBe(true)
    game().startNewGame()
    expect(met()).toBe(false)
  })
})
