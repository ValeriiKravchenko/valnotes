import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { site } from '@/data/site'
import { books, bookCategories, bookCategoryLabel } from '@/data/library'
import type { BookCategoryId } from '@/data/library'
import { readStoredBookLinks } from '@/data/bookLinks'

export default function LibraryBooks() {
  const [query, setQuery] = useState('')
  const [activeCategories, setActiveCategories] = useState<Set<BookCategoryId>>(new Set())
  // Ссылки «открыть» есть только в браузере владельца, куда он загрузил свой файл (см. data/bookLinks.ts).
  const [bookLinks] = useState(readStoredBookLinks)

  function toggleCategory(id: BookCategoryId) {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearFilters() {
    setQuery('')
    setActiveCategories(new Set())
  }

  // Пустой набор категорий = фильтр не сужает список (показываем все).
  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return books
      .filter((book) => activeCategories.size === 0 || activeCategories.has(book.category))
      .filter((book) => normalizedQuery === '' || book.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  }, [query, activeCategories])

  return (
    <div>
      <Link to="/library" className="label">
        {site.libraryBooks.backToLibrary}
      </Link>
      <h1 className="mt-6 text-2xl uppercase tracking-tight text-white">{site.libraryBooks.heading}</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">{site.libraryBooks.intro}</p>

      <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-start">
        <section className="min-w-0 flex-1 space-y-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={site.libraryBooks.searchPlaceholder}
            aria-label={site.libraryBooks.searchAriaLabel}
            spellCheck={false}
            autoComplete="off"
            className="w-full border b bg-transparent px-3 py-2 text-white outline-none placeholder:text-[var(--muted)]"
          />
          <p className="label">{site.libraryBooks.resultsCount(filteredBooks.length, books.length)}</p>
          {filteredBooks.length === 0 ? (
            <p className="text-[var(--muted)]">{site.libraryBooks.emptyResult}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] border b">
              {filteredBooks.map((book) => (
                <li key={book.title} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <span className="text-white">{book.title}</span>
                  <span className="flex items-baseline gap-3 whitespace-nowrap">
                    {bookLinks[book.title] && (
                      <a
                        href={bookLinks[book.title]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="label nav-link"
                      >
                        {site.libraryBooks.openBook}
                      </a>
                    )}
                    <span className="label accent">{bookCategoryLabel(book.category)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="w-full shrink-0 border b md:w-64">
          <div className="label flex items-center justify-between gap-3 border-b b px-4 py-2">
            <span>{site.libraryBooks.filterTitle}</span>
            <button type="button" onClick={clearFilters} className="nav-link">
              {site.libraryBooks.clearFilters}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {bookCategories.map((category) => {
              const active = activeCategories.has(category.id)
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  aria-pressed={active}
                  className={`label border px-2 py-1 ${active ? 'accent border-[var(--accent)]' : 'b'}`}
                >
                  {category.label}
                </button>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}
