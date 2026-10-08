import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { WORLD_SEED } from '../systems/authority/scriptedSession'
import { replayRun } from '../systems/replay/replayRun'
import { artefactCacheTile } from '../systems/world/artefactCache'
import { chunkDigest } from '../systems/world/chunkDigest'
import { planetParamsFor } from '../systems/world/planetParams'
import { chunkOfTile } from '../systems/world/tileGrid'
import { currentCellsOfChunk, currentDensityOfChunk } from '../systems/world/worldState'
import type { GoldenRun } from './goldenRun'

// S11 (#65): the committed second-slice golden runs pin digests (goldenRun.test.ts); these specs
// check that each one still shows what it is named for, so a regenerated file cannot quietly
// pin a run where the collapse, the refusal or the husk no longer happens.

function replayedGolden(name: string): { golden: GoldenRun; events: readonly DomainEvent[] } {
  const file = new URL(`../../tests/golden/${name}.golden.json`, import.meta.url)
  const golden = JSON.parse(readFileSync(file, 'utf8')) as GoldenRun
  const { events } = replayRun(golden.worldSeed, golden.commands, { endTick: golden.endTick })
  return { golden, events }
}

const ofType = <T extends DomainEvent['type']>(events: readonly DomainEvent[], type: T) =>
  events.filter((event): event is Extract<DomainEvent, { type: T }> => event.type === type)

const rejectionsOf = (events: readonly DomainEvent[]) =>
  ofType(events, 'CommandRejected').map(({ commandType, reason }) => `${commandType}:${reason}`)

function forcedBlockOf(golden: GoldenRun): string | null {
  const forced = golden.commands.find((command) => command.type === 'debug.forceCollapse')
  return forced?.type === 'debug.forceCollapse' ? forced.payload.block : null
}

describe('second-slice golden runs (S11)', () => {
  it('lines a grade-2 bore in band 2 that only collapses where debug forces it', () => {
    const { golden, events } = replayedGolden('casing-lined-band-2')
    expect(ofType(events, 'CasingPlaced').length).toBeGreaterThan(0)
    expect(ofType(events, 'CasingGradeInsufficient')).toEqual([])
    const blocks = ofType(events, 'CollapseStarted').map((event) => event.block)
    expect(blocks).toEqual([forcedBlockOf(golden)])
  })

  it('warns and refills the lined blocks behind a grade-1 dig into band 2', () => {
    const { events } = replayedGolden('collapse-band-2-grade-1')
    const warned = ofType(events, 'CollapseWarned')
    expect(warned.length).toBeGreaterThan(0)
    expect(warned.every((event) => event.band === 2 && event.weakestGrade === 1)).toBe(true)
    expect(ofType(events, 'CollapseStarted').length).toBeGreaterThan(0)
  })

  it('refuses buying at the Sell bay and selling at the Upgrade bay as wrong_bay', () => {
    const { events } = replayedGolden('two-bays-wrong-bay')
    expect(rejectionsOf(events)).toEqual([
      'buyUpgrade:wrong_bay',
      'buyCasingGrade:wrong_bay',
      'sellCargo:wrong_bay',
    ])
    expect(ofType(events, 'UpgradePurchased')).toHaveLength(1)
    expect(ofType(events, 'CasingUpgraded')).toHaveLength(1)
  })

  it('takes the live planet 1 artefact and finds planet 2 a husk that will not open', () => {
    const { events } = replayedGolden('artefact-live-and-husk')
    expect(ofType(events, 'ArtefactChosen').map((event) => event.optionId)).toEqual([
      'artefact.assay_beacon',
    ])
    expect(rejectionsOf(events)).toEqual(['openArtefactCache:artefact_unavailable'])
  })

  it('opens the planet 1 cache rows with the pick, and nothing at the husk (K2 #324)', () => {
    const { events } = replayedGolden('artefact-live-and-husk')
    expect(ofType(events, 'FeatureUnlocked').map((event) => event.featureId)).toEqual([
      'artefacts',
      'ore_whisper',
      'breathing_room',
      'assay_beacon',
    ])
  })

  it('keeps the husk cache chunk digest player-independent', () => {
    const { golden } = replayedGolden('artefact-live-and-husk')
    const husk = replayRun(golden.worldSeed, golden.commands, { endTick: golden.endTick }).state
    const live = replayRun(WORLD_SEED, [
      { playerId: 'p1', tick: 1, seq: 1, type: 'debug.setPlanet', payload: { planetIndex: 2 } },
    ]).state
    expect(husk.players.p1.artefact).not.toBeNull()
    expect(live.players.p1.artefact).toBeNull()
    expect(planet2CacheChunkDigest(husk)).toBe(planet2CacheChunkDigest(live))
  })
})

function planet2CacheChunkDigest(state: AuthorityState): string {
  const params = planetParamsFor(WORLD_SEED, 2)
  const cache = artefactCacheTile(params)
  const [cx, cy] = [chunkOfTile(cache.tx), chunkOfTile(cache.ty)]
  return chunkDigest({
    cells: currentCellsOfChunk(state.world, params, cx, cy),
    density: currentDensityOfChunk(state.world, params, cx, cy),
  })
}
