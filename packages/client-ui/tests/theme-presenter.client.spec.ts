// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { DARK_ATTRIBUTE, LabelStudioThemePresenter } from '../src/client/layout/theme-presenter.ts'

function snapshot(colorScheme: 'light' | 'dark', tokens: Record<string, string> = {}): ThemeSnapshot {
  const active = { id: `test-${colorScheme}`, colorScheme, tokens }
  return { preference: colorScheme, active, themes: [active], revision: 1 }
}

beforeEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((node) => { node.remove() })
  document.documentElement.style.removeProperty('color-scheme')
  document.body.removeAttribute(DARK_ATTRIBUTE)
  document.body.removeAttribute('style')
})

describe('Label Studio theme presenter', () => {
  it('applies resolved scheme and replaces its token set', () => {
    const presenter = new LabelStudioThemePresenter()
    presenter.apply(snapshot('dark', { '--plugin-a': 'one' }))
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(true)
    expect(document.body.style.getPropertyValue('--plugin-a')).toBe('one')
    const meta = document.head.querySelector('meta[name="theme-color"]')
    presenter.apply(snapshot('light', { '--plugin-b': 'two' }))
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
    expect(document.body.style.getPropertyValue('--plugin-a')).toBe('')
    expect(document.body.style.getPropertyValue('--plugin-b')).toBe('two')
    expect(document.head.querySelector('meta[name="theme-color"]')).toBe(meta)
  })

  it('removes only writes owned by this presenter', () => {
    const foreign = document.createElement('meta'); foreign.name = 'theme-color'; foreign.dataset.foreign = ''; document.head.append(foreign)
    document.body.style.setProperty('--foreign', 'keep')
    const presenter = new LabelStudioThemePresenter()
    presenter.apply(snapshot('dark', { '--owned': 'remove' }))
    presenter.dispose()
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute(DARK_ATTRIBUTE)).toBe(false)
    expect(document.body.style.getPropertyValue('--owned')).toBe('')
    expect(document.body.style.getPropertyValue('--foreign')).toBe('keep')
    expect(foreign.isConnected).toBe(true)
  })
})
