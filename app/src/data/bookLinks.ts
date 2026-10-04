// ============================================================
// Ссылки «открыть» у книг библиотеки: title книги -> url файла на Яндекс.Диске
// владельца. Ссылки не лежат ни в репозитории, ни на сервере: владелец загружает
// свой файл на скрытой странице /library/books/links, и он живёт только
// в localStorage этого браузера. Остальные посетители кнопок не видят.
// Файл собирает scripts/build-book-links.mjs, подробности — docs/library-book-links.md.
// ============================================================

export type BookLinks = Record<string, string>

export const BOOK_LINKS_STORAGE_KEY = 'valnotes.library.bookLinks'

/**
 * Ссылка принимается, только если ведёт на Яндекс.Диск по https: файл загружается
 * вручную, и произвольный адрес (например, javascript:) не должен попасть в href.
 */
const ALLOWED_URL_PREFIX = 'https://disk.yandex.ru/'

export type ParseBookLinksResult = { ok: true; links: BookLinks } | { ok: false }

/** Разбирает содержимое файла ссылок. Чистая функция — без DOM и localStorage. */
export function parseBookLinks(raw: string): ParseBookLinksResult {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false }

  const links: BookLinks = {}
  for (const [title, url] of Object.entries(data)) {
    if (typeof url !== 'string' || !url.startsWith(ALLOWED_URL_PREFIX)) return { ok: false }
    links[title] = url
  }
  return { ok: true, links }
}

/** Ссылки из этого браузера; пустой объект, если их нет, они битые или хранилище недоступно. */
export function readStoredBookLinks(): BookLinks {
  let raw: string | null
  try {
    raw = localStorage.getItem(BOOK_LINKS_STORAGE_KEY)
  } catch {
    return {}
  }
  if (!raw) return {}
  const result = parseBookLinks(raw)
  return result.ok ? result.links : {}
}

/** @returns false, если браузер не дал сохранить (приватный режим, квота) */
export function writeStoredBookLinks(links: BookLinks): boolean {
  try {
    localStorage.setItem(BOOK_LINKS_STORAGE_KEY, JSON.stringify(links))
    return true
  } catch {
    return false
  }
}

export function clearStoredBookLinks(): void {
  try {
    localStorage.removeItem(BOOK_LINKS_STORAGE_KEY)
  } catch {
    // хранилище недоступно — удалять нечего
  }
}
