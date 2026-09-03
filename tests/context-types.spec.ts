import { describe, expect, it } from 'vitest'
import {
  labelStudioAnnotationId,
  labelStudioContextLeaseId,
  labelStudioContextSourceId,
  labelStudioFocusCorrelationId,
  labelStudioNavigationSequence,
  labelStudioPredictionId,
  labelStudioProjectId,
  labelStudioTaskId,
} from '../src/context-types.ts'

const UUID = '4a2f3da2-9c74-4e63-989b-921a65fd6ed4'

describe('Label Studio context identifiers', () => {
  it('brands valid REST ids, sequences, and UUIDs without changing their wire values', () => {
    expect(labelStudioProjectId(1)).toBe(1)
    expect(labelStudioTaskId(2)).toBe(2)
    expect(labelStudioAnnotationId(3)).toBe(3)
    expect(labelStudioPredictionId(4)).toBe(4)
    expect(labelStudioNavigationSequence(0)).toBe(0)
    expect(labelStudioContextSourceId(UUID)).toBe(UUID)
    expect(labelStudioContextLeaseId(UUID)).toBe(UUID)
    expect(labelStudioFocusCorrelationId(UUID)).toBe(UUID)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid positive REST id %s',
    (value) => {
      expect(() => labelStudioProjectId(value)).toThrow(TypeError)
      expect(() => labelStudioTaskId(value)).toThrow(TypeError)
      expect(() => labelStudioAnnotationId(value)).toThrow(TypeError)
      expect(() => labelStudioPredictionId(value)).toThrow(TypeError)
    },
  )

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid navigation sequence %s',
    (value) => {
      expect(() => labelStudioNavigationSequence(value)).toThrow(TypeError)
    },
  )

  it.each(['', 'source-1', '00000000-0000-0000-0000-000000000000', `${UUID}x`])(
    'rejects invalid UUID %s',
    (value) => {
      expect(() => labelStudioContextSourceId(value)).toThrow(TypeError)
      expect(() => labelStudioContextLeaseId(value)).toThrow(TypeError)
      expect(() => labelStudioFocusCorrelationId(value)).toThrow(TypeError)
    },
  )
})
