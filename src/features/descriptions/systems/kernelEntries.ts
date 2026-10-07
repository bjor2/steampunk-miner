/**
 * The side table for every kernel buyable (#164): `listBuyableRefs` names them (K7 #199) and this
 * slice files one entry for each, so the coverage spec walks one list.
 */
import { artefactEntries } from './artefactEntries'
import type { DescribedEntry } from './kernelEntry'
import { moduleEntries } from './moduleEntries'
import { bayEntries, serviceEntries } from './serviceEntries'
import { trackEntries } from './trackEntries'

export function kernelEntries(): readonly DescribedEntry[] {
  return [
    ...trackEntries(),
    ...moduleEntries(),
    ...serviceEntries(),
    ...bayEntries(),
    ...artefactEntries(),
  ]
}
