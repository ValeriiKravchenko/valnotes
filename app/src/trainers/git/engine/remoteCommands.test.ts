// ============================================================
// Раздел 5 git-тренажёра («Командная работа»): сквозные проверки команд
// терминала LOCAL (clone/remote/branch/checkout/add/commit/status/fetch/
// push/pull/config) через публичный вход remoteSection.ts, плюс кнопка
// «Коллега пушит» и пять миссий.
//
// Тексты и коды исходов сверены запуском настоящего git 2.53.0 (LC_ALL=C,
// без глобального конфига) во временном каталоге 26.09.2026 — не по
// памяти, см. docs/git-trainer/reports/section5-git-runs.txt. Ссылки вида
// S5-NN — проверки из spec.md, раздел 6 (там же где target.md меняет
// ожидание — по target.md, часть VII, «Откуда берётся правда», таблица).
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  colleaguePush,
  createRemoteSection,
  getAllLocalCommits,
  getLocalBranchNames,
  getLocalCurrentBranch,
  getRemoteBranchNames,
  getRemoteMissions,
  isCloned,
  runRemoteCommand,
} from './remoteSection'
import type { RemoteState } from './remoteTypes'
import { ru } from '../locales/ru'

function run(state: RemoteState, input: string) {
  const { state: next, result } = runRemoteCommand(state, input)
  if (result === null) throw new Error('ожидалась команда, а не пустая строка')
  return { state: next, result }
}

function runAll(state: RemoteState, ...inputs: string[]): RemoteState {
  return inputs.reduce((s, line) => run(s, line).state, state)
}

/** target.md, часть VII, «Исходное состояние»: сервер с одним коммитом, копии ещё нет. */
function baseState(): RemoteState {
  return createRemoteSection({ server: ru.remote.seed.server })
}

/** Состояние сразу после успешного `git clone origin local`. */
function clonedState(): RemoteState {
  return run(baseState(), 'git clone origin local').state
}

const SERVER_PATH = '/team/origin'

describe('до clone (target.md, часть VII, «Исходное состояние»)', () => {
  it('S5-01: любая другая команда — "not a git repository", код 128', () => {
    const { result } = run(baseState(), 'git status')
    expect(result.ok).toBe(false)
    expect(result.output).toBe('fatal: not a git repository (or any of the parent directories): .git')
    expect(result.exitCode).toBe(128)
  })

  it('git clone без аргументов — usage + fatal, код 129', () => {
    const { result } = run(baseState(), 'git clone')
    expect(result.exitCode).toBe(129)
    expect(result.output).toContain('fatal: You must specify a repository to clone.')
    expect(result.output).toContain('usage: git clone')
  })

  it('git clone -x — unknown switch + usage, код 129', () => {
    const { result } = run(baseState(), 'git clone -x origin local')
    expect(result.exitCode).toBe(129)
    expect(result.output).toContain("error: unknown switch `x'")
    expect(result.output).toContain('usage: git clone')
  })

  it('git clone nosuch local — репозиторий не существует, код 128', () => {
    const { result } = run(baseState(), 'git clone nosuch local')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: repository 'nosuch' does not exist")
    expect(result.exitCode).toBe(128)
  })

  it('S5-06: git clone по URL — честный отказ по правилу области, копия не создаётся', () => {
    const { state, result } = run(baseState(), 'git clone https://github.com/team/site.git local')
    expect(result.ok).toBe(false)
    expect(result.output).not.toContain('fatal: repository')
    expect(state.local).toBeNull()
  })

  it('git clone origin другая-папка — честный отказ по правилу области (не наш единственный сценарий)', () => {
    const { result } = run(baseState(), 'git clone origin somewhere')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('git clone origin local')
  })

  it('git clone origin local — успех, "Cloning into..." + "done.", код 0, миссия 1 засчитана', () => {
    const { state, result } = run(baseState(), 'git clone origin local')
    expect(result.ok).toBe(true)
    expect(result.output).toBe("Cloning into 'local'...\ndone.")
    expect(result.exitCode).toBe(0)
    expect(isCloned(state)).toBe(true)
    expect(getRemoteMissions(state).find((m) => m.id === 'cloneRepo')?.done).toBe(true)
  })

  it('S5-05/опасное место 11: повторный clone уже ВНУТРИ копии — "repository origin does not exist", код 128 (не "already exists")', () => {
    const { result } = run(clonedState(), 'git clone origin local')
    expect(result.output).toBe("fatal: repository 'origin' does not exist")
    expect(result.exitCode).toBe(128)
  })
})

