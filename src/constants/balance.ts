/**
 * Balance numbers that are not economy data. Prices, ratios, hardness and every other #6 constant
 * live in `src/systems/economy/economy.json`; change a number here when the design does, never to
 * satisfy a test.
 */
import { TICKS_PER_SECOND } from './physics'

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
 * The client's speed clamp per fixed step while the swept cut is off (TD on #316, raised from #7's
 * 16 m/s by the GD there, ticket 330): at most 300 mm a tick, 18 m/s at 60 ticks a second. The
 * 0.9 m body first tunnels a contour at 0.45 m a tick (measured on #316), so one world step a tick
 * never tunnels. The authority's bound is derived from the rig's stats instead (ticket 334,
 * `vehicle/stepBound.ts`); away from a cut it is never below this one.
 */
export const MAX_STEP_MM_PER_TICK = 300

/** `MAX_STEP_MM_PER_TICK` in mm/s: what the body and the pacing bot's reports keep to. */
export const MAX_SPEED_MM_PER_SECOND = MAX_STEP_MM_PER_TICK * TICKS_PER_SECOND

/**
 * The stats-derived pose bound's tolerance (TD scope a on #316, ticket 334): one 250 mm density
 * sample on top of the step the rig's stats allow, so rounding and a contact's push never refuse
 * an honest step.
 */
export const STEP_BOUND_TOLERANCE_MM = 250

/**
 * How far from the reported pose `DrillTile` may reach, in mm: the drill works the tile next to
 * the bore (#7, one tile = 1000 mm), measured centre to centre, plus the body's play inside a
 * 1-tile bore. Diagonal neighbours (1414 mm) are inside it; two tiles away (2000 mm) is not.
 */
export const DRILL_REACH_MM = 1600

/** The drill bore's data row (`DRILL_BORE_ROWS`). */
export interface DrillBoreRows {
  readonly sideClearanceMm: number
}

/**
 * The drill's circular stamp (decision #36 Carving, as the GD lock on #661 re-derives it): the cut
 * is the body's width plus `sideClearanceMm` on each side. 0.5 m is #36's body plus 1.0 m (a 1.9 m
 * bore); the stamp's radius, its lift and the casing ring's lag derive from this row
 * (`vehicle/drillBore.ts`). The Gameplay & Vehicle Designer owns it as data. Rules read it at call
 * time, never at import, so a spec may set it (`withDrillSideClearance`).
 */
export const DRILL_BORE_ROWS: DrillBoreRows = { sideClearanceMm: 500 }

/** The range the GD lock on #661 lets the side clearance be tuned in, in mm. */
export const DRILL_SIDE_CLEARANCE_RANGE_MM = { min: 100, max: 200 } as const

/**
 * Where the stamp sits (#40: the drill axis is the 4-way facing in the local frame): this far
 * ahead of the body's centre along the facing, so it bites just past the 0.9 m body's face.
 * Driving sideways on the ground it is also raised along `localUp` by the lift
 * (`vehicle/drillBore.ts`). A placeholder, checked by the level-tunnel physics spec and tuned by
 * hand in the vehicle feel test. An offset, not a reach (ticket 570 renamed it from
 * `DRILL_STAMP_AHEAD_MM`): a cut riding its face places its stamp by `sweptStampAheadMmOf`, and a
 * travelling one this offset plus the cutting bound (`travelStampAheadMmAt`).
 */
export const DRILL_STAMP_OFFSET_MM = 500

/** Half the 0.9 m body's side (#7): its face sits this far ahead of its centre. */
export const BODY_HALF_SIZE_MM = 450

/**
 * The swept cut's contact margin (ticket 570, TD shape on #570 point 1: no more than one density
 * sample): the face the cut leaves sits this far past where the body's face will be after the
 * tick's step, so the body rides the face with a little skin and never meets it mid-step. Under
 * `GROUND_PROBE_DEPTH`, so a rig riding the face of a cut down stands on the ground.
 */
export const CUT_FACE_MARGIN_MM = 50

/**
 * The swept cut's carry holds its cell out of the stamp until the cell lies in the body's next
 * step (ticket 421, GD ruling on #421 Q2): one of its samples inside the slab from the body's face
 * to the face plus the cutting bound, across the body's width, widened on every side by this many
 * density samples. Three, per the TD ruling on #421 (comment 6200703398): the narrowest width
 * measured on #421 that kept a level cut inside the interim bar.
 */
export const CARRY_RELEASE_MARGIN_SAMPLES = 3

/**
 * Casing lining (#41 Placement rule as amended on 5 Oct, #56 Q1): a ring is centred on the tunnel
 * axis, where the drill stamp's centre passed, and lines the annulus `stampR - 0.25 m <= d <
 * stampR + 0.25 m`, one 0.25 m sample thick on the rock side of the wall the drill cut. One ring
 * every 0.5 m the stamp cuts. The Gameplay & Vehicle Designer owns the numbers as data.
 */
export const CASING_LINING_WIDTH_MM = 250
export const CASING_RING_SPACING_MM = 500
/**
 * Axis points waiting for their ring, a safety net that keeps the save small (ticket 538, the TD
 * ruling 6228998310 on #538: 6 to 9): waiting points lie at least `CASING_RING_SPACING_MM` apart
 * and within the ring lag (`casingRingLagMm`), so a straight cut holds at most lag / 500 of them
 * and a line through the stamp `2 x lag / 500 + 1`, 9 at #36's 1.9 m bore.
 * Only a tight loop fills it; the newest point past it is dropped, never the oldest laid inside
 * the lag.
 */
export const MAX_CASING_TRAIL_POINTS = 9

/**
 * Fractional drill time (TD scope on #316, ticket 330): the swept cut (`drillStep`) counts a cell's
 * drill time in this many integer sub-steps of a fixed tick, so a cell may take 24.5 ticks, or less
 * than one, with no float and no carried state (the densities are the progress). The base quantum:
 * a rig whose band-1 cells cost fewer than `DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL` of them counts in
 * a doubled one (`vehicle/drillQuantum.ts`, ticket 558). The carve takes `255 * 256 * Q * T` modulo
 * its period (`world/carvePhase.ts`), so it stays exact at any quantum and tick.
 */
export const DRILL_SUBSTEPS_PER_TICK = 60

/**
 * The lifted sub-step floor (ticket 558, #551 B1, the TD's c-speed50 section 4 item 3): at a fixed
 * 60 sub-steps a cell costs at least one, so no rig cut past 3600 cells/s (5400 m/s travel) and a
 * cell of `n` sub-steps rounded its speed down by up to 1/n. A rig's quantum is the base doubled
 * until a cell of its planet's softest rock (band 1) costs at least this many sub-steps, so the
 * rounding stays under 1% at any speed: the acceptance's 1% at 1000 cells/s and above.
 */
export const DRILL_QUANTUM_MIN_SUBSTEPS_PER_CELL = 100

/**
 * At most this many doublings: 60 x 2^11 = 122,880 sub-steps a tick, still 100 or more a band-1 cell
 * at the step bound's planet clamp (ticket 558: a tick never moves the rig further than the planet's
 * radius), 1,000 m a tick on the largest planet (`RADIUS_BASE_TILES + RADIUS_GROWTH_TILES`). It keeps
 * the carve's per-tick products far under 2^53 at any drill power.
 */
export const DRILL_QUANTUM_MAX_DOUBLINGS = 11

/**
 * The cut-follow (TD scope 0 on #316, ticket 333): while the rig actively cuts, the drill sets its
 * speed along the facing, and the body reaches that speed, or stops when the drive lets go, within
 * this many ticks, whatever the engine's `accel`. Gameplay's locked stop time on #316.
 */
export const CUT_FOLLOW_TICKS = 6

/**
 * The "actively cutting" gate (TD scope 0 on #316, ticket 333), on the uncut share of the leading
 * slab in basis points: on at `CUT_GATE_ON_BP` or more, off once it stays under `CUT_GATE_OFF_BP`
 * for `CUT_GATE_HOLD_TICKS` consecutive ticks, and never flipped again sooner than that, so a
 * cell-by-cell dig through mixed caves does not flicker.
 */
export const CUT_GATE_ON_BP = 5000
export const CUT_GATE_OFF_BP = 2500
export const CUT_GATE_HOLD_TICKS = 6

/**
 * How far a body may coast on the last `vCut` it followed once the cut gate shuts under it (ticket
 * 430, TD shape on #430): one cell. The gate's dwell is counted in ticks but the gap from a broken
 * cell to the next one entering the leading slab is a distance under a cell (0.3-0.55 m measured),
 * so below some 5 m/s the gate shuts in every cell; at 1.5 m/s that gap takes 11 ticks, past the
 * TD's first cap of `CUT_GATE_HOLD_TICKS` + 2, which left 3 ticks of travel's acceleration a cell.
 */
export const CUT_COAST_METRES = 1

/**
 * Pose reports go out at most 5 times a second (#11 amendment), every 12 ticks, while the drill is
 * not biting; the authority allows one such interval of slack when it checks the action tick
 * counts (#11 amendment 2), and the step bound, field entry, bot and fixtures keep this cadence.
 */
export const POSE_REPORT_INTERVAL_TICKS = 12

/**
 * While drill ticks wait to be reported (the drill bit since the last report) a report goes out
 * every tick (ticket 514, the TD shape on #441 6223171858): at 12 the body followed a 5 Hz cut, a
 * hidden ceiling of about 5 m/s that Bjor's no-cap rule forbids, and interval 2 missed interval 1's
 * speed by 8-11% on the fast rig. The authority's slack stays `POSE_REPORT_INTERVAL_TICKS`. It is
 * used only while the authority charges the report cut exactly (`drill.exactCarry`, TD 6236464931).
 */
export const DRILL_POSE_REPORT_INTERVAL_TICKS = 1

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
 * The last planet the surface layer report reads (ticket 625): the tree lane's P60
 * (`balance:tree`), past the campaign, so the first planet where the ramp runs past band 1 shows
 * before endless play reaches it (VS on #625).
 */
export const SURFACE_REPORT_LAST_PLANET = 60

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

/**
 * The depth density curve (ticket 448) is read between its table entries in this many steps, so a
 * tile's depth is taken in 1/65536 of the radius with 256 entries. A build choice, not a Systems
 * number; changing it moves patch thinning, so it needs a GENERATOR_VERSION bump.
 */
export const DEPTH_SUBSTEPS_PER_TABLE_STEP = 256
