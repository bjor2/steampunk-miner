import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../../../logging/eventSink'
import { derivePurchaseChains } from '../../../logging/purchaseChains'
import { createRunLog, installRunLog, uninstallRunLog } from '../../../logging/runLog'
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../../../store/gameStore'
import { listenForSoundCues, type SoundCueRequest } from '../../../store/soundCueRequests'
import {
  addSoundingVoice,
  createVoicePool,
  releaseRungOutVoices,
  soundingCountOf,
  takeVoiceToSteal,
} from '../../../systems/audio/voicePool'
import { serviceReserveOf } from '../../../systems/authority/serviceReserve'
import type { UpgradeId } from '../../../systems/economy/economyDefinition'
import { stepPrice } from '../../../systems/economy/upgradePrices'
import { stepOfMajor } from '../../../systems/economy/upgradeSteps'
import {
  add,
  fromCanonical,
  sub,
  toCanonical,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import { replayRun } from '../../../systems/replay/replayRun'
import { UI_ID_TEMPLATES } from '../../../systems/views/screenIds'
import { HOLD_CURVE } from '../systems/holdChain'
import {
  CADENCE_CUE_ID,
  FLOURISH_CUE_ID,
  PURCHASE_SOUND,
  RATCHET_CUE_ID,
} from '../systems/render/purchaseSound'
import { resetWorkshopStore, useWorkshopStore } from './workshopStore'

const game = () => useGameStore.getState()
const workshop = () => useWorkshopStore.getState()
const TICKS_PER_SECOND = 60

let sink: MemorySink
let cues: { tick: number; request: SoundCueRequest }[]
let stopListening: (() => void)[]

beforeEach(() => {
  resetGameStore()
  resetWorkshopStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  cues = []
  stopListening = [
    listenForDomainEvents(workshop().hearPurchases),
    listenForSoundCues((request) => cues.push({ tick: tick(), request })),
  ]
})

afterEach(() => {
  stopListening.forEach((stop) => stop())
  uninstallRunLog()
})

/** Docked at the Upgrade bay with `wallet`, a full one unless named. */
function atUpgradeBayWith(wallet = '1e9'): void {
  game().giveMoney(wallet)
  game().teleportToDock('upgrade')
}

function tick(): number {
  return readAuthorityState().tick
}

function stepOf(upgradeId: UpgradeId): number {
  return readAuthorityState().players[game().playerId].vehicle.levels[upgradeId]
}

/** The frames of `ticks` ticks at `framesPerSecond`, each advancing the hold to its tick. */
function runFrames(ticks: number, framesPerSecond = TICKS_PER_SECOND): void {
  const end = tick() + ticks
  let frame = 0
  while (tick() < end) {
    const frameTick = Math.min(end, tick() + Math.ceil(TICKS_PER_SECOND / framesPerSecond))
    while (tick() < frameTick) game().advanceOneTick()
    workshop().advanceHoldTo(tick())
    frame++
  }
  expect(frame).toBeGreaterThan(0)
}

/** Holds the track until `steps` have landed, as `holdBuy` does. */
function holdFor(upgradeId: UpgradeId, steps: number, framesPerSecond?: number): void {
  workshop().pressTrack(upgradeId, tick(), steps)
  runFrames(1200, framesPerSecond)
}

function boughtTicks(): number[] {
  return sink.commands.filter((command) => command.type === 'buyUpgrade').map(({ tick }) => tick)
}

function boughtChains(): number[] {
  return sink.commands
    .filter((command) => command.type === 'buyUpgrade')
    .map((command) => (command.payload as { chain: number }).chain)
}

function priceOfSteps(upgradeId: UpgradeId, from: number, count: number): Money {
  return Array.from({ length: count }, (_, at) => stepPrice(upgradeId, from + at, 1)).reduce(
    add,
    ZERO_MONEY,
  )
}

describe('workshop hold-to-buy controller', () => {
  it('buys exactly one for a press released inside the wind-up, as a click', () => {
    atUpgradeBayWith()
    workshop().pressTrack('drill_power', tick())
    runFrames(HOLD_CURVE.windUpTicks - 1)
    workshop().releaseHold()
    runFrames(120)

    expect(stepOf('drill_power')).toBe(1)
    expect(boughtChains()).toEqual([0])
    expect(workshop().tally).toMatchObject({ steps: 1, cue: 'ka_chunk' })
  })

  it("steps a held chain on G&V's curve, each held step its own command with the hold's id", () => {
    atUpgradeBayWith()
    holdFor('drill_power', 5)
    const ticks = boughtTicks()
    const gaps = ticks.slice(1).map((at, index) => at - ticks[index])

    expect(gaps).toEqual([HOLD_CURVE.windUpTicks, ...HOLD_CURVE.gapTicks.slice(0, 3)])
    expect(boughtChains()).toEqual([0, 1, 1, 1, 1])
  })

  it('takes the same ticks at 30 and 144 frames a second', () => {
    atUpgradeBayWith()
    holdFor('engine', 12, 30)
    const at30 = boughtTicks().map((at) => at - boughtTicks()[0])
    resetGameStore()
    resetWorkshopStore()
    sink = createMemorySink()
    installRunLog(createRunLog({ runId: 'run_144', sink, secondsSinceStart: () => 0 }))
    atUpgradeBayWith()
    holdFor('engine', 12, 144)
    const at144 = boughtTicks().map((at) => at - boughtTicks()[0])

    expect(at30.length).toBe(12)
    at30.forEach((at, index) => expect(Math.abs(at - at144[index])).toBeLessThanOrEqual(1))
  })

  it('ends the chain on release with the ka-chunk, and keeps every step bought', () => {
    atUpgradeBayWith()
    workshop().pressTrack('engine', tick())
    runFrames(HOLD_CURVE.windUpTicks + HOLD_CURVE.gapTicks[0])
    workshop().releaseHold()
    runFrames(240)

    expect(stepOf('engine')).toBe(3)
    expect(workshop().tally).toMatchObject({ upgradeId: 'engine', steps: 3, cue: 'ka_chunk' })
    expect(cues.at(-1)?.request.cueId).toBe(CADENCE_CUE_ID)
  })

  it('never jumps to another track: leaving the plaque ends the hold', () => {
    atUpgradeBayWith()
    workshop().pressTrack('drill_power', tick())
    runFrames(HOLD_CURVE.windUpTicks)
    workshop().leaveTrack('drill_power')
    runFrames(240)

    expect(stepOf('drill_power')).toBe(2)
    expect(stepOf('engine')).toBe(0)
    expect(workshop().hold?.chain.end).toBe('focus_left')
  })

  it("stops at can't afford with the soft clunk, and the steps before it stand", () => {
    atUpgradeBayWith(toCanonical(priceOfSteps('drill_tip', 0, 4)))
    holdFor('drill_tip', 20)

    expect(stepOf('drill_tip')).toBe(4)
    expect(workshop().tally).toMatchObject({ steps: 4, cue: 'empty_clunk' })
  })

  it('stops a held step at the service reserve, while a click may still spend into it', () => {
    game().setHull('40')
    game().teleportToDock('upgrade')
    const reserve = serviceReserveOf(readAuthorityState(), game().playerId)
    const fifth = stepPrice('drill_power', 5, 1)
    const wallet = add(
      add(priceOfSteps('drill_power', 0, 5), reserve),
      sub(fifth, fromCanonical('1')),
    )
    game().giveMoney(toCanonical(wallet))
    holdFor('drill_power', 20)

    expect(stepOf('drill_power')).toBe(5)
    expect(workshop().tally).toMatchObject({ steps: 5, cue: 'reserve_hold' })
    workshop().pressTrack('drill_power', tick())
    workshop().releaseHold()
    expect(stepOf('drill_power')).toBe(6)
  })

  it('ends a hold on a refusal its prediction missed, and no bought step reverts', () => {
    atUpgradeBayWith()
    workshop().pressTrack('engine', tick())
    runFrames(HOLD_CURVE.windUpTicks + HOLD_CURVE.gapTicks[0])
    const chainId = workshop().hold?.chainId ?? 0
    workshop().hearPurchases(
      [
        {
          type: 'CommandRejected',
          commandType: 'buyUpgrade',
          reason: 'service_reserve',
          problems: ['another client spent the wallet first'],
          chain: chainId,
          tick: tick(),
          playerId: game().playerId,
          seq: 99,
        },
      ],
      game().playerId,
    )
    runFrames(240)

    expect(stepOf('engine')).toBe(3)
    expect(workshop().hold?.chain).toMatchObject({ end: 'refused', refusal: 'service_reserve' })
    expect(workshop().tally).toMatchObject({ steps: 3, cue: 'reserve_hold' })
  })

  it('breathes on an ordinary major for the pause, resumes a row slower and plays its flourish', () => {
    atUpgradeBayWith()
    holdFor('drill_power', 13)
    const ticks = boughtTicks()
    const majorAt = stepOfMajor(1) - 1

    expect(ticks[majorAt + 1] - ticks[majorAt]).toBe(HOLD_CURVE.majorPauseTicks)
    expect(cues.filter(({ request }) => request.cueId === FLOURISH_CUE_ID)).toHaveLength(1)
    expect(workshop().reactions).toContainEqual({
      upgradeId: 'drill_power',
      moment: 'pip',
      startTick: ticks[12],
    })
  })

  it('fits 30 held buys with two majors on a full wallet in 170 to 200 ticks', () => {
    atUpgradeBayWith()
    holdFor('drill_power', 30)
    const ticks = boughtTicks()

    expect(ticks).toHaveLength(30)
    expect(ticks[29] - ticks[0]).toBeGreaterThanOrEqual(170)
    expect(ticks[29] - ticks[0]).toBeLessThanOrEqual(200)
  })

  it('keeps a 50-purchase spree within 4 ratchet voices and 1 flourish', () => {
    atUpgradeBayWith()
    holdFor('drill_power', 50)
    const loudest = loudestVoicesOf(cues)

    expect(stepOf('drill_power')).toBe(50)
    expect(loudest[RATCHET_CUE_ID]).toBe(4)
    expect(loudest[FLOURISH_CUE_ID]).toBe(1)
    expect(stolenRatchetVoicesOf(cues)).toBeGreaterThan(0)
  })

  it('replays a held chain from its commands to the same digest, and its log derives the chain', () => {
    atUpgradeBayWith(toCanonical(priceOfSteps('cargo_hold', 0, 12)))
    holdFor('cargo_hold', 40)
    const replay = replayRun(1, sink.commands, {
      playerIds: [game().playerId],
      endTick: takeSessionSnapshot().tick,
    })
    const [chain] = derivePurchaseChains(sink.events)

    expect(replay.digests.at(-1)?.digest).toBe(takeSessionSnapshot().digest)
    expect(chain).toMatchObject({ track: 'cargo_hold', steps: 11, stoppedBy: 'money_short' })
  })
})

const FIRST_TOUCH = { isTouch: true, isCardOpen: false, hasCard: true, isBuyOpen: true }

describe("workshop: a press on a plaque's Buy", () => {
  it('opens the card on a first touch and buys nothing', () => {
    atUpgradeBayWith()
    workshop().pressPlaqueBuy('drill_tip', tick(), FIRST_TOUCH)
    runFrames(60)

    expect(game().focusedControlId).toBe(UI_ID_TEMPLATES.workshopUpgradeBuy('drill_tip'))
    expect(workshop().selected).toBe('drill_tip')
    expect(stepOf('drill_tip')).toBe(0)
    expect(boughtTicks()).toEqual([])
  })

  it('runs the chain on the curve for a touch held past the wind-up on the open card', () => {
    atUpgradeBayWith()
    workshop().pressPlaqueBuy('drill_tip', tick(), FIRST_TOUCH)
    workshop().pressPlaqueBuy('drill_tip', tick(), { ...FIRST_TOUCH, isCardOpen: true })
    runFrames(HOLD_CURVE.windUpTicks + HOLD_CURVE.gapTicks[0])
    workshop().releaseHold()
    runFrames(120)
    const ticks = boughtTicks()

    expect(ticks.slice(1).map((at, index) => at - ticks[index])).toEqual([
      HOLD_CURVE.windUpTicks,
      HOLD_CURVE.gapTicks[0],
    ])
    expect(boughtChains()).toEqual([0, 1, 1])
    expect(stepOf('drill_tip')).toBe(3)
  })

  it('never sends a step for a plaque whose Buy is refused', () => {
    atUpgradeBayWith()
    const refused = { ...FIRST_TOUCH, isTouch: false, isCardOpen: true, isBuyOpen: false }
    workshop().pressPlaqueBuy('engine', tick(), refused)
    runFrames(60)

    expect(boughtTicks()).toEqual([])
    expect(workshop().hold).toBeNull()
  })
})

/** The cues' voices through the kernel's voice pool, at the ticks they were asked for. */
function loudestVoicesOf(heard: typeof cues): Record<string, number> {
  const pool = createVoicePool<number>()
  const loudest: Record<string, number> = {}
  heard.forEach(({ tick: at, request }, voice) => {
    const cue = PURCHASE_SOUND.cues.find((candidate) => candidate.id === request.cueId)!
    const now = at / TICKS_PER_SECOND
    releaseRungOutVoices(pool, now)
    takeVoiceToSteal(pool, cue.id, cue.voices)
    addSoundingVoice(pool, { cueId: cue.id, startedAt: now, endsAt: now + cue.tone.seconds, voice })
    loudest[cue.id] = Math.max(loudest[cue.id] ?? 0, soundingCountOf(pool, cue.id))
  })
  return loudest
}

function stolenRatchetVoicesOf(heard: typeof cues): number {
  const pool = createVoicePool<number>()
  const ratchet = PURCHASE_SOUND.cues.find((cue) => cue.id === RATCHET_CUE_ID)!
  return heard
    .filter(({ request }) => request.cueId === RATCHET_CUE_ID)
    .reduce((stolen, { tick: at }, voice) => {
      const now = at / TICKS_PER_SECOND
      releaseRungOutVoices(pool, now)
      const taken = takeVoiceToSteal(pool, ratchet.id, ratchet.voices) === null ? 0 : 1
      addSoundingVoice(pool, { cueId: ratchet.id, startedAt: now, endsAt: now + 1, voice })
      return stolen + taken
    }, 0)
}
