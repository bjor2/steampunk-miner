import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { gunMountPrice } from '../economy/gunStats'
import { setEnergyCommand, setGunLevelCommand } from '../vehicle/vehicleCommands'
import { gunMountPriceFor, setGunsForEnergy } from './botGuns'
import { createBotSession } from './botSession'

/** The bot docked at the Upgrade bay of planet `planetIndex`. */
function botOn(planetIndex: number) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

describe('bot: auto_guns policy (#107)', () => {
  it('wants the mount from planet 4, at its price, and not before', () => {
    expect(gunMountPriceFor(botOn(3), 'mount')).toBeNull()
    expect(gunMountPriceFor(botOn(4), 'mount')).toEqual(gunMountPrice(4))
  })

  it('wants no second mount, and none at all in a comparison run without guns', () => {
    const mounted = botOn(4)
    mounted.submit(setGunLevelCommand(1))
    expect(gunMountPriceFor(mounted, 'mount')).toBeNull()
    expect(gunMountPriceFor(botOn(4), 'never')).toBeNull()
  })

  it('keeps the guns on Auto at 40% of the tank and switches them Off under it', () => {
    const session = botOn(4)
    session.submit(setGunLevelCommand(1))
    session.submit(setEnergyCommand('60'))
    setGunsForEnergy(session)
    expect(session.vehicle().gun.mode).toBe('auto')
    session.submit(setEnergyCommand('59.75'))
    setGunsForEnergy(session)
    expect(session.vehicle().gun.mode).toBe('off')
    session.submit(setEnergyCommand('150'))
    setGunsForEnergy(session)
    expect(session.vehicle().gun.mode).toBe('auto')
  })

  it('sends nothing for guns it has not mounted', () => {
    const session = botOn(4)
    const before = session.commands().length
    setGunsForEnergy(session)
    expect(session.commands()).toHaveLength(before)
  })
})