describe('remote/branch после clone (target.md, часть VII, «Что входит»)', () => {
  it('S5-02: git remote — "origin"', () => {
    const { result } = run(clonedState(), 'git remote')
    expect(result.output).toBe('origin')
  })

  it('S5-03: git remote -v — адрес, не URL', () => {
    const { result } = run(clonedState(), 'git remote -v')
    expect(result.output).toBe(`origin\t${SERVER_PATH} (fetch)\norigin\t${SERVER_PATH} (push)`)
  })

  it('S5-04: git remote add x y — честный отказ, а не «ошибка» и не молчаливый успех', () => {
    const { result } = run(clonedState(), 'git remote add x y')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('git remote add x y')
  })

  it('git remote -x — unknown switch + usage, код 129', () => {
    const { result } = run(clonedState(), 'git remote -x')
    expect(result.exitCode).toBe(129)
    expect(result.output).toContain("error: unknown switch `x'")
  })

  it('S5-07: git branch -r — origin/HEAD и origin/master', () => {
    const { result } = run(clonedState(), 'git branch -r')
    expect(result.output).toBe('  origin/HEAD -> origin/master\n  origin/master')
  })

  it('S5-08: git branch -a — * master и remotes/origin/*', () => {
    const { result } = run(clonedState(), 'git branch -a')
    expect(result.output).toBe('* master\n  remotes/origin/HEAD -> origin/master\n  remotes/origin/master')
  })

  it('S5-09/опасное место 10: git branch -d master — нельзя удалить текущую ветку (worktree), код 1', () => {
    const { result } = run(clonedState(), 'git branch -d master')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("error: cannot delete branch 'master' used by worktree at '/team/local'")
    expect(result.exitCode).toBe(1)
  })
})

describe('git status относительно сервера (target.md, часть VII, опасное место 1)', () => {
  it('S5-10: сразу после clone — "up to date with origin/master"', () => {
    const { result } = run(clonedState(), 'git status')
    expect(result.output).toBe("On branch master\nYour branch is up to date with 'origin/master'.\n\nnothing to commit, working tree clean")
  })

  function commitReadmeEdit(state: RemoteState, suffix = ' m1'): RemoteState {
    return runAll(state, `git add README.md`, `git commit -m "правка${suffix}"`)
  }

  it('S5-11: свой коммит — "ahead of origin/master by 1 commit"', () => {
    let state = clonedState()
    state = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'README.md': state.local!.working['README.md'] + '\nправка' } } }
    state = commitReadmeEdit(state)
    const { result } = run(state, 'git status')
    expect(result.output).toBe(
      "On branch master\nYour branch is ahead of 'origin/master' by 1 commit.\n  (use \"git push\" to publish your local commits)\n\nnothing to commit, working tree clean",
    )
  })
})

/** Общий сценарий: клон + одна локальная правка README.md + add + commit — используется несколькими describe-блоками ниже. */
function clonedWithLocalCommit(): RemoteState {
  let state = clonedState()
  const content = state.local!.working['README.md'] + '\nправка игрока'
  state = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'README.md': content } } }
  return runAll(state, 'git add README.md', 'git commit -m "моя правка"')
}

