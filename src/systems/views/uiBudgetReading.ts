/**
 * The UI budget read panel by panel (TD ruling on #424): every registered element's breaches go to
 * the panel its id belongs to, every unregistered element to the panel whose fixture drew it, every
 * scroll declaration to the panel owning its file. What no entry may ever cover is a hard problem:
 * a tag rule, a scrolling file no panel owns and a panel with no fixture. Pure.
 */
import {
  UI_BUDGET_RULES,
  type UiBudgetPanel,
  type UiBudgetRule,
} from '../../constants/uiBudgetAllowlist'
import type { UiText } from './uiText'
import { uiTextBreachesOf, uiTextTagProblemsOf } from './uiTextBudget'
import type { ScrollFinding } from './uiScrollGuard'

/** What one panel's server-rendered fixture drew outside the shared element. */
export interface PanelFixtureDrawing {
  readonly panel: string
  readonly unregistered: readonly string[]
}

/** Everything the budget test gathered from the tree. */
export interface UiBudgetSources {
  readonly panels: readonly UiBudgetPanel[]
  readonly fixtures: readonly PanelFixtureDrawing[]
  /** What every fixture's elements registered, one per id. */
  readonly texts: readonly UiText[]
  readonly scrollFindings: readonly ScrollFinding[]
}

export interface PanelBreach {
  readonly panel: string
  readonly rule: UiBudgetRule
  readonly message: string
}

export interface UiBudgetMeasure {
  readonly panel: string
  readonly counts: Readonly<Record<UiBudgetRule, number>>
}

export interface UiBudgetReading {
  readonly breaches: readonly PanelBreach[]
  readonly measures: readonly UiBudgetMeasure[]
  readonly hardProblems: readonly string[]
}

export function readUiBudget(sources: UiBudgetSources): UiBudgetReading {
  const breaches = panelBreachesOf(sources)
  return {
    breaches,
    measures: sources.panels.map((panel) => measureOf(panel.id, breaches)),
    hardProblems: hardProblemsOf(sources),
  }
}

/** The panel owning `key` by its longest matching prefix; null when no panel claims it. */
export function panelOwning(
  key: string,
  panels: readonly UiBudgetPanel[],
  prefixesOf: (panel: UiBudgetPanel) => readonly string[],
): string | null {
  const claims = panels.flatMap((panel) =>
    prefixesOf(panel)
      .filter((prefix) => key.startsWith(prefix))
      .map((prefix) => ({ panel: panel.id, length: prefix.length })),
  )
  return claims.reduce<{ panel: string; length: number } | null>(longerClaim, null)?.panel ?? null
}

function longerClaim(
  best: { panel: string; length: number } | null,
  claim: { panel: string; length: number },
): { panel: string; length: number } {
  return best === null || claim.length > best.length ? claim : best
}

function panelBreachesOf(sources: UiBudgetSources): PanelBreach[] {
  return [
    ...sources.texts.flatMap((text) => registeredBreachesOf(text, sources.panels)),
    ...sources.fixtures.flatMap(unregisteredBreachesOf),
    ...sources.scrollFindings.flatMap((finding) => scrollBreachesOf(finding, sources.panels)),
  ]
}

function registeredBreachesOf(text: UiText, panels: readonly UiBudgetPanel[]): PanelBreach[] {
  const panel = panelOwning(text.id, panels, (owner) => owner.textIdPrefixes)
  if (panel === null) return []
  return uiTextBreachesOf(text).map((breach) => ({ panel, ...breach }))
}

function unregisteredBreachesOf(fixture: PanelFixtureDrawing): PanelBreach[] {
  return fixture.unregistered.map((element) => ({
    panel: fixture.panel,
    rule: 'unregistered',
    message: `text outside a registered element: ${element}`,
  }))
}

function scrollBreachesOf(finding: ScrollFinding, panels: readonly UiBudgetPanel[]): PanelBreach[] {
  const panel = panelOwning(finding.path, panels, (owner) => owner.sourcePrefixes)
  if (panel === null) return []
  const message = `a second scroll container at ${finding.path}:${finding.line}: ${finding.declaration}`
  return [{ panel, rule: 'scroll', message }]
}

function measureOf(panel: string, breaches: readonly PanelBreach[]): UiBudgetMeasure {
  const own = breaches.filter((breach) => breach.panel === panel)
  const counts = Object.fromEntries(
    UI_BUDGET_RULES.map((rule) => [rule, own.filter((breach) => breach.rule === rule).length]),
  ) as Record<UiBudgetRule, number>
  return { panel, counts }
}

function hardProblemsOf(sources: UiBudgetSources): string[] {
  return [
    ...sources.texts.flatMap(uiTextTagProblemsOf),
    ...sources.texts.flatMap((text) => unownedTextProblemsOf(text, sources.panels)),
    ...sources.scrollFindings.flatMap((finding) => unownedScrollProblemsOf(finding, sources)),
    ...unfixturedPanelProblemsOf(sources),
    ...strangerFixtureProblemsOf(sources),
  ]
}

function unownedTextProblemsOf(text: UiText, panels: readonly UiBudgetPanel[]): string[] {
  if (panelOwning(text.id, panels, (panel) => panel.textIdPrefixes) !== null) return []
  return [`${text.id}: no panel owns this element id`]
}

/** A scrolling file no panel owns can never be allowlisted (TD ruling on #424 Q1). */
function unownedScrollProblemsOf(finding: ScrollFinding, sources: UiBudgetSources): string[] {
  if (panelOwning(finding.path, sources.panels, (panel) => panel.sourcePrefixes) !== null) return []
  return [
    `${finding.path}:${finding.line}: a scroll container no panel owns: ${finding.declaration}`,
  ]
}

/** A panel with no fixture is never measured, so it fails instead of passing unseen. */
function unfixturedPanelProblemsOf(sources: UiBudgetSources): string[] {
  const fixtured = new Set(sources.fixtures.map((fixture) => fixture.panel))
  return sources.panels
    .filter((panel) => !fixtured.has(panel.id))
    .map((panel) => `the panel ${panel.id} has no fixture`)
}

function strangerFixtureProblemsOf(sources: UiBudgetSources): string[] {
  const known = new Set(sources.panels.map((panel) => panel.id))
  return sources.fixtures
    .filter((fixture) => !known.has(fixture.panel))
    .map((fixture) => `a fixture draws the unknown panel ${fixture.panel}`)
}
