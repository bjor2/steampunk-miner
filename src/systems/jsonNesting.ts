/**
 * The nesting limit for the recursive JSON walkers (#100, perf report section 4). Real authority
 * state nests 6 lists/objects deep and a session snapshot 7, while the walkers overflow node's
 * default stack from about 2,000 levels; 64 leaves room for the state to grow and refuses
 * hand-made deep input with a named error instead of a stack overflow.
 */
export const MAX_JSON_NESTING_DEPTH = 64

export class JsonNestingTooDeepError extends Error {
  constructor() {
    super(`JSON nests deeper than ${MAX_JSON_NESTING_DEPTH} levels`)
    this.name = 'JsonNestingTooDeepError'
  }
}

/** A list/object member still to visit, with how many lists/objects sit around it. */
interface PendingMember {
  value: unknown
  depth: number
}

/**
 * True when lists/objects in `value` sit more than `MAX_JSON_NESTING_DEPTH` inside each other
 * (`{"a":[1]}` is 2). Walks with its own stack, so it is safe at any depth.
 */
export function isNestedTooDeep(value: unknown): boolean {
  const pending: PendingMember[] = [{ value, depth: 0 }]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (!isContainer(next.value)) continue
    if (next.depth >= MAX_JSON_NESTING_DEPTH) return true
    pushMembers(pending, next.value, next.depth + 1)
  }
  return false
}

function isContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function pushMembers(pending: PendingMember[], container: object, depth: number): void {
  for (const member of Object.values(container)) pending.push({ value: member, depth })
}
