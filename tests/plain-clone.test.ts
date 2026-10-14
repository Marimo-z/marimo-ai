import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { plainClone } from '../src/utils/plain-clone'

describe('plainClone', () => {
  it('produces a structured-cloneable deep copy of reactive state', () => {
    const state = reactive({ name: 'Marimo', traits: ['好奇', '温柔'], nested: { n: 1 } })
    expect(() => structuredClone(state)).toThrow()

    const copy = plainClone(state)
    expect(() => structuredClone(copy)).not.toThrow()
    expect(copy).toEqual({ name: 'Marimo', traits: ['好奇', '温柔'], nested: { n: 1 } })

    copy.traits.push('x')
    expect(state.traits).toHaveLength(2)
  })
})