describe('git push (target.md, часть VII, «Что входит» и опасное место 3)', () => {
  it('S5-12/S5-16: push отправляет коммит — вывод начинается "To ...", строка обновления без выравнивания имени', () => {
    const state = clonedWithLocalCommit()
    const { state: pushed, result } = run(state, 'git push')
    expect(result.ok).toBe(true)
    expect(result.output.startsWith(`To ${SERVER_PATH}\n`)).toBe(true)
    expect(result.output).toMatch(/ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}master -> master$/)
    expect(pushed.server.branches.master).toBe(pushed.local!.branches.master)
    expect(getRemoteMissions(pushed).find((m) => m.id === 'pushCommit')?.done).toBe(true)
  })

  it('S5-13: после push — снова "up to date with"', () => {
    const state = run(clonedWithLocalCommit(), 'git push').state
    const { result } = run(state, 'git status')
    expect(result.output).toContain("up to date with 'origin/master'")
  })

  it('S5-14: повторный push без нового — "Everything up-to-date", без "To" (миссия не по холостому push)', () => {
    const state = run(clonedWithLocalCommit(), 'git push').state
    const { result } = run(state, 'git push')
    expect(result.output).toBe('Everything up-to-date')
    expect(result.output.startsWith('To ')).toBe(false)
  })

  it('S5-15: git push -u origin master без нового — "Everything up-to-date" ПЕРВОЙ строкой, потом set-upstream (не наоборот)', () => {
    const state = run(clonedWithLocalCommit(), 'git push').state
    const { result } = run(state, 'git push -u origin master')
    expect(result.output).toBe("Everything up-to-date\nbranch 'master' set up to track 'origin/master'.")
  })

  it('git push -u origin master с новым коммитом — строка обновления, потом set-upstream', () => {
    const { result } = run(clonedWithLocalCommit(), 'git push -u origin master')
    const lines = result.output.split('\n')
    expect(lines[0]).toBe(`To ${SERVER_PATH}`)
    expect(lines[2]).toBe("branch 'master' set up to track 'origin/master'.")
  })

  it('S5-17: git push -x — unknown switch + usage, код 129, состояние не меняется', () => {
    const before = clonedState()
    const { state, result } = run(before, 'git push -x')
    expect(result.exitCode).toBe(129)
    expect(result.output).toContain("error: unknown switch `x'")
    expect(state.server).toEqual(before.server)
  })

  it('S5-18: git push master — "does not appear to be a git repository", код 128', () => {
    const { result } = run(clonedState(), 'git push master')
    expect(result.output).toContain("fatal: 'master' does not appear to be a git repository")
    expect(result.exitCode).toBe(128)
  })

  it('S5-19: git push origin nosuch — src refspec не найден, код 1', () => {
    const { result } = run(clonedState(), 'git push origin nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(`error: src refspec nosuch does not match any\nerror: failed to push some refs to '${SERVER_PATH}'`)
    expect(result.exitCode).toBe(1)
  })

  it('S5-20: git push origin HEAD — ok (эквивалентно push текущей ветки)', () => {
    const { result } = run(clonedWithLocalCommit(), 'git push origin HEAD')
    expect(result.ok).toBe(true)
    expect(result.output).toContain('master -> master')
  })

  it('S5-21/опасное место 8: git push origin master extra — "src refspec extra…", НИЧЕГО не отправлено', () => {
    const before = clonedWithLocalCommit()
    const { state, result } = run(before, 'git push origin master extra')
    expect(result.ok).toBe(false)
    expect(result.output).toBe(`error: src refspec extra does not match any\nerror: failed to push some refs to '${SERVER_PATH}'`)
    expect(state.server.branches.master).toBe(before.server.branches.master)
  })
})

describe('коллега пушит (target.md, часть VII, «Кнопка «Коллега пушит»»)', () => {
  it('S5-24: не меняет копию — status сразу после клика всё равно "up to date"', () => {
    const state = colleaguePush(clonedState(), ru.remote.seed.colleague)
    const { result } = run(state, 'git status')
    expect(result.output).toContain("up to date with 'origin/master'")
  })

  it('S5-36: первый клик создаёт CHANGELOG.md и коммит «Добавить changelog», второй — «Обновить changelog (2)»', () => {
    let state = clonedState()
    state = colleaguePush(state, ru.remote.seed.colleague)
    const first = Object.values(state.server.commits).find((c) => c.message === 'Добавить changelog')
    expect(first?.tree['CHANGELOG.md']).toBe('## Изменения\n- Правка коллеги №1')
    state = colleaguePush(state, ru.remote.seed.colleague)
    const second = Object.values(state.server.commits).find((c) => c.message === 'Обновить changelog (2)')
    expect(second?.tree['CHANGELOG.md']).toBe('## Изменения\n- Правка коллеги №1\n- Правка коллеги №2')
    expect(state.serverNotes).toHaveLength(2)
  })
})

describe('git fetch (target.md, часть VII, опасное место 1, 3, 4)', () => {
  it('S5-25/S5-26: fetch печатает "From ..." и строку обновления; после — status "behind ... can be fast-forwarded"', () => {
    const state = colleaguePush(clonedState(), ru.remote.seed.colleague)
    const { state: fetched, result } = run(state, 'git fetch')
    expect(result.output.startsWith(`From ${SERVER_PATH}\n`)).toBe(true)
    expect(result.output).toMatch(/^ {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}master\s+-> origin\/master$/m)
    const { result: status } = run(fetched, 'git status')
    expect(status.output).toContain("behind 'origin/master' by 1 commit, and can be fast-forwarded")
  })

  it('S5-27/опасное место 4: без нового — пустой вывод, код 0 (не "Already up to date.")', () => {
    const state = run(colleaguePush(clonedState(), ru.remote.seed.colleague), 'git fetch').state
    const { result } = run(state, 'git fetch')
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
    expect(result.exitCode).toBe(0)
  })

  it('git fetch origin — то же самое, что без аргумента (target.md, «Что входит»)', () => {
    const state = colleaguePush(clonedState(), ru.remote.seed.colleague)
    const a = run(state, 'git fetch').result
    const b = run(state, 'git fetch origin').result
    expect(b.output).toBe(a.output)
  })

  it('git fetch -x — unknown switch + usage, код 129', () => {
    const { result } = run(clonedState(), 'git fetch -x')
    expect(result.exitCode).toBe(129)
  })
})

