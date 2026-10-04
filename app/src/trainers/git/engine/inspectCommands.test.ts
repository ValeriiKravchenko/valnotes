// ============================================================
// Раздел 3 git-тренажёра («Осмотритесь вокруг»): сквозные проверки команд
// терминала (log/diff/show/status) через публичный вход inspectSection.ts.
// Тексты и коды исходов сверены запуском настоящего git 2.53.0 во
// временном каталоге 26.09.2026 — не по памяти (см. отчёт о переносе).
//
// Ссылки вида S3-NN — проверки из spec.md, раздел 4, «Раздел 3 «Осмотритесь
// вокруг»» (S3-01…S3-43).
// ============================================================
import { describe, expect, it } from 'vitest'
import { createInspectSection, runInspectCommand, getAllCommits } from './inspectSection'
import type { InspectState } from './inspectTypes'

function run(state: InspectState, input: string) {
  const { state: next, result } = runInspectCommand(state, input)
  if (result === null) throw new Error('ожидалась команда, а не пустая строка')
  return { state: next, result }
}

/**
 * Исходное состояние раздела 3 (target.md, часть V, «Исходное состояние»): master, три коммита
 * («Первый…», «Добавить стили», «Обо мне»), index.html менялся в 1-м и 3-м коммитах, style.css —
 * только во 2-м; index.html изменён и НЕ подготовлен, style.css изменён и подготовлен. Тот же
 * набор файлов и правок, что и в сверке напрямую (git 2.53.0, mktemp-каталог, 26.09.2026).
 */
function baseState(): InspectState {
  return createInspectSection({
    commits: [
      { message: 'Первый коммит: структура страницы', tree: { 'index.html': '<h1>Site</h1>' } },
      { message: 'Добавить стили', tree: { 'index.html': '<h1>Site</h1>', 'style.css': 'body { color: black; }' } },
      { message: 'Обо мне', tree: { 'index.html': '<h1>Site</h1>\n<p>About me</p>', 'style.css': 'body { color: black; }' } },
    ],
    index: {
      'index.html': '<h1>Site</h1>\n<p>About me</p>',
      'style.css': 'body { color: black; }\nh1 { font-size: 2em; }',
    },
    working: {
      'index.html': '<h1>Site</h1>\n<p>About me</p>\n<footer>footer</footer>',
      'style.css': 'body { color: black; }\nh1 { font-size: 2em; }',
    },
  })
}

function commitByMessage(state: InspectState, message: string) {
  const found = getAllCommits(state).find((c) => c.message === message)
  if (!found) throw new Error(`коммит «${message}» не найден`)
  return found
}

