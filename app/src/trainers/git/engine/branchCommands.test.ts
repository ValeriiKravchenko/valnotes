// ============================================================
// Раздел 2 git-тренажёра, шаг A: сквозные проверки команд терминала
// (branch/checkout/merge/add/commit) через публичный вход branchSection.ts.
// Тексты и коды исходов сверены запуском настоящего git 2.53.0 во
// временном каталоге 23.09.2026 — не по памяти.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createBranchingSection, deleteFile, editFile, getBranchNames, getCurrentBranch, getHeadTree, isBranchMerged, runBranchingCommand } from './branchSection'
import { branchingStatus } from './branchRepo'
import type { BranchingState } from './branchTypes'
import { ru } from '../locales/ru'

function run(state: BranchingState, input: string) {
  const { state: next, result } = runBranchingCommand(state, input)
  if (result === null) throw new Error('ожидалась команда, а не пустая строка')
  return { state: next, result }
}

/** master с одним корневым коммитом и файлом style.css — см. spec.md, исходное состояние раздела 2. */
function baseState(): BranchingState {
  return createBranchingSection('Начальный коммит', { 'style.css': 'body { background: white; color: black; }' })
}

/** Буквальный вывод git 2.53.0 для невалидного имени ветки (check-ref-format) — общий для нескольких describe-блоков ниже. */
function refFormatError(name: string): string {
  return `fatal: '${name}' is not a valid branch name\nhint: See 'git help check-ref-format'\nhint: Disable this message with "git config set advice.refSyntax false"`
}

