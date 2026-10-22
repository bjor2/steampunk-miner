import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../systems/fastForward'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import type { SpeciesReveal } from '../systems/render/speciesReveal'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { FACING } from '../systems/vehicle/vehiclePose'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityState } from './authorityLink'
import { listenForFeedback } from './feedbackBroadcast'
import { readAuthorityTick, resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'
import { listenForSpeciesReveals } from './speciesRevealBroadcast'

// The first-contact flourish as the game store follows it (GD ruling on #698): drilling a species
// the player never met reveals it once, with its chime cue, and neither more drilling of it nor a
// restored save that had met it reveals it again.

const game = () => useGameStore.getState()

let reveals: SpeciesReveal[] = []
let cues: FeedbackCue[] = []
let stops: (() => void)[] = []

beforeEach(() => {
  resetGameStore()
  reveals = []
  cues = []
  stops = [
    listenForSpeciesReveals((reveal) => reveals.push(reveal)),
    listenForFeedback((cue) => cues.push(cue)),
  ]
  if (game().vehicle.mode === 'docked') game().undock()
})

afterEach(() => stops.forEach((stop) => stop()))

function firstSurfaceOre(): TilePoint {
  return surfaceOreTiles(1, planetParamsOf(readAuthorityState().planet)!)[0]
}

function poseOver(tile: TilePoint, tick: number): ScriptedCommand {
  const payload = {
    x: tile.tx * 1000 + 500,
    y: (tile.ty + 1) * 1000 + 500,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
    driving: false,
    thrusting: false,
    drilling: false,
    thrustTicks: 0,
    driveTicks: 0,
    drillTicks: 0,
    drive: NO_DRIVE,
  }
  return { tick, type: 'reportPose', payload }
}

/** Stands over the tile, then drills it one tick at a time, as the fixed step does. */
function drillFor(tile: TilePoint, ticks: number): void {
  game().fastForward(1, [poseOver(tile, readAuthorityTick() + 1)])
  for (let step = 0; step < ticks; step++) {
    const tick = readAuthorityTick() + 1
    game().fastForward(1, [{ tick, type: 'drillTile', payload: { ...tile, ticks: 1 } }])
  }
}

const revealCues = () => cues.filter((cue) => cue.kind === 'speciesReveal')

describe('species reveal broadcast (ticket 698)', () => {
  it('reveals a species the drill meets for the first time once, with one chime', () => {
    drillFor(firstSurfaceOre(), 12)
    expect(reveals).toHaveLength(1)
    expect(revealCues()).toEqual([{ kind: 'speciesReveal', rarityLead: reveals[0].rarityLead }])
  })

  it('reveals nothing when a restored save had already met the species', () => {
    drillFor(firstSurfaceOre(), 12)
    const met = takeSessionSnapshot()
    resetGameStore()
    reveals = []
    game().restoreSnapshot(met)
    drillFor(firstSurfaceOre(), 4)
    expect(reveals).toEqual([])
  })
})
