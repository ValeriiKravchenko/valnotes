// ============================================================
// Правило 7 (и общие границы модуля): движок не должен сам читать системное
// время, генерировать случайность или трогать браузерные API — всё это
// приходит параметрами снаружи. Проверяем исходники движка текстовым
// поиском — так регрессия (кто-то однажды напишет Date.now() «для удобства»)
// ловится тестом, а не ревью на глаз.
//
// Исходники читаются через суффикс `?raw` (стандартная возможность Vite,
// описана в его typescript-типах) — без node:fs, чтобы сам тестовый файл
// не заводил зависимость движка от Node.js API.
// ============================================================
import { describe, expect, it } from 'vitest'
import scheduleSrc from './schedule.ts?raw'
import progressSrc from './progress.ts?raw'
import sessionSrc from './session.ts?raw'
import statsSrc from './stats.ts?raw'
import serializeSrc from './serialize.ts?raw'
import typesSrc from './types.ts?raw'
import indexSrc from './index.ts?raw'

const ENGINE_SOURCES: Record<string, string> = {
  'schedule.ts': scheduleSrc,
  'progress.ts': progressSrc,
  'session.ts': sessionSrc,
  'stats.ts': statsSrc,
  'serialize.ts': serializeSrc,
  'types.ts': typesSrc,
  'index.ts': indexSrc,
}

const FORBIDDEN_PATTERNS: RegExp[] = [
  /Date\.now\s*\(/,
  /Math\.random\s*\(/,
  /localStorage/,
  /sessionStorage/,
  /\bfetch\s*\(/,
  /\bwindow\./,
  /\bdocument\./,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
]

describe('правило 7 — движок не читает системные часы и не генерирует случайность сам', () => {
  for (const [file, content] of Object.entries(ENGINE_SOURCES)) {
    it(`${file} не содержит запрещённых вызовов (Date.now, Math.random, DOM, storage, сеть, таймеры)`, () => {
      for (const pattern of FORBIDDEN_PATTERNS) {
        expect(content).not.toMatch(pattern)
      }
    })
  }
})
