/** Reconciled ownership of Label Studio project Webhooks. */

import { randomUUID } from 'node:crypto'
import type { LabelStudioApi, LabelStudioWebhookRegistration } from './api.ts'
import { LabelStudioHttpError, LabelStudioMutationOutcomeUnknownError } from './api.ts'
import type { LabelStudioSessionContextStore } from './session-context-store.ts'
import { encodeWebhookSecret } from './webhook-ingress.ts'
import type { LabelStudioWebhookEvent } from './webhook-payload.ts'

/** Explicit fields sent when creating the plugin-owned organization Webhook. */
export interface CreateWebhookInput {
  readonly url: string
  readonly actions: readonly LabelStudioWebhookEvent['action'][]
  readonly headers: Readonly<Record<string, string>>
  readonly is_active: true
  readonly project: LabelStudioWebhookRegistration['projectId']
  readonly send_for_all_actions: false
  readonly send_payload: true
}

/** Header identifying registrations owned by one durable plugin installation. */
export const LABEL_STUDIO_WEBHOOK_OWNER_HEADER = 'X-DSH-Label-Studio-Owner'
/** Header authenticating deliveries from the plugin-created registration. */
export const LABEL_STUDIO_WEBHOOK_SECRET_HEADER = 'X-DSH-Label-Studio-Webhook'

const CATEGORIES = [
  ['project update', ['PROJECT_UPDATED']],
  ['task creation', ['TASK_CREATED', 'TASKS_CREATED']],
  ['task deletion', ['TASK_DELETED', 'TASKS_DELETED']],
  ['annotation creation', ['ANNOTATION_CREATED', 'ANNOTATIONS_CREATED']],
  ['annotation update', ['ANNOTATION_UPDATED']],
  ['annotation deletion', ['ANNOTATION_DELETED', 'ANNOTATIONS_DELETED']],
] as const satisfies readonly [string, readonly LabelStudioWebhookEvent['action'][]][]

type Api = Pick<LabelStudioApi, 'listProjectIds' | 'listWebhookActions' | 'listWebhooks' | 'createWebhook' | 'deleteWebhook'>
type Store = Pick<LabelStudioSessionContextStore, 'ensureWebhookOwnerId'>

/** Maintains one plugin-owned Webhook for each existing Label Studio project. */
export class LabelStudioWebhookRegistrar {
  private installed: readonly LabelStudioWebhookRegistration[] = []
  private installing: Promise<readonly LabelStudioWebhookRegistration[]> | undefined

  /**
   * @param api - authenticated Webhook REST operations.
   * @param store - persistent singleton owner storage.
   * @param ownerCandidate - UUID generator used only when no durable owner exists.
   */
  constructor(
    private readonly api: Api,
    private readonly store: Store,
    private readonly ownerCandidate: () => string = randomUUID,
  ) {}

  /**
   * Reconcile stale owned registrations and install one current registration.
   * @param callbackUrl - DSH WebServer callback URL.
   * @param secret - in-memory delivery authentication value.
   * @param signal - package or caller cancellation.
   * @returns the exact installed registrations.
   */
  ensureInstalled(
    callbackUrl: string,
    secret: Uint8Array,
    signal: AbortSignal,
  ): Promise<readonly LabelStudioWebhookRegistration[]> {
    if (this.installed.length > 0) return Promise.resolve(this.installed)
    this.installing ??= this.install(callbackUrl, secret, signal).finally(() => { this.installing = undefined })
    return this.installing
  }

  /** Delete only the exact registrations installed by this process. */
  async dispose(signal: AbortSignal = new AbortController().signal): Promise<void> {
    const installed = this.installed
    this.installed = []
    for (const registration of installed) {
      try {
        await this.api.deleteWebhook(registration.id, signal)
      } catch (error) {
        if (error instanceof LabelStudioHttpError && error.status === 404) continue
        if (!(error instanceof LabelStudioMutationOutcomeUnknownError)) throw error
        const remaining = (await this.api.listWebhooks(signal)).some(item => item.id === registration.id)
        if (remaining) throw error
      }
    }
  }

  private async install(
    callbackUrl: string,
    secret: Uint8Array,
    signal: AbortSignal,
  ): Promise<readonly LabelStudioWebhookRegistration[]> {
    const ownerId = await this.store.ensureWebhookOwnerId(this.ownerCandidate())
    const supported = await this.api.listWebhookActions(signal)
    const actions = CATEGORIES.flatMap(([category, choices]) => {
      const selected = choices.filter(action => supported.has(action))
      if (selected.length === 0) throw new Error(`label-studio: Webhook does not support ${category}`)
      return selected
    })
    const projectIds = await this.api.listProjectIds(signal)
    await this.removeOwned(ownerId, signal)
    const installed: LabelStudioWebhookRegistration[] = []
    let recovered: readonly LabelStudioWebhookRegistration[] = []
    for (const projectId of projectIds) {
      const existing = recovered.find(item => item.ownerId === ownerId
        && item.url === callbackUrl && item.projectId === projectId)
      if (existing !== undefined) {
        installed.push(existing)
        continue
      }
      try {
        installed.push(await this.api.createWebhook({
          url: callbackUrl,
          actions,
          headers: {
            [LABEL_STUDIO_WEBHOOK_OWNER_HEADER]: ownerId,
            [LABEL_STUDIO_WEBHOOK_SECRET_HEADER]: encodeWebhookSecret(secret),
          },
          is_active: true,
          project: projectId,
          send_for_all_actions: false,
          send_payload: true,
        }, signal))
      } catch (error) {
        if (!(error instanceof LabelStudioMutationOutcomeUnknownError)) throw error
        recovered = (await this.api.listWebhooks(signal))
          .filter(item => item.ownerId === ownerId && item.url === callbackUrl)
        const registration = recovered.find(item => item.projectId === projectId)
        if (registration === undefined) throw error
        installed.push(registration)
      }
    }
    this.installed = Object.freeze(installed)
    return this.installed
  }

  private async removeOwned(ownerId: string, signal: AbortSignal): Promise<void> {
    for (const registration of await this.api.listWebhooks(signal)) {
      if (registration.ownerId !== ownerId) continue
      try {
        await this.api.deleteWebhook(registration.id, signal)
      } catch (error) {
        if (error instanceof LabelStudioHttpError && error.status === 404) continue
        if (!(error instanceof LabelStudioMutationOutcomeUnknownError)) throw error
        const stillPresent = (await this.api.listWebhooks(signal)).some(item => item.id === registration.id)
        if (stillPresent) throw error
      }
    }
  }
}
