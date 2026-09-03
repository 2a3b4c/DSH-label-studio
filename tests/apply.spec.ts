import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('Label Studio Host browser assembly', () => {
  it('projects every browser synchronization field through the boot tap', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(source).toContain('contextOpenRetryMs: resolved.contextOpenRetryMs')
    expect(source).toContain('contextCloseTimeoutMs: resolved.contextCloseTimeoutMs')
    expect(source).toContain('eventHistorySize: resolved.eventHistorySize')
    expect(source).toContain('LabelStudioSessionContextStore.open')
    expect(source).toContain('recentProjectLimit: resolved.recentProjectLimit')
    expect(source).toContain('disposeStore: () => sessionContexts.close()')
    expect(source).toContain("'storageDomain'")
  })
})