describe('git branch — список и создание (target.md, часть IV)', () => {
  it('список из одной ветки: звёздочка у текущей', () => {
    const { result } = run(baseState(), 'git branch')
    expect(result.output).toBe('* master')
  })

  it('git branch <имя> создаёт ветку от текущего коммита и НЕ переключается', () => {
    let s = baseState()
    const r = run(s, 'git branch dev')
    expect(r.result.ok).toBe(true)
    expect(r.result.output).toBe('')
    s = r.state
    expect(getCurrentBranch(s)).toBe('master')
    expect(getBranchNames(s)).toEqual(['dev', 'master'])
  })

  it('список веток — в алфавитном порядке, а не по порядку создания (сверено на git 2.53.0)', () => {
    let s = baseState()
    s = run(s, 'git branch c').state
    s = run(s, 'git branch a').state
    s = run(s, 'git branch b').state
    const { result } = run(s, 'git branch')
    expect(result.output).toBe('  a\n  b\n  c\n* master')
  })

  it('повторное имя ветки — отказ', () => {
    const s = run(baseState(), 'git branch dev').state
    const { result } = run(s, 'git branch dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: a branch named 'dev' already exists")
  })

  // Имя ветки, начинающееся с "-", здесь НЕ входит в этот список для голого
  // `git branch <имя>` — сверено напрямую (git 2.53.0): БЕЗ отдельного "--" git branch разбирает
  // такое слово как ФЛАГ ("error: unknown switch …", другой, уже существующий путь этого файла —
  // first.startsWith('-') ниже), а не как кандидата в имя ветки; до проверки ref-format git в этом
  // случае просто не доходит. С "--" разбор другой (ref-format), но эта форма (`git branch --
  // <имя>`) в шаге A не разбирается вовсе (см. optionOutOfScope для "--" как первого аргумента).
  ;([
    'foo bar',
    '..',
    'a..b',
    'HEAD',
    'a~b',
    'a:b',
    'foo.lock',
    'foo/',
    '.foo',
    'a//b',
    'foo.',
    '/foo',
    'a@{b',
    // ниже — дополнительные правила check-ref-format (сверено на git 2.53.0, 24.09.2026):
    // "^", "?", "[", "\" где-либо в имени; сегмент пути (между "/"), начинающийся с
    // "." или заканчивающийся на ".lock" — не только весь путь целиком.
    'a^b',
    'a?b',
    'a[b',
    'a\\b',
    'a/.b',
    'a.lock/b',
    'a/b.lock',
    'a*b',
    '',
  ] as const).forEach((name) => {
    it(`git branch "${name || '(пустое имя)'}" — невалидное имя ветки (check-ref-format, сверено на git 2.53.0)`, () => {
      const { result, state: next } = run(baseState(), `git branch "${name}"`)
      expect(result.ok).toBe(false)
      expect(result.output).toBe(refFormatError(name))
      expect(getBranchNames(next)).not.toContain(name)
    })
  })

  it('git branch HeAd (не тот регистр) — валидное имя, запрещён только буквальный "HEAD" (сверено на git 2.53.0)', () => {
    const { result } = run(baseState(), 'git branch HeAd')
    expect(result.ok).toBe(true)
  })

  it('git branch head (буквально, нижний регистр) — тоже валидное имя (сверено на git 2.53.0: запрещён только "HEAD" целиком)', () => {
    const { result } = run(baseState(), 'git branch head')
    expect(result.ok).toBe(true)
  })

  it('git branch @ — валидное имя (сверено на git 2.53.0: запрещена только последовательность "@{", не голый "@")', () => {
    const { result } = run(baseState(), 'git branch @')
    expect(result.ok).toBe(true)
  })

  it('git branch feature/x — валидное иерархическое имя (одиночный "/" внутри разрешён, ' +
    'запрещены только двойной "//" и "/" в начале/конце — сверено на git 2.53.0)', () => {
    const { result } = run(baseState(), 'git branch feature/x')
    expect(result.ok).toBe(true)
  })

  it('git branch - (голый дефис как имя) — ref-format ошибка, а не "настоящая возможность" ' +
    '(сверено на git 2.53.0: голый "-" без ничего после — не флаг-кластер, git разбирает его как ' +
    'кандидата в имя ветки и отклоняет по check-ref-format, а не как пустую связку коротких флагов)', () => {
    const { result, state: next } = run(baseState(), 'git branch -')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(refFormatError('-'))
    expect(result.output).not.toContain('[тренажёр]')
    expect(getBranchNames(next)).not.toContain('-')
  })
})

describe('git checkout <ветка> / -b (target.md, часть IV)', () => {
  it('переключение на существующую ветку', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const { result, state: next } = run(s, 'git checkout dev')
    expect(result.output).toBe("Switched to branch 'dev'")
    expect(getCurrentBranch(next)).toBe('dev')
  })

  it('git checkout -b создаёт и сразу переключается', () => {
    const { result, state } = run(baseState(), 'git checkout -b feat')
    expect(result.output).toBe("Switched to a new branch 'feat'")
    expect(getCurrentBranch(state)).toBe('feat')
    expect(getBranchNames(state)).toContain('feat')
  })

  it('checkout на несуществующую ветку — pathspec-ошибка (совпадает с git 2.53.0)', () => {
    const { result } = run(baseState(), 'git checkout nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: pathspec 'nosuch' did not match any file(s) known to git")
  })

  it('checkout на ту же ветку — "Already on"', () => {
    const { result } = run(baseState(), 'git checkout master')
    expect(result.output).toBe("Already on 'master'")
  })

  it('checkout -b без имени — та же ошибка, что и у настоящего git', () => {
    const { result } = run(baseState(), 'git checkout -b')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: switch `b' requires a value")
  })

  // В отличие от `git branch <имя>`, `-b` у checkout забирает следующее слово как значение
  // БЕЗУСЛОВНО, не разбирая его как флаг, — даже слово, начинающееся с "-", доходит до проверки
  // ref-format как кандидат в имя ветки (сверено напрямую git 2.53.0: `git checkout -b -foo` даёт
  // "fatal: '-foo' is not a valid branch name", а не ошибку разбора опций).
  ;([
    'foo bar',
    '..',
    'a..b',
    'HEAD',
    '-foo',
    'a~b',
    'a:b',
    'foo.lock',
    'foo/',
    '.foo',
    'a//b',
    'foo.',
    '/foo',
    'a@{b',
    // те же дополнительные правила check-ref-format, что и у `git branch` выше — здесь
    // тоже проходят через isInvalidBranchName (сверено на git 2.53.0, 24.09.2026).
    'a^b',
    'a?b',
    'a[b',
    'a\\b',
    'a/.b',
    'a.lock/b',
    'a/b.lock',
    '',
    '-',
  ] as const).forEach((name) => {
    it(`git checkout -b "${name || '(пустое имя)'}" — невалидное имя ветки (check-ref-format, сверено на git 2.53.0)`, () => {
      const { result, state: next } = run(baseState(), `git checkout -b "${name}"`)
      expect(result.ok).toBe(false)
      expect(result.output).toBe(
        `fatal: '${name}' is not a valid branch name\nhint: See 'git help check-ref-format'\nhint: Disable this message with "git config set advice.refSyntax false"`,
      )
      expect(getCurrentBranch(next)).toBe('master')
      expect(getBranchNames(next)).not.toContain(name)
    })
  })
})

describe('checkout с незакоммиченными правками — оба случая (target.md, «опасное место 1»)', () => {
  function divergedByOtherFile() {
    // master и dev расходятся только по f2.txt; f1.txt одинаков в обеих ветках.
    let s = createBranchingSection('base', { 'f1.txt': 'a\nb\nc', 'f2.txt': 'x' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f2.txt': 'y' } }
    s = run(s, 'git add f2.txt').state
    s = run(s, 'git commit -m "dev меняет f2"').state
    s = run(s, 'git checkout master').state
    return s
  }

  it('успешный перенос: файл не тронут веткой — правка едет вместе', () => {
    let s = divergedByOtherFile()
    // локальная незакоммиченная правка f1.txt, которого dev не касался
    s = { ...s, working: { ...s.working, 'f1.txt': 'a\nb\nLOCAL' } }
    const { result, state: next } = run(s, 'git checkout dev')
    expect(result.ok).toBe(true)
    // Настоящий git печатает отчёт по перенесённым файлам
    // ("M\t<файл>", stdout) РАНЬШЕ заголовка ("Switched to branch", stderr) — сверено
    // принудительным построчным буферингом (`stdbuf -oL -eL git checkout … 2>&1 | cat`,
    // git 2.53.0, 23.09.2026).
    expect(result.output).toBe("M\tf1.txt\nSwitched to branch 'dev'")
    expect(next.working['f1.txt']).toBe('a\nb\nLOCAL')
    // f2.txt при этом обновился до версии dev
    expect(next.working['f2.txt']).toBe('y')
  })

  it('файл, удалённый локально (не staged) из рабочего дерева, ' +
    'при переносе на ветку, где он тоже есть, — буква "D", а не "M" (сверено на git 2.53.0)', () => {
    let s = divergedByOtherFile()
    // f1.txt одинаков и в master, и в dev — но локально стёрт из рабочего дерева без add
    const nextWorking = { ...s.working }
    delete nextWorking['f1.txt']
    s = { ...s, working: nextWorking }
    const { result, state: next } = run(s, 'git checkout dev')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("D\tf1.txt\nSwitched to branch 'dev'")
    expect(next.working['f1.txt']).toBeUndefined()
  })

  it('git checkout -b на грязном дереве НЕ печатает "M\\t<файл>" ' +
    '(сверено напрямую: only_merge_on_switching_branches отключает show_local_changes для этой формы)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: blue; }' } }
    const { result, state: next } = run(s, 'git checkout -b feat')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Switched to a new branch 'feat'")
    expect(next.working['style.css']).toBe('body { color: blue; }')
  })

  it('отказ: файл различается между текущим и целевым коммитом, правка была бы потеряна', () => {
    let s = divergedByOtherFile()
    // локальная незакоммиченная правка ИМЕННО f2.txt — того же файла, что менял dev
    s = { ...s, working: { ...s.working, 'f2.txt': 'LOCAL' } }
    const before = s
    const { result, state: next } = run(s, 'git checkout dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'error: Your local changes to the following files would be overwritten by checkout:\n\tf2.txt\nPlease commit your changes or stash them before you switch branches.\nAborting',
    )
    // состояние не изменилось
    expect(getCurrentBranch(next)).toBe('master')
    expect(next.working).toEqual(before.working)
  })

  it('файл удалён локально (rm без git rm, не staged) — checkout НЕ блокирует, а восстанавливает ' +
    'файл в версии цели (сверено на git 2.53.0: verify_uptodate() считает отсутствующий на диске ' +
    'файл «up to date», раз перезаписывать нечего)', () => {
    let s = divergedByOtherFile()
    // f2.txt меняется в dev (в этой ветке); локально он не застейджен, а просто стёрт с диска
    const nextWorking = { ...s.working }
    delete nextWorking['f2.txt']
    s = { ...s, working: nextWorking }
    const { result, state: next } = run(s, 'git checkout dev')
    expect(result.ok).toBe(true)
    expect(result.output).not.toMatch(/would be overwritten/)
    expect(next.working['f2.txt']).toBe('y')
  })

  it('в отличие от rm без add — ЗАСТЕЙДЖЕННОЕ удаление файла (git rm) на затрагиваемом пути ' +
    'всё ещё блокирует checkout (сверено на git 2.53.0: verify_uptodate-исключение работает ' +
    'только для незастейдженного случая)', () => {
    let s = divergedByOtherFile()
    // f2.txt меняется в dev; здесь удаление ЗАСТЕЙДЖЕНО — index тоже не содержит f2.txt
    const nextIndex = { ...s.index }
    delete nextIndex['f2.txt']
    const nextWorking = { ...s.working }
    delete nextWorking['f2.txt']
    s = { ...s, index: nextIndex, working: nextWorking }
    const { result } = run(s, 'git checkout dev')
    expect(result.ok).toBe(false)
    expect(result.output).toMatch(/would be overwritten by checkout/)
  })

  it('одновременно modified И untracked — ОДИН комбинированный отказ (оба блока, один "Aborting" ' +
    'в конце), а не только первый по порядку (сверено на git 2.53.0)', () => {
    // dev меняет f2.txt (сталкивается с локальной незакоммиченной правкой f2.txt) и добавляет
    // новый файл new.txt (сталкивается с untracked-файлом того же имени в рабочем дереве).
    let s = createBranchingSection('base', { 'f2.txt': 'x' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f2.txt': 'y', 'new.txt': 'from dev' } }
    s = run(s, 'git add f2.txt new.txt').state
    s = run(s, 'git commit -m "dev меняет f2 и добавляет new.txt"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'f2.txt': 'LOCAL', 'new.txt': 'untracked-collision' } }

    const { result } = run(s, 'git checkout dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'error: Your local changes to the following files would be overwritten by checkout:\n\tf2.txt\n' +
        'Please commit your changes or stash them before you switch branches.\n' +
        'error: The following untracked working tree files would be overwritten by checkout:\n\tnew.txt\n' +
        'Please move or remove them before you switch branches.\n' +
        'Aborting',
    )
  })

  it('неотслеживаемый файл в рабочем дереве — checkout не печатает ' +
    'про него никакой строки отчёта (сверено на git 2.53.0: untracked-файла нет в run_diff_index())', () => {
    let s = divergedByOtherFile()
    // untracked.txt никогда не был ни в HEAD, ни в индексе ни одной из веток
    s = { ...s, working: { ...s.working, 'untracked.txt': 'нечто новое' } }
    const { result, state: next } = run(s, 'git checkout dev')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Switched to branch 'dev'")
    expect(result.output).not.toContain('untracked.txt')
    // сам файл остаётся в рабочем дереве как есть
    expect(next.working['untracked.txt']).toBe('нечто новое')
  })

  it('застейджённая правка, совпавшая по содержимому с целевой ' +
    'веткой, — checkout проходит без блокировки, даже с доп. незастейджённой правкой поверх ' +
    '(сверено на git 2.53.0)', () => {
    let s = divergedByOtherFile()
    // f2.txt: master стейджит значение, которое СЛУЧАЙНО совпадает с версией dev ('y')
    s = { ...s, working: { ...s.working, 'f2.txt': 'y' } }
    s = run(s, 'git add f2.txt').state
    const { result: r1, state: afterStagedMatch } = run(s, 'git checkout dev')
    expect(r1.ok).toBe(true)
    expect(r1.output).not.toContain('f2.txt')
    expect(afterStagedMatch.working['f2.txt']).toBe('y')

    // тот же сценарий, но с дополнительной незастейджённой правкой поверх совпавшего индекса —
    // она тоже не блокирует (verify_uptodate не вызывается, раз индекс уже на месте цели),
    // но остаётся в рабочем дереве и репортится обычным "M\t<файл>".
    let s2 = divergedByOtherFile()
    s2 = { ...s2, working: { ...s2.working, 'f2.txt': 'y' } }
    s2 = run(s2, 'git add f2.txt').state
    s2 = { ...s2, working: { ...s2.working, 'f2.txt': 'ещё правка поверх' } }
    const { result: r2, state: afterExtraEdit } = run(s2, 'git checkout dev')
    expect(r2.ok).toBe(true)
    expect(r2.output).toBe("M\tf2.txt\nSwitched to branch 'dev'")
    expect(afterExtraEdit.working['f2.txt']).toBe('ещё правка поверх')
    expect(afterExtraEdit.index['f2.txt']).toBe('y')
  })
})

describe('git merge — fast-forward / коммит слияния / already up to date (target.md, «опасные места 2, 3»)', () => {
  function divergeTwoFiles() {
    // база меняет f.txt в разных строках на двух ветках — проверка «опасного места 5» через merge.
    let s = createBranchingSection('base', { 'f.txt': 'line1\nline2\nline3' })
    s = run(s, 'git branch feature').state
    s = run(s, 'git checkout feature').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-feature\nline2\nline3' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "feature меняет line1"').state
    s = run(s, 'git checkout master').state
    return s
  }

  it('перемотка: своих коммитов у текущей ветки нет — просто двигается указатель, без нового коммита', () => {
    let s = createBranchingSection('base', { 'f.txt': 'x' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { 'f.txt': 'y' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "dev change"').state
    const devTip = s.branches.dev
    s = run(s, 'git checkout master').state
    const before = Object.keys(s.commits).length
    const { result, state: next } = run(s, 'git merge dev')
    expect(result.ok).toBe(true)
    expect(result.output).toMatch(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward$/)
    // новых коммитов не появилось — просто переехал указатель
    expect(Object.keys(next.commits).length).toBe(before)
    expect(next.branches.master).toBe(devTip)
    expect(getHeadTree(next)).toEqual({ 'f.txt': 'y' })
  })

  it('fast-forward: modified И untracked одновременно — один комбинированный отказ, "Updating" ' +
    'первой строкой (сверено на git 2.53.0, порядок потоков — принудительной построчной ' +
    'буферизацией)', () => {
    let s = createBranchingSection('base', { 'a.txt': 'base' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'a.txt': 'dev-a', 'b.txt': 'dev-b' } }
    s = run(s, 'git add a.txt b.txt').state
    s = run(s, 'git commit -m "dev change"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'a.txt': 'modified-not-committed', 'b.txt': 'untracked' } }

    const { result } = run(s, 'git merge dev')
    expect(result.ok).toBe(false)
    expect(result.output).toMatch(
      /^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\n/,
    )
    expect(result.output).toContain(
      'error: Your local changes to the following files would be overwritten by merge:\n\ta.txt\n' +
        'Please commit your changes or stash them before you merge.\n' +
        'error: The following untracked working tree files would be overwritten by merge:\n\tb.txt\n' +
        'Please move or remove them before you merge.\n' +
        'Aborting',
    )
    expect(result.output.endsWith('Aborting')).toBe(true)
  })

  it('ветки разошлись: коммит слияния с сообщением по умолчанию и двумя родителями', () => {
    let s = divergeTwoFiles()
    s = { ...s, working: { ...s.working, 'f.txt': 'line1\nline2\nline3-master' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master меняет line3"').state
    const masterTipBefore = s.branches.master
    const featureTip = s.branches.feature
    const before = Object.keys(s.commits).length

    const { result, state: next } = run(s, 'git merge feature')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Auto-merging f.txt\nMerge made by the 'ort' strategy.")
    expect(Object.keys(next.commits).length).toBe(before + 1)

    const mergeCommitId = next.branches.master
    expect(mergeCommitId).not.toBe(masterTipBefore)
    const mergeCommit = next.commits[mergeCommitId]
    expect(mergeCommit.message).toBe("Merge branch 'feature'")
    expect(mergeCommit.parents.sort()).toEqual([masterTipBefore, featureTip].sort())
    // строки, изменённые в разных местах, слились сами — без конфликта (target.md, «опасное место 5»)
    expect(mergeCommit.tree['f.txt']).toBe('line1-feature\nline2\nline3-master')
  })

  it('f.txt (участвует в трёхстороннем слиянии) удалён локально без staging — merge не блокирует, ' +
    'а создаёт файл заново со слитым содержимым (сверено на git 2.53.0)', () => {
    let s = divergeTwoFiles()
    s = { ...s, working: { ...s.working, 'f.txt': 'line1\nline2\nline3-master' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master меняет line3"').state
    const nextWorking = { ...s.working }
    delete nextWorking['f.txt']
    s = { ...s, working: nextWorking }

    const { result, state: next } = run(s, 'git merge feature')
    expect(result.ok).toBe(true)
    expect(result.output).not.toMatch(/would be overwritten/)
    expect(next.working['f.txt']).toBe('line1-feature\nline2\nline3-master')
  })

  it('сливать нечего — "Already up to date." и никаких изменений', () => {
    const s = baseState()
    const { result, state: next } = run(s, 'git merge master')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Already up to date.')
    expect(next.commits).toEqual(s.commits)
    expect(next.branches).toEqual(s.branches)
    expect(next.working).toEqual(s.working)
    expect(next.index).toEqual(s.index)
  })

  it('merge несуществующей ветки', () => {
    const { result } = run(baseState(), 'git merge nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('merge: nosuch - not something we can merge')
  })

  it('merge по хэшу коммита — честный отказ по правилу области, не выдуманная ошибка git', () => {
    const s = baseState()
    const hash = s.branches.master
    const { result } = run(s, `git merge ${hash}`)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toBe(`merge: ${hash} - not something we can merge`)
  })

  it('крест-накрест история (обе ветки уже сливали друг друга дважды) — честный отказ по правилу ' +
    'области, а не имитация конфликта и не выбор базы наугад (сверено на git 2.53.0: у такой ' +
    'истории `git merge-base --all master b` реально печатает ДВА коммита, а `git merge b` сам ' +
    'сливает историю, rc=0, "Merge made by the \'ort\' strategy.", без единого конфликта)', () => {
    let s = createBranchingSection('root', { f: 'x', g: 'y' })
    s = run(s, 'git branch b').state

    // master: A1 (f=a); git branch tmpA
    s = { ...s, working: { ...s.working, f: 'a' } }
    s = run(s, 'git add f').state
    s = run(s, 'git commit -m A1').state
    s = run(s, 'git branch tmpA').state

    // b: B1 (g=b); git branch tmpB
    s = run(s, 'git checkout b').state
    s = { ...s, working: { ...s.working, g: 'b' } }
    s = run(s, 'git add g').state
    s = run(s, 'git commit -m B1').state
    s = run(s, 'git branch tmpB').state

    // master: git merge tmpB -> M1
    s = run(s, 'git checkout master').state
    s = run(s, 'git merge tmpB').state

    // b: git merge tmpA -> M2
    s = run(s, 'git checkout b').state
    s = run(s, 'git merge tmpA').state

    // master: A2 (f=a2)
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, f: 'a2' } }
    s = run(s, 'git add f').state
    s = run(s, 'git commit -m A2').state

    // b: B2 (g=b2)
    s = run(s, 'git checkout b').state
    s = { ...s, working: { ...s.working, g: 'b2' } }
    s = run(s, 'git add g').state
    s = run(s, 'git commit -m B2').state

    s = run(s, 'git checkout master').state
    const before = s

    const { result, state: next } = run(s, 'git merge b')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    // не имитация конфликта: текст не должен звучать как конфликт слияния
    expect(result.output).not.toContain('CONFLICT')
    expect(result.output).not.toContain('правки задели')
    // состояние не изменилось
    expect(next.commits).toEqual(before.commits)
    expect(next.branches).toEqual(before.branches)
    expect(next.working).toEqual(before.working)
    expect(next.index).toEqual(before.index)
  })

  it('слияние в НЕ-master/main ветку добавляет "into <ветка>" в сообщение (сверено на git 2.53.0)', () => {
    let s = createBranchingSection('base', { 'f.txt': 'line1\nline2\nline3' }, 'develop')
    s = run(s, 'git branch feature').state
    s = run(s, 'git checkout feature').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-feature\nline2\nline3' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "feature меняет line1"').state
    s = run(s, 'git checkout develop').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1\nline2\nline3-develop' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "develop меняет line3"').state

    const { result, state: next } = run(s, 'git merge feature')
    expect(result.ok).toBe(true)
    const mergeCommit = next.commits[next.branches.develop]
    expect(mergeCommit.message).toBe("Merge branch 'feature' into develop")
  })
})

// Если id коммита считать только от сообщения, файлов и родителей — та же правка с тем же
// сообщением в двух ветках от одного корня даёт ОДИН и тот же id (буквально один и тот же коммит
// в state.commits, ключи совпадают и объекты схлопываются). target.md, A5: id учитывает ещё и
// «момент» коммита — логические часы (BranchingState.clock) — поэтому такие коммиты получают
// разные id.
describe('одинаковая правка с одинаковым сообщением в разных ветках даёт разные коммиты (target.md, A5)', () => {
  /** Ветки a и b от одного корня; в каждой — правка через editFile и коммит с ОДНИМ и тем же сообщением. */
  function sameEditInTwoBranches(): BranchingState {
    let s = baseState()
    s = run(s, 'git checkout -b a').state
    s = editFile(s, 'style.css')
    s = run(s, 'git commit -am "Red h1"').state
    s = run(s, 'git checkout master').state
    s = run(s, 'git checkout -b b').state
    s = editFile(s, 'style.css')
    s = run(s, 'git commit -am "Red h1"').state
    return s
  }

  it('коммиты веток a и b — разные id, хотя содержимое и сообщение совпадают', () => {
    const s = sameEditInTwoBranches()
    expect(s.branches.a).not.toBe(s.branches.b)
    // Оба коммита реально существуют в графе по отдельности (не схлопнулись в один ключ).
    expect(s.commits[s.branches.a]).toBeDefined()
    expect(s.commits[s.branches.b]).toBeDefined()
  })

  it('git merge a на ветке b — коммит слияния (rc успех, но НЕ "Already up to date.")', () => {
    const s = sameEditInTwoBranches()
    const { result, state: next } = run(s, 'git merge a')
    expect(result.ok).toBe(true)
    expect(result.output).not.toBe('Already up to date.')
    expect(result.output).toContain("Merge made by the 'ort' strategy.")
    const mergeCommit = next.commits[next.branches.b]
    expect(mergeCommit.parents).toHaveLength(2)
  })

  it('git branch -d a на ветке b — отказ, ветка a не слита (её коммит не попал в историю b)', () => {
    const s = sameEditInTwoBranches()
    const { result } = run(s, 'git branch -d a')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('is not fully merged')
  })
})

describe('git merge — предмерджевая проверка индекса (target.md, «опасное место 2»)', () => {
  /** master и feature расходятся по f.txt (по-настоящему сливающийся файл); u.txt слияния не касается. */
  function divergeWithUnrelatedFile() {
    let s = createBranchingSection('base', { 'f.txt': 'line1\nline2\nline3', 'u.txt': 'x' })
    s = run(s, 'git branch feature').state
    s = run(s, 'git checkout feature').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-feature\nline2\nline3' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "feature меняет line1"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1\nline2\nline3-master' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master меняет line3"').state
    return s
  }

  it('непустой индекс с изменением НЕ участвующего в слиянии файла — отказ (сверено дословно на git 2.53.0)', () => {
    let s = divergeWithUnrelatedFile()
    s = { ...s, working: { ...s.working, 'u.txt': 'dirty' } }
    s = run(s, 'git add u.txt').state
    const before = s

    const { result, state: next } = run(s, 'git merge feature')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'error: Your local changes to the following files would be overwritten by merge:\n  u.txt\nMerge with strategy ort failed.',
    )
    expect(next.commits).toEqual(before.commits)
    expect(next.branches).toEqual(before.branches)
  })

  it('тот же непустой индекс при fast-forward — слияние проходит (git разрешает FF с непустым индексом)', () => {
    let s = createBranchingSection('base', { 'f.txt': 'x', 'u.txt': 'x' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f.txt': 'y' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "dev меняет f.txt"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'u.txt': 'dirty' } }
    s = run(s, 'git add u.txt').state

    const { result, state: next } = run(s, 'git merge dev')
    expect(result.ok).toBe(true)
    expect(result.output).toMatch(/^Updating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward$/)
    expect(next.index['u.txt']).toBe('dirty')
  })

  it('настоящее (не FF) слияние: modified И untracked одновременно — один комбинированный отказ ' +
    'с "Merge with strategy ort failed." в самом конце (сверено на git 2.53.0)', () => {
    let s = createBranchingSection('base', { 'f.txt': 'line1\nline2\nline3' })
    s = run(s, 'git branch feature').state
    s = run(s, 'git checkout feature').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-feature\nline2\nline3', 'new.txt': 'from feature' } }
    s = run(s, 'git add f.txt new.txt').state
    s = run(s, 'git commit -m "feature меняет f.txt и добавляет new.txt"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1\nline2\nline3-master' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master меняет line3"').state
    // f.txt — незастейджённая правка (участвует в слиянии); new.txt — untracked-коллизия с тем, что добавляет feature.
    s = { ...s, working: { ...s.working, 'f.txt': 'modified', 'new.txt': 'untracked-collision' } }

    const { result } = run(s, 'git merge feature')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'error: Your local changes to the following files would be overwritten by merge:\n\tf.txt\n' +
        'Please commit your changes or stash them before you merge.\n' +
        'error: The following untracked working tree files would be overwritten by merge:\n\tnew.txt\n' +
        'Please move or remove them before you merge.\n' +
        'Aborting\n' +
        'Merge with strategy ort failed.',
    )
  })
})

describe('git branch -d / -D (target.md, «опасное место 4»)', () => {
  it('-d удаляет слитую ветку и печатает имя + короткий хэш', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const devTip = s.branches.dev
    const { result, state: next } = run(s, 'git branch -d dev')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(`Deleted branch dev (was ${devTip.slice(0, 7)}).`)
    expect(getBranchNames(next)).not.toContain('dev')
  })

  it('-d отказывает удалять неслитую ветку и советует -D', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'style.css': 'body{}' } }
    s = run(s, 'git add style.css').state
    s = run(s, 'git commit -m "dev меняет стиль"').state
    s = run(s, 'git checkout master').state
    expect(isBranchMerged(s, 'dev')).toBe(false)

    const { result, state: next } = run(s, 'git branch -d dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      "error: the branch 'dev' is not fully merged\nhint: If you are sure you want to delete it, run 'git branch -D dev'\nhint: Disable this message with \"git config set advice.forceDeleteBranch false\"",
    )
    expect(getBranchNames(next)).toContain('dev')
  })

  it('-D удаляет неслитую ветку без вопросов', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'style.css': 'body{}' } }
    s = run(s, 'git add style.css').state
    s = run(s, 'git commit -m "dev меняет стиль"').state
    s = run(s, 'git checkout master').state
    const { result, state: next } = run(s, 'git branch -D dev')
    expect(result.ok).toBe(true)
    expect(getBranchNames(next)).not.toContain('dev')
  })

  it('попытка удалить текущую ветку — отказ', () => {
    const { result, state: next } = run(baseState(), 'git branch -d master')
    expect(result.ok).toBe(false)
    expect(result.output).toContain("cannot delete branch 'master'")
    expect(getBranchNames(next)).toContain('master')
  })

  it('путь "/site" в этой строке — выдумка тренажёра, output остаётся ' +
    'буквальным (непереводимым) текстом git, а пояснение из словаря честно называет плейсхолдер плейсхолдером', () => {
    const { result } = run(baseState(), 'git branch -d master')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: cannot delete branch 'master' used by worktree at '/site'")
    expect(result.explanation).toBe(ru.branching.explain.worktreePathIsPlaceholder)
    expect(result.output).not.toContain('[тренажёр]') // сам вывод git не переводится и не помечается
  })

  it('удаление несуществующей ветки', () => {
    const { result } = run(baseState(), 'git branch -d nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: branch 'nosuch' not found")
  })

  it('branch -d без имени — та же ошибка, что и у настоящего git', () => {
    const { result } = run(baseState(), 'git branch -d')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('fatal: branch name required')
  })

  // У настоящего git "-f" ПОСЛЕ "-d" — ещё одна опция (форсирует удаление, как
  // "-D"), а не вторая ветка на удаление (сверено напрямую, git 2.53.0, 26.09.2026: `git branch -d
  // -f <неслитая>` реально удаляет ветку, "Deleted branch … "). Тот же класс упрощения, что и у
  // `git merge feature --no-ff` (options только до первого позиционного аргумента) — тот же честный
  // ответ optionOutOfScope, а не "несколько веток за раз" и не удаление по ошибочно понятому имени.
  it('git branch -d -f <неслитая> — "-f" реальная опция git (форсирует удаление), но не разобрана здесь: optionOutOfScope, а не "несколько веток за раз"', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'style.css': 'body{}' } }
    s = run(s, 'git add style.css').state
    s = run(s, 'git commit -m "dev меняет стиль"').state
    s = run(s, 'git checkout master').state

    const { result, state: next } = run(s, 'git branch -d -f dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git branch -f', 'git branch -d/-D <одна ветка>'))
    expect(result.output).not.toContain('несколько веток за раз')
    expect(getBranchNames(next)).toContain('dev') // ветка НЕ удалена — отказ, а не побочное удаление
  })

  it('git branch -D -f <неслитая> — тот же класс: "-f" после "-D" тоже не разобран, а не вторая ветка', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const { result } = run(s, 'git branch -D -f dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git branch -f', 'git branch -d/-D <одна ветка>'))
  })

  it('git branch -d -- dev feat — "--" не отключает проверку "несколько веток за раз" (регресс: новая проверка extraFlag не должна путать имена ветки после "--" с флагами)', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    s = run(s, 'git branch feat').state
    const { result } = run(s, 'git branch -d -- dev feat')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git branch -d/-D <несколько веток за раз>', 'git branch -d/-D <одна ветка>'))
  })
})

