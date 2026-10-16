/**
 * The HUD with everything up at once, for the specs (spec #422 pass #428, #500): the start
 * scenario draws only part of the HUD, so the text budget and the box checks hand the views a
 * model with every readout, every call-out, more statuses than fit and a threat, worded as the
 * model's own readers word them. Test scaffolding only; nothing in the game imports it.
 */
import { combatStatusStackOf } from '../../systems/views/combatStatuses'
import { GUN_IDLE_TEXT } from '../../systems/views/gunReading'
import { THROTTLED_TEXT } from '../../systems/views/heatReading'
import type { HudModel } from '../../systems/views/hudModel'

const THREAT = {
  kind: 'crawler' as const,
  iconId: 'icon-enemy-crawler',
  phase: 'windup' as const,
  octant: 2,
  arc: 'F' as const,
  ticksLeft: 10,
  isTremor: false,
}

/** Everything on at once: each warning, every optional line, more statuses than fit, a threat. */
export function everyReadoutOf(model: HudModel): HudModel {
  const heat = {
    ...model.energy,
    iconId: 'icon-heat-lava',
    isThrottled: true,
    throttledText: THROTTLED_TEXT,
  }
  const chargeFuse = { ticksLeft: 30, isInsideBlast: true, text: 'CHARGE LIT 0.5 s: back off' }
  const warning = {
    ...model.warning,
    level: 'critical' as const,
    text: 'CRITICAL ENERGY: climb home now',
  }
  const vehicleState = {
    ...model.vehicleState,
    rescueCountdownTicks: 600,
    rescueCountdownText: 'tow in 10 s',
  }
  const cargo = { ...model.cargo, coreFragments: 2, coreText: '(2 core)', isFull: true }
  return {
    ...model,
    cargo,
    liningBill: model.cargoValue,
    casing: { text: 'G1', state: 'short' },
    guns: { mode: 'auto', text: 'Auto (G)', isIdle: true, idleText: GUN_IDLE_TEXT },
    boreAuto: { colour: 'amber', label: 'held', hold: 'docked', text: 'held: docked' },
    charges: { carried: 2, capacity: 4, text: '2/4 (C)' },
    chargeFuse,
    heat,
    dockArrow: { octant: 3, distance: 42 },
    coreDistance: 120,
    threats: [THREAT],
    statuses: combatStatusStackOf({
      hullPermille: 50,
      isCollapseWarned: true,
      chargeFuse,
      heat,
      warning,
      threats: [THREAT],
      cargo,
      vehicleState,
    }),
    vehicleState,
    dockPrompt: { isShown: true, text: 'Space: Dock at the Refinery bay' },
    cachePrompt: { isShown: true, text: 'Space: Ancient cache' },
    readyPrompt: { isShown: true, text: 'Scenario ready — press any key' },
    isDebugRun: true,
    warning,
  }
}
