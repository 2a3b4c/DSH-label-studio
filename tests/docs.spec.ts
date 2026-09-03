import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Label Studio bilingual package documentation', () => {
  it('documents the bounded Session history and eight-endpoint channel in both root READMEs', () => {
    const english = read('README.md')
    const chinese = read('README.zh.md')

    expect(english).toContain('| `recentProjectLimit` | `10` |')
    expect(chinese).toContain('| `recentProjectLimit` | `10` |')
    expect(english).toContain('Eight endpoints')
    expect(chinese).toContain('八个端点')
    expect(english).not.toContain('Seven endpoints')
    expect(chinese).not.toContain('七个端点')
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

  it('documents binding state, on-demand inspection, passive browsing, and optional Webhooks', () => {
    for (const relativePath of ['README.md', 'README.zh.md', 'packages/client-ui/README.md', 'packages/client-ui/README.zh.md']) {
      const source = read(relativePath)
      expect(source).toContain('binding')
      expect(source).toMatch(/on-demand|按需/)
      expect(source).toMatch(/[Pp]assive|被动/)
      expect(source).toMatch(/unassigned|未匹配/)
    }
    for (const relativePath of ['packages/protocol/README.md', 'packages/protocol/README.zh.md']) {
      const source = read(relativePath)
      expect(source).toContain('binding')
      expect(source).toMatch(/inspection|检查/)
      expect(source).toContain('Webhook')
    }
  })

  it('documents uninstall persistence and reinstall reconciliation in the installation guide', () => {
    const source = read('INSTALL.zh.md')
    expect(source).toContain('binding')
    expect(source).toContain('重新安装')
    expect(source).toContain('不会停止外部 Label Studio')
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
