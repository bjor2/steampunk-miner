/**
 * One frame of the hazard strip (TD scope g on #316, ticket 341): the drill's nose and facing and
 * the felt speed from the vehicle loop's presences, the collapse list and what the player may see
 * from the replicated state, one seeded ground per planet, then the sampler; the pips go to
 * `hazardStripPresence` and a tier switch to the perf log. Presentation only: nothing here writes
 * the authority, a save or the digest.
 */
import { STRIP_WINDOW_SECONDS } from '../constants/hazardStrip'
import { readAuthorityState } from '../store/authorityLink'
import { readPlanetWorld, useGameStore } from '../store/gameStore'
import { recordHazardStripTier } from '../store/perfLog'
import { NO_COLLAPSE } from '../systems/authority/collapse/collapseState'
import { feltSpeedAfter, speedAlongFacing } from '../systems/render/hazardStrip/feltSpeed'
import {
  sampleHazardStrip,
  type HazardStrip,
  type StripFrame,
} from '../systems/render/hazardStrip/hazardStripSampler'
import {
  createSeededStripGround,
  type SeededStripGround,
} from '../systems/render/hazardStrip/seededStripGround'
import { kindLookPresence } from './kindLookPresence'
import { createStripViewer, writeStripViewer } from '../systems/render/hazardStrip/stripViewer'
import type { PlanetParams } from '../systems/world/planetParams'
import type { WorldState } from '../systems/world/worldState'
import { drillPresence } from './drillPresence'
import { hazardStripPresence } from './hazardStripPresence'
import { motionPresence } from './motionPresence'

/** What the strip keeps between frames besides the sampler. */
export interface StripReads {
  frame: StripFrame
  ground: SeededStripGround | null
}

export function createStripReads(): StripReads {
  return {
    frame: {
      nose: drillPresence.nose,
      facing: drillPresence.ahead,
      feltSpeed: 0,
      windowSeconds: STRIP_WINDOW_SECONDS,
      tick: 0,
      collapse: NO_COLLAPSE,
      viewer: createStripViewer(),
    },
    ground: null,
  }
}

export function sampleStripFrame(strip: HazardStrip, reads: StripReads, dt: number): void {
  const { params, world } = readPlanetWorld()
  hazardStripPresence.isSampling = params !== null
  if (params === null) return
  const ground = groundOf(reads, params, world)
  readStripFrame(reads.frame, params, dt)
  const tierBefore = strip.tier
  sampleHazardStrip(strip, ground, reads.frame)
  recordTierSwitch(tierBefore, strip)
  publishStrip(strip)
}

/** One ground per planet, its world swapped in each frame. */
function groundOf(reads: StripReads, params: PlanetParams, world: WorldState): SeededStripGround {
  if (reads.ground?.params !== params) reads.ground = createSeededStripGround(params, world)
  reads.ground.world = world
  return reads.ground
}

function readStripFrame(frame: StripFrame, params: PlanetParams, dt: number): void {
  const state = readAuthorityState()
  const speed = speedAlongFacing(motionPresence.velocity, drillPresence.ahead)
  frame.feltSpeed = feltSpeedAfter(frame.feltSpeed, speed, dt)
  frame.tick = state.tick
  frame.collapse = state.collapse
  const { playerId } = useGameStore.getState()
  writeStripViewer(frame.viewer, state, playerId, params, frame.nose, kindLookPresence.table)
}

function recordTierSwitch(tierBefore: number, strip: HazardStrip): void {
  if (strip.tier === tierBefore) return
  recordHazardStripTier({
    fromTier: tierBefore,
    toTier: strip.tier,
    speedMetresPerSecond: Math.round(strip.window.speed),
    windowMetres: Math.round(strip.window.reach),
  })
}

function publishStrip(strip: HazardStrip): void {
  hazardStripPresence.pips = strip.pips
  hazardStripPresence.pipCount = strip.pipCount
  hazardStripPresence.tier = strip.tier
}
