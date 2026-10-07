/**
 * The bare catalogue id rule (#224, from the GD and TD locks on #200): a store item or tech node
 * keeps one id across the store, the tree and the descriptions (`slot.powerup_4`,
 * `tech.terrain.cradle_4`), so a slice may register its content under `<category>.<name>` instead
 * of its own prefix. The category is one of the #162 store categories or `tech` (the #165 lane
 * nodes). An id with no category, or any other one, is refused, so a bare id never equals a flat
 * snake_case stats.json row id (`remote_detonator`). Each bare id has one owning slice: a second
 * slice registering it is the content registry's duplicate refusal.
 */

/** The categories a bare catalogue id may start with, in #162 order. */
export const BARE_CATALOGUE_CATEGORIES = [
  'power',
  'consumable',
  'passive',
  'gear',
  'rig',
  'slot',
  'tech',
] as const

/** One or more snake_case words, dot-separated: `mineral_drain`, `combo.gen.41`. */
const CATALOGUE_NAME = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/

/** Why `id` cannot be a bare catalogue id; empty when it can. */
export function bareCatalogueIdProblems(id: string): string[] {
  const dot = id.indexOf('.')
  if (dot <= 0) return ['has no category']
  return [
    ...categoryProblems(id.slice(0, dot)),
    ...(CATALOGUE_NAME.test(id.slice(dot + 1))
      ? []
      : ['has no snake_case name after its category']),
  ]
}

function categoryProblems(category: string): string[] {
  if (isBareCatalogueCategory(category)) return []
  return [`has category "${category}", not one of ${BARE_CATALOGUE_CATEGORIES.join(', ')}`]
}

function isBareCatalogueCategory(category: string): boolean {
  return (BARE_CATALOGUE_CATEGORIES as readonly string[]).includes(category)
}
