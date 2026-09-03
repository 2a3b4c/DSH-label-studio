import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

interface LabelStudioClientManifest {
  name?: string
  exports?: Record<string, { default?: string } | string>
  dsh?: { client?: { inject?: string[]; platform?: string }; bundle?: unknown }
  files?: string[]
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Label Studio Client alpha.3 manifest', () => {
  it('uses the alpha.3 Client graph and no removed runtime package', () => {
    const manifest = JSON.parse(read('package.json')) as LabelStudioClientManifest

    expect(manifest.name).toBe('@deepseek-ai/dsh-client-ui-label-studio')
    expect(manifest.dsh?.client).toEqual({
      inject: [
        '@deepseek-ai/dsh-client-connection',
        '@deepseek-ai/dsh-client-locale',
        '@deepseek-ai/dsh-client-store',
        '@deepseek-ai/dsh-client-ui-renderer',
        '@deepseek-ai/dsh-client-ui-session',
        '@deepseek-ai/dsh-client-ui-theme',
      ],
      platform: 'web',
    })
    expect(manifest.devDependencies).toMatchObject({
      '@deepseek-ai/dsh-client-connection': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-client-store': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-client-ui-renderer': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-client-ui-session': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-label-studio-protocol': 'workspace:*',
    })
    expect(manifest.peerDependencies).toMatchObject({
      '@deepseek-ai/cordis': '^4.0.2',
      '@deepseek-ai/dsh-label-studio-protocol': 'workspace:*',
    })
    expect(manifest.peerDependencies).not.toHaveProperty('@deepseek-ai/dsh-client-runtime')
    expect(manifest.devDependencies).not.toHaveProperty('@deepseek-ai/dsh-client-runtime')
  })

  it('publishes one browser bundle and no Bundle patch', () => {
    const manifest = JSON.parse(read('package.json')) as LabelStudioClientManifest

    expect(manifest.exports?.['./client']).toMatchObject({ default: './lib/client.js' })
    expect(manifest.files).toContain('lib/client.js')
    expect(manifest.dsh).not.toHaveProperty('bundle')
  })

  it('uses alpha.3 store, generation, and SessionProvider APIs in source and artifact', () => {
    const source = [
      read('src/client/index.ts'),
      read('src/client/context-bridge.ts'),
      read('src/client/context-state.ts'),
      read('src/client/panel-state.ts'),
      read('src/client/layout/store.ts'),
      read('src/client/layout/LabelStudioRoot.tsx'),
    ].join('\n')
    const artifact = read('lib/client.js')

    expect(source).not.toContain('@deepseek-ai/dsh-client-runtime')
    expect(source).toContain("from '@deepseek-ai/dsh-client-store'")
    expect(source).toContain('connection.generation.getSnapshot()')
    expect(source).toContain('<SessionProvider>{renderSlot(\'details\', {})}</SessionProvider>')
    expect(artifact).not.toContain('@deepseek-ai/dsh-client-runtime')
    expect(artifact).toContain('require("@deepseek-ai/dsh-client-store")')
    expect(artifact).toContain('.generation.getSnapshot()')
  })
})
