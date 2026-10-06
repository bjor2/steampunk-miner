import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { SCHEDULED_ENEMY_ART_ROW_IDS, blenderAssetIds } from './artIds'
import { assetQuadsOf, atlasMapsOf } from './assetLook'
import { placeholderQuadsOf } from './placeholderLook'
import { ENEMY_IDS } from '../registeredIds'
import { LOCKED_SCHEDULE } from '../unlocks/unlockSchedule'

// The tunnel wrecker (#111, #112): enemy art named from its schedule row ahead of its module (#94).
describe('tunnel wrecker art', () => {
  it("names the tunnel wrecker's art from its schedule row before the economy lists the kind", () => {
    expect(ENEMY_IDS).not.toContain('tunnel_wrecker')
    expect(blenderAssetIds()).toContain('enemy-tunnel-wrecker')
  })

  it('takes scheduled enemy art only from Enemy rows of the locked schedule', () => {
    const enemyRowIds = LOCKED_SCHEDULE.rows
      .filter((row) => row.lane === 'Enemy')
      .map((row) => row.id)
    expect(enemyRowIds).toEqual(expect.arrayContaining([...SCHEDULED_ENEMY_ART_ROW_IDS]))
  })

  it('cuts the tunnel wrecker from its atlas as its one placeholder part, with a glow map', () => {
    const [quad, ...rest] = assetQuadsOf(SHIPPED_ART, 'enemy-tunnel-wrecker', 1)
    const [placeholder] = placeholderQuadsOf(SHIPPED_ART, 'enemy-tunnel-wrecker', 1)
    expect(rest).toEqual([])
    expect(quad.uv).not.toBeNull()
    expect({ ...quad, uv: null }).toEqual({ ...placeholder, uv: null })
    expect(atlasMapsOf(SHIPPED_ART, 'enemy-tunnel-wrecker')?.emissive).toBe(
      'assets/enemy/enemy-tunnel-wrecker/enemy-tunnel-wrecker.emissive.ktx2',
    )
  })
})
