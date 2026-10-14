/**
 * The game store's title-menu slice (#401 B, ticket 403): the menu a plain launch opens on, over
 * a held game (`isLiveStepHeld`), with the slot index read as it opens. New Game starts the P1
 * baseline with nothing carried over (HS1, VS4), after a confirm when any save exists; Continue
 * loads the newest slot of the index and Load the chosen one, both through the checkpoint, which
 * stays the one reader and writer of the save folder. A refused save is set aside by the
 * checkpoint, and the title stays open with its problems and the index read again.
 *
 * Once a game is picked, play starts as a launch without the title does: the starting planet's
 * lines, its card, then the hints.
 */
import { recordStartingPlanet } from '../logging/startingPlanetLines'
import { getRunLog } from '../logging/runLog'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { latestSlotOf, type SaveSlotKey } from '../systems/save/saveSlotIndex'
import {
  isNewGameConfirmNeeded,
  type TitleMenu,
  type TitleMenuPage,
} from '../systems/views/titleMenuModel'
import { readAuthorityState } from './authorityLink'
import { listSaveSlots, loadSaveSlot, type Checkpoint, type CheckpointLoad } from './checkpoint'

export interface TitleMenuValues {
  /** The title menu on screen; null once play started. */
  titleMenu: TitleMenu | null
}

export interface TitleMenuActions {
  /** Opens the title menu on its main page, with the slot index as it reads now. */
  openTitleMenu(): Promise<void>
  showTitlePage(page: TitleMenuPage): void
  /** New Game: the confirm page when any save exists, else the new game at once. */
  pressNewGame(): void
  /** The new game: the P1 baseline, nothing carried over; play starts. */
  confirmNewGame(): void
  /** The newest slot of the index; nothing with no save. */
  continueGame(): Promise<void>
  loadGameFromSlot(slot: SaveSlotKey): Promise<void>
}

type SliceHost = TitleMenuValues &
  TitleMenuActions & {
    playerId: string
    planetTier: number
    depthTiles: number
    /** The store's: the session replaced by the P1 baseline. */
    startNewGame(): void
    resumeCheckpoint(checkpoint: Checkpoint): void
    openPlanetCard(): void
    startPlaques(): void
  }

/**
 * Only the title menu: menu focus stays the presentation slice's, and an id that is not on the
 * page shown falls back to the page's own start (`focusOnScreen`).
 */
type SetSlice = (partial: Partial<TitleMenuValues>) => void

export const STARTING_TITLE_MENU: TitleMenuValues = { titleMenu: null }

export function titleMenuActionsOf(set: SetSlice, get: () => SliceHost): TitleMenuActions {
  let isLoading = false
  const loadOnce = async (slot: SaveSlotKey) => {
    if (isLoading) return
    isLoading = true
    try {
      await resumeOrReport(set, get, slot)
    } finally {
      isLoading = false
    }
  }
  return {
    openTitleMenu: async () => set({ titleMenu: titleMenuOf(await listSaveSlots()) }),
    showTitlePage: (page) => set({ titleMenu: onPage(get().titleMenu, page) }),
    pressNewGame: () => {
      if (isNewGameConfirmNeeded(slotsOf(get()))) get().showTitlePage('confirmNewGame')
      else get().confirmNewGame()
    },
    confirmNewGame: () => {
      get().startNewGame()
      startPlayFromTitle(set, get)
    },
    continueGame: async () => {
      const latest = latestSlotOf(slotsOf(get()))
      if (latest !== null) await loadOnce(latest.slot)
    },
    loadGameFromSlot: loadOnce,
  }
}

/** A refused or missing save keeps the title, with its problems and the index read again. */
async function resumeOrReport(
  set: SetSlice,
  get: () => SliceHost,
  slot: SaveSlotKey,
): Promise<void> {
  const checkpoint = await loadSaveSlot(slot)
  if (isResumable(checkpoint)) return resumeFromTitle(set, get, checkpoint)
  const page = get().titleMenu?.page ?? 'main'
  const titleMenu = { page, slots: await listSaveSlots(), problems: problemsOf(slot, checkpoint) }
  set({ titleMenu })
}

function isResumable(checkpoint: CheckpointLoad): checkpoint is Checkpoint {
  return checkpoint !== null && 'state' in checkpoint
}

function resumeFromTitle(set: SetSlice, get: () => SliceHost, checkpoint: Checkpoint): void {
  get().resumeCheckpoint(checkpoint)
  startPlayFromTitle(set, get)
}

/** As a launch without the title starts play: the planet's lines, its card, then the hints. */
function startPlayFromTitle(set: SetSlice, get: () => SliceHost): void {
  set({ titleMenu: null })
  recordPlanetEntered(get())
  get().openPlanetCard()
  get().startPlaques()
}

function recordPlanetEntered(host: SliceHost): void {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return
  const stamp = {
    playerId: host.playerId,
    planet: host.planetTier,
    depthTiles: host.depthTiles,
    tick: state.tick,
  }
  recordStartingPlanet(getRunLog(), stamp, params)
}

function titleMenuOf(slots: TitleMenu['slots']): TitleMenu {
  return { page: 'main', slots, problems: [] }
}

function onPage(titleMenu: TitleMenu | null, page: TitleMenuPage): TitleMenu | null {
  return titleMenu === null ? null : { ...titleMenu, page, problems: [] }
}

function slotsOf(host: SliceHost): TitleMenu['slots'] {
  return host.titleMenu?.slots ?? []
}

function problemsOf(slot: SaveSlotKey, checkpoint: CheckpointLoad): readonly string[] {
  if (checkpoint === null) return [`${slot} holds no save`]
  return 'problems' in checkpoint ? checkpoint.problems.map((problem) => `${slot}: ${problem}`) : []
}
