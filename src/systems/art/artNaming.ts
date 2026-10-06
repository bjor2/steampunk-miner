/**
 * The #52 naming rule for art ids: kebab-case, derived from a registry id by replacing `_` with
 * `-` (and a camelCase setting name by its words), so art can never drift from the code. Shared
 * by the asset ids, the icon set and the manifest lint.
 */
const KEBAB_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function kebabOf(registryId: string): string {
  return registryId.replaceAll('_', '-')
}

/** `cameraMode` is `camera-mode`: a camelCase name's words, for the settings' icons. */
export function kebabOfCamel(name: string): string {
  return kebabOf(name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
}

export function isKebabId(id: string): boolean {
  return KEBAB_ID.test(id)
}
