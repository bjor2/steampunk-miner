import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listenForSprays, type SprayRequest } from '../../../store/sprayRequests'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { FIRE_TILE_FEEL } from '../systems/render/fireTileFeel'
import { throwBoreTracer } from './boreTracer'

// The tracer asks the kernel's spray channel straight from the bore's events (ticket 314), so it
// needs no dynamite-visuals and no scene layer of its own.

let sprays: SprayRequest[]
let stopListening: () => void

beforeEach(() => {
  sprays = []
  stopListening = listenForSprays((request) => sprays.push({ ...request }))
})

afterEach(() => stopListening())

const fired: DomainEvent = {
  type: 'BoreFired',
  tick: 10,
  seq: 1,
  playerId: 'p1',
  aimed: 255,
  bearing: 255,
  rangeCells: 4,
}
const opened: DomainEvent = {
  type: 'TileDestroyed',
  tick: 12,
  tx: -29,
  ty: 280,
  kind: 'ground',
  cause: 'bore',
}
const drilled: DomainEvent = { type: 'TileDestroyed', tick: 12, tx: -29, ty: 280, kind: 'ground' }

describe('ground-gun: the bore tracer', () => {
  it("throws the local player's shot sparks and each bored cell's debris and dust, all low", () => {
    throwBoreTracer([fired, opened], 'p1')
    expect(sprays.map(({ kind, count }) => [kind, count])).toEqual([
      ['spark', FIRE_TILE_FEEL.tracer.sparksPerShot],
      ['debris', FIRE_TILE_FEEL.tracer.debrisPerCell],
      ['dust', FIRE_TILE_FEEL.tracer.dustPerCell],
    ])
    expect(sprays.every((spray) => spray.priority === 'low')).toBe(true)
  })

  it("throws nothing for another player's shot or a drilled cell", () => {
    throwBoreTracer([fired, drilled], 'p2')
    expect(sprays).toEqual([])
  })
})
