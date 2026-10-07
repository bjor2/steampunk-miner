import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { slotOfPartId } from '../../../../systems/art/artIds'
import { UPGRADE_IDS } from '../../../../systems/economy/economyDefinition'
import {
  RESTING_TURN,
  SHOWCASE,
  momentTicksOf,
  placePartPoint,
  swingMoveAt,
  turnRadiansAt,
  turnTowardTrack,
  type PartSwing,
} from './showcaseReactions'

const VEHICLE_PARTS = new URL(
  '../../../../../public/assets/vehicle/vehicle/vehicle.parts.json',
  import.meta.url,
)

function shippedSlots(): Set<string> {
  const sidecar = JSON.parse(readFileSync(VEHICLE_PARTS, 'utf8')) as { parts: { id: string }[] }
  return new Set(sidecar.parts.map((part) => slotOfPartId(part.id)))
}

function scratch(): PartSwing {
  return { x: 0, y: 0, angle: 0, glow: 0 }
}

function isMoving(swing: PartSwing): boolean {
  return swing.x !== 0 || swing.y !== 0 || swing.angle !== 0 || swing.glow !== 0
}

describe('workshop showcase reactions', () => {
  it('gives every track a reaction that sways slots the vehicle ships', () => {
    const slots = shippedSlots()
    for (const track of UPGRADE_IDS) {
      const moves = SHOWCASE.tracks[track].moves
      expect(moves.length).toBeGreaterThan(0)
      for (const move of moves) expect(move.slots.filter((slot) => !slots.has(slot))).toEqual([])
    }
  })

  it("ends each track's leader line on its attach point in the vehicle's sidecar", () => {
    const sidecar = JSON.parse(readFileSync(VEHICLE_PARTS, 'utf8')) as {
      attach: { id: string; atM: [number, number] }[]
    }
    for (const track of UPGRADE_IDS) {
      const { attach, attachAtM } = SHOWCASE.tracks[track]
      expect(attachAtM).toEqual(sidecar.attach.find((point) => point.id === attach)?.atM)
    }
  })

  it('places a part on the drawn car, turned with its up and mirrored facing left', () => {
    const drill = SHOWCASE.tracks.drill_tip
    const point = { x: 0, y: 0 }
    placePartPoint(drill, { x: 10, y: 20 }, { x: 0, y: 1 }, 1, point)
    expect(point).toEqual({ x: 10 + drill.attachAtM[0], y: 20 + drill.attachAtM[1] })
    placePartPoint(drill, { x: 10, y: 20 }, { x: 0, y: 1 }, -1, point)
    expect(point.x).toBeCloseTo(10 - drill.attachAtM[0])
    placePartPoint(drill, { x: 0, y: 0 }, { x: 1, y: 0 }, 1, point)
    expect(point.y).toBeCloseTo(-drill.attachAtM[0])
  })

  it("moves each track's own part on the tick its step lands, within G&V's 4 ticks", () => {
    for (const track of UPGRADE_IDS) {
      for (const age of [0, 1, 2, 3]) {
        const swings = SHOWCASE.tracks[track].moves.map((move) =>
          swingMoveAt(move, 'pip', age, scratch()),
        )
        expect(swings.some(isMoving)).toBe(true)
      }
    }
  })

  it('swings a big level-up wider and longer than a pip, and rests once the moment is over', () => {
    const move = SHOWCASE.tracks.drill_tip.moves[0]
    const pip = swingMoveAt(move, 'pip', 0, scratch())
    const major = swingMoveAt(move, 'full', 0, scratch())

    expect(major.glow).toBeGreaterThan(pip.glow)
    expect(momentTicksOf('full')).toBeGreaterThan(momentTicksOf('compressed'))
    expect(momentTicksOf('compressed')).toBeGreaterThan(momentTicksOf('pip'))
    expect(isMoving(swingMoveAt(move, 'pip', momentTicksOf('pip'), scratch()))).toBe(false)
    expect(isMoving(swingMoveAt(move, 'full', momentTicksOf('full'), scratch()))).toBe(false)
  })

  it('keeps the full moment within the 72 to 90 ticks of #180', () => {
    expect(momentTicksOf('full')).toBeGreaterThanOrEqual(72)
    expect(momentTicksOf('full')).toBeLessThanOrEqual(90)
    expect(momentTicksOf('compressed')).toBe(36)
  })

  it("turns the turntable to the selected track's angle over 20 ticks", () => {
    const turn = turnTowardTrack(RESTING_TURN, 'drill_power', 100)
    const target = SHOWCASE.tracks.drill_power.faceTurnRadians

    expect(turnRadiansAt(turn, 100)).toBe(0)
    expect(Math.abs(turnRadiansAt(turn, 110))).toBeLessThan(Math.abs(target))
    expect(turnRadiansAt(turn, 120)).toBe(target)
  })

  it('starts a new turn from where the last one stands', () => {
    const toDrill = turnTowardTrack(RESTING_TURN, 'drill_power', 100)
    const toCargo = turnTowardTrack(toDrill, 'cargo_hold', 110)

    expect(turnRadiansAt(toCargo, 110)).toBe(turnRadiansAt(toDrill, 110))
    expect(turnRadiansAt(toCargo, 130)).toBe(SHOWCASE.tracks.cargo_hold.faceTurnRadians)
  })
})
