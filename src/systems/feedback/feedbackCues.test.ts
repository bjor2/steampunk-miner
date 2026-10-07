import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import {
  CHARGE_BLAST_CUE_REGISTRY,
  SHIPPED_CHARGE_BLAST_KICK,
  type ChargeBlastCueProvider,
} from '../registries/chargeBlastCue'
import { addToRegistry, withFreshRegistrySet } from '../registries/seal'
import { SLOT_HOLD_CUE_REGISTRY, type SlotHoldCueSource } from '../registries/slotHoldCues'
import { feedbackCuesOf } from './feedbackCues'

const stamp = (playerId: string) => ({ playerId, tick: 10, seq: 1 })

const cargo = (resourceTier: number, playerId = 'p1'): DomainEvent => ({
  ...stamp(playerId),
  type: 'CargoAdded',
  resourceTier,
  amount: 1,
  value: '1',
  oreId: `kernel.metal.t${resourceTier}`,
  depthTiles: 3,
  chunk: '0,4',
})

const docked: DomainEvent = {
  ...stamp('p1'),
  type: 'DockEntered',
  bay: 'sell',
  cargoUnits: 3,
  energy: 100,
  hull: '50',
}

const hitByCrawler: DomainEvent = {
  tick: 12,
  type: 'VehicleDamaged',
  amount: '5',
  source: 'drill-contact enemy',
  arc: 'side',
  enemyId: 'e1',
  kind: 'crawler',
  tier: 2,
  hullAfter: '45',
}

