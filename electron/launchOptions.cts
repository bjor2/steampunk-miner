/**
 * How a packaged build is launched (decision #11 section 6): the debug/scenario API is off unless
 * the main process is started with `--debug-api` (for example in Steam launch options for beta
 * testers) or `STEAMPUNK_DEBUG_API=1`. A scenario comes from `--scenario=<path>`, read here as
 * text and size-capped; the renderer's pure code validates it. Without the flag it is ignored,
 * and so are the renderer's `?debug` and `?scenario=`.
 */
import { readFileSync, statSync } from 'node:fs'
import type { ShellLaunch } from './bridgeContract.cjs'

const DEBUG_API_FLAG = '--debug-api'
const DEBUG_API_ENV = 'STEAMPUNK_DEBUG_API'
const SCENARIO_FLAG = '--scenario='
/** Scenario files are small JSON; anything larger is refused before it is read. */
const MAX_SCENARIO_BYTES = 256 * 1024

export function readShellLaunch(argv: readonly string[], env: NodeJS.ProcessEnv): ShellLaunch {
  const debugEnabled = argv.includes(DEBUG_API_FLAG) || env[DEBUG_API_ENV] === '1'
  return { debugEnabled, scenarioText: debugEnabled ? scenarioTextOf(argv) : null }
}

function scenarioTextOf(argv: readonly string[]): string | null {
  const path = argv.find((arg) => arg.startsWith(SCENARIO_FLAG))?.slice(SCENARIO_FLAG.length)
  if (path === undefined || path.length === 0) return null
  try {
    if (statSync(path).size > MAX_SCENARIO_BYTES) throw new Error('scenario file is too large')
    return readFileSync(path, 'utf8')
  } catch (error) {
    console.error(`--scenario refused: ${String(error)}`)
    return null
  }
}
