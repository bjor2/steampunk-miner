/**
 * The allowlist only shrinks (TD ruling on #424): a panel over budget needs an entry, and the
 * entry holds exactly what it measures. A rule with no allowance, a count that grew, a count that
 * fell but is still over (lower the entry) and a panel that measures clean (stale, delete it) each
 * fail. Pure.
 */
import {
  UI_BUDGET_RULES,
  type UiBudgetAllowance,
  type UiBudgetPanel,
  type UiBudgetRule,
} from '../../constants/uiBudgetAllowlist'
import type { UiBudgetMeasure } from './uiBudgetReading'

export function ratchetProblemsOf(
  measures: readonly UiBudgetMeasure[],
  allowlist: readonly UiBudgetAllowance[],
  panels: readonly UiBudgetPanel[],
): string[] {
  return [
    ...entryShapeProblemsOf(allowlist, panels),
    ...measures.flatMap((measure) => measureProblemsOf(measure, allowanceOf(measure, allowlist))),
  ]
}

function allowanceOf(
  measure: UiBudgetMeasure,
  allowlist: readonly UiBudgetAllowance[],
): UiBudgetAllowance | null {
  return allowlist.find((entry) => entry.panel === measure.panel) ?? null
}

function entryShapeProblemsOf(
  allowlist: readonly UiBudgetAllowance[],
  panels: readonly UiBudgetPanel[],
): string[] {
  const known = new Set(panels.map((panel) => panel.id))
  return allowlist.flatMap((entry, index) => [
    ...(known.has(entry.panel) ? [] : [`the allowlist names the unknown panel ${entry.panel}`]),
    ...(isFirstEntryOf(entry, index, allowlist)
      ? []
      : [`${entry.panel} has two allowlist entries`]),
  ])
}

function isFirstEntryOf(
  entry: UiBudgetAllowance,
  index: number,
  allowlist: readonly UiBudgetAllowance[],
): boolean {
  return allowlist.findIndex((other) => other.panel === entry.panel) === index
}

function measureProblemsOf(
  measure: UiBudgetMeasure,
  allowance: UiBudgetAllowance | null,
): string[] {
  if (allowance !== null && isClean(measure))
    return [`${measure.panel} measures within budget; delete its entry (#${allowance.ticket})`]
  return UI_BUDGET_RULES.flatMap((rule) => ruleProblemsOf(measure, rule, allowance))
}

function isClean(measure: UiBudgetMeasure): boolean {
  return UI_BUDGET_RULES.every((rule) => measure.counts[rule] === 0)
}

function ruleProblemsOf(
  measure: UiBudgetMeasure,
  rule: UiBudgetRule,
  allowance: UiBudgetAllowance | null,
): string[] {
  const measured = measure.counts[rule]
  const allowed = allowance?.counts[rule] ?? 0
  const where = `${measure.panel} ${rule}`
  if (measured === allowed) return []
  if (allowed === 0) return [`${where}: ${measured} over budget with no allowlist entry`]
  if (measured === 0) return [`${where}: measures clean; delete the rule from its entry`]
  if (measured > allowed) return [`${where}: grew from ${allowed} to ${measured}; it only shrinks`]
  return [`${where}: fell from ${allowed} to ${measured}; lower the entry to ${measured}`]
}
