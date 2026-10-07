/**
 * The tree screen's models, read from the authority while the screen is open: again on every
 * tree event (the slice store's revision), on the wallet and on the planet, never per frame.
 */
import { useEffect, useMemo } from 'react'
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { NodeCardModel } from '../systems/nodeCardModel'
import { registeredTechTree } from '../systems/techTree'
import {
  nodeCardModelOf,
  treeScreenModelOf,
  type TreeScreenModel,
} from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'

const TREE_EVENT_PREFIX = 'tech-tree.'

export function useTreeScreenModel(): TreeScreenModel {
  const search = useTreeScreenStore((state) => state.search)
  const filters = useTreeScreenStore((state) => state.filters)
  const revision = useTreeScreenStore((state) => state.revision)
  const { playerId, money, planetTier } = useAuthorityReadKeys()
  return useMemo(
    () =>
      treeScreenModelOf(readAuthorityState(), playerId, registeredTechTree(), { search, filters }),
    // The authority is read, not subscribed: these say when it is worth reading again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, search, filters, revision, money, planetTier],
  )
}

export function useSelectedNodeCard(): NodeCardModel | null {
  const selectedNodeId = useTreeScreenStore((state) => state.selectedNodeId)
  const revision = useTreeScreenStore((state) => state.revision)
  const { playerId, money, planetTier } = useAuthorityReadKeys()
  return useMemo(
    () =>
      selectedNodeId === null
        ? null
        : nodeCardModelOf(readAuthorityState(), playerId, registeredTechTree(), selectedNodeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNodeId, playerId, revision, money, planetTier],
  )
}

/** Bumps the revision on each batch holding a tree event, while the screen is mounted. */
export function useTreeEventRefresh(): void {
  const noteTreeChanged = useTreeScreenStore((state) => state.noteTreeChanged)
  useEffect(
    () =>
      listenForDomainEvents((events) => {
        if (events.some(isTreeEvent)) noteTreeChanged()
      }),
    [noteTreeChanged],
  )
}

function useAuthorityReadKeys() {
  const playerId = useGameStore((state) => state.playerId)
  const money = useGameStore((state) => state.money)
  const planetTier = useGameStore((state) => state.planetTier)
  return { playerId, money, planetTier }
}

function isTreeEvent(event: DomainEvent): boolean {
  return event.type.startsWith(TREE_EVENT_PREFIX)
}
