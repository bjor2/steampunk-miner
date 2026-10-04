/**
 * IPC channel names shared by the main process and the preload. The sandboxed preload cannot
 * require local files, so it repeats these literals and checks them against this object with
 * `satisfies typeof SHELL_CHANNELS` (a type error if they ever drift).
 */
export const SHELL_CHANNELS = {
  getAppInfo: 'shell:getAppInfo',
  appendRunEvents: 'shell:appendRunEvents',
  appendRunCommands: 'shell:appendRunCommands',
  writeRunDocument: 'shell:writeRunDocument',
} as const
