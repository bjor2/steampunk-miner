/**
 * What a purchase line says of its hold (ticket 226, #180 section 2): a held step's `chain` and
 * `reserveLeft`, the wallet above the service reserve after it; a click says nothing, so its line
 * is the one logged before chains. Both fields are optional, which keeps `LOG_SCHEMA_VERSION`.
 */
import { isHeldStep } from '../systems/authority/purchaseChain'
import type { PurchaseChainStamp } from '../systems/authority/domainEvent'

export interface HeldStepFields {
  chain?: number
  reserveLeft?: string
}

export function heldStepFieldsOf({ chain, reserveLeft }: PurchaseChainStamp): HeldStepFields {
  return isHeldStep(chain) ? { chain, reserveLeft } : {}
}
