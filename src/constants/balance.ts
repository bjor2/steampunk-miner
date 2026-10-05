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
 * The drill's circular stamp (decision #36 Carving, amended by #41): the carved diameter is the
 * vehicle height (0.9 m, #7) plus 1.0 m, so a 0.25 m casing lining (#41) still leaves the vehicle
 * height plus 0.5 m clear. The Gameplay & Vehicle Designer owns the number as data.
 */
export const DRILL_STAMP_RADIUS_MM = 950

/**
 * Casing lining (#41 Placement rule): a ring lines the annulus `clearR <= d < clearR + 0.5 m`
 * round its centre, where `clearR` leaves the vehicle height (0.9 m, #7) plus 0.5 m clear,
 * `(900 + 500) / 2` mm. The Gameplay & Vehicle Designer owns both as data.
 */
export const CASING_CLEAR_RADIUS_MM = 700
export const CASING_RING_WIDTH_MM = 500

/**
 * Where the stamp sits (#40: the drill axis is the 4-way facing in the local frame): this far
 * ahead of the body's centre along the facing, so it bites just past the 0.9 m body's face.
 * Driving sideways on the ground it is also raised along `localUp` by `DRILL_STAMP_LIFT_MM`, so
 * the tunnel is taller above the body than below and its floor (cut level, see `drillStamp.ts`)
 * lies inside the disc's strong middle. Placeholders, checked by the level-tunnel physics spec and
 * tuned by hand in the vehicle feel test.
 */
export const DRILL_STAMP_AHEAD_MM = 500
export const DRILL_STAMP_LIFT_MM = 250

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

/**
 * "Stationary" for docking (#8, #23 acceptance 1): a body resting on the pad still reports a few
 * mm/s of solver jitter, so a speed on each axis at or under this counts as standing still. It is
 * far below the slowest drive speed (6 m/s at engine level 0, #6).
 */
export const DOCK_STATIONARY_MM_PER_SECOND = 50

/**
 * The slice has two planets (#2 content budget); completing the core of the last one shows the
 * end-of-slice card (#2 done item 5, #24). Travel itself is not capped (#10: later planets use
 * the same formulas).
 */
export const SLICE_LAST_PLANET = 2

/**
 * Combat (#9 "Authority resolution from reported poses"): the vehicle's position is carried on from
 * its last pose report by its velocity for at most this many ticks, one report interval.
 */
export const COMBAT_EXTRAPOLATION_TICKS = 12

/**
 * An enemy touches the vehicle when their centres are this close, in mm: a body in the next tile
 * along an axis (1000 mm, the tile at the drill's nose) touches, a diagonal neighbour (1414 mm)
 * does not. Enemies are points on the grid (#9), so this is the vehicle's contact reach.
 */
export const ENEMY_CONTACT_MM = 1100

/** `enemy_damaged` sums continuous drill damage over this many ticks (#9 logging). */
export const ENEMY_DAMAGE_LOG_TICKS = 30

/**
 * The vehicle overlaps the artefact cache (#46 "interact while overlapping") when its centre is
 * within this many mm of the cache cell's centre on both axes: half the 0.9 m body (#7) plus half
 * the 1 m cell.
 */
export const ARTEFACT_CACHE_OVERLAP_MM = 950
