/**
 * The spec hooks of the Sell bay's slice panels (ticket 845): the list, its pager on desktop, and
 * `data-bay-panel-id` on each drawn panel, which carries the row's panel id.
 */
export const BAY_PANEL_UI_IDS = {
  list: 'sellbay-panels',
  previous: 'sellbay-panels-previous',
  next: 'sellbay-panels-next',
} as const
