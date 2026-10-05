// ============================================================
// Сторожевой тест границы области (target.md, часть III, правило 1): формы, которые настоящий git
// принимает, а раздел тренажёра не разбирает, получают отказ с TRAINER_MARKER, а не выдуманную
// ошибку git. Выдуманная ошибка выглядит убедительно, поэтому прямые литералы git-ошибок про
// ссылки и refspec в исходниках движка разрешены только там, где ответ настоящий.
//
// Белый список ниже — перечень этих мест: «файл → литерал → допустимое число вхождений». Новое
// вхождение в другом файле или рост числа в перечисленном файле, а также уменьшение числа
// (список устарел) дают красный тест: список обновляют сознательно, проверив ответ на настоящем git.
//
// Функция ambiguousArgument продублирована в inspectCommands.ts, undoCommands.ts и
// searchCommands.ts (общий помощник не выделен), поэтому литерал «ambiguous argument» в этих
// трёх файлах — по одному вхождению в определении; её вызовы литерала не содержат.
//
// Комментарии (`//`, `/* */`, JSDoc) в счёт не входят: пользователю они не выводятся. Литерал
// внутри строки или шаблонной строки считается кодом, даже если рядом есть `//`.
//
// Тест НЕ отличает настоящую ошибку от выдуманной на новой форме: это делают тесты разделов 1–6
// (outOfScopeSection*.test.ts). Здесь только граница: где такие литералы вообще допустимы.
//
// Исходники читаются через import.meta.glob с суффиксом `?raw` — тот же приём, что и в
// historyMarkers.test.ts; тестовые файлы из сканирования исключены.
// ============================================================
import { describe, expect, it } from 'vitest'

const modules = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Литералы git-ошибок про ссылки и refspec, которые не должны появляться в движке без разрешения. */
export const GUARDED_LITERALS = ['ambiguous argument', 'bad revision', 'not a valid object name', 'src refspec', 'Failed to resolve'] as const

/** Разрешённые места: имя файла (без каталога) → литерал → число вхождений в коде. */
export const ALLOWED: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'searchCommands.ts': { 'ambiguous argument': 1, 'bad revision': 1 },
  'remoteCommands.ts': { 'not a valid object name': 1, 'src refspec': 2 },
  'undoCommands.ts': { 'ambiguous argument': 1, 'not a valid object name': 1, 'bad revision': 1, 'Failed to resolve': 1 },
  'inspectCommands.ts': { 'ambiguous argument': 1 },
}

/**
 * Заменяет комментарии пробелами (переводы строк сохраняются), строки и шаблонные строки оставляет
 * как есть. Разбор посимвольный: `//` и `/*` внутри строк комментарием не считаются, апострофы и
 * кавычки внутри комментариев строкой не считаются.
 */
