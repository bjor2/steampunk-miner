/**
 * The ground's `debug.*` commands (decision #36: the debug API carves and fills circles): a
 * disc softened at the rim like the drill's stamp lowers or raises density, ignoring hardness and
 * energy. They go through `applyCommand` like play, so they replay from `commands.ndjson` and log
 * `debug_command_applied`. A cell carved past half is marked yielded but credits nothing: debug
 * never counts as play (#11 section 4). The dock pad and lava are never cut, and a lava pocket the
 * carve opens beside starts to flow (#113).
 *
 * `debug.lineCasing` lines one ring of casing round a point at a grade (#41), in the player's
 * active lining type (#113), the same ring the vehicle lays, and logs it like one, free. `debug.gnawCasing` breaches that ring as a tunnel wrecker
 * does (#111), logged as its gnaw with no enemy.
 */
import { liningTypeIndexOf } from '../vehicle/liningType'
import { SOLID_DENSITY } from '../world/sampleGrid'
import { clearDisc, fillDisc, type GroundEdit } from '../world/groundEdit'
import type { PlanetParams } from '../world/planetParams'
import type { AuthorityCommand } from './authorityCommand'
import { vehicleOf, type AuthorityState } from './authorityState'
import { layCasingRing } from './casingPlacement'
import { gnawCasingRing } from './casingGnaw'
import { casingGradeRangeRejection } from './casingRules'
import type { GroundCircle } from './groundCommands'
import {
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { groundChangedEventsOf } from './groundChangedEvents'
import { wakeLavaBeside } from './lava/lavaRules'
import { noPlanetRejection, planetParamsOf } from './planetOfState'

type CircleCommand = 'debug.carveCircle' | 'debug.fillCircle'
type CircleEdit = (params: PlanetParams, command: AuthorityCommand<CircleCommand>) => GroundEdit

/** Wider than any stamp the game uses; a bigger circle is a mistake, not a test. */
const MAX_RADIUS_MM = 32000

const CIRCLE_FIELDS = {
  x: 'safeInteger',
  y: 'safeInteger',
  radius: 'wholeNumber',
  amount: 'wholeNumber',
} as const

export const GROUND_DEBUG_RULES: {
  readonly 'debug.carveCircle': CommandRule<'debug.carveCircle'>
  readonly 'debug.fillCircle': CommandRule<'debug.fillCircle'>
  readonly 'debug.lineCasing': CommandRule<'debug.lineCasing'>
  readonly 'debug.gnawCasing': CommandRule<'debug.gnawCasing'>
} = {
  'debug.carveCircle': {
    fields: CIRCLE_FIELDS,
    reject: (state, { payload }) => circleCommandRejection(state, payload),
    apply: (state, command) =>
      applyCircle(state, command, (params, { payload }) =>
        clearDisc(state.world, params, discOf(payload), payload.amount),
      ),
  },
  'debug.fillCircle': {
    fields: CIRCLE_FIELDS,
    reject: (state, { payload }) => circleCommandRejection(state, payload),
    apply: (state, command) =>
      applyCircle(state, command, (params, { payload }) =>
        fillDisc(state.world, params, discOf(payload), payload.amount),
      ),
  },
  'debug.lineCasing': {
    fields: { x: 'safeInteger', y: 'safeInteger', grade: 'wholeNumber' },
    reject: (state, { payload }) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => casingGradeRangeRejection(payload.grade),
      ]),
    apply: (state, { playerId, payload }) => lineCasingRing(state, playerId, payload),
  },
  'debug.gnawCasing': {
    fields: { x: 'safeInteger', y: 'safeInteger' },
    reject: (state) => noPlanetRejection(state.planet),
    apply: (state, { payload }) => gnawRingWithoutEnemy(state, payload),
  },
}

function gnawRingWithoutEnemy(
  state: AuthorityState,
  { x, y }: { x: number; y: number },
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  return gnawCasingRing(state, params, { xMm: x, yMm: y }, null)
}

/** The ring in the player's active lining type, as their vehicle would lay it (#113). */
function lineCasingRing(
  state: AuthorityState,
  playerId: string,
  { x, y, grade }: { x: number; y: number; grade: number },
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const typeIndex = liningTypeIndexOf(vehicleOf(state, playerId).lining.active)
  return layCasingRing(state, params, { xMm: x, yMm: y }, grade, typeIndex)
}

function circleCommandRejection(state: AuthorityState, payload: GroundCircle): Rejection | null {
  return firstRejection([() => noPlanetRejection(state.planet), () => circleRejection(payload)])
}

function circleRejection(circle: GroundCircle): Rejection | null {
  if (circle.radius < 1 || circle.radius > MAX_RADIUS_MM) {
    return rejectionOf('invalid_payload', `radius must be 1 to ${MAX_RADIUS_MM} mm`)
  }
  if (circle.amount > SOLID_DENSITY) {
    return rejectionOf('invalid_payload', `amount must be 0 to ${SOLID_DENSITY}`)
  }
  return null
}

function applyCircle(
  state: AuthorityState,
  command: AuthorityCommand<CircleCommand>,
  edit: CircleEdit,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const edited = edit(params, command)
  const carved = { ...state, world: edited.world }
  return {
    state: wakeLavaBeside(carved, params, edited.yielded, command.tick),
    events: groundChangedEventsOf(edited),
  }
}

function discOf(circle: { x: number; y: number; radius: number }) {
  return { xMm: circle.x, yMm: circle.y, radiusMm: circle.radius, floorRadiusMm: null }
}
