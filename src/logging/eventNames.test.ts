import { describe, expect, it } from 'vitest'
import { ALL_RUN_EVENT_NAMES } from './eventNames'

describe('run event names', () => {
  it('has no name twice', () => {
    expect(new Set(ALL_RUN_EVENT_NAMES).size).toBe(ALL_RUN_EVENT_NAMES.length)
  })

  it('keeps every name in snake_case so analytics can group them', () => {
    for (const name of ALL_RUN_EVENT_NAMES) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/)
  })

  it('includes the events the design doc singles out', () => {
    expect(ALL_RUN_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        'game_started',
        'resource_collected',
        'upgrade_purchased',
        'core_reached',
      ]),
    )
  })
})
