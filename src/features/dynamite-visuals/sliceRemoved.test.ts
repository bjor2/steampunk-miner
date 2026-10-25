import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../logging/domainEventLog'
import { createMemorySink } from '../../logging/eventSink'
import { createRunLog } from '../../logging/runLog'
import { withRegistrations } from '../../registries/registrar'
import {
  KERNEL_SCENE_LAYER_BUDGET,
  sceneLayerLineUseOf,
  sceneLayers,
} from '../../scene/registries/sceneLayers'
import { admitRequestedSprays } from '../../scene/sprayIntake'
import { vehiclePieces } from '../../scene/registries/vehiclePieces'
import { requestSpray } from '../../store/sprayRequests'
import { blenderAssetIds, kernelBlenderAssetIds } from '../../systems/art/artIds'
import {
  ofType,
  plantSized,
  poseOnTile,
  sizedBlasterOn,
} from '../../systems/authority/charges/chargeFixtures'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import {
  chargeBlastKickOf,
  SHIPPED_CHARGE_BLAST_KICK,
} from '../../systems/registries/chargeBlastCue'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { createSprayPool } from '../../systems/render/sprayPool'
import { DETONATE_INTENT } from '../dynamite'
import { slice } from './register'
import { createBlastFrontPools, throwFront } from './scene/blastFrontPools'
import { playBlast, playFall } from './scene/blastStages'
import { RACK_ITEM_ID } from './systems/render/rackLook'
import {
  clearBlastEventQueue,
  createBlastEventQueue,
  queueBlastEvents,
  queueFalls,
} from './systems/render/blastEventQueue'
import { collapseFallsAfter, EMPTY_FALL_WATCH } from './systems/render/blastCollapseFall'
import {
  blastEffectSwitchesOf,
  blastVfxPlanOf,
  type BlastEffectSwitches,
} from './systems/render/blastVfxPlan'
import { blastVfxSeedOf } from './systems/render/blastVfxSeed'

// The #145 TD lock: "with the slice removed, the scene, the cue table and the art lint match
// main", and sizes 1, 5 and 10 detonate with `size` and `radiusMm` in the log while the
// `blast_resolved` line stays as it was. The slice is presentation only, so the world it blasts
// is the same with it or without it.

/** Every size is sold on every planet (D4 #863); the blasts run on the planet the log names. */
const BLAST_PLANET = 34

/** A fused charge of `size` planted on the blast planet, run until its blast has resolved. */
function fusedBlastEvents(size: number): DomainEvent[] {
  const blaster = sizedBlasterOn(BLAST_PLANET, size)
  plantSized(blaster.session, blaster, size, 1)
  blaster.session.advanceTo(400)
  return blaster.session.events()
}

/** A remote size-10 charge fired by the plunger from well outside its interlock. */
function plungedSize10Events(): DomainEvent[] {
  const blaster = sizedBlasterOn(BLAST_PLANET, 10)
  const { session, wall } = blaster
  plantSized(session, blaster, 10, 1)
  session.submit(2, poseOnTile({ tx: wall.tx - 26, ty: wall.ty }))
  session.submit(3, DETONATE_INTENT)
  session.advanceTo(80)
  return session.events()
}

function logLinesOf(events: readonly DomainEvent[], name: string) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_215', sink, secondsSinceStart: () => 0 })
  recordDomainEventsTo(runLog, { playerId: 'p1', planet: 34, depthTiles: 0 }, events)
  return sink.events.filter((line) => line.event === name).map((line) => line.data)
}

