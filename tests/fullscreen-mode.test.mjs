import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientUrl = new URL('../packages/client-ui/lib/client.js', import.meta.url)
const localesUrl = new URL('../packages/client-ui/lib/types/client/locales.d.ts', import.meta.url)

test('Label Studio panel exposes a reversible fullscreen mode', async () => {
  const [client, locales] = await Promise.all([
    readFile(clientUrl, 'utf8'),
    readFile(localesUrl, 'utf8'),
  ])

  assert.match(client, /"panel\.fullscreen": "全屏标注"/)
  assert.match(client, /"panel\.exitFullscreen": "退出全屏"/)
  assert.match(client, /const \[fullscreen, setFullscreen\]/)
  assert.match(client, /event\.key === "Escape"/)
  assert.match(client, /"data-fullscreen": fullscreen \|\| void 0/)
  assert.match(client, /"aria-pressed": fullscreen/)
  assert.match(client, /position:fixed/)
  assert.match(client, /inset:0/)
  assert.match(locales, /readonly 'panel\.fullscreen': "全屏标注"/)
  assert.match(locales, /readonly 'panel\.exitFullscreen': "退出全屏"/)
  assert.match(client, /"panel\.binding": "当前绑定"/)
  assert.match(client, /"panel\.inspection\.inspecting": "检查中"/)
  assert.match(client, /"panel\.webhook\.unassigned": "事件未匹配当前会话"/)
})
