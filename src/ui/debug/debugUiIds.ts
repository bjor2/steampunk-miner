/**
 * `data-testid`s of the version label, the debug flag panel and its badge (ticket 549), the
 * panel's material pop switch (ticket 614) and the HUD coverage overlay (ticket 682). Apart from `UI_IDS`, which names what the player
 * screens' view models draw.
 */
export const DEBUG_UI_IDS = {
  versionLabel: 'version-label',
  devFlagBadge: 'dev-flag-badge',
  devFlagPanel: 'dev-flag-panel',
  devFlagRunMarked: 'dev-flag-run-marked',
  devFlagReset: 'dev-flag-reset',
  devFlagClose: 'dev-flag-close',
  materialPopSwitch: 'material-pop-switch',
  hudCoverage: 'hud-coverage',
  hudCoverageBand: 'hud-coverage-band',
  hudCoverageReadout: 'hud-coverage-readout',
} as const

export const DEBUG_UI_ID_TEMPLATES = {
  devFlagRow: (flagId: string) => `dev-flag-row-${flagId}`,
  devFlagSwitch: (flagId: string) => `dev-flag-switch-${flagId}`,
  devFlagDrop: (flagId: string) => `dev-flag-drop-${flagId}`,
  materialPopChoice: (mode: string) => `material-pop-choice-${mode}`,
} as const
