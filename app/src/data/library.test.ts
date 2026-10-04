import { describe, expect, it } from 'vitest'
import { books, bookCategories } from './library'

describe('library.ts — каталог книг', () => {
  it('всего 263 книги', () => {
    expect(books.length).toBe(263)
  })

  it('категория каждой книги входит в объявленный список категорий', () => {
    const knownIds = new Set(bookCategories.map((c) => c.id))
    for (const book of books) {
      expect(knownIds.has(book.category)).toBe(true)
    }
  })

  it('нет повторяющихся названий', () => {
    const titles = books.map((b) => b.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})
