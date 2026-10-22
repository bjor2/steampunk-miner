/**
 * A known-red marker's shape (GD ruling on #396, 15 Oct). The repo exports none since ticket 645 took
 * `campaignPacingGate` off #417's marker; lanes and specs keep local ones with a ruling.
 */
export interface KnownRedMarker {
  /** The balance finding ticket this red is filed under. */
  readonly finding: number
  readonly reason: string
}
