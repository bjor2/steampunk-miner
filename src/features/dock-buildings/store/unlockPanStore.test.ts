import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { advanceAuthorityTo, readAuthorityState } from '../../../store/authorityLink'
import { resetGameStore, takeSessionSnapshot, useGameStore } from '../../../store/gameStore'
import { dockSiteOfPlanet } from '../../../systems/authority/planetOfState'
import { vehicleStagingOf } from '../../../systems/registries/vehicleStaging'
import { dockAddOnOfRow } from '../systems/dockAddOns'
import { dockAddOnLookPointOf } from '../systems/render/dockAddOnPlacement'
import { PAN_IN_TICKS, PAN_TICKS } from '../systems/render/unlockPan'
import {
  armedUnlockPanRowId,
  followUnlockPans,
  resetDockBuildingsStore,
  shownUnlockPan,
} from './unlockPanStore'

// The pan follows the real session (#222): travel through the game store, read the staging the
// fixed step reads. The loaded slice is the staging provider, as in the game.

let stopFollowing: () => void

beforeEach(() => {
  resetGameStore()
  resetDockBuildingsStore()
  stopFollowing = followUnlockPans()
})

afterEach(() => stopFollowing())

const game = () => useGameStore.getState()

/** Docked at the Exchange on `fromPlanet` with the fee and the core paid up, then travel. */
function travelFrom(fromPlanet: number): void {
  game().setPlanet(fromPlanet)
  game().teleportToDock('sell')
  game().giveMoney('1e40')
  game().setCoreFragments(100_000)
  game().travel()
}

function cameraNow() {
  return vehicleStagingOf(readAuthorityState(), game().playerId)
}

describe('unlock pan', () => {
  it('arms on arriving where an add-on is built and waits while the travel card covers the pad', () => {
    travelFrom(13)
    expect(game().planetTier).toBe(14)
    expect(game().travelTransition).not.toBeNull()
    expect(armedUnlockPanRowId()).toBe('scanner_station')
    game().undock()
    expect(shownUnlockPan()).toBeNull()
  })

  it('waits while the platform lands docked, as the bay screen covers the pad', () => {
    travelFrom(13)
    game().finishTravelTransition()
    expect(armedUnlockPanRowId()).toBe('scanner_station')
    expect(shownUnlockPan()).toBeNull()
  })

  it('pans the camera onto the new building once the pad is on screen, then hands it back', () => {
    travelFrom(13)
    game().finishTravelTransition()
    game().undock()
    const shown = shownUnlockPan()!
    expect(shown.planetIndex).toBe(14)
    expect(shown.pan.startTick).toBe(readAuthorityState().tick)
    advanceAuthorityTo(shown.pan.startTick + PAN_IN_TICKS)
    const look = dockAddOnLookPointOf(
      dockSiteOfPlanet(readAuthorityState().planet)!,
      dockAddOnOfRow('scanner_station')!,
    )
    expect(cameraNow()).toMatchObject({ cameraX: look.x, cameraY: look.y, cameraWeight: 1 })
    expect(cameraNow()?.isHoldingInput).toBe(false)
    advanceAuthorityTo(shown.pan.startTick + PAN_TICKS)
    expect(cameraNow()).toBeNull()
    expect(armedUnlockPanRowId()).toBeNull()
  })

  it('replays no pan after a reload: the restored session arms nothing', () => {
    travelFrom(13)
    game().finishTravelTransition()
    game().undock()
    const saved = takeSessionSnapshot()
    resetDockBuildingsStore()
    game().restoreSnapshot(saved)
    expect(armedUnlockPanRowId()).toBeNull()
    expect(shownUnlockPan()).toBeNull()
    expect(cameraNow()).toBeNull()
  })

  it('pans onto nothing on arriving at a planet with no new add-on', () => {
    travelFrom(1)
    game().finishTravelTransition()
    game().undock()
    expect(armedUnlockPanRowId()).toBeNull()
    expect(shownUnlockPan()).toBeNull()
    expect(cameraNow()).toBeNull()
  })
})
