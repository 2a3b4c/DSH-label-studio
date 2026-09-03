import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Label Studio bilingual package documentation', () => {
  it('documents the bounded Session history and seven-endpoint channel in both root READMEs', () => {
    const english = read('README.md')
    const chinese = read('README.zh.md')

    expect(english).toContain('| `recentProjectLimit` | `10` |')
    expect(chinese).toContain('| `recentProjectLimit` | `10` |')
    expect(english).toContain('Seven endpoints')
    expect(chinese).toContain('七个端点')
    expect(english).not.toContain('Six endpoints')
    expect(chinese).not.toContain('六个端点')
  })

  it('documents restoration, prompt isolation, and the deletion detection limit in both Client READMEs', () => {
    for (const relativePath of ['packages/client-ui/README.md', 'packages/client-ui/README.zh.md']) {
      const source = read(relativePath)
      expect(source).toContain('A→B→A')
      expect(source).toContain('deriveMessages()')
      expect(source).toContain('HTTP 404')
    }
  })

  it('documents durable page DTOs and page/commit in both protocol READMEs', () => {
    for (const relativePath of ['packages/protocol/README.md', 'packages/protocol/README.zh.md']) {
      const source = read(relativePath)
      expect(source).toContain('page/commit')
      expect(source).toContain('lease/open')
      expect(source).toContain('Session')
    }
  })

  it('uses standalone repository paths in the Session-context monitoring documents', () => {
    for (const relativePath of [
      'docs/superpowers/plans/2026-09-02-label-studio-session-context-interfaces.md',
      'docs/superpowers/plans/2026-09-02-label-studio-session-context-interfaces.zh.md',
      'docs/superpowers/plans/2026-09-02-label-studio-session-context-todo.md',
      'docs/superpowers/plans/2026-09-02-label-studio-session-context-todo.zh.md',
    ]) {
      const source = read(relativePath)
      expect(source).not.toMatch(/packages\/(?:extensions|util|client)\/label-studio/)
      expect(source).not.toContain('apps/web/tests/label-studio')
    }
  })
})
