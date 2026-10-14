import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityCommand, CommandIntent } from '../authority/authorityCommand'
import { createAuthorityState } from '../authority/authorityState'
import { searSlice } from '../authority/bore/boreAutoFixtures'
import { BORE_STATS, PLAIN_RIG, standInPocket } from '../authority/bore/boreFixtures'
import { createScriptedSession, WORLD_SEED } from '../authority/scriptedSession'
import { stateDigest } from '../authority/stateDigest'
import type { BoreGunStats } from '../registries/boreGun'
import { FACING } from '../vehicle/vehiclePose'
import { mountBoreGunWhenForced, waitFiring, type BorePolicy } from './botBore'
import type { BotPilot } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { playSlice } from './playSlice'

/**
 * #322's 15-tick cadence floor, with a recovery through rock far under it, so the shots come every
 * 15 ticks and a wait split into 60-tick report chunks would show as fewer of them.
 */
const FLOOR_GUN: BoreGunStats = { ...BORE_STATS, cooldownTicks: 15, kGunPct: 10000 }
const WAIT_TICKS = 300
const REPORT_CHUNK_TICKS = 60
/** A stand-in for the slice's `debug.ground-gun.setLevels`: any debug command the kernel knows. */
const WALLS_MOUNT: CommandIntent = { type: 'debug.setMoney', payload: { amount: '7' } }
/** Two minutes of the bot's first trip. */
const SHORT_RUN_TICKS = 2 * 60 * 60

/** A fake slice whose gun answers `stats` and names `WALLS_MOUNT` as its walls mount. */
function gunSlice(stats: BoreGunStats = FLOOR_GUN): SliceDefinition {
  return {
    id: 'probe',
    register(r) {
      r.boreGun({
        id: 'probe.bore-gun',
        boreGunOf: () => stats,
        wallsMountIntent: () => WALLS_MOUNT,
      })
    },
  }
}

/** The bot standing in the bore specs' pocket on planet 1, facing east, with `policy`. */
function botInPocket(policy: BorePolicy): { session: BotSession; pilot: BotPilot } {
  const scripted = createScriptedSession()
  standInPocket(scripted, PLAIN_RIG, 0)
  const session = createBotSession(scripted.state(), 'p1')
  return { session, pilot: { position: PLAIN_RIG, facing: FACING.right, borePolicy: policy } }
}

/** `WAIT_TICKS` waited in `chunk`-tick waits, as `standBy` and `boreTile` split theirs. */
function waitInChunks(policy: BorePolicy, chunk: number): BotSession {
  const { session, pilot } = botInPocket(policy)
  for (let left = WAIT_TICKS; left > 0; left -= chunk) waitFiring(session, pilot, chunk)
  return session
}

function fireTicksOf(commands: readonly AuthorityCommand[]): number[] {
  return commands.filter((command) => command.type === 'ground_gun.fire').map(({ tick }) => tick)
}

function firesOf(commands: readonly AuthorityCommand[]) {
  return commands
    .filter((command) => command.type === 'ground_gun.fire')
    .map(({ tick, payload }) => ({ tick, payload }))
}

function shortRun(borePolicy?: BorePolicy) {
  return playSlice(
    createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    { maxTicks: SHORT_RUN_TICKS, borePolicy },
  )
}

describe('bot: the bore gun policy (ticket 347)', () => {
  it('fires on the same ticks and bearings whether its wait is split per tick, in 60-tick chunks or whole', () => {
    withRegistrations([gunSlice()], () => {
      const perTick = firesOf(waitInChunks('forced', 1).commands())
      expect(firesOf(waitInChunks('forced', REPORT_CHUNK_TICKS).commands())).toEqual(perTick)
      expect(firesOf(waitInChunks('forced', WAIT_TICKS).commands())).toEqual(perTick)
    })
  })

  it('fires at the 15-tick cadence through a wait, not once a report chunk', () => {
    withRegistrations([gunSlice()], () => {
      const ticks = fireTicksOf(waitInChunks('forced', REPORT_CHUNK_TICKS).commands())
      expect(ticks.length).toBeGreaterThan(WAIT_TICKS / REPORT_CHUNK_TICKS)
      expect(ticks.slice(1).map((tick, at) => tick - ticks[at])).toEqual(
        ticks.slice(1).map(() => FLOOR_GUN.cooldownTicks),
      )
    })
  })

  it('leaves the clock exactly where a plain wait does, with every shot accepted', () => {
    withRegistrations([gunSlice()], () => {
      const session = waitInChunks('forced', REPORT_CHUNK_TICKS)
      expect(session.tick()).toBe(botInPocket('forced').session.tick() + WAIT_TICKS)
      expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
    })
  })

  it('never fires under the never policy: the wait is a plain wait', () => {
    withRegistrations([gunSlice()], () => {
      const firing = waitInChunks('never', REPORT_CHUNK_TICKS)
      const { session: plain } = botInPocket('never')
      plain.wait(WAIT_TICKS)
      expect(firing.commands()).toEqual([])
      expect(stateDigest(firing.state())).toBe(stateDigest(plain.state()))
    })
  })

  it('sends nothing with no gun, and still waits the whole wait', () => {
    const session = waitInChunks('forced', REPORT_CHUNK_TICKS)
    expect(session.commands()).toEqual([])
    expect(session.tick()).toBe(botInPocket('forced').session.tick() + WAIT_TICKS)
  })

  it('mounts the gun at its walls only on the forced run, through the provider', () => {
    withRegistrations([gunSlice()], () => {
      const forced = botInPocket('forced').session
      const never = botInPocket('never').session
      mountBoreGunWhenForced(forced, 'forced')
      mountBoreGunWhenForced(never, 'never')
      expect(forced.commands().map(({ type, payload }) => ({ type, payload }))).toEqual([
        WALLS_MOUNT,
      ])
      expect(never.commands()).toEqual([])
    })
  })

  it('plays the never run command for command as a run with no bore policy', () => {
    withRegistrations([gunSlice()], () => {
      expect(shortRun('never').commands).toEqual(shortRun().commands)
    })
  })

  it('fires the gun from its first trip on the forced run, and never on the never run', () => {
    withRegistrations([gunSlice()], () => {
      expect(fireTicksOf(shortRun('forced').commands).length).toBeGreaterThan(0)
      expect(fireTicksOf(shortRun('never').commands)).toEqual([])
    })
  })
})

describe('bot: the auto bore policy (ticket 318, the forced-gun run with auto-shoot on)', () => {
  it('fires as the forced run does until the sear is on its gun', () => {
    const noSear = searSlice({ stats: FLOOR_GUN, sear: null })
    const forced = withRegistrations([noSear], () =>
      firesOf(waitInChunks('forced', REPORT_CHUNK_TICKS).commands()),
    )
    const auto = withRegistrations([noSear], () => waitInChunks('auto', REPORT_CHUNK_TICKS))
    expect(firesOf(auto.commands())).toEqual(forced)
    expect(auto.commands().filter((command) => command.type === 'ground_gun.set_auto')).toEqual([])
  })

  it('switches auto on once, through set_auto, and then leaves the firing to the authority', () => {
    withRegistrations([searSlice({ stats: FLOOR_GUN })], () => {
      const session = waitInChunks('auto', REPORT_CHUNK_TICKS)
      expect(session.commands().map(({ type, payload }) => ({ type, payload }))).toEqual([
        { type: 'ground_gun.set_auto', payload: { on: true } },
      ])
      expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
    })
  })
})
