// ============================================================
// Раздел 6: есть ли у заголовков `@@` в выводе git show строка-ориентир, которую печатает
// настоящий git, а тренажёр нет (inspectDiff.ts, упрощение 4).
//
// Правило git (сверено на git 2.53.0): после номеров строк в заголовке стоит ближайшая выше
// фрагмента строка СТАРОГО файла, которая начинается с латинской буквы, «_» или «$». Кириллица,
// цифра, «#» и пробел в начале строки не подходят. Хвостовые пробелы git отбрасывает, длинную
// строку обрезает по 80 БАЙТАМ (UTF-8), а не по символам; многобайтовый символ, не уместившийся
// целиком, отбрасывается (сверено на git 2.53.0: «f» + 40 букв «ж» = 81 байт -> показано 79 байт).
// После обрезки хвостовые пробелы снова отбрасываются.
// Здесь решается только «есть ли такая строка и какая»: сам заголовок остаётся прежним.
// ============================================================
import type { FileTree } from './searchTypes'

const FUNCTION_LINE_START = /^[A-Za-z_$]/
const DIFF_FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+/
/** Предел длины строки-ориентира в БАЙТАХ. */
const MAX_FUNCTION_CONTEXT_BYTES = 80

/** Обрезка по байтам UTF-8 без разрезания символа пополам. */
function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= maxBytes) return text
  let cut = maxBytes
  // Байты 0x80..0xBF — продолжение символа: отступаем до его начала.
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut--
  return new TextDecoder().decode(bytes.slice(0, cut))
}

/**
 * @param oldTree дерево, с которым сравнивали (до изменения)
 * @param diffText вывод diff в формате git
 * @returns `null`, если ни у одного заголовка `@@` настоящий git не дописал бы строку-ориентир;
 * иначе пример (строка первого такого заголовка, обрезанная как у git)
 */
export function hunkFunctionContext(oldTree: FileTree, diffText: string): { example: string | null } | null {
  let oldLines: string[] = []
  for (const line of diffText.split('\n')) {
    const file = DIFF_FILE_HEADER.exec(line)
    if (file) {
      oldLines = Object.prototype.hasOwnProperty.call(oldTree, file[1]) ? oldTree[file[1]].split('\n') : []
      continue
    }
    const hunk = HUNK_HEADER.exec(line)
    if (!hunk) continue
    const oldStart = Number(hunk[1])
    const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2])
    if (oldCount === 0) continue
    for (let i = oldStart - 2; i >= 0; i--) {
      if (FUNCTION_LINE_START.test(oldLines[i])) {
        return { example: truncateUtf8(oldLines[i], MAX_FUNCTION_CONTEXT_BYTES).trimEnd() }
      }
    }
  }
  return null
}
