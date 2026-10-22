import { useEffect } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { OUTFITTER_TAB_ID } from './outfitterTab'

/**
 * Docking at the Upgrade bay opens its sheet on the Outfitter (ticket 687) as the bay's one menu
 * (ticket 734): the showcase mounts with the dock and goes with it, so the sheet opens then and
 * shuts when the rig leaves. Its one close leaves the bay too, so play is back after one close.
 */
export function useOutfitterWhileDocked(): void {
  useEffect(() => {
    openOutfitter()
    return shutOutfitterWithDock
  }, [])
}

/** Also the bay's button, once the sheet was shut another way (the Ledger took it, ticket 688). */
export function openOutfitter(): void {
  useGameStore.getState().openSheetAsBayMenu(OUTFITTER_TAB_ID)
}

function shutOutfitterWithDock(): void {
  useGameStore.getState().shutBayMenuSheet()
}
