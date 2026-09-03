// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildLabelStudioPageUrl } from '../src/client/page-url.ts'

describe('Label Studio controlled page URL', () => {
  it('builds projects, project, task, and saved-annotation pages from structured ids', () => {
    expect(buildLabelStudioPageUrl('http://127.0.0.1:8080', { view: 'projects' }))
      .toBe('http://127.0.0.1:8080/')
    expect(buildLabelStudioPageUrl('http://127.0.0.1:8080/', {
      view: 'project', projectId: 228 as never,
    })).toBe('http://127.0.0.1:8080/projects/228/data')
    expect(buildLabelStudioPageUrl('http://127.0.0.1:8080', {
      view: 'task', projectId: 228 as never, taskId: 486 as never,
    })).toBe('http://127.0.0.1:8080/projects/228/data?task=486')
    expect(buildLabelStudioPageUrl('http://127.0.0.1:8080', {
      view: 'task', projectId: 228 as never, taskId: 486 as never, annotationId: 66 as never,
    })).toBe('http://127.0.0.1:8080/projects/228/data?task=486&annotation=66')
  })

  it('rejects base paths, credentials, non-loopback origins, and invalid ids', () => {
    for (const baseUrl of [
      'https://label-studio.example.com',
      'http://127.0.0.1:8080/prefix',
      'http://user:secret@127.0.0.1:8080',
    ]) {
      expect(() => buildLabelStudioPageUrl(baseUrl, { view: 'projects' })).toThrow()
    }
    expect(() => buildLabelStudioPageUrl('http://127.0.0.1:8080', {
      view: 'project', projectId: 0 as never,
    })).toThrow()
  })
})
