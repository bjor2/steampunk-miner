/**
 * The HUD's `overlay` slot (#208): a full-screen layer over the canvas that lets clicks through,
 * drawn first so the banner and prompts sit above it. Each slice panel draws under its declared
 * priority; with no overlay panel registered it draws nothing at all, so the HUD is unchanged.
 */
import { overlayPanels } from '../registries/hudPanels'
import { OverlayPriorityContext } from './overlayPriority'
import styles from './Overlay.module.css'

export function OverlayLayer() {
  const panels = overlayPanels()
  if (panels.length === 0) return null
  return (
    <div className={styles.overlay}>
      {panels.map(({ id, priority, Panel }) => (
        <OverlayPriorityContext.Provider key={id} value={priority}>
          <Panel />
        </OverlayPriorityContext.Provider>
      ))}
    </div>
  )
}
