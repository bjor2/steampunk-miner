/**
 * What the #113 heat rule can settle of the heat a report feeds it (ticket 535, A6: VS's amendment
 * 6232473040 and VS's ratchet correction 6234304278, as the TD 6234313012 and the GD 6234312287
 * confirmed them, option iii). `heatRules.ts` `activeSegmentsOf` caps a report's drill ticks at
 * the ticks elapsed since the gauge settled, so a bore wider than one cell's path feeds more law
 * heat than the gauge takes and the rest is dropped, on the report path and swept alike. A6
 * leaves that rule as it is; the gap is #541's ("heat cap against the law at the gauge"). Both
 * lanes read, on every row, the ticks the rule can settle and the share of the law heat it drops,
 * and print the gauge against the law and against main at both cadences. Neither is a gate: the
 * ratchet against main fails by construction where main @12 heats one tick per drilling tick,
 * above the law (reason 1), and where the law-exact feed arrives in bursts the cap clips (reason
 * 2, #541's loss), so each red row prints its reason and amber means below both main and the
 * law. The hard gate is the exact settle on the loop lane's heat planet: the gauge rises by what
 * the rule can settle of the fed ticks, within one drill tick. Only the lanes use this; it decides
 * no play.
 *
 * With the authority's `heat.workUncapped` on (ticket 541, shape (b)) the rule settles every tick
 * a report fed, so the charged paths read `uncappedSettleableHeatTicksOf` and drop nothing. The
 * lanes then gate VS's ratchet as restated on #535 (6234309451, option ii): the charged branch
 * settles no less per unit of law work than the lesser of main and the law, less one drill tick;
 * and the TD's cadence check (6232743242): the gauge per unit of law work at a report every tick
 * and every 12 ticks agrees within `CADENCE_SHARE`.
 */
import { LAW_WORK_PER_DRILL_TICK } from '../vehicle/cutCarry'

/** How far the gauge per unit of law work may differ between the two cadences (TD 6232743242). */
export const CADENCE_SHARE = 1 / 100

/** A row's heat as the rule sees it: fed, settled and the law work it stands for. */
export interface HeatCapRead {
  lawWork: number
  /** The drill ticks the reports fed the rule. */
  heatTicks: number
  /** The drill ticks the rule could settle of them: each report's fed ticks capped at its elapsed ticks. */
  settleableHeatTicks: number
}

/** Why a charged row settles less heat than main on the same ground; never a charge defect. */
export type GaugeRatchetReason =
  | 'reason 1: main heats one tick per drilling tick, above the law'
  | 'reason 2: the law-exact feed is bursty and the #113 cap clips it (#541)'

/** The charged row's settled heat against main's and the law's, printed on every row, never gated. */
export interface GaugeRatchet {
  /** Settled heat per unit of law work over main's; Infinity over a bare main. */
  ratioToMain: number
  /** Settled heat per unit of law work over the law's one drill tick per `LAW_WORK_PER_DRILL_TICK`. */
  ratioToLaw: number
  verdict: 'no lower than main' | 'below main, at the law' | 'amber: below main and the law'
  reasons: GaugeRatchetReason[]
}

/** The drill ticks one report can settle: what it fed, capped at the ticks since the gauge settled. */
export function settleableHeatTicksOf(fedTicks: number, elapsedTicks: number): number {
  return Math.max(0, Math.min(fedTicks, elapsedTicks))
}

/** The drill ticks one report settles with `heat.workUncapped` on (ticket 541): all it fed. */
export function uncappedSettleableHeatTicksOf(fedTicks: number): number {
  return Math.max(0, fedTicks)
}

/** The share of the law's heat the rule drops on a row; negative where it settles above the law. */
export function droppedHeatShareOf(read: HeatCapRead, expectedHeatTicks: number): number {
  return expectedHeatTicks === 0 ? 0 : 1 - read.settleableHeatTicks / expectedHeatTicks
}

/** Settled drill ticks per unit of law work; 0 where nothing was removed. */
export function settledPerLawWorkOf(read: HeatCapRead): number {
  return read.lawWork === 0 ? 0 : read.settleableHeatTicks / read.lawWork
}

/** The drill ticks the law heats a row's law work for. */
export function lawHeatTicksOf(read: HeatCapRead): number {
  return read.lawWork / LAW_WORK_PER_DRILL_TICK
}

/**
 * VS's ratchet as first written (6232473040): the charged branch settles no less heat per unit of
 * law work than `main` on the same rig and ground, less one drill tick of quantization over the
 * charged row's law work. Printed, never gated (VS 6234304278).
 */
