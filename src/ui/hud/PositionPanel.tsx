/**
 * Top right (#33 section 5): depth (or ALT) and band, the casing grade badge (#41), the guns' mode
 * and their low-steam badge (#107), the bore gun's auto lamp once the steam sear is researched
 * (ticket 317), the charges carried with the plant key (#109), the dock arrow
 * with its distance, tiles to the core's edge, and the time per tile in front of the drill. Each
 * line is one shared Title+OneLine row (spec #422, pass #428): its name as the title, then its
 * value beside the glyph of the icon set (#158). On the compact HUD (#500) a row is its glyph and
 * value; the names and the guns-idle line show in the box's tap card, the idle guns in amber.
 * The closed compact row also leaves the guns' and the charges' control to the card (#486).
 */
import type { ReactNode } from 'react'
import { hudLabelIconIdOf, type HudLabelId } from '../../systems/art/icons/iconSet'
import { calloutTextOf, readoutTextOf } from '../../systems/views/hudCallouts'
import { compactReadingTextOf } from '../../systems/views/hudCompact'
import type { HudModel } from '../../systems/views/hudModel'
import type { HudDensity } from '../../systems/views/screenLayout'
import type { UiTextTitlePlace } from '../../systems/views/uiText'
import { UI_IDS } from '../ids'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import { CompassArrow } from './CompassArrow'
import { HudBox } from './HudBox'
import styles from './Hud.module.css'

export function PositionPanel({
  model,
  density = 'full',
}: {
  model: HudModel
  density?: HudDensity
}) {
  return (
    <HudBox id="readouts" className={styles.position} density={density}>
      {(titlePlace) => <Readouts model={model} titlePlace={titlePlace} />}
    </HudBox>
  )
}

function Readouts({ model, titlePlace }: { model: HudModel; titlePlace: UiTextTitlePlace }) {
  const { depth, casing, guns, boreAuto, charges, dockArrow, coreDistance, tileTime } = model
  const readingOf = (text: string) => compactReadingTextOf(text, titlePlace)
  const isIdleLineShown = guns?.isIdle === true && titlePlace === 'element'
  const Line = titlePlace === 'card' ? CompactLine : FullLine
  return (
    <>
      <Line id="hud.depth" label="Depth" facts={[factOf('depth', depth.text, UI_IDS.hudDepth)]} />
      <Line
        id="hud.band"
        label="Band"
        facts={[factOf('depth', `${depth.band ?? '-'}`, UI_IDS.hudBand)]}
      />
      {casing !== null && (
        <Line id="hud.casing" label="Casing">
          <Glyph icon="casing" />
          <span
            className={styles.casingBadge}
            data-testid={UI_IDS.hudCasing}
            data-state={casing.state}
          >
            {casing.text}
          </span>
        </Line>
      )}
      {guns !== null && (
        <Line id="hud.guns" label="Guns">
          <Glyph icon="guns" />
          <span
            data-testid={UI_IDS.hudGuns}
            data-mode={guns.mode}
            data-idle={guns.isIdle || undefined}
          >
            {readingOf(guns.text)}
          </span>
        </Line>
      )}
      {isIdleLineShown && (
        <div className={styles.gunsIdle} data-testid={UI_IDS.hudGunsIdle}>
          <TitleOneLine text={calloutTextOf('hud.guns-idle', guns.idleText)} level="span" />
        </div>
      )}
      {boreAuto !== null && (
        <Line id="hud.bore" label="Bore">
          <Glyph icon="guns" />
          <span
            className={styles.autoLamp}
            data-testid={UI_IDS.hudBoreAuto}
            data-lamp={boreAuto.colour}
            data-hold={boreAuto.hold ?? ''}
          >
            {boreAuto.text}
          </span>
        </Line>
      )}
      {charges !== null && (
        <Line
          id="hud.charges"
          label="Charges"
          facts={[
            { ...factOf('charges', readingOf(charges.text), UI_IDS.hudCharges), holds: 'charges' },
          ]}
        />
      )}
      {dockArrow !== null && (
        <Line id="hud.dock" label="Dock">
          <Glyph icon="compass" />
          <CompassArrow octant={dockArrow.octant} />
          <span
            data-testid={UI_IDS.hudCompassDock}
            data-octant={dockArrow.octant}
            data-distance={dockArrow.distance}
          >
            {dockArrow.distance}
          </span>
        </Line>
      )}
      {coreDistance !== null && (
        <Line
          id="hud.core"
          label="Core"
          facts={[factOf('core', `${coreDistance}`, UI_IDS.hudCoreDistance)]}
        />
      )}
      <Line id="hud.tile" label="Tile">
        <Glyph icon="tile_time" />
        <span data-testid={UI_IDS.hudTileTime} data-state={tileTime.state}>
          {tileTime.text}
        </span>
      </Line>
    </>
  )
}

const NO_FACTS: readonly IconValue[] = []

interface LineProps {
  id: string
  label: string
  facts?: readonly IconValue[]
  children?: ReactNode
}

/** One readout row: its name, then its value as a fact or, when it carries a state, as markup. */
function FullLine(props: LineProps) {
  return <ReadoutLine {...props} titlePlace="element" />
}

/** The compact row (#500): the glyph and value, its name kept for the tap card. */
function CompactLine(props: LineProps) {
  return <ReadoutLine {...props} titlePlace="card" />
}

function ReadoutLine({
  id,
  label,
  facts = NO_FACTS,
  titlePlace,
  children,
}: LineProps & { titlePlace: UiTextTitlePlace }) {
  return (
    <TitleOneLine
      text={readoutTextOf(id, label)}
      facts={facts}
      level="span"
      layout="row"
      glyphSize="hud"
      titlePlace={titlePlace}
    >
      {children !== undefined && <span className={styles.value}>{children}</span>}
    </TitleOneLine>
  )
}

function Glyph({ icon }: { icon: HudLabelId }) {
  return <VectorIcon iconId={hudLabelIconIdOf(icon)} size="hud" />
}

function factOf(icon: HudLabelId, text: string, testId: string): IconValue {
  return { iconId: hudLabelIconIdOf(icon), text, testId }
}
