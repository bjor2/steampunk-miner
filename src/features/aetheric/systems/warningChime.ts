/**
 * Warning chime (ticket 373, aetheric × sensing; Content's definition and the GD ruling of 14 Oct):
 * when the threat periscope sights an enemy starting its lunge's wind-up within the periscope's
 * radius, the resonance whistle is pressed on its own and sounds on that enemy's tile, at its own
 * reach and duration, then cools down as usual. It takes the whistle's charge and energy like any
 * blow, through the press path a key takes (`pressItemOnAuto`), so it is refused for the same
 * reasons and logs `power_up_auto_fired` and `power_up_used`, beside `aetheric.warning_chimed`.
 *
 * The sighting is the periscope's own telegraph: an enemy hunting this player whose wind-up began
 * this tick, read after the enemy tick on the authority clock (as the periscope's sibling-link
 * reads it), within the periscope's radius at the player's Mark, held back by a magnetic field like
 * the lane's own reach. A sighting inside the #328 gap is let go; the next one after it may chime.
 * A press by hand in the chime's own tick takes its place, and the target goes with it.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { sensingReachAt } from '../../../systems/authority/magnetic/sensingReach'
import { lungeWarningsOf } from '../../../systems/authority/sensingQueries'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import { tileOfMillimetres, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { parentMarkOf, passiveReachAt } from '../../combos'
import { pressItemOnAuto } from '../../power-up-core'
import { warningChimedOf } from './aethericEvents'
import { isComboInPlay, isPastPressGap, WARNING_CHIME_ID } from './aethericCombos'
import { WHISTLE_ID } from './whistleItem'
import { whistleOf, withoutChime, withWhistle } from './whistleSection'

const THREAT_PERISCOPE = 'passive.threat_periscope'

/** Runs on every live tick, after the enemy tick: a wind-up only starts then. */
export const WARNING_CHIME_STEP: ClockStep = {
  id: 'aetheric.warning-chime',
  nextTick: () => null,
  run: (state, tick) => chimeOnSightings(state, tick),
}

/** A chime's blow withdrawn by a press by hand, or refused at its act, leaves no target behind. */
export const CHIME_TARGET_REACTION: AuthorityReaction = {
  id: 'aetheric.chime-target',
  react: (_before, after, heard) => unchanged(withSpentChimeCleared(after, heard)),
}

interface Sighting {
  enemyId: string
  tile: TilePoint
}

function chimeOnSightings(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => chimeOnSighting(current, playerId, tick),
    ),
  )
}

function chimeOnSighting(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  if (!isChimeReady(state, playerId, tick)) return unchanged(state)
  const sighting = freshSightingOf(state, playerId, tick)
  if (sighting === null) return unchanged(state)
  const pressed = pressItemOnAuto(state, playerId, WHISTLE_ID, tick)
  if (pressed.state === state) return unchanged(state)
  return chimedAt(pressed, playerId, sighting, tick)
}

function isChimeReady(state: AuthorityState, playerId: string, tick: number): boolean {
  return (
    isComboInPlay(state, playerId, WARNING_CHIME_ID) &&
    isPastPressGap(state, playerId, WHISTLE_ID, tick)
  )
}

/** The nearest enemy whose wind-up on this player began this tick, inside the periscope's sight. */
function freshSightingOf(state: AuthorityState, playerId: string, tick: number): Sighting | null {
  const radius = periscopeSightOf(state, playerId)
  const fresh = lungeWarningsOf(state, playerId, radius)
    .map((warning) => enemyOf(state, warning.enemyId))
    .find((enemy) => enemy !== null && enemy.phaseSinceTick === tick)
  return fresh === undefined || fresh === null ? null : sightingOf(fresh)
}

/** The periscope's radius at the player's Mark, held back by a field at the vehicle. */
function periscopeSightOf(state: AuthorityState, playerId: string): number {
  const pose = vehicleOf(state, playerId).pose
  const radius = passiveReachAt(THREAT_PERISCOPE, parentMarkOf(state, playerId, THREAT_PERISCOPE))
  if (pose === null || radius === null) return 0
  return sensingReachAt(state, tileOfPose(pose), radius)
}

function chimedAt(
  pressed: RuleEffect,
  playerId: string,
  sighting: Sighting,
  tick: number,
): RuleEffect {
  const chime = { tx: sighting.tile.tx, ty: sighting.tile.ty, pressTick: tick }
  const whistle = whistleOf(pressed.state, playerId)
  return {
    state: withWhistle(pressed.state, playerId, { ...whistle, chime }),
    events: [...pressed.events, warningChimedOfSighting(playerId, sighting)],
  }
}

function warningChimedOfSighting(playerId: string, { enemyId, tile }: Sighting) {
  return warningChimedOf({ playerId, itemId: WARNING_CHIME_ID, enemyId, tx: tile.tx, ty: tile.ty })
}

function withSpentChimeCleared(
  state: AuthorityState,
  heard: readonly DomainEvent[],
): AuthorityState {
  const spent = heard.find(isChimeBlowSpent)
  const playerId = spent?.playerId
  if (playerId === undefined || whistleOf(state, playerId).chime === undefined) return state
  return withWhistle(state, playerId, withoutChime(whistleOf(state, playerId)))
}

/** The whistle's pending blow withdrawn by a hand press, or refused when it came to act. */
function isChimeBlowSpent(event: DomainEvent): boolean {
  if (event.type === 'AutoActOverridden') return event.itemId === WHISTLE_ID
  return event.type === 'power-up-core.PowerUpRefused' && event.itemId === WHISTLE_ID
}

function sightingOf(enemy: Enemy): Sighting {
  return { enemyId: enemy.id, tile: tileOfMillimetres(enemy.x, enemy.y) }
}

function enemyOf(state: AuthorityState, enemyId: string): Enemy | null {
  return state.combat.enemies.find((enemy) => enemy.id === enemyId) ?? null
}

function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
