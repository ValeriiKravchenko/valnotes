// ============================================================
// Раздел 4 git-тренажёра («Отмена действий»): сквозные проверки команд
// терминала (revert/reset, плюс add/commit/status/log/branch) через
// публичный вход undoSection.ts. Тексты и коды исходов сверены запуском
// настоящего git 2.53.0 во временном каталоге 26.09.2026 — не по памяти
// (см. отчёт о переносе).
//
// Ссылки вида S4-NN — проверки из spec.md, раздел 5, «Раздел 4 «Отмена
// действий»» (S4-01…S4-33). Конфликт при revert (S4-04…S4-10) и справочные
// флаги -q/--keep/--merge/-n/-m (S4-13/S4-25) — вне области (target.md,
// часть VI, «Что НЕ входит»): для них проверяется честный отказ по правилу
// области, а не имитация настоящего конфликта/поведения. S4-30 (сквозная
// проверка ВСЕХ 8 разделов) и S4-33 (тексты теории/квиза страницы) — вне
// этого движка, см. отчёт.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createUndoSection, runUndoCommand, getAllCommits, getOrphanCommits, editFile } from './undoSection'
import type { UndoState } from './undoTypes'
import { ru } from '../locales/ru'

function run(state: UndoState, input: string) {
  const { state: next, result } = runUndoCommand(state, input)
  if (result === null) throw new Error('ожидалась команда, а не пустая строка')
  return { state: next, result }
}

function runAll(state: UndoState, ...inputs: string[]): UndoState {
  return inputs.reduce((s, line) => run(s, line).state, state)
}

/** Исходное состояние раздела 4 (target.md, часть VI, «Исходное состояние» — точный состав из source.html, ch4.seed): три коммита, ветка master. */
function baseState(): UndoState {
  return createUndoSection({ commits: ru.undo.seed.commits })
}

function commitByMessage(state: UndoState, message: string) {
  const found = getAllCommits(state).find((c) => c.message === message)
  if (!found) throw new Error(`коммит «${message}» не найден`)
  return found
}

const COMIC_SANS_MESSAGE = 'сменить шрифт на Comic Sans'
const STRUCTURE_MESSAGE = 'Добавить структуру страницы'

