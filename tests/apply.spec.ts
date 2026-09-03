import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('Label Studio Host browser assembly', () => {
  it('projects every browser synchronization field through the boot tap', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(source).toContain('contextOpenRetryMs: resolved.contextOpenRetryMs')
    expect(source).toContain('contextCloseTimeoutMs: resolved.contextCloseTimeoutMs')
    expect(source).toContain('eventHistorySize: resolved.eventHistorySize')
    expect(source).toContain('currentPageTimeoutMs: resolved.currentPageTimeoutMs')
    expect(source).toContain('htmlMaxBytes: resolved.frameProxyHtmlMaxBytes')
    expect(source).toContain('new LabelStudioCurrentPageBroker')
    expect(source).toContain('new LabelStudioOperationContextResolver')
    expect(source).toContain('resolver,\n    sessionContexts,')
    expect(source).toContain('new LabelStudioFrameProxy')
    expect(source).toContain('LabelStudioSessionContextStore.open')
    expect(source).toContain('recentProjectLimit: resolved.recentProjectLimit')
    expect(source).toContain('disposeStore: () => sessionContexts.close()')
    expect(source).toContain("'storageDomain'")
    expect(source).toContain('webServer.register({')
    expect(source).toContain("kind: 'exact'")
    expect(source).toContain('new LabelStudioWebhookRegistrar')
    expect(source).toContain('new LabelStudioWebhookBindingCoordinator')
    expect(source).toContain('webhookStatus')
    expect(source).toContain("resolved.webhookMode !== 'off'")
  })

  it('assembles exactly one RPC channel, Webhook route, frame proxy, and storage domain', () => {
    const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    expect(source.match(/new LabelStudioFrameProxy\(/g)).toHaveLength(1)
    expect(source.match(/registerLabelStudioContextRpc\(/g)).toHaveLength(1)
    expect(source.match(/webServer\.register\(\{/g)).toHaveLength(1)
    expect(source.match(/LabelStudioSessionContextStore\.open\(/g)).toHaveLength(1)
    expect(source).not.toMatch(/createSessionPersistence|new Connection|new Session\(/)
  })
})
