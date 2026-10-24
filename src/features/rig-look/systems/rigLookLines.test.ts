import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { CLICK_CHAIN } from '../../../systems/authority/purchaseChain'
import { createScriptedSession, dockInBay } from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import ECONOMY_FILE from '../../../systems/economy/economy.json'
import { UPGRADE_IDS, type UpgradeId } from '../../../systems/economy/economyDefinition'
import { isPerPurchaseTrack, minorsPerMajor } from '../../../systems/economy/upgradeSteps'
import { buyUpgradeCommand } from '../../../systems/platform/platformCommands'
import { FUEL_TENDER_TABLE, fuelTenderLookOf } from '../../../systems/render/fuelTenderLook'
import { grantMoneyCommand } from '../../../systems/startScenarioCommands'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { slice } from '../register'
import { decadeStepOf } from './render/rigLookBands'
import { lookFrameAt } from './render/rigLookFrames'
import { rigLookIndexOf, type TrackLookRows } from './render/rigLookIndex'
import { rigLookPlaqueFactOf, SHIPPED_RIG_LOOKS, trackLookFramesOf } from './rigLooks'
import { createRigLookSources } from './rigLookSource'
import { RIG_LOOK_TABLE } from './rigLookTable'

// Every purchasable line's look (ticket 809, LK1): the six upgrade tracks of rigLook.json and the
// fuel tank's coal tender. Each has a look row whose bands follow the VS rule from its own ratio,
// never renders a band invisible, and wears the committed look at the golden counts (0, 1, 10,
// 99, 9999, 1e6, each authored edge and one either side, the first finish band); a band the art
// has not drawn yet is a todo until its LK art ticket lands (#785's pattern). Looks are look-only:
// a run plays byte-identical with the slice registered or not.

/** The golden counts every line is pinned at (#809). */
const GOLDEN_COUNTS = [0, 1, 10, 99, 9_999, 1_000_000]
/** The tank's golden levels: the start, each step, one past each and the golden counts. */
const TANK_GOLDEN_LEVELS = [
  ...new Set([
    1,
    ...FUEL_TENDER_TABLE.steps.flatMap((step) => [step.fromLevel, step.fromLevel + 1]),
    10,
    99,
    9_999,
    1_000_000,
  ]),
].sort((a, b) => a - b)
const TANK_RATIO = ECONOMY_FILE.starMap.fuel.tank.capacityRatio

const rowsOf = (track: string): TrackLookRows => trackLookFramesOf(SHIPPED_RIG_LOOKS, track)!.rows

function economyRatioOf(track: string): string {
  return ECONOMY_FILE.upgrades.find((upgrade) => upgrade.id === track)!.effect.ratio
}

function purchasesPerLevelOf(track: UpgradeId): number {
  return isPerPurchaseTrack(track) ? 1 : minorsPerMajor()
}

/** The counts a line is pinned at: the golden ones, its authored edges and their neighbours. */
function goldenCountsOf(rows: TrackLookRows): number[] {
  const edges = rows.steps.flatMap((step) => [step.from - 1, step.from, step.from + 1])
  const firstFinish = rows.steps[rows.steps.length - 1].from + rows.band.step
  return [...new Set([...GOLDEN_COUNTS, ...edges, firstFinish])].sort((a, b) => a - b)
}

/** One golden line: what `n` purchases show on the track and its hover line. */
function trackGoldenOf(track: string, n: number): string {
  const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, track)!
  const { band, step, tail, pips } = rigLookIndexOf(frames.rows, n)
  const { partId, finish, tint } = lookFrameAt(frames, n)
  const fitting = rigLookPlaqueFactOf(track, n)
  return `${n}: band ${band} step ${step} tail ${tail} pips ${pips} part ${partId} finish ${finish} tint ${tint} | ${fitting}`
}

function tankGoldenOf(level: number): string {
  const { partId, step, tail, finish, pips } = fuelTenderLookOf(level)
  return `${level}: step ${step} tail ${tail} pips ${pips} part ${partId} finish ${finish}`
}

