/**
 * A live remote charge nobody fired is disarmed and lost (#153 "Sizes 7-10 are remote-detonated",
 * K8 #218): when its planter docks (a tow docks it too), when its planter is wrecked, and
 * `remoteDisarmTicks` (3600) after it was planted, on the authority's clock. Nothing is refunded,
 * so armed charges cannot be stockpiled. A fused charge is left to its fuse (210 ticks at most).
 * Each loss logs `charge_disarmed {reason}`. The kernel owns it whole: no dock or wreck hook (TD
 * lock on #149).
 */
import { isRemoteSize, remoteDisarmTicks } from '../../economy/chargeSizes'
import type { PlantedCharge } from '../../vehicle/vehicleCharges'
import type { VehicleMode } from '../../vehicle/vehicleState'
import type { AuthorityState } from '../authorityState'
import { stampedFor, type TickOutcome } from '../combat/combatTick'
import { unchanged, type RuleEffect } from '../commandRule'
import type { DisarmReason } from '../domainEvent'
import { chargesOf, withCharges } from './chargeRules'

/** The modes that cost a live remote charge, and the reason each logs. */
const DISARMING_MODES: Readonly<Partial<Record<VehicleMode, DisarmReason>>> = {
  docked: 'dock',
  destroyed: 'wreck',
}

/** After a vehicle's mode changed to `to`: a dock or a wreck disarms its live remote charge. */
export function disarmOnModeChange(
  state: AuthorityState,
  playerId: string,
  to: VehicleMode,
): RuleEffect {
  const reason = DISARMING_MODES[to]
  return reason === undefined ? unchanged(state) : disarmRemoteCharge(state, playerId, reason)
}

/** The earliest tick after `afterTick` a live remote charge times out, or null with none. */
export function nextDisarmTick(state: AuthorityState, afterTick: number): number | null {
  const ticks = remotePlantersOf(state).map((playerId) =>
    Math.max(afterTick + 1, disarmTickOf(chargesOf(state, playerId).planted as PlantedCharge)),
  )
  return ticks.length === 0 ? null : Math.min(...ticks)
}

/** Every live remote charge whose time is out by `tick` is lost, in player id order. */
export function disarmExpiredCharges(state: AuthorityState, tick: number): TickOutcome {
  return remotePlantersOf(state)
    .filter((playerId) => disarmTickOf(chargesOf(state, playerId).planted as PlantedCharge) <= tick)
    .reduce<TickOutcome>(
      (outcome, playerId) => {
        const next = stampedFor(
          disarmRemoteCharge(outcome.state, playerId, 'expired'),
          playerId,
          tick,
        )
        return { state: next.state, events: [...outcome.events, ...next.events] }
      },
      { state, events: [] },
    )
}

function disarmRemoteCharge(
  state: AuthorityState,
  playerId: string,
  reason: DisarmReason,
): RuleEffect {
  const charges = chargesOf(state, playerId)
  const { planted } = charges
  if (planted === null || !isRemoteSize(planted.size)) return unchanged(state)
  return {
    state: withCharges(state, playerId, { ...charges, planted: null }),
    events: [
      { type: 'ChargeDisarmed', tx: planted.tx, ty: planted.ty, size: planted.size, reason },
    ],
  }
}

function disarmTickOf(planted: PlantedCharge): number {
  return planted.plantedTick + remoteDisarmTicks()
}

/** Players with a live remote charge, in id order. */
function remotePlantersOf(state: AuthorityState): string[] {
  return Object.keys(state.players)
    .sort()
    .filter((playerId) => isRemoteCharge(chargesOf(state, playerId).planted))
}

function isRemoteCharge(planted: PlantedCharge | null): boolean {
  return planted !== null && isRemoteSize(planted.size)
}