describe('git log (target.md, часть V, «История»)', () => {
  it('S3-01: git log -1 — только последний коммит', () => {
    const s = baseState()
    const { result } = run(s, 'git log -1')
    expect(result.ok).toBe(true)
    expect(result.output).toContain('Обо мне')
    expect(result.output).not.toContain('Добавить стили')
    expect(result.output.split('\n\n').length).toBe(2) // "commit …" + "    Обо мне"
  })

  it('target.md, часть V, «опасное место 7»: Author/Date не печатаются ни в log, ни в show', () => {
    const s = baseState()
    expect(run(s, 'git log').result.output).not.toContain('Author')
    expect(run(s, 'git log').result.output).not.toContain('Date')
    expect(run(s, 'git show').result.output).not.toContain('Author')
    expect(run(s, 'git show').result.output).not.toContain('Date')
  })

  it('формат многострочного git log — "commit <id>", пустая строка, "    <сообщение>", пустая строка между коммитами', () => {
    const s = baseState()
    const c1 = commitByMessage(s, 'Обо мне')
    const c2 = commitByMessage(s, 'Добавить стили')
    const { result } = run(s, 'git log -2')
    expect(result.output).toBe(`commit ${c1.id}\n\n    Обо мне\n\ncommit ${c2.id}\n\n    Добавить стили`)
  })

  it('S3-02: git log -n 2 / git log -2 — два коммита', () => {
    const s = baseState()
    const a = run(s, 'git log -n 2').result.output
    const b = run(s, 'git log -2').result.output
    expect(a).toBe(b)
    expect(a).toContain('Обо мне')
    expect(a).toContain('Добавить стили')
    expect(a).not.toContain('Первый коммит')
  })

  it('S3-03: git log --oneline -2 — две строки', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline -2')
    expect(result.output.split('\n')).toHaveLength(2)
    expect(result.output).toContain('Обо мне')
    expect(result.output).toContain('Добавить стили')
  })

  it('S3-04: git log -n (без числа) — отказ, а не число', () => {
    const s = baseState()
    const bare = run(s, 'git log -n')
    expect(bare.result.ok).toBe(false)
    expect(bare.result.output).toBe('error: -n requires an argument')

    const nonNumeric = run(s, 'git log -n abc')
    expect(nonNumeric.result.ok).toBe(false)
    expect(nonNumeric.result.output).toBe("fatal: 'abc': not an integer")
  })

  it('S3-05: git log HEAD^ — два коммита, «Обо мне» нет', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline HEAD^')
    expect(result.output.split('\n')).toHaveLength(2)
    expect(result.output).not.toContain('Обо мне')
    expect(result.output).toContain('Добавить стили')
    expect(result.output).toContain('Первый коммит')
  })

  it('S3-06: git log HEAD~2 — один коммит («Первый…»)', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline HEAD~2')
    expect(result.output.split('\n')).toHaveLength(1)
    expect(result.output).toContain('Первый коммит')
  })

  it('S3-07: git log HEAD~3 — ambiguous argument (за пределами корня)', () => {
    const s = baseState()
    const { result } = run(s, 'git log HEAD~3')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      "fatal: ambiguous argument 'HEAD~3': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'",
    )
  })

  it('S3-08: git log nosuch — ambiguous argument (не ссылка и не файл)', () => {
    const s = baseState()
    const { result } = run(s, 'git log nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toContain("fatal: ambiguous argument 'nosuch'")
  })

  it('S3-09: git log index.html — только коммиты, менявшие файл; «Добавить стили» нет', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline index.html')
    expect(result.output.split('\n')).toHaveLength(2)
    expect(result.output).toContain('Первый коммит')
    expect(result.output).toContain('Обо мне')
    expect(result.output).not.toContain('Добавить стили')
  })

  it('S3-10: git log -- style.css — один коммит («Добавить стили»)', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline -- style.css')
    expect(result.output.split('\n')).toHaveLength(1)
    expect(result.output).toContain('Добавить стили')
  })

  it('S3-11: git log --oneline HEAD~2..HEAD — два коммита, «Первый» нет', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline HEAD~2..HEAD')
    expect(result.output.split('\n')).toHaveLength(2)
    expect(result.output).not.toContain('Первый коммит')
    expect(result.output).toContain('Добавить стили')
    expect(result.output).toContain('Обо мне')
  })

  it('S3-12: git log --graph/--stat/-p/--author=me/--since=yesterday — честный отказ по каждому', () => {
    const s = baseState()
    for (const flag of ['--graph', '--stat', '-p', '--author=me', '--since=yesterday']) {
      const { result } = run(s, `git log ${flag}`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('настоящая возможность git')
    }
  })

  it('S3-13: git log master — все три коммита (история от указанной ветки)', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline master')
    expect(result.output.split('\n')).toHaveLength(3)
  })
})

