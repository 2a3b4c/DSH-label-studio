import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  injectLabelStudioInspectionBridge,
  LABEL_STUDIO_FRAME_BRIDGE_PATH,
  renderLabelStudioFrameBridgeScript,
} from '../src/frame-bridge-script.ts'

const protocol = 'dsh-label-studio-page/v1' as const
const capability = 'frame-capability'

function execute(pathname: string, search = '') {
  let listener: ((event: { source: unknown; origin: string; data: unknown }) => void) | undefined
  const parent = { postMessage: vi.fn() }
  const sandbox = {
    parent,
    location: { pathname, search },
    addEventListener: vi.fn((kind: string, callback: typeof listener) => {
      if (kind === 'message') listener = callback
    }),
    URLSearchParams,
  }
  runInNewContext(renderLabelStudioFrameBridgeScript(protocol, capability), sandbox)
  if (listener === undefined) throw new Error('message listener missing')
  listener({
    source: parent,
    origin: 'http://127.0.0.1:4000',
    data: { protocol, capability, kind: 'inspect-current-page', inspectionId: 'inspection-a' },
  })
  return { parent, sandbox, listener }
}

describe('Label Studio iframe inspection script', () => {
  it.each([
    ['/', '', { kind: 'page', page: { view: 'projects' } }],
    ['/projects', '', { kind: 'page', page: { view: 'projects' } }],
    ['/projects/7/data', '', { kind: 'page', page: { view: 'project', projectId: 7 } }],
    ['/projects/7/data', '?task=11', { kind: 'page', page: { view: 'task', projectId: 7, taskId: 11 } }],
    ['/projects/7/data', '?task=11&annotation=13', {
      kind: 'page', page: { view: 'task', projectId: 7, taskId: 11, annotationId: 13 },
    }],
    ['/account/login', '', { kind: 'unsupported' }],
    ['/projects/0/data', '?task=bad', { kind: 'unsupported' }],
  ])('parses %s%s only when requested', (pathname, search, outcome) => {
    const { parent } = execute(pathname, search)
    expect(parent.postMessage).toHaveBeenCalledWith({
      protocol,
      kind: 'current-page',
      inspectionId: 'inspection-a',
      outcome,
    }, 'http://127.0.0.1:4000')
  })

  it('ignores non-parent, wrong-protocol, and malformed requests', () => {
    const { parent, listener } = execute('/projects')
    parent.postMessage.mockClear()
    for (const event of [
      { source: {}, origin: 'http://127.0.0.1:4000', data: { protocol, capability, kind: 'inspect-current-page', inspectionId: 'x' } },
      { source: parent, origin: 'http://127.0.0.1:4000', data: { protocol: 'wrong', capability, kind: 'inspect-current-page', inspectionId: 'x' } },
      { source: parent, origin: 'http://127.0.0.1:4000', data: { protocol, capability: 'wrong', kind: 'inspect-current-page', inspectionId: 'x' } },
      { source: parent, origin: 'http://127.0.0.1:4000', data: { protocol, capability, kind: 'inspect-current-page', inspectionId: '' } },
    ]) listener(event)
    expect(parent.postMessage).not.toHaveBeenCalled()
  })

  it('injects one same-origin external script without passive instrumentation', () => {
    const html = injectLabelStudioInspectionBridge('<html><body>Label Studio</body></html>', protocol)
    expect(html).toContain(`<script src="${LABEL_STUDIO_FRAME_BRIDGE_PATH}"></script></body>`)
    const source = renderLabelStudioFrameBridgeScript(protocol, capability)
    expect(source).toContain("addEventListener('message'")
    for (const forbidden of ['MutationObserver', 'setInterval', "addEventListener('click'", 'history.', 'fetch(', 'XMLHttpRequest']) {
      expect(source).not.toContain(forbidden)
    }
  })
})
