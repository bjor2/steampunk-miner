/**
 * The compact hint chip's place and room (#500): four times a second while the HUD is compact it
 * measures the HUD's boxes, the touch buttons and the stick zone (`data-hud`, `data-hud-zone`),
 * asks `hintRoomOf` where the chip goes and whether it may show, and tells the store, whose hint
 * board then queues or shows. On the full HUD there is always room. Presentation only.
 */
import { useEffect, useState } from 'react'
import { HINT_ROOM_POLL_MS } from '../../constants/screen'
import { useGameStore } from '../../store/gameStore'
import { hintRoomOf, type HintRoom } from '../../systems/views/hintRoom'
import type { ScreenBox } from '../../systems/views/hudClearView'
import type { MeasuredHudBox } from '../../systems/views/hudCoverageReport'
import { HUD_BOX_ATTRIBUTE, HUD_BOX_IDS, HUD_ZONE_ATTRIBUTE } from '../hud/hudBoxes'
import { boxOf, measuredBoxesOf } from '../hud/measuredBoxes'
import { DEVICE_UI_IDS } from '../stage/deviceIds'
import { readFittedScreen } from '../stage/screenFit'
import type { HintChipPlace } from './HintChip'

/** The HUD boxes the chip sits under: the strip (ticket 684) and the grid's rows under it. */
const ROW_IDS: ReadonlySet<string> = new Set([
  HUD_BOX_IDS.strip,
  HUD_BOX_IDS.techTree,
  HUD_BOX_IDS.prompts,
])

/** The boxes the chip never sits on: the touch buttons and the gear button (ticket 684). */
const KEEP_OUT_IDS: ReadonlySet<string> = new Set([HUD_BOX_IDS.control, HUD_BOX_IDS.gear])

export function useHintRoom(isCompact: boolean): HintChipPlace | null {
  const [place, setPlace] = useState<HintChipPlace | null>(null)
  useEffect(() => {
    if (!isCompact) return noteFullRoom()
    const measure = () => {
      const measured = measureHintRoom()
      if (measured === null) return
      useGameStore.getState().noteHintRoom(measured.hasRoom)
      setPlace((kept) => placeKeptOrMoved(kept, measured))
    }
    measure()
    const timer = window.setInterval(measure, HINT_ROOM_POLL_MS)
    return () => window.clearInterval(timer)
  }, [isCompact])
  return isCompact ? place : null
}

function noteFullRoom(): undefined {
  useGameStore.getState().noteHintRoom(true)
  return undefined
}

/** The old place while nothing moved, so a quiet poll draws nothing again. */
function placeKeptOrMoved(kept: HintChipPlace | null, measured: HintChipPlace): HintChipPlace {
  const isUnmoved =
    kept !== null && isSameBox(kept.chip, measured.chip) && isSameBox(kept.layer, measured.layer)
  return isUnmoved ? kept : { chip: measured.chip, layer: measured.layer }
}

function measureHintRoom(): (HintRoom & { layer: ScreenBox }) | null {
  const fitted = readFittedScreen()
  const safeArea = document.querySelector(`[data-testid="${DEVICE_UI_IDS.safeArea}"]`)
  if (safeArea === null || fitted === null) return null
  const layer = boxOf(safeArea)
  const boxes = measuredHudBoxes()
  const room = hintRoomOf({
    screen: { width: window.innerWidth, height: window.innerHeight },
    orientation: fitted.orientation,
    safeArea: layer,
    rows: boxes.filter((box) => ROW_IDS.has(box.id)),
    covering: boxes.filter((box) => box.id !== HUD_BOX_IDS.hint),
    keepOut: [
      ...boxes.filter((box) => KEEP_OUT_IDS.has(box.id)),
      ...measuredBoxesOf(`[${HUD_ZONE_ATTRIBUTE}]`, HUD_ZONE_ATTRIBUTE),
    ],
  })
  return { ...room, layer }
}

function measuredHudBoxes(): MeasuredHudBox[] {
  return measuredBoxesOf(`[${HUD_BOX_ATTRIBUTE}]`, HUD_BOX_ATTRIBUTE)
}

function isSameBox(a: ScreenBox, b: ScreenBox): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}
