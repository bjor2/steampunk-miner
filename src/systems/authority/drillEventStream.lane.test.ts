import { describe, expect, it } from 'vitest'
import {
  cutAtBothCadences,
  STREAM_GEARS,
  type StreamRun,
  type StreamTrack,
} from './drillEventStreamFixtures'

// The Horizontal Scaler's bar (b) on #514, "every cell cut at 12 is also cut at 1", for rigs whose
// cells take several ticks: the starting rig and `sweptCutPace.test.ts`'s (23 ticks a band-1
// cell). Red at a report every tick: a 12-tick report carves its 12 ticks of work at the one pose
// it reports, ahead of where the body was for most of them, so it clears a cell or two the moving
// stamp only part-cuts (on the 23-tick rig the cell at the track's end; on the starting rig at
// 3 m/s, past its own law speed, side cells the moving stamp leaves part-cut). That is the flag-off carve the dig-speed STOP reads (exact carry, A5 on
// #529), not the cadence code, so it is raised on #514 and nothing is retuned. The rig that clears
// a cell inside a tick holds the bar (`drillEventStream.test.ts`). A lane: it runs only when named
// and prints each run's cells cut at 12 and not at 1.

const RIGS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  starting: {},
  'law 23': { drill_power: 50, drill_tip: 600 },
}
const TRACKS: readonly StreamTrack[] = ['straight', 'turn']
const SPEEDS_MPS = [0.5, 3]

describe('cells cut at 12 ticks and at every tick on multi-tick rigs (#514, lane)', () => {
  for (const [rig, levels] of Object.entries(RIGS)) {
    for (const track of TRACKS) {
      for (const speedMps of SPEEDS_MPS) {
        it(`cuts every 12-tick cell at every tick, ${rig} rig, ${track} at ${speedMps} m/s`, () => {
          const missedBy = STREAM_GEARS.map((gear) => {
            const run: StreamRun = { track, speedMps, levels, gear }
            const { everyTick, every12 } = cutAtBothCadences(run)
            const cutAtOne = new Set(everyTick.cells)
            return { gear: gear.name, missed: every12.cells.filter((cell) => !cutAtOne.has(cell)) }
          })
          console.log(`${rig} ${track} ${speedMps} m/s: ${JSON.stringify(missedBy)}`)
          expect(missedBy.flatMap(({ missed }) => missed)).toEqual([])
        })
      }
    }
  }
})
