/** Reads the page URL once. Browser API, so it lives in the shell. */
import type { LaunchParameters } from './shell'

export function readLaunchParameters(): LaunchParameters {
  const params = new URLSearchParams(window.location.search)
  return {
    debugEnabled: import.meta.env.DEV || params.has('debug'),
    scenarioText: params.get('scenario'),
  }
}
