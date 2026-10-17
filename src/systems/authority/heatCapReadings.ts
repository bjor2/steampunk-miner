/**
 * What the #113 heat rule can settle of the heat a report feeds it (ticket 535, A6: VS's amendment
 * 6232473040 as the TD 6232476720 and the GD 6232473802 confirmed it). `heatRules.ts`
 * `activeSegmentsOf` caps a report's drill ticks at the ticks elapsed since the gauge settled, so a
 * bore wider than one cell's path feeds more law heat than the gauge takes and the rest is dropped,
 * on the report path and swept alike. A6 leaves that rule as it is; the gap is #541's ("heat cap
 * against the law at the gauge"). Both lanes read, on every row, the ticks the rule can settle and
 * the share of the law heat it drops, and hold the gauge by VS's ratchet, never by the law: the
 * charged branch settles no less per unit of law work than main does at either cadence. Only the
 * lanes use this; it decides no play.
 */

/** A row's heat as the rule sees it: fed, settled and the law work it stands for. */
export interface HeatCapRead {
  lawWork: number
  /** The drill ticks the reports fed the rule. */
  heatTicks: number
  /** The drill ticks the rule could settle of them: each report's fed ticks capped at its elapsed ticks. */
  settleableHeatTicks: number
}

/** The drill ticks one report can settle: what it fed, capped at the ticks since the gauge settled. */
export function settleableHeatTicksOf(fedTicks: number, elapsedTicks: number): number {
  return Math.max(0, Math.min(fedTicks, elapsedTicks))
}

/** The share of the law's heat the rule drops on a row; negative where it settles above the law. */
export function droppedHeatShareOf(read: HeatCapRead, expectedHeatTicks: number): number {
  return expectedHeatTicks === 0 ? 0 : 1 - read.settleableHeatTicks / expectedHeatTicks
}

/** Settled drill ticks per unit of law work; 0 where nothing was removed. */
export function settledPerLawWorkOf(read: HeatCapRead): number {
  return read.lawWork === 0 ? 0 : read.settleableHeatTicks / read.lawWork
}

/**
 * VS's ratchet: the charged branch settles no less heat per unit of law work than `main` on the
 * same rig and ground, less one drill tick of quantization over the charged row's law work.
 */
export function isGaugeNoLowerThanMain(charged: HeatCapRead, main: HeatCapRead): boolean {
  if (charged.lawWork === 0 || main.lawWork === 0) return true
  const oneTickPerLawWork = 1 / charged.lawWork
  return settledPerLawWorkOf(charged) + oneTickPerLawWork >= settledPerLawWorkOf(main)
}

/** The ratio of the charged row's settled heat per unit of law work to main's; Infinity over a bare main. */
export function gaugeRatchetRatioOf(charged: HeatCapRead, main: HeatCapRead): number {
  const over = settledPerLawWorkOf(main)
  return over === 0 ? Infinity : settledPerLawWorkOf(charged) / over
}

/** One line of the heat-cap readings for a row, for the lanes' logs. */
export function heatCapTextOf(read: HeatCapRead, expectedHeatTicks: number): string {
  const thousandths = (value: number) => (Math.round(value * 1000) / 1000).toFixed(3)
  const dropped = droppedHeatShareOf(read, expectedHeatTicks)
  const share =
    dropped >= 0
      ? `drops ${thousandths(dropped)} of the law's heat`
      : `settles ${thousandths(-dropped)} above the law's heat`
  return (
    `fed ${read.heatTicks.toFixed(1)} drill ticks, the rule can settle ` +
    `${read.settleableHeatTicks.toFixed(1)} (${share}; #541 owns the cap)`
  )
}
