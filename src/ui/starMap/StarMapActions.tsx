/**
 * The star map's controls as they draw (ticket 793): a planet row's Buy fuel and Jump, the tank's
 * next level and the jump drive where the Sell bay sells them, and the jump to the next system on
 * the system's last planet. Each is a `ScreenButtonView` on the model's button, so a click or a tap
 * presses it through the store as `ui_confirm` does, and a refused one shows its reason and sends
 * nothing. Drawn from `starMapControlsOf`; markup only.
 */
import { hudLabelIconIdOf } from '../../systems/art/icons/iconSet'
import type { JumpControls, StarMapPurchase } from '../../systems/views/starMapControls'
import type { ElementText } from '../../systems/views/uiText'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { ScreenButtonView } from '../ScreenButtonView'
import { STAR_MAP_UI_IDS } from './starMapIds'
import styles from './StarMapActions.module.css'

const MONEY_ICON_ID = hudLabelIconIdOf('money')

/** A Jump with its Buy fuel before it, as the fuel comes first. */
export function JumpActions({
  controls,
  focusedId,
}: {
  controls: JumpControls
  focusedId: string | null
}) {
  return (
    <span className={styles.actions} data-armed={controls.isArmed || undefined}>
      {controls.buyFuel !== null && (
        <ScreenButtonView button={controls.buyFuel} focusedId={focusedId} />
      )}
      <ScreenButtonView button={controls.jump} focusedId={focusedId} />
    </span>
  )
}

/** A purchase's button, under the element its price sits on. */
export function PurchaseAction({
  purchase,
  focusedId,
}: {
  purchase: StarMapPurchase
  focusedId: string | null
}) {
  return (
    <span className={styles.actions}>
      <ScreenButtonView button={purchase.button} focusedId={focusedId} />
    </span>
  )
}

/** The price on the element whose purchase it is; red while the wallet cannot pay it. */
export function purchaseFactOf({ button, price }: StarMapPurchase): IconValue {
  const isMoneyShort = button.reason === 'money_short'
  return { iconId: MONEY_ICON_ID, ...price, holds: 'price', isMoneyShort }
}

const DRIVE_TEXT: ElementText = {
  id: 'star-map.jump-drive',
  title: 'Jump drive',
  oneLine: 'Lets a jump cross into the next solar system.',
  tooltipLines: [],
}

/** The jump drive, sold at the Sell bay until it is fitted (ticket 759). */
export function JumpDriveOffer({
  purchase,
  focusedId,
}: {
  purchase: StarMapPurchase
  focusedId: string | null
}) {
  return (
    <div className={styles.offer} data-testid={STAR_MAP_UI_IDS.starMapDrive}>
      <TitleOneLine text={DRIVE_TEXT} facts={[purchaseFactOf(purchase)]}>
        <PurchaseAction purchase={purchase} focusedId={focusedId} />
      </TitleOneLine>
    </div>
  )
}

const JUMP_OUT_TEXT: ElementText = {
  id: 'star-map.jump-out',
  title: 'Next system',
  oneLine: 'The drive jumps on to the next solar system.',
  tooltipLines: [],
}

/** On the system's last planet with the drive fitted: the way on to the next system. */
export function JumpOutOffer({
  controls,
  focusedId,
}: {
  controls: JumpControls
  focusedId: string | null
}) {
  return (
    <div className={styles.offer} data-testid={STAR_MAP_UI_IDS.starMapJumpOut}>
      <TitleOneLine text={JUMP_OUT_TEXT}>
        <JumpActions controls={controls} focusedId={focusedId} />
      </TitleOneLine>
    </div>
  )
}