describe('git pull — перемотка и "Already up to date." (target.md, часть VII, опасное место 5, 9)', () => {
  it('S5-28: перемотка без diffstat — "Updating <a>..<b>" + "Fast-forward", без коммита слияния', () => {
    const state = colleaguePush(clonedState(), ru.remote.seed.colleague)
    const before = Object.keys(state.local!.commits).length
    const { state: pulled, result } = run(state, 'git pull')
    expect(result.ok).toBe(true)
    // Fetch-часть печатается первой (опасное место 5: "если на сервере есть новое, pull печатает
    // From ... и строки обновления origin/*"), затем сама интеграция — без диффстата (опасное
    // место 9, раздел 5 наследует упрощение раздела 2).
    expect(result.output).toMatch(/^From \/team\/origin\n {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}master\s+-> origin\/master\nUpdating [0-9a-f]{7}\.\.[0-9a-f]{7}\nFast-forward$/)
    expect(result.output).not.toContain('file')
    expect(Object.keys(pulled.local!.commits).length).toBe(before + 1)
    expect(pulled.local!.working['CHANGELOG.md']).toBe('## Изменения\n- Правка коллеги №1')
  })

  it('S5-29: вливать нечего — "Already up to date."', () => {
    const { result } = run(clonedState(), 'git pull')
    expect(result.output).toBe('Already up to date.')
  })

  it('копия только впереди — pull "Already up to date." (не путать с behind)', () => {
    const { result } = run(clonedWithLocalCommit(), 'git pull')
    expect(result.output).toBe('Already up to date.')
  })
})

/** target.md, часть VII, миссия 5 / опасные места 2 и 5: полный «естественный» сценарий расхождения — свой коммит, коллега, ещё один свой коммит, отказ push, pull, push. */
function divergedScenario(): RemoteState {
  let state = clonedWithLocalCommit() // мой коммит m1, ещё НЕ запушен
  state = run(state, 'git push').state // m1 на сервере, origin/master = m1
  state = colleaguePush(state, ru.remote.seed.colleague) // коллега на сервере поверх m1
  const content = state.local!.working['README.md'] + '\nвторая правка'
  state = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'README.md': content } } }
  state = runAll(state, 'git add README.md', 'git commit -m "m2"') // мой m2 поверх m1, БЕЗ fetch
  return state
}

