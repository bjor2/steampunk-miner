/**
 * The command rule the aetheric slice registers (feature-slices.md 3.15):
 * `debug.aetheric.setItemHeat {heat}` sets a scenario's item heat gauge, in heat units, from 0 to
 * the gauge's max (#263), so a spec or the browser can hand the condenser heat to burn without
 * opening pockets first. Like every debug command it records `debug_command_applied`, never play.
 */
import { rejectionOf, unchanged, type Rejection } from '../../../systems/authority/commandRule'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import './aethericEvents'
import { gaugeMaxUnits, withItemHeatUnits } from './itemHeat'

export const AETHERIC_RULES: SliceCommandRules = {
  'debug.aetheric.setItemHeat': {
    fields: { heat: 'wholeNumber' },
    reject: (_state, { payload }) => itemHeatRangeRejection(payload.heat),
    apply: (state, { playerId, tick, payload }) =>
      unchanged(withItemHeatUnits(state, playerId, tick, payload.heat)),
  },
}

function itemHeatRangeRejection(heat: number): Rejection | null {
  if (heat <= gaugeMaxUnits()) return null
  return rejectionOf('out_of_range', `item heat must be 0 to ${gaugeMaxUnits()} units, got ${heat}`)
}
