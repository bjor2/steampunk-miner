/**
 * Energy, the price per unit and the cost of filling the tank (#8, #33 section 6), on Recharge's
 * kernel item card as the shared Title+OneLine element (spec #422, pass #427): the numbers are
 * glyph-and-value facts, what each one is sits in the panel's tooltip.
 */
import type { ChargingPanel as Charging } from '../../systems/views/sellBayModel'
import { panelIconIdOf } from '../../systems/art/icons/iconSet'
import { Panel } from '../kit/Panel'
import { TitleOneLine } from '../kit/TitleOneLine'
import { ScreenButtonView } from '../ScreenButtonView'
import { CHARGING_HEADING, rechargeElementOf, rechargeFactsOf } from './sellBayElements'

export function ChargingPanel({ charging, focusedId }: { charging: Charging; focusedId: string }) {
  const element = rechargeElementOf(charging)
  return (
    <Panel title="Charging" iconId={panelIconIdOf('charging')} heading={CHARGING_HEADING}>
      <TitleOneLine
        text={element.text}
        iconId={charging.rechargeCard.iconId}
        facts={rechargeFactsOf(charging)}
        lockReason={element.lockReason}
      >
        <ScreenButtonView button={charging.recharge} focusedId={focusedId} />
      </TitleOneLine>
    </Panel>
  )
}
