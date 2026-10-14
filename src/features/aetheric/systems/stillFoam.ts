/**
 * Still foam (ticket 373, aetheric × terrain; Content's definition and the GD ruling of 14 Oct):
 * stabiliser foam laid from inside the player's own open pocket carries it. The blocks that spray
 * set (`stilledBlocks.ts`) join the pocket, so an enemy on them steps at the pocket's slow until
 * the pocket ends as usual, even outside its reach; it never lasts longer than the pocket and the
 * pocket never lasts longer for it. The vehicle's speed, the foam's use and its cost are unchanged.
 *
 * It rides the player's own foam press (`terrain-tools.FoamSet`, heard by an authority reaction),
 * so it never presses anything for the player and cannot take a press they just made (#328).
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { foamStilledOf } from './aethericEvents'
import { isComboInPlay, STILL_FOAM_ID } from './aethericCombos'
import { isHeldAt, isTileInPocket } from './governorPockets'
import { pocketOf, withPocket, type SlowPocket } from './pocketSection'
import { freshlyFoamedBlocksOf, joinedBlocksOf } from './stilledBlocks'

type FoamSet = Extract<DomainEvent, { type: 'terrain-tools.FoamSet' }>

export const STILL_FOAM_REACTION: AuthorityReaction = {
  id: 'aetheric.still-foam',
  react: (before, after, heard) => stillFoamOf(before, after, heard),
}

function stillFoamOf(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const set = heard.find(isFoamSet)
  const pocket = set === undefined ? null : stillingPocketOf(after, set)
  if (set === undefined || pocket === null) return unchanged(after)
  const blocks = freshlyFoamedBlocksOf(before, after, set.tick)
  if (blocks.length === 0) return unchanged(after)
  return withFoamStilled(after, set, pocket, blocks)
}

/** The player's pocket the spray was laid in, while the combo plays; else null. */
function stillingPocketOf(state: AuthorityState, set: FoamSet): SlowPocket | null {
  if (!isComboInPlay(state, set.playerId, STILL_FOAM_ID)) return null
  const pocket = pocketOf(state, set.playerId).pocket
  if (pocket === null || !isHeldAt(pocket, set.tick)) return null
  return isTileInPocket(pocket, { tx: set.originTx, ty: set.originTy }) ? pocket : null
}

function withFoamStilled(
  state: AuthorityState,
  set: FoamSet,
  pocket: SlowPocket,
  blocks: readonly string[],
): RuleEffect {
  const stilledBlocks = joinedBlocksOf(pocket.stilledBlocks, blocks)
  return {
    state: withPocket(state, set.playerId, { pocket: { ...pocket, stilledBlocks } }),
    events: [
      foamStilledOf({
        playerId: set.playerId,
        itemId: STILL_FOAM_ID,
        blocks: blocks.length,
        lastTick: pocket.lastTick,
      }),
    ],
  }
}

function isFoamSet(event: DomainEvent): event is FoamSet {
  return event.type === 'terrain-tools.FoamSet'
}
