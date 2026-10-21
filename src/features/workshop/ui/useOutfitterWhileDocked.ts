import { useEffect } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { OUTFITTER_TAB_ID } from './outfitterTab'

/**
 * Docking at the Upgrade bay opens its sheet on the Outfitter (ticket 687): the showcase mounts
 * with the dock and goes with it, so the sheet opens then and, if it still shows the Outfitter,
 * shuts when the rig leaves. Escape shuts the sheet in between and the bay's button opens it again.
 */
export function useOutfitterWhileDocked(): void {
  useEffect(() => {
    openOutfitter()
    return closeOutfitterIfOpen
  }, [])
}

export function openOutfitter(): void {
  useGameStore.getState().openSheet(OUTFITTER_TAB_ID)
}

function closeOutfitterIfOpen(): void {
  if (useGameStore.getState().openSheetTabId === OUTFITTER_TAB_ID)
    useGameStore.getState().closeSheet()
}