describe('выдуманные флаги — «unknown switch/option», а не optionOutOfScope, для флагов, ' +
  'которых у git вообще нет (сверено на git 2.53.0)', () => {
  it('git branch -foo — "-f" реален (force), "-o" нет: git останавливается на ВТОРОЙ букве ' +
    '(unknown switch `o\'), не на первой и не выдуманный "реальная возможность"', () => {
    const { result } = run(baseState(), 'git branch -foo')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown switch `o'")
    expect(result.output).not.toContain('[тренажёр]')
  })

  it('git branch --bogus — "unknown option `bogus\'", а не optionOutOfScope', () => {
    const { result } = run(baseState(), 'git branch --bogus')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown option `bogus'")
  })

  it('git checkout -zzz — "unknown switch `z\'" (первая же буква кластера невалидна)', () => {
    const { result } = run(baseState(), 'git checkout -zzz')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown switch `z'")
  })

  it('git merge --bogus — "unknown option `bogus\'"', () => {
    const { result } = run(baseState(), 'git merge --bogus')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown option `bogus'")
  })

  it('git commit --bogus — "unknown option `bogus\'"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit --bogus')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown option `bogus'")
  })

  it('git add --bogus — "unknown option `bogus\'"', () => {
    const { result } = run(baseState(), 'git add --bogus')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown option `bogus'")
  })

  it('git branch -m — флаг реальный (move), но не разбирается здесь: optionOutOfScope, ' +
    'а не unknown', () => {
    const { result } = run(baseState(), 'git branch -m')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git merge --no-ff — флаг реальный, но не разбирается здесь: optionOutOfScope', () => {
    const { result } = run(baseState(), 'git merge --no-ff')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git merge feature --no-ff — опция ПОСЛЕ имени ветки — тот же ' +
    'optionOutOfScope про "--no-ff", что и при опции перед веткой, а не "несколько веток за раз"', () => {
    let s = baseState()
    s = run(s, 'git branch feature').state
    const { result } = run(s, 'git merge feature --no-ff')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git merge --no-ff', 'git merge <ветка>'))
    expect(result.output).not.toContain('несколько веток за раз')
  })

  it('git merge feature master — две настоящие ветки (не опция) — остаётся "несколько веток за раз"', () => {
    let s = baseState()
    s = run(s, 'git branch feature').state
    const { result } = run(s, 'git merge feature master')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git merge <несколько веток за раз>', 'git merge <одна ветка>'))
  })

  it('git checkout -f — флаг реальный (force), но не разбирается здесь: optionOutOfScope', () => {
    const { result } = run(baseState(), 'git checkout -f')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })
})

// target.md, часть III, правило 1: настоящий git принимает однозначное сокращение длинной опции
// (`--mess` → `--message`) — раздел 2 использует общий механизм
// abbreviatedOptionCandidates/ambiguousOptionOutput (optionAbbrev.ts), тот же, что и раздел 1,
// через classifySection2Option. Все примеры ниже сверены прогоном настоящего git 2.53.0
// во временном каталоге, 24.09.2026.
describe('сокращённые длинные флаги в разделе 2 — однозначное сокращение работает как полная опция', () => {
  it('git commit --mess "текст" — однозначное сокращение "--message" (сверено: git commit --mess ' +
    'коммитит так же, как --message); раздел 2 реализует только короткую форму "-m" — честный ' +
    'отказ, а название опции в тексте — каноническое "--message", а не введённое сокращение', () => {
    const { result } = run(baseState(), 'git commit --mess "текст"')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git commit --message', 'git commit -m "..."'))
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git merge --no-f — однозначное сокращение "--no-ff" (сверено напрямую: неоднозначности ' +
    'нет, единственный кандидат в наших списках) — раздел 2 не реализует НИ ОДНОЙ опции merge, ' +
    'честный отказ с каноническим именем "--no-ff"', () => {
    const { result } = run(baseState(), 'git merge --no-f')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git merge --no-ff', 'git merge <ветка>'))
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git checkout --fo <ветка> — однозначное сокращение "--force" (сверено напрямую) — раздел 2 ' +
    'такую опцию не реализует (в отличие от "-b", реализованного буквально) — честный отказ с ' +
    'каноническим именем', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const { result } = run(s, 'git checkout --fo dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git checkout --force', 'git checkout <ветка>, git checkout -b <имя>'))
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git add --a — однозначное сокращение "--all" (сверено напрямую) — раздел 2 add реализует ' +
    'только явные пути и ".", не флаги вовсе — честный отказ с каноническим именем', () => {
    const { result } = run(baseState(), 'git add --a')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.optionOutOfScope('git add --all', 'git add <файл>, git add .'))
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git branch --del <имя> — однозначное сокращение "--delete"; "--delete" САМ реализован ' +
    'буквально (см. handleBranchDelete) — сокращение обязано вести себя так же, как полная опция, ' +
    'а не как ещё одна разновидность optionOutOfScope', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const devTip = s.branches.dev
    const { result, state: next } = run(s, 'git branch --del dev')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(`Deleted branch dev (was ${devTip.slice(0, 7)}).`)
    expect(getBranchNames(next)).not.toContain('dev')
  })

  it('git branch --a — неоднозначное сокращение между "--abbrev" и "--all": честный отказ БЕЗ ' +
    'перечисления конкретных кандидатов (пара кандидатов у настоящего git ' +
    'не всегда совпадает с тем, что дал бы наш список в порядке объявления, см. ' +
    'classifySection2Option, branchScope.ts)', () => {
    const { result } = run(baseState(), 'git branch --a')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git branch --a', 'git branch, git branch <имя>, git branch -d/-D <имя>'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('ambiguousAbbreviationOutOfScope не утверждает, что видит/делает настоящий git — только то, что эту форму тренажёр здесь не разбирает', () => {
    const text = ru.branching.errors.ambiguousAbbreviationOutOfScope('git branch --a', 'git branch, git branch <имя>, git branch -d/-D <имя>')
    expect(text).not.toMatch(/настоящий git/)
  })

  it('git branch --no-f — неоднозначное сокращение между "--no-force" и "--no-format": та же ' +
    'честная форма без кандидатов, что и у "--a" выше', () => {
    const { result } = run(baseState(), 'git branch --no-f')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git branch --no-f', 'git branch, git branch <имя>, git branch -d/-D <имя>'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git merge --s — неоднозначное сокращение: та же честная форма без кандидатов', () => {
    const { result } = run(baseState(), 'git merge --s')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git merge --s', 'git merge <ветка>'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })
})

// target.md, часть III, правило 1: настоящий git такую связку букв реально разобрал бы по своей
// семантике (например "-fm" у branch — force+move) — это шаг тренажёра сознательно не разбирает:
// каждая буква кластера проверяется только на "существует ли у git вообще" (classifySection2Option),
// а не как содержательная комбинация. Честный отказ по правилу области — не unknown, не имитация
// поведения связки. Сверено напрямую (git 2.53.0), что обе буквы каждого примера — настоящие
// короткие опции соответствующей команды.
describe('связки настоящих коротких флагов — честный отказ по правилу области (сознательное решение, не баг)', () => {
  it('git branch -fm dev — "-f" (force) и "-m" (move) существуют у настоящего git по отдельности, ' +
    'но связка не разбирается: optionOutOfScope, а не unknown switch', () => {
    const { result } = run(baseState(), 'git branch -fm dev')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git commit -si "текст" — "-s" (signoff) и "-i" (include) существуют у настоящего git по ' +
    'отдельности, но связка не разбирается: optionOutOfScope, а не unknown switch', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -si "текст"')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })
})

describe('вне области шага A — правило области (target.md, часть III/IV)', () => {
  it('git switch — второй ответ (реальная команда, здесь не разбирается)', () => {
    const { result } = run(baseState(), 'git switch dev')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^(fatal|error):/)
  })

  it('git restore — второй ответ', () => {
    const { result } = run(baseState(), 'git restore style.css')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
  })

  it('checkout по хэшу коммита (detached HEAD) — второй ответ, а не имитация переключения', () => {
    const s = baseState()
    const hash = s.branches.master
    const { result } = run(s, `git checkout ${hash}`)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).toContain('отсоединённый HEAD')
  })

  it('реальная, но не реализованная здесь команда (например log) — второй ответ, не третий', () => {
    const { result } = run(baseState(), 'git log')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
  })

  it('список реализованных команд в отказе про нереализованную ' +
    'подкоманду включает "git status" — он в этом шаге реально работает', () => {
    const { result } = run(baseState(), 'git log')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.commandOutOfScope('log'))
    expect(result.output).toContain('git status')
  })

  it('голый "git" без подкоманды — список тоже включает "git status"', () => {
    const { result } = run(baseState(), 'git')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(ru.branching.errors.gitUsageNoArgs)
    expect(result.output).toContain('git status')
  })

  it('несуществующая в git команда — третий ответ, буквальный текст git', () => {
    const { result } = run(baseState(), 'git foobar')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("git: 'foobar' is not a git command. See 'git --help'.")
  })

  it('конфликт content (правки в одних и тех же строках) до шага B — второй ответ, без имитации конфликта', () => {
    let s = createBranchingSection('base', { 'f.txt': 'line1\nline2' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-dev\nline2' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "dev меняет line1"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-master\nline2' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master меняет line1"').state

    const before = s
    const { result, state: next } = run(s, 'git merge dev')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^(fatal|error|<<<<<<<)/)
    // Для content-конфликта формулировка "одни и те же строки" честная.
    expect(result.output).toContain('правки задели одни и те же строки')
    // молча не слили и не создали фиктивного коммита
    expect(next.commits).toEqual(before.commits)
    expect(next.branches).toEqual(before.branches)
  })

  it('грязное дерево на конфликтующем файле — git отказывает ДО обнаружения конфликта ' +
    '(сверено на git 2.53.0: "would be overwritten by merge" / "Merge with strategy ort failed.", ' +
    'код выхода 2, без единого упоминания конфликта)', () => {
    let s = createBranchingSection('base', { 'f.txt': 'line1\nline2' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-dev\nline2' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "dev меняет line1"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-master\nline2' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master меняет line1"').state
    // незастейдженная правка того же файла поверх коммита master — f.txt участвует в конфликте.
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-master\nline2\ndirty-unstaged' } }

    const before = s
    const { result, state: next } = run(s, 'git merge dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'error: Your local changes to the following files would be overwritten by merge:\n\tf.txt\nPlease commit your changes or stash them before you merge.\nAborting\nMerge with strategy ort failed.',
    )
    expect(result.output).not.toContain('[тренажёр]')
    expect(next.commits).toEqual(before.commits)
    expect(next.branches).toEqual(before.branches)
  })

  it('конфликт modify/delete (файл удалён в одной ветке, изменён в ' +
    'другой) — текст называет удаление, а не "одни и те же строки" (сверено на git 2.53.0: ' +
    'CONFLICT (modify/delete))', () => {
    let s = createBranchingSection('base', { 'f.txt': 'line1' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f.txt': 'line1-dev' } }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "dev меняет f.txt"').state
    s = run(s, 'git checkout master').state
    const nextWorking = { ...s.working }
    delete nextWorking['f.txt']
    s = { ...s, working: nextWorking }
    s = run(s, 'git add f.txt').state
    s = run(s, 'git commit -m "master удаляет f.txt"').state

    const before = s
    const { result, state: next } = run(s, 'git merge dev')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).toContain('удалён в одной ветке и изменён в другой')
    expect(result.output).not.toContain('одни и те же строки')
    expect(next.commits).toEqual(before.commits)
    expect(next.branches).toEqual(before.branches)
  })

  it('конфликт add/add (файл создан в обеих ветках с разным ' +
    'содержимым) — текст называет создание в обеих ветках, а не "одни и те же строки" ' +
    '(сверено на git 2.53.0: CONFLICT (add/add))', () => {
    let s = createBranchingSection('base', { 'a.txt': 'x' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'new.txt': 'from dev' } }
    s = run(s, 'git add new.txt').state
    s = run(s, 'git commit -m "dev добавляет new.txt"').state
    s = run(s, 'git checkout master').state
    s = { ...s, working: { ...s.working, 'new.txt': 'from master' } }
    s = run(s, 'git add new.txt').state
    s = run(s, 'git commit -m "master добавляет new.txt"').state

    const before = s
    const { result, state: next } = run(s, 'git merge dev')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).toContain('создан в обеих ветках с разным содержимым')
    expect(result.output).not.toContain('одни и те же строки')
    expect(next.commits).toEqual(before.commits)
    expect(next.branches).toEqual(before.branches)
  })
})

describe('git add / git commit — минимальный набор шага A', () => {
  it('add конкретного файла и commit -m создают новый коммит на текущей ветке', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    s = run(s, 'git add style.css').state
    const before = Object.keys(s.commits).length
    const { result, state: next } = run(s, 'git commit -m "новый стиль"')
    expect(result.ok).toBe(true)
    expect(Object.keys(next.commits).length).toBe(before + 1)
    expect(getHeadTree(next)).toEqual({ 'style.css': 'body { color: red; }' })
  })

  it('несколько -m склеиваются абзацами в одно сообщение, вывод показывает первый абзац ' +
    '(сверено на git 2.53.0: `git commit -m a -m b` -> "[master xxx] a", %B = "a\\n\\nb")', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result, state: next } = run(s, 'git commit -m "первая часть" -m "вторая часть"')
    expect(result.ok).toBe(true)
    const id = next.branches.master
    expect(result.output).toBe(`[master ${id.slice(0, 7)}] первая часть`)
    expect(next.commits[id].message).toBe('первая часть\n\nвторая часть')
  })

  it('git commit без -m при застейдженных изменениях — "Aborting" с пояснением, что git открыл бы редактор ' +
    '(редактора в песочнице нет; сверено на git 2.53.0: GIT_EDITOR=true git commit -> ' +
    '"Aborting commit due to empty commit message.")', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('Aborting commit due to empty commit message.')
    expect(result.explanation).toBe(ru.explain.commitAborting)
  })

  it('git commit -m "" при застейдженных изменениях — "Aborting" с пояснением ' +
    'commitAbortingEmptyMessage (не commitAborting: сообщение было дано явно, просто пустое, ' +
    'редактор тут ни при чём — та же пара пояснений, что и в разделе 1, commands.ts)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -m ""')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('Aborting commit due to empty commit message.')
    expect(result.explanation).not.toBe(ru.explain.commitAborting)
    expect(result.explanation).toBe(ru.explain.commitAbortingEmptyMessage)
  })

  it('git commit -m "   " (сообщение из одних пробелов) — то же "Aborting commit due to empty ' +
    'commit message.", что и для пустой строки (сверено на git 2.53.0: git commit -m "   " с ' +
    'застейдженной правкой -> "Aborting commit due to empty commit message.", rc=1)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -m "   "')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('Aborting commit due to empty commit message.')
    expect(result.explanation).not.toBe(ru.explain.commitAborting)
  })

  it('git commit -m " " -m x — пробельный первый абзац выпадает целиком (как пустой), остаётся ' +
    'только "x" (сверено на git 2.53.0: git commit -m " " -m x -> "[master …] x", ' +
    'git log -1 --format=%B -> "x")', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result, state: next } = run(s, 'git commit -m " " -m x')
    expect(result.ok).toBe(true)
    const id = next.branches.master
    expect(result.output).toBe(`[master ${id.slice(0, 7)}] x`)
    expect(next.commits[id].message).toBe('x')
  })

  // target.md, часть III, правило 1: git commit -m по умолчанию использует cleanup=whitespace
  // (сверено напрямую, git 2.53.0, 24.09.2026: --cleanup=default даёт РОВНО тот же результат,
  // что и вовсе без --cleanup — "Same as strip if the message is to be edited. Otherwise
  // whitespace." из `git help commit`, для -m редактора нет, значит режим "whitespace"; НЕ
  // "strip" — # commentary-строки при этом НЕ вырезаются, см. тест ниже). Режим "whitespace":
  // у каждой строки обрезаются только ХВОСТОВЫЕ пробелы/табы, ведущие остаются как есть.
  describe('git commit -m — обрезка хвостовых пробелов (cleanup=whitespace, дефолт для -m)', () => {
    it('хвостовые пробелы в абзаце обрезаются (сверено: git commit -m "line one   " -m "line two" ' +
      '-> git log -1 --format=%B -> "line one\\n\\nline two", без хвостовых пробелов)', () => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      s = run(s, 'git add style.css').state
      const { result, state: next } = run(s, 'git commit -m "line one   " -m "line two"')
      expect(result.ok).toBe(true)
      const id = next.branches.master
      expect(next.commits[id].message).toBe('line one\n\nline two')
      expect(result.output).toBe(`[master ${id.slice(0, 7)}] line one`)
    })

    it('ведущие пробелы НЕ обрезаются (сверено: git commit -m "   leading" -> summary "   leading", ' +
      'ведущие пробелы остаются — обрезаются только хвостовые)', () => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      s = run(s, 'git add style.css').state
      const { result, state: next } = run(s, 'git commit -m "   leading"')
      expect(result.ok).toBe(true)
      const id = next.branches.master
      expect(next.commits[id].message).toBe('   leading')
      expect(result.output).toBe(`[master ${id.slice(0, 7)}] ${'   leading'}`)
    })

    it('хвостовой таб тоже обрезается (сверено напрямую, git 2.53.0)', () => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      s = run(s, 'git add style.css').state
      const { result, state: next } = run(s, 'git commit -m "text\t"')
      expect(result.ok).toBe(true)
      const id = next.branches.master
      expect(next.commits[id].message).toBe('text')
    })

    it('абзац из пробелов после обрезки хвоста остаётся пустым и выпадает целиком', () => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      s = run(s, 'git add style.css').state
      const { result, state: next } = run(s, 'git commit -m "first" -m "   " -m "third"')
      expect(result.ok).toBe(true)
      const id = next.branches.master
      expect(next.commits[id].message).toBe('first\n\nthird')
    })

    it('приклеенная форма -mтекст с хвостовыми пробелами тоже обрезается', () => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      s = run(s, 'git add style.css').state
      const { result, state: next } = run(s, 'git commit "-mглючит   "')
      expect(result.ok).toBe(true)
      const id = next.branches.master
      expect(next.commits[id].message).toBe('глючит')
    })

    it('строки, начинающиеся с "#", НЕ вырезаются (whitespace ≠ strip) — сверено напрямую: ' +
      'git commit -m "# not stripped" коммитит буквально с "#" в сообщении', () => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      s = run(s, 'git add style.css').state
      const { result, state: next } = run(s, 'git commit -m "# not stripped"')
      expect(result.ok).toBe(true)
      const id = next.branches.master
      expect(next.commits[id].message).toBe('# not stripped')
    })
  })

  it('commit без изменений — полный статус с "On branch <ветка>" ' +
    'перед "nothing to commit, working tree clean", а не голая строка (сверено на git 2.53.0)', () => {
    const { result } = run(baseState(), 'git commit -m "x"')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('git commit -m "" на ЧИСТОМ дереве — "nothing to commit", а не "Aborting commit due to ' +
    'empty commit message." (проверка пустого сообщения идёт ПОСЛЕ проверки «нечего коммитить»; ' +
    'сверено на git 2.53.0: `git commit -m ""` на чистом дереве -> "On branch master\\nnothing to ' +
    'commit, working tree clean", rc=1)', () => {
    const { result } = run(baseState(), 'git commit -m ""')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('git commit БЕЗ -m на ЧИСТОМ дереве — тот же статус "nothing to commit", а не "Aborting ' +
    'commit due to empty commit message." (сверено на git 2.53.0: GIT_EDITOR=true git commit на ' +
    'чистом дереве даёт тот же статус, редактор не открывается)', () => {
    const { result } = run(baseState(), 'git commit')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('git commit -m "" при НЕЗАСТЕЙДЖЕННОЙ правке (индекс == HEAD, рабочее дерево грязное) — ' +
    'полный статус "Changes not staged", а не "Aborting commit due to empty commit message." ' +
    '(сверено на git 2.53.0)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    const { result } = run(s, 'git commit -m ""')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'On branch master\n' +
        'Changes not staged for commit:\n' +
        '  (use "git add <file>..." to update what will be committed)\n' +
        '  (use "git restore <file>..." to discard changes in working directory)\n' +
        '\tmodified:   style.css\n' +
        '\n' +
        'no changes added to commit (use "git add" and/or "git commit -a")',
    )
  })

  it('индекс == HEAD, но рабочее дерево грязное (не staged) — ' +
    'полный статус с "Changes not staged", а не голая строка про clean (сверено на git 2.53.0)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    const { result } = run(s, 'git commit -m "x"')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(
      'On branch master\n' +
        'Changes not staged for commit:\n' +
        '  (use "git add <file>..." to update what will be committed)\n' +
        '  (use "git restore <file>..." to discard changes in working directory)\n' +
        '\tmodified:   style.css\n' +
        '\n' +
        'no changes added to commit (use "git add" and/or "git commit -a")',
    )
  })

  it('git add <удалённый файл> ставит удаление в индекс, а не "fatal" (сверено на git 2.53.0)', () => {
    let s = baseState()
    const nextWorking = { ...s.working }
    delete nextWorking['style.css']
    s = { ...s, working: nextWorking }
    const { result, state: next } = run(s, 'git add style.css')
    expect(result.ok).toBe(true)
    expect(next.index['style.css']).toBeUndefined()
    const { result: commitResult, state: afterCommit } = run(next, 'git commit -m "удалил style.css"')
    expect(commitResult.ok).toBe(true)
    expect(getHeadTree(afterCommit)).toEqual({})
  })
})

// target.md, часть IV, «Что входит в шаг A»: `-a` добавляет в коммит изменённые и удалённые
// ОТСЛЕЖИВАЕМЫЕ файлы; неотслеживаемые не трогает. Разбор флага и правило "какие файлы -a
// стейджит" общие с разделом 1 (см. commitFlags.ts, applyStageAll/classifyCommitFlagToken) —
// раздел 1 уже покрывает это правило своими тестами (addCommit.test.ts, describe про "commit -a
// стейджит только уже отслеживаемые"), здесь — тот же набор сценариев для раздела 2, сверенный
// напрямую запуском git 2.53.0 во временном каталоге, 24.09.2026.
describe('git commit -a / -am (target.md, часть IV: "-a" стейджит только уже отслеживаемые изменённые/удалённые файлы)', () => {
  it('изменённый отслеживаемый файл — "-a" коммитит его без явного add, дерево становится чистым', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    const { result, state: next } = run(s, 'git commit -a -m "красный"')
    expect(result.ok).toBe(true)
    expect(getHeadTree(next)).toEqual({ 'style.css': 'body { color: red; }' })
    expect(next.index).toEqual(getHeadTree(next))
    expect(next.working).toEqual(getHeadTree(next))
  })

  it('удалённый отслеживаемый файл — "-a" включает удаление в коммит', () => {
    let s = baseState()
    const nextWorking = { ...s.working }
    delete nextWorking['style.css']
    s = { ...s, working: nextWorking }
    const { result, state: next } = run(s, 'git commit -a -m "удалил"')
    expect(result.ok).toBe(true)
    expect(getHeadTree(next)).toEqual({})
    expect(next.index).toEqual({})
  })

  it('неотслеживаемый файл не попадает в коммит и остаётся "??" (git-commit(1): "new files you have not told Git about are not affected")', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'изменён', 'new.txt': 'неотслеживаемый' } }
    const { result, state: next } = run(s, 'git commit -a -m "правка"')
    expect(result.ok).toBe(true)
    expect(getHeadTree(next)).toEqual({ 'style.css': 'изменён' })
    expect(next.index['new.txt']).toBeUndefined()
    // сам файл остаётся в рабочем дереве как есть — "-a" его не трогает, а не удаляет
    expect(next.working['new.txt']).toBe('неотслеживаемый')
    expect(branchingStatus(next).untracked).toEqual(['new.txt'])
  })

  it('склеенное "-am\\"текст\\"", раздельное "-a -m текст" и "-am" с сообщением из двух слов — одинаковый результат', () => {
    function withStyleChange(): BranchingState {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'изменён' } }
      return s
    }

    const glued = run(withStyleChange(), 'git commit -am"склеенное сообщение"')
    expect(glued.result.ok).toBe(true)
    expect(glued.state.commits[glued.state.branches.master].message).toBe('склеенное сообщение')
    expect(getHeadTree(glued.state)).toEqual({ 'style.css': 'изменён' })

    const separate = run(withStyleChange(), 'git commit -a -m "раздельное сообщение"')
    expect(separate.result.ok).toBe(true)
    expect(separate.state.commits[separate.state.branches.master].message).toBe('раздельное сообщение')

    const withSpace = run(withStyleChange(), 'git commit -am "fix bug"')
    expect(withSpace.result.ok).toBe(true)
    expect(withSpace.state.commits[withSpace.state.branches.master].message).toBe('fix bug')
  })

  it('"-a", когда коммитить нечего — тот же вывод, что и у настоящего git (полный статус, а не голая строка)', () => {
    // чистое дерево целиком
    const clean = run(baseState(), 'git commit -a -m "x"')
    expect(clean.result.ok).toBe(false)
    expect(clean.result.output).toBe('On branch master\nnothing to commit, working tree clean')

    // только неотслеживаемый файл — "-a" его не подхватывает, стейджить всё равно нечего
    let s = baseState()
    s = { ...s, working: { ...s.working, 'new.txt': 'неотслеживаемый' } }
    const onlyUntracked = run(s, 'git commit -a -m "x"')
    expect(onlyUntracked.result.ok).toBe(false)
    expect(onlyUntracked.result.output).toBe(
      'On branch master\n' +
        'Untracked files:\n' +
        '  (use "git add <file>..." to include in what will be committed)\n' +
        '\tnew.txt\n' +
        '\n' +
        'nothing added to commit but untracked files present (use "git add" to track)',
    )
  })

  it('после "commit -a" текущая ветка сдвигается на новый коммит, другие ветки остаются на месте', () => {
    let s = baseState()
    s = run(s, 'git branch other').state
    const otherTipBefore = s.branches.other
    const masterTipBefore = s.branches.master
    s = { ...s, working: { ...s.working, 'style.css': 'изменён' } }
    const { result, state: next } = run(s, 'git commit -a -m "правка"')
    expect(result.ok).toBe(true)
    expect(next.branches.master).not.toBe(masterTipBefore)
    expect(next.branches.other).toBe(otherTipBefore)
  })
})

describe('git checkout <pathspec> — восстановление из индекса (честная реализация)', () => {
  it('checkout <существующий файл> восстанавливает его из индекса, HEAD/ветку не трогает', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'испорчено' } }
    const { result, state: next } = run(s, 'git checkout style.css')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Updated 1 path from the index')
    expect(next.working['style.css']).toBe(s.index['style.css'])
    expect(getCurrentBranch(next)).toBe('master')
  })

  it('checkout <файл без локальных изменений> — "Updated 0 paths from the index" (сверено на git 2.53.0)', () => {
    const { result } = run(baseState(), 'git checkout style.css')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Updated 0 paths from the index')
  })

  it('checkout . восстанавливает все известные git файлы разом', () => {
    let s = createBranchingSection('base', { 'a.txt': 'A', 'b.txt': 'B' })
    s = { ...s, working: { 'a.txt': 'dirty-a', 'b.txt': 'dirty-b' } }
    const { result, state: next } = run(s, 'git checkout .')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Updated 2 paths from the index')
    expect(next.working).toEqual({ 'a.txt': 'A', 'b.txt': 'B' })
  })

  it('файл, чьё удаление уже застейджено (в HEAD есть, в индексе ' +
    'уже нет), — pathspec-ошибка, а не "восстановление" из HEAD (сверено на git 2.53.0: checkout ' +
    '-- сопоставляет путь с индексом, не с HEAD)', () => {
    let s = baseState()
    // имитация "git rm --cached style.css": путь выведен из индекса, в HEAD остаётся, файл на диске есть
    const nextIndex = { ...s.index }
    delete nextIndex['style.css']
    s = { ...s, index: nextIndex }
    const { result, state: next } = run(s, 'git checkout style.css')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: pathspec 'style.css' did not match any file(s) known to git")
    // файл на диске не тронут (checkout не смог сопоставить путь вообще)
    expect(next.working['style.css']).toBe(s.working['style.css'])
  })
})

// "--" как первый аргумент. Настоящий git разбирает его как разделитель опций/
// позиционных аргументов — сам по себе он ничего не значит, и после него ничего не считается
// флагом. Для всех пяти команд шага A эта форма сводится либо к уже реализованному сценарию
// (значит, движок должен вести себя так же, как без "--"), либо к уже честному отказу.
// Все примеры сверены напрямую (git 2.53.0, 24.09.2026, временный каталог).
describe('разделитель "--" первым аргументом — сводится к уже поддерживаемой форме (сверено на git 2.53.0)', () => {
  // Явный "--" отключает печать "Updated N path(s) from the index" ЦЕЛИКОМ (count_
  // checkout_paths у настоящего git выключается только при явном "--") — файл при этом
  // восстанавливается из индекса точно так же, как и без "--"; различается только вывод, не
  // результат. Сверено напрямую (git 2.53.0, 24.09.2026, и в терминале, и без него — script(1)
  // против обычного перенаправления в файл дали одинаковый результат: пусто в обоих случаях).
  it('git checkout -- <файл> — восстанавливает файл из индекса, но БЕЗ строки "Updated N path(s)…"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'испорчено' } }
    const { result, state: next } = run(s, 'git checkout -- style.css')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
    expect(next.working['style.css']).toBe(s.index['style.css'])
  })

  it('git checkout style.css (без "--") — та же restore, но С печатью "Updated 1 path from the index"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'испорчено' } }
    const { result, state: next } = run(s, 'git checkout style.css')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Updated 1 path from the index')
    expect(next.working['style.css']).toBe(s.index['style.css'])
  })

  it('git add -- <файл> — стейджит файл, как "git add <файл>"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'новый стиль' } }
    const { result, state: next } = run(s, 'git add -- style.css')
    expect(result.ok).toBe(true)
    expect(next.index['style.css']).toBe('новый стиль')
  })

  it('git branch -- <имя> — создаёт ветку, как "git branch <имя>"', () => {
    const { result, state: next } = run(baseState(), 'git branch -- newname')
    expect(result.ok).toBe(true)
    expect(getBranchNames(next)).toContain('newname')
  })

  it('git merge -- <ветка> — сливает, как "git merge <ветка>" (здесь — "Already up to date.")', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    const { result } = run(s, 'git merge -- master')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('Already up to date.')
  })

  it('голый "git checkout --" (без пути) — тот же отказ, что и голый "git checkout" без аргументов', () => {
    const bare = run(baseState(), 'git checkout').result
    const withSeparator = run(baseState(), 'git checkout --').result
    expect(withSeparator.output).toBe(bare.output)
    expect(withSeparator.ok).toBe(bare.ok)
  })

  it('голый "git branch --" (без имени) — тот же список веток, что и голый "git branch"', () => {
    const bare = run(baseState(), 'git branch').result
    const withSeparator = run(baseState(), 'git branch --').result
    expect(withSeparator.output).toBe(bare.output)
  })

  it('голый "git add --" (без пути) — то же "Nothing specified…", что и голый "git add"', () => {
    const bare = run(baseState(), 'git add').result
    const withSeparator = run(baseState(), 'git add --').result
    expect(withSeparator.output).toBe(bare.output)
  })

  it('голый "git merge --" (без ветки) — тот же отказ, что и голый "git merge"', () => {
    const bare = run(baseState(), 'git merge').result
    const withSeparator = run(baseState(), 'git merge --').result
    expect(withSeparator.output).toBe(bare.output)
  })

  it('git commit -m "…" -- (пустой "--" в конце, без pathspec после) — коммитит как обычно', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -m "новый стиль" --')
    expect(result.ok).toBe(true)
    expect(result.output).toContain('новый стиль')
  })

  it('голый "git commit --" (без -m, без pathspec) — тот же отказ, что и голый "git commit" без -m', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const bare = run(s, 'git commit').result
    const withSeparator = run(s, 'git commit --').result
    expect(withSeparator.output).toBe(bare.output)
  })

  it('"--" отключает разбор опций для всего, что после него: git checkout -- -b — "-b" здесь буквальный путь, не флаг', () => {
    const { result } = run(baseState(), 'git checkout -- -b')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: pathspec '-b' did not match any file(s) known to git")
  })

  it('"--" отключает разбор опций: git branch -- -d — "-d" здесь буквальное (невалидное) имя, не флаг удаления', () => {
    const { result } = run(baseState(), 'git branch -- -d')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(refFormatError('-d'))
  })

  it('"--" отключает разбор опций: git merge -- -x — "-x" здесь буквальное имя ветки, не флаг', () => {
    const { result } = run(baseState(), 'git merge -- -x')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('merge: -x - not something we can merge')
  })

  it('"--" отключает разбор опций: git commit -m "x" -- -weird — честный отказ, как у обычного pathspec, не "unknown option"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -m "x" -- -weird')
    expect(result.ok).toBe(false)
    expect(result.output).not.toMatch(/^error: unknown/)
    expect(result.output).toContain('[тренажёр]')
  })
})

// Списки опций — полные (взяты из `git <команда> --git-completion-helper-all`,
// git 2.53.0, 24.09.2026, с сохранением порядка объявления — см. branchScope.ts): опция, реальная
// у git, но не входящая в набор, который реализует шаг A, должна получать честный
// optionOutOfScope, а не выдуманный "unknown option".
describe('реальные опции вне области — честный optionOutOfScope, не "unknown option" (сверено на git 2.53.0)', () => {
  it('git commit --allow-empty — реальная опция, не разбирается здесь', () => {
    const { result } = run(baseState(), 'git commit --allow-empty -m empty')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git commit --allow-empty-message — реальная опция, не разбирается здесь', () => {
    const { result } = run(baseState(), 'git commit --allow-empty-message -m ""')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git branch --ignore-case — реальная опция, не разбирается здесь', () => {
    const { result } = run(baseState(), 'git branch --ignore-case')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git branch --with / --without — реальные опции, не разбираются здесь', () => {
    for (const flag of ['--with', '--without']) {
      const { result } = run(baseState(), `git branch ${flag}`)
      expect(result.ok, flag).toBe(false)
      expect(result.output, flag).toContain('[тренажёр]')
      expect(result.output, flag).not.toMatch(/^error: unknown/)
    }
  })

  it('git branch --set-upstream — реальная опция, не разбирается здесь', () => {
    const { result } = run(baseState(), 'git branch --set-upstream')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git add --warn-embedded-repo — реальная опция, не разбирается здесь', () => {
    const { result } = run(baseState(), 'git add --warn-embedded-repo')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })
})

// Неоднозначное сокращение — честный отказ БЕЗ конкретных кандидатов:
// прогон (git 2.53.0, 24.09.2026) показал, что для части случаев (особенно "--no-…" префиксы и
// пара "--verify"/"--post-rewrite" — у настоящего git это внутренние имена "no-no-verify"/
// "no-no-post-rewrite") пара «последние два по порядку объявления» не совпадает с тем, что
// печатает git, поэтому раздел 2 не воспроизводит текст "ambiguous option: … (could be A or B)"
// вовсе — ни имитируя его буквально, ни называя конкретные варианты.
describe('неоднозначное сокращение — честный отказ без кандидатов (сверено на git 2.53.0, 24.09.2026)', () => {
  it('git branch --c — несколько кандидатов на "c" сразу, честный отказ без их перечисления', () => {
    const { result } = run(baseState(), 'git branch --c')
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git branch --c', 'git branch, git branch <имя>, git branch -d/-D <имя>'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git add --i — несколько кандидатов на "i" сразу, честный отказ без их перечисления', () => {
    const { result } = run(baseState(), 'git add --i')
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git add --i', 'git add <файл>, git add .'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git checkout --o — несколько кандидатов на "o" сразу, честный отказ без их перечисления', () => {
    const { result } = run(baseState(), 'git checkout --o')
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git checkout --o', 'git checkout <ветка>, git checkout -b <имя>'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git commit --a — несколько кандидатов на "a" сразу, честный отказ без их перечисления', () => {
    const { result } = run(baseState(), 'git commit --a -m x')
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git commit --a', 'git commit -m "..."'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git commit --al — тот же честный отказ, что и "--a" (двух кандидатов, а не пяти)', () => {
    const { result } = run(baseState(), 'git commit --al -m x')
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git commit --al', 'git commit -m "..."'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git commit --n — несколько кандидатов среди скрытых "--no-" форм, честный отказ без их перечисления', () => {
    const { result } = run(baseState(), 'git commit --n -m x')
    expect(result.output).toBe(ru.branching.errors.ambiguousAbbreviationOutOfScope('git commit --n', 'git commit -m "..."'))
    expect(result.output).not.toMatch(/^error: ambiguous/)
  })

  it('git merge --no-no-verify HEAD — двойное отрицание, которое git ПРИНИМАЕТ, — не должно называться неизвестной опцией', () => {
    const { result } = run(baseState(), 'git merge --no-no-verify master')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })
})

// Короткая опция, принимающая значение, внутри кластера — остаток токена (глюетый
// суффикс) становится её значением, а буквы ПОСЛЕ неё не разбираются вовсе (parse-options.c).
// Список "какая буква что принимает" — из `git <команда> -h`, сверено прогоном (git 2.53.0,
// 24.09.2026): checkout -b/-B/-U, merge -s/-X/-m/-F, branch -u, add -U, commit -F/-m/-c/-C/-t/-U.
describe('короткая опция со значением, приклеенным внутри кластера (сверено на git 2.53.0)', () => {
  it('git checkout -bfeature — "-b" уже реализован буквально, глюетая форма ведёт себя так же, как "-b feature"', () => {
    const { result, state } = run(baseState(), 'git checkout -bfeature')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Switched to a new branch 'feature'")
    expect(getCurrentBranch(state)).toBe('feature')
    expect(getBranchNames(state)).toContain('feature')
  })

  it('git checkout -Bfeature — "-B" реальна (значение приклеено), но не реализована здесь: честный отказ, не "unknown switch"', () => {
    const { result } = run(baseState(), 'git checkout -Bfeature')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  // target.md, часть IV, «Что входит в шаг A»: "-a"/"-am" реализованы буквально (см.
  // отдельный describe ниже, "git commit -a / -am", для полного набора сценариев) — глюетая
  // форма "-am<текст>" разбирается посимвольно, как у настоящего git: сначала 'a' (булев флаг),
  // потом 'm' забирает остаток токена как значение сообщения, та же модель, что уже была
  // здесь для "-b"/"-B" выше.
  it('git commit -am"текст" — "-a" и "-m" в одном кластере: "a" стейджит уже отслеживаемую правку, "m" забирает остаток токена как сообщение', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } } // style.css уже отслеживается (из baseState), НЕ застейджен явно
    const { result, state: next } = run(s, 'git commit -am"текст"')
    expect(result.ok).toBe(true)
    const id = next.branches.master
    expect(result.output).toBe(`[master ${id.slice(0, 7)}] текст`)
    expect(next.commits[id].tree['style.css']).toBe('a')
    expect(next.index['style.css']).toBe('a')
  })

  it('git merge -mmsg master — "-m" реальна со значением ("msg"), но не реализована здесь: честный отказ, не "unknown switch"', () => {
    const { result } = run(baseState(), 'git merge -mmsg master')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git branch -ufoo — "-u" реальна со значением ("foo"), но не реализована здесь: честный отказ, не "unknown switch"', () => {
    const { result } = run(baseState(), 'git branch -ufoo')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('буква, которой у git вообще нет, ДО буквы со значением — всё ещё "unknown switch" на ней (не проглатывается)', () => {
    const { result } = run(baseState(), 'git checkout -xb')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown switch `x'")
  })
})

// Буквы с НЕОБЯЗАТЕЛЬНЫМ значением ("-S[<keyid>]", "-t[=(direct|inherit)]", "-u[<mode>]" — see
// `-h`) ведут себя для разбора кластера ТАК ЖЕ, как буквы с обязательным значением:
// остаток токена — их значение, дальше кластер не разбирается, даже если остаток совпал бы с
// буквой другого реального булевого флага (сверено на git 2.53.0, 24.09.2026): `git branch -tq
// x` — "q" становится значением "-t" ("error: option `--track' expects..."), а не отдельным
// флагом "-q"; `git commit -uall` — "all" становится значением "-u" (коммит проходит успешно у
// настоящего git); `git branch -tdirect x` — тоже глюетое значение, валидное. Ни одна из этих
// букв не реализована этим шагом ни в каком виде (в отличие от "-b" у checkout) — правильный
// разбор здесь означает честный отказ на самой букве, а не выдуманный "unknown switch" на
// случайно совпавшей следующей букве.
describe('короткая опция с необязательным значением внутри кластера (сверено на git 2.53.0)', () => {
  it('git commit -uall — "-u" реальна (untracked-files, значение необязательно, здесь приклеено), но не реализована: честный отказ, не "unknown switch"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -uall -m x')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git merge -Skeyid master — "-S" реальна (gpg-sign, значение необязательно, здесь приклеено), но не реализована: честный отказ, не "unknown switch"', () => {
    const { result } = run(baseState(), 'git merge -Skeyid master')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git branch -tfoo — "-t" реальна (track, значение необязательно, здесь приклеено), но не реализована: честный отказ, не "unknown switch"', () => {
    const { result } = run(baseState(), 'git branch -tfoo')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git checkout -tdirect master — "-t" реальна у checkout тоже (track), честный отказ, не "unknown switch"', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const { result } = run(s, 'git checkout -tdirect dev')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('git commit -Skeyid -m x — "-S" реальна у commit тоже (gpg-sign), честный отказ, не "unknown switch"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git commit -Skeyid -m x')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('буква с необязательным значением ПОСЛЕ обычного булевого флага в том же кластере — тоже обрывает разбор (git branch -qtfoo)', () => {
    const { result } = run(baseState(), 'git branch -qtfoo')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  // Настоящий git продолжает разбирать кластер и после реальной, но нереализованной
  // буквы ("-q") — останавливается только на первой ГЕНУИННО неизвестной ("x"), поэтому
  // виновата именно она, а не любая более ранняя реальная буква.
  it('git commit -qx -m a — виновата "x" (unknown switch), а не "-q" (сверено на git 2.53.0, 24.09.2026)', () => {
    const { result } = run(baseState(), 'git commit -qx -m a')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown switch `x'")
  })

  it('git commit -qv -m a — обе буквы реальны и не реализованы здесь: честный отказ на ВСЁМ кластере, не только на "-q"', () => {
    const { result } = run(baseState(), 'git commit -qv -m a')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  // Та же регрессия, что и в разделе 1 (см. addCommit.test.ts) — общий код (commitFlags.ts,
  // classifyCommitFlagToken). Настоящий git ведёт себя для каждой формы по-разному (сверено
  // напрямую, git 2.53.0, 25.09.2026): "-qam" — тихий коммит; "-sam" — трейлер
  // "Signed-off-by"; "-iam" — fatal (несовместимость "-i" и "-a"); "-eam" — вызывает редактор.
  // Шаг A ни одно из этих поведений не реализует — важно только, что ни одна из этих форм не
  // должна тихо стать обычным коммитом без честного отказа.
  it.each(['-qam', '-sam', '-iam', '-eam'])(
    'регрессия: git commit %s x — реальная нереализованная буква ДО "a"/"m" в кластере не теряется: честный отказ, не обычный коммит',
    (flag) => {
      let s = baseState()
      s = { ...s, working: { ...s.working, 'style.css': 'a' } }
      const { result } = run(s, `git commit ${flag} x`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('[тренажёр]')
      expect(result.output).not.toMatch(/^error: unknown/)
    },
  )

  it('регрессия: git commit -aqm x — та же реальная нереализованная буква В СЕРЕДИНЕ кластера (между "a" и "m") тоже не теряется', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    const { result } = run(s, 'git commit -aqm x')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('после "m" остаток кластера — всегда текст сообщения, а не флаг: "-amq" коммитит с сообщением "q" (сверено напрямую, git 2.53.0, 25.09.2026)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'a' } }
    const { state: after, result } = run(s, 'git commit -amq')
    expect(result.ok).toBe(true)
    const headTip = after.commits[after.branches[after.head]]
    expect(headTip?.message).toBe('q')
  })
})

// "-t" реален и принимает значение (direct/inherit) — уже покрыто описанной выше группой
// тестов "короткая опция с необязательным значением внутри кластера" (в т.ч.
// "checkout -tdirect master"); здесь тот же сценарий отдельно, чтобы граница была
// закреплена явно.
describe('git checkout -tq — та же честная граница про "-t", что и у остальных команд', () => {
  it('не выдаёт себя за конкретную ошибку git о недопустимом значении "-t" и не называет "-t" неизвестной', () => {
    const { result } = run(baseState(), 'git checkout -tq')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
    expect(result.output).not.toMatch(/^error: option/)
  })
})

// "git checkout -- <ветка>/<хэш>" ищет ТОЛЬКО путь — ветка/коммит не разбираются
// вовсе, даже когда имя совпадает с существующей веткой или хэшем коммита.
describe('git checkout -- <ветка>/<хэш> — явный "--" ищет только путь', () => {
  it('git branch feature; git checkout -- feature — pathspec-ошибка, а не переключение ветки', () => {
    let s = baseState()
    s = run(s, 'git branch feature').state
    const { result, state: next } = run(s, 'git checkout -- feature')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: pathspec 'feature' did not match any file(s) known to git")
    expect(getCurrentBranch(next)).toBe('master')
  })

  it('git checkout -- <хэш коммита> — та же pathspec-ошибка, а не отказ про detached HEAD', () => {
    const s = baseState()
    const hash = s.branches.master
    const { result } = run(s, `git checkout -- ${hash}`)
    expect(result.ok).toBe(false)
    expect(result.output).toBe(`error: pathspec '${hash}' did not match any file(s) known to git`)
  })
})

// Только буквальная двухсловная форма "-b <имя>" БЕЗ единого лишнего аргумента подавляет
// отчёт о перенесённых файлах — склеенная форма и форма с "--" после имени печатают его как
// обычный checkout.
describe('git checkout -b — отчёт о перенесённых файлах подавляется только у буквальной формы', () => {
  it('git checkout -b <имя> на грязном дереве — только заголовок, без "M"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'правка' } }
    const { result } = run(s, 'git checkout -b feat')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Switched to a new branch 'feat'")
  })

  it('git checkout -bимя (склеенная форма) на том же дереве — печатает "M\\t<файл>" ПЕРЕД заголовком', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'правка' } }
    const { result } = run(s, 'git checkout -bfeat')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("M\tstyle.css\nSwitched to a new branch 'feat'")
  })

  it('git checkout -b имя -- (голый "--" после имени, без начальной точки) — тоже печатает "M\\t<файл>"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'правка' } }
    const { result } = run(s, 'git checkout -b feat --')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("M\tstyle.css\nSwitched to a new branch 'feat'")
  })

  it('застейдженный новый файл при склеенной форме — печатает "A\\t<файл>"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'new.txt': 'x' } }
    s = run(s, 'git add new.txt').state
    const { result } = run(s, 'git checkout -bfeat2')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("A\tnew.txt\nSwitched to a new branch 'feat2'")
  })

  it('git checkout -b имя <другой аргумент> (настоящая начальная точка) — остаётся честным отказом по области, без слова "начальная точка"', () => {
    const { result } = run(baseState(), 'git checkout -b feat3 startpoint')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toContain('начальной точк')
  })
})

// "-a" может вернуть индекс к HEAD — вывод должен быть голым "nothing to commit", а не
// статусом ДО "-a"; сам индекс при отказе не меняется (git отбрасывает временный индекс).
describe('git commit -a -m x, когда "-a" возвращает индекс к HEAD', () => {
  it('печатает "On branch <ветка>\\nnothing to commit, working tree clean", не старый статус', () => {
    const original = baseState()
    const originalStyle = original.working['style.css']
    let s: BranchingState = { ...original, working: { ...original.working, 'style.css': 'правка' } }
    s = run(s, 'git add style.css').state
    s = { ...s, working: { ...s.working, 'style.css': originalStyle } }
    const { result, state: next } = run(s, 'git commit -a -m x')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(`On branch ${s.head}\nnothing to commit, working tree clean`)
    // индекс НЕ переключён — настоящий git отбрасывает временный индекс "-a", если коммит не состоялся
    expect(next.index['style.css']).toBe('правка')
    expect(next.working['style.css']).toBe(originalStyle)
  })
})

// refs хранятся как файлы в дереве каталогов по "/" — ветка "X" и ветка "X/Y" не могут
// существовать одновременно.
describe('конфликт путей ссылок refs/heads/*', () => {
  it('git branch feature; git branch feature/x — "cannot lock ref"', () => {
    let s = baseState()
    s = run(s, 'git branch feature').state
    const { result, state: next } = run(s, 'git branch feature/x')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/feature/x': 'refs/heads/feature' exists; cannot create 'refs/heads/feature/x'")
    expect(getBranchNames(next)).not.toContain('feature/x')
  })

  it('git branch feature; git checkout -b feature/y — та же ошибка при создании через checkout -b', () => {
    let s = baseState()
    s = run(s, 'git branch feature').state
    const { result } = run(s, 'git checkout -b feature/y')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/feature/y': 'refs/heads/feature' exists; cannot create 'refs/heads/feature/y'")
  })

  it('git branch a/b; git branch a — конфликт в обратную сторону (более длинное имя уже существует)', () => {
    let s = baseState()
    s = run(s, 'git branch a/b').state
    const { result } = run(s, 'git branch a')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/a': 'refs/heads/a/b' exists; cannot create 'refs/heads/a'")
  })

  // При НЕСКОЛЬКИХ конфликтующих ветках git называет ту, что первая по алфавиту (сравнение всей
  // строки имени байт в байт), а не первую по порядку создания и не первую по глубине вложенности
  // (сверено напрямую, git 2.53.0, 25.09.2026, временный каталог, несколько прогонов с разным
  // порядком создания и разной глубиной — результат стабилен и не зависит от порядка создания):
  //   git branch feature/zzz; git branch feature/mmm; git branch feature/ccc; git branch feature/aaa
  //   git branch feature
  //     → fatal: cannot lock ref 'refs/heads/feature': 'refs/heads/feature/aaa' exists; ...
  // ("feature/aaa" — то же самое при создании в обратном порядке и при перемешивании).
  it('git branch feature/b; git branch feature/a; git branch feature/c/d; git branch feature — называет "feature/a" (первую по алфавиту), не первую по порядку создания', () => {
    let s = baseState()
    s = run(s, 'git branch feature/b').state
    s = run(s, 'git branch feature/a').state
    s = run(s, 'git branch feature/c/d').state
    const { result } = run(s, 'git branch feature')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/feature': 'refs/heads/feature/a' exists; cannot create 'refs/heads/feature'")
  })

  // Более глубоко вложенное имя может быть "меньше" по алфавиту, чем менее вложенное — сравнение
  // идёт по всей строке имени, а не по глубине (сверено напрямую, git 2.53.0, 25.09.2026):
  // "feature/b/x" называется виновником раньше "feature/c", хотя "feature/b/x" вложено глубже.
  it('git branch feature/b/x; git branch feature/c; git branch feature — называет более глубокую "feature/b/x", потому что она раньше по алфавиту всей строки', () => {
    let s = baseState()
    s = run(s, 'git branch feature/b/x').state
    s = run(s, 'git branch feature/c').state
    const { result } = run(s, 'git branch feature')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/feature': 'refs/heads/feature/b/x' exists; cannot create 'refs/heads/feature'")
  })

  it('git checkout -b — та же самая alphabetical-первая ветка называется виновником и здесь (сверено напрямую, git 2.53.0)', () => {
    let s = baseState()
    s = run(s, 'git branch topic/b').state
    s = run(s, 'git branch topic/a').state
    const { result } = run(s, 'git checkout -b topic')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/topic': 'refs/heads/topic/a' exists; cannot create 'refs/heads/topic'")
  })

  // Регистр/цифры/дефис — сравнение байтовое (как ASCII), не «человеческое» (сверено напрямую,
  // git 2.53.0, 25.09.2026): цифра меньше заглавной буквы, заглавная — меньше строчной, поэтому
  // "feature/1-first" называется раньше "feature/B", а та — раньше "feature/Zebra"/"feature/apple".
  it('байтовый порядок сравнения (не человеческий): "feature/1-first" раньше "feature/B"/"feature/Zebra"/"feature/apple"', () => {
    let s = baseState()
    s = run(s, 'git branch feature/Zebra').state
    s = run(s, 'git branch feature/1-first').state
    s = run(s, 'git branch feature/apple').state
    s = run(s, 'git branch feature/B').state
    const { result } = run(s, 'git branch feature')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/feature': 'refs/heads/feature/1-first' exists; cannot create 'refs/heads/feature'")
  })

  // Обратная сторона (создаваемое имя длиннее уже существующего) — кандидат всего один (структура
  // веток исключает второй: "feature" и "feature/sub" как обычные ветки одновременно существовать
  // не могут), но сама проверка при нескольких ветках рядом всё равно должна называть правильную —
  // сверено напрямую, что порядок создания остальных веток здесь ни на что не влияет.
  it('обратная сторона (создаваемое имя длиннее) — единственный кандидат называется верно независимо от прочих веток рядом', () => {
    let s = baseState()
    s = run(s, 'git branch topic').state
    s = run(s, 'git branch other/one').state
    s = run(s, 'git branch zzz').state
    const { result } = run(s, 'git branch topic/x')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: cannot lock ref 'refs/heads/topic/x': 'refs/heads/topic' exists; cannot create 'refs/heads/topic/x'")
  })
})

// HEAD и выражения ревизий (gitrevisions(7)) — честный отказ по области, а не
// выдуманная ошибка git ("pathspec did not match"/"not something we can merge"/detached HEAD).
describe('HEAD и выражения ревизий — честный отказ по области', () => {
  ;['HEAD', '@', 'master~0', 'HEAD~1', 'master^', 'master@{0}'].forEach((expr) => {
    it(`git checkout ${expr} — честный отказ, не pathspec-ошибка`, () => {
      const { result } = run(baseState(), `git checkout ${expr}`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('[тренажёр]')
      expect(result.output).not.toMatch(/^error: pathspec/)
    })
  })

  ;['HEAD', '@', 'master~0', 'HEAD~1', 'master^'].forEach((expr) => {
    it(`git merge ${expr} — честный отказ, не "not something we can merge"`, () => {
      const { result } = run(baseState(), `git merge ${expr}`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('[тренажёр]')
      expect(result.output).not.toMatch(/^merge:/)
    })
  })

  it('голый "@" всё ещё валидное ИМЯ при создании ветки (git branch @) — граница не задевает обычное создание', () => {
    const { result } = run(baseState(), 'git branch @')
    expect(result.ok).toBe(true)
  })

  it('обычное имя ветки без "~"/"^"/"@{"/голого "@"/"HEAD" переключает ветку как обычно', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const { result } = run(s, 'git checkout dev')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Switched to branch 'dev'")
  })
})

// "--длинная=значение" у опции, которая значения не принимает, — git отказывает и не меняет
// состояние (значение "=..." не отбрасывается молча, опция не срабатывает как обычно).
describe('"--длинная=значение" у опции без значения', () => {
  it('git branch --del=x feat — отказывает, ветка НЕ удаляется', () => {
    let s = baseState()
    s = run(s, 'git branch feat').state
    const { result, state: next } = run(s, 'git branch --del=x feat')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: option `delete' takes no value")
    expect(getBranchNames(next)).toContain('feat')
  })

  it('git branch --delete= feat — та же ошибка (пустое значение — тоже значение)', () => {
    let s = baseState()
    s = run(s, 'git branch feat').state
    const { result } = run(s, 'git branch --delete= feat')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: option `delete' takes no value")
  })

  it('git commit --all=1 -m x — отказывает', () => {
    const { result } = run(baseState(), 'git commit --all=1 -m x')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: option `all' takes no value")
  })

  it('git merge --no-verify=x master — отказывает', () => {
    const { result } = run(baseState(), 'git merge --no-verify=x master')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: option `no-verify' takes no value")
  })

  it('git checkout --force=x dev — отказывает', () => {
    let s = baseState()
    s = run(s, 'git branch dev').state
    const { result } = run(s, 'git checkout --force=x dev')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: option `force' takes no value")
  })

  it('git add --force=x style.css — отказывает', () => {
    const { result } = run(baseState(), 'git add --force=x style.css')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: option `force' takes no value")
  })

  it('опция, принимающая значение, с "=" продолжает работать как обычная реальная возможность (не "takes no value") — git branch --sort=name', () => {
    const { result } = run(baseState(), 'git branch --sort=name')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/takes no value/)
  })
})

// "-h"/"--help" реальны у git (справка), "--end-of-options" — реальная возможность
// parse-options.c, общая для всех команд git — ни то, ни другое не "unknown switch/option".
describe('-h/--help/--end-of-options', () => {
  ;['branch', 'checkout', 'merge', 'add', 'commit'].forEach((cmd) => {
    it(`git ${cmd} -h — тренажёр честно называет справку, не "unknown switch"`, () => {
      const { result } = run(baseState(), `git ${cmd} -h`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('[тренажёр]')
      expect(result.output).toContain('справку')
      expect(result.output).not.toMatch(/^error: unknown/)
    })

    it(`git ${cmd} --help — то же для длинной формы`, () => {
      const { result } = run(baseState(), `git ${cmd} --help`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('[тренажёр]')
      expect(result.output).toContain('справку')
      expect(result.output).not.toMatch(/^error: unknown/)
    })

    it(`git ${cmd} --end-of-options — настоящая возможность parse-options, не "unknown option"`, () => {
      const { result } = run(baseState(), `git ${cmd} --end-of-options`)
      expect(result.ok).toBe(false)
      expect(result.output).toContain('[тренажёр]')
      expect(result.output).not.toMatch(/^error: unknown/)
    })
  })
})

// Отказ называет только то, что тренажёр реально проверил про аргумент, а не придуманную причину.
describe('отказы не придумывают смысл аргумента, который не проверяли', () => {
  it('git branch -d -- feat — "--" не считается второй веткой, удаляет ровно одну (не "несколько веток за раз")', () => {
    let s = baseState()
    s = run(s, 'git branch feat').state
    const { result, state: next } = run(s, 'git branch -d -- feat')
    expect(result.ok).toBe(true)
    expect(getBranchNames(next)).not.toContain('feat')
  })

  it('git commit -a -- -m — настоящая ошибка git про "-a" с pathspec, не самопротиворечивый отказ про "-m"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'правка' } }
    s = run(s, 'git add style.css').state
    s = { ...s, working: { ...s.working, 'style.css': 'ещё правка' } }
    const { result } = run(s, 'git commit -a -- -m')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: paths '-m ...' with -a does not make sense")
  })

  it('git branch feat -d — отказ не называет второй аргумент "начальной точкой" (это известное упрощение, но текст не должен придумывать смысл, которого не проверял)', () => {
    const { result } = run(baseState(), 'git branch feat -d')
    expect(result.ok).toBe(false)
    expect(result.output).not.toContain('начальной точк')
  })
})

// ============================================================
// git status шага A (Часть 1 переноса шага A — подключение к уже существующему
// formatBranchingStatus, branchRepo.ts). Состояния — те, что игрок реально встречает в шаге A
// (target.md, часть IV): чистое дерево на ветке; правки в индексе/вне индекса; новые файлы;
// после checkout, который перенёс правку на другую ветку; после commit -am. Строк про upstream
// здесь нет и не должно быть — раздел не моделирует удалённые ветки (branchScope.ts, «Что НЕ
// входит»). Реальный `git status` всегда завершается успешно (rc=0), независимо от того, чисто
// дерево или нет (сверено напрямую, git 2.53.0) — ok у всех сценариев ниже true.
// ============================================================
describe('git status шага A', () => {
  it('чистое дерево на ветке — "On branch <ветка>\\nnothing to commit, working tree clean"', () => {
    const { result } = run(baseState(), 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
    expect(result.output).not.toContain('upstream')
    expect(result.output).not.toContain('ahead')
    expect(result.output).not.toContain('behind')
  })

  it('правка в индексе (staged) — блок "Changes to be committed", с пустой строкой в конце ' +
    '(сверено напрямую, git 2.53.0, mktemp-каталог, 25.09.2026 — когда ' +
    'staged непуст и это единственный блок, git заканчивает вывод пустой строкой, а не строкой ' +
    'с текстом)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(
      'On branch master\n' +
        'Changes to be committed:\n' +
        '  (use "git restore --staged <file>..." to unstage)\n' +
        '\tmodified:   style.css\n',
    )
  })

  it('staged + untracked одновременно — оба блока и та же пустая строка в конце ' +
    '(сверено напрямую, git 2.53.0, тот же прогон)', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }', 'app.js': 'console.log(1)' } }
    s = run(s, 'git add style.css').state
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(
      'On branch master\n' +
        'Changes to be committed:\n' +
        '  (use "git restore --staged <file>..." to unstage)\n' +
        '\tmodified:   style.css\n' +
        '\n' +
        'Untracked files:\n' +
        '  (use "git add <file>..." to include in what will be committed)\n' +
        '\tapp.js\n',
    )
  })

  it('правка вне индекса (not staged) — блок "Changes not staged for commit"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(
      'On branch master\n' +
        'Changes not staged for commit:\n' +
        '  (use "git add <file>..." to update what will be committed)\n' +
        '  (use "git restore <file>..." to discard changes in working directory)\n' +
        '\tmodified:   style.css\n' +
        '\n' +
        'no changes added to commit (use "git add" and/or "git commit -a")',
    )
  })

  it('новый (неотслеживаемый) файл — блок "Untracked files"', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'app.js': 'console.log(1)' } }
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(
      'On branch master\n' +
        'Untracked files:\n' +
        '  (use "git add <file>..." to include in what will be committed)\n' +
        '\tapp.js\n' +
        '\n' +
        'nothing added to commit but untracked files present (use "git add" to track)',
    )
  })

  it('после checkout, который перенёс незакоммиченную правку на другую ветку — правка видна как "not staged"', () => {
    // dev расходится с master только по f2.txt; f1.txt одинаков в обеих ветках — правка на нём
    // переносится вместе с checkout (target.md, «опасное место 1»).
    let s = createBranchingSection('base', { 'f1.txt': 'a\nb\nc', 'f2.txt': 'x' })
    s = run(s, 'git branch dev').state
    s = run(s, 'git checkout dev').state
    s = { ...s, working: { ...s.working, 'f2.txt': 'y' } }
    s = run(s, 'git add f2.txt').state
    s = run(s, 'git commit -m "dev меняет f2"').state
    s = run(s, 'git checkout master').state
    // локальная незакоммиченная правка f1.txt, которого dev не касался
    s = { ...s, working: { ...s.working, 'f1.txt': 'a\nb\nLOCAL' } }
    s = run(s, 'git checkout dev').state
    expect(s.working['f1.txt']).toBe('a\nb\nLOCAL') // правка действительно перенеслась
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe(
      'On branch dev\n' +
        'Changes not staged for commit:\n' +
        '  (use "git add <file>..." to update what will be committed)\n' +
        '  (use "git restore <file>..." to discard changes in working directory)\n' +
        '\tmodified:   f1.txt\n' +
        '\n' +
        'no changes added to commit (use "git add" and/or "git commit -a")',
    )
  })

  it('после commit -am — снова чистое дерево', () => {
    let s = baseState()
    s = { ...s, working: { ...s.working, 'style.css': 'body { color: red; }' } }
    s = run(s, 'git commit -am "перекрасил"').state
    const { result } = run(s, 'git status')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  it('пояснение к git status не придумано — explanation остаётся null (только output несёт текст)', () => {
    const { result } = run(baseState(), 'git status')
    expect(result.explanation).toBeNull()
  })

  it('флаг -s/--short — настоящая опция git, но здесь честно не разобрана (второй ответ правила области)', () => {
    const { result } = run(baseState(), 'git status -s')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
    expect(result.output).not.toMatch(/^error: unknown/)
  })

  it('pathspec после git status — реальная возможность git (фильтр по пути), здесь не разобрана', () => {
    const { result } = run(baseState(), 'git status style.css')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('[тренажёр]')
  })

  it('полностью неизвестная опция — буквальная ошибка git, а не честный отказ', () => {
    const { result } = run(baseState(), 'git status --bogus-option')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: unknown option `bogus-option'")
  })

  it('одинокий "--" без ничего после — тот же голый статус, что и без него', () => {
    const { result } = run(baseState(), 'git status --')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('On branch master\nnothing to commit, working tree clean')
  })

  // При удалённом файле подсказка блока "Changes not staged" — "git add/rm
  // <file>...", не голое "git add <file>...". Сверено напрямую (git 2.53.0, mktemp-каталог,
  // 26.09.2026, дословный вывод): только "deleted" в notStaged; "modified"+"deleted" вперемешку;
  // и отдельно — что блок "Changes to be committed" (staged) от этого не меняется ни при каком
  // составе (там подсказка всегда "git restore --staged <file>..."), поэтому этот блок здесь не
  // трогается.
  describe('подсказка "git add/rm" для удалённого файла (не голое "git add")', () => {
    it('только удаление (not staged) — подсказка "git add/rm <file>..."', () => {
      const s = deleteFile(baseState(), 'style.css')
      const { result } = run(s, 'git status')
      expect(result.ok).toBe(true)
      expect(result.output).toBe(
        'On branch master\n' +
          'Changes not staged for commit:\n' +
          '  (use "git add/rm <file>..." to update what will be committed)\n' +
          '  (use "git restore <file>..." to discard changes in working directory)\n' +
          '\tdeleted:    style.css\n' +
          '\n' +
          'no changes added to commit (use "git add" and/or "git commit -a")',
      )
    })

    it('modified + deleted вперемешку (not staged) — подсказка та же "git add/rm <file>...", одна на весь блок', () => {
      let s = createBranchingSection('base', { 'style.css': 'body{}', 'other.css': 'h1{}' })
      s = { ...s, working: { ...s.working, 'other.css': 'h1{ color: red; }' } }
      s = deleteFile(s, 'style.css')
      const { result } = run(s, 'git status')
      expect(result.ok).toBe(true)
      expect(result.output).toBe(
        'On branch master\n' +
          'Changes not staged for commit:\n' +
          '  (use "git add/rm <file>..." to update what will be committed)\n' +
          '  (use "git restore <file>..." to discard changes in working directory)\n' +
          '\tmodified:   other.css\n' +
          '\tdeleted:    style.css\n' +
          '\n' +
          'no changes added to commit (use "git add" and/or "git commit -a")',
      )
    })

    it('застейдженное удаление (git add после удаления) — блок "Changes to be committed" подсказку не меняет', () => {
      let s = deleteFile(baseState(), 'style.css')
      s = run(s, 'git add style.css').state
      const { result } = run(s, 'git status')
      expect(result.ok).toBe(true)
      expect(result.output).toBe(
        'On branch master\n' +
          'Changes to be committed:\n' +
          '  (use "git restore --staged <file>..." to unstage)\n' +
          '\tdeleted:    style.css\n',
      )
    })
  })
})
