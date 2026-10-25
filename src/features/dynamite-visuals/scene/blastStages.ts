/**
 * Playing a blast's stages and a collapse's fall through the front pools (D8, ticket 868): the
 * plan says how many pieces each stage throws, how long they live and what they wear; this throws
 * them. Fire and embers fly every way from the centre; the plume and the smoke rise along the
 * planet's radial up; the chips, in the broken ground's colours, and the kernel's tumbling debris
 * fly every way; the flash-and-fireball disc and the shockwave ring light over the centre. A fall
 * sinks dull dust and dark chips from a block's face toward the planet's centre, never fire. Every
 * draw comes from the blast's own seeded random; a fall's from a random seeded by its block.
 */
import { COLLAPSE_DUST_COLOUR, COLLAPSE_DUST_FALL_SPEED } from '../../../constants/scene'
import { hashCell } from '../../../systems/cellRandom'
import { writeChargePlacement } from '../../../systems/render/chargePlacement'
import { rgbOfHex, scaleRgb, type Rgb } from '../../../systems/render/colour'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import type { QueuedBlast, QueuedFall } from '../systems/render/blastEventQueue'
import {
  BLAST_FRONT_SEED,
  CHIP_METRES_PER_SECOND,
  CHIP_SECONDS,
  CHIP_SPREAD_RADIANS,
  EMBER_METRES_PER_SECOND,
  EMBER_SPREAD_RADIANS,
  FALL_CHIP_SHADE,
  FALL_CHIPS_PER_BLOCK,
  FALL_DUST_PER_BLOCK,
  FALL_SECONDS,
  FALL_SPREAD_RADIANS,
  FIREBALL_SPARK_METRES_PER_SECOND,
  PLUME_METRES_PER_SECOND,
  PLUME_SPREAD_RADIANS,
  SMOKE_METRES_PER_SECOND,
  SMOKE_SPREAD_RADIANS,
} from '../systems/render/blastLookConstants'
import { seedBlastRandom } from '../systems/render/blastSeededRandoms'
import type { BlastVfxPlan } from '../systems/render/blastVfxPlan'
import { lightFlashball } from './blastFlashball'
import { lightShockwave } from './blastShockwave'
import { aimSpray, requestDebrisAtSpray, type BlastFrontPools } from './blastFrontPools'
import { blastFrontPresence } from './blastFrontPresence'
import { sprayColoured, type ColouredPointPool } from './colouredPointPool'

const FULL_TURN = Math.PI * 2
const EVERY_WAY = Math.PI
/** The kernel debris is asked for in this many directions round the blast. */
const DEBRIS_DIRECTIONS = 8
const DUST_RGB = rgbOfHex(COLLAPSE_DUST_COLOUR)
const FALL_CHIP_RGB = scaleRgb(DUST_RGB, FALL_CHIP_SHADE)

/** Plays one blast: seeds its random, lights the disc and the ring, throws every stage's pieces. */
export function playBlast(pools: BlastFrontPools, blast: QueuedBlast, plan: BlastVfxPlan): void {
  const random = seedBlastRandom(pools.randoms, blast.tx, blast.ty, blast.seed)
  const centre = writeChargePlacement(blast, pools.centre)
  lightFlashball(pools.flashball, plan, centre)
  lightShockwave(pools.shockwave, plan, centre)
  throwFire(pools, plan, random)
  throwDust(pools, plan, random)
  throwDebris(pools, plan, random)
  recordBlast(plan)
}

/** Plays a rolled block's fall: dust and chips sinking toward the planet's centre from its face. */
export function playFall(pools: BlastFrontPools, fall: QueuedFall): void {
  const random = createSeededRandom(hashCell(BLAST_FRONT_SEED, fall.x0, fall.y0))
  sinkFromFace(pools, fall, random, FALL_DUST_PER_BLOCK, DUST_RGB)
  sinkFromFace(pools, fall, random, FALL_CHIPS_PER_BLOCK, FALL_CHIP_RGB)
  blastFrontPresence.fallsPlayed++
}

function recordBlast(plan: BlastVfxPlan): void {
  blastFrontPresence.blastsPlayed++
  if (plan.flash.opacity > 0) blastFrontPresence.flashesLit++
  if (plan.banner !== null) blastFrontPresence.showcasesPlayed++
}

