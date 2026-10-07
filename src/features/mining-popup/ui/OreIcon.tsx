/**
 * An ore's icon on a chip or the plaque: its #158 icon once the ores slice gives it one, until then
 * a hex in the colour its tiles are drawn in (#178 first cut, keyed on `resourceTier`).
 */
import type { CSSProperties } from 'react'
import { VectorIcon } from '../../../ui/VectorIcon'
import type { OreFace } from '../systems/oreFace'
import styles from './OreIcon.module.css'

/** The kernel ore's icon id: it has no glyph of its own (systems/registries/oreTypes.ts). */
const NO_ORE_ICON = 'none'

export type OreIconSize = 'chip' | 'tile'

export function OreIcon({ face, size }: { face: OreFace; size: OreIconSize }) {
  if (face.iconId !== NO_ORE_ICON) return <VectorIcon iconId={face.iconId} size="hud" />
  const swatch = { '--ore-swatch': face.swatch } as CSSProperties
  return <span className={`${styles.hex} ${styles[size]}`} style={swatch} aria-hidden />
}
