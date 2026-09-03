import type { LabelStudioActiveContext } from '@deepseek-ai/dsh-label-studio-protocol'
import { describe, expect, it, vi } from 'vitest'
import {
  labelStudioContextSourceId,
  labelStudioFocusCorrelationId,
  labelStudioNavigationSequence,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'
import { LabelStudioContextRegistry } from '../src/context-registry.ts'

const SOURCE_A = labelStudioContextSourceId('4a2f3da2-9c74-4e63-989b-921a65fd6ed4')
const SOURCE_B = labelStudioContextSourceId('4215cbf9-7619-49ac-a087-db9c0755ff41')
const FOCUS_A = labelStudioFocusCorrelationId('bbaf7d97-0c06-43c6-9bd7-f74308b880dc')
const FOCUS_B = labelStudioFocusCorrelationId('684ba052-a843-4a8b-a2f1-f86da67d86bb')
const SESSION = 'session-label-studio' as LabelStudioActiveContext['sessionId']
const TARGET = Object.freeze({ projectId: labelStudioProjectId(228), taskId: labelStudioTaskId(486) })

function expectCode(run: () => unknown, code: string): void {
  expect(run).toThrow(expect.objectContaining({ code }))
}

describe('LabelStudioContextRegistry', () => {
  it('opens one cold-session lease and retries the same source idempotently', () => {
    let now = 1_000
    const registry = new LabelStudioContextRegistry(100, () => now)
    const first = registry.openLease(SESSION, SOURCE_A, 7)
    now = 1_010
    const retried = registry.openLease(SESSION, SOURCE_A, 99)

    expect(retried.lease.leaseId).toBe(first.lease.leaseId)
    expect(retried.lease.generation).toBe(1)
    expect(retried.lease.expiresAt).toBe(1_110)
    expect(retried.replayBaseline).toBe(7)
    expect(registry.getLease(SESSION)?.context).toEqual({ phase: 'vacant', targetRevision: 0 })
  })

  it('rejects another source until expiry, then increments the generation', () => {
    let now = 2_000
    const registry = new LabelStudioContextRegistry(100, () => now)
    const first = registry.openLease(SESSION, SOURCE_A, 0)

    expectCode(() => registry.openLease(SESSION, SOURCE_B, 0), 'lease-conflict')
    try {
      registry.openLease(SESSION, SOURCE_B, 0)
    } catch (error) {
      expect(error).toMatchObject({ retryAfterMs: 100 })
    }

    now = 2_100
    const replacement = registry.openLease(SESSION, SOURCE_B, 3)
    expect(replacement.lease.generation).toBe(2)
    expect(replacement.lease.leaseId).not.toBe(first.lease.leaseId)
    expectCode(() => registry.renew(first.lease.leaseId, first.lease.generation), 'lease-expired')
  })

  it('reserves browser targets monotonically and retries a lost response idempotently', () => {
    const registry = new LabelStudioContextRegistry(100)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    const reserved = registry.reserveBrowserTarget(lease.leaseId, lease.generation, labelStudioNavigationSequence(1), 0)
    const retry = registry.reserveBrowserTarget(lease.leaseId, lease.generation, labelStudioNavigationSequence(1), 0)

    expect(retry).toEqual(reserved)
    expect(registry.getLive(SESSION)).toBeUndefined()
    expectCode(
      () => registry.reserveBrowserTarget(lease.leaseId, lease.generation, labelStudioNavigationSequence(1), 1),
      'stale-revision',
    )
    expectCode(
      () => registry.reserveBrowserTarget(lease.leaseId, lease.generation, labelStudioNavigationSequence(2), 0),
      'stale-revision',
    )
    expectCode(
      () => registry.reserveBrowserTarget(lease.leaseId, lease.generation, labelStudioNavigationSequence(0), 1),
      'stale-revision',
    )
  })

  it('clears a browser target monotonically and recovers the exact lost response', () => {
    const registry = new LabelStudioContextRegistry(100)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    const reserved = registry.reserveBrowserTarget(
      lease.leaseId, lease.generation, labelStudioNavigationSequence(1), 0,
    )
    registry.publishTarget(lease.leaseId, lease.generation, reserved.targetRevision, TARGET)

    const cleared = registry.clearBrowserTarget(
      lease.leaseId, lease.generation, labelStudioNavigationSequence(2), 1,
    )
    expect(cleared).toEqual({ phase: 'vacant', targetRevision: 2 })
    expect(registry.clearBrowserTarget(
      lease.leaseId, lease.generation, labelStudioNavigationSequence(2), 1,
    )).toEqual(cleared)
    expect(registry.getLive(SESSION)).toBeUndefined()
    expectCode(
      () => registry.clearBrowserTarget(
        lease.leaseId, lease.generation, labelStudioNavigationSequence(2), 2,
      ),
      'stale-revision',
    )
    expectCode(
      () => registry.clearBrowserTarget(
        lease.leaseId, lease.generation + 1, labelStudioNavigationSequence(3), 2,
      ),
      'stale-generation',
    )
  })

  it('lets a newer browser clear supersede a pending focus reservation', () => {
    const registry = new LabelStudioContextRegistry(100)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    const focus = registry.reserveFocusTarget(lease.leaseId, lease.generation, FOCUS_A)

    expect(registry.clearBrowserTarget(
      lease.leaseId,
      lease.generation,
      labelStudioNavigationSequence(1),
      focus.targetRevision,
    )).toEqual({ phase: 'vacant', targetRevision: focus.targetRevision + 1 })
  })

  it('publishes only the current reservation and returns immutable snapshots', () => {
    const registry = new LabelStudioContextRegistry(100)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    const reserved = registry.reserveBrowserTarget(lease.leaseId, lease.generation, labelStudioNavigationSequence(1), 0)
    const published = registry.publishTarget(lease.leaseId, lease.generation, reserved.targetRevision, TARGET)
    const retried = registry.publishTarget(lease.leaseId, lease.generation, reserved.targetRevision, TARGET)

    expect(retried).toEqual(published)
    expect(registry.getLive(SESSION)).toEqual(published)
    expect(Object.isFrozen(published)).toBe(true)
    expect(Object.isFrozen(published.target)).toBe(true)
    expectCode(
      () => registry.publishTarget(lease.leaseId, lease.generation, reserved.targetRevision, {
        projectId: labelStudioProjectId(228), taskId: labelStudioTaskId(487),
      }),
      'stale-revision',
    )
  })

  it('reserves and retires an exact Host focus without changing its revision', () => {
    const registry = new LabelStudioContextRegistry(100)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    const reservation = registry.reserveFocusTarget(lease.leaseId, lease.generation, FOCUS_A)

    expect(registry.reserveFocusTarget(lease.leaseId, lease.generation, FOCUS_A)).toEqual(reservation)
    expect(registry.retireFocusTarget(lease.leaseId, lease.generation, FOCUS_A)).toEqual({
      phase: 'vacant', targetRevision: reservation.targetRevision,
    })
    expectCode(
      () => registry.retireFocusTarget(lease.leaseId, lease.generation, FOCUS_B),
      'focus-not-found',
    )
  })

  it('commits a Host focus and does not let retirement downgrade it', () => {
    const registry = new LabelStudioContextRegistry(100)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    const reservation = registry.reserveFocusTarget(lease.leaseId, lease.generation, FOCUS_A)
    const published = registry.publishTarget(lease.leaseId, lease.generation, reservation.targetRevision, TARGET)

    expect(registry.retireFocusTarget(lease.leaseId, lease.generation, FOCUS_A)).toEqual({
      phase: 'committed', targetRevision: reservation.targetRevision, target: TARGET,
    })
    expect(registry.inspectLease(lease.leaseId, lease.generation).context).toEqual({
      phase: 'committed', targetRevision: reservation.targetRevision, target: TARGET,
    })
    expect(registry.getLive(SESSION)).toEqual(published)
  })

  it('inspects without renewal and renews only after explicit validation', () => {
    let now = 4_000
    const registry = new LabelStudioContextRegistry(100, () => now)
    const { lease } = registry.openLease(SESSION, SOURCE_A, 0)
    now = 4_050

    expect(registry.inspectLease(lease.leaseId, lease.generation).lease.expiresAt).toBe(4_100)
    expect(registry.renew(lease.leaseId, lease.generation).lease.expiresAt).toBe(4_150)
    expectCode(() => registry.inspectLease(lease.leaseId, lease.generation + 1), 'stale-generation')
    expect(registry.closeLease(lease.leaseId, lease.generation + 1)).toBe(false)
    expect(registry.getLease(SESSION)).toBeDefined()
  })

  it('does not let an old lease write after explicit close and same-source takeover', () => {
    const registry = new LabelStudioContextRegistry(100)
    const first = registry.openLease(SESSION, SOURCE_A, 0)
    expect(registry.closeLease(first.lease.leaseId, first.lease.generation)).toBe(true)
    expect(registry.closeLease(first.lease.leaseId, first.lease.generation)).toBe(false)
    const second = registry.openLease(SESSION, SOURCE_A, 0)

    expect(second.lease.generation).toBe(2)
    expectCode(
      () => registry.reserveFocusTarget(first.lease.leaseId, first.lease.generation, FOCUS_A),
      'lease-expired',
    )
  })

  it('cleans deletion and lazy expiry before notifying isolated listeners', () => {
    let now = 3_000
    const registry = new LabelStudioContextRegistry(100, () => now)
    const observed: Array<{ sessionId: string; visible: boolean }> = []
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    registry.onLeaseEnded(() => { throw new Error('listener failed') })
    registry.onLeaseEnded((sessionId) => {
      observed.push({ sessionId, visible: registry.getLease(sessionId) !== undefined })
    })
    registry.openLease(SESSION, SOURCE_A, 0)

    now = 3_100
    expect(registry.getLease(SESSION)).toBeUndefined()
    expect(observed).toEqual([{ sessionId: SESSION, visible: false }])
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('unsubscribes listeners and clears every lease on dispose', () => {
    const registry = new LabelStudioContextRegistry(100)
    const ended = vi.fn<(sessionId: LabelStudioActiveContext['sessionId']) => void>()
    const unsubscribe = registry.onLeaseEnded(ended)
    registry.openLease(SESSION, SOURCE_A, 0)
    unsubscribe()
    registry.deleteSession(SESSION)
    expect(ended).not.toHaveBeenCalled()

    registry.openLease(SESSION, SOURCE_A, 0)
    registry.dispose()
    expect(registry.getLease(SESSION)).toBeUndefined()
    expectCode(() => registry.openLease(SESSION, SOURCE_A, 0), 'invalid-request')
  })

  it('deletes a Session before notification and rejects reentrant recreation', () => {
    const registry = new LabelStudioContextRegistry(100)
    registry.openLease(SESSION, SOURCE_A, 0)
    const recreations: string[] = []
    registry.onLeaseEnded((sessionId) => {
      expect(registry.getLease(sessionId)).toBeUndefined()
      try {
        registry.openLease(sessionId, SOURCE_B, 0)
      } catch (error) {
        recreations.push((error as { code: string }).code)
      }
    })

    registry.deleteSession(SESSION)
    expect(recreations).toEqual(['invalid-request'])
    expect(registry.getLease(SESSION)).toBeUndefined()
    expect(registry.openLease(SESSION, SOURCE_B, 0).lease.generation).toBe(1)
  })

  it('notifies each active Session exactly once during dispose', () => {
    const other = 'session-label-studio-other' as LabelStudioActiveContext['sessionId']
    const registry = new LabelStudioContextRegistry(100)
    const ended = vi.fn<(sessionId: LabelStudioActiveContext['sessionId']) => void>()
    registry.onLeaseEnded(ended)
    registry.openLease(SESSION, SOURCE_A, 0)
    registry.openLease(other, SOURCE_A, 0)

    registry.dispose()
    registry.dispose()
    expect(ended.mock.calls.map(([sessionId]) => sessionId)).toEqual([SESSION, other])
  })
})