/** The fireball's sparks and the embers, every way from the centre, in the fire pool. */
function throwFire(pools: BlastFrontPools, plan: BlastVfxPlan, random: SeededRandom): void {
  const { counts, lives, colours } = plan
  const fire = pools.fire.pool
  throwEveryWay(pools, fire, random, counts.fireballSparks, {
    speed: FIREBALL_SPARK_METRES_PER_SECOND,
    spreadRadians: EVERY_WAY,
    lifeSeconds: lives.fireballSparkSeconds,
    colour: rgbOfHex(colours.fire),
  })
  throwEveryWay(pools, fire, random, counts.embers, {
    speed: EMBER_METRES_PER_SECOND,
    spreadRadians: EMBER_SPREAD_RADIANS,
    lifeSeconds: lives.emberSeconds,
    colour: rgbOfHex(colours.ember),
  })
}

/** The plume and the smoke up the radial, the chips every way, in the dust pool. */
function throwDust(pools: BlastFrontPools, plan: BlastVfxPlan, random: SeededRandom): void {
  const { counts, lives, colours } = plan
  const dust = pools.dust.pool
  throwUpRadial(pools, dust, random, counts.plume, {
    speed: PLUME_METRES_PER_SECOND,
    spreadRadians: PLUME_SPREAD_RADIANS,
    lifeSeconds: lives.plumeSeconds,
    colour: DUST_RGB,
  })
  throwUpRadial(pools, dust, random, counts.smoke, {
    speed: SMOKE_METRES_PER_SECOND,
    spreadRadians: SMOKE_SPREAD_RADIANS,
    lifeSeconds: lives.smokeSeconds,
    colour: rgbOfHex(colours.smoke),
  })
  const chipColours = colours.chips.map(rgbOfHex)
  for (let thrown = 0; thrown < counts.chips; thrown++) {
    throwEveryWay(pools, dust, random, 1, {
      speed: CHIP_METRES_PER_SECOND,
      spreadRadians: CHIP_SPREAD_RADIANS,
      lifeSeconds: CHIP_SECONDS,
      colour: chipColours[thrown % chipColours.length],
    })
  }
}

/** The kernel's tumbling debris, asked for round the blast at high priority. */
function throwDebris(pools: BlastFrontPools, plan: BlastVfxPlan, random: SeededRandom): void {
  const { centre, spray } = pools
  for (let thrown = 0; thrown < plan.counts.debris; thrown++) {
    const angle =
      ((thrown % DEBRIS_DIRECTIONS) / DEBRIS_DIRECTIONS + random.nextFloat() / DEBRIS_DIRECTIONS) *
      FULL_TURN
    aimSpray(spray, centre.x, centre.y, Math.cos(angle), Math.sin(angle), 0, 0, 0)
    requestDebrisAtSpray(pools)
  }
}

interface StageMotion {
  speed: number
  spreadRadians: number
  lifeSeconds: number
  colour: Rgb
}

function throwEveryWay(
  pools: BlastFrontPools,
  pool: ColouredPointPool,
  random: SeededRandom,
  count: number,
  motion: StageMotion,
): void {
  const { centre, spray } = pools
  for (let thrown = 0; thrown < count; thrown++) {
    const angle = random.nextFloat() * FULL_TURN
    aimSpray(
      spray,
      centre.x,
      centre.y,
      Math.cos(angle),
      Math.sin(angle),
      motion.speed,
      motion.spreadRadians,
      motion.lifeSeconds,
    )
    sprayColoured(pool, random, spray, 1, motion.colour)
  }
}

/** Up the planet's radial from the centre: the charge placement's turn is radial up less a quarter. */
function throwUpRadial(
  pools: BlastFrontPools,
  pool: ColouredPointPool,
  random: SeededRandom,
  count: number,
  motion: StageMotion,
): void {
  const { centre, spray } = pools
  const up = centre.turn + Math.PI / 2
  aimSpray(
    spray,
    centre.x,
    centre.y,
    Math.cos(up),
    Math.sin(up),
    motion.speed,
    motion.spreadRadians,
    motion.lifeSeconds,
  )
  sprayColoured(pool, random, spray, count, motion.colour)
}

/** Pieces from random points on the block's face, sinking toward the planet's centre. */
function sinkFromFace(
  pools: BlastFrontPools,
  fall: QueuedFall,
  random: SeededRandom,
  count: number,
  colour: Rgb,
): void {
  const { spray } = pools
  for (let sunk = 0; sunk < count; sunk++) {
    const x = fall.x0 + random.nextFloat() * fall.sizeM
    const y = fall.y0 + random.nextFloat() * fall.sizeM
    const toCentre = Math.hypot(x, y) || 1
    aimSpray(
      spray,
      x,
      y,
      -x / toCentre,
      -y / toCentre,
      COLLAPSE_DUST_FALL_SPEED,
      FALL_SPREAD_RADIANS,
      FALL_SECONDS,
    )
    sprayColoured(pools.dust.pool, random, spray, 1, colour)
  }
}
