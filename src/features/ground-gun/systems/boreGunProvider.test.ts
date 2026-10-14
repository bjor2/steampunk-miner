import { describe, expect, it } from 'vitest'
import { createScriptedSession } from '../../../systems/authority/scriptedSession'
import { boreGunOf, boreGunWallsMountIntent } from '../../../systems/registries/boreGun'
import { boreGunStatsOf, wallLevels } from './boreGunProvider'
import { gunLevelsOf } from './gunLevels'
import { wallLevelOf } from './gunTracks'

describe('ground-gun: the bore gun provider', () => {
  it('names the walls mount, so balance:bore has a gun to force', () => {
    const intent = boreGunWallsMountIntent()
    expect(intent).not.toBeNull()
    const session = createScriptedSession()
    const events = session.submit(0, intent!)
    expect(events.find((event) => event.type === 'CommandRejected')).toBeUndefined()
    expect(gunLevelsOf(session.state(), 'p1')).toEqual({
      rate: wallLevelOf('rate'),
      penetration: wallLevelOf('penetration'),
      energy: wallLevelOf('energy'),
    })
    expect(boreGunOf(session.state(), 'p1')).toEqual(boreGunStatsOf(wallLevels()))
  })

  it('answers no gun before the mount', () => {
    expect(boreGunOf(createScriptedSession().state(), 'p1')).toBeNull()
  })
})
