/**
 * The kernel spray pool (ticket 348, section 4 of the TD kernel lock on #314, the GD ruling of
 * 8 Oct): sparks, dust and debris thrown by any user, drawn by the always-on `SprayLayer` whatever
 * slices are loaded. Its capacity is dynamite-visuals' debris pool moved here at the same count, so
 * `SCENE_LAYER_LINE` keeps its total and only the split between the kernel and the slices changes
 * (recorded on #213). Presentation only, tuned by eye where no decision names a number.
 */
import {
  COLLAPSE_DUST_COLOUR,
  COLLAPSE_DUST_FALL_SPEED,
  COLLAPSE_DUST_LIFE_SECONDS,
  COLLAPSE_DUST_SPREAD_RADIANS,
  SPARK_COLOUR,
  SPARK_LIFE_SECONDS,
  SPARK_SPEED,
  SPARK_SPREAD_RADIANS,
} from './scene'

/** #145a's debris pool (96, "a tile of rim at every size up to the R24 cap"), moved unchanged. */
export const SPRAY_CAPACITY = 96

/**
 * The most low-priority pieces (the bore gun's tracer) live at once: half the pool, a render call
 * (VS on #314: no vertical pin), so a blast always finds room; a blast also evicts them when full.
 */
export const SPRAY_LOW_PRIORITY_MOST = 48

/** One `InstancedMesh`, one draw call, however full (#154). */
export const SPRAY_LAYER_BUDGET = { drawCalls: 1, instances: SPRAY_CAPACITY } as const

/** Its own fixed seed: presentation only, never part of the world. */
export const SPRAY_SEED = 0x5b7a

/** How one kind of piece flies, tumbles and shows. */
export interface SprayLook {
  speed: number
  spreadRadians: number
  lifeSeconds: number
  /** The quad's side at birth, metres; it shrinks to nothing over its life. */
  sizeM: number
  spinRadiansPerSecond: number
  colour: string
}

/**
 * Debris is dynamite-visuals' blast debris look (#153 look 3, tuned in #215) moved unchanged;
 * sparks and dust borrow the drill sparks' and the collapse dust's motion and colour (#13, #43).
 */
export const SPRAY_LOOKS = {
  spark: {
    speed: SPARK_SPEED,
    spreadRadians: SPARK_SPREAD_RADIANS,
    lifeSeconds: SPARK_LIFE_SECONDS,
    sizeM: 0.06,
    spinRadiansPerSecond: 0,
    colour: SPARK_COLOUR,
  },
  dust: {
    speed: COLLAPSE_DUST_FALL_SPEED,
    spreadRadians: COLLAPSE_DUST_SPREAD_RADIANS,
    lifeSeconds: COLLAPSE_DUST_LIFE_SECONDS,
    sizeM: 0.14,
    spinRadiansPerSecond: 2,
    colour: COLLAPSE_DUST_COLOUR,
  },
  debris: {
    speed: 6,
    spreadRadians: 0.5,
    lifeSeconds: 0.7,
    sizeM: 0.18,
    spinRadiansPerSecond: 9,
    colour: '#3a2e24',
  },
} as const satisfies Record<string, SprayLook>
