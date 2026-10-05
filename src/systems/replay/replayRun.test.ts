import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../authority/authorityCommand'
import {
  createScriptedSession,
  drill,
  poseAbove,
  surfaceOreTiles,
  WORLD_SEED,
} from '../authority/scriptedSession'
import { FACING } from '../vehicle/vehiclePose'
import { cmp, fromCanonical } from '../money'
import { GOLDEN_SCRIPTS, stampScript, type GoldenScript } from './goldenScripts'
import { digestsOf, firstDigestMismatch, replayRun } from './replayRun'

const scriptNamed = (name: string): GoldenScript => {
  const script = GOLDEN_SCRIPTS.find((candidate) => candidate.name === name)
  if (script === undefined) throw new Error(`no golden script ${name}`)
  return script
}

const replayScript = (script: GoldenScript, framesPerSecond?: number) =>
  replayRun(script.worldSeed, stampScript(script), { endTick: script.endTick, framesPerSecond })

const isPast1e40 = (amount: string) => cmp(fromCanonical(amount), fromCanonical('1e40')) > 0

describe('replayRun', () => {
  it('reproduces the digests a live session logged from the seed and its commands', () => {
    const script: GoldenScript = {
      name: 'live',
      description: 'three surface ore tiles, then past the first periodic digest',
      worldSeed: WORLD_SEED,
      endTick: 3700,
      commands: surfaceOreTiles(3).flatMap((tile, index) => [
        { tick: 10 + 50 * index, ...poseAbove(tile, FACING.down) },
        { tick: 50 + 50 * index, ...drill(tile, 40) },
      ]),
    }
    const live = createScriptedSession()
    for (const { tick, ...intent } of script.commands) {
      live.advanceTo(tick)
      live.submit(tick, intent as CommandIntent)
    }
    live.advanceTo(script.endTick)
    const replayed = replayScript(script)
    expect(replayed.digests.slice(0, -1)).toEqual(digestsOf(live.events()))
    expect(replayed.state).toEqual(live.state())
  })

  it('ends with the digest of the state at the end tick', () => {
    const replayed = replayScript(scriptNamed('dig-and-return'))
    expect(replayed.digests.at(-1)).toMatchObject({ tick: 4000, scope: 'end' })
    expect(replayed.digests.map((digest) => digest.scope)).toEqual(['dock', 'periodic', 'end'])
  })

  it('gives the same digests and events when the clock runs in 30 and 144 fps frames', () => {
    for (const script of GOLDEN_SCRIPTS) {
      const straight = replayScript(script)
      for (const framesPerSecond of [30, 144]) {
        const framed = replayScript(script, framesPerSecond)
        expect(framed.digests).toEqual(straight.digests)
        expect(framed.events).toEqual(straight.events)
      }
    }
  })

  it('replays a refused command as refused', () => {
    const script = scriptNamed('dig-and-return')
    const commands = stampScript(script)
    const late = { ...commands[1], seq: commands[0].seq }
    const replayed = replayRun(script.worldSeed, [commands[0], late])
    expect(replayed.events.at(-1)).toMatchObject({
      type: 'CommandRejected',
      reason: 'out_of_order',
    })
  })

  it('strands, then tows after the grace, in the strand script', () => {
    const { events } = replayScript(scriptNamed('strand-and-rescue'))
    expect(events.find((event) => event.type === 'RescueTriggered')).toMatchObject({
      tick: 192,
      cause: 'stranded',
    })
  })

  it('is destroyed by a rear hit and towed in the destroyed script', () => {
    const { events } = replayScript(scriptNamed('destroyed-and-towed'))
    expect(events.find((event) => event.type === 'VehicleDestroyed')).toMatchObject({
      attacker: { kind: 'crawler', arc: 'rear' },
    })
    expect(events.find((event) => event.type === 'RescueTriggered')).toMatchObject({
      cause: 'destroyed',
    })
  })

  it('earns and spends past 1e40 in the money script', () => {
    const { events } = replayScript(scriptNamed('money-past-1e40'))
    const sale = events.find((event) => event.type === 'ResourceSold')
    const purchase = events.find((event) => event.type === 'UpgradePurchased')
    expect(sale?.type === 'ResourceSold' && isPast1e40(sale.value)).toBe(true)
    expect(purchase?.type === 'UpgradePurchased' && isPast1e40(purchase.cost)).toBe(true)
  })
})

describe('firstDigestMismatch', () => {
  const digest = (tick: number, value: string) => ({ tick, scope: 'dock' as const, digest: value })

  it('finds nothing when every digest matches', () => {
    expect(firstDigestMismatch([digest(5, 'a')], [digest(5, 'a')])).toBeNull()
  })

  it('names the first differing digest and its tick', () => {
    expect(
      firstDigestMismatch([digest(5, 'a'), digest(9, 'b')], [digest(5, 'a'), digest(9, 'c')]),
    ).toBe('digest 1 differs: logged dock b at tick 9, replayed dock c at tick 9')
  })

  it('names a digest the replay did not reach', () => {
    expect(firstDigestMismatch([digest(5, 'a')], [])).toBe('digest 0 at tick 5 was not replayed')
  })
})
