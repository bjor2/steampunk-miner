/**
 * A Node module hook both Playwright configs register (ticket 903). Playwright's ESM loader
 * transforms `.ts` but hands `.json` to Node, which refuses a JSON module imported without
 * `with { type: 'json' }`. The game's sources import JSON the Vite way, bare, so a spec reaching
 * one (`economy.json` through `jumpFuel.ts`, a save fixture) failed at load. This adds the
 * attribute for `.json` files only; Vite, Vitest and the game's sources stay as they are.
 */
export async function load(url, context, nextLoad) {
  if (!isJsonFile(url)) return nextLoad(url, context)
  return nextLoad(url, withJsonAttribute(context))
}

function isJsonFile(url) {
  return url.startsWith('file:') && url.endsWith('.json')
}

function withJsonAttribute(context) {
  return { ...context, importAttributes: { ...context.importAttributes, type: 'json' } }
}
