/** Read-only, so no command and no log line (docs/standards/feature-slices.md 3.14). */
import type { DebugAction } from '../../debug/debugActionRegistry'
import { describeExample } from './systems/describeExample'

export const exampleDebugActions: Readonly<Record<string, DebugAction>> = {
  describe: () => ({ ok: true, ...describeExample() }),
}
