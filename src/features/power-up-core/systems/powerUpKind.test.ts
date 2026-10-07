import { describe, expect, it } from 'vitest'
import { contentOf } from '../../../systems/registries/content'
import { withRegistrations } from '../../../registries/registrar'
import { FAKE_ITEMS } from '../fakeItems'
import { slice } from '../register'
import { powerUpProblems, type PowerUp } from './powerUpKind'

// The class rules every registered power-up keeps (#162 sections 2.1 and 2.3).

const LOADED = () => contentOf('power-up')

describe('power-up kind', () => {
  it('finds no problem with any registered power-up, or with the fakes', () => {
    expect(LOADED().flatMap(powerUpProblems)).toEqual([])
    const fakes = withRegistrations([slice, FAKE_ITEMS], LOADED)
    expect(fakes.flatMap(powerUpProblems)).toEqual([])
  })

  it('refuses a wind-up over 6 ticks, charges on a class with none, and a hold off a channel', () => {
    const fake = withRegistrations([slice, FAKE_ITEMS], LOADED)[0]
    const broken: PowerUp = { ...fake, powerUpClass: 'passive', windupTicks: 7, channelTicks: 5 }
    expect(powerUpProblems(broken)).toEqual([
      `${fake.id} winds up 7 ticks, over 6`,
      `${fake.id} is passive with ${fake.charges} charges`,
      `${fake.id} is not a channel but holds 5 ticks`,
    ])
  })

  it('refuses an energy draw on anything but a toggle, and one that is not a whole number', () => {
    const fake = withRegistrations([slice, FAKE_ITEMS], LOADED)[0]
    expect(powerUpProblems({ ...fake, energyDrawPerMillePerSecond: 10 })).toEqual([
      `${fake.id} is no toggle but draws 10 per mille a second`,
    ])
    const toggle = { ...fake, isToggle: true, energyDrawPerMillePerSecond: 1.5 }
    expect(powerUpProblems(toggle)).toEqual([
      `${fake.id} draws 1.5 per mille a second, not a whole number from 0`,
    ])
  })
})
