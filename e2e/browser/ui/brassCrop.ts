/**
 * The brass crop check on the live DOM (ticket 885, spec #678): under a screen's root, every
 * shown control a tap can reach is a kit control (`data-kit-control`), every shown text with a
 * digit sits inside an icon-plus-value fact (`data-fact`), and the root stands in the kit's sheet
 * frame (`data-frame="sheet"`). A plate over the play view (the travel card) also stays out of the
 * drill head's middle band, as the #682 overlay's report draws it. The same marks as the unit
 * suite's markup check (`src/systems/views/brassCrop.ts`). DOM and `steampunkDebug`, never pixels.
 */
import type { Page } from '@playwright/test'
import { doBoxesOverlap } from '../../../src/systems/views/hudClearView'
import { SLACK_PX } from '../hud/hudLayoutHelpers'
import { hudCoverageOf } from './uiShotFindings'

/** What a brass screen shows off the kit; every list is empty when it holds. */
export interface BrassFindings {
  defaultControls: string[]
  bareNumbers: string[]
  unframed: string[]
  inBand: string[]
}

export const NO_BRASS_FINDINGS: BrassFindings = {
  defaultControls: [],
  bareNumbers: [],
  unframed: [],
  inBand: [],
}

export async function brassFindingsOf(
  page: Page,
  rootSelector: string,
  isOverPlay: boolean,
): Promise<BrassFindings> {
  return {
    ...(await kitFindingsIn(page, rootSelector)),
    inBand: isOverPlay ? await rootsInBand(page, rootSelector) : [],
  }
}

function kitFindingsIn(page: Page, rootSelector: string): Promise<Omit<BrassFindings, 'inBand'>> {
  return page.evaluate((selector) => {
    const controlSelector =
      'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="slider"], [role="switch"]'
    const isShown = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const isHidden = element.closest('[hidden]') !== null || style.visibility === 'hidden'
      return rect.width > 0 && rect.height > 0 && !isHidden
    }
    const nameOf = (element: Element) =>
      element.getAttribute('data-testid') ?? (element.textContent ?? '').trim().slice(0, 30)
    const findings = {
      defaultControls: [] as string[],
      bareNumbers: [] as string[],
      unframed: [] as string[],
    }
    for (const root of document.querySelectorAll(selector)) {
      if (!root.matches('[data-frame="sheet"]')) findings.unframed.push(nameOf(root))
      for (const control of root.querySelectorAll(controlSelector)) {
        if (isShown(control) && !control.matches('[data-kit-control]'))
          findings.defaultControls.push(nameOf(control))
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement
        const text = (node.textContent ?? '').trim()
        if (parent === null || !/\d/.test(text) || !isShown(parent)) continue
        if (parent.closest('[data-fact]') === null) findings.bareNumbers.push(text)
      }
    }
    return findings
  }, rootSelector)
}

async function rootsInBand(page: Page, rootSelector: string): Promise<string[]> {
  const { middleBand } = await hudCoverageOf(page)
  const boxes = await page.locator(rootSelector).evaluateAll((roots) =>
    roots.map((root) => {
      const { left, top, right, bottom } = root.getBoundingClientRect()
      return { left, top, right, bottom }
    }),
  )
  return boxes
    .filter((box) => doBoxesOverlap(box, middleBand, SLACK_PX))
    .map((box) => `${rootSelector} at ${Math.round(box.top)}-${Math.round(box.bottom)} px`)
}
