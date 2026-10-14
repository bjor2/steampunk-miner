import { afterEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { SoundOut } from '../shell/soundOut'
import { useGameStore } from '../store/gameStore'
import { listenForOneShots, requestOneShot } from '../store/oneShotRequests'
import { createOneShotPlayer, type OneShotPlayer } from './oneShotPlayer'

// The `oneShots` seam (TD lock on #288 Q2, ticket 372): a fake slice names the kernel's light
// clank, as the ceiling anchor's drop will, and requests reach SoundOut once a frame.

const DROP = 'combo.ceiling_anchor.drop'

const anchorSlice: SliceDefinition = {
  id: 'combo',
  register: (r) => r.oneShot({ id: DROP, voice: 'clankLight' }),
}

/** A SoundOut that records each clank it plays. */
function recordingSoundOut(clanks: string[]): SoundOut {
  return { playClank: (weight: string) => clanks.push(weight) } as unknown as SoundOut
}

let stopListening = () => {}

afterEach(() => stopListening())

function listeningPlayer(clanks: string[]): OneShotPlayer {
  const player = createOneShotPlayer(recordingSoundOut(clanks))
  stopListening = listenForOneShots(player.play)
  return player
}

describe('one-shot requests', () => {
  it("plays the kernel's light clank once for a registered one-shot", () => {
    const clanks: string[] = []
    withRegistrations([anchorSlice], () => {
      listeningPlayer(clanks)
      requestOneShot(DROP)
    })
    expect(clanks).toEqual(['light'])
  })

  it('plays two requests in one frame once, and again on the next frame', () => {
    const clanks: string[] = []
    withRegistrations([anchorSlice], () => {
      const player = listeningPlayer(clanks)
      requestOneShot(DROP)
      requestOneShot(DROP)
      expect(clanks).toEqual(['light'])
      player.advance()
      requestOneShot(DROP)
    })
    expect(clanks).toEqual(['light', 'light'])
  })

  it('throws for an id nobody registered', () => {
    withRegistrations([anchorSlice], () => {
      expect(() => requestOneShot('combo.ceiling_anchor.lift')).toThrow(
        /no slice registered the one-shot "combo.ceiling_anchor.lift"/,
      )
    })
  })

  it('changes no store or authority state', () => {
    withRegistrations([anchorSlice], () => {
      listeningPlayer([])
      const before = useGameStore.getState()
      requestOneShot(DROP)
      expect(useGameStore.getState()).toBe(before)
    })
  })

  it("refuses a one-shot whose id does not start with its slice's id", () => {
    const stray: SliceDefinition = {
      id: 'combos',
      register: (r) => r.oneShot({ id: DROP, voice: 'clankLight' }),
    }
    expect(() => withRegistrations([stray], () => null)).toThrow(/in "oneShots": its ids start/)
  })
})
