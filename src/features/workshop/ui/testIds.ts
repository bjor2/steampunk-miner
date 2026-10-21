/** The showcase's own `data-testid`s, for the browser specs (rulebook section 5: state, never pixels). */
export const WORKSHOP_TEST_IDS = {
  showcase: 'workshop-showcase',
  /** The plaques' one sideways row on a phone held upright (#470 PT-5). */
  carousel: 'workshop-plaque-carousel',
  plaqueLine: (upgradeId: string) => `workshop-plaque-${upgradeId}-line`,
  plaquePips: (upgradeId: string) => `workshop-plaque-${upgradeId}-pips`,
  /** The muted note under a plaque: a worth-zero engine, a hold past the largest band (553). */
  plaqueNote: (upgradeId: string) => `workshop-plaque-${upgradeId}-note`,
  /** The owned rig look step on the plaque, `Fitting: …` (ticket 585). */
  plaqueFitting: (upgradeId: string) => `workshop-plaque-${upgradeId}-fitting`,
  /** The held Buy once the plaque is drawn as a card, which carries the #33 buy id (#164). */
  plaqueBuy: (upgradeId: string) => `workshop-plaque-${upgradeId}-buy`,
} as const