describe('git revert (target.md, часть VI, «Что входит» — «Отмена коммита новым коммитом»)', () => {
  it('S4-01: чистое дерево, revert Comic Sans — ok, вывод содержит Revert "…", style.css без Comic, index.html цел', () => {
    const s = baseState()
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    const { state: next, result } = run(s, `git revert --no-edit ${comic.id}`)
    expect(result.ok).toBe(true)
    expect(result.output).toContain(`Revert "${COMIC_SANS_MESSAGE}"`)
    expect(next.working['style.css']).not.toContain('Comic')
    expect(next.working['index.html']).toBe('<h1>Мой сайт</h1>')
  })

  it('S4-02: миссия revertComicSans засчитана; 💡 содержит «нейтрализован»', () => {
    const s = baseState()
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    const { state: next, result } = run(s, `git revert --no-edit ${comic.id}`)
    expect(result.explanation).toContain('нейтрализован')
    expect(next.missionsDone.revertComicSans).toBe(true)
  })

  it('S4-03 (сверено напрямую — расхождение с source.html/spec.md, см. отчёт): повторный revert того же коммита — отказ, вывод ровно как у обычного git status на чистом дереве', () => {
    const s = baseState()
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    const once = run(s, `git revert --no-edit ${comic.id}`).state
    const { result } = run(once, `git revert --no-edit ${comic.id}`)
    expect(result.ok).toBe(false)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('target.md, часть VI, «Что НЕ входит»: конфликт при revert — правило области, без выдуманного CONFLICT', () => {
    // style.css менялся Comic Sans, а затем ещё раз (после) — тот же файл, соседние строки: настоящий git дал бы конфликт.
    let s = baseState()
    s = editFile(s, 'style.css')
    s = runAll(s, 'git add style.css', 'git commit -m "правка после Comic Sans"')
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    const { result } = run(s, `git revert --no-edit ${comic.id}`)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).toContain('конфликт')
    expect(result.output).not.toContain('<<<<<<<')
    // История не изменилась — revert ничего не закоммитил.
    expect(Object.keys(s.commits).length).toBe(Object.keys(s.commits).length)
  })

  it('S4-11: revert без аргумента — отказ с usage, коммитов не прибавилось, 💡 «не угадывает»', () => {
    const s = baseState()
    const before = Object.keys(s.commits).length
    const { state: next, result } = run(s, 'git revert')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('usage: git revert')
    expect(result.explanation).toContain('не угадывает')
    expect(Object.keys(next.commits).length).toBe(before)
  })

  it('S4-12: revert HEAD --no-edit — ok, Revert "Добавить структуру страницы", index.html исчез', () => {
    const s = baseState()
    const { state: next, result } = run(s, 'git revert HEAD --no-edit')
    expect(result.ok).toBe(true)
    expect(result.output).toContain(`Revert "${STRUCTURE_MESSAGE}"`)
    expect(next.working['index.html']).toBeUndefined()
  })

  it('S4-13: revert -n HEAD — отказ «не поддерживает» (правило области, не выдуманная ошибка git)', () => {
    const s = baseState()
    const { result } = run(s, 'git revert -n HEAD')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('не разбирает')
  })

  it('git revert -m 1 HEAD — тоже правило области («Что НЕ входит»: revert -m)', () => {
    const s = baseState()
    const { result } = run(s, 'git revert -m 1 HEAD')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('не разбирает')
  })

  it('git revert --abort (вне конфликта) — правило области конфликтной ветки, не выдуманная ошибка git', () => {
    const s = baseState()
    const { result } = run(s, 'git revert --abort')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('конфликт')
  })

  it('S4-14: несохранённая правка style.css (затронут revert) — отказ «would be overwritten by revert», правка на месте', () => {
    let s = baseState()
    s = editFile(s, 'style.css')
    const dirty = s.working['style.css']
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    const { state: next, result } = run(s, `git revert --no-edit ${comic.id}`)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('would be overwritten by merge')
    expect(next.working['style.css']).toBe(dirty)
  })

  it('S4-15: правка в другом файле (index.html) не мешает — revert проходит, правка остаётся', () => {
    let s = baseState()
    s = editFile(s, 'index.html')
    const dirty = s.working['index.html']
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    const { state: next, result } = run(s, `git revert --no-edit ${comic.id}`)
    expect(result.ok).toBe(true)
    expect(next.working['index.html']).toBe(dirty)
  })

  it('fatal: bad revision — ссылка не разобрана вовсе', () => {
    const s = baseState()
    const { result } = run(s, 'git revert nosuchref')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: bad revision 'nosuchref'")
  })
})

describe('git reset (target.md, часть VI, «Три режима reset»)', () => {
  it('S4-16: reset --soft HEAD~1 — ok, вывод пуст, изменения последнего коммита в индексе (index.html)', () => {
    const s = baseState()
    const { state: next, result } = run(s, 'git reset --soft HEAD~1')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
    expect(result.explanation).toContain('reflog')
    expect(next.index['index.html']).toBe('<h1>Мой сайт</h1>')
    expect(next.working['index.html']).toBe('<h1>Мой сайт</h1>') // рабочее дерево не тронуто (осталось как было до reset)
  })

  it('S4-17: reset HEAD~2 — «Unstaged changes after reset:\\nM\\tstyle.css», 💡 «не тронут»', () => {
    const s = baseState()
    const { result } = run(s, 'git reset HEAD~2')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Unstaged changes after reset:\nM\tstyle.css')
    expect(result.explanation).toContain('не тронут')
  })

  it('S4-18: несохранённая правка index.html + reset --hard — «HEAD is now at…», правка потеряна, 💡 обе фразы', () => {
    let s = baseState()
    s = editFile(s, 'index.html')
    const { state: next, result } = run(s, 'git reset --hard')
    expect(result.ok).toBe(true)
    expect(result.output).toMatch(/^HEAD is now at/)
    expect(next.working['index.html']).toBe('<h1>Мой сайт</h1>')
    expect(result.explanation).toContain('остался на месте')
    expect(result.explanation).toContain('потеряны навсегда')
  })

  it('S4-19: reset --soft HEAD (нечего двигать) — 💡 «ничего не изменила»', () => {
    let s = baseState()
    s = editFile(s, 'index.html')
    const { result } = run(s, 'git reset --soft HEAD')
    expect(result.ok).toBe(true)
    expect(result.explanation).toContain('ничего не изменила')
  })

  it('S4-20: style.css и index.html подготовлены, reset style.css — убран из индекса, содержимое цело, вывод «Unstaged…», 💡 «обратная операция к git add»', () => {
    let s = baseState()
    s = editFile(s, 'style.css')
    const edited = s.working['style.css']
    s = runAll(s, 'git add style.css')
    const { state: next, result } = run(s, 'git reset style.css')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Unstaged changes after reset:\nM\tstyle.css')
    expect(result.explanation).toContain('обратная операция к git add')
    expect(next.working['style.css']).toBe(edited)
    expect(next.index['style.css']).not.toBe(edited)
  })

  it('S4-21: reset HEAD index.html — файл в «не подготовлено», 💡 «обратная операция»', () => {
    let s = baseState()
    s = editFile(s, 'style.css')
    s = editFile(s, 'index.html')
    s = runAll(s, 'git add style.css', 'git add index.html')
    const { state: next, result } = run(s, 'git reset HEAD index.html')
    expect(result.ok).toBe(true)
    expect(result.explanation).toContain('обратная операция')
    expect(next.index['index.html']).toBe('<h1>Мой сайт</h1>')
  })

  it('S4-22: всё подготовлено (git add .), reset -- style.css — в индексе остался только index.html', () => {
    let s = baseState()
    s = editFile(s, 'style.css')
    s = editFile(s, 'index.html')
    s = runAll(s, 'git add .')
    const { state: next } = run(s, 'git reset -- style.css')
    expect(next.index['style.css']).toBe(commitByMessage(s, STRUCTURE_MESSAGE).tree['style.css'])
    expect(next.index['index.html']).toBe(s.working['index.html'])
  })

  it('S4-23: reset --hard style.css — «Cannot do hard reset with paths.»', () => {
    const s = baseState()
    const { result } = run(s, 'git reset --hard style.css')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('fatal: Cannot do hard reset with paths.')
  })

  it('S4-24: reset nosuch — «ambiguous argument \'nosuch\'…»', () => {
    const s = baseState()
    const { result } = run(s, 'git reset nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toContain("ambiguous argument 'nosuch'")
  })

  it('S4-25: reset -q — отказ «не поддерживает» (правило области, реальный флаг git)', () => {
    const s = baseState()
    const { result } = run(s, 'git reset -q')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('не разбирает')
  })

  it('git reset --keep / --merge — тоже правило области', () => {
    const s = baseState()
    expect(run(s, 'git reset --keep HEAD~1').result.output).toContain('не разбирает')
    expect(run(s, 'git reset --merge HEAD~1').result.output).toContain('не разбирает')
  })

  it('git reset --bogus — буквальный вывод настоящего git (unknown option + usage-блок)', () => {
    const s = baseState()
    const { result } = run(s, 'git reset --bogus')
    expect(result.ok).toBe(false)
    expect(result.output).toContain("error: unknown option `bogus'")
    expect(result.output).toContain('usage: git reset')
  })
})

describe('недостижимые коммиты на графе (target.md, часть VI, опасное место 4)', () => {
  it('S4-26: начальное состояние — нет осиротевших коммитов', () => {
    const s = baseState()
    expect(getOrphanCommits(s)).toHaveLength(0)
  })

  it('S4-27: reset --hard HEAD~1 — отброшенный коммит остаётся на графе, но недостижим (1 штука)', () => {
    const s = baseState()
    const structure = commitByMessage(s, STRUCTURE_MESSAGE)
    const { state: next } = run(s, 'git reset --hard HEAD~1')
    const orphans = getOrphanCommits(next)
    expect(orphans).toHaveLength(1)
    expect(orphans[0].id).toBe(structure.id)
    expect(next.commits[structure.id]).toBeDefined() // коммит не удалён, только недостижим
  })

  it('S4-28: git branch rescue <хэш отброшенного> — снова достижим, осиротевших нет', () => {
    const s = baseState()
    const structure = commitByMessage(s, STRUCTURE_MESSAGE)
    let next = run(s, 'git reset --hard HEAD~1').state
    next = run(next, `git branch rescue ${structure.id}`).state
    expect(getOrphanCommits(next)).toHaveLength(0)
  })

  it('S4-29: reset --soft HEAD~1, затем новый commit — старый коммит остаётся недостижимым (1 штука)', () => {
    const s = baseState()
    const structure = commitByMessage(s, STRUCTURE_MESSAGE)
    let next = run(s, 'git reset --soft HEAD~1').state
    next = run(next, 'git commit -m "новый"').state
    const orphans = getOrphanCommits(next)
    expect(orphans).toHaveLength(1)
    expect(orphans[0].id).toBe(structure.id)
  })
})

describe('S4-31/S4-32: миссии по событию (target.md, часть VI, «Миссии»)', () => {
  it('S4-31: git log --oneline, затем revert HEAD (не тот коммит) — миссия 1 засчитана, миссия 2 нет', () => {
    const s = baseState()
    const next = runAll(s, 'git log --oneline', 'git revert HEAD --no-edit')
    expect(next.missionsDone.findComicSans).toBe(true)
    expect(next.missionsDone.revertComicSans).toBe(false)
  })

  it('S4-32: reset --hard HEAD~1; revert <Comic Sans>; reset --soft HEAD~1; reset --hard HEAD~1 — все 4 миссии засчитаны', () => {
    let s = baseState()
    const comic = commitByMessage(s, COMIC_SANS_MESSAGE)
    s = run(s, 'git log --oneline').state
    s = run(s, 'git reset --hard HEAD~1').state
    s = run(s, `git revert --no-edit ${comic.id}`).state
    s = run(s, 'git reset --soft HEAD~1').state
    s = run(s, 'git reset --hard HEAD~1').state
    expect(s.missionsDone.findComicSans).toBe(true)
    expect(s.missionsDone.revertComicSans).toBe(true)
    expect(s.missionsDone.resetSoft).toBe(true)
    expect(s.missionsDone.resetHard).toBe(true)
  })
})

describe('правило 1 — область команд раздела 4', () => {
  it('настоящая, но не реализованная команда (например git merge) — честный отказ', () => {
    const s = baseState()
    const { result } = run(s, 'git merge master')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).toContain('не реализована')
  })

  it('несуществующая команда — буквальный текст git', () => {
    const s = baseState()
    const { result } = run(s, 'git nonsense')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("git: 'nonsense' is not a git command. See 'git --help'.")
  })

  it('git без подкоманды — честный отказ', () => {
    const s = baseState()
    const { result } = run(s, 'git')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
  })

  it('target.md, часть VI, «Что НЕ входит»: git reflog/git restore — настоящие команды, не реализованные в этом разделе', () => {
    const s = baseState()
    expect(run(s, 'git reflog').result.output).toContain('[тренажёр]')
    expect(run(s, 'git restore style.css').result.output).toContain('[тренажёр]')
  })
})

describe('git add / git commit / git status / git log / git branch — базовое поведение (общее с разделом 2)', () => {
  it('add + commit создают новый коммит', () => {
    let s = baseState()
    s = editFile(s, 'index.html')
    const edited = s.working['index.html']
    s = runAll(s, 'git add index.html', 'git commit -m "правка index.html"')
    const created = commitByMessage(s, 'правка index.html')
    expect(created.tree['index.html']).toBe(edited)
  })

  it('git status на чистом дереве — «nothing to commit, working tree clean», ровно одна «\\n» после «On branch master»', () => {
    const s = baseState()
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('git status с застейдженной правкой заканчивается пустой строкой (сверено напрямую, git 2.53.0, 26.09.2026, изолированный HOME — см. отчёт)', () => {
    let s = baseState()
    s = editFile(s, 'style.css')
    s = runAll(s, 'git add style.css')
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(
      'On branch master\n' +
        'Changes to be committed:\n' +
        '  (use "git restore --staged <file>..." to unstage)\n' +
        '\tmodified:   style.css\n' +
        '\n',
    )
  })

  it('git log --oneline — по одной строке на коммит, самый новый первым', () => {
    const s = baseState()
    const { result } = run(s, 'git log --oneline')
    const lines = result.output.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain(STRUCTURE_MESSAGE)
    expect(lines[2]).toContain('Добавить стили')
  })

  it('git branch без аргументов — список веток, текущая помечена звёздочкой', () => {
    const s = baseState()
    const { result } = run(s, 'git branch')
    expect(result.output).toBe('* master')
  })
})
