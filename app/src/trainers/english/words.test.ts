import { describe, expect, it } from 'vitest'
import { englishWords } from './words'

describe('words.ts — список слов тренажёра английского', () => {
  it('ровно 250 слов', () => {
    expect(englishWords.length).toBe(250)
  })

  it('все id уникальны', () => {
    const ids = englishWords.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('kind — только it или general', () => {
    for (const w of englishWords) {
      expect(['it', 'general']).toContain(w.kind)
    }
  })
})