export function stripComments(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }
    if (c === '/' && next === '*') {
      out += '  '
      i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) {
        out += '  '
        i += 2
      }
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      out += c
      i++
      while (i < n && source[i] !== c) {
        if (source[i] === '\\' && i + 1 < n) {
          out += source[i] + source[i + 1]
          i += 2
          continue
        }
        out += source[i]
        i++
      }
      if (i < n) {
        out += c
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

/** Число вхождений каждого охраняемого литерала в коде (без комментариев). */
export function countLiterals(source: string): Record<string, number> {
  const code = stripComments(source)
  const counts: Record<string, number> = {}
  for (const literal of GUARDED_LITERALS) {
    const found = code.split(literal).length - 1
    if (found > 0) counts[literal] = found
  }
  return counts
}

/** Сверка подсчёта одного файла со списком; пустой результат — всё сходится. Сообщения — для читающего assert. */
export function checkFile(file: string, source: string, allowed: Readonly<Record<string, Readonly<Record<string, number>>>>): string[] {
  const found = countLiterals(source)
  const permitted = allowed[file] ?? {}
  const problems: string[] = []
  for (const literal of GUARDED_LITERALS) {
    const have = found[literal] ?? 0
    const may = permitted[literal] ?? 0
    if (have > may) {
      problems.push(`${file}: литерал «${literal}» найден ${have}, разрешено ${may}. Форма, которую git принимает, должна получать отказ [тренажёр]; если ответ настоящий — внесите место в ALLOWED.`)
    } else if (have < may) {
      problems.push(`${file}: литерал «${literal}» найден ${have}, в списке ${may}. Обновите ALLOWED.`)
    }
  }
  return problems
}

describe('сторожевой тест: литералы git-ошибок про ссылки и refspec только в разрешённых местах', () => {
  const engineFiles = Object.entries(modules).filter(([path]) => !path.endsWith('.test.ts'))

  it('сканер видит исходники движка', () => {
    expect(engineFiles.length).toBeGreaterThan(10)
    expect(engineFiles.some(([path]) => path === './undoCommands.ts')).toBe(true)
  })

  it('все файлы из белого списка существуют', () => {
    const names = engineFiles.map(([path]) => path.replace(/^\.\//, ''))
    for (const file of Object.keys(ALLOWED)) expect(names, file).toContain(file)
  })

  it('каждый исходник движка совпадает с белым списком', () => {
    const problems = engineFiles.flatMap(([path, source]) => checkFile(path.replace(/^\.\//, ''), source, ALLOWED))
    expect(problems).toEqual([])
  })
})

describe('сканер: проверка на синтетических строках', () => {
  const allowed = { 'a.ts': { 'bad revision': 1 } }

  it('литерал в коде вне белого списка роняет сверку', () => {
    const problems = checkFile('b.ts', "const x = 'fatal: bad revision'", allowed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('b.ts')
    expect(problems[0]).toContain('bad revision')
    expect(problems[0]).toContain('найден 1, разрешено 0')
  })

  it('литерал в // комментарии и в JSDoc не считается', () => {
    const source = [
      '// fatal: bad revision — только комментарий',
      '/**',
      ' * ambiguous argument в JSDoc',
      ' */',
      '/* src refspec */ const y = 1',
      '  // not a valid object name',
    ].join('\n')
    expect(countLiterals(source)).toEqual({})
    expect(checkFile('b.ts', source, allowed)).toEqual([])
  })

  it('лишнее вхождение сверх разрешённого роняет сверку', () => {
    const source = "const a = 'bad revision'\nconst b = 'bad revision'"
    const problems = checkFile('a.ts', source, allowed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('найден 2, разрешено 1')
  })

  it('недобор тоже роняет сверку с подсказкой обновить список', () => {
    const problems = checkFile('a.ts', 'const a = 1', allowed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('найден 0, в списке 1')
    expect(problems[0]).toContain('Обновите ALLOWED')
  })

  it('точное совпадение числа проходит', () => {
    expect(checkFile('a.ts', "const a = 'bad revision'", allowed)).toEqual([])
  })

  it('литерал внутри строки с // считается кодом, а не комментарием', () => {
    const source = 'const u = `https://x.example // bad revision ${name}`'
    expect(countLiterals(source)).toEqual({ 'bad revision': 1 })
    expect(countLiterals("const s = '// src refspec'")).toEqual({ 'src refspec': 1 })
  })

  it('апостроф в комментарии не открывает строку', () => {
    const source = "// don't stop\nconst a = 'ambiguous argument'"
    expect(countLiterals(source)).toEqual({ 'ambiguous argument': 1 })
  })

  it('экранированная кавычка внутри строки не закрывает её', () => {
    const source = "const a = 'it\\'s // not a comment: Failed to resolve'"
    expect(countLiterals(source)).toEqual({ 'Failed to resolve': 1 })
  })

  it('несколько литералов в одном файле считаются отдельно', () => {
    const source = "'src refspec' + 'src refspec' + 'not a valid object name'"
    expect(countLiterals(source)).toEqual({ 'src refspec': 2, 'not a valid object name': 1 })
  })
})
