import { beforeEach, describe, expect, it } from 'vitest'
import { exampleDebugActions } from './debug'
import { unmountTestPiece, useTestPieceStore } from './store/testPieceStore'

const isMounted = () => useTestPieceStore.getState().isMounted

describe('example test piece (ticket 235)', () => {
  beforeEach(unmountTestPiece)

  it('keeps the test piece off the car until a spec mounts it', () => {
    expect(isMounted()).toBe(false)
  })

  it('mounts and unmounts the test piece through its debug actions', () => {
    expect(exampleDebugActions.mountTestPiece!()).toEqual({ ok: true })
    expect(isMounted()).toBe(true)
    expect(exampleDebugActions.unmountTestPiece!()).toEqual({ ok: true })
    expect(isMounted()).toBe(false)
  })
})
