/**
 * The gate's ledger line (ticket 238; #142 "HUD hint chip", in #159's ledger voice): what a
 * stopped cell needs and what the miner has, read off `gate_hit`'s `required` and `have` words
 * (`tip:<major>`, `size:<n>`, an extractor id or `<extractor>:<state>`, `none`; see canMine.ts).
 * The same line is the HUD chip and the refusal text. The numbers come only from those words, so
 * the templates stay inside #159's flavour rules; a gate kind this slice does not word has no line.
 */
import LEDGER_FILE from '../ledgerLines.json'
import type { Rig } from './gateRows'
import { iconIdOfRig, rigNamed } from './rigs'

/** What `DrillGated` (logged as `gate_hit`) says about a stopped cell. */
export interface GateHit {
  gateKind: string
  outcome: 'refused' | 'blocked' | 'lost'
  required: string
  have: string
}

export interface LedgerTemplates {
  drill: string
  dynamite: string
  dynamiteNoneCarried: string
  /** Without the extractor: skidded off, or the ore lost as its row says. */
  extractorMissing: { refused: string; vented: string; drifted: string }
  /** With it: what the cell still waits for, by the state `required` names. */
  extractorAtWork: Readonly<Record<string, string>>
}

export const LEDGER_TEMPLATES: LedgerTemplates = LEDGER_FILE

/** The kernel's drill-tip and charge icons (#158); an extractor wears its own. */
const DRILL_ICON_ID = 'icon-track-drill-tip'
const DYNAMITE_ICON_ID = 'icon-blasting-charges'

const NONE_CARRIED = '0'
const SLOT = /\{(\w+)\}/g

type LineOfHit = (hit: GateHit, templates: LedgerTemplates) => string | null

const LINE_OF_GATE_KIND: Readonly<Record<string, LineOfHit>> = {
  drill: drillLineOf,
  dynamite: dynamiteLineOf,
  rig: extractorLineOf,
}

/** The ledger line for a stopped cell, or null when its gate kind or words are not this slice's. */
export function ledgerLineOf(hit: GateHit, templates = LEDGER_TEMPLATES): string | null {
  return LINE_OF_GATE_KIND[hit.gateKind]?.(hit, templates) ?? null
}

/** The chip's gate-kind icon: the drill tip, the charge, or the missing extractor's own. */
export function ledgerIconIdOf(hit: GateHit): string | null {
  if (hit.gateKind === 'drill') return DRILL_ICON_ID
  if (hit.gateKind === 'dynamite') return DYNAMITE_ICON_ID
  const rig = rigOfRequired(hit.required)
  return rig === null ? null : iconIdOfRig(rig)
}

/** Every template, for the #159 flavour check. */
export function ledgerTemplatesOf(templates = LEDGER_TEMPLATES): string[] {
  return [
    templates.drill,
    templates.dynamite,
    templates.dynamiteNoneCarried,
    ...Object.values(templates.extractorMissing),
    ...Object.values(templates.extractorAtWork),
  ]
}

/** The template with its `{slot}`s filled; a slot with no value stays as written. */
export function fillLedgerTemplate(
  template: string,
  slots: Readonly<Record<string, string>>,
): string {
  return template.replace(SLOT, (written, name: string) => slots[name] ?? written)
}

function drillLineOf(hit: GateHit, templates: LedgerTemplates): string | null {
  const need = countOf(hit.required, 'tip')
  const have = countOf(hit.have, 'tip')
  if (need === null || have === null) return null
  return fillLedgerTemplate(templates.drill, { need, have })
}

function dynamiteLineOf(hit: GateHit, templates: LedgerTemplates): string | null {
  const need = countOf(hit.required, 'size')
  const have = countOf(hit.have, 'size')
  if (need === null || have === null) return null
  const template = have === NONE_CARRIED ? templates.dynamiteNoneCarried : templates.dynamite
  return fillLedgerTemplate(template, { need, have })
}

function extractorLineOf(hit: GateHit, templates: LedgerTemplates): string | null {
  const rig = rigOfRequired(hit.required)
  if (rig === null) return null
  const template = extractorTemplateOf(rig, stateOfRequired(hit.required), hit, templates)
  return template === null ? null : fillLedgerTemplate(template, { extractor: rig.name })
}

function extractorTemplateOf(
  rig: Rig,
  waitsFor: string | null,
  hit: GateHit,
  templates: LedgerTemplates,
): string | null {
  if (waitsFor !== null) return templates.extractorAtWork[waitsFor] ?? null
  if (hit.outcome !== 'lost' || rig.lostAs === null) return templates.extractorMissing.refused
  return templates.extractorMissing[rig.lostAs]
}

/** `tip:34` → `34` for the word `tip`; null for any other shape. */
function countOf(word: string, name: string): string | null {
  const [wordName, count] = word.split(':')
  return wordName === name && /^\d+$/.test(count ?? '') ? count : null
}

function rigOfRequired(required: string): Rig | null {
  return rigNamed(required.split(':')[0])
}

/** `rig.resonance:tuned` → `tuned`; a bare extractor id waits for nothing but the extractor. */
function stateOfRequired(required: string): string | null {
  return required.split(':')[1] ?? null
}
