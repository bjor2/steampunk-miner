/**
 * Every `data-testid` the HUD, the two bay screens and settings overlay carry (#33 sections 5, 6
 * and 9, #37 `sellbay-*` and `upgradebay-*`), in one table: the view models name their buttons with it and the components take their ids
 * from it (re-exported as `UI_IDS` from `src/ui/ids.ts`), so a spec, the debug API and the DOM
 * always agree. Rows that repeat take their id from a template.
 */
import type { UpgradeId } from '../economy/economyDefinition'

export const UI_IDS = {
  hudEnergyGauge: 'hud-energy-gauge',
  hudEnergyText: 'hud-energy-text',
  hudHullGauge: 'hud-hull-gauge',
  hudHullText: 'hud-hull-text',
  hudCargoGauge: 'hud-cargo-gauge',
  hudCargoText: 'hud-cargo-text',
  hudCargoCore: 'hud-cargo-core',
  hudCargoFull: 'hud-cargo-full',
  hudCargoValue: 'hud-cargo-value',
  hudDepth: 'hud-depth',
  hudBand: 'hud-band',
  hudCasing: 'hud-casing',
  hudCompassDock: 'hud-compass-dock',
  hudCoreDistance: 'hud-core-distance',
  hudTileTime: 'hud-tile-time',
  hudState: 'hud-state',
  hudRescueCountdown: 'hud-rescue-countdown',
  hudDockPrompt: 'hud-dock-prompt',
  hudCachePrompt: 'hud-cache-prompt',
  hudDebugMark: 'hud-debug-mark',
  hudWarningEnergy: 'hud-warning-energy',
  hudHintPlaque: 'hud-hint-plaque',
  hudTransmission: 'hud-transmission',
  platformScreen: 'platform-screen',
  sellbayScreen: 'sellbay-screen',
  upgradebayScreen: 'upgradebay-screen',
  upgradebayPreview: 'upgradebay-preview',
  upgradebayCasing: 'upgradebay-casing',
  upgradebayCasingGrade: 'upgradebay-casing-grade',
  upgradebayCasingCost: 'upgradebay-casing-cost',
  upgradebayCasingBuy: 'upgradebay-casing-buy',
  upgradebayQuickService: 'upgradebay-quick-service',
  platformMoney: 'platform-money',
  platformPlanet: 'platform-planet',
  platformCoreBay: 'platform-core-bay',
  platformCoreBayGauge: 'platform-core-bay-gauge',
  platformState: 'platform-state',
  shopCargoTotal: 'shop-cargo-total',
  shopSellAll: 'shop-sell-all',
  shopSellAllValue: 'shop-sell-all-value',
  workshopHull: 'workshop-hull',
  workshopRepair: 'workshop-repair',
  workshopRepairCost: 'workshop-repair-cost',
  workshopVisualTier: 'workshop-visual-tier',
  chargingEnergy: 'charging-energy',
  chargingPrice: 'charging-price',
  chargingCost: 'charging-cost',
  chargingRecharge: 'charging-recharge',
  platformQuickService: 'platform-quick-service',
  platformQuickTotal: 'platform-quick-total',
  platformTravel: 'platform-travel',
  platformTravelFee: 'platform-travel-fee',
  platformTravelFragments: 'platform-travel-fragments',
  platformTravelConfirm: 'platform-travel-confirm',
  platformEndCard: 'platform-end-card',
  platformUndock: 'platform-undock',
  platformSettings: 'platform-settings',
  artefactChoice: 'artefact-choice',
  artefactLeave: 'artefact-leave',
  settingsPanel: 'settings-panel',
  settingsBindingProblems: 'settings-binding-problems',
  settingsResetBindings: 'settings-reset-bindings',
  settingsClose: 'settings-close',
} as const

export type UiId = (typeof UI_IDS)[keyof typeof UI_IDS]

/** Ids of repeated rows: one per threat, ore tier, upgrade track, setting and action. */
export const UI_ID_TEMPLATES = {
  hudThreat: (index: number) => `hud-threat-${index}`,
  shopRow: (tier: number) => `shop-row-${tier}`,
  shopSell: (tier: number) => `shop-sell-${tier}`,
  workshopUpgrade: (upgradeId: UpgradeId) => `workshop-upgrade-${upgradeId}`,
  workshopUpgradeLevel: (upgradeId: UpgradeId) => `workshop-upgrade-${upgradeId}-level`,
  workshopUpgradeCost: (upgradeId: UpgradeId) => `workshop-upgrade-${upgradeId}-cost`,
  workshopUpgradeEffectBefore: (upgradeId: UpgradeId) =>
    `workshop-upgrade-${upgradeId}-effect-before`,
  workshopUpgradeEffectAfter: (upgradeId: UpgradeId) =>
    `workshop-upgrade-${upgradeId}-effect-after`,
  workshopUpgradeBuy: (upgradeId: UpgradeId) => `workshop-upgrade-${upgradeId}-buy`,
  artefactCard: (optionId: string) => `artefact-card-${optionId}`,
  artefactChoose: (optionId: string) => `artefact-choose-${optionId}`,
  settingsToggle: (name: string) => `settings-toggle-${name}`,
  settingsRebind: (actionId: string) => `settings-rebind-${actionId}`,
} as const
