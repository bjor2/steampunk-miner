/**
 * What the player should see and hear for a batch of authority events (#13 VFX and audio
 * direction): a pickup chime per ore tier, a heavy clank for docking and upgrades, a hit that
 * shakes and flashes, the stingers for core completion and travel, and casing's hydraulic hiss
 * as a ring is laid and pop as the drill breaks through lining (#41 casing feel), a collapse's
 * rising rumble as a block starts its warning and crash as it refills (#43), and a tunnel wrecker's
 * scrape as it breaches a ring of the vehicle's route (#111 telegraph), and the crack and shake of
 * the player's own charge blowing (#109), and the drill biting, which is felt as a haptic tick
 * rather than heard (#173). Presentation only: cues
 * are read from the events, never written back, so they cannot touch state or the digest (#33).
 *
 * A batch gives at most one cue of each kind (the highest tier, the hardest hit), so a fast-forward
 * that mines a hundred tiles in one batch sounds one chime, not a hundred.
 */
import type { DomainEvent } from '../authority/domainEvent'

export type FeedbackCue =
  | { kind: 'pickup'; tier: number }
  | { kind: 'dockClank' }
  | { kind: 'upgradeClank' }
  | { kind: 'hit' }
  | { kind: 'destroyed' }
  | { kind: 'coreStinger' }
  | { kind: 'travelStinger' }
  | { kind: 'casingHiss' }
  | { kind: 'casingPop' }
  | { kind: 'collapseRumble' }
  | { kind: 'collapseCrash' }
  | { kind: 'wreckerScrape' }
  | { kind: 'chargeBlast' }
  | { kind: 'drillContact' }

type CueKind = FeedbackCue['kind']

const CUE_ORDER: readonly CueKind[] = [
  'pickup',
  'dockClank',
  'upgradeClank',
  'hit',
  'destroyed',
  'coreStinger',
  'travelStinger',
  'casingHiss',
  'casingPop',
  'collapseRumble',
  'collapseCrash',
  'wreckerScrape',
  'chargeBlast',
  'drillContact',
]

/** The local player's cues in a batch, one per kind, in a fixed order. */
export function feedbackCuesOf(events: readonly DomainEvent[], playerId: string): FeedbackCue[] {
  const strongest = new Map<CueKind, FeedbackCue>()
  events
    .filter((event) => isForPlayer(event, playerId))
    .forEach((event) => keepStronger(strongest, cueOfEvent(event)))
  return CUE_ORDER.flatMap((kind) => strongest.get(kind) ?? [])
}

function isForPlayer(event: DomainEvent, playerId: string): boolean {
  return event.playerId === undefined || event.playerId === playerId
}

function cueOfEvent(event: DomainEvent): FeedbackCue | null {
  switch (event.type) {
    case 'CargoAdded':
      return { kind: 'pickup', tier: event.resourceTier }
    case 'DockEntered':
      return { kind: 'dockClank' }
    case 'UpgradePurchased':
      return { kind: 'upgradeClank' }
    case 'VehicleDamaged':
      return { kind: 'hit' }
    case 'VehicleDestroyed':
      return { kind: 'destroyed' }
    case 'CoreCompleted':
      return { kind: 'coreStinger' }
    case 'TravelStarted':
      return { kind: 'travelStinger' }
    case 'CasingPlaced':
      return event.samples + event.relined > 0 ? { kind: 'casingHiss' } : null
    case 'CasingDrilled':
      return { kind: 'casingPop' }
    case 'CollapseWarned':
      return { kind: 'collapseRumble' }
    case 'CollapseStarted':
      return { kind: 'collapseCrash' }
    case 'RingGnawed':
      return { kind: 'wreckerScrape' }
    case 'ChargeDetonated':
      return { kind: 'chargeBlast' }
    case 'DrillDamageDealt':
      return { kind: 'drillContact' }
    default:
      return null
  }
}

function keepStronger(strongest: Map<CueKind, FeedbackCue>, cue: FeedbackCue | null): void {
  if (cue === null) return
  const kept = strongest.get(cue.kind)
  if (kept === undefined || tierOf(cue) > tierOf(kept)) strongest.set(cue.kind, cue)
}

function tierOf(cue: FeedbackCue): number {
  return cue.kind === 'pickup' ? cue.tier : 0
}
