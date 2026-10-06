import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import * as digestModule from '../systems/authority/stateDigest'
import { toCanonical } from '../systems/money'
import {
  readAuthorityTick,
  readEnemies,
  readLocalVehicle,
  readPlanetWorld,
  resetGameStore,
  takeSessionSnapshot,
  useGameStore,
  vehicleDebugProblems,
} from './gameStore'
import { readAuthorityState } from './authorityLink'

// Counts every state digest computed anywhere behind the store (#101): the frame and step loops
// read the authority many times a second, and a digest there hashed the whole state each time.
const digests = vi.hoisted(() => ({ computed: 0 }))
vi.mock('../systems/authority/stateDigest', async (importOriginal) => {
  const real = await importOriginal<typeof digestModule>()
  return {
    ...real,
    stateDigest: (state: unknown) => {
      digests.computed += 1
      return real.stateDigest(state)
    },
  }
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
  digests.computed = 0
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('authority reads', () => {
  it('reads the tick, vehicle, enemies and planet world each step without hashing the state', () => {
    game().advanceOneTick()
    game().advanceOneTick()
    const reads = {
      tick: readAuthorityTick(),
      energy: readLocalVehicle().energy,
      enemies: readEnemies().length,
      hasPlanet: readPlanetWorld().params !== null,
    }
    expect(reads).toEqual({ tick: 2, energy: 36000, enemies: 0, hasPlanet: true })
    expect(digests.computed).toBe(0)
  })

  it('stamps and dry-runs commands without hashing the state', () => {
    game().giveMoney('7')
    const problems = vehicleDebugProblems({ type: 'debug.setEnergy', payload: { energy: '-1' } })
    expect({ money: toCanonical(game().money), refused: problems.length > 0 }).toEqual({
      money: '7e+0',
      refused: true,
    })
    expect(digests.computed).toBe(0)
  })

  it('hashes the state once for a session snapshot, the digest of the state the reads return', () => {
    const snapshot = takeSessionSnapshot()
    expect(digests.computed).toBe(1)
    expect(snapshot.digest).toBe(digestModule.stateDigest(readAuthorityState()))
  })
})
