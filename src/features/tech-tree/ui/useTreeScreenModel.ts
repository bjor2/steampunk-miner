/**
 * The Patent Office's model, read from the authority while the tab is drawn: again on every tree
 * event (the slice store's revision), on the wallet and on the planet, never per frame.
 */
import { useEffect, useMemo } from 'react'
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { patentCardsOf, type PatentCard } from '../systems/patentCards'
import { registeredTechTree } from '../systems/techTree'
import { treeScreenModelOf, type TreeQuery } from '../systems/treeScreenModel'
import { useTreeScreenStore } from '../store/treeScreenStore'

const TREE_EVENT_PREFIX = 'tech-tree.'

/** Every node the tree shows: the Patent Office lists them all, by what the wallet reaches. */
const EVERY_NODE: TreeQuery = { search: '', filters: [] }

export function usePatentCards(): readonly PatentCard[] {
  const revision = useTreeScreenStore((state) => state.revision)
  const playerId = useGameStore((state) => state.playerId)
  const money = useGameStore((state) => state.money)
  const planetTier = useGameStore((state) => state.planetTier)
  return useMemo(
    () => readPatentCards(playerId),
    // The authority is read, not subscribed: these say when it is worth reading again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playerId, revision, money, planetTier],
  )
}

function readPatentCards(playerId: string): PatentCard[] {
  const state = readAuthorityState()
  const tree = registeredTechTree()
  const model = treeScreenModelOf(state, playerId, tree, EVERY_NODE)
  return patentCardsOf(model, tree, state.players[playerId].wallet)
}

/** Bumps the revision on each batch holding a tree event, while the tab is drawn. */
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

function isTreeEvent(event: DomainEvent): boolean {
  return event.type.startsWith(TREE_EVENT_PREFIX)
}
