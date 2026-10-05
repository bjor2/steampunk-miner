/**
 * How the game was launched (decision #11 section 6). Browser API, so it lives in the shell.
 *
 * - Dev server: the debug API is on (`import.meta.env.DEV`).
 * - Plain browser: `?debug` and `?scenario=` on the URL, read once.
 * - Electron: the URL is ignored; the main process says whether `--debug-api` was given and hands
 *   over a `--scenario=<path>` file's text.
 */
import type { ShellLaunch } from '../../electron/bridgeContract.cts'
import type { LaunchParameters } from './shell'

export function readBrowserLaunchParameters(): LaunchParameters {
  const params = new URLSearchParams(window.location.search)
  return {
    debugEnabled: import.meta.env.DEV || params.has('debug'),
    scenarioText: params.get('scenario'),
  }
}

export function readElectronLaunchParameters(launch: ShellLaunch): LaunchParameters {
  return {
    debugEnabled: import.meta.env.DEV || launch.debugEnabled,
    scenarioText: launch.scenarioText,
  }
}
