/**
 * Where the base sheet sits on this screen (ticket 686): full on the phone layout, docked on a
 * desktop stage wide enough to keep the view beside it (`sheetPlacementOf`). Read from the layout
 * the shell last fitted, so the sheet switches with the same breakpoint as the HUD and the tokens.
 */
import { useSyncExternalStore } from 'react'
import { layoutKindOf } from '../../systems/views/designSystem'
import { sheetPlacementOf, type SheetPlacement } from '../../systems/views/sheetLayout'
import { readFittedScreen, subscribeFittedScreen } from '../stage/screenFit'

export function useSheetPlacement(): SheetPlacement {
  return useSyncExternalStore(subscribeFittedScreen, readSheetPlacement, readFullPlacement)
}

/** Before the first fit, and on a server render, the sheet covers the stage. */
function readSheetPlacement(): SheetPlacement {
  const fitted = readFittedScreen()
  if (fitted === null) return 'full'
  return sheetPlacementOf(layoutKindOf(fitted.hudDensity), fitted.stage.width)
}

function readFullPlacement(): SheetPlacement {
  return 'full'
}
