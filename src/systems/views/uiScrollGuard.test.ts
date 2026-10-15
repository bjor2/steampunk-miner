import { describe, expect, it } from 'vitest'
import { SHARED_SCROLL_SHEET, scrollFindingsOf } from './uiScrollGuard'

// Spec #422 ruling 3 (TD ruling on #424): the shared scroll area is the one scroll container,
// so every other scrolling box or native scrollbar style is a finding.

const SHARED_SHEET = {
  path: SHARED_SCROLL_SHEET,
  text: '.viewport {\n  overflow: auto;\n  scrollbar-width: none;\n}\n.viewport::-webkit-scrollbar {}',
}

describe('ui scroll guard', () => {
  it('lets the shared scroll area scroll and hide the native scrollbar', () => {
    expect(scrollFindingsOf([SHARED_SHEET])).toEqual([])
  })

  it('finds a second scroll container in any other sheet, with its line', () => {
    const sheet = { path: 'src/ui/demo/Demo.module.css', text: '.list {\n  overflow-y: auto;\n}' }
    expect(scrollFindingsOf([SHARED_SHEET, sheet])).toEqual([
      { path: 'src/ui/demo/Demo.module.css', line: 2, declaration: 'overflow-y: auto;' },
    ])
  })

  it('finds scroll, overlay and the shorthand with two values', () => {
    const text =
      '.a { overflow: scroll; }\n.b { overflow-x: overlay; }\n.c { overflow: hidden auto; }'
    expect(scrollFindingsOf([{ path: 'src/ui/A.module.css', text }])).toHaveLength(3)
  })

  it('finds native scrollbar styling outside the shared sheet', () => {
    const text = '.a { scrollbar-color: brass; }\n.a::-webkit-scrollbar-thumb { width: 2px; }'
    expect(scrollFindingsOf([{ path: 'src/ui/A.module.css', text }])).toHaveLength(2)
  })

  it('passes a box that hides or clips its overflow', () => {
    const text = '.a { overflow: hidden; }\n.b { overflow: clip; text-overflow: ellipsis; }'
    expect(scrollFindingsOf([{ path: 'src/ui/A.module.css', text }])).toEqual([])
  })

  it('ignores a comment that talks about scrolling, keeping later line numbers true', () => {
    const text = '/* the scroll area owns\n overflow: auto */\n.a { overflow: auto; }'
    expect(scrollFindingsOf([{ path: 'src/ui/A.module.css', text }])).toEqual([
      { path: 'src/ui/A.module.css', line: 3, declaration: '.a { overflow: auto; }' },
    ])
  })

  it('finds an inline scrolling style in a component', () => {
    const text = "<div style={{ overflowY: 'auto' }} />\n<div style={{ overflow: 'hidden' }} />"
    expect(scrollFindingsOf([{ path: 'src/ui/A.tsx', text }])).toEqual([
      { path: 'src/ui/A.tsx', line: 1, declaration: "<div style={{ overflowY: 'auto' }} />" },
    ])
  })
})
