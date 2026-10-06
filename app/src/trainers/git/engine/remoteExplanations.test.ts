// ============================================================
// Раздел 5: «речь» тренажёра — готовые ключи ru.remote.explain.* подключены к выводу
// (target.md, часть VII, опасные места 1 и 5). Факты сверены на git 2.53.0: после clone, fetch,
// pull и push status пишет «up to date» по записи origin/<ветка>, а не по серверу; pull — это
// fetch и интеграция: перемотка проходит сама, на расхождении без настройки git отказывает.
// ============================================================
import { describe, expect, it } from 'vitest'
import { colleaguePush, createRemoteSection, runRemoteCommand } from './remoteSection'
import type { RemoteState } from './remoteTypes'
import { ru } from '../locales/ru'

function run(state: RemoteState, input: string) {
  const { state: next, result } = runRemoteCommand(state, input)
  if (result === null) throw new Error('ожидалась команда')
  return { state: next, result }
}
function runAll(state: RemoteState, ...inputs: string[]): RemoteState {
  return inputs.reduce((s, l) => run(s, l).state, state)
}
function cloned(): RemoteState {
  return run(createRemoteSection({ server: ru.remote.seed.server }), 'git clone origin local').state
}
/** Свой коммит, коллега запушил, второй свой коммит без fetch: ветки разошлись. */
function diverged(): RemoteState {
  let state = cloned()
  state = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'README.md': 'мой текст' } } }
  state = runAll(state, 'git add README.md', 'git commit -m "m1"')
  state = colleaguePush(state, ru.remote.seed.colleague)
  return run(state, 'git fetch').state
}

const ex = ru.remote.explain

describe('status: запись origin/<ветка>, а не сервер (место 1)', () => {
  it('сразу после clone — пояснение upToDateNote', () => {
    const { result } = run(cloned(), 'git status')
    expect(result.output).toContain("Your branch is up to date with 'origin/master'.")
    expect(result.explanation).toBe(ex.upToDateNote)
  })

  it('коллега запушил, fetch не делали: status по-прежнему up to date — и пояснение объясняет почему', () => {
    const { result } = run(colleaguePush(cloned(), ru.remote.seed.colleague), 'git status')
    expect(result.output).toContain('up to date')
    expect(result.explanation).toBe(ex.upToDateNote)
  })

  it('после fetch (behind) пояснения нет', () => {
    const state = run(colleaguePush(cloned(), ru.remote.seed.colleague), 'git fetch').state
    const { result } = run(state, 'git status')
    expect(result.output).toContain('behind')
    expect(result.explanation).toBeNull()
  })

  it('впереди (ahead) и разошлись — пояснения нет', () => {
    expect(run(diverged(), 'git status').result.explanation).toBeNull()
    let ahead = cloned()
    ahead = { ...ahead, local: { ...ahead.local!, working: { ...ahead.local!.working, 'README.md': 'x' } } }
    ahead = runAll(ahead, 'git add README.md', 'git commit -m "m"')
    expect(run(ahead, 'git status').result.explanation).toBeNull()
  })

  it('успешный push тоже обновляет запись: status после него up to date с пояснением', () => {
    let state = cloned()
    state = { ...state, local: { ...state.local!, working: { ...state.local!.working, 'README.md': 'x' } } }
    state = runAll(state, 'git add README.md', 'git commit -m "m"', 'git push')
    const { result } = run(state, 'git status')
    expect(result.explanation).toBe(ex.upToDateNote)
  })

  it('status с отказом (неизвестный флаг) пояснения не получает', () => {
    expect(run(cloned(), 'git status -x').result.explanation).toBeNull()
  })

  it('upToDateNote: запись обновляет успешный push, отклонённый push — нет', () => {
    expect(ex.upToDateNote).toContain('успешный push')
    expect(ex.upToDateNote).toContain('отклонённый')
  })

  it('upToDateNote не содержит английского слова «contact» из прежнего текста', () => {
    expect(ex.upToDateNote).not.toContain('contact')
  })
})

