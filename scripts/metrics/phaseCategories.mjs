// The fixed phase categories a ticket's time is split into (#134, schema v1). Adding or renaming a
// category bumps TICKET_PHASES_SCHEMA: the committed files and the status page read these ids.
// `colour` is the one fixed colour each category has on the status page.

export const TICKET_PHASES_SCHEMA = 1

export const PHASE_CATEGORIES = [
  { id: 'blocked', name: 'Blocked', colour: '#e0675a' },
  { id: 'planner_wait', name: 'Waiting on planners', colour: '#a98bd6' },
  { id: 'idle', name: 'Idle', colour: '#8c959f' },
  { id: 'context', name: 'Context gathering', colour: '#6aa9d8' },
  { id: 'planning', name: 'Planning', colour: '#4fb3a6' },
  { id: 'developing', name: 'Developing', colour: '#d4ab3c' },
  { id: 'testing', name: 'Testing', colour: '#6fbf73' },
  { id: 'gates', name: 'Gates', colour: '#e8833a' },
  { id: 'landing', name: 'Landing', colour: '#d978a8' },
  { id: 'other', name: 'Other', colour: '#c4c9d0' },
]

export const CATEGORY_IDS = PHASE_CATEGORIES.map((category) => category.id)

/** The categories time inside a Claude Code session can fall in (the transcript's share). */
export const SESSION_CATEGORY_IDS = ['context', 'planning', 'developing', 'testing', 'other']

/** `{ <category>: 0 }` for every category, so a total or a legend never misses one. */
export function zeroTotals() {
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0]))
}
