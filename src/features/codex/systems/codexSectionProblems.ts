/**
 * What a saved `codex` section body must be to restore (feature-slices.md 3.13: refused, never
 * trimmed): known kinds only, each in its codec's one canonical form, mined inside contacted, and
 * ore bytes the current index can read, moved through the alias table when a provider replaced the
 * kernel index that wrote them (#207).
 */
import { isJsonObject } from '../../../systems/authority/payloadFields'
import { discoveryKinds } from '../../../systems/registries/discovery'
import { oreIndexTag } from '../../../systems/registries/oreTypes'
import { bytesOfBase64 } from './base64Bytes'
import { endsInEmptyByte, isSubsetOf } from './bitset'
import { isReadableIndexTag, oreBitsOnCurrentIndex } from './oreBits'

const ORE_FIELDS = ['codec', 'contacted', 'mined']
const ID_FIELDS = ['contacted', 'mined']

export function codexSectionProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['codex must be an object']
  return Object.entries(body).flatMap(([kind, entry]) => kindProblems(kind, entry))
}

function kindProblems(kind: string, entry: unknown): string[] {
  const codec = discoveryKinds().find((registration) => registration.id === kind)?.codec
  if (codec === undefined) return [`codex.${kind} is not a discovery kind`]
  if (kind === 'ore') return oreProblems(entry)
  if (codec === 'bitset') return [`codex.${kind} is a bitset kind with no bit index`]
  return idsProblems(kind, entry)
}

function oreProblems(entry: unknown): string[] {
  if (!isJsonObject(entry)) return ['codex.ore must be an object']
  const fieldProblems = [
    ...unknownFieldProblems('ore', entry, ORE_FIELDS),
    ...codecProblems(entry.codec),
    ...bitsetTextProblems('contacted', entry.contacted),
    ...bitsetTextProblems('mined', entry.mined),
  ]
  if (fieldProblems.length > 0) return fieldProblems
  return oreBitProblems(entry.codec as string, entry.contacted as string, entry.mined as string)
}

function codecProblems(codec: unknown): string[] {
  if (typeof codec !== 'string') return ['codex.ore.codec must be a string']
  if (isReadableIndexTag(codec)) return []
  return [`codex.ore.codec "${codec}" is an ore index this build cannot read (${oreIndexTag()})`]
}

function bitsetTextProblems(field: string, text: unknown): string[] {
  if (typeof text !== 'string') return [`codex.ore.${field} must be a base64 string`]
  const bytes = bytesOfBase64(text)
  if (bytes === null) return [`codex.ore.${field} must be canonical padded base64`]
  return endsInEmptyByte(bytes) ? [`codex.ore.${field} must not end in an empty byte`] : []
}

function oreBitProblems(codec: string, contactedText: string, minedText: string): string[] {
  const contacted = bytesOfBase64(contactedText) as Uint8Array
  const mined = bytesOfBase64(minedText) as Uint8Array
  return [
    ...(contacted.length === 0 ? ['codex.ore must be left out while nothing is contacted'] : []),
    ...(isSubsetOf(mined, contacted) ? [] : ['codex.ore.mined must lie inside contacted']),
    ...unplacedBitProblems(codec, contacted),
  ]
}

/** Every contacted bit (mined lies inside it) must name an ore of the current index. */
function unplacedBitProblems(codec: string, contacted: Uint8Array): string[] {
  const { unplaced } = oreBitsOnCurrentIndex(contacted, codec)
  if (unplaced.length === 0) return []
  return [`codex.ore bits ${unplaced.join(', ')} under ${codec} name no ore of ${oreIndexTag()}`]
}

function idsProblems(kind: string, entry: unknown): string[] {
  if (!isJsonObject(entry)) return [`codex.${kind} must be an object`]
  return [
    ...unknownFieldProblems(kind, entry, ID_FIELDS),
    ...idListProblems(`codex.${kind}.contacted`, entry.contacted),
    ...(entry.mined === undefined ? [] : idListProblems(`codex.${kind}.mined`, entry.mined)),
    ...minedOutsideProblems(kind, entry.contacted, entry.mined),
  ]
}

/** A non-empty list of strings in strict code-unit order: sorted and deduped. */
function idListProblems(path: string, ids: unknown): string[] {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return [`${path} must be a list of strings`]
  }
  if (ids.length === 0) return [`${path} must be left out while empty`]
  return ids.every((id, at) => at === 0 || ids[at - 1] < id)
    ? []
    : [`${path} must be sorted and deduped`]
}

function minedOutsideProblems(kind: string, contacted: unknown, mined: unknown): string[] {
  if (!Array.isArray(contacted) || !Array.isArray(mined)) return []
  return mined.every((id) => contacted.includes(id))
    ? []
    : [`codex.${kind}.mined must lie inside contacted`]
}

function unknownFieldProblems(
  kind: string,
  entry: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): string[] {
  return Object.keys(entry)
    .filter((field) => !fields.includes(field))
    .map((field) => `codex.${kind}.${field} is not a codex field`)
}
