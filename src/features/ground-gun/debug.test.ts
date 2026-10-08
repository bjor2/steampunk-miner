import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listenForDomainEvents } from '../../store/domainEventBroadcast'
import { resetGameStore, useGameStore } from '../../store/gameStore'
import type { DomainEvent } from '../../systems/authority/domainEvent'
import { listenForSoundCues, type SoundCueRequest } from '../../store/soundCueRequests'
import { groundGunDebugActions } from './debug'
import { hearFireRefusals, pressFireTile, releaseFireTile, resetFireInput } from './store/fireInput'
import { FIRE_TILE_FEEL } from './systems/render/fireTileFeel'

const stops: (() => void)[] = []

beforeEach(() => {
  resetGameStore()
  resetFireInput()
})

afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
})

describe('ground-gun: debug actions', () => {
  it('reads no gun at the start, then the levels it sets', () => {
    expect(groundGunDebugActions.getGun()).toMatchObject({
      ok: true,
      levels: { rate: 0, penetration: 0, energy: 0 },
      tile: null,
      aimBearing: null,
    })
    expect(groundGunDebugActions.setLevels(1, 2, 3)).toEqual({ ok: true })
    expect(groundGunDebugActions.getGun()).toMatchObject({
      levels: { rate: 1, penetration: 2, energy: 3 },
      tile: { recoveryFilledPercent: 100, isRecovering: false },
    })
  })

  it('refuses levels off a track, setting nothing', () => {
    expect(groundGunDebugActions.setLevels(0, 2, 3)).toMatchObject({ ok: false })
    expect(groundGunDebugActions.setLevels(1, 99, 1)).toMatchObject({ ok: false })
    expect(groundGunDebugActions.getGun()).toMatchObject({
      levels: { rate: 0, penetration: 0, energy: 0 },
    })
  })
})

describe('ground-gun: the fire tile through the game store', () => {
  function refusalOf(reason: string): DomainEvent {
    return {
      type: 'CommandRejected',
      commandType: 'ground_gun.fire',
      reason,
      problems: [],
      playerId: useGameStore.getState().playerId,
      tick: 0,
      seq: 0,
    } as DomainEvent
  }

  it('fires a tap at once, and a second tap inside the recovery waits without a refusal', () => {
    const answers: DomainEvent[] = []
    stops.push(listenForDomainEvents((events) => answers.push(...events)))
    groundGunDebugActions.setLevels(1, 1, 1)
    pressFireTile()
    releaseFireTile()
    pressFireTile()
    releaseFireTile()
    expect(answers.filter((event) => event.type === 'BoreFired')).toHaveLength(1)
    expect(answers.filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  it('clanks once for a blocked shot and stays silent for the recovery', () => {
    const clanks: SoundCueRequest[] = []
    stops.push(listenForSoundCues((request) => clanks.push(request)))
    const playerId = useGameStore.getState().playerId
    hearFireRefusals([refusalOf('recovering')], playerId)
    expect(clanks).toEqual([])
    hearFireRefusals([refusalOf('energy_short')], playerId)
    expect(clanks.map((request) => request.cueId)).toEqual([FIRE_TILE_FEEL.refusalClank.id])
  })
})
