// ============================================================
// Тест-сторож: комментарии и названия тестов в движке git-тренажёра описывают правило, а не
// историю правок (CLAUDE.md, «Язык»: «Комментарии описывают правило, а не историю правок»).
// Метки вроде "finding 1.3", "находка", "ревью", "круг N", "порция N", "до этой правки"
// ссылаются на процесс работы над кодом, а не на поведение git или тренажёра, и со временем
// превращаются в мусор, непонятный без доступа к истории обсуждений. Список меток — узкий и
// намеренно не расширяется здесь; пометки о сверке вида «сверено на git 2.53.0, 23.09.2026»
// метками не считаются и этим тестом не ловятся.
//
// Исходники читаются через import.meta.glob с суффиксом `?raw` — та же техника, что и в
// src/trainers/english/engine/sourcePurity.test.ts, без node:fs.
// ============================================================
import { describe, expect, it } from 'vitest'

const modules = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const SELF_FILE = './historyMarkers.test.ts'

const MARKERS = ['finding', 'находк', 'ревью', 'круг', 'порци', 'до этой правки']

/**
 * Ищет все вхождения маркера, которые начинаются на границе слова — предыдущий символ не
 * кириллическая/латинская буква (или начало строки). Так «вокруг» не считается вхождением
 * «круг» (см. shell.ts, где это слово встречается в обычном русском тексте).
 */
function findMarkerStarts(text: string, marker: string): number[] {
  const lower = text.toLowerCase()
  const needle = marker.toLowerCase()
  const positions: number[] = []
  let from = 0
  for (;;) {
    const at = lower.indexOf(needle, from)
    if (at === -1) break
    const before = at === 0 ? '' : lower[at - 1]
    if (before === '' || !/[а-яёa-z]/.test(before)) positions.push(at)
    from = at + 1
  }
  return positions
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** Комментарии (строчные и блочные) — единственное место в коде, где вообще может
 * накопиться история правок (сам код реализует только правило, а не рассказ о себе). */
function extractComments(text: string): { start: number; content: string }[] {
  const spots: { start: number; content: string }[] = []
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    spots.push({ start: m.index, content: m[0] })
  }
  return spots
}

/** Названия describe/it/test — от открывающей скобки вызова до начала колбэка `, () =>`
 * (в этой кодовой базе колбэки везде без параметров). Ловит и составные заголовки,
 * склеенные через "+" на нескольких строках. */
function extractTestNames(text: string): { start: number; content: string }[] {
  const spots: { start: number; content: string }[] = []
  const re = /\b(?:describe|it|test)\(([\s\S]*?),\s*(?:async\s*)?\(\)\s*=>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    spots.push({ start: m.index + m[0].indexOf(m[1]), content: m[1] })
  }
  return spots
}

describe('самопроверка детектора границы слова', () => {
  it('"вокруг" не считается вхождением "круг"', () => {
    expect(findMarkerStarts('забытые кавычки вокруг сообщения', 'круг')).toEqual([])
  })

  it('"круг 2" и "finding 1.3" ловятся', () => {
    expect(findMarkerStarts('второй круг 2 ревью подтвердил', 'круг')).not.toEqual([])
    expect(findMarkerStarts('см. finding 1.3', 'finding')).not.toEqual([])
  })
})

describe('движок git-тренажёра: комментарии и названия тестов не хранят историю правок', () => {
  for (const [file, content] of Object.entries(modules)) {
    if (file === SELF_FILE) continue

    it(`${file.replace(/^\.\//, '')} не содержит меток истории правок (${MARKERS.join(', ')})`, () => {
      const spots = [...extractComments(content), ...extractTestNames(content)]
      const problems: string[] = []
      for (const spot of spots) {
        for (const marker of MARKERS) {
          for (const hit of findMarkerStarts(spot.content, marker)) {
            const line = lineAt(content, spot.start + hit)
            problems.push(`${file}:${line} — метка "${marker}"`)
          }
        }
      }
      expect(problems, problems.join('\n')).toEqual([])
    })
  }
})
