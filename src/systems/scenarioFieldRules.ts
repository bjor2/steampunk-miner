/**
 * The field rules scenario files are checked with (#11 section 4, refuse never trim): each rule
 * answers every problem with a value at a path, so a whole file is validated before anything is
 * applied. Unknown fields are problems; ids are checked against the registry their decision owns.
 */
export type FieldRule = (value: unknown, path: string) => string[]

export type FieldRules = Readonly<Record<string, FieldRule>>

export function fieldProblems(
  value: Record<string, unknown>,
  rules: FieldRules,
  path: string,
  required: readonly string[] = [],
): string[] {
  return [
    ...Object.keys(value)
      .filter((name) => !Object.hasOwn(rules, name))
      .map((name) => `${path}.${name} is not a scenario field`),
    ...required
      .filter((name) => value[name] === undefined)
      .map((name) => `${path}.${name} is required`),
    ...Object.entries(rules)
      .filter(([name]) => value[name] !== undefined)
      .flatMap(([name, rule]) => rule(value[name], `${path}.${name}`)),
  ]
}

export function objectRule(
  value: unknown,
  path: string,
  rules: FieldRules,
  required: readonly string[] = [],
): string[] {
  if (!isObject(value)) return [`${path} must be an object`]
  return fieldProblems(value, rules, path, required)
}

export function listRule(value: unknown, path: string, itemRule: FieldRule): string[] {
  if (!Array.isArray(value)) return [`${path} must be a list`]
  return value.flatMap((item, index) => itemRule(item, `${path}[${index}]`))
}

export function wholeNumberRule(value: unknown, path: string): string[] {
  return rangeRule(value, path, 0, Number.MAX_SAFE_INTEGER)
}

export function safeIntegerRule(value: unknown, path: string): string[] {
  return Number.isSafeInteger(value) ? [] : [`${path} must be a safe integer, got ${quote(value)}`]
}

export function rangeRule(value: unknown, path: string, min: number, max: number): string[] {
  if (Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max) return []
  return [`${path} must be a whole number from ${min} to ${max}, got ${quote(value)}`]
}

export function flagRule(value: unknown, path: string): string[] {
  return typeof value === 'boolean' ? [] : [`${path} must be true or false, got ${quote(value)}`]
}

/** A rule for one id out of a registry, naming the registry in its problem. */
export function registeredIdRule(registry: readonly string[], what: string): FieldRule {
  return (value, path) =>
    registry.includes(value as string)
      ? []
      : [`${path} ${quote(value)} is not a registered ${what} (${registry.join(', ')})`]
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function quote(value: unknown): string {
  return JSON.stringify(value) ?? 'nothing'
}
