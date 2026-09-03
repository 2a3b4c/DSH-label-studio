import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/layout/LabelStudioRoot.module.css', import.meta.url)), 'utf8')
const panelCss = readFileSync(fileURLToPath(new URL('../src/client/LabelStudioPanel.module.css', import.meta.url)), 'utf8')

describe('replacement root CSS behavior', () => {
  it('pauses track and handle transitions during drag and reduced motion', () => {
    expect(css).toMatch(/\[data-dragging\][^{]*\{[^}]*transition:\s*none/s)
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*transition:\s*none/)
  })

  it('keeps the overlay layer click-through while entries opt back in', () => {
    expect(css).toMatch(/\.overlayLayer\s*\{[^}]*pointer-events:\s*none/s)
    expect(css).toMatch(/\.overlayLayer\s*>\s*\*\s*\{[^}]*pointer-events:\s*auto/s)
  })

  it('keeps binding and synchronization facts in the existing compact context bar', () => {
    expect(panelCss).toMatch(/\.contextFacts\s*\{[^}]*display:\s*flex/s)
    expect(panelCss).toMatch(/\.statusBadge\s*\{[^}]*border-radius:/s)
  })
})
