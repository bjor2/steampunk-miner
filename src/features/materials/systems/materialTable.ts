/**
 * The materials table (ticket 444, #139 GD ruling 1): species as a look layer under the 12 ore
 * families, read once from `materials.json` and refused whole when broken, so a bad row fails at
 * load (and in its unit test) with every problem listed. An empty table loads, so the rows tickets
 * (P1-P2, then P3-P5) land one at a time. Family ids, ore ids and prices never change here: a
 * species only names its family, and its gate class is the family's (`materialGateClassOf`).
 */
import { oreFamilies } from '../../ores'
import { ORE_LOOKS } from '../../ore-visuals'
import { gateClassOf } from '../../planet-mix'
import materialsFile from '../materials.json'
import { materialCopyProblems, materialNameOf } from './materialCopyRules'
import {
  hueSlotProblems,
  sharedLookProblems,
  unknownHueSlotProblems,
  type HueBand,
} from './materialLookRules'
import { materialRowShapeProblems, type MaterialRarity } from './materialRowShape'
import { brightestHostRockLuma } from './render/hostRockLuma'

export interface HueSlot {
  id: string
  /** Degrees, outside the reserved bands. */
  hue: number
  saturation: number
  /** Rec. 601 display luma, above the brightest host rock. */
  luma: number
}

export interface Material {
  id: string
  /** The species set the row belongs to (`legacy` for P1 and P2); a data tag only. */
  pool: string
  /** The kind slot id the species binds to within its pool (`legacy.c1`), never renumbered. */
  slot: string
  /** One of the 12 ore family ids; the species' gate class and price are the family's. */
  family: string
  epithet: string
  /** `<epithet> <family name>`, at most four words. */
  name: string
  silhouette: string
  pattern: string
  hueSlot: string
  /** The species' depth window: first and last band, 1..5. */
  gradeBand: readonly [number, number]
  rarity: MaterialRarity
  /** Drawn from the act's hero sprite atlas instead of the procedural look. */
  hero: boolean
  flavour: string
}

export interface MaterialTable {
  /** Sorted by id. */
  hueSlots: readonly HueSlot[]
  /** Sorted by id. */
  materials: readonly Material[]
}

/** What the guards measure a table against: the catalogue's families and the #151 look rules. */
export interface MaterialGuardContext {
  familyNameById: Readonly<Record<string, string>>
  reservedHueBands: readonly HueBand[]
  hostRockLuma: number
}

type Raw = Record<string, unknown>

/** The kernel's families and palettes and the ore-visuals hue bands, as the game loads them. */
export function materialGuardContext(): MaterialGuardContext {
  return {
    familyNameById: Object.fromEntries(oreFamilies().map((family) => [family.id, family.name])),
    reservedHueBands: ORE_LOOKS.reservedHueBands,
    hostRockLuma: brightestHostRockLuma(),
  }
}

export const MATERIALS: MaterialTable = loadMaterialTable(materialsFile, materialGuardContext())

/** Why a table is not a materials table; empty when it may ship. */
export function materialTableProblems(raw: unknown, context: MaterialGuardContext): string[] {
  const file = (raw ?? {}) as Raw
  if (!Array.isArray(file.materials) || !Array.isArray(file.hueSlots)) {
    return ['materials and hueSlots must be lists']
  }
  const rows = file.materials as Raw[]
  const slots = file.hueSlots as Raw[]
  return [
    ...slotsProblems(slots, context),
    ...rows.flatMap((row, at) => rowProblems(row, at, context)),
    ...duplicateIdProblems(rows, 'materials'),
    ...sharedSlotProblems(rows),
    ...unknownHueSlotProblems(rows, slots),
    ...sharedLookProblems(rows),
  ]
}

export function loadMaterialTable(raw: unknown, context: MaterialGuardContext): MaterialTable {
  const problems = materialTableProblems(raw, context)
  if (problems.length > 0) throw new Error(`materials.json is refused:\n${problems.join('\n')}`)
  return tableOf(raw as Raw, context)
}

/** The gate class of a species is its family's (#142): rarity never changes it (#139). */
export function materialGateClassOf(material: Pick<Material, 'family'>): string {
  return gateClassOf(material.family)
}

function slotsProblems(slots: readonly Raw[], context: MaterialGuardContext): string[] {
  return [
    ...slots.flatMap((slot, at) =>
      hueSlotProblems(slot, at, context.reservedHueBands, context.hostRockLuma),
    ),
    ...duplicateIdProblems(slots, 'hueSlots'),
  ]
}

function rowProblems(row: Raw, at: number, context: MaterialGuardContext): string[] {
  const shape = materialRowShapeProblems(row, `materials[${at}]`)
  if (shape.length > 0) return shape
  const familyName = context.familyNameById[row.family as string]
  if (familyName === undefined) {
    return [`${String(row.id)} names the unknown family ${String(row.family)}`]
  }
  return materialCopyProblems(
    row.id as string,
    row.epithet as string,
    familyName,
    row.flavour as string,
  )
}

function duplicateIdProblems(entries: readonly Raw[], list: string): string[] {
  const ids = entries.map((entry) => entry.id)
  return ids
    .filter((id, at) => ids.indexOf(id) !== at)
    .map((id) => `${list} share the id ${String(id)}; each needs its own`)
}

/** A kind slot holds one species, so the roster's `(pool, slot)` lookup is never ambiguous. */
function sharedSlotProblems(rows: readonly Raw[]): string[] {
  const keys = rows.map(slotKeyOf)
  return rows
    .filter((_, at) => keys.indexOf(keys[at]) !== at)
    .map(
      (row) =>
        `${String(row.id)} binds the kind slot ${String(row.slot)} that ${String(rows[keys.indexOf(slotKeyOf(row))].id)} already holds`,
    )
}

function slotKeyOf(row: Raw): string {
  return `${String(row.pool)}|${String(row.slot)}`
}

function tableOf(file: Raw, context: MaterialGuardContext): MaterialTable {
  return {
    hueSlots: (file.hueSlots as HueSlot[]).map((slot) => ({ ...slot })).sort(byId),
    materials: (file.materials as Raw[]).map((row) => materialOf(row, context)).sort(byId),
  }
}

function materialOf(row: Raw, context: MaterialGuardContext): Material {
  const material = row as unknown as Omit<Material, 'name'>
  const [first, last] = material.gradeBand
  return {
    ...material,
    name: materialNameOf(material.epithet, context.familyNameById[material.family]),
    gradeBand: [first, last],
  }
}

/** Code-unit order, as the kernel registries sort, so every machine lists the same species. */
function byId(a: { id: string }, b: { id: string }): number {
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}
