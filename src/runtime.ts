/** Managed local Label Studio process and readiness probe. */

import type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type { ResolvedConfig } from './config.ts'

/** Health facts safe to expose through the model tool. */
export interface LabelStudioStatus {
  available: boolean
  baseUrl: string
  managed: boolean
}

type Fetch = typeof globalThis.fetch

/** Owns at most one Label Studio process started by this plugin instance. */
export class LabelStudioRuntime {
  private handle: SubprocessHandle | undefined

  /**
   * @param subprocess - execution-world process provider.
   * @param config - resolved launcher and endpoint facts.
   * @param fetcher - HTTP implementation, injectable for deterministic tests.
   */
  constructor(
    private readonly subprocess: SubprocessRuntime,
    readonly config: ResolvedConfig,
    private readonly fetcher: Fetch = globalThis.fetch,
  ) {}

  /** Probe, optionally spawn, and wait until Label Studio is ready. */
  async start(): Promise<void> {
    if ((await this.status()).available) return
    if (this.config.launchMode === 'external') {
      throw new Error(`label-studio: external service is unavailable at ${this.config.baseUrl}`)
    }
    const url = new URL(this.config.baseUrl)
    const port = url.port === '' ? (url.protocol === 'https:' ? '443' : '80') : url.port
    this.handle = this.subprocess.spawn({
      argv: await this.resolveLaunchArgv(port),
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 65_536 },
        stderr: { maxBytes: 65_536 },
      },
      graceMs: this.config.shutdownGraceMs,
      env: {
        WEBHOOK_TIMEOUT: String(this.config.managedWebhookTimeoutSeconds),
      },
    })

    try {
      const deadline = Date.now() + this.config.startupTimeoutMs
      while (Date.now() < deadline) {
        if ((await this.status()).available) return
        const remaining = deadline - Date.now()
        await this.waitForNextProbe(Math.min(250, Math.max(1, remaining)))
      }
      const diagnostics = this.diagnostics()
      throw new Error(`label-studio: service did not become ready within ${this.config.startupTimeoutMs}ms${diagnostics}`)
    } catch (error) {
      await this.stopOwnedProcess()
      throw error
    }
  }

  /**
   * Read the unauthenticated Label Studio health endpoint.
   * @param signal - optional caller cancellation.
   * @returns current availability and process ownership.
   */
  async status(signal?: AbortSignal): Promise<LabelStudioStatus> {
    try {
      const response = await this.fetcher(`${this.config.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        ...signal === undefined ? {} : { signal },
      })
      if (!response.ok) return this.snapshot(false)
      const body = await response.json() as { status?: unknown }
      return this.snapshot(body.status === 'UP')
    } catch (_error) {
      if (signal?.aborted === true) throw signal.reason
      return this.snapshot(false)
    }
  }

  /** Terminate and join only the process this instance started. */
  async dispose(): Promise<void> {
    await this.stopOwnedProcess()
  }

  private async stopOwnedProcess(): Promise<void> {
    const handle = this.handle
    this.handle = undefined
    if (handle === undefined) return
    handle.terminate()
    await handle.waitForExit()
  }

  private async resolveLaunchArgv(port: string): Promise<string[]> {
    const tail = ['start', '--no-browser', '--port', port, '--internal-host', '127.0.0.1']
    switch (this.config.launchMode) {
      case 'python': {
        const executable = await this.subprocess.resolveExecutable(this.config.pythonExecutable)
        return [executable, '-m', 'label_studio.server', ...tail]
      }
      case 'external':
        throw new Error('label-studio: external launch mode cannot create a process')
      default:
        return assertNever(this.config.launchMode)
    }
  }

  private snapshot(available: boolean): LabelStudioStatus {
    return { available, baseUrl: this.config.baseUrl, managed: this.handle !== undefined }
  }

  private async waitForNextProbe(delayMs: number): Promise<void> {
    const handle = this.handle
    if (handle === undefined) return
    const exited = handle.done.then((outcome) => {
      throw new Error(
        'label-studio: managed process exited before readiness '
        + `(code ${String(outcome.exitCode)}, signal ${String(outcome.signal)})${this.diagnostics()}`,
      )
    })
    await Promise.race([
      new Promise<void>(resolve => setTimeout(resolve, delayMs)),
      exited,
    ])
  }

  private diagnostics(): string {
    const handle = this.handle
    if (handle === undefined) return ''
    const stdout = handle.collected.stdout?.readFrom(0).text.trim()
    const stderr = handle.collected.stderr?.readFrom(0).text.trim()
    const joined = [stdout, stderr].filter(part => part !== undefined && part !== '').join('\n')
    return joined === '' ? '' : `\n${joined}`
  }
}

function assertNever(value: never): never {
  throw new Error(`label-studio: unsupported launch mode ${String(value)}`)
}