describe('расхождение веток и отказы push (target.md, часть VII, опасное место 2 и 5)', () => {
  it('S5-22/S5-30/опасное место 2: push без fetch — отказ "(fetch first)", код 1, сервер не меняется', () => {
    const before = divergedScenario()
    const { state, result } = run(before, 'git push')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('(fetch first)')
    expect(result.output).not.toContain('non-fast-forward')
    expect(result.exitCode).toBe(1)
    expect(state.server.branches.master).toBe(before.server.branches.master)
  })

  it('после fetch тот же отказ — "(non-fast-forward)", а не "(fetch first)" (критерий — наличие коммита в копии)', () => {
    const afterReject = run(divergedScenario(), 'git push').state
    const afterFetch = run(afterReject, 'git fetch').state
    const { result } = run(afterFetch, 'git push')
    expect(result.output).toContain('(non-fast-forward)')
    expect(result.output).not.toContain('fetch first')
  })

  it('S5-31: миссии 1–4 выполнены, 5 нет (в момент отказа, до pull)', () => {
    const state = run(divergedScenario(), 'git push').state
    const missions = getRemoteMissions(state)
    expect(missions.find((m) => m.id === 'cloneRepo')?.done).toBe(true)
    expect(missions.find((m) => m.id === 'commitLocally')?.done).toBe(true)
    expect(missions.find((m) => m.id === 'pushCommit')?.done).toBe(true)
    expect(missions.find((m) => m.id === 'rejectPullPush')?.done).toBe(false)
  })

  it('S5-32/опасное место 12: git fetch, затем status — "have diverged" и "1 and 1 different commits", подсказка "if you want to integrate ... yours"', () => {
    const state = run(divergedScenario(), 'git push').state
    const afterFetch = run(state, 'git fetch').state
    const { result } = run(afterFetch, 'git status')
    expect(result.output).toContain("Your branch and 'origin/master' have diverged,")
    expect(result.output).toContain('and have 1 and 1 different commits each, respectively.')
    expect(result.output).toContain('(use "git pull" if you want to integrate the remote branch with yours)')
  })

  it('git pull без --no-rebase/config на расхождении — hint-блок + fatal, код 128, ветка не меняется', () => {
    const before = run(divergedScenario(), 'git push').state
    const { state, result } = run(before, 'git pull')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('hint: You have divergent branches and need to specify how to reconcile them.')
    expect(result.output).toContain('fatal: Need to specify how to reconcile divergent branches.')
    expect(result.exitCode).toBe(128)
    // Fetch-часть НЕ откатывается при отказе (опасное место 5) — origin/master уже обновлён.
    expect(state.local!.remoteBranches.master).toBe(state.server.branches.master)
  })

  it('S5-33: git pull --no-rebase на расхождении — "Merge made by...", README m2 не потерян, CHANGELOG пришёл', () => {
    const before = run(divergedScenario(), 'git push').state
    const { state, result } = run(before, 'git pull --no-rebase')
    expect(result.ok).toBe(true)
    // Fetch не делали ДО этого pull — его fetch-часть печатает "From ..." первой (опасное место 5).
    expect(result.output.endsWith("Merge made by the 'ort' strategy.")).toBe(true)
    expect(result.output.startsWith('From /team/origin\n')).toBe(true)
    expect(state.local!.working['README.md']).toContain('вторая правка')
    expect(state.local!.working['CHANGELOG.md']).toBe('## Изменения\n- Правка коллеги №1')
    expect(getRemoteMissions(state).find((m) => m.id === 'rejectPullPush')?.done).toBe(false)
  })

  it('сообщение коммита слияния — "Merge branch \'master\' of /team/origin" (опасное место 6, не "origin/master")', () => {
    const before = run(divergedScenario(), 'git push').state
    const { state } = run(before, 'git pull --no-rebase')
    const tip = state.local!.branches.master
    expect(state.local!.commits[tip].message).toBe(`Merge branch 'master' of ${SERVER_PATH}`)
    expect(state.local!.commits[tip].parents).toHaveLength(2)
  })

  it('S5-34/S5-38/S5-39: полная цепочка push(отказ)→pull→push засчитывает миссию 5; холостые pull/push по отдельности — нет', () => {
    let state = run(divergedScenario(), 'git push').state // отказ (fetch first)
    expect(getRemoteMissions(state).find((m) => m.id === 'rejectPullPush')?.done).toBe(false)
    state = run(state, 'git pull --no-rebase').state // успешный pull, интегрировал
    state = run(state, 'git push').state // push, который что-то отправил
    expect(getRemoteMissions(state).find((m) => m.id === 'rejectPullPush')?.done).toBe(true)
    // после этого история совпадает, status "up to date"
    expect(run(state, 'git status').result.output).toContain("up to date with 'origin/master'")
  })

  it('S5-38 (холостой путь): pull/push БЕЗ предшествующего отказа не засчитывают миссию 5', () => {
    let state = clonedWithLocalCommit()
    state = run(state, 'git push').state
    state = run(state, 'git pull').state // "Already up to date." — холостой
    state = run(state, 'git push').state // "Everything up-to-date" — холостой
    expect(getRemoteMissions(state).find((m) => m.id === 'rejectPullPush')?.done).toBe(false)
  })

  it('S5-45: push --force после расхождения — "(forced update)", коммит коллеги пропадает с ветки сервера', () => {
    const before = run(divergedScenario(), 'git push').state // отказ, сервер = коллега поверх m1
    const colleagueTip = before.server.branches.master
    const { state, result } = run(before, 'git push --force')
    expect(result.ok).toBe(true)
    expect(result.output).toContain('(forced update)')
    expect(state.server.branches.master).toBe(state.local!.branches.master)
    expect(state.server.branches.master).not.toBe(colleagueTip)
  })

  it('push --force БЕЗ реального расхождения — обычная строка, без "+"/"(forced update)"', () => {
    const state = clonedWithLocalCommit()
    const { result } = run(state, 'git push --force')
    expect(result.output).not.toContain('+')
    expect(result.output).not.toContain('forced update')
  })
})

