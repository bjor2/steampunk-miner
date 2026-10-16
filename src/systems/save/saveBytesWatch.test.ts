import { describe, expect, it } from 'vitest'
import { createScriptedSession, dockInBay } from '../authority/scriptedSession'
import { saveBytesOf, watchSaveBytesOn } from './saveBytesWatch'

describe('save bytes watch', () => {
  it('measures the save cut at a checkpoint moment on a watched planet', () => {
    const session = createScriptedSession()
    const watch = watchSaveBytesOn([1])
    const events = dockInBay(session, 1, 'sell')
    watch.note(session.state(), events)
    const bytes = watch.largestBytesByPlanet().get(1)
    expect(bytes).toBe(saveBytesOf(session.state()))
    expect(bytes).toBeGreaterThan(0)
  })

  it('measures nothing away from a checkpoint moment or on a planet it does not watch', () => {
    const session = createScriptedSession()
    const watch = watchSaveBytesOn([10])
    const events = dockInBay(session, 1, 'sell')
    watch.note(session.state(), events)
    watch.note(session.state(), [])
    expect(watch.largestBytesByPlanet().size).toBe(0)
  })
})
