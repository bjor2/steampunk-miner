import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { toCanonical } from '../systems/money'

// Counts every state digest computed anywhere behind the store (#101): the frame and step loops
// read the authority many times a second, and a digest there hashed the whole state each time.
const digests = vi.hoisted(() => ({ computed: 0 }))
vi.mock('../systems/authority/stateDigest', async (importOriginal) => {
  const real = await importOriginal<typeof import('../systems/authority/stateDigest')>()
  return {
    ...real,
    stateDigest: (state: unknown) => {
      digests.computed += 1
      return real.stateDigest(state)
    },
  }
})

// The setup file loads the slices, and a slice that reads the authority loads the real digest
// before this file's mock applies, so the store under test is a fresh module graph with no slices
// registered (a kernel spec never imports one), on which the mock is in place.
let store: typeof import('./gameStore')
let link: typeof import('./authorityLink')
let runLog: typeof import('../logging/runLog')
let digestModule: typeof import('../systems/authority/stateDigest')

beforeAll(async () => {
  vi.resetModules()
  ;(await import('../registries/registrar')).loadSlices([])
  runLog = await import('../logging/runLog')
  store = await import('./gameStore')
  link = await import('./authorityLink')
  digestModule = await import('../systems/authority/stateDigest')
})

beforeEach(() => {
  store.resetGameStore()
  runLog.installRunLog(
    runLog.createRunLog({
      runId: 'run_test',
      sink: createMemorySink(),
      secondsSinceStart: () => 0,
    }),
  )
  digests.computed = 0
})

afterEach(() => runLog.uninstallRunLog())

const game = () => store.useGameStore.getState()

describe('authority reads', () => {
  it('reads the tick, vehicle, enemies and planet world each step without hashing the state', () => {
    game().advanceOneTick()
    game().advanceOneTick()
    const reads = {
      tick: store.readAuthorityTick(),
      energy: store.readLocalVehicle().energy,
      enemies: store.readEnemies().length,
      hasPlanet: store.readPlanetWorld().params !== null,
    }
    expect(reads).toEqual({ tick: 2, energy: 36000, enemies: 0, hasPlanet: true })
    expect(digests.computed).toBe(0)
  })

  it('stamps and dry-runs commands without hashing the state', () => {
    game().giveMoney('7')
    const problems = store.vehicleDebugProblems({
      type: 'debug.setEnergy',
      payload: { energy: '-1' },
    })
    expect({ money: toCanonical(game().money), refused: problems.length > 0 }).toEqual({
      money: '7e+0',
      refused: true,
    })
    expect(digests.computed).toBe(0)
  })

  it('hashes the state once for a session snapshot, the digest of the state the reads return', () => {
    const snapshot = store.takeSessionSnapshot()
    expect(digests.computed).toBe(1)
    expect(snapshot.digest).toBe(digestModule.stateDigest(link.readAuthorityState()))
  })
})