describe('git config pull.rebase false / pull.ff only (target.md, часть VII, «Что входит»)', () => {
  it('git config pull.rebase false — молчит, код 0; дальше pull сливает без --no-rebase', () => {
    const before = run(divergedScenario(), 'git push').state
    const configured = run(before, 'git config pull.rebase false')
    expect(configured.result.output).toBe('')
    expect(configured.result.exitCode).toBe(0)
    const { result } = run(configured.state, 'git pull')
    expect(result.output.endsWith("Merge made by the 'ort' strategy.")).toBe(true)
  })

  it('git config pull.ff only — на расхождении отдельный hint + fatal, код 128', () => {
    const before = run(divergedScenario(), 'git push').state
    const configured = run(before, 'git config pull.ff only').state
    const { result } = run(configured, 'git pull')
    expect(result.ok).toBe(false)
    expect(result.output).toContain("Diverging branches can't be fast-forwarded")
    expect(result.output).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(result.exitCode).toBe(128)
  })

  it('git config pull.ff only на перемотке — обычный fast-forward, не отказ', () => {
    const state = run(colleaguePush(clonedState(), ru.remote.seed.colleague), 'git config pull.ff only').state
    const { result } = run(state, 'git pull')
    expect(result.output).toContain('Fast-forward')
  })

  it('pull.rebase false и pull.ff only вместе — на расхождении побеждает ff only, код 128', () => {
    const before = run(divergedScenario(), 'git push').state
    const configured = runAll(before, 'git config pull.rebase false', 'git config pull.ff only')
    const { result } = run(configured, 'git pull')
    expect(result.output).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(result.exitCode).toBe(128)
  })

  it('pull.rebase false и pull.ff only вместе на перемотке — обычный fast-forward', () => {
    const state = runAll(colleaguePush(clonedState(), ru.remote.seed.colleague), 'git config pull.rebase false', 'git config pull.ff only')
    const { result } = run(state, 'git pull')
    expect(result.output).toContain('Fast-forward')
    expect(result.exitCode).toBe(0)
  })

  it('pull.ff only в настройках, --no-rebase в командной строке — слияние', () => {
    const before = run(divergedScenario(), 'git push').state
    const configured = run(before, 'git config pull.ff only').state
    const { result } = run(configured, 'git pull --no-rebase')
    expect(result.output.endsWith("Merge made by the 'ort' strategy.")).toBe(true)
    expect(result.exitCode).toBe(0)
  })

  it('pull.rebase false в настройках, --ff-only в командной строке — отказ, код 128', () => {
    const before = run(divergedScenario(), 'git push').state
    const configured = run(before, 'git config pull.rebase false').state
    const { result } = run(configured, 'git pull --ff-only')
    expect(result.output).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(result.exitCode).toBe(128)
  })

  it('--no-rebase и --ff-only вместе в командной строке — отказ, код 128', () => {
    const before = run(divergedScenario(), 'git push').state
    const { result } = run(before, 'git pull --no-rebase --ff-only')
    expect(result.output).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(result.exitCode).toBe(128)
  })

  it('git config pull.rebase true — вне области (правило области, не тихий успех)', () => {
    const { result } = run(clonedState(), 'git config pull.rebase true')
    expect(result.ok).toBe(false)
  })

  it('git config user.name x — вне области', () => {
    const { result } = run(clonedState(), 'git config user.name x')
    expect(result.ok).toBe(false)
  })
})

