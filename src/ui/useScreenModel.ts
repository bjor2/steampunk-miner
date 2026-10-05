import { useEffect, useState } from 'react'
import { SCREEN_REFRESH_MS } from '../constants/scene'
import { useGameStore, type GameState } from '../store/gameStore'

/**
 * A screen's view model, re-read when the store's replica or presentation state changes and on a
 * short timer for what moves every tick (enemies, the compass). A re-read that equals what is
 * shown keeps the shown model, so React renders only real changes.
 */
export function useScreenModel<T>(read: () => T): T {
  const [model, setModel] = useState(read)
  useEffect(() => {
    const refresh = () => setModel((shown) => unlessUnchanged(shown, read()))
    const timer = window.setInterval(refresh, SCREEN_REFRESH_MS)
    const unsubscribe = useGameStore.subscribe((state, previous) => {
      if (isScreenSourceChanged(state, previous)) refresh()
    })
    return () => {
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [read])
  return model
}

function unlessUnchanged<T>(shown: T, next: T): T {
  return JSON.stringify(shown) === JSON.stringify(next) ? shown : next
}

/** The replica objects are rebuilt only when they change, so a reference check is enough. */
function isScreenSourceChanged(state: GameState, previous: GameState): boolean {
  return (
    state.vehicle !== previous.vehicle ||
    state.money !== previous.money ||
    state.platform !== previous.platform ||
    state.planetTier !== previous.planetTier ||
    state.focusedControlId !== previous.focusedControlId ||
    state.isTravelArmed !== previous.isTravelArmed ||
    state.prefs !== previous.prefs ||
    state.bindings !== previous.bindings ||
    state.bindingProblems !== previous.bindingProblems ||
    state.rebindingActionId !== previous.rebindingActionId ||
    state.hintBoard !== previous.hintBoard ||
    state.transmissionBoard !== previous.transmissionBoard ||
    state.arePlaquesAllowed !== previous.arePlaquesAllowed
  )
}
