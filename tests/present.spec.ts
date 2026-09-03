import { describe, expect, it } from 'vitest'
import {
  presentActiveTaskCall,
  presentActiveTaskMeta,
  presentCreateActivePredictionCall,
  presentFocusTaskCall,
} from '../src/present.ts'
import {
  labelStudioAnnotationId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'

describe('active-task presentation', () => {
  it('uses a generic read card with no file locations', () => {
    expect(presentActiveTaskCall()).toEqual({
      card: 'generic',
      title: 'Read active Label Studio task',
      kind: 'read',
      locations: [],
    })
  })

  it('projects only short identifiers and does not copy sample content', () => {
    const value = {
      project: { id: labelStudioProjectId(7), labelConfig: '<View>SECRET_LABEL_CONFIG</View>', showCollabPredictions: false },
      task: {
        id: labelStudioTaskId(11),
        projectId: labelStudioProjectId(7),
        data: { text: 'SECRET_SAMPLE' },
        annotations: [{
          id: labelStudioAnnotationId(13),
          projectId: labelStudioProjectId(7),
          taskId: labelStudioTaskId(11),
          result: ['SECRET_ANNOTATION'],
          updatedAt: 'now',
        }],
        predictions: [],
      },
    }
    const meta = presentActiveTaskMeta(value)
    expect(meta).toEqual({ projectId: 7, taskId: 11, annotationCount: 1, predictionCount: 0 })
    expect(JSON.stringify(meta)).not.toContain('SECRET_')
  })
})

describe('focus-task presentation', () => {
  it('uses only args to render a generic navigation card with no file locations', () => {
    expect(presentFocusTaskCall({ project_id: 228, task_id: 486, annotation_id: 731 })).toEqual({
      card: 'generic',
      title: 'Open Label Studio task 486',
      kind: 'execute',
      locations: [],
    })
  })
})

describe('active-prediction presentation', () => {
  it('uses only args to render a generic execution card with no file locations', () => {
    expect(presentCreateActivePredictionCall({
      result: [{ type: 'choices' }],
      model_version: 'dsh',
      score: 0.9,
    })).toEqual({
      card: 'generic',
      title: 'Create prediction for active Label Studio task',
      kind: 'execute',
      locations: [],
    })
  })
})
