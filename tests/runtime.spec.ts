import { describe, expect, it, vi } from 'vitest'
import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { resolveConfig } from '../src/config.ts'
import { LabelStudioRuntime } from '../src/runtime.ts'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function fakeHandle(): {
  handle: SubprocessHandle
  terminate: ReturnType<typeof vi.fn>
  waitForExit: ReturnType<typeof vi.fn>
} {
  const terminate = vi.fn()
  const waitForExit = vi.fn().mockResolvedValue(true)
  const handle: SubprocessHandle = {
    pid: 42,
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    collected: {
      stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
    },
    done: new Promise(() => {}),
    terminate,
    waitForExit,
  }
  return { handle, terminate, waitForExit }
}

describe('LabelStudioRuntime', () => {
  it('does not spawn when an existing server is healthy', async () => {
    const spawn = vi.fn()
    const subprocess = { resolveExecutable: vi.fn(), spawn } as unknown as SubprocessRuntime
    const runtime = new LabelStudioRuntime(
      subprocess,
      resolveConfig({}),
      vi.fn().mockImplementation(() => Promise.resolve(response({ status: 'UP' }))),
    )

    await runtime.start()

    expect(spawn).not.toHaveBeenCalled()
    expect(await runtime.status()).toEqual({
      available: true,
      baseUrl: 'http://127.0.0.1:8080',
      managed: false,
    })
    await runtime.dispose()
    expect(spawn).not.toHaveBeenCalled()
  })

  it('starts Label Studio through the configured Python and owns its process', async () => {
    const { handle, terminate, waitForExit } = fakeHandle()
    const spawn = vi.fn().mockReturnValue(handle)
    const subprocess = {
      resolveExecutable: vi.fn().mockResolvedValue('/usr/local/bin/python'),
      spawn,
    } as unknown as SubprocessRuntime
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(response({ status: 'UP' }))
    const runtime = new LabelStudioRuntime(subprocess, resolveConfig({ startupTimeoutMs: 1_000 }), fetch)

    await runtime.start()

    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
      argv: [
        '/usr/local/bin/python', '-m', 'label_studio.server', 'start',
        '--no-browser', '--port', '8080', '--internal-host', '127.0.0.1',
      ],
      cwd: process.cwd(),
      graceMs: 5_000,
      env: {
        WEBHOOK_TIMEOUT: '5',
      },
    }))
    expect((await runtime.status()).managed).toBe(true)

    await runtime.dispose()
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(waitForExit).toHaveBeenCalledTimes(1)
  })

  it('starts an explicitly configured global Python without a shell', async () => {
    const { handle } = fakeHandle()
    const spawn = vi.fn().mockReturnValue(handle)
    const resolveExecutable = vi.fn().mockResolvedValue('C:\\Python313\\python.exe')
    const subprocess = {
      resolveExecutable,
      spawn,
    } as unknown as SubprocessRuntime
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(response({ status: 'UP' }))
    const runtime = new LabelStudioRuntime(
      subprocess,
      resolveConfig({
        launchMode: 'python',
        pythonExecutable: 'C:\\Python313\\python.exe',
        startupTimeoutMs: 1_000,
      }),
      fetch,
    )

    await runtime.start()

    expect(resolveExecutable).toHaveBeenCalledWith('C:\\Python313\\python.exe')
    expect(spawn).toHaveBeenCalledWith(expect.objectContaining({
      argv: [
        'C:\\Python313\\python.exe', '-m', 'label_studio.server', 'start', '--no-browser',
        '--port', '8080', '--internal-host', '127.0.0.1',
      ],
    }))
  })

  it('rejects an unavailable endpoint without spawning in external mode', async () => {
    const spawn = vi.fn()
    const resolveExecutable = vi.fn()
    const subprocess = { resolveExecutable, spawn } as unknown as SubprocessRuntime
    const runtime = new LabelStudioRuntime(
      subprocess,
      resolveConfig({ launchMode: 'external' }),
      vi.fn().mockRejectedValue(new TypeError('offline')),
    )

    await expect(runtime.start()).rejects.toThrow(
      'external service is unavailable at http://127.0.0.1:8080',
    )

    expect(resolveExecutable).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
    expect((await runtime.status()).available).toBe(false)
  })

  it('joins the owned process when startup times out', async () => {
    const { handle, terminate, waitForExit } = fakeHandle()
    const subprocess = {
      resolveExecutable: vi.fn().mockResolvedValue('/usr/local/bin/python'),
      spawn: vi.fn().mockReturnValue(handle),
    } as unknown as SubprocessRuntime
    const runtime = new LabelStudioRuntime(
      subprocess,
      resolveConfig({ startupTimeoutMs: 1 }),
      vi.fn().mockRejectedValue(new TypeError('offline')),
    )

    await expect(runtime.start()).rejects.toThrow('service did not become ready within 1ms')
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(waitForExit).toHaveBeenCalledTimes(1)
    expect((await runtime.status()).managed).toBe(false)
  })
})
