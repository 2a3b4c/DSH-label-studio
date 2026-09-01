import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rootUrl = new URL('../', import.meta.url)

async function read(relativePath) {
  return readFile(new URL(relativePath, rootUrl), 'utf8')
}

test('client artifact uses alpha.3 store and connection APIs', async () => {
  const [client, declarations] = await Promise.all([
    read('packages/client-ui/lib/client.js'),
    Promise.all([
      read('packages/client-ui/lib/types/client/index.d.ts'),
      read('packages/client-ui/lib/types/client/context-state.d.ts'),
      read('packages/client-ui/lib/types/client/context-bridge.d.ts'),
      read('packages/client-ui/lib/types/client/LabelStudioAction.d.ts'),
      read('packages/client-ui/lib/types/client/panel-state.d.ts'),
      read('packages/client-ui/lib/types/client/layout/store.d.ts'),
    ]).then(parts => parts.join('\n')),
  ])

  assert.doesNotMatch(client, /@deepseek-ai\/dsh-client-runtime/)
  assert.match(client, /require\("@deepseek-ai\/dsh-client-store"\)/)
  assert.doesNotMatch(client, /\.hostDescription\b/)
  assert.match(client, /\.generation\.getSnapshot\(\)/)
  assert.match(client, /function LabelStudioRoot\(\{[^}]*SessionProvider/)
  assert.match(client, /jsx\)\(SessionProvider, \{\s*children: renderSlot\("details", \{\}\)/)
  assert.doesNotMatch(declarations, /@deepseek-ai\/dsh-client-runtime/)
  assert.doesNotMatch(declarations, /hostDescription/)
})

test('published manifest declares the alpha.3 client graph', async () => {
  const manifest = JSON.parse(await read('package.json'))
  const inject = manifest.dsh.client.inject
  const peers = manifest.peerDependencies

  assert.equal(manifest.version, '0.2.0-alpha.1')
  assert.ok(inject.includes('@deepseek-ai/dsh-client-store'))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-renderer'))
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-session'))
  assert.ok(!inject.includes('@deepseek-ai/dsh-client-runtime'))
  assert.equal(peers['@deepseek-ai/dsh-client-store'], '^0.1.2-alpha.3')
  assert.equal(peers['@deepseek-ai/dsh-client-ui-renderer'], '^0.1.2-alpha.3')
  assert.equal(peers['@deepseek-ai/dsh-client-ui-session'], '^0.1.2-alpha.3')
  assert.equal(peers['@deepseek-ai/dsh-client-runtime'], undefined)
})
