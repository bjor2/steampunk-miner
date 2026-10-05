/**
 * Balance numbers that are not economy data. Prices, ratios, hardness and every other #6 constant
 * live in `src/systems/economy/economy.json`; change a number here when the design does, never to
 * satisfy a test.
 */

/**
 * Energy is stored as an integer count of quanta, 240 per unit (decision #11 amendment 2), so
 * drilling (4 per tick), thrust (6) and driving (1) are exact; run metadata records it.
 */
export const ENERGY_QUANTA_PER_UNIT = 240

/**
 * The vehicle state machine's timers (decision #7, "Vehicle state machine"): a stranded vehicle
 * is towed after about 3 s, a destroyed one after its 2 s death animation, unless the player
 * calls the tow first.
 */
export const STRAND_GRACE_TICKS = 180
export const DESTROY_DELAY_TICKS = 120

/** `energy_low` fires once at each of these shares of `energyMax`, in percent (#7, #11). */
export const ENERGY_LOW_PERCENTS: readonly number[] = [25, 10]

/**
 * The speed bound of #7: at most 16 m/s, under 0.3 m per 1/60 s tick, so the exposed-tile halo
 * never tunnels. Pose reports above it are refused (#3 host sanity check), in mm/s.
 */
export const MAX_SPEED_MM_PER_SECOND = 16000

/**
 * How far from the reported pose `DrillTile` may reach, in mm: the drill works the tile next to
 * the bore (#7, one tile = 1000 mm), measured centre to centre, plus the body's play inside a
 * 1-tile bore. Diagonal neighbours (1414 mm) are inside it; two tiles away (2000 mm) is not.
 */
export const DRILL_REACH_MM = 1600

/**
 * Pose reports go out at most 5 times a second (#11 amendment), every 12 ticks; the authority
 * allows one interval of slack when it checks the action tick counts (#11 amendment 2).
 */
export const POSE_REPORT_INTERVAL_TICKS = 12

/** The drill head turns to a new facing over about 0.13 s (#7), while the body does not rotate. */
export const SWIVEL_TICKS = 8

/**
 * #9 / #11 pose addition: the integer front/side/rear zone test runs only for offsets up to this
 * many mm (contact range), so every intermediate stays below 2^53.
 */
export const ZONE_TEST_MAX_MM = 65535