function linesGolden(): string {
  const tracks = RIG_LOOK_TABLE.tracks.map((rows) =>
    [rows.track, ...goldenCountsOf(rows).map((n) => trackGoldenOf(rows.track, n))].join('\n'),
  )
  const tank = ['fuel_tank', ...TANK_GOLDEN_LEVELS.map(tankGoldenOf)].join('\n')
  return `${[...tracks, tank].join('\n\n')}\n`
}

/** A dock run that buys every line across its first edges: each command's events. */
function playLookRun(onEachStep: (events: readonly DomainEvent[]) => void): string {
  const session = createScriptedSession()
  session.submit(1, grantMoneyCommand('1e60'))
  dockInBay(session, 2, 'upgrade')
  let tick = 3
  for (const rows of RIG_LOOK_TABLE.tracks) {
    session.submit(tick++, setUpgradeCommand(rows.track, rows.band.edges[0] - 2))
    for (let buy = 0; buy < 3; buy++) {
      onEachStep(session.submit(tick++, buyUpgradeCommand(rows.track, CLICK_CHAIN)))
    }
  }
  return stateDigest(session.state())
}

/** Every rig look a frame asks, and every flash an event plays, for p1 after each command. */
function lookEveryFrame(events: readonly DomainEvent[]): void {
  const sources = createRigLookSources()
  for (const event of events) for (const source of sources) source.flashOf(event)
}

describe('rig look lines (ticket 809)', () => {
  it('has a look row for every purchasable line: each upgrade track and the fuel tank', () => {
    const tracks = RIG_LOOK_TABLE.tracks.map((rows) => rows.track)
    expect(UPGRADE_IDS.filter((track) => !tracks.includes(track))).toEqual([])
    expect(FUEL_TENDER_TABLE.steps.length).toBeGreaterThan(0)
  })

  it.each([...UPGRADE_IDS])(
    "freezes %s's decade step from its own ratio in economy.json",
    (track) => {
      const decade = decadeStepOf(economyRatioOf(track), purchasesPerLevelOf(track))
      expect(rowsOf(track).band.decadeStep).toBe(decade)
    },
  )

  it("freezes the tender's decade step from the tank's capacity ratio, one step a purchase", () => {
    expect(FUEL_TENDER_TABLE.tail.decadeStep).toBe(decadeStepOf(TANK_RATIO, 1))
    expect(FUEL_TENDER_TABLE.tail.delta).toBe(1)
  })

  it('never renders a band invisible: every band shows its step’s colour or a finish', () => {
    for (const rows of RIG_LOOK_TABLE.tracks) {
      const frames = trackLookFramesOf(SHIPPED_RIG_LOOKS, rows.track)!
      const lastBand = rows.band.edges.length + 20
      for (let band = 1; band <= lastBand; band++) {
        const frame = lookFrameAt(frames, band * rows.band.step)
        expect({ track: rows.track, band, tint: frame.tint !== null }).toMatchObject({ tint: true })
      }
    }
  })

  it('wears the committed look and hover line at every golden count of every line', async () => {
    await expect(linesGolden()).toMatchFileSnapshot('./__goldens__/rigLookLines.golden.txt')
  })

  it('plays a run byte-identical with the rig look registered and looked at every step, or not', () => {
    const lookedAt = withRegistrations([slice], () => playLookRun(lookEveryFrame))
    const without = withRegistrations([], () => playLookRun(() => undefined))
    expect(lookedAt).toBe(without)
  })
})

describe('rig look bands the art has not drawn yet (ticket 809: LK art tickets)', () => {
  for (const rows of RIG_LOOK_TABLE.tracks) {
    for (const edge of rows.band.edges.slice(rows.steps.length)) {
      it.todo(`draws authored art for ${rows.track}'s band from ${edge} purchases`)
    }
  }
})
