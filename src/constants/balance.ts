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
 * Casing lining (#41 Placement rule as amended on 5 Oct, #56 Q1): a ring is centred on the tunnel
 * axis, where the drill stamp's centre passed, and lines the annulus `stampR - 0.25 m <= d <
 * stampR + 0.25 m`, one 0.25 m sample thick on the rock side of the wall the drill cut. One ring
 * every 0.5 m the stamp cuts. The Gameplay & Vehicle Designer owns the numbers as data.
 */
export const CASING_LINING_HALF_WIDTH_MM = 250
export const CASING_RING_SPACING_MM = 500
/**
 * "The ring sits behind the drill head, so the drill never cuts its own fresh lining" (#41, #56
 * Q2: `2 x stampR + 0.25 m`): a ring is laid at an axis point once the stamp's centre is this far
 * past it, the stamp's radius plus the ring's outer radius, so on a straight cut no later stamp
 * reaches the ring.
 */
export const CASING_RING_LAG_MM =
  DRILL_STAMP_RADIUS_MM + DRILL_STAMP_RADIUS_MM + CASING_LINING_HALF_WIDTH_MM
/**
 * Axis points waiting for their ring: a straight cut holds `CASING_RING_LAG_MM / 500` of them.
 * Dithering back and forth inside the lag lays the oldest past this many, so the save stays small.
 */
export const MAX_CASING_TRAIL_POINTS = 6

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

/**
 * Collapse (decision #43 Sequence and Data, S3 defaults accepted on #57): a weak block within
 * `COLLAPSE_ACTIVE_RADIUS_MM` (16 m, the visible circle at the default zoom with margin) of a
 * vehicle's body centre warns for `COLLAPSE_WARN_TICKS` (1.0 s, the Gameplay & Vehicle Designer's
 * minimum), then refills from the walls inward over `COLLAPSE_FILL_TICKS`. The Gameplay & Vehicle
 * and Systems & Economy Designers own the numbers.
 */
export const COLLAPSE_WARN_TICKS = 60
export const COLLAPSE_FILL_TICKS = 30
export const COLLAPSE_ACTIVE_RADIUS_MM = 16000
/** A collapse block is the 4x4 m collision block (#36), 16 density samples a side. */
export const COLLAPSE_BLOCK_SAMPLES = 16
/**
 * The refill never fills inside this circle round a vehicle's body centre (#43 Vehicle safety):
 * the 0.9 m body's half-diagonal (637 mm, rounded up from 450 x sqrt 2) plus 0.25 m.
 */
export const COLLAPSE_VEHICLE_CLEARANCE_MM = 637 + 250

/**
 * The campaign ends at planet 40, where `finale` and `endless_unlock` sit; endless planets are 41+
 * (#79 row shape, #80 schedule lock).
 */
export const CAMPAIGN_LAST_PLANET = 40

/**
 * The locked schedule never leaves more than this many consecutive campaign planets without a
 * horizontal row, of any `bind` (#81 acceptance 2).
 */
export const MAX_PLANETS_WITHOUT_HORIZONTAL = 2

/**
 * The heat gauge (#113) is held as an integer count of units, this many per gauge point, so a
 * per-second rate given in thousandths of a point (0.15, 0.65, ...) is a whole number of units per
 * 1/60 s tick and a long dive never drifts. The rates themselves are economy data.
 */
export const HEAT_UNITS_PER_POINT = 60000

/**
 * Lava pockets (#113) are drawn on a lattice of square blocks this many tiles a side: each block of
 * plain ground is a pocket with its band's `hazardPocketVolume` chance, so the share of a band in
 * pockets is that volume. 3 m blocks are wider than the 1.9 m bore, so a pocket reads as a pool.
 * A build choice (#96), not a Systems number; changing it needs a GENERATOR_VERSION bump.
 */
export const LAVA_POCKET_TILES = 3

/**
 * Lava (#113) flows one cell a step, every this many ticks (4 cells a second): slow enough to
 * outrun on the 6+ m/s engine once a pocket breaks open, quick enough to fill a tunnel's floor
 * while the player watches. A build choice (#96), not a Systems number.
 */
export const LAVA_FLOW_STEP_TICKS = 15

/**
 * Lava touches a vehicle whose body centre is within this of a lava cell's square (#113): the
 * 0.9 m body's half-size (450 mm) plus 150 mm, so resting against a pocket's face burns. Lava never
 * flows into a cell whose square comes this close to a body, so it never buries a vehicle.
 */
export const LAVA_CONTACT_REACH_MM = 450 + 150

/** A whole share in basis points: the unit of the item effect caps (ticket 233, `itemEffectCaps`). */
export const BASIS_POINTS = 10000

/**
 * The fewest ticks an item on auto shows its locked target before it acts (the #310 GD decision,
 * #322's `previewTicks`): "the 10-tick preview never shortens", so a provider answering fewer is
 * held to it (ticket 317). The #206 lock asks the same floor of every self-acting item.
 */
export const AUTO_PREVIEW_TICKS_FLOOR = 10

/**
 * How often an item on auto looks for a target again while the last look found none it could act
 * on (no target, the energy reserve, a shot that would warn the rig's block): the TD on #310 bounds
 * the bore gun's pick to "at most every 15 ticks", its 15-tick cooldown floor (ticket 317). A look
 * after the item's clock runs out is never held back.
 */
export const AUTO_RETARGET_TICKS = 15
