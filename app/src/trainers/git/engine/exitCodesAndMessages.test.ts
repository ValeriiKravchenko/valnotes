// ============================================================
// Сообщения и коды возврата git-тренажёра, закреплённые прогонами настоящего git 2.53.0
// (06.10.2026): тема отката отката, git grep со «--», совет про кавычки, ошибка и usage
// git init, справка -h/--help, коды возврата раздела 1, git add '*', пояснения к отказам pull.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createUndoSection, runUndoCommand, getAllCommits, editFile } from './undoSection'
import type { UndoState } from './undoTypes'
import { createSearchSection, runSearchCommand } from './searchSection'
import { createSection, deleteFile, runCommand } from './index'
import { createBranchingSection, runBranchingCommand } from './branchSection'
import type { SectionState } from './index'
import { colleaguePush, createRemoteSection, runRemoteCommand } from './remoteSection'
import type { RemoteState } from './remoteTypes'
import { describedScope } from './scope'
import { ru } from '../locales/ru'

function describedScopeOf(cmd: 'status' | 'add' | 'commit') {
  return describedScope(cmd)
}

// ---------- Reapply ----------

function undoRun(state: UndoState, input: string) {
  const { state: next, result } = runUndoCommand(state, input)
  if (result === null) throw new Error('ожидалась команда')
  return { state: next, result }
}

function topMessage(state: UndoState): string {
  return getAllCommits(state).find((c) => c.id === state.branches[state.head])!.message
}

describe('тема коммита-отката: Revert и Reapply', () => {
  const base = () => createUndoSection({ commits: ru.undo.seed.commits })
  // Коммит с заданной темой поверх начального состояния (тема в одинарных кавычках: двойные остаются в ней).
  const commitWithMessage = (message: string) => {
    const edited = editFile(base(), 'index.html')
    return undoRun(undoRun(edited, 'git add index.html').state, `git commit -m '${message}'`).state
  }
  const COMIC = 'сменить шрифт на Comic Sans'

  it('revert коммита «Revert "X"» даёт Reapply "X" и в теме, и в выводе', () => {
    const comic = getAllCommits(base()).find((c) => c.message === COMIC)!
    const reverted = undoRun(base(), `git revert --no-edit ${comic.id}`).state
    expect(topMessage(reverted)).toBe(`Revert "${COMIC}"`)
    const { state, result } = undoRun(reverted, 'git revert --no-edit HEAD')
    expect(result.ok).toBe(true)
    expect(topMessage(state)).toBe(`Reapply "${COMIC}"`)
    expect(result.output).toMatch(new RegExp(`^\\[master [0-9a-f]{7}\\] Reapply "${COMIC}"$`))
  })

  it('откат «Reapply "X"» — снова Revert "Reapply "X"" (git не сворачивает дальше)', () => {
    const comic = getAllCommits(base()).find((c) => c.message === COMIC)!
    let s = undoRun(base(), `git revert --no-edit ${comic.id}`).state
    s = undoRun(s, 'git revert --no-edit HEAD').state
    s = undoRun(s, 'git revert --no-edit HEAD').state
    expect(topMessage(s)).toBe(`Revert "Reapply "${COMIC}""`)
  })

  it('откат коммита «Revert "Revert "x""» не сворачивается в Reapply (git не трогает уже повторённые откаты)', () => {
    let s = commitWithMessage('Revert "Revert "x""')
    expect(topMessage(s)).toBe('Revert "Revert "x""')
    s = undoRun(s, 'git revert --no-edit HEAD').state
    expect(topMessage(s)).toBe('Revert "Revert "Revert "x"""')
  })

  it('непарная кавычка: Revert "x" now -> Reapply "x" now (git меняет только префикс)', () => {
    let s = commitWithMessage('Revert "x" now')
    s = undoRun(s, 'git revert --no-edit HEAD').state
    expect(topMessage(s)).toBe('Reapply "x" now')
  })

  it('у сообщения из нескольких абзацев (-m a -m b) тема отката берётся только от первого, тело не переносится', () => {
    const edited = editFile(base(), 'index.html')
    let s = undoRun(undoRun(edited, 'git add index.html').state, "git commit -m 'Revert \"x\"' -m 'body line'").state
    s = undoRun(s, 'git revert --no-edit HEAD').state
    expect(topMessage(s)).toBe('Reapply "x"')
    const plain = undoRun(undoRun(editFile(base(), 'index.html'), 'git add index.html').state, 'git commit -m a -m b').state
    const { state, result } = undoRun(plain, 'git revert --no-edit HEAD')
    expect(topMessage(state)).toBe('Revert "a"')
    expect(result.output).toMatch(/^\[master [0-9a-f]{7}\] Revert "a"$/)
  })

  it('тема отката — первая строка сообщения: «a⏎b» даёт Revert "a", а не весь абзац', () => {
    let s = commitWithMessage('a\nb')
    s = undoRun(s, 'git revert --no-edit HEAD').state
    expect(topMessage(s)).toBe('Revert "a"')
    s = commitWithMessage('Revert "x\ny"')
    s = undoRun(s, 'git revert --no-edit HEAD').state
    expect(topMessage(s)).toBe('Reapply "x')
    s = commitWithMessage('Revert "x"\n\nbody')
    expect(topMessage(undoRun(s, 'git revert --no-edit HEAD').state)).toBe('Reapply "x"')
  })

  it('обычный откат остаётся Revert "X"', () => {
    const comic = getAllCommits(base()).find((c) => c.message === COMIC)!
    expect(topMessage(undoRun(base(), `git revert --no-edit ${comic.id}`).state)).toBe(`Revert "${COMIC}"`)
  })
})

