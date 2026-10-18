/**
 * A material's name in its rarity's colour (ticket 454 under #139): the tint and frame the ground
 * draws the rarity in, and for epic and mythic a glow that pulses unless motion is reduced. With
 * no rarity (unspecified: unseen, or no species) it draws the name alone, as before materials.
 * The tint comes from the data (`rarityLooks.json`), so it rides in a custom property.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { RarityName as RarityNameView } from '../../systems/views/rarityName'
import styles from './RarityName.module.css'

export function RarityName({
  rarity,
  children,
}: {
  rarity: RarityNameView | null
  children: ReactNode
}) {
  if (rarity === null) return <span data-rarity="">{children}</span>
  return (
    <span
      className={styles.name}
      style={tintStyleOf(rarity.tint)}
      data-rarity={rarity.rarity}
      data-tinted={rarity.tint !== null || undefined}
      data-pulse={rarity.isPulsing || undefined}
      title={rarity.word}
    >
      {children}
    </span>
  )
}

function tintStyleOf(tint: string | null): CSSProperties | undefined {
  return tint === null ? undefined : ({ '--rarity-tint': tint } as CSSProperties)
}
