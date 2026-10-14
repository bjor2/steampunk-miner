import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  GROUND,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import { onCurveLevel } from '../../../systems/economy/vehicleStats'
import { contentOf } from '../../../systems/registries/content'
import type { BlastEvent } from '../../../systems/registries/blastEffects'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { blockIdOf, blocksTouchingTile } from '../../../systems/world/collapseBlock'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { nodeCostOf } from '../../tech-tree'
import { BRACER_PROPS_ID, propClaimsOf, propWarnedBlocks } from './bracerProps'
import { fractureAfterBlast, fractureCellsOf, ringTilesOf } from './breakerFracture'
import {
  BRACER_FRAME,
  BREAKER_FUSE,
  bracerPropTicksOf,
  breakerFractureCellsOf,
  TERRAIN_FORK_BALANCE,
} from './terrainFork'
import { terrainToolsOf, terrainToolsStateProblems } from './terrainSection'

// The terrain lane's P16 fork (GD lock on #255, ticket 269): Bracer props the ground round the
// rig, Breaker cracks the ground past every charge it blasts. Neither is a magnet.

const FORK_PLANET = 16
const BRACER = 'tech.terrain.fork.bracer'
const BREAKER = 'tech.terrain.fork.breaker'
const PARAMS = planetParamsFor(83921, FORK_PLANET)
/** Twenty tiles under the P16 surface. */
const RIG: TilePoint = { tx: 20, ty: surfaceRowOfColumn(20, PARAMS.radiusTiles) - 20 }
const MM = 1000
/** A pocket round the rig, as the other lanes' specs stand a miner in the ground. */
const POCKET_RADIUS_MM = 1600
const { bracer, breaker } = TERRAIN_FORK_BALANCE

type Branch = 'bracer' | 'breaker'

function chooseFork(branch: Branch): CommandIntent {
  return { type: 'tech-tree.choose_fork', payload: { lane: 'terrain', branch } } as CommandIntent
}

/**
 * A rich miner on P16 with the on-curve drill (a planet-1 drill cuts nothing there), at rest at
 * `RIG` in a pocket, with `branch` chosen (or none).
 */
function minerOnForkPlanet(branch: Branch | null) {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: FORK_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  for (const upgradeId of ['drill_power', 'drill_tip'] as const) {
    const level = stepOfMajor(onCurveLevel(upgradeId, FORK_PLANET))
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } } as CommandIntent)
  }
  if (branch !== null) session.submit(0, chooseFork(branch))
  const { payload } = poseAbove(GROUND, FACING.down)
  const centre = { x: RIG.tx * MM + MM / 2, y: RIG.ty * MM + MM / 2 }
  session.submit(
    1,
    carveCircleCommand({ ...centre, radius: POCKET_RADIUS_MM, amount: SOLID_DENSITY }),
  )
  session.submit(1, { type: 'reportPose', payload: { ...payload, ...centre, vx: 0, vy: 0 } })
  return session
}

function blastAt(tile: TilePoint, radiusMm = 1500): BlastEvent {
  return { ...tile, radiusMm, size: 1, playerId: 'p1', source: 'charge', tick: 5 }
}

function distanceSqMm(a: TilePoint, b: TilePoint): number {
  const dx = a.tx - b.tx
  const dy = a.ty - b.ty
  return (dx * dx + dy * dy) * MM * MM
}

function squared(mm: number): number {
  return mm * mm
}

