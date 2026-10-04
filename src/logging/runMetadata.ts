/** metadata.json of a run (design doc section 24). */
export interface RunMetadata {
  runId: string
  gameVersion: string
  buildCommit: string
  worldSeed: number
  difficulty: string
  multiplayer: boolean
  players: number
  /** ISO 8601, UTC. */
  startTime: string
  /** ISO 8601, UTC; null while the run is in progress. */
  endTime: string | null
  durationSeconds: number | null
}
