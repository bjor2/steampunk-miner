/**
 * The artefact options of the slice (decision #46): exactly three, mutually exclusive, picked once
 * from a cache. Their text and their declared gate clauses are data in
 * `src/data/artefacts/artefactOptions.json`; the rules that give each its effect name the ids
 * below. The table is refused whole at load if any option fails the uniqueness gate or the ids
 * differ from the ones the rules know, so a stat-bump option can never ship.
 */
import SHIPPED_OPTIONS from '../../data/artefacts/artefactOptions.json'
import { uniquenessGateProblems, type ArtefactEffect, type GateClause } from './uniquenessGate'

/** The ids the rules name (#46); no powerup id is an artefact (#47). */
export const ARTEFACT_ID = {
  oreWhisper: 'artefact.ore_whisper',
  breathingRoom: 'artefact.breathing_room',
  assayBeacon: 'artefact.assay_beacon',
} as const

export type ArtefactId = (typeof ARTEFACT_ID)[keyof typeof ARTEFACT_ID]

export const ARTEFACT_IDS: readonly ArtefactId[] = Object.values(ARTEFACT_ID)

export interface ArtefactOption {
  id: ArtefactId
  name: string
  /** One line for the choice card. */
  summary: string
  horizontal: true
  gateClauses: readonly GateClause[]
  effects: readonly ArtefactEffect[]
}

export const ARTEFACT_OPTIONS: readonly ArtefactOption[] = loadArtefactOptions(SHIPPED_OPTIONS)

/** Every problem with a raw options file; empty when it can ship. */
export function artefactTableProblems(raw: unknown): string[] {
  const options = isRecord(raw) && Array.isArray(raw.options) ? raw.options : null
  if (options === null) return ['the artefact table must hold an options list']
  return [
    ...options.flatMap(uniquenessGateProblems),
    ...options.flatMap(optionTextProblems),
    ...idSetProblems(options),
  ]
}

export function isArtefactId(value: unknown): value is ArtefactId {
  return (ARTEFACT_IDS as readonly unknown[]).includes(value)
}

export function artefactOptionOf(id: ArtefactId): ArtefactOption {
  return ARTEFACT_OPTIONS.find((option) => option.id === id) as ArtefactOption
}

function loadArtefactOptions(raw: unknown): ArtefactOption[] {
  const problems = artefactTableProblems(raw)
  if (problems.length > 0) {
    throw new Error(`artefactOptions.json is refused:\n${problems.join('\n')}`)
  }
  return (raw as { options: ArtefactOption[] }).options
}

function optionTextProblems(option: unknown): string[] {
  const fields = isRecord(option) ? option : {}
  const id = String(fields.id)
  return (['name', 'summary'] as const)
    .filter((field) => typeof fields[field] !== 'string' || fields[field] === '')
    .map((field) => `${id}: ${field} must be a non-empty string`)
}

/** The table lists each rule's id exactly once, and nothing else. */
function idSetProblems(options: readonly unknown[]): string[] {
  const ids = options.map((option) => (isRecord(option) ? option.id : undefined))
  const missing = ARTEFACT_IDS.filter((id) => !ids.includes(id))
  const unknown = ids.filter((id) => !isArtefactId(id))
  const isUnique = new Set(ids).size === ids.length
  return [
    ...missing.map((id) => `the table must list ${id}`),
    ...unknown.map((id) => `unknown artefact id ${JSON.stringify(id)}`),
    ...(isUnique ? [] : ['artefact ids must be unique']),
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
