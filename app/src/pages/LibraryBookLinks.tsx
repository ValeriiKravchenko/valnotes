import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router'
import { site } from '@/data/site'
import { clearStoredBookLinks, parseBookLinks, readStoredBookLinks, writeStoredBookLinks } from '@/data/bookLinks'

/** Итог последнего действия на странице — какое сообщение показать под кнопками. */
type Notice = { kind: 'loaded'; count: number } | { kind: 'invalid' } | { kind: 'saveFailed' } | { kind: 'cleared' }

/**
 * Скрытая страница: владелец загружает свой файл ссылок «открыть» в этот браузер.
 * Ссылки не уходят на сервер — остаются в localStorage (см. data/bookLinks.ts).
 */
export default function LibraryBookLinks() {
  const [storedCount, setStoredCount] = useState(() => Object.keys(readStoredBookLinks()).length)
  const [notice, setNotice] = useState<Notice | null>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    // сброс, чтобы повторный выбор того же файла снова вызвал onChange
    input.value = ''
    if (!file) return

    const result = parseBookLinks(await file.text())
    if (!result.ok) {
      setNotice({ kind: 'invalid' })
      return
    }
    if (!writeStoredBookLinks(result.links)) {
      setNotice({ kind: 'saveFailed' })
      return
    }
    const count = Object.keys(result.links).length
    setStoredCount(count)
    setNotice({ kind: 'loaded', count })
  }

  function handleClear() {
    clearStoredBookLinks()
    setStoredCount(0)
    setNotice({ kind: 'cleared' })
  }

  const texts = site.libraryBookLinks
  const noticeText =
    notice === null
      ? null
      : notice.kind === 'loaded'
        ? texts.loaded(notice.count)
        : notice.kind === 'invalid'
          ? texts.invalidFile
          : notice.kind === 'saveFailed'
            ? texts.saveFailed
            : texts.cleared

  return (
    <div>
      <Link to="/library/books" className="label">
        {texts.backToBooks}
      </Link>
      <h1 className="mt-6 text-2xl uppercase tracking-tight text-white">{texts.heading}</h1>
      <p className="mt-4 max-w-2xl text-[var(--muted)]">{texts.intro}</p>

      <p className="mt-8 text-white">{storedCount > 0 ? texts.storedCount(storedCount) : texts.noneStored}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="label nav-link cursor-pointer border b px-3 py-2">
          {texts.fileLabel}
          <input type="file" accept="application/json,.json" onChange={handleFile} className="sr-only" />
        </label>
        {storedCount > 0 && (
          <button type="button" onClick={handleClear} className="label nav-link border b px-3 py-2">
            {texts.clear}
          </button>
        )}
      </div>

      {noticeText && (
        <p role="status" className="mt-4 text-[var(--muted)]">
          {noticeText}
        </p>
      )}
    </div>
  )
}