describe('terrain fork', () => {
  it('registers the Bracer and the Breaker as the lane’s P16 pair, priced alike', () => {
    const nodes = contentOf('tech-node').filter((node) => node.id.startsWith('tech.terrain.fork.'))
    expect(nodes.map((node) => [node.id, node.unlockTier, node.unlocks])).toEqual([
      [BRACER, FORK_PLANET, BRACER_FRAME],
      [BREAKER, FORK_PLANET, BREAKER_FUSE],
    ])
    for (const planet of [16, 30, 60]) {
      expect(nodeCostOf(BRACER, planet)).toEqual(nodeCostOf(BREAKER, planet))
    }
  })

  it('names no magnet on either branch (terrain magnets are their own family, #246)', () => {
    const nodes = contentOf('tech-node').filter((node) => node.id.startsWith('tech.terrain.fork.'))
    expect(nodes.filter((node) => /magnet/i.test(JSON.stringify(node)))).toEqual([])
  })

  it('plays only the chosen branch, at its Mark 1 magnitude', () => {
    const none = minerOnForkPlanet(null).state()
    expect([bracerPropTicksOf(none, 'p1'), breakerFractureCellsOf(none, 'p1')]).toEqual([
      null,
      null,
    ])
    const bracing = minerOnForkPlanet('bracer').state()
    expect(bracerPropTicksOf(bracing, 'p1')).toBe(bracer.propTicks)
    expect(breakerFractureCellsOf(bracing, 'p1')).toBeNull()
    const breaking = minerOnForkPlanet('breaker').state()
    expect(breakerFractureCellsOf(breaking, 'p1')).toBe(breaker.fractureCells)
    expect(bracerPropTicksOf(breaking, 'p1')).toBeNull()
  })

  it('lists the ring past a blast nearest first, none inside the charge’s radius', () => {
    const blast = blastAt({ tx: 0, ty: 0 })
    const ring = ringTilesOf(blast, 2)
    const outerMm = blast.radiusMm + 2 * MM
    expect(ring.length).toBeGreaterThan(0)
    expect(ring.every((tile) => distanceSqMm(tile, blast) > squared(blast.radiusMm))).toBe(true)
    expect(ring.every((tile) => distanceSqMm(tile, blast) <= squared(outerMm))).toBe(true)
    const distances = ring.map((tile) => distanceSqMm(tile, blast))
    expect(distances).toEqual([...distances].sort((a, b) => a - b))
  })

  it('fractures plain ground past a Breaker’s blast, up to its Mark magnitude', () => {
    const state = minerOnForkPlanet('breaker').state()
    const blast = blastAt({ tx: RIG.tx + 6, ty: RIG.ty - 6 })
    const cells = fractureCellsOf(state, blast, breaker.fractureCells)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.length).toBeLessThanOrEqual(breaker.fractureCells)
    expect(cells.every((cell) => cell.kind === 'density')).toBe(true)
    expect(cells.every((cell) => distanceSqMm(cell, blast) > squared(blast.radiusMm))).toBe(true)
    const fractured = fractureAfterBlast(state, blast)
    expect(fractured.events.map((event) => event.type)).toEqual(['terrain-tools.TerrainEdited'])
  })

  it('fractures nothing before the blasting_charges row opens, Breaker or not', () => {
    const session = minerOnForkPlanet('breaker')
    session.submit(2, { type: 'debug.setPlanet', payload: { planetIndex: 1 } })
    const state = session.state()
    expect(breakerFractureCellsOf(state, 'p1')).toBe(breaker.fractureCells)
    const fractured = fractureAfterBlast(state, blastAt({ tx: 20, ty: 100 }))
    expect(fractured.state).toBe(state)
    expect(fractured.events).toEqual([])
  })

  it('fractures nothing for a blaster without the Breaker', () => {
    const state = minerOnForkPlanet('bracer').state()
    const fractured = fractureAfterBlast(state, blastAt({ tx: RIG.tx + 6, ty: RIG.ty - 6 }))
    expect(fractured.state).toBe(state)
    expect(fractured.events).toEqual([])
  })

  it('props a block that starts to warn round a Bracer rig, and claims it until its end', () => {
    const state = minerOnForkPlanet('bracer').state()
    const near = blockIdOf(blocksTouchingTile(RIG, 1)[0])
    const far = blockIdOf(blocksTouchingTile({ tx: RIG.tx + 40, ty: RIG.ty }, 0)[0])
    const heard = [near, far].map((block) => ({
      type: 'CollapseWarned' as const,
      tick: state.tick,
      block,
      band: 1,
      weakestGrade: 0,
      required: 1,
    }))
    const propped = propWarnedBlocks(state, heard).state
    expect(propClaimsOf(propped)).toEqual([
      { block: near, untilTick: state.tick + bracer.propTicks },
    ])
    expect(terrainToolsStateProblems(terrainToolsOf(propped, 'p1'))).toEqual([])
  })

  it('props nothing round a rig without the Bracer', () => {
    const state = minerOnForkPlanet('breaker').state()
    const near = blockIdOf(blocksTouchingTile(RIG, 1)[0])
    const heard = [
      {
        type: 'CollapseWarned' as const,
        tick: 1,
        block: near,
        band: 1,
        weakestGrade: 0,
        required: 1,
      },
    ]
    expect(propWarnedBlocks(state, heard).state).toBe(state)
  })

  it('holds a forced collapse next to a Bracer rig past its refill tick', () => {
    const session = minerOnForkPlanet('bracer')
    const block = blockIdOf(blocksTouchingTile(RIG, 1)[0])
    session.submit(2, { type: 'debug.forceCollapse', payload: { block } } as CommandIntent)
    session.advanceTo(80)
    const entry = session.state().collapse.blocks.find((held) => held.block === block)
    expect(entry?.isBraced).toBe(true)
    expect(session.events()).toContainEqual(
      expect.objectContaining({ type: 'CollapseBraced', block, by: [BRACER_PROPS_ID] }),
    )
  })

  it('refuses a malformed prop list in a saved section', () => {
    expect(terrainToolsStateProblems({ beacon: null, props: [{ block: 3 }] })).toEqual([
      'terrain-tools.props is malformed',
    ])
    expect(terrainToolsStateProblems({ beacon: null, props: [] })).toEqual([
      'terrain-tools.props is malformed',
    ])
  })
})
