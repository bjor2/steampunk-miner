/**
 * How a slice's state shows on the kernel vehicle (ticket 389; the phase look G&V set on #261): a
 * wash of colour over the body, a see-through body, a single outline round it, and a glow in a
 * colour on some of the car's part slots, while some state of the slice's lasts (`lookOf`), or for
 * a few ticks after one of its events (`flashOf`: a refused press's flicker). The kernel folds the
 * answers (`systems/render/vehicleLookFold.ts`) and paints every part of the local vehicle with
 * them, its own and the slices' pieces alike, so no slice reaches into the vehicle's materials.
 * Under reduced effects (the `flashes` switch off) the kernel swaps the wash and the see-through
 * body for one outline. Render-only, like `partMotionRequests`: nothing here enters the authority
 * state, a snapshot or a digest. With nothing registered the vehicle looks exactly as before.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { defineRegistry, entriesOf } from './seal'

/** A glow added to each named part slot's own (`slotOfPartId`, so `lantern-frame`). */
export interface PartGlow {
  slots: readonly string[]
  /** `#rrggbb`, in place of the slot's own glow colour while the glow shows. */
  colour: string
  /** Added to the part's glow, 1 being its own colour at full. */
  glow: number
}

export interface VehicleLook {
  /** Multiplied into the colour of every part of the vehicle, `#rrggbb`; null leaves it. */
  tint: string | null
  /** 1 draws the vehicle solid; less lets what is behind it show through. */
  opacity: number
  /** One outline round the vehicle's body in this colour, `#rrggbb`; null draws none. */
  outline: string | null
  glows: readonly PartGlow[]
}

/** A look an event plays for `ticks` ticks from the tick it is heard. */
export interface VehicleLookFlash {
  ticks: number
  /** The look `ageTicks` after the event (0 to `ticks` - 1); null shows nothing that tick. */
  lookAt(ageTicks: number): VehicleLook | null
}

export interface VehicleLookSource {
  id: string
  /**
   * The look `playerId`'s vehicle wears at `tick`, or null when none. Asked every frame, so
   * answer a kept look, not a new one.
   */
  lookOf(state: AuthorityState, playerId: string, tick: number): VehicleLook | null
  /** The flash the event plays on its player's vehicle, or null for an event that plays none. */
  flashOf(event: DomainEvent): VehicleLookFlash | null
}

export const VEHICLE_LOOK_REGISTRY = defineRegistry<VehicleLookSource>('vehicleLooks')

/** Every source, sorted by id. */
export function vehicleLookSources(): readonly VehicleLookSource[] {
  return entriesOf(VEHICLE_LOOK_REGISTRY)
}
