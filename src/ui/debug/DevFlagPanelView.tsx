/**
 * The debug flag panel drawn from its view model (ticket 549, the TD ruling on #547): every flag
 * of the metadata table, Client and Authority apart, in the shared scroll area, then the material
 * pop prototype's A/B switch (ticket 614); the run's mark; Reset to the shipped defaults and
 * Close. Flags only, never numbers (VS 6). Markup only.
 */
import type { DevFlagPanelGroup, DevFlagPanelModel } from '../../systems/devFlags/devFlagPanelModel'
import { useGameStore } from '../../store/gameStore'
import { Button } from '../kit/Button'
import { ScrollArea } from '../kit/ScrollArea'
import { TitleOneLine } from '../kit/TitleOneLine'
import { DEBUG_UI_IDS } from './debugUiIds'
import styles from './DevFlagPanel.module.css'
import { DevFlagRowView } from './DevFlagRowView'
import { MaterialPopSwitch } from './MaterialPopSwitch'

const PANEL_TEXT = {
  id: 'debug.flag-panel',
  title: 'Debug flags',
  oneLine: 'Each switch is logged and marks the run as tainted.',
  tooltipLines: [],
}

const RUN_MARKED_TEXT = 'This run is marked: flags were set in it.'

export function DevFlagPanelView({ model }: { model: DevFlagPanelModel }) {
  return (
    <div className={styles.overlay} data-testid={DEBUG_UI_IDS.devFlagPanel}>
      <section className={styles.plate}>
        <TitleOneLine text={PANEL_TEXT} level="h2" />
        <ScrollArea className={styles.scroll}>
          {model.groups.map((group) => (
            <FlagGroup key={group.scope} group={group} />
          ))}
          <MaterialPopSwitch />
        </ScrollArea>
        <RunMark isRunMarked={model.isRunMarked} />
        <div className={styles.footer}>
          <Button
            label="Reset to defaults"
            onPress={resetFlags}
            testId={DEBUG_UI_IDS.devFlagReset}
          />
          <Button label="Close" onPress={closePanel} testId={DEBUG_UI_IDS.devFlagClose} />
        </div>
      </section>
    </div>
  )
}

function FlagGroup({ group }: { group: DevFlagPanelGroup }) {
  return (
    <section className={styles.group} data-scope={group.scope}>
      <h3 className={styles.groupTitle}>{group.title}</h3>
      <ol className={styles.rows}>
        {group.rows.map((row) => (
          <DevFlagRowView key={row.id} row={row} />
        ))}
      </ol>
    </section>
  )
}

function RunMark({ isRunMarked }: { isRunMarked: boolean }) {
  if (!isRunMarked) return null
  return (
    <p className={styles.runMark} data-testid={DEBUG_UI_IDS.devFlagRunMarked}>
      {RUN_MARKED_TEXT}
    </p>
  )
}

function resetFlags(): void {
  useGameStore.getState().resetDevFlags()
}

function closePanel(): void {
  useGameStore.getState().closeDevFlagPanel()
}