export function isGaugeNoLowerThanMain(charged: HeatCapRead, main: HeatCapRead): boolean {
  if (charged.lawWork === 0 || main.lawWork === 0) return true
  const oneTickPerLawWork = 1 / charged.lawWork
  return settledPerLawWorkOf(charged) + oneTickPerLawWork >= settledPerLawWorkOf(main)
}

/**
 * VS's ratchet as restated on #535 (6234309451, option ii), gated once #541's heat change runs:
 * the charged branch settles no less per unit of law work than the lesser of `main`'s and the
 * law's one drill tick per `LAW_WORK_PER_DRILL_TICK`, less one drill tick over its law work.
 */
export function isGaugeAtLesserOfMainAndLaw(charged: HeatCapRead, main: HeatCapRead): boolean {
  if (charged.lawWork === 0) return true
  const law = lawHeatTicksOf(charged)
  const floor = main.lawWork === 0 ? law : Math.min(mainTicksOverLawWorkOf(main, charged), law)
  return charged.settleableHeatTicks + 1 >= floor
}

/** What `main` settles per unit of law work, over `charged`'s law work, in drill ticks. */
function mainTicksOverLawWorkOf(main: HeatCapRead, charged: HeatCapRead): number {
  return (main.settleableHeatTicks * charged.lawWork) / main.lawWork
}

/** Whether two cadences' gauge readings per unit of law work agree within `CADENCE_SHARE`. */
export function isCadenceInvariant(everyTick: number, everyTwelve: number): boolean {
  if (everyTwelve === 0) return everyTick === 0
  return Math.abs(everyTick / everyTwelve - 1) <= CADENCE_SHARE
}

/** Whether a row settles at least the law's heat, less one drill tick. */
export function isSettledAtLaw(read: HeatCapRead): boolean {
  return read.settleableHeatTicks + 1 >= lawHeatTicksOf(read)
}

/** The ratio of the charged row's settled heat per unit of law work to main's; Infinity over a bare main. */
export function gaugeRatchetRatioOf(charged: HeatCapRead, main: HeatCapRead): number {
  const over = settledPerLawWorkOf(main)
  return over === 0 ? Infinity : settledPerLawWorkOf(charged) / over
}

/** The ratio of a row's settled heat to the law's; 0 where nothing was removed. */
export function settledVsLawOf(read: HeatCapRead): number {
  const law = lawHeatTicksOf(read)
  return law === 0 ? 0 : read.settleableHeatTicks / law
}

/** The charged row against `main` and the law: the ratios, the verdict and each red row's reasons. */
export function gaugeRatchetOf(charged: HeatCapRead, main: HeatCapRead): GaugeRatchet {
  const isNoLower = isGaugeNoLowerThanMain(charged, main)
  return {
    ratioToMain: gaugeRatchetRatioOf(charged, main),
    ratioToLaw: settledVsLawOf(charged),
    verdict: verdictOf(isNoLower, isSettledAtLaw(charged)),
    reasons: isNoLower ? [] : reasonsOf(charged, main),
  }
}

function verdictOf(isNoLowerThanMain: boolean, isAtLaw: boolean): GaugeRatchet['verdict'] {
  if (isNoLowerThanMain) return 'no lower than main'
  return isAtLaw ? 'below main, at the law' : 'amber: below main and the law'
}

/** Reason 1 where main settles above the law; reason 2 where the cap dropped more than a tick of the charged feed. */
function reasonsOf(charged: HeatCapRead, main: HeatCapRead): GaugeRatchetReason[] {
  const reasons: GaugeRatchetReason[] = []
  if (main.settleableHeatTicks > lawHeatTicksOf(main) + 1) {
    reasons.push('reason 1: main heats one tick per drilling tick, above the law')
  }
  if (charged.heatTicks - charged.settleableHeatTicks > 1) {
    reasons.push('reason 2: the law-exact feed is bursty and the #113 cap clips it (#541)')
  }
  return reasons
}

/** One line of the heat-cap readings for a row, for the lanes' logs. */
export function heatCapTextOf(read: HeatCapRead, expectedHeatTicks: number): string {
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

/** One line of the ratchet against `mainPath`, printed on every row and never gated. */
export function gaugeRatchetTextOf(ratchet: GaugeRatchet, mainPath: string): string {
  const reasons = ratchet.reasons.length === 0 ? '' : `; ${ratchet.reasons.join('; ')}`
  return (
    `gauge settles ${thousandths(ratchet.ratioToLaw)} of the law, ` +
    `${thousandths(ratchet.ratioToMain)} of ${mainPath} (${ratchet.verdict}${reasons})`
  )
}

function thousandths(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3)
}
