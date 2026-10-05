/**
 * The programmatic placeholder for the two hand-authored enemies (#9 "Enemy art", #13), until the
 * commissioned parts and the tier tint ramp land (#28). It shows what play needs to read: which
 * kind it is, and the telegraph. The wind-up (the burrower's tremor) glows, so a player can turn
 * the drill toward it in time (#9: at least 24 ticks); a pinned enemy darkens on the drill.
 */
import type { EnemyKind } from '../economy/economyDefinition'
import type { EnemyPhase } from '../authority/combat/combatState'

export interface EnemyLook {
  colour: string
  /** Width and height in metres (one tile is 1 m). */
  size: number
}

const RUST = '#8b3a1e'
const DEEP_VIOLET = '#4a2a5e'
const EMBER = '#f08a24'
const SCORCHED = '#2b1a14'

const BODY: Readonly<Record<EnemyKind, EnemyLook>> = {
  crawler: { colour: RUST, size: 0.8 },
  burrower: { colour: DEEP_VIOLET, size: 0.9 },
}

export function enemyLookOf(kind: EnemyKind, phase: EnemyPhase): EnemyLook {
  const body = BODY[kind]
  if (phase === 'windup') return { ...body, colour: EMBER }
  if (phase === 'pinned') return { ...body, colour: SCORCHED }
  return body
}