describe('ветка feature без upstream (target.md, часть VII, опасное место 7, S5-41…S5-44)', () => {
  function featureState(): RemoteState {
    return run(clonedState(), 'git checkout -b feature').state
  }

  it('git checkout -b feature — "Switched to a new branch"', () => {
    const { result } = run(clonedState(), 'git checkout -b feature')
    expect(result.output).toBe("Switched to a new branch 'feature'")
  })

  it('S5-42: git status на ветке без upstream — нет строк про origin, без пустой строки после "On branch feature"', () => {
    const { result } = run(featureState(), 'git status')
    expect(result.output).toBe('On branch feature\nnothing to commit, working tree clean')
  })

  it('S5-41: git pull на ветке без upstream — "There is no tracking information…", код 1', () => {
    const { result } = run(featureState(), 'git pull')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('There is no tracking information for the current branch.')
    expect(result.output).toContain('git branch --set-upstream-to=origin/<branch> feature')
    expect(result.exitCode).toBe(1)
  })

  it('git push на ветке без upstream — "has no upstream branch", код 128', () => {
    const { result } = run(featureState(), 'git push')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('fatal: The current branch feature has no upstream branch.')
    expect(result.output).toContain('git push --set-upstream origin feature')
    expect(result.exitCode).toBe(128)
  })

  it('git push origin (без ветки) на ветке без upstream — та же ошибка, что и bare push (target.md: «выводят то же»)', () => {
    const { result } = run(featureState(), 'git push origin')
    expect(result.output).toContain('has no upstream branch')
  })

  it('S5-43: git push -u origin feature — [new branch] + set-upstream; status дальше "up to date with origin/feature"', () => {
    let state = featureState()
    const withCommit = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'notes.txt': 'заметка' } } }
    state = runAll(withCommit, 'git add notes.txt', 'git commit -m "заметка"')
    const { state: pushed, result } = run(state, 'git push -u origin feature')
    expect(result.output).toBe(`To ${SERVER_PATH}\n * [new branch]      feature -> feature\nbranch 'feature' set up to track 'origin/feature'.`)
    const { result: status } = run(pushed, 'git status')
    expect(status.output).toContain("up to date with 'origin/feature'")
    expect(getRemoteBranchNames(pushed)).toContain('feature')
  })

  it('S5-44: git pull origin nosuch — "couldn\'t find remote ref nosuch", код 1', () => {
    const { result } = run(featureState(), 'git pull origin nosuch')
    expect(result.ok).toBe(false)
    expect(result.output).toBe("fatal: couldn't find remote ref nosuch")
    expect(result.exitCode).toBe(1)
  })

  it('git pull origin (без ветки) — как bare git pull (target.md: «выводят то же, что без аргумента»)', () => {
    const state = colleaguePush(clonedState(), ru.remote.seed.colleague)
    const bare = run(state, 'git pull').result
    const withRepo = run(state, 'git pull origin').result
    expect(withRepo.output).toBe(bare.output)
  })

  it('git pull origin master — строка FETCH_HEAD печатается всегда, даже когда origin/master уже свежий', () => {
    const { result } = run(clonedState(), 'git pull origin master')
    expect(result.output).toBe(`From ${SERVER_PATH}\n * branch            master     -> FETCH_HEAD\nAlready up to date.`)
  })

  it('git branch -a на двух ветках — алфавитный порядок, текущая помечена звёздочкой', () => {
    const { result } = run(featureState(), 'git branch -a')
    expect(result.output).toBe('* feature\n  master\n  remotes/origin/HEAD -> origin/master\n  remotes/origin/master')
  })
})

describe('правило области — команды и опции вне раздела 5 (target.md, часть VII, «Что НЕ входит»)', () => {
  it('git merge origin/master — честный отказ, не выдуманное слияние', () => {
    const { result } = run(clonedState(), 'git merge origin/master')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('git merge')
  })

  it('git switch feature / git restore — вне области, как в разделе 2', () => {
    expect(run(clonedState(), 'git switch feature').result.ok).toBe(false)
    expect(run(clonedState(), 'git restore x').result.ok).toBe(false)
  })

  it('git rebase / git pull --rebase — вне области (раздел 8)', () => {
    expect(run(clonedState(), 'git rebase master').result.ok).toBe(false)
    expect(run(clonedState(), 'git pull --rebase').result.ok).toBe(false)
  })

  it('git push --tags / --force-with-lease / --delete — вне области', () => {
    expect(run(clonedState(), 'git push --tags').result.ok).toBe(false)
    expect(run(clonedState(), 'git push --force-with-lease').result.ok).toBe(false)
    expect(run(clonedState(), 'git push --delete origin master').result.ok).toBe(false)
  })

  it('git fetch --prune / --all — вне области', () => {
    expect(run(clonedState(), 'git fetch --prune').result.ok).toBe(false)
    expect(run(clonedState(), 'git fetch --all').result.ok).toBe(false)
  })

  it('git log в копии — вне области раздела 5', () => {
    expect(run(clonedState(), 'git log').result.ok).toBe(false)
  })

  it('полностью неизвестная команда — "is not a git command"', () => {
    const { result } = run(clonedState(), 'git foobar')
    expect(result.output).toBe("git: 'foobar' is not a git command. See 'git --help'.")
  })

  it('реальная, но не входящая в раздел 5 команда (init) — честный отказ, не not-a-command', () => {
    const { result } = run(clonedState(), 'git init')
    expect(result.ok).toBe(false)
    expect(result.output).not.toContain('is not a git command')
  })
})

