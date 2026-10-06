import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listSoakGateFailures } from './soakGate.mjs'

/** The cycle boundaries of a real 10-minute `npm run soak:memory` (18 cycles, no page error). */
const REAL_SOAK = JSON.parse(
  readFileSync(new URL('./fixtures/soak-boundaries.json', import.meta.url), 'utf8'),
)

const MIB = 1048576

/** A cycle boundary as the soak samples it on the dock after GC (soak.json `boundaries`). */
function boundaryAt(cycle, { heapMB = 42, geometries = 31, textures = 18, colliders = 4 } = {}) {
  return {
    cycle,
    usedJSHeapSize: heapMB * MIB,
    geometries,
    textures,
    rapierColliders: colliders,
  }
}

function cycles(count, shapeOf) {
  return Array.from({ length: count }, (_, at) => boundaryAt(at + 1, shapeOf(at + 1)))
}

describe('memory soak gate', () => {
  it('passes a flat run of 18 cycles with heap noise', () => {
    const noise = [
      0, 1.4, -0.8, 0.6, -1.5, 1.1, 0.2, -0.4, 1.5, -1.2, 0.9, -0.3, 0.4, 1.3, -1, 0.7, -0.6, 0.1,
    ]
    const run = cycles(18, (cycle) => ({ heapMB: 43 + noise[cycle - 1] }))

    expect(listSoakGateFailures(run, [])).toEqual([])
  })

  it('passes a real 10-minute soak with its one warm-up step in geometries and textures', () => {
    expect(listSoakGateFailures(REAL_SOAK.boundaries, REAL_SOAK.pageErrors)).toEqual([])
  })

  it('fails a leak of 2 MB and one geometry per cycle on both the heap and the geometry rule', () => {
    const run = cycles(18, (cycle) => ({ heapMB: 42 + 2 * cycle, geometries: 31 + cycle }))

    expect(listSoakGateFailures(run, [])).toEqual([
      'retained heap grew 22.0 MB (> 20 MB)',
      'geometries rose in 10 of the last 10 cycles and never fell: 39 → 40 → 41 → 42 → 43 → 44 → 45 → 46 → 47 → 48 → 49',
    ])
  })

  it('passes one 31 to 34 geometry step that then stays flat', () => {
    const run = cycles(18, (cycle) =>
      cycle < 9 ? { geometries: 31, textures: 18 } : { geometries: 34, textures: 21 },
    )

    expect(listSoakGateFailures(run, [])).toEqual([])
  })

  it('fails a run too short to show a trend', () => {
    const run = cycles(14, () => ({}))

    expect(listSoakGateFailures(run, [])).toEqual([
      'only 10 cycles after warm-up; the gate needs 11',
    ])
  })

  it('passes colliders that rise three times but fall back in between', () => {
    const colliders = [4, 4, 4, 4, 4, 5, 4, 5, 4, 5, 4, 4, 4, 4, 4]
    const run = cycles(15, (cycle) => ({ colliders: colliders[cycle - 1] }))

    expect(listSoakGateFailures(run, [])).toEqual([])
  })

  it('fails any page error, such as a stack overflow', () => {
    const run = cycles(15, () => ({}))
    const pageErrors = ['RangeError: Maximum call stack size exceeded']

    expect(listSoakGateFailures(run, pageErrors)).toEqual([
      '1 page error(s): RangeError: Maximum call stack size exceeded',
    ])
  })
})
