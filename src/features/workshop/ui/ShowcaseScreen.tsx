/**
 * The Upgrade bay as a showcase (#180 sections 1 and 2; the GD's "the rig is the hero"): the bay
 * header on top, the car in the middle with nothing over it, and the footer below with the button
 * that opens the bay's sheet. What the bay sells is the Outfitter on the one base sheet (spec #678,
 * ticket 687), which opens as the rig docks: beside the car on desktop, over it on a phone until
 * Close. Registered as the `upgrade` bay's screen, drawn over the scene in place of the kernel's
 * frame (`bayScreens`, K-b ticket 227). Markup only.
 */
import type { CSSProperties, ReactNode } from 'react'
import { useGameStore } from '../../../store/gameStore'
import { readUpgradeBayModel } from '../../../store/screenReads'
import { focusOnScreen } from '../../../systems/views/menuFocus'
import { upgradeBayStartFocus, type UpgradeBayModel } from '../../../systems/views/upgradeBayModel'
import type { ElementText } from '../../../systems/views/uiText'
import { UI_IDS } from '../../../ui/ids'
import { Button } from '../../../ui/kit/Button'
import { ScrollArea } from '../../../ui/kit/ScrollArea'
import { TitleOneLine } from '../../../ui/kit/TitleOneLine'
import { BayFooter } from '../../../ui/platform/BayFooter'
import { BayHeader } from '../../../ui/platform/BayHeader'
import { useScreenModel } from '../../../ui/useScreenModel'
import { OUTFITTER_TAB } from './outfitterTab'
import { WORKSHOP_TEST_IDS } from './testIds'
import { openOutfitter, useOutfitterWhileDocked } from './useOutfitterWhileDocked'
import { useShowcaseClock } from './useShowcaseClock'
import styles from './ShowcaseScreen.module.css'

/** The layout's `--shop-text`, as the kernel's bay frame sets it (`BayFrame`). */
const SHOP_TYPE = { fontSize: 'var(--shop-text)', '--kit-label-size': '1em' } as CSSProperties

const OUTFITTER_TEXT: ElementText = {
  id: 'workshop.outfitter.open',
  title: OUTFITTER_TAB.title,
  oneLine: '',
  tooltipLines: [],
}

export function ShowcaseScreen() {
  const model = useScreenModel(readUpgradeBayModel)
  const focusedId = useUpgradeBayFocus(model)
  useShowcaseClock()
  useOutfitterWhileDocked()
  return <ShowcaseView model={model} focusedId={focusedId} onOpenOutfitter={openOutfitter} />
}

/** The showcase's markup for a bay model and the resolved menu focus. */
export function ShowcaseView({
  model,
  focusedId,
  onOpenOutfitter,
}: {
  model: UpgradeBayModel
  focusedId: string
  onOpenOutfitter: () => void
}) {
  return (
    <div
      className={styles.showcase}
      style={SHOP_TYPE}
      data-testid={UI_IDS.platformScreen}
      data-bay={model.header.bay}
      data-accent={model.header.accent}
    >
      <Band>
        <BayHeader header={model.header} />
      </Band>
      <div className={styles.car} data-testid={UI_IDS.upgradebayScreen}>
        <div className={styles.car} data-testid={WORKSHOP_TEST_IDS.showcase} />
      </div>
      <Band>
        <TitleOneLine text={OUTFITTER_TEXT} level="span" layout="row">
          <Button label="Open" onPress={onOpenOutfitter} testId={WORKSHOP_TEST_IDS.openOutfitter} />
        </TitleOneLine>
        <BayFooter bay={model.header.bay} footer={model.footer} focusedId={focusedId} />
      </Band>
    </div>
  )
}

/** A brass band; on a short screen it scrolls in the shared scroll area (spec #422 ruling 3). */
function Band({ children }: { children: ReactNode }) {
  return (
    <ScrollArea className={styles.bandFrame}>
      <div className={styles.band}>{children}</div>
    </ScrollArea>
  )
}

function useUpgradeBayFocus(model: UpgradeBayModel): string {
  const focusedControlId = useGameStore((state) => state.focusedControlId)
  return focusOnScreen(model.focusStops, focusedControlId, upgradeBayStartFocus(model))
}
