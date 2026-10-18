/**
 * How the game was launched (decision #11 section 6). Browser API, so it lives in the shell.
 *
 * - Dev server: the debug API is on (`import.meta.env.DEV`).
 * - Plain browser: `?debug`, `?scenario=`, `?title` and `?noflags` (ticket 548) on the URL, read once.
 * - Electron: the URL is ignored; the main process says whether `--debug-api` was given and hands
 *   over a `--scenario=<path>` file's text.
 *
 * The title menu (ticket 403) opens unless the launch asked for the debug API or a scenario; the
 * dev server opens on it too, as nobody asked there. `?title` brings it back on a debug launch.
 */
import type { ShellLaunch } from '../../electron/bridgeContract.cts'
import type { LaunchParameters } from './shell'

export function readBrowserLaunchParameters(): LaunchParameters {
  const params = new URLSearchParams(window.location.search)
  const scenarioText = params.get('scenario')
  return {
    debugEnabled: import.meta.env.DEV || params.has('debug'),
    scenarioText,
    isTitleMenuShown: isTitleLaunch({
      isDebugAsked: params.has('debug'),
      isTitleAsked: params.has('title'),
      scenarioText,
    }),
    isNoFlagsAsked: params.has('noflags'),
  }
}

export function readElectronLaunchParameters(launch: ShellLaunch): LaunchParameters {
  return {
    debugEnabled: import.meta.env.DEV || launch.debugEnabled,
    scenarioText: launch.scenarioText,
    isTitleMenuShown: isTitleLaunch({
      isDebugAsked: launch.debugEnabled,
      isTitleAsked: false,
      scenarioText: launch.scenarioText,
    }),
    isNoFlagsAsked: false,
  }
}

/** What the launch asked for: the debug API (not the dev build's own), `?title`, a scenario. */
interface TitleLaunchAsks {
  isDebugAsked: boolean
  isTitleAsked: boolean
  scenarioText: string | null
}

function isTitleLaunch({ isDebugAsked, isTitleAsked, scenarioText }: TitleLaunchAsks): boolean {
  if (scenarioText !== null) return false
  return isTitleAsked || !isDebugAsked
}