// ---------- git grep ----------

function searchRun(input: string) {
  const { result } = runSearchCommand(createSearchSection({ commits: ru.searching.seed.commits }), input)
  if (result === null) throw new Error('ожидалась команда')
  return result
}

describe('git grep <слово> <файл> со «--»', () => {
  it('со «--» слово после шаблона — не ревизия: unable to resolve revision, код 128', () => {
    const r = searchRun('git grep -n debounce utils.js -- utils.js')
    expect(r.ok).toBe(false)
    expect(r.output).toBe('fatal: unable to resolve revision: utils.js')
    expect(r.exitCode).toBe(128)
  })

  it('«--» без путей после него — тот же отказ', () => {
    expect(searchRun('git grep debounce nosuch.js --').output).toBe('fatal: unable to resolve revision: nosuch.js')
  })

  it('без «--» по-прежнему ambiguous argument', () => {
    expect(searchRun('git grep -n debounce nosuch.js').output).toContain("fatal: ambiguous argument 'nosuch.js'")
  })

  it('со «--» и путями после него поиск как раньше', () => {
    expect(searchRun('git grep -n debounce -- utils.js').ok).toBe(true)
  })

  it('«--» перед шаблоном: шаблон — слово после него, а не «no pattern given»', () => {
    const plain = searchRun('git grep debounce utils.js')
    const r = searchRun('git grep -- debounce utils.js')
    expect(r.ok).toBe(true)
    expect(r.output).toBe(plain.output)
    expect(r.output).not.toBe('')
    expect(searchRun('git grep -n -- debounce utils.js').output).toBe(searchRun('git grep -n debounce utils.js').output)
    expect(searchRun('git grep -- debounce').output).toBe(searchRun('git grep debounce').output)
  })

  it('«--» перед шаблоном: второе слово разбирается как без «--» (ambiguous argument)', () => {
    expect(searchRun('git grep -- debounce nosuch.js').output).toContain("fatal: ambiguous argument 'nosuch.js'")
  })

  it('голое «--» — по-прежнему no pattern given, код 128', () => {
    const r = searchRun('git grep --')
    expect(r.output).toBe('fatal: no pattern given')
    expect(r.exitCode).toBe(128)
  })
})

describe('git grep: совет про кавычки повторяет форму команды', () => {
  it('без флагов совет без -n', () => {
    const r = searchRun('git grep export function')
    expect(r.explanation).toContain("git grep 'export function'")
    expect(r.explanation).not.toContain('git grep -n')
  })

  it('с -i совет с -i, а не с -n', () => {
    const r = searchRun('git grep -i export function')
    expect(r.explanation).toContain("git grep -i 'export function'")
    expect(r.explanation).not.toContain('-n')
  })

  it('с -n -i совет с обоими', () => {
    expect(searchRun('git grep -n -i export function').explanation).toContain("git grep -n -i 'export function'")
  })

  it('со «--» речь говорит только про ревизию', () => {
    const r = searchRun('git grep export function --')
    expect(r.explanation).toContain('до «--» git понимает как ревизию')
    expect(r.explanation).not.toContain('как ревизию или путь')
  })
})

// ---------- раздел 1 ----------

