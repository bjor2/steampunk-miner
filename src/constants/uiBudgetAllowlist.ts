/**
 * The UI budget's panels and its allowlist (spec #422, TD ruling on #424). Each panel owns its
 * source files and the ids its elements register; the budget test renders each one from the start
 * scenario and counts every breach under its rule. An entry lets a panel stay over budget, by the
 * exact counts measured, until the pass named by `ticket` deletes it. The allowlist only shrinks:
 * a count that grows, an entry that measures clean and a lowered count still over the budget each
 * fail the test. `UI_BUDGET_REPORT=1 npx vitest run src/ui/uiBudget.test.ts` prints the counts.
 */

/** The budget rules an entry may cover; the tag rules never can (TD ruling on #424 Q2). */
export const UI_BUDGET_RULES = ['title', 'oneLine', 'tooltip', 'unregistered', 'scroll'] as const
export type UiBudgetRule = (typeof UI_BUDGET_RULES)[number]

export type UiBudgetCounts = Readonly<Partial<Record<UiBudgetRule, number>>>

export interface UiBudgetPanel {
  readonly id: string
  /** Repo path prefixes of the files it draws and styles; the longest match owns a file. */
  readonly sourcePrefixes: readonly string[]
  /** Prefixes of the element ids it registers; the longest match owns an id. */
  readonly textIdPrefixes: readonly string[]
}

export interface UiBudgetAllowance {
  readonly panel: string
  /** Each rule's count as measured, never more. */
  readonly counts: UiBudgetCounts
  /** The pass that trims the panel and deletes this entry. */
  readonly ticket: number
}

/** The five panels of the #422 passes (TD ruling on #424 Q3); `other-panels` owns the rest. */
export const UI_BUDGET_PANELS: readonly UiBudgetPanel[] = [
  {
    id: 'upgrade-bay',
    sourcePrefixes: [
      'src/features/workshop/ui/',
      'src/ui/platform/UpgradeBayView',
      'src/ui/platform/TracksPanel',
      'src/ui/platform/VehiclePreviewPanel',
    ],
    textIdPrefixes: ['upgrade-bay.', 'workshop.'],
  },
  {
    id: 'tech-tree',
    sourcePrefixes: ['src/features/tech-tree/ui/'],
    textIdPrefixes: ['tech-tree.'],
  },
  { id: 'dock', sourcePrefixes: ['src/ui/platform/'], textIdPrefixes: ['dock.'] },
  { id: 'hud', sourcePrefixes: ['src/ui/hud/'], textIdPrefixes: ['hud.'] },
  { id: 'other-panels', sourcePrefixes: ['src/ui/', 'src/features/'], textIdPrefixes: [''] },
]

/**
 * Measured on the start scenario when #424 landed (`UI_BUDGET_REPORT=1`); each pass lowers or
 * deletes its own entry, and #429 empties the list. Pass #425 moved the Upgrade bay and the shared
 * bay header and footer onto the element (so the dock's count fell with it) and deleted its entry;
 * pass #426 did the same for the tech tree.
 */
export const UI_BUDGET_ALLOWLIST: readonly UiBudgetAllowance[] = [
  { panel: 'dock', counts: { unregistered: 25, scroll: 3 }, ticket: 427 },
  { panel: 'hud', counts: { unregistered: 23 }, ticket: 428 },
  { panel: 'other-panels', counts: { unregistered: 154, scroll: 3 }, ticket: 429 },
]