describe('git diff (target.md, часть V, «Что изменено…»)', () => {
  it('S3-14: git diff — только index.html (рабочее ↔ индекс)', () => {
    const s = baseState()
    const { result } = run(s, 'git diff')
    expect(result.ok).toBe(true)
    expect(result.output).toContain('diff --git a/index.html b/index.html')
    expect(result.output).not.toContain('style.css')
  })

  it('S3-15: git diff --staged — только style.css (индекс ↔ HEAD)', () => {
    const s = baseState()
    const { result } = run(s, 'git diff --staged')
    expect(result.output).toContain('diff --git a/style.css b/style.css')
    expect(result.output).not.toContain('index.html')
  })

  it('git diff --cached — синоним --staged', () => {
    const s = baseState()
    const a = run(s, 'git diff --staged').result.output
    const b = run(s, 'git diff --cached').result.output
    expect(a).toBe(b)
  })

  it('S3-16: git diff HEAD — оба файла (рабочее ↔ HEAD, вместе)', () => {
    const s = baseState()
    const { result } = run(s, 'git diff HEAD')
    expect(result.output).toContain('diff --git a/index.html b/index.html')
    expect(result.output).toContain('diff --git a/style.css b/style.css')
  })

  it('S3-17: git diff HEAD~1 — index.html (с footer) и style.css, без "(файла не было)"', () => {
    const s = baseState()
    const { result } = run(s, 'git diff HEAD~1')
    expect(result.output).toContain('<footer>footer</footer>')
    expect(result.output).toContain('style.css')
    expect(result.output).not.toContain('файла не было')
  })

  it('S3-18/S3-19: git diff HEAD~2 HEAD === git diff HEAD~2..HEAD — style.css новый файл, footer нет', () => {
    const s = baseState()
    const a = run(s, 'git diff HEAD~2 HEAD').result.output
    const b = run(s, 'git diff HEAD~2..HEAD').result.output
    expect(a).toBe(b)
    expect(a).toContain('new file mode 100644')
    expect(a).toContain('--- /dev/null')
    expect(a).not.toContain('footer')
  })

  it('S3-20: git diff index.html — ограничен файлом, без "указанного коммита"', () => {
    const s = baseState()
    const { result } = run(s, 'git diff index.html')
    expect(result.output).toContain('index.html')
    expect(result.output).not.toContain('style.css')
  })

  it('S3-21: git diff --staged index.html — различий нет (index.html не подготовлен)', () => {
    const s = baseState()
    const { result } = run(s, 'git diff --staged index.html')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
    expect(result.explanation).toContain('Различий нет')
  })

  it('S3-22: git diff -- style.css — различий нет (style.css уже подготовлен, unstaged diff пуст)', () => {
    const s = baseState()
    const { result } = run(s, 'git diff -- style.css')
    expect(result.output).toBe('')
  })

  it('S3-23: git diff nosuch — ambiguous argument', () => {
    const s = baseState()
    const { result } = run(s, 'git diff nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toContain("ambiguous argument 'nosuch'")
  })

  it('S3-24: git diff --stat — строка вида " index.html | N ±" и "file changed"', () => {
    const s = baseState()
    const { result } = run(s, 'git diff --stat')
    expect(result.output.split('\n')[0]).toMatch(/^ index\.html \| \d+ \+*-*$/)
    expect(result.output).toContain('1 file changed')
  })

  it('S3-25: git diff --name-only HEAD — index.html и style.css', () => {
    const s = baseState()
    const { result } = run(s, 'git diff --name-only HEAD')
    expect(result.output.split('\n')).toEqual(['index.html', 'style.css'])
  })

  it('S3-26: git diff -w — честный отказ «не поддерживает»', () => {
    const s = baseState()
    const { result } = run(s, 'git diff -w')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('настоящая возможность git')
  })

  it('S3-27: git diff --staged HEAD~1 HEAD — usage-отказ', () => {
    const s = baseState()
    const { result } = run(s, 'git diff --staged HEAD~1 HEAD')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('usage: git diff [<options>] [<commit>] [--] [<path>...]')
  })

  // Настоящий git принимает `diff --staged <коммит>` (индекс ↔ коммит), но в «Что входит» этой формы нет:
  // ответ — правило области, а не usage-отказ или ошибка, которых git здесь не печатает.
  it('git diff --staged <ревизия> — правило области, не выдуманная ошибка git', () => {
    const s = baseState()
    for (const input of ['git diff --staged HEAD~1', 'git diff --cached master', 'git diff HEAD --staged']) {
      const { result } = run(s, input)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('настоящая возможность git')
      expect(result.output).not.toMatch(/^(usage|fatal|error):/)
    }
  })

  it('S3-28: неотслеживаемый todo.txt не появляется ни в git diff, ни в git diff HEAD', () => {
    const s = baseState()
    const withTodo: InspectState = { ...s, working: { ...s.working, 'todo.txt': 'todo' } }
    expect(run(withTodo, 'git diff').result.output).not.toContain('todo.txt')
    expect(run(withTodo, 'git diff HEAD').result.output).not.toContain('todo.txt')
  })
})

describe('git show / git status -s / разное (target.md, часть V)', () => {
  it('S3-29: git show — последний коммит и его diff (index.html), без footer', () => {
    const s = baseState()
    const { result } = run(s, 'git show')
    expect(result.output).toContain('Обо мне')
    expect(result.output).toContain('diff --git a/index.html')
    expect(result.output).not.toContain('footer')
    expect(result.output).not.toContain('style.css') // "Обо мне" не трогал style.css
  })

  it('S3-30: git show HEAD~2 — корневой коммит, файлы "new file mode" (не "(файла не было)")', () => {
    const s = baseState()
    const { result } = run(s, 'git show HEAD~2')
    expect(result.output).toContain('Первый коммит')
    expect(result.output).toContain('new file mode 100644')
    expect(result.output).not.toContain('файла не было')
  })

  it('S3-31: git show nosuch — отказ', () => {
    const s = baseState()
    const { result } = run(s, 'git show nosuch')
    expect(result.ok).toBe(false)
  })

  it('S3-32: git status -s — " M index.html", "M  style.css", "?? todo.txt"', () => {
    const s = baseState()
    const withTodo: InspectState = { ...s, working: { ...s.working, 'todo.txt': 'todo' } }
    const { result } = run(withTodo, 'git status -s')
    const lines = result.output.split('\n')
    expect(lines).toContain(' M index.html')
    expect(lines).toContain('M  style.css')
    expect(lines).toContain('?? todo.txt')
  })

  it('S3-33: после add index.html — "M  index.html" в git status --short', () => {
    const s = baseState()
    // add вне области раздела 3 — эмулируем эффект "add" напрямую в индексе, как это сделал бы игрок командой,
    // которой в этом разделе нет: цель проверки — сам формат -s/--short, а не команда add.
    const staged: InspectState = { ...s, index: { ...s.index, 'index.html': s.working['index.html'] } }
    const { result } = run(staged, 'git status --short')
    expect(result.output.split('\n')[0]).toBe('M  index.html')
  })

  it('S3-34: index.html подготовлен и снова изменён — "MM index.html"', () => {
    const s = baseState()
    const staged: InspectState = { ...s, index: { ...s.index, 'index.html': s.working['index.html'] } }
    const edited: InspectState = { ...staged, working: { ...staged.working, 'index.html': staged.working['index.html'] + '\nextra' } }
    const { result } = run(edited, 'git status -s')
    expect(result.output).toContain('MM index.html')
  })

  it('S3-35: git status -sb — честный отказ «не поддерживает»', () => {
    const s = baseState()
    const { result } = run(s, 'git status -sb')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('настоящая возможность git')
  })

  it('S3-36: git blame index.html — «настоящая команда git» (есть, но здесь не поддерживается)', () => {
    const s = baseState()
    const { result } = run(s, 'git blame index.html')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('настоящая')
  })

  it('S3-37: git stauts — «не является командой git»', () => {
    const s = baseState()
    const { result } = run(s, 'git stauts')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(`git: 'stauts' is not a git command. See 'git --help'.`)
  })
})

describe('git status (полный формат)', () => {
  it('голый git status показывает "On branch master" и блоки staged/not staged', () => {
    const s = baseState()
    const { result } = run(s, 'git status')
    expect(result.output).toContain('On branch master')
    expect(result.output).toContain('Changes to be committed:')
    expect(result.output).toContain('Changes not staged for commit:')
  })
})

describe('разбор ссылок на коммиты (target.md, часть V, «Ссылки на коммиты»; spec S3-41…S3-43)', () => {
  function commits(s: InspectState) {
    return {
      c0: commitByMessage(s, 'Обо мне'),
      c1: commitByMessage(s, 'Добавить стили'),
      c2: commitByMessage(s, 'Первый коммит: структура страницы'),
    }
  }

  it('S3-41: HEAD^, HEAD~, HEAD~~, HEAD^^, HEAD~1^, master~1, начало хэша — резолвятся верно', () => {
    const s = baseState()
    const { c0, c1, c2 } = commits(s)
    const showId = (ref: string) => run(baseState(), `git show ${ref}`).result.output.match(/^commit (\S+)/)?.[1]

    expect(showId('HEAD^')).toBe(c1.id)
    expect(showId('HEAD~')).toBe(c1.id)
    expect(showId('HEAD~~')).toBe(c2.id)
    expect(showId('HEAD^^')).toBe(c2.id)
    expect(showId('HEAD~1^')).toBe(c2.id)
    expect(showId('master~1')).toBe(c1.id)
    expect(showId(c0.id.slice(0, 5))).toBe(c0.id)
  })

  it('S3-42: HEAD^2, HEAD~3, HEAD@{99}, abc — не найдено', () => {
    const s = baseState()
    for (const ref of ['HEAD^2', 'HEAD~3', 'HEAD@{99}', 'abc']) {
      const { result } = run(s, `git show ${ref}`)
      expect(result.ok).toBe(false)
    }
  })

  it('S3-43: HEAD@{0} — тот же коммит, что и HEAD', () => {
    const s = baseState()
    const { c0 } = commits(s)
    const { result } = run(s, 'git show HEAD@{0}')
    expect(result.output).toContain(c0.id)
  })
})

describe('git init/add/branch/checkout/merge/commit — вне области раздела 3 (правило области)', () => {
  it('git init — настоящая команда, здесь не реализована', () => {
    const { result } = run(baseState(), 'git init')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('настоящая, но в этом разделе')
  })

  it('git add index.html — настоящая команда, здесь не реализована', () => {
    const { result } = run(baseState(), 'git add index.html')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('настоящая, но в этом разделе')
  })

  it('git branch — настоящая команда, здесь не реализована', () => {
    const { result } = run(baseState(), 'git branch')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('настоящая, но в этом разделе')
  })

  it('git foobar — не существует в git', () => {
    const { result } = run(baseState(), 'git foobar')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(`git: 'foobar' is not a git command. See 'git --help'.`)
  })

  it('git без подкоманды — честный отказ', () => {
    const { result } = run(baseState(), 'git')
    expect(result.ok).toBe(false)
  })

  it('не git — «команда не найдена»', () => {
    const { result } = run(baseState(), 'ls -la')
    expect(result.ok).toBe(false)
  })
})

describe('createInspectSection — базовая сборка состояния', () => {
  it('создаёт цепочку коммитов и выставляет HEAD/индекс/рабочее дерево', () => {
    const s = baseState()
    expect(getAllCommits(s)).toHaveLength(3)
    expect(s.head).toBe('master')
    expect(createInspectSection).toBeTypeOf('function')
  })
})
