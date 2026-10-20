import { describe, expect, it } from 'vitest'
import { DEV_FLAG_OVERRIDES_KEY } from '../systems/devFlags/devFlagOverrides'
import {
  createDevFlagStorage,
  DEBUG_SESSION_MARKER_KEY,
  forgetDevFlagOverrides,
  isDevFlagSession,
} from './devFlagStorage'
import { createMemoryStorage } from './memoryStorage'
import type { LaunchParameters } from './shell'

// Where a browser keeps its dev flag overrides (ticket 548, the #548 ruling): one localStorage
// item read only in a debug session, the tab's marker in sessionStorage, both forgotten by
// `?noflags`.

const PLAYER_LAUNCH: LaunchParameters = {
  debugEnabled: false,
  scenarioText: null,
  isTitleMenuShown: true,
  isNoFlagsAsked: false,
  materialPopMode: null,
}

function browserWithOverride() {
  const local = createMemoryStorage()
  const session = createMemoryStorage()
  local.setItem(DEV_FLAG_OVERRIDES_KEY, '{"drill.sweptCut":{"isOn":false,"defaultWhenSet":true}}')
  return { local, session, storage: createDevFlagStorage(local, session) }
}

describe('dev flag storage', () => {
  it('keeps the overrides under the one key sm.devFlagOverrides.v1', () => {
    const { local, storage } = browserWithOverride()
    expect(storage.read()).toBe(local.getItem('sm.devFlagOverrides.v1'))
    storage.write(null)
    expect(local.items.size).toBe(0)
  })

  it("leaves a player's launch out of the debug session, so its overrides are never read", () => {
    const { storage } = browserWithOverride()
    expect(isDevFlagSession(PLAYER_LAUNCH, storage)).toBe(false)
  })

  it('reads them on a ?debug launch, or in a tab the hidden gesture marked', () => {
    const { session, storage } = browserWithOverride()
    expect(isDevFlagSession({ ...PLAYER_LAUNCH, debugEnabled: true }, storage)).toBe(true)
    session.setItem(DEBUG_SESSION_MARKER_KEY, '1')
    expect(isDevFlagSession(PLAYER_LAUNCH, storage)).toBe(true)
  })

  it('marks the tab when the hidden gesture enters a debug session, so a reload reads them (ticket 549)', () => {
    const { session, storage } = browserWithOverride()
    storage.markDebugSession()
    expect(session.getItem(DEBUG_SESSION_MARKER_KEY)).not.toBeNull()
    expect(isDevFlagSession(PLAYER_LAUNCH, storage)).toBe(true)
  })

  it('never reads them on a scenario launch', () => {
    const { storage } = browserWithOverride()
    const scenario = { ...PLAYER_LAUNCH, debugEnabled: true, scenarioText: '{}' }
    expect(isDevFlagSession(scenario, storage)).toBe(false)
  })

  it('forgets the overrides and the marker on ?noflags', () => {
    const { local, session, storage } = browserWithOverride()
    session.setItem(DEBUG_SESSION_MARKER_KEY, '1')
    forgetDevFlagOverrides(storage)
    expect(local.getItem(DEV_FLAG_OVERRIDES_KEY)).toBeNull()
    expect(storage.isDebugSessionMarked()).toBe(false)
    expect(isDevFlagSession(PLAYER_LAUNCH, storage)).toBe(false)
  })
})
