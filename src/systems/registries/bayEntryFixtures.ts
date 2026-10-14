/**
 * A fake slice selling bay entries (ticket 344), for the kernel specs: the store spec and the view
 * spec share it, so neither imports a slice. Its buy is the kernel's casing grade, a command the
 * Upgrade bay accepts, so a press that reaches the authority shows in the casing grade.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { AuthorityState } from '../authority/authorityState'
import { CLICK_CHAIN } from '../authority/purchaseChain'
import { fromSafeInteger } from '../money'
import { buyCasingGradeCommand } from '../platform/platformCommands'
import { itemCardOf, SHOP_SOURCE } from '../views/itemCardModel'
import { UI_ID_TEMPLATES } from '../views/screenIds'
import { amountReading, commandButton } from '../views/viewParts'
import type { BayEntry, BayEntrySource } from './bayEntries'
import type { ItemRef } from './itemDescriber'

export const ENTRY_PROBE_SLICE = 'entry-probe'

/** How a probe entry reads: for sale, or at its wall with no buy. */
export interface ProbeEntry {
  entryId: string
  isMastered?: boolean
  item?: ItemRef
}

/** A source the spec counts the asks of. */
export interface ProbeSource {
  source: BayEntrySource
  asks: () => number
}

const PROBE_PRICE = fromSafeInteger(10)

export function probeSourceOf(
  id: string,
  anchorFeatureId: string,
  entries: readonly ProbeEntry[],
): ProbeSource {
  let asks = 0
  const source: BayEntrySource = {
    id,
    bay: 'upgrade',
    anchorFeatureId,
    entriesOf: (state, playerId) => {
      asks += 1
      return entries.map((entry) => bayEntryOf(state, playerId, entry))
    },
  }
  return { source, asks: () => asks }
}

export function entryProbeSlice(sources: readonly BayEntrySource[]): SliceDefinition {
  return {
    id: ENTRY_PROBE_SLICE,
    register(r) {
      sources.forEach((source) => r.bayEntry(source))
    },
  }
}

function bayEntryOf(state: AuthorityState, playerId: string, probe: ProbeEntry): BayEntry {
  const buy = commandButton(
    state,
    playerId,
    UI_ID_TEMPLATES.upgradebayEntryBuy(probe.entryId),
    'Buy',
    buyCasingGradeCommand(CLICK_CHAIN),
  )
  const cost = amountReading(PROBE_PRICE)
  const item = probe.item ?? { kind: 'module', id: probe.entryId }
  return {
    entryId: probe.entryId,
    iconId: 'icon-casing',
    label: probe.entryId,
    levelText: probe.isMastered === true ? '12' : '1 → 2',
    cost,
    effectText: null,
    buy: probe.isMastered === true ? null : buy,
    card: itemCardOf(state, playerId, {
      item,
      iconId: 'icon-casing',
      name: probe.entryId,
      cost,
      level: 1,
      buy,
      source: SHOP_SOURCE,
    }),
  }
}
