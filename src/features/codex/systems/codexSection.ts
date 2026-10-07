/**
 * The codex's per-player save section v1 (#178 TD with both scalers, #207):
 *
 *   { ore: { codec, contacted: b64, mined: b64 }, [kind]: { contacted: string[], mined?: string[] } }
 *
 * `contacted` is touched (locked or not) or mined, `mined` is at least one unit collected (#172
 * section 3, GD rulings); mined implies contacted. `ore` is a bitset kind: the bytes are indexed by
 * the ore-type provider and `codec` names that index (its `indexTag`). Every other kind is an
 * `ids` kind: sorted, deduped id lists, `mined` left out while empty. An empty kind is left out.
 *
 * The state holds the section in its portable form, so the digest hashes the raw base64 bytes and
 * the sorted ids, and a snapshot round-trips it unchanged (the restore checks the digest).
 */
import type { SaveSection } from '../../../systems/registries/saveSections'
import { codexSectionProblems } from './codexSectionProblems'

export interface OreDiscoveries {
  /** The `indexTag` of the bit index that wrote the bytes. */
  codec: string
  contacted: string
  mined: string
}

export interface IdDiscoveries {
  contacted: readonly string[]
  mined?: readonly string[]
}

/** By discovery kind; `ore` holds `OreDiscoveries`, every other kind `IdDiscoveries`. */
export type CodexSection = Readonly<Record<string, OreDiscoveries | IdDiscoveries>>

export const CODEX_SECTION_ID = 'codex'

const NOTHING_DISCOVERED: CodexSection = Object.freeze({})

export const CODEX_SECTION: SaveSection<CodexSection> = {
  id: CODEX_SECTION_ID,
  version: 1,
  scope: 'player',
  initial: NOTHING_DISCOVERED,
  problems: codexSectionProblems,
  toPortable: copyOfCodex,
  ofPortable: (body) => copyOfCodex(body as CodexSection),
}

/** The ore part; nothing discovered when the section has none. */
export function oreDiscoveriesOf(section: CodexSection, currentTag: string): OreDiscoveries {
  return (
    (section.ore as OreDiscoveries | undefined) ?? { codec: currentTag, contacted: '', mined: '' }
  )
}

/** The section with its ore part set; left out when nothing is contacted. */
export function withOreDiscoveries(section: CodexSection, ore: OreDiscoveries): CodexSection {
  const { ore: _replaced, ...others } = section
  return ore.contacted === '' ? others : { ...others, ore }
}

/** A plain copy, so no caller's object or list is shared with the state. */
function copyOfCodex(section: CodexSection): CodexSection {
  return Object.fromEntries(
    Object.entries(section).map(([kind, entry]) => [kind, copyOfEntry(entry)]),
  )
}

function copyOfEntry(entry: OreDiscoveries | IdDiscoveries): OreDiscoveries | IdDiscoveries {
  if (!Array.isArray(entry.contacted)) return { ...(entry as OreDiscoveries) }
  const { contacted, mined } = entry as IdDiscoveries
  return mined === undefined
    ? { contacted: [...contacted] }
    : { contacted: [...contacted], mined: [...mined] }
}