describe('dynamite-visuals removed', () => {
  it('kicks every blast with the shipped cue, as on main', () => {
    const blast = ofType(fusedBlastEvents(5), 'ChargeDetonated')[0]
    expect(withRegistrations([], () => chargeBlastKickOf(blast, 9000))).toEqual(
      SHIPPED_CHARGE_BLAST_KICK,
    )
  })

  it('draws no layer, hangs no piece and names no art of its own', () => {
    withRegistrations([], () => {
      expect(sceneLayers()).toEqual([])
      expect(vehiclePieces()).toEqual([])
      expect(attachOf(RACK_ITEM_ID)).toBeNull()
      expect(blenderAssetIds()).toEqual([...kernelBlenderAssetIds()].sort())
    })
  })

  it("leaves the kernel spray layer drawing a P1 tracer's sparks and debris (ticket 348)", () => {
    withRegistrations([], () => {
      const pool = createSprayPool()
      const stopAdmitting = admitRequestedSprays(pool, { x: 0, y: 0 })
      for (const kind of ['spark', 'debris'] as const) {
        requestSpray({ kind, x: 3, y: -2, dirX: 1, dirY: 0, count: 4, priority: 'low' })
      }
      stopAdmitting()
      expect(pool.particles.count).toBe(8)
      expect(sceneLayerLineUseOf(sceneLayers())).toEqual(KERNEL_SCENE_LAYER_BUDGET)
    })
  })

  it('blasts the same world with the slice as without it: the same events, tick for tick', () => {
    for (const size of [1, 5]) {
      const withSlice = withRegistrations([slice], () => fusedBlastEvents(size))
      const withoutSlice = withRegistrations([], () => fusedBlastEvents(size))
      expect(withSlice).toEqual(withoutSlice)
    }
  })
})

/** Hears a session's events as the front layer does and plays every blast, front and fall. */
function playEventsThroughLayer(
  events: readonly DomainEvent[],
  switches: BlastEffectSwitches,
): void {
  const pools = createBlastFrontPools()
  const queue = createBlastEventQueue(64)
  queueBlastEvents(queue, events, {
    seedOf: (blastSeq) => blastVfxSeedOf(1, blastSeq),
    groundColourOf: () => [0.5, 0.4, 0.3],
    isShowcaseOf: () => true,
    noticePurchase: () => undefined,
  })
  queueFalls(queue, collapseFallsAfter(EMPTY_FALL_WATCH, events).falls)
  for (let at = 0; at < queue.blastCount; at++) {
    const blast = queue.blasts[at]
    playBlast(pools, blast, blastVfxPlanOf({ ...blast, switches }))
  }
  for (let at = 0; at < queue.frontCount; at++) throwFront(pools, queue.fronts[at])
  for (let at = 0; at < queue.fallCount; at++) playFall(pools, queue.falls[at])
  clearBlastEventQueue(queue)
}

describe('dynamite-visuals explosion pass is look-only (D8 #868)', () => {
  it('leaves the events and the log the same with the VFX played in full, reduced, with flashes off or not at all', () => {
    const plain = fusedBlastEvents(5)
    const lines = (events: readonly DomainEvent[]) => [
      ...logLinesOf(events, 'charge_detonated'),
      ...logLinesOf(events, 'blast'),
      ...logLinesOf(events, 'blast_resolved'),
    ]
    for (const prefs of [
      { shake: true, flashes: true },
      { shake: false, flashes: true },
      { shake: true, flashes: false },
    ]) {
      const played = fusedBlastEvents(5)
      playEventsThroughLayer(played, blastEffectSwitchesOf(prefs))
      expect(played).toEqual(plain)
      expect(lines(played)).toEqual(lines(plain))
    }
  })
})

describe('dynamite-visuals in the run log', () => {
  it('detonates sizes 1, 5 and 10 with their size and radius on charge_detonated', () => {
    const detonations = [fusedBlastEvents(1), fusedBlastEvents(5), plungedSize10Events()].map(
      (events) => logLinesOf(events, 'charge_detonated')[0],
    )
    expect(detonations).toEqual([
      expect.objectContaining({ size: 1, radiusMm: 2500, by: 'fuse' }),
      expect.objectContaining({ size: 5, radiusMm: 8000, by: 'fuse' }),
      expect.objectContaining({ size: 10, radiusMm: 24000, by: 'plunger' }),
    ])
  })

  it('keeps the one blast_resolved line per blast as K6 writes it', () => {
    const resolved = logLinesOf(plungedSize10Events(), 'blast_resolved')
    expect(resolved).toHaveLength(1)
    expect(Object.keys(resolved[0] ?? {}).sort()).toEqual([
      'collapseChecks',
      'collapsesTriggered',
      'oreUnits',
      'oreValueLost',
      'radiusMm',
      'size',
      'ticks',
      'tilesCleared',
      'tx',
      'ty',
    ])
    expect(resolved[0]).toMatchObject({ size: 10, radiusMm: 24000 })
  })
})
