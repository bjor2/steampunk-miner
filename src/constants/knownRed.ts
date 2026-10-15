/** The one known-red marker in the repo (GD ruling on #396, 15 Oct). One gate, one finding, no registry. */
export interface KnownRedMarker {
  /** The balance finding ticket this red is filed under. */
  readonly finding: number
  readonly reason: string
}

/**
 * `campaignPacingGate`'s stalled seeds and sawtooth misses, filed under #417 (TD on #396, section
 * 2). Delete it in the commit that turns the gate green; `knownRedVerdict` fails it once #417 closes.
 */
export const CAMPAIGN_PACING_KNOWN_RED: KnownRedMarker | null = {
  finding: 417,
  reason:
    'the pacing bot stalls on planets 5 to 7, 2 to 8 drill levels under on-curve from planet 4, and misses the band 5 sawtooth (finding #417)',
}
