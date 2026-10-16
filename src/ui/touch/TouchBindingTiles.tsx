/**
 * The touch binding tiles (#474, the HS decision on #470): the generic panel in the `slots` place
 * of the touch controls, after the cluster. It draws each registered row's tile once, in id order,
 * while the row's anchor is owned, `FeatureUnlocked` or slotted, so an unowned item shows no
 * control; each tile then decides what it shows (the power-up slot column, the fire tile). Every
 * tile presses through the touch runtime, the path the keys take.
 */
import { readAuthorityState } from '../../store/authorityLink'
import { useGameStore } from '../../store/gameStore'
import { shownTouchTileRowsOf, touchBindingRows } from '../registries/touchBindings'
import { useScreenModel } from '../useScreenModel'

export function TouchBindingTiles() {
  const rowIds = useScreenModel(readShownTouchTileRowIds)
  return (
    <>
      {rowIds.map((id) => (
        <TouchBindingTile key={id} rowId={id} />
      ))}
    </>
  )
}

/** The ids of the rows whose tile shows now, for the panel and its specs. */
export function readShownTouchTileRowIds(): string[] {
  const rows = shownTouchTileRowsOf(readAuthorityState(), useGameStore.getState().playerId)
  return rows.map((row) => row.id)
}

function TouchBindingTile({ rowId }: { rowId: string }) {
  const Tile = touchBindingRows().find((row) => row.id === rowId)?.Tile
  return Tile === undefined ? null : <Tile />
}
