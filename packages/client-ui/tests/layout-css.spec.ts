import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/layout/LabelStudioRoot.module.css', import.meta.url)), 'utf8')
const panelCss = readFileSync(fileURLToPath(new URL('../src/client/LabelStudioPanel.module.css', import.meta.url)), 'utf8')

describe('replacement root CSS behavior', () => {
  it('uses flexible columns and keeps drag handles in normal flow', () => {
    expect(css).toMatch(/\.frame\s*\{[^}]*display:\s*flex/s)
    expect(css).not.toMatch(/grid-template-/)
    expect(css).toMatch(/\.conversationCol\s*\{[^}]*flex:\s*1 1 0/s)
    expect(css).toMatch(/\.handle\s*\{[^}]*flex:\s*0 0 8px/s)
    expect(css).not.toMatch(/\.handle\s*\{[^}]*position:/s)
  })

  it('keeps the overlay layer click-through while entries opt back in', () => {
    expect(css).toMatch(/\.overlayLayer\s*\{[^}]*pointer-events:\s*none/s)
    expect(css).toMatch(/\.overlayLayer\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto/s)
  })

  it('keeps context and navigation inside one responsive flex title row', () => {
    expect(panelCss).toMatch(/\.header\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s)
    expect(panelCss).toMatch(/\.compactBar\s*\{[^}]*display:\s*contents/s)
    expect(panelCss).not.toMatch(/\.compactBar\s*\{[^}]*border-bottom:/s)
    expect(panelCss).toMatch(/\.contextSummary\s*\{[^}]*min-width:\s*0/s)
    expect(panelCss).not.toMatch(/\.healthIndicator\s*\{[^}]*max-width:/s)
    expect(panelCss).toMatch(/\.popover\s*\{[^}]*display:\s*flex/s)
    expect(panelCss).not.toMatch(/\.popover\s*\{[^}]*position:/s)
    expect(panelCss).not.toMatch(/\.locatorPopover\s*\{[^}]*width:/s)
    expect(panelCss).toMatch(/\.locatorPopover label\s*\{[^}]*flex:\s*1 1 0/s)
  })
})
