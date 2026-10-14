/**
 * The phase as it looks (G&V's rules on #261, through the kernel's `vehicleLooks`, ticket 389):
 * while a phase is under way, out and back alike, the vehicle draws translucent aether blue and
 * the lantern on its nose pulses; a refused phase flickers the lantern red for a moment, beside
 * the light clank its slot hold already gives (`phaseMoves.ts`). The chime on landing is the slot
 * hold's too. Under reduced effects the kernel swaps the blue see-through body for one outline in
 * the same blue; the lantern still pulses and flickers, as it is a light on one part, not a flash.
 * Material tint and glow only: the lantern is the tech-tree's gear row at `hull.nose`, no new art.
 *
 * Every number is presentation, tuned by eye: the blue is the aether blue of the lantern's icon.
 * The answers are kept looks written in place, as the kernel asks every frame.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type {
  VehicleLook,
  VehicleLookFlash,
  VehicleLookSource,
} from '../../../systems/registries/vehicleLooks'
import { isRefusedPhase } from './phaseMoves'
import { phaseOf, type PhaseMove } from './phaseSection'

export const AETHER_BLUE = '#7ab0d9'
export const REFUSAL_RED = '#e0402a'
/** The lantern's part slots in the tech-tree's gear row for `power.phase_lantern`. */
export const LANTERN_SLOTS: readonly string[] = ['lantern-frame', 'lantern-shutter']

/** How solid the body draws while it phases: enough to read the vehicle, enough to see through. */
export const PHASE_OPACITY = 11 / 20
/** One pulse of the lantern every half second at 60 ticks a second. */
export const PULSE_TICKS = 30
const PULSE_LOW_GLOW = 1 / 5
const PULSE_HIGH_GLOW = 3 / 2
/** A short flicker: four 3-tick flashes of red with 3-tick gaps, 0.4 s in all. */
export const FLICKER_TICKS = 24
const FLICKER_STEP_TICKS = 3
const FLICKER_GLOW = 2

export function createPhaseLook(): VehicleLookSource {
  const lanternPulse = { slots: LANTERN_SLOTS, colour: AETHER_BLUE, glow: 0 }
  const phasing: VehicleLook = {
    tint: AETHER_BLUE,
    opacity: PHASE_OPACITY,
    outline: null,
    glows: [lanternPulse],
  }
  return {
    id: 'aetheric.phase-lantern',
    lookOf(state, playerId, tick) {
      const phase = phaseUnderWay(state, playerId, tick)
      if (phase === null) return null
      lanternPulse.glow = pulseGlowAt(tick - phase.startTick)
      return phasing
    },
    flashOf: refusalFlickerOf,
  }
}

const RED_LANTERN: VehicleLook = {
  tint: null,
  opacity: 1,
  outline: null,
  glows: [{ slots: LANTERN_SLOTS, colour: REFUSAL_RED, glow: FLICKER_GLOW }],
}

const REFUSAL_FLICKER: VehicleLookFlash = {
  ticks: FLICKER_TICKS,
  lookAt: (ageTicks) => (isFlickerLit(ageTicks) ? RED_LANTERN : null),
}

function refusalFlickerOf(event: DomainEvent): VehicleLookFlash | null {
  return isRefusedPhase(event) ? REFUSAL_FLICKER : null
}

function phaseUnderWay(state: AuthorityState, playerId: string, tick: number): PhaseMove | null {
  const phase = phaseOf(state, playerId).phase
  return phase !== null && isMovingAt(phase, tick) ? phase : null
}

function isMovingAt(phase: PhaseMove, tick: number): boolean {
  return tick >= phase.startTick && tick < phase.endTick
}

/** A triangle wave from low to high and back over each pulse, brightest mid-pulse. */
export function pulseGlowAt(ageTicks: number): number {
  const half = PULSE_TICKS / 2
  const along = ageTicks % PULSE_TICKS
  const rise = 1 - Math.abs(along - half) / half
  return PULSE_LOW_GLOW + (PULSE_HIGH_GLOW - PULSE_LOW_GLOW) * rise
}

function isFlickerLit(ageTicks: number): boolean {
  return Math.floor(ageTicks / FLICKER_STEP_TICKS) % 2 === 0
}
