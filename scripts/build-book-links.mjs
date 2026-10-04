#!/usr/bin/env node
// ============================================================
// Строит book-links.json в корне репозитория — ссылки «открыть» для книг из
// картотеки (app/src/data/library.ts) на файлы владельца на Яндекс.Диске.
//
// Файл не коммитится (см. .gitignore) и не попадает в сборку сайта: владелец
// загружает его в свой браузер на скрытой странице /library/books/links,
// и ссылки видны только там (см. app/src/data/bookLinks.ts).
//
// Название книги в library.ts не имеет отдельного поля id — идентификатором
// служит само title (уникальность title проверена тестом library.test.ts).
// Поэтому ключ в links.json — title книги как есть.
//
// library.ts не импортируется как модуль (не тянуть TS-тулинг ради одного
// скрипта): элементы books читаются регэкспом по простому и стабильному
// формату файла — { title: '...', category: '...' } по одному на строку.
// Если формат файла изменится, регэксп перестанет находить книги — тогда
// сводка ниже покажет 0 сопоставлений, и это будет заметно сразу.
//
// Запуск: node scripts/build-book-links.mjs <локальная папка Диска> <путь папки на Диске>
// Подробности — в docs/library-book-links.md.
// ============================================================

import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const [, , sourceDirArg, diskPathArg] = process.argv

if (!sourceDirArg || !diskPathArg) {
  console.error('Использование: node scripts/build-book-links.mjs <локальная папка Диска> <путь этой папки на Диске>')
  console.error('Пример: node scripts/build-book-links.mjs "/mnt/c/.../Литература" "/Программирование/Литература"')
  process.exit(1)
}

const sourceDir = path.resolve(sourceDirArg)
// Путь на Диске без завершающего слэша — дальше сегменты добавляются с ведущим '/'.
const diskRootPath = diskPathArg.replace(/\/+$/, '')

const libraryPath = path.join(import.meta.dirname, '..', 'app', 'src', 'data', 'library.ts')
const outputPath = path.join(import.meta.dirname, '..', 'book-links.json')
// Прежнее место файла: всё из app/public уходит в сборку и становится доступно
// любому посетителю. Если файл там остался — удалить, чтобы он не выложился.
const publicLinksPath = path.join(import.meta.dirname, '..', 'app', 'public', 'links.json')

/**
 * Приводит название книги и имя файла к общему виду: убирает символы, запрещённые
 * в именах файлов Windows (: ? " < > | * / \), затем лишние пробелы и регистр.
 */
function normalizeTitle(title) {
  return title
    .replace(/[:?"<>|*/\\]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Кодирует каждый сегмент пути отдельно, сохраняя разделители '/' как есть. */
function encodePathSegments(pathname) {
  return pathname.split('/').map((segment) => (segment === '' ? '' : encodeURIComponent(segment))).join('/')
}

// --- 1. Названия книг из library.ts ---

const libraryText = readFileSync(libraryPath, 'utf8')
const bookPattern = /\{\s*title:\s*'((?:\\.|[^'\\])*)'\s*,\s*category:\s*'[A-Za-z]+'\s*\}/g

const bookTitles = []
for (const match of libraryText.matchAll(bookPattern)) {
  bookTitles.push(match[1].replace(/\\'/g, "'"))
}

if (bookTitles.length === 0) {
  console.error(`Не удалось найти ни одной книги в ${libraryPath} — проверь формат файла (изменился регэксп в скрипте?).`)
  process.exit(1)
}

// --- 2. Рекурсивный обход папки Диска: PDF и EPUB ---

/** @type {Map<string, { pdf?: string, epub?: string }>} normalizedTitle -> относительные пути файлов от sourceDir */
const filesByTitle = new Map()

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (ext !== '.pdf' && ext !== '.epub') continue

    const baseName = path.basename(entry.name, path.extname(entry.name))
    const key = normalizeTitle(baseName)
    const relativePath = path.relative(sourceDir, fullPath).split(path.sep).join('/')

    const entryRecord = filesByTitle.get(key) ?? {}
    const kind = ext === '.pdf' ? 'pdf' : 'epub'
    if (entryRecord[kind]) {
      console.warn(`Пропущен дубликат файла для «${baseName}»: ${relativePath} (уже есть ${entryRecord[kind]})`)
    } else {
      entryRecord[kind] = relativePath
    }
    filesByTitle.set(key, entryRecord)
  }
}

walk(sourceDir)

// --- 3. Сопоставление и сборка ссылок ---

const links = {}
const notFound = []

for (const title of bookTitles) {
  const key = normalizeTitle(title)
  const found = filesByTitle.get(key)
  const relativePath = found ? (found.pdf ?? found.epub) : undefined

  if (!relativePath) {
    notFound.push(title)
    continue
  }

  const diskFilePath = `${diskRootPath}/${relativePath}`
  const folder = path.posix.dirname(diskFilePath)
  const url = `https://disk.yandex.ru/client/disk${encodePathSegments(folder)}?idApp=client&dialog=slider&idDialog=${encodeURIComponent(`/disk${diskFilePath}`)}`

  links[title] = url
}

writeFileSync(outputPath, JSON.stringify(links, null, 2) + '\n', 'utf8')
if (existsSync(publicLinksPath)) {
  rmSync(publicLinksPath)
  console.log(`Удалён ${publicLinksPath}: ссылки больше не выкладываются на сервер.`)
}

// --- 4. Сводка ---

console.log(`Сопоставлено ${bookTitles.length - notFound.length} из ${bookTitles.length} книг.`)
console.log(`Записано: ${outputPath}`)
console.log('Загрузи этот файл в браузер на странице /library/books/links.')
if (notFound.length > 0) {
  console.log('Без файла:')
  for (const title of notFound) {
    console.log(`  - ${title}`)
  }
}