function run1(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

describe('git init с несуществующей опцией', () => {
  it.each([
    ['git init --bogus', "error: unknown option `bogus'"],
    ['git init --bogus=1', "error: unknown option `bogus=1'"],
    ['git init -Z', "error: unknown switch `Z'"],
    ['git init -qZ', "error: unknown switch `Z'"],
  ])('%s — настоящая ошибка git, usage, код 129, без пояснения про «принимает аргументы»', (cmd, first) => {
    const { state, result } = runCommand(createSection(), cmd)
    expect(result?.ok).toBe(false)
    expect(result?.exitCode).toBe(129)
    expect(result?.output.split('\n')[0]).toBe(first)
    expect(result?.output).toContain('usage: git init [-q | --quiet] [--bare]')
    expect(result?.output).not.toContain('[тренажёр]')
    expect(state.initialized).toBe(false)
  })

  it('usage заканчивается ровно одной пустой строкой, как у git (песочница: хвост «use\\n\\n», 1053 байта вместе со строкой ошибки)', () => {
    const output = runCommand(createSection(), 'git init --bogus').result?.output ?? ''
    expect(output.endsWith('specify the reference format to use\n\n')).toBe(true)
    expect(output.endsWith('\n\n\n')).toBe(false)
    expect(output.length).toBe(1053)
  })

  it('ошибка первой плохой опции, даже если перед ней значение или опция со значением', () => {
    for (const cmd of ['git init -b main --bogus', 'git init -qb main --bogus', 'git init -bmain --bogus', 'git init --initial-branch main --bogus', 'git init --ini x --bogus', 'git init --template=x --bogus', 'git init --no-template --bogus', 'git init --shared --bogus', 'git init x -q --bogus', 'git init --bogus -h', 'git init --bogus --help']) {
      const { result } = runCommand(createSection(), cmd)
      expect(result?.output.split('\n')[0], cmd).toBe("error: unknown option `bogus'")
      expect(result?.exitCode, cmd).toBe(129)
    }
  })

  it('формы, где git ошибки не печатает или печатает другую, — честный отказ области, а не выдуманная ошибка', () => {
    for (const cmd of [
      'git init --help',
      'git init --help-all',
      'git init -h',
      'git init -h --bogus',
      'git init --help --bogus',
      'git init -b --bogus',
      'git init -qb -Z',
      'git init --initial-branch --bogus',
      'git init --init --bogus',
      'git init --template --bogus',
      'git init --separate-git-dir --bogus',
      'git init --object-format --bogus',
      'git init --ref-format --bogus',
      'git init --end-of-options --bogus',
      'git init --git-completion-helper',
      'git init --git-completion-helper --bogus',
      'git init -b',
      'git init --s',
    ]) {
      const { result } = runCommand(createSection(), cmd)
      expect(result?.output, cmd).toBe(ru.errors.initArgumentsOutOfScope(cmd))
      expect(result?.exitCode, cmd).toBeUndefined()
    }
  })

  it('настоящие опции (-q, --bare, сокращение) по-прежнему честный отказ области, без кода', () => {
    for (const cmd of ['git init -q', 'git init --bare', 'git init --qui', 'git init -b main', 'git init extra']) {
      const { result } = runCommand(createSection(), cmd)
      expect(result?.output, cmd).toBe(ru.errors.initArgumentsOutOfScope(cmd))
      expect(result?.exitCode, cmd).toBeUndefined()
    }
  })

  it('после «--» опций нет', () => {
    expect(runCommand(createSection(), 'git init -- --bogus').result?.output).toBe(ru.errors.initArgumentsOutOfScope('git init -- --bogus'))
  })
})

describe('git status/add/commit -h и --help', () => {
  const inited = () => run1(createSection(), 'git init')

  it.each(['git status -h', 'git status --help', 'git add -h', 'git add --help', 'git add x -h', 'git commit -h', 'git commit --help', 'git commit -m x -h', 'git status -sh'])(
    '%s — честный отказ области (справку тренажёр не печатает), а не unknown option/switch',
    (cmd) => {
      const { result } = runCommand(inited(), cmd)
      expect(result?.ok).toBe(false)
      expect(result?.output, cmd).toContain('настоящий git покажет справку')
      expect(result?.output, cmd).not.toContain('unknown')
      expect(result?.exitCode, cmd).toBeUndefined()
    },
  )

  it('опция до -h выигрывает, как у git: status --bogus -h — unknown option', () => {
    expect(runCommand(inited(), 'git status --bogus -h').result?.output).toBe("error: unknown option `bogus'")
  })

  it('«-h» после «--» — путь, а не справка', () => {
    expect(runCommand(inited(), 'git add -- -h').result?.output).toBe("fatal: pathspec '-h' did not match any files")
  })

  it('сокращение --he справкой не считается: unknown option', () => {
    expect(runCommand(inited(), 'git status --he').result?.output).toBe("error: unknown option `he'")
  })
})

describe('справка status/add/commit до git init', () => {
  const fresh = () => createSection()
  const NOT_A_REPO = 'fatal: not a git repository (or any of the parent directories): .git'
  const cmds = ['status', 'add', 'commit'] as const

  it.each(cmds)('git %s -h единственным аргументом — отказ справки с кодом 129, не «not a git repository»', (cmd) => {
    const { result } = runCommand(fresh(), `git ${cmd} -h`)
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(ru.errors.helpOutOfScope(`git ${cmd} -h`, describedScopeOf(cmd)))
    expect(result?.exitCode).toBe(129)
    expect(result?.explanation).toBeNull()
  })

  it.each(cmds)('git %s --help первым аргументом — отказ справки с кодом 0; с путём после — тоже', (cmd) => {
    for (const input of [`git ${cmd} --help`, `git ${cmd} --help x`]) {
      const { result } = runCommand(fresh(), input)
      expect(result?.output, input).toBe(ru.errors.helpOutOfScope(`git ${cmd} --help`, describedScopeOf(cmd)))
      expect(result?.exitCode, input).toBe(0)
    }
  })

  it.each(cmds)('git %s --help -s и --help -h: git отвечает ошибкой/usage git help, код 129; текст не обещает справку по команде', (cmd) => {
    for (const rest of ['-s', '-h', 'x -s']) {
      const { result } = runCommand(fresh(), `git ${cmd} --help ${rest}`)
      expect(result?.output, rest).toBe(ru.errors.helpErrorOutOfScope(`git ${cmd} --help ${rest}`, describedScopeOf(cmd)))
      expect(result?.output, rest).not.toContain('покажет справку')
      expect(result?.exitCode, rest).toBe(129)
    }
  })

  it.each(cmds)('git %s --help --: «--» обрывает разбор git help, код 0 (как --help x); после «--» опции не читаются', (cmd) => {
    for (const rest of ['--', '-- -s', '-- -h', 'x -- -s']) {
      const { result } = runCommand(fresh(), `git ${cmd} --help ${rest}`)
      expect(result?.output, rest).toBe(ru.errors.helpOutOfScope(`git ${cmd} --help`, describedScopeOf(cmd)))
      expect(result?.exitCode, rest).toBe(0)
    }
  })

  it.each(cmds)('git %s --help -v / --bogus: код у git зависит от опции и окружения — отказ справки без кода', (cmd) => {
    for (const rest of ['-v', '--bogus', '-a']) {
      const { result } = runCommand(fresh(), `git ${cmd} --help ${rest}`)
      expect(result?.output, rest).toBe(ru.errors.helpOutOfScope(`git ${cmd} --help`, describedScopeOf(cmd)))
      expect(result?.exitCode, rest).toBeUndefined()
    }
  })

  it.each(cmds)('git %s --help-all единственным аргументом — отказ справки, код 129', (cmd) => {
    const { result } = runCommand(fresh(), `git ${cmd} --help-all`)
    expect(result?.output).toBe(ru.errors.helpOutOfScope(`git ${cmd} --help-all`, describedScopeOf(cmd)))
    expect(result?.exitCode).toBe(129)
  })

  it.each(cmds)('git %s: все остальные формы с -h/--help-all остаются «not a git repository», код 128', (cmd) => {
    for (const args of ['-s -h', 'x -h', '-sh', '-hZ', '-Zh', '-h -h', '-h x', '-h \'\'', '-- -h', '--help=x', '--help-all x', '-h --help-all', '--git-completion-helper', '--end-of-options', '--end-of-options x']) {
      const { result } = runCommand(fresh(), `git ${cmd} ${args}`)
      expect(result?.output, args).toBe(NOT_A_REPO)
      expect(result?.exitCode, args).toBe(128)
    }
  })

  it('после git init те же формы разбираются как раньше (справка остаётся отказом, -sh у status — тоже)', () => {
    const inited = run1(createSection(), 'git init')
    expect(runCommand(inited, 'git status -h').result?.output).toContain('настоящий git покажет справку')
    expect(runCommand(inited, 'git status -s -h').result?.output).toContain('настоящий git покажет справку')
  })
})

describe('git status/add/commit: --help-all, --git-completion-helper, --end-of-options', () => {
  const inited = () => run1(createSection(), 'git init')

  it.each(['status', 'add', 'commit'])('git %s --help-all — отказ справки, а не unknown option', (cmd) => {
    const { result } = runCommand(inited(), `git ${cmd} --help-all`)
    expect(result?.output).toContain('настоящий git покажет справку')
    expect(result?.output).not.toContain('unknown')
  })

  it.each(['status', 'add', 'commit'])('git %s --git-completion-helper и --end-of-options — отказ области: опции настоящие, раздел их не разбирает', (cmd) => {
    for (const flag of ['--git-completion-helper', '--end-of-options']) {
      const { result } = runCommand(inited(), `git ${cmd} ${flag}`)
      expect(result?.output, flag).toContain(`git ${cmd} ${flag} — настоящая опция git`)
      expect(result?.output, flag).not.toContain('unknown')
      expect(result?.exitCode, flag).toBeUndefined()
    }
  })

  it('опция до них выигрывает, как у git: status --bogus --help-all — unknown option', () => {
    expect(runCommand(inited(), 'git status --bogus --help-all').result?.output).toBe("error: unknown option `bogus'")
  })

  it('сокращение --help-al справкой не считается: unknown option', () => {
    expect(runCommand(inited(), 'git commit --help-al').result?.output).toBe("error: unknown option `help-al'")
  })

  it('согласованно с git init: те же три формы у init — отказ области, не ошибка', () => {
    for (const flag of ['--help-all', '--git-completion-helper', '--end-of-options']) {
      expect(runCommand(createSection(), `git init ${flag}`).result?.output, flag).toBe(ru.errors.initArgumentsOutOfScope(`git init ${flag}`))
    }
  })
})

describe('git commit: буква h в кластере коротких опций — справка, дальше кластер не читается', () => {
  const HELP = 'настоящий git покажет справку'

  it('раздел 1: -hZ, -ahZ, -qhZ — отказ справки, а не unknown switch Z', () => {
    const inited = run1(createSection(), 'git init')
    for (const flags of ['-hZ', '-ahZ', '-qhZ', '-hq', '-ha', '-ah']) {
      const { result } = runCommand(inited, `git commit ${flags}`)
      expect(result?.output, flags).toContain(HELP)
      expect(result?.output, flags).not.toContain('unknown')
    }
  })

  it('раздел 1: буква до h разбирается раньше — -Zh даёт unknown switch Z, как у git', () => {
    const inited = run1(createSection(), 'git init')
    expect(runCommand(inited, 'git commit -Zh').result?.output).toBe("error: unknown switch `Z'")
  })

  it('раздел 2: -hZ, -ahZ, -qhZ — отказ справки; -Zh — unknown switch Z', () => {
    const state = createBranchingSection('Начальный коммит', { 'style.css': 'a' })
    for (const flags of ['-hZ', '-ahZ', '-qhZ']) {
      const output = runBranchingCommand(state, `git commit ${flags}`).result?.output
      expect(output, flags).toContain(HELP)
      expect(output, flags).not.toContain('unknown')
    }
    expect(runBranchingCommand(state, 'git commit -Zh').result?.output).toBe("error: unknown switch `Z'")
  })

  it('раздел 4: -hZ, -ahZ, -qhZ — отказ справки; -Zh — unknown switch Z', () => {
    const state = createUndoSection({ commits: ru.undo.seed.commits })
    for (const flags of ['-hZ', '-ahZ', '-qhZ']) {
      const output = undoRun(state, `git commit ${flags}`).result.output
      expect(output, flags).toContain(HELP)
      expect(output, flags).not.toContain('unknown')
    }
    expect(undoRun(state, 'git commit -Zh').result.output).toBe("error: unknown switch `Z'")
  })

  it('раздел 5: -hZ, -ahZ, -qhZ — отказ справки; -Zh — unknown switch Z', () => {
    const state = createRemoteSection({ server: ru.remote.seed.server })
    const cloned = remoteRun(state, 'git clone origin local').state
    for (const flags of ['-hZ', '-ahZ', '-qhZ']) {
      const output = remoteRun(cloned, `git commit ${flags}`).result.output
      expect(output, flags).toContain(HELP)
      expect(output, flags).not.toContain('unknown')
    }
    expect(remoteRun(cloned, 'git commit -Zh').result.output).toBe("error: unknown switch `Z'")
  })

})

describe('--help-all и --git-completion-helper в разделах 2, 4, 5', () => {
  const COMPLETION = "error: unknown option `git-completion-helper'"
  const sec2 = () => runBranchingCommand(createBranchingSection('Начальный коммит', { 'style.css': 'a' }), 'git branch dev').state
  const sec4 = () => createUndoSection({ commits: ru.undo.seed.commits })
  const sec5 = () => remoteRun(createRemoteSection({ server: ru.remote.seed.server }), 'git clone origin local').state
  // Раздел → исполнитель и команды, которые в нём есть (merge — только в разделе 2, checkout — в 2 и 5).
  const sections: [string, (input: string) => { output: string; exitCode?: number }, string[]][] = [
    ['2', (i) => runBranchingCommand(sec2(), i).result!, ['add', 'commit', 'status', 'branch', 'checkout', 'merge']],
    ['4', (i) => undoRun(sec4(), i).result, ['add', 'commit', 'status', 'branch']],
    ['5', (i) => remoteRun(sec5(), i).result, ['add', 'commit', 'status', 'branch', 'checkout']],
  ]

  it('--help-all у всех команд всех разделов — отказ справки (usage у git, 129)', () => {
    for (const [name, exec, cmds] of sections) {
      for (const cmd of cmds) {
        const out = exec(`git ${cmd} --help-all`).output
        expect(out, `${name} ${cmd}`).toMatch(new RegExp(`^\\[тренажёр\\] git ${cmd} --help-all — настоящий git покажет справку\\.`))
      }
    }
  })

  it('--git-completion-helper единственным аргументом — отказ области «настоящая возможность git», не unknown option', () => {
    for (const [name, exec, cmds] of sections) {
      for (const cmd of cmds) {
        const out = exec(`git ${cmd} --git-completion-helper`).output
        expect(out, `${name} ${cmd}`).toMatch(new RegExp(`^\\[тренажёр\\] git ${cmd} --git-completion-helper — настоящая возможность git, но `))
      }
    }
  })

  it('--git-completion-helper с любым другим аргументом — unknown option `git-completion-helper\' (раздел 5 — с кодом 129)', () => {
    for (const [name, exec, cmds] of sections) {
      for (const cmd of cmds) {
        for (const args of ['--git-completion-helper dev', 'dev --git-completion-helper', '--git-completion-helper --git-completion-helper', '--git-completion-helper -h', '--git-completion-helper --help-all', '--git-completion-helper --bogus']) {
          const r = exec(`git ${cmd} ${args}`)
          expect(r.output, `${name} ${cmd} ${args}`).toBe(COMPLETION)
          if (name === '5') expect(r.exitCode, `${cmd} ${args}`).toBe(129)
        }
      }
    }
  })

  it('слева направо: опция раньше --git-completion-helper с ошибкой или справкой выигрывает', () => {
    for (const [name, exec, cmds] of sections) {
      for (const cmd of cmds) {
        expect(exec(`git ${cmd} --bogus --git-completion-helper`).output, `${name} ${cmd}`).toBe("error: unknown option `bogus'")
        expect(exec(`git ${cmd} --bogus --help-all`).output, `${name} ${cmd}`).toBe("error: unknown option `bogus'")
        expect(exec(`git ${cmd} -h --git-completion-helper`).output, `${name} ${cmd}`).toContain('настоящий git покажет справку')
        expect(exec(`git ${cmd} --help-all --git-completion-helper`).output, `${name} ${cmd}`).toContain('настоящий git покажет справку')
      }
    }
  })

  it('status/add: неизвестный короткий флаг перед --git-completion-helper выигрывает (у git: unknown switch `q\')', () => {
    for (const cmd of ['status', 'add']) {
      expect(runBranchingCommand(sec2(), `git ${cmd} -q --git-completion-helper`).result?.output).toBe("error: unknown switch `q'")
    }
  })

  it('после «--» и «--end-of-options» флаг — не опция: обычный разбор, а не unknown option', () => {
    expect(runBranchingCommand(sec2(), 'git add -- --git-completion-helper').result?.output).toBe("fatal: pathspec '--git-completion-helper' did not match any files")
    expect(runBranchingCommand(sec2(), 'git merge -- --git-completion-helper').result?.output).toBe('merge: --git-completion-helper - not something we can merge')
    expect(runBranchingCommand(sec2(), 'git checkout --end-of-options --git-completion-helper').result?.output).toContain('--end-of-options')
  })
})

describe('git commit: «-mh», «-amh», «-am h» — сообщение «h», коммит создаётся', () => {
  it.each(['-mh', '-amh', '-am h', '-m h', '-m -h'])('раздел 1: git commit %s', (flags) => {
    const staged = run1(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(staged, `git commit ${flags}`)
    expect(result?.ok, flags).toBe(true)
    expect(result?.output, flags).toMatch(new RegExp(`^\\[master \\(root-commit\\) [0-9a-f]{7}\\] ${flags.endsWith('-h') ? '-h' : 'h'}$`, 'm'))
  })
})

describe('коды возврата раздела 1', () => {
  const fresh = () => createSection()
  const inited = () => run1(createSection(), 'git init')
  const code = (s: SectionState, cmd: string) => runCommand(s, cmd).result?.exitCode

  it('вне репозитория status/add/commit — 128', () => {
    for (const cmd of ['git status', 'git add index.html', 'git commit -m "x"']) expect(code(fresh(), cmd), cmd).toBe(128)
  })

  it('add несуществующего файла — 128; в том числе после «--» и с «*» без файлов', () => {
    expect(code(inited(), 'git add nosuch')).toBe(128)
    expect(code(inited(), 'git add -- nosuch')).toBe(128)
    expect(code(deleteFile(inited(), 'index.html'), "git add '*'")).toBe(128)
  })

  it('commit -a с путём — 128', () => {
    expect(code(inited(), 'git commit -am "x" index.html')).toBe(128)
  })

  it('неизвестная и неоднозначная опция, -m без значения — 129', () => {
    const s = inited()
    expect(code(s, 'git status --bogus')).toBe(129)
    expect(code(s, 'git add --bogus')).toBe(129)
    expect(code(s, 'git commit --bogus')).toBe(129)
    expect(code(s, 'git status --s')).toBe(129)
    expect(code(s, 'git commit -m')).toBe(129)
  })

  it('git без подкоманды и неизвестная подкоманда — 1; нечего коммитить, пустое сообщение, неизвестный путь — 1', () => {
    const s = inited()
    expect(code(s, 'git')).toBe(1)
    expect(code(s, 'git nosuchcmd')).toBe(1)
    expect(code(s, 'git commit -m "x"')).toBe(1) // ничего не добавлено в индекс
    expect(code(s, 'git commit -m "x" nosuch')).toBe(1)
    expect(code(run1(s, 'git add index.html'), 'git commit -m ""')).toBe(1)
  })

  it('успех — код не задан, честные отказы области — тоже', () => {
    const s = inited()
    expect(code(s, 'git add index.html')).toBeUndefined()
    expect(code(s, 'git add ./index.html')).toBeUndefined()
    expect(code(s, 'git log')).toBeUndefined()
  })
})

describe("git add '*' в пустом репозитории", () => {
  const empty = () => deleteFile(run1(createSection(), 'git init'), 'index.html')

  it("в кавычках: git отказывает (128), пояснение говорит про шаблон и кавычки, а не про имя файла", () => {
    const { result } = runCommand(empty(), "git add '*'")
    expect(result?.output).toBe("fatal: pathspec '*' did not match any files")
    expect(result?.exitCode).toBe(128)
    expect(result?.explanation).toBe(ru.explain.addQuotedStarNoMatch)
    expect(result?.explanation).not.toContain('Имя должно совпадать')
    expect(result?.explanation).toContain('Кавычки')
  })

  it('двойные кавычки — то же', () => {
    expect(runCommand(empty(), 'git add "*"').result?.explanation).toBe(ru.explain.addQuotedStarNoMatch)
  })

  it('без кавычек пояснение прежнее (шелл передал «*» как есть)', () => {
    expect(runCommand(empty(), 'git add *').result?.explanation).toBe(ru.explain.addStarNoMatch)
  })

  it('«*» в кавычках при наличии файлов работает как шаблон git и ошибки нет', () => {
    const { result } = runCommand(run1(createSection(), 'git init'), "git add '*'")
    expect(result?.ok).toBe(true)
  })
})

// ---------- pull ----------

function remoteRun(state: RemoteState, input: string) {
  const { state: next, result } = runRemoteCommand(state, input)
  if (result === null) throw new Error('ожидалась команда')
  return { state: next, result }
}

describe('пояснения к отказам pull', () => {
  const cloned = () => remoteRun(createRemoteSection({ server: ru.remote.seed.server }), 'git clone origin local').state

  it("pull origin <нет такой ветки>: «couldn't find remote ref» с пояснением, код 1", () => {
    const { result } = remoteRun(cloned(), 'git pull origin nosuch')
    expect(result.output).toBe("fatal: couldn't find remote ref nosuch")
    expect(result.exitCode).toBe(1)
    expect(result.explanation).toBe(ru.remote.explain.pullRemoteRefMissing('nosuch', { localCopy: false, otherCase: null }))
    expect(result.explanation).toContain('«nosuch»')
    expect(result.explanation).not.toContain('Регистр')
    expect(result.explanation).not.toContain('точно')
  })

  it('origin/master: пояснение говорит, что это локальная запись, а на сервере ветка называется master', () => {
    const { result } = remoteRun(cloned(), 'git pull origin origin/master')
    expect(result.output).toBe("fatal: couldn't find remote ref origin/master")
    expect(result.exitCode).toBe(1)
    expect(result.explanation).toContain('локальная запись')
    expect(result.explanation).toContain('git pull origin <ветка>')
  })

  it('origin/<несуществующая>: «локальной записи» у игрока нет — пояснение её не упоминает', () => {
    const { result } = remoteRun(cloned(), 'git pull origin origin/nosuch')
    expect(result.output).toBe("fatal: couldn't find remote ref origin/nosuch")
    expect(result.exitCode).toBe(1)
    expect(result.explanation).toBe(ru.remote.explain.pullRemoteRefMissing('origin/nosuch', { localCopy: false, otherCase: null }))
    expect(result.explanation).not.toContain('локальная запись')
  })

  it('имена, которые git сопоставляет сам (heads/master, refs/heads/master, tags/x), — честный отказ области, а не выдуманный fatal', () => {
    for (const name of ['heads/master', 'refs/heads/master', 'tags/v1']) {
      const { result } = remoteRun(cloned(), `git pull origin ${name}`)
      expect(result.output, name).not.toContain("couldn't find remote ref")
      expect(result.output, name).toContain('git pull origin ' + name)
      expect(result.exitCode, name).toBeUndefined()
    }
  })

  it('имена с нарушением правил имён ссылок (git: invalid refspec) — отказ области, а не выдуманный «couldn\'t find remote ref»', () => {
    for (const name of ['master/', '/master', '.master', 'master..x', 'master.lock', 'x/.y', 'a//b', 'a.', 'x.lock/y']) {
      const { result } = remoteRun(cloned(), `git pull origin ${name}`)
      expect(result.ok, name).toBe(false)
      expect(result.output, name).toBe(ru.remote.errors.refnameShapeOutOfScope(`git pull origin ${name}`, 'git pull, git pull origin <ветка>, git pull --no-rebase, git pull --ff-only'))
      expect(result.output, name).not.toContain("couldn't find")
      expect(result.exitCode, name).toBeUndefined()
    }
  })

  it('имена с ^, @{, ? и * раздел отказывает раньше (ревизия / маска шелла) — всё равно честный отказ, а не «couldn\'t find remote ref»', () => {
    for (const name of ['a^b', 'a@{b', 'a?b', 'a*b']) {
      const { result } = remoteRun(cloned(), `git pull origin ${name}`)
      expect(result.output, name).toMatch(/^\[тренажёр\] /)
      expect(result.output, name).not.toContain("couldn't find")
    }
  })

  it('допустимые по форме, но несуществующие имена по-прежнему «couldn\'t find remote ref» (feature/x, a.b)', () => {
    for (const name of ['feature/x', 'a.b', 'nosuch']) {
      const { result } = remoteRun(cloned(), `git pull origin ${name}`)
      expect(result.output, name).toBe(`fatal: couldn't find remote ref ${name}`)
      expect(result.exitCode, name).toBe(1)
    }
  })

  it('регистр имени важен: Master — нет такой ветки', () => {
    const { result } = remoteRun(cloned(), 'git pull origin Master')
    expect(result.output).toBe("fatal: couldn't find remote ref Master")
    expect(result.explanation).toContain('«Master»')
    expect(result.explanation).toContain('Регистр')
  })

  it('конфликт при слиянии pull: отказ области с пояснением, ветка не тронута, fetch выполнен', () => {
    let state = colleaguePush(cloned(), ru.remote.seed.colleague) // у коллеги на сервере CHANGELOG.md
    const local = state.local!
    state = { ...state, local: { ...local, working: { ...local.working, 'CHANGELOG.md': 'свой changelog' } } }
    state = remoteRun(remoteRun(state, 'git add CHANGELOG.md').state, 'git commit -m "свой changelog"').state
    const tip = state.local!.branches[state.local!.head]
    const { state: after, result } = remoteRun(state, 'git pull --no-rebase')
    expect(result.ok).toBe(false)
    expect(result.output).toContain(ru.remote.errors.pullConflictOutOfScope([{ file: 'CHANGELOG.md', kind: 'add-add' }]))
    expect(result.explanation).toBe(`${ru.remote.explain.pullIsFetchPlusIntegration} ${ru.remote.explain.pullConflictStopped}`)
    expect(after.local!.branches[after.local!.head]).toBe(tip)
    expect(after.local!.remoteBranches[after.local!.head]).not.toBe(state.local!.remoteBranches[state.local!.head])
  })

  it('конфликт после предварительного git fetch: пояснение остаётся верным (fetch-часть pull ничего не обновила)', () => {
    let state = colleaguePush(cloned(), ru.remote.seed.colleague)
    const local = state.local!
    state = { ...state, local: { ...local, working: { ...local.working, 'CHANGELOG.md': 'свой changelog' } } }
    state = remoteRun(remoteRun(state, 'git add CHANGELOG.md').state, 'git commit -m "свой changelog"').state
    state = remoteRun(state, 'git fetch').state
    const fetched = state.local!.remoteBranches[state.local!.head]
    const { state: after, result } = remoteRun(state, 'git pull --no-rebase')
    expect(result.ok).toBe(false)
    expect(result.explanation).toBe(`${ru.remote.explain.pullIsFetchPlusIntegration} ${ru.remote.explain.pullConflictStopped}`)
    expect(result.explanation).toContain('верно и после предварительного git fetch')
    expect(result.explanation).not.toContain('обновлена')
    expect(after.local!.remoteBranches[after.local!.head]).toBe(fetched)
  })
})
