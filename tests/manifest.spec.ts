import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

interface LabelStudioHostManifest {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  exports?: Record<string, unknown>
  files?: string[]
  dsh?: { client?: unknown; bundle?: { patch?: string } }
}

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8')
}

describe('Label Studio Host and Bundle manifest', () => {
  it('publishes the browser Client from the standalone root package', () => {
    const manifest = JSON.parse(read('package.json')) as LabelStudioHostManifest

    expect(manifest.exports).toHaveProperty('./client')
    expect(manifest.files).toContain('packages/client-ui/lib/client.js')
    expect(manifest.dsh?.client).toBeDefined()
    expect(manifest.peerDependencies).not.toHaveProperty('@deepseek-ai/dsh-client-runtime')
  })

  it('declares every alpha.3 Host service and the shared protocol', () => {
    const manifest = JSON.parse(read('package.json')) as LabelStudioHostManifest

    expect(manifest.dependencies?.['@deepseek-ai/dsh-label-studio-protocol']).toBe('workspace:*')
    expect(manifest.peerDependencies).toMatchObject({
      '@deepseek-ai/dsh-client-connection': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-session': '^0.1.2-alpha.3',
      '@deepseek-ai/dsh-session-persistence': '^0.1.2-alpha.3',
    })
  })

  it('publishes the atomic replacement patch with Python and external launch modes', () => {
    const manifest = JSON.parse(read('package.json')) as LabelStudioHostManifest

    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.exports).toHaveProperty('./cordis.patch.yml', './cordis.patch.yml')
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(existsSync(resolve(root, 'cordis.patch.yml'))).toBe(true)
    const patch = read('cordis.patch.yml')
    expect(patch).toMatch(/- id: ui-layout\n\s+disabled: true/)
    expect(patch.match(/name: 'dsh-label-studio-workbench'/g)).toHaveLength(1)
    expect(patch).toContain('refreshTokenCredential: LABEL_STUDIO_PAT')
    expect(patch).toContain('recentProjectLimit: 10')
    expect(patch).toContain("launchMode: !!js process.env.DSH_LABEL_STUDIO_LAUNCH_MODE ?? 'python'")
    expect(patch).toContain("pythonExecutable: !!js process.env.DSH_LABEL_STUDIO_PYTHON_EXECUTABLE ?? 'python'")
    expect(patch).not.toMatch(/condaExecutable:|condaEnvironment:|labelStudioExecutable:/)
  })

  it('keeps the alpha.3 source overlay aligned with the published Bundle defaults', () => {
    const overlay = read('tests/fixtures/alpha3-web.overlay.yml')
    const patch = read('cordis.patch.yml')

    for (const field of [
      'baseUrl:', 'launchMode:', 'pythonExecutable:', 'refreshTokenCredential:',
      'recentProjectLimit: 10', 'currentPageTimeoutMs: 5000',
      'frameProxyHtmlMaxBytes: 2097152', 'webhookMode: optional',
      'webhookPath: /api/label-studio/webhook', 'webhookMaxBodyBytes: 1048576',
      'managedWebhookTimeoutSeconds: 5',
    ]) {
      expect(overlay).toContain(field)
      expect(patch).toContain(field)
    }
  })

  it('composes one Host row and one browser Client without shipping another DSH core', () => {
    const manifest = JSON.parse(read('package.json')) as LabelStudioHostManifest
    const patch = read('cordis.patch.yml')

    expect(patch.match(/name: 'dsh-label-studio-workbench'/g)).toHaveLength(1)
    expect(patch.match(/- id: ui-layout/g)).toHaveLength(1)
    expect(manifest.dsh?.client).toBeDefined()
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-agent-loop')
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-session-persistence')
    expect(manifest.dependencies).not.toHaveProperty('@deepseek-ai/dsh-client-connection')
  })

  it('builds an artifact with only Python and external launch modes', () => {
    const host = read('lib/index.js')

    expect(host).toContain('DEFAULT_LABEL_STUDIO_LAUNCH_MODE = "python"')
    expect(host).toContain('"label_studio.server"')
    expect(host).toContain('external service is unavailable')
    expect(host).not.toContain('case "conda"')
    expect(host).not.toContain('case "executable"')
  })
})