describe('коды возврата настоящего git 2.53.0 (target.md, часть VII, таблица)', () => {
  it('успех (push/fetch/pull "Everything/Already up to date", config) — 0', () => {
    expect(run(clonedWithLocalCommit(), 'git push').result.exitCode).toBe(0)
    const upToDate = run(clonedState(), 'git push').state
    expect(run(upToDate, 'git push').result.exitCode).toBe(0)
    expect(run(clonedState(), 'git fetch').result.exitCode).toBe(0)
    expect(run(clonedState(), 'git pull').result.exitCode).toBe(0)
    expect(run(clonedState(), 'git config pull.rebase false').result.exitCode).toBe(0)
  })

  it('push отклонён / src refspec / pull без upstream / couldn\'t find remote ref / push master / branch -d master — 1', () => {
    expect(run(run(divergedScenario(), 'git push').state, 'git push').result.exitCode).toBe(1)
    expect(run(clonedState(), 'git push origin nosuch').result.exitCode).toBe(1)
    const feature = run(clonedState(), 'git checkout -b feature').state
    expect(run(feature, 'git pull').result.exitCode).toBe(1)
    expect(run(feature, 'git pull origin nosuch').result.exitCode).toBe(1)
    expect(run(clonedState(), 'git pull master').result.exitCode).toBe(1)
    expect(run(clonedState(), 'git branch -d master').result.exitCode).toBe(1)
  })

  it('clone в существующий каталог / push master / fetch master / push без upstream / pull на расхождении без настройки — 128', () => {
    expect(run(clonedState(), 'git clone origin local').result.exitCode).toBe(128)
    expect(run(clonedState(), 'git push master').result.exitCode).toBe(128)
    expect(run(clonedState(), 'git fetch master').result.exitCode).toBe(128)
    expect(run(run(clonedState(), 'git checkout -b feature').state, 'git push').result.exitCode).toBe(128)
    const before = run(divergedScenario(), 'git push').state
    expect(run(before, 'git pull').result.exitCode).toBe(128)
  })

  it('неизвестный ключ (push/fetch/pull/clone/remote -x) и голый git clone — 129', () => {
    expect(run(clonedState(), 'git push -x').result.exitCode).toBe(129)
    expect(run(clonedState(), 'git fetch -x').result.exitCode).toBe(129)
    expect(run(clonedState(), 'git pull -x').result.exitCode).toBe(129)
    expect(run(baseState(), 'git clone -x origin local').result.exitCode).toBe(129)
    expect(run(clonedState(), 'git remote -x').result.exitCode).toBe(129)
    expect(run(baseState(), 'git clone').result.exitCode).toBe(129)
  })
})

describe('add/commit/branch/checkout — раздел 2, применённые к локальной копии (target.md, «Локальная работа»)', () => {
  it('git add + git commit создают локальный коммит поверх текущей ветки', () => {
    const state = clonedState()
    const withEdit = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'x.txt': 'привет' } } }
    const { state: next, result } = run(withEdit, 'git add x.txt')
    expect(result.ok).toBe(true)
    const committed = run(next, 'git commit -m "добавить x"')
    expect(committed.result.ok).toBe(true)
    expect(getAllLocalCommits(committed.state)).toHaveLength(2)
  })

  it('git commit без изменений — статус вместо коммита, код 1', () => {
    const { result } = run(clonedState(), 'git commit -m "пусто"')
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
  })

  it('git branch <имя> создаёт ветку от HEAD, не переключает', () => {
    const { state, result } = run(clonedState(), 'git branch feature')
    expect(result.ok).toBe(true)
    expect(getLocalBranchNames(state)).toEqual(['feature', 'master'])
    expect(getLocalCurrentBranch(state)).toBe('master')
  })

  it('git branch с уже занятым именем — fatal, код 128', () => {
    const { result } = run(run(clonedState(), 'git branch feature').state, 'git branch feature')
    expect(result.output).toBe("fatal: a branch named 'feature' already exists")
    expect(result.exitCode).toBe(128)
  })

  it('git checkout <ветка> переключает HEAD', () => {
    const withBranch = run(clonedState(), 'git branch feature').state
    const { state, result } = run(withBranch, 'git checkout feature')
    expect(result.output).toBe("Switched to branch 'feature'")
    expect(getLocalCurrentBranch(state)).toBe('feature')
  })

  it('git checkout с несохранённой правкой, которую переключение затёрло бы — отказ, ветка не меняется (checkSafety/applyTreeChange, remoteRepo.ts)', () => {
    // Расходимся: коммит на feature меняет README.md, затем на master та же строка правится
    // напрямую (без add) — переключение на feature затёрло бы незастейджённую правку master.
    let s = run(clonedState(), 'git branch feature').state
    s = run(s, 'git checkout feature').state
    s = { ...s, local: { ...s.local!, working: { ...s.local!.working, 'README.md': 'правка на feature' } } }
    s = runAll(s, 'git add README.md', 'git commit -m "на feature"')
    s = run(s, 'git checkout master').state
    s = { ...s, local: { ...s.local!, working: { ...s.local!.working, 'README.md': 'незакоммиченная правка на master' } } }
    const { state: next, result } = run(s, 'git checkout feature')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('would be overwritten by checkout')
    expect(getLocalCurrentBranch(next)).toBe('master')
  })
})
