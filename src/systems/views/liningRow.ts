/**
 * The Upgrade bay's Lining row (#113 design: the type is a choice on top of the grade): shown on
 * a planet whose lining type is offered (refractory from planet 8) or once the vehicle owns it,
 * and nothing before (#90 vision stub rule). It names the active type; before the unlock its button
 * unlocks the type at its price, after it the button switches the rings laid from now on to the
 * other type, for free.
 */
import { REFRACTORY_LINING_ICON_ID } from '../art/artIds'
import type { AuthorityState } from '../authority/authorityState'
import { isLiningTypeOffered, liningOf, liningPriceOf } from '../authority/liningRules'
import {
  liningTypePriceMultiplier,
  liningTypes,
  STANDARD_LINING_TYPE,
} from '../economy/heatEconomy'
import { toCanonical, ZERO_MONEY } from '../money'
import { buyLiningTypeCommand, selectLiningTypeCommand } from '../platform/platformCommands'
import { isLiningTypeOwned, type VehicleLining } from '../vehicle/liningType'
import { UI_IDS } from './screenIds'
import { amountReading, commandButton, type AmountReading, type ScreenButton } from './viewParts'
import { buyStateOf, isBuyOpen, type BuyState, type RowBadge } from './workshopRows'

export interface LiningRow {
  iconId: string
  label: string
  /** The type the rings are laid in now: "Standard" or "Refractory". */
  activeText: string
  /** What the offered type does, said in words. */
  effectText: string
  /** The unlock's price, 0 once the type is owned. */
  cost: AmountReading
  button: ScreenButton
  buyState: BuyState
  /** A padlock until the type is unlocked. */
  badge: RowBadge
  isBuyOpen: boolean
}

const TYPE_NAMES: Readonly<Record<string, string>> = {
  standard: 'Standard',
  refractory: 'Refractory',
}

const TYPE_EFFECTS: Readonly<Record<string, string>> = {
  refractory: 'seals lava out, cools the tunnel',
}

/** The row for the first lining type offered here, or null while none is. */
export function liningRowOf(state: AuthorityState, playerId: string): LiningRow | null {
  const offered = liningTypes().find(
    (type) => type !== STANDARD_LINING_TYPE && isLiningTypeOffered(state, playerId, type),
  )
  if (offered === undefined) return null
  const lining = liningOf(state, playerId)
  const button = liningButtonOf(state, playerId, lining, offered)
  return {
    iconId: REFRACTORY_LINING_ICON_ID,
    label: 'Lining',
    activeText: nameOf(lining.active),
    effectText: effectTextOf(offered),
    cost: amountReading(
      isLiningTypeOwned(lining, offered) ? ZERO_MONEY : liningPriceOf(state, offered),
    ),
    button,
    buyState: buyStateOf(button),
    badge: isLiningTypeOwned(lining, offered) ? null : 'locked',
    isBuyOpen: isBuyOpen(button),
  }
}

/** Unlock the type, else switch to the type not in use. */
function liningButtonOf(
  state: AuthorityState,
  playerId: string,
  lining: VehicleLining,
  offered: string,
): ScreenButton {
  const id = UI_IDS.upgradebayLiningButton
  if (!isLiningTypeOwned(lining, offered)) {
    return commandButton(state, playerId, id, 'Unlock', buyLiningTypeCommand(offered))
  }
  const other = lining.active === offered ? STANDARD_LINING_TYPE : offered
  const intent = selectLiningTypeCommand(other)
  return commandButton(state, playerId, id, `Use ${nameOf(other)}`, intent)
}

/** "Refractory: seals lava out, cools the tunnel; 1.5× lining charge". */
function effectTextOf(liningType: string): string {
  const multiplier = Number(toCanonical(liningTypePriceMultiplier(liningType)))
  return `${nameOf(liningType)}: ${TYPE_EFFECTS[liningType] ?? ''}; ${multiplier}× lining charge`
}

function nameOf(liningType: string): string {
  return TYPE_NAMES[liningType] ?? liningType
}
