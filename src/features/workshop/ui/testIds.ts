/** The showcase's own `data-testid`s, for the browser specs (rulebook section 5: state, never pixels). */
export const WORKSHOP_TEST_IDS = {
  showcase: 'workshop-showcase',
  plaqueLine: (upgradeId: string) => `workshop-plaque-${upgradeId}-line`,
  plaquePips: (upgradeId: string) => `workshop-plaque-${upgradeId}-pips`,
} as const
