import { describe, expect, it, vi } from 'vitest'
import { disposeLabelStudioResources, LabelStudioOperationGate } from '../src/lifecycle.ts'

describe('LabelStudioOperationGate', () => {
  it('combines caller cancellation and removes settled operations', async () => {
    const gate = new LabelStudioOperationGate()
    const caller = new AbortController()
    const observed = vi.fn<(signal: AbortSignal) => Promise<string>>(async (signal) => {
      await new Promise<undefined>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('caller stopped'))
        }, { once: true })
      })
      return 'unreachable'
    })
    const pending = gate.run(caller.signal, observed)
    const reason = new Error('caller stopped')
    caller.abort(reason)

    await expect(pending).rejects.toBe(reason)
    await expect(gate.drain()).resolves.toBeUndefined()
  })

  it('aborts the in-flight snapshot and rejects work after beginClose', async () => {
    const gate = new LabelStudioOperationGate()
    const entered = Promise.withResolvers<AbortSignal>()
    const pending = gate.run(new AbortController().signal, async (signal) => {
      entered.resolve(signal)
      await new Promise<undefined>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('package stopped'))
        }, { once: true })
      })
      return 'unreachable'
    })
    const operationSignal = await entered.promise

    gate.beginClose()
    expect(operationSignal.aborted).toBe(true)
    await expect(gate.run(new AbortController().signal, async () => 'late'))
      .rejects.toThrow('closing')
    await expect(gate.drain()).resolves.toBeUndefined()
    await expect(pending).rejects.toThrow('closing')
  })

  it('unregisters ingress before drain and releases state only after quiescence', async () => {
    const order: string[] = []
    const operations = new LabelStudioOperationGate()
    const operation = Promise.withResolvers<undefined>()
    const entered = Promise.withResolvers<undefined>()
    const pending = operations.run(new AbortController().signal, async () => {
      entered.resolve(undefined)
      return operation.promise
    })
    await entered.promise
    const shutdown = disposeLabelStudioResources({
      operations,
      disposeTools: () => { order.push('tools') },
      disposeBrowser: async () => { order.push('channel') },
      disposeBroker: async () => { order.push('broker') },
      disposeRegistry: () => { order.push('registry') },
      disposeRuntime: async () => { order.push('runtime') },
      disposeStore: async () => { order.push('store') },
    })
    await Promise.resolve()
    expect(order).toEqual(['tools', 'channel'])
    operation.resolve(undefined)
    await pending
    await shutdown
    expect(order).toEqual(['tools', 'channel', 'broker', 'registry', 'runtime', 'store'])
  })

  it('closes the durable store even when runtime teardown fails', async () => {
    const order: string[] = []
    await expect(disposeLabelStudioResources({
      operations: new LabelStudioOperationGate(),
      disposeTools: () => { order.push('tools') },
      disposeBroker: async () => { order.push('broker') },
      disposeRegistry: () => { order.push('registry') },
      disposeRuntime: async () => { order.push('runtime'); throw new Error('runtime teardown failed') },
      disposeStore: async () => { order.push('store') },
    })).rejects.toThrow('runtime teardown failed')
    expect(order).toEqual(['tools', 'broker', 'registry', 'runtime', 'store'])
  })
})
