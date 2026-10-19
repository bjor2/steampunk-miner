import { describe, expect, it } from 'vitest'
import { isSameGeneratedPlanet } from '../world/planetParams'
import { planetParamsOf } from './planetOfState'
import { createScriptedSession, PARAMS } from './scriptedSession'

// Ticket 560: legacy params (no ore rules stamp) generated other ore kinds than the session and
// took the one planet chunk cache from the authority on every alternating read.
describe('scripted session', () => {
  it('reads the planet with the params its session generates from', () => {
    const params = planetParamsOf(createScriptedSession().state().planet)
    expect(params).not.toBeNull()
    expect(isSameGeneratedPlanet(PARAMS, params!)).toBe(true)
  })
})