describe('feedback cues', () => {
  it('chimes once per batch, at the highest ore tier picked up', () => {
    expect(feedbackCuesOf([cargo(2), cargo(5), cargo(3)], 'p1')).toEqual([
      { kind: 'pickup', tier: 5 },
    ])
  })

  it('clanks on docking and shakes on a hit', () => {
    expect(feedbackCuesOf([docked, hitByCrawler], 'p1')).toEqual([
      { kind: 'dockClank' },
      { kind: 'hit' },
    ])
  })

  it('hisses as a ring lines the wall and pops as the drill clears lining', () => {
    const placed = (samples: number, relined: number): DomainEvent => ({
      ...stamp('p1'),
      type: 'CasingPlaced',
      samples,
      relined,
      grade: 2,
    })
    const drilled: DomainEvent = { ...stamp('p1'), type: 'CasingDrilled', samples: 3, grade: 2 }
    expect(feedbackCuesOf([placed(5, 0), placed(0, 2), drilled], 'p1')).toEqual([
      { kind: 'casingHiss' },
      { kind: 'casingPop' },
    ])
  })

  it('stays quiet for a ring that lined nothing new', () => {
    const idle: DomainEvent = {
      ...stamp('p1'),
      type: 'CasingPlaced',
      samples: 0,
      relined: 0,
      grade: 2,
    }
    expect(feedbackCuesOf([idle], 'p1')).toEqual([])
  })

  it('rumbles once as blocks start their collapse warning and crashes as they refill', () => {
    const warned = (block: string): DomainEvent => ({
      tick: 600,
      type: 'CollapseWarned',
      block,
      band: 2,
      weakestGrade: 1,
      required: 2,
    })
    const started: DomainEvent = {
      tick: 660,
      type: 'CollapseStarted',
      block: '0,8#17',
      samplesFilled: 90,
      vehiclesHit: 0,
    }
    expect(feedbackCuesOf([warned('0,8#17'), warned('0,8#18'), started], 'p1')).toEqual([
      { kind: 'collapseRumble' },
      { kind: 'collapseCrash' },
    ])
  })

  it("scrapes once per batch as a tunnel wrecker gnaws rings of the player's route (#111)", () => {
    const gnawed = (ring: string): DomainEvent => ({
      tick: 900,
      playerId: 'p1',
      type: 'RingGnawed',
      ring,
      band: 2,
    })
    expect(feedbackCuesOf([gnawed('1,2'), gnawed('1,3')], 'p1')).toEqual([
      { kind: 'wreckerScrape' },
    ])
    expect(feedbackCuesOf([gnawed('1,2')], 'p2')).toEqual([])
  })

  it("shakes for the player's own charge blowing, and not for another's (#109)", () => {
    const blast: DomainEvent = {
      tick: 720,
      playerId: 'p1',
      type: 'ChargeDetonated',
      tx: 3,
      ty: 280,
      size: 1,
      radiusMm: 2500,
      by: 'fuse',
    }
    expect(feedbackCuesOf([blast], 'p1')).toEqual([
      { kind: 'chargeBlast', kick: SHIPPED_CHARGE_BLAST_KICK },
    ])
    expect(feedbackCuesOf([blast], 'p2')).toEqual([])
  })

  it("kicks a blast by the cue provider's answer for how far the vehicle stands (#213)", () => {
    const blast: DomainEvent = {
      tick: 720,
      playerId: 'p1',
      type: 'ChargeDetonated',
      tx: 3,
      ty: 280,
      size: 10,
      radiusMm: 24000,
      by: 'fuse',
    }
    const byDistance: ChargeBlastCueProvider = {
      id: 'fake-blast.cue',
      kickOf: (detonated, distanceMm) => ({
        shake: detonated.size / 10,
        flash: 0.5,
        thumpDelayTicks: distanceMm / 1000,
      }),
    }
    // The charge tile's centre is (3500, 280500) mm; the vehicle stands 3 m right and 4 m up.
    const cues = withFreshRegistrySet(
      () => addToRegistry(CHARGE_BLAST_CUE_REGISTRY, 'fake-blast', byDistance),
      () => feedbackCuesOf([blast], 'p1', { xMm: 6500, yMm: 284500 }),
    )
    expect(cues).toEqual([
      { kind: 'chargeBlast', kick: { shake: 1, flash: 0.5, thumpDelayTicks: 5 } },
    ])
  })

  it("marks the player's own drill biting, once a batch, for the haptics (#173)", () => {
    const bite = (playerId: string): DomainEvent => ({
      ...stamp(playerId),
      type: 'DrillDamageDealt',
      tx: 3,
      ty: 280,
      ticks: 12,
      damage: '4',
    })
    expect(feedbackCuesOf([bite('p1'), bite('p1')], 'p1')).toEqual([{ kind: 'drillContact' }])
    expect(feedbackCuesOf([bite('p2')], 'p1')).toEqual([])
  })

  it('clanks for a clicked upgrade and leaves a held chain step to the ratchet (#180)', () => {
    const bought = (chain: number): DomainEvent => ({
      ...stamp('p1'),
      type: 'UpgradePurchased',
      chain,
      upgradeId: 'boiler',
      kind: 'vertical',
      fromLevel: 3,
      toLevel: 4,
      fromMajor: 0,
      toMajor: 0,
      isMajor: false,
      cost: '9',
      costCurveId: 'cost.vehicle.boiler',
      totalLevel: 4,
      visualTier: 1,
      statsAfter: {},
    })
    expect(feedbackCuesOf([bought(0)], 'p1')).toEqual([{ kind: 'upgradeClank' }])
    expect(feedbackCuesOf([bought(4)], 'p1')).toEqual([])
  })

  it('clanks lightly for a slot hold a slice cancels and chimes for one it finishes (253)', () => {
    const recharged = (to: number): DomainEvent => ({
      ...stamp('p1'),
      type: 'EnergyRecharged',
      from: 0,
      to,
      cost: '1',
    })
    const holdEnds: SlotHoldCueSource = {
      id: 'fake-hold.ends',
      holdEndOf: (event) => {
        if (event.type !== 'EnergyRecharged') return null
        return event.to === 0 ? 'cancelled' : 'finished'
      },
    }
    const cuesOf = (events: DomainEvent[]) =>
      withFreshRegistrySet(
        () => addToRegistry(SLOT_HOLD_CUE_REGISTRY, 'fake-hold', holdEnds),
        () => feedbackCuesOf(events, 'p1'),
      )
    expect(cuesOf([recharged(0)])).toEqual([{ kind: 'holdCancelled' }])
    expect(cuesOf([recharged(9)])).toEqual([{ kind: 'holdFinished' }])
    expect(cuesOf([docked])).toEqual([{ kind: 'dockClank' }])
  })

  it('stays quiet for a hold-ending event while no slice names one', () => {
    const recharged: DomainEvent = {
      ...stamp('p1'),
      type: 'EnergyRecharged',
      from: 0,
      to: 9,
      cost: '1',
    }
    expect(
      withFreshRegistrySet(
        () => {},
        () => feedbackCuesOf([recharged], 'p1'),
      ),
    ).toEqual([])
  })

  it('clanks lightly when a bore stops at a cell it cannot open, never at its range (ticket 313)', () => {
    const ended = (stop: 'refused' | 'lava' | 'range' | 'budget'): DomainEvent => ({
      tick: 18,
      playerId: 'p1',
      type: 'BoreEnded',
      stop,
      tx: 3,
      ty: 4,
      cellsOpened: 2,
    })
    expect(feedbackCuesOf([ended('refused')], 'p1')).toEqual([{ kind: 'boreClank' }])
    expect(feedbackCuesOf([ended('lava')], 'p1')).toEqual([{ kind: 'boreClank' }])
    expect(feedbackCuesOf([ended('range'), ended('budget')], 'p1')).toEqual([])
    expect(feedbackCuesOf([ended('refused')], 'p2')).toEqual([])
  })

  it("ignores another player's pickups", () => {
    expect(feedbackCuesOf([cargo(4, 'p2')], 'p1')).toEqual([])
  })

  it('has nothing to say about events with no feedback', () => {
    const digest: DomainEvent = {
      tick: 3600,
      type: 'StateDigested',
      digest: 'ab',
      scope: 'periodic',
    }
    expect(feedbackCuesOf([digest], 'p1')).toEqual([])
  })
})
