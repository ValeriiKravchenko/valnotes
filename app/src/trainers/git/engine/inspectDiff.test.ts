// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): построчный unified diff
// (inspectDiff.ts) — чистые функции над FileTree, без разбора командной
// строки и без состояния раздела. Формат сверен напрямую запуском git
// 2.53.0 во временном каталоге 26.09.2026 (см. отчёт о переносе).
// ============================================================
import { describe, expect, it } from 'vitest'
import { changedFileNames, diffBetween, diffNameOnly, diffStat } from './inspectDiff'

describe('diffBetween — модифицированный файл (target.md, часть V, «опасное место 3»)', () => {
  it('однострочный файл: заголовки, index-строка с режимом, "@@ -1 +1,2 @@" (счётчик "1" без ",1")', () => {
    const out = diffBetween({ f: 'a' }, { f: 'a\nb' })
    const lines = out.split('\n')
    expect(lines[0]).toBe('diff --git a/f b/f')
    expect(lines[1]).toMatch(/^index [0-9a-f]{7}\.\.[0-9a-f]{7} 100644$/)
    expect(lines[2]).toBe('--- a/f')
    expect(lines[3]).toBe('+++ b/f')
    expect(lines[4]).toBe('@@ -1 +1,2 @@')
    expect(lines[5]).toBe(' a')
    expect(lines[6]).toBe('+b')
  })

  it('без изменений — пустая строка (настоящий git ничего не печатает, target.md, «опасное место 1»)', () => {
    expect(diffBetween({ f: 'a' }, { f: 'a' })).toBe('')
  })

  it('несколько файлов — блоки идут подряд без пустой строки между ними, по алфавиту', () => {
    const out = diffBetween({ a: '1', z: '1' }, { a: '2', z: '2' })
    const blocks = out.split('diff --git ')
    expect(blocks[1]).toContain('a/a b/a')
    expect(blocks[2]).toContain('a/z b/z')
    expect(out).not.toContain('\n\ndiff --git')
  })

  it('files ограничивает вывод только указанными именами, даже если другие тоже отличаются', () => {
    const out = diffBetween({ a: '1', z: '1' }, { a: '2', z: '2' }, ['a'])
    expect(out).toContain('a/a b/a')
    expect(out).not.toContain('a/z b/z')
  })
})

describe('diffBetween — новый и удалённый файл ("new file mode"/"deleted file mode", "/dev/null", НЕ "(файла не было)")', () => {
  it('новый файл: "new file mode", "index 0000000..X", "--- /dev/null", все строки "+"', () => {
    const out = diffBetween({}, { f: 'a\nb' })
    expect(out).toContain('new file mode 100644')
    expect(out).toMatch(/index 0000000\.\.[0-9a-f]{7}\n/)
    expect(out).toContain('--- /dev/null')
    expect(out).toContain('+++ b/f')
    expect(out).toContain('@@ -0,0 +1,2 @@')
    expect(out).toContain('+a')
    expect(out).toContain('+b')
    expect(out).not.toContain('файла не было')
  })

  it('удалённый файл: "deleted file mode", "index X..0000000" (без хвостового режима), "+++ /dev/null"', () => {
    const out = diffBetween({ f: 'a\nb' }, {})
    expect(out).toContain('deleted file mode 100644')
    expect(out).toMatch(/index [0-9a-f]{7}\.\.0000000\n/)
    expect(out).toContain('--- a/f')
    expect(out).toContain('+++ /dev/null')
    expect(out).toContain('@@ -1,2 +0,0 @@')
    expect(out).toContain('-a')
    expect(out).toContain('-b')
    expect(out).not.toContain('файла не было')
  })
})

describe('diffBetween — несколько хунков в одном файле (стандартный алгоритм unified diff, context=3)', () => {
  it('два далёких друг от друга изменения дают ДВА отдельных хунка', () => {
    const oldLines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`)
    const newLines = [...oldLines]
    newLines[2] = 'line3-CHANGED' // индекс 2 → строка 3
    newLines[17] = 'line18-CHANGED' // индекс 17 → строка 18
    const out = diffBetween({ f: oldLines.join('\n') }, { f: newLines.join('\n') })
    const headers = out.split('\n').filter((l) => l.startsWith('@@'))
    expect(headers).toHaveLength(2)
    expect(headers[0]).toBe('@@ -1,6 +1,6 @@')
    expect(headers[1]).toBe('@@ -15,6 +15,6 @@')
  })

  it('изменения ближе друг к другу, чем 2*context — один общий хунк', () => {
    const oldLines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`)
    const newLines = [...oldLines]
    newLines[2] = 'X'
    newLines[6] = 'Y' // разница в индексах — 4 строки < 2*3
    const out = diffBetween({ f: oldLines.join('\n') }, { f: newLines.join('\n') })
    const headers = out.split('\n').filter((l) => l.startsWith('@@'))
    expect(headers).toHaveLength(1)
  })
})

describe('changedFileNames', () => {
  it('только реально различающиеся файлы, по алфавиту', () => {
    expect(changedFileNames({ a: '1', b: '1', c: '1' }, { a: '1', b: '2', d: '1' })).toEqual(['b', 'c', 'd'])
  })
})

describe('diffStat (target.md, «Кратко») — сверено напрямую, git 2.53.0', () => {
  it('одна вставленная строка: " f | 1 +" и "1 file changed, 1 insertion(+)"', () => {
    const out = diffStat({ f: 'a' }, { f: 'a\nb' })
    expect(out.split('\n')).toEqual([' f | 1 +', ' 1 file changed, 1 insertion(+)'])
  })

  it('только удаления: "N deletion(-)", без "insertion"', () => {
    const out = diffStat({ f: 'a\nb\nc' }, { f: 'a\nc' })
    expect(out).toContain('1 deletion(-)')
    expect(out).not.toContain('insertion')
  })

  it('несколько файлов: столбец имён выровнен по самому длинному', () => {
    const out = diffStat({ 'index.html': 'a', 'z.css': 'a' }, { 'index.html': 'a\nb', 'z.css': 'a\nb' })
    const lines = out.split('\n')
    expect(lines[0]).toBe(' index.html | 1 +')
    expect(lines[1]).toBe(' z.css      | 1 +')
    expect(lines[2]).toBe(' 2 files changed, 2 insertions(+)')
  })

  it('без изменений — пустая строка', () => {
    expect(diffStat({ f: 'a' }, { f: 'a' })).toBe('')
  })
})

describe('diffNameOnly (target.md, «Кратко»)', () => {
  it('только изменившиеся имена, по алфавиту', () => {
    expect(diffNameOnly({ a: '1', b: '1' }, { a: '2', b: '1', c: '1' })).toBe('a\nc')
  })

  it('без изменений — пустая строка', () => {
    expect(diffNameOnly({ a: '1' }, { a: '1' })).toBe('')
  })
})