describe('pull: fetch плюс интеграция (место 5)', () => {
  it('перемотка — pullIsFetchPlusIntegration', () => {
    const state = colleaguePush(cloned(), ru.remote.seed.colleague)
    const { result } = run(state, 'git pull')
    expect(result.output).toContain('Fast-forward')
    expect(result.explanation).toBe(ex.pullIsFetchPlusIntegration)
  })

  it('«Already up to date.» — тоже', () => {
    const { result } = run(cloned(), 'git pull')
    expect(result.output).toBe('Already up to date.')
    expect(result.explanation).toBe(ex.pullIsFetchPlusIntegration)
  })

  it('слияние (--no-rebase) — pullIsFetchPlusIntegration', () => {
    const { result } = run(diverged(), 'git pull --no-rebase')
    expect(result.output).toContain("Merge made by the 'ort' strategy.")
    expect(result.explanation).toBe(ex.pullIsFetchPlusIntegration)
  })

  it('отказ на расхождении — объяснение и подсказка, что выбрать (pullNeedsChoice)', () => {
    const { result } = run(diverged(), 'git pull')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('fatal: Need to specify how to reconcile divergent branches.')
    expect(result.explanation).toBe(`${ex.pullIsFetchPlusIntegration} ${ex.pullDivergedNoChoice} ${ex.pullNeedsChoice}`)
  })

  it('отказ --ff-only на расхождении — без совета «слияние» (выбор уже сделан)', () => {
    const { result } = run(diverged(), 'git pull --ff-only')
    expect(result.output).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(result.explanation).toBe(`${ex.pullIsFetchPlusIntegration} ${ex.pullFfOnlyRefused}`)
    expect(result.explanation).not.toContain('просит указать')
  })

  // Прогон git 2.53.0 на расхождении: pull.rebase false -> слияние; pull.ff only -> fatal Not possible
  // to fast-forward (код 128); pull.ff only + --no-rebase -> слияние.
  it('pull.rebase false, без флага — слияние с пояснением pullIsFetchPlusIntegration', () => {
    const state = run(diverged(), 'git config pull.rebase false').state
    const { result } = run(state, 'git pull')
    expect(result.ok).toBe(true)
    expect(result.output).toContain("Merge made by the 'ort' strategy.")
    expect(result.explanation).toBe(ex.pullIsFetchPlusIntegration)
  })

  it('pull.ff only, без флага — отказ с пояснением pullFfOnlyRefused', () => {
    const state = run(diverged(), 'git config pull.ff only').state
    const { result } = run(state, 'git pull')
    expect(result.ok).toBe(false)
    expect(result.output).toContain('fatal: Not possible to fast-forward, aborting.')
    expect(result.explanation).toBe(`${ex.pullIsFetchPlusIntegration} ${ex.pullFfOnlyRefused}`)
  })

  it('pull.ff only и --no-rebase — слияние, а не отказ', () => {
    const state = run(diverged(), 'git config pull.ff only').state
    const { result } = run(state, 'git pull --no-rebase')
    expect(result.ok).toBe(true)
    expect(result.output).toContain("Merge made by the 'ort' strategy.")
    expect(result.explanation).toBe(ex.pullIsFetchPlusIntegration)
  })

  it('pullFfOnlyRefused и pullIsFetchPlusIntegration не делают ложных утверждений (после fetch запись не обновляется)', () => {
    expect(ex.pullFfOnlyRefused).not.toContain('обновлена')
    expect(ex.pullIsFetchPlusIntegration).not.toContain('перемотка или слияние')
    expect(ex.pullIsFetchPlusIntegration).toContain('раздел 8')
  })

  it('pull без upstream (отказ до fetch) пояснения не получает', () => {
    const state = run(cloned(), 'git checkout -b feature').state
    const { result } = run(state, 'git pull')
    expect(result.ok).toBe(false)
    expect(result.explanation).toBeNull()
  })

  it('тексты не содержат прежних неточностей: совет про слияние назван для миссии, а не «почти всегда»', () => {
    expect(ex.pullNeedsChoice).toContain('git pull --no-rebase')
    expect(ex.pullNeedsChoice).toContain('git config pull.rebase false')
    expect(ex.pullNeedsChoice).not.toContain('почти всегда')
  })
})
