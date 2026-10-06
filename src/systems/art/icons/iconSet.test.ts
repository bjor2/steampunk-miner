import { describe, expect, it } from 'vitest'
import { isKebabId } from '../artNaming'
import { glyphOf } from './iconGlyphs'
import {
  artefactIconIdOf,
  COMBAT_STATUS_IDS,
  combatStatusIconIdOf,
  enemyIconIdOf,
  gaugeIconIdOf,
  iconEntries,
  iconEntryOf,
  iconFileIds,
  settingIconIdOf,
  trackIconIdOf,
  vehicleStateIconIdOf,
} from './iconSet'

describe('icon set (#158 icon language)', () => {
  it('names every icon once, in the #52 kebab form', () => {
    const ids = iconFileIds()
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => !isKebabId(id))).toEqual([])
  })

  it('draws every entry from a glyph that exists', () => {
    const missing = iconEntries().filter((entry) => glyphOf(entry.glyph) === null)
    expect(missing.map((entry) => `${entry.id}: ${entry.glyph}`)).toEqual([])
  })

  it('frames a buyable in a plate, a power-up in a gear rim, a status in a triangle and a gauge in nothing', () => {
    expect(iconEntryOf(trackIconIdOf('drill_power'))?.frame).toBe('plate')
    expect(iconEntryOf('icon-casing')?.frame).toBe('plate')
    expect(iconEntryOf(artefactIconIdOf('artefact.ore_whisper'))?.frame).toBe('gear')
    expect(iconEntryOf(combatStatusIconIdOf('hull_critical'))?.frame).toBe('triangle')
    expect(iconEntryOf(enemyIconIdOf('tunnel_wrecker'))?.frame).toBe('triangle')
    expect(iconEntryOf(gaugeIconIdOf('energy'))?.frame).toBe('none')
  })

  it('colours a stat track brass, a capability verdigris and a danger orange, never a state', () => {
    expect(iconEntryOf(trackIconIdOf('hull'))?.axis).toBe('brass')
    expect(iconEntryOf('icon-track-gun')?.axis).toBe('verdigris')
    expect(iconEntryOf(artefactIconIdOf('artefact.assay_beacon'))?.axis).toBe('verdigris')
    expect(iconEntryOf(enemyIconIdOf('crawler'))?.axis).toBe('warning')
    expect(iconEntryOf(combatStatusIconIdOf('overheat'))?.axis).toBe('warning')
  })

  it('has one icon per combat status, vehicle state, enemy kind and setting', () => {
    for (const status of COMBAT_STATUS_IDS) {
      expect(iconEntryOf(combatStatusIconIdOf(status)), status).not.toBeNull()
    }
    expect(vehicleStateIconIdOf('docked')).toBe('icon-state-docked')
    expect(iconEntryOf(vehicleStateIconIdOf('destroyed'))?.frame).toBe('triangle')
    expect(iconEntryOf(settingIconIdOf('cameraMode'))?.id).toBe('icon-setting-camera-mode')
  })
})
