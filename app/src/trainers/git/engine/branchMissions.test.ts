// ============================================================
// Раздел 2 git-тренажёра, шаг A: миссии «Что попробовать» (target.md, часть
// IV, «Миссии шага A»). По одной проверке на каждую миссию — основной путь,
// альтернативный путь (где он есть) и «не засчитывается раньше времени».
//
// Рабочее дерево здесь правится через editFile/createFile (branchSection.ts)
// — тот же публичный вход, что доступен интегратору, а не прямой записью
// в state.working, к которой у интегратора доступа нет.
// ============================================================
import { describe, expect, it } from 'vitest'
import { createBranchingSection, createFile, editFile, getBranchMissions, runBranchingCommand } from './branchSection'
import type { BranchingState } from './branchTypes'

function run(state: BranchingState, ...lines: string[]): BranchingState {
  return lines.reduce((s, line) => runBranchingCommand(s, line).state, state)
}

function doneMap(state: BranchingState): Record<string, boolean> {
  return Object.fromEntries(getBranchMissions(state).map((m) => [m.id, m.done]))
}

/** master с одним корневым коммитом и файлом style.css — то же исходное состояние, что и в branchCommands.test.ts. */
function baseState(): BranchingState {
  return createBranchingSection('Начальный коммит', { 'style.css': 'body { background: white; color: black; }' })
}

describe('target.md, часть IV — миссии шага A', () => {
  it('изначально все 6 миссий не выполнены, порядок соответствует target.md', () => {
    const missions = getBranchMissions(baseState())
    expect(missions.map((m) => m.id)).toEqual([
      'viewBranches',
      'createAndSwitch',
      'commitAndReturn',
      'fastForwardMerge',
      'divergedMerge',
      'deleteBranches',
    ])
    expect(missions.every((m) => !m.done)).toBe(true)
  })

  describe('миссия 1 — посмотреть список веток', () => {
    it('засчитывается голым "git branch"', () => {
      const state = run(baseState(), 'git branch')
      expect(doneMap(state).viewBranches).toBe(true)
    })

    it('не засчитывается созданием ветки — эта форма список не печатает', () => {
      const state = run(baseState(), 'git branch feature')
      expect(doneMap(state).viewBranches).toBe(false)
    })

    it('не засчитывается неудачной командой (например, ошибка в опции)', () => {
      const state = run(baseState(), 'git branch -zzz')
      expect(doneMap(state).viewBranches).toBe(false)
    })
  })

  describe('миссия 2 — создать ветку и переключиться на неё', () => {
    it('не засчитана сразу после старта (одна ветка)', () => {
      expect(doneMap(baseState()).createAndSwitch).toBe(false)
    })

    it('не засчитывается одним только "git branch <имя>" — HEAD не сдвинулся', () => {
      const state = run(baseState(), 'git branch feature')
      expect(doneMap(state).createAndSwitch).toBe(false)
    })

    it('основной путь: git branch <имя> + git checkout <имя>', () => {
      const state = run(baseState(), 'git branch feature', 'git checkout feature')
      expect(doneMap(state).createAndSwitch).toBe(true)
    })

    it('альтернативный путь: git checkout -b <имя> — то же самое состояние графа', () => {
      const state = run(baseState(), 'git checkout -b feature')
      expect(doneMap(state).createAndSwitch).toBe(true)
    })

    it('однажды достигнутая, остаётся достигнутой при возврате на исходную ветку', () => {
      let state = run(baseState(), 'git checkout -b feature')
      expect(doneMap(state).createAndSwitch).toBe(true)
      state = run(state, 'git checkout master')
      expect(doneMap(state).createAndSwitch).toBe(true)
    })
  })

  describe('миссия 3 — коммит в НОВОЙ ветке, возврат на ПРЕЖНЮЮ, файл прежний ' +
    '(target.md, «Уточнение к миссии 3»)', () => {
    function commitOnFeatureAndReturn(checkoutB: boolean): BranchingState {
      let s = baseState()
      s = checkoutB ? run(s, 'git checkout -b feature') : run(s, 'git branch feature', 'git checkout feature')
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -m "покрасить"')
      return s
    }

    it('не засчитана сразу после создания ветки (обе ветки на одном коммите)', () => {
      const state = run(baseState(), 'git checkout -b feature')
      expect(doneMap(state).commitAndReturn).toBe(false)
    })

    it('не засчитана, пока игрок остаётся В новой ветке после коммита — надо именно вернуться', () => {
      const state = commitOnFeatureAndReturn(true)
      expect(doneMap(state).commitAndReturn).toBe(false)
    })

    it('основной путь (git branch + git checkout): после возврата на master миссия засчитана', () => {
      let state = commitOnFeatureAndReturn(false)
      state = run(state, 'git checkout master')
      expect(doneMap(state).commitAndReturn).toBe(true)
      // и файл на master действительно прежний
      expect(state.working['style.css']).toBe('body { background: white; color: black; }')
    })

    it('альтернативный путь (git checkout -b): тот же результат после возврата', () => {
      let state = commitOnFeatureAndReturn(true)
      state = run(state, 'git checkout master')
      expect(doneMap(state).commitAndReturn).toBe(true)
    })

    it('НЕ засчитана, если коммит сделан в СТАРОЙ ветке, а не в новой ' +
      '(git checkout -b feature → git checkout master → коммит в master → git checkout feature)', () => {
      let s = baseState()
      s = run(s, 'git checkout -b feature') // новая ветка создана, но пока не тронута
      s = run(s, 'git checkout master') // назад на прежнюю
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -m "правка в старой ветке"')
      s = run(s, 'git checkout feature') // опять в новую — граф похож на «правильный» случай, но порядок обратный
      expect(doneMap(s).commitAndReturn).toBe(false)
    })
  })

  // Порядок создания веток для миссий 2 и 3 берётся из явного branchOrder (branchTypes.ts), а не
  // из Object.keys(state.branches) — в JS ключи-числа («42») всегда идут первыми, независимо от
  // того, когда ветка реально создана. Настоящий git такие имена веток принимает буквально
  // (`git checkout -b 42` → `Switched to a new branch '42'`), поэтому сценарии здесь — те же самые
  // прохождения, что и в описаниях миссий 2 и 3 выше, но с именем "42" вместо "feature".
  describe('ветка с именем-числом не ломает миссии 2 и 3 (порядок создания — branchOrder, не Object.keys)', () => {
    it('git checkout -b 42 — createAndSwitch засчитывается сразу же, как и с нечисловым именем', () => {
      const state = run(baseState(), 'git checkout -b 42')
      expect(doneMap(state).createAndSwitch).toBe(true)
    })

    it('m3num — честное прохождение миссии 3: коммит в новой ветке "42", возврат на master — обе миссии засчитаны', () => {
      let s = run(baseState(), 'git checkout -b 42')
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -am "Numbered"', 'git checkout master')
      expect(doneMap(s).createAndSwitch).toBe(true)
      expect(doneMap(s).commitAndReturn).toBe(true)
    })

    it('m3numrev — обратный порядок (ветка "42" создана, но коммит сделан в master, потом переключение на "42") — ' +
      'commitAndReturn НЕ засчитана, как и с нечисловым именем', () => {
      let s = run(baseState(), 'git checkout -b 42')
      s = run(s, 'git checkout master')
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -am "On master"', 'git checkout 42')
      expect(doneMap(s).commitAndReturn).toBe(false)
    })
  })

  describe('миссия 4 — слить ветку перемоткой (fast-forward)', () => {
    function divergedFeature(): BranchingState {
      let s = run(baseState(), 'git checkout -b feature')
      s = editFile(s, 'style.css')
      return run(s, 'git add style.css', 'git commit -m "покрасить"')
    }

    it('не засчитана сразу после создания ветки (fast-forward ещё не было)', () => {
      const state = run(baseState(), 'git checkout -b feature')
      expect(doneMap(state).fastForwardMerge).toBe(false)
    })

    it('не засчитана сразу после коммита в feature, пока не слито в master', () => {
      const state = divergedFeature()
      expect(doneMap(state).fastForwardMerge).toBe(false)
    })

    it('не засчитана созданием ветки ПОСЛЕ коммита на исходной ветке — обе ветки указывают ' +
      'на один и тот же (не корневой) коммит, но git merge ещё ни разу не вызывался', () => {
      let s = createBranchingSection('init', { 'f.txt': 'a\n' })
      s = editFile(s, 'f.txt')
      s = run(s, 'git commit -am "second"')
      s = run(s, 'git checkout -b feature')
      expect(doneMap(s).fastForwardMerge).toBe(false)
    })

    it('не засчитана коммитом слияния (миссия 5) — тот же граф-признак «тот же коммит», но lastMerge другой', () => {
      let s = run(baseState(), 'git checkout -b feature')
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -m "feature меняет стиль"')
      s = run(s, 'git checkout master')
      s = createFile(s, 'app.js')
      s = run(s, 'git add app.js', 'git commit -m "master добавляет app.js"')
      s = run(s, 'git merge feature')
      expect(doneMap(s).fastForwardMerge).toBe(false)
    })

    it('основной путь: засчитывается после git merge feature на master (перемотка)', () => {
      let state = divergedFeature()
      state = run(state, 'git checkout master', 'git merge feature')
      expect(doneMap(state).fastForwardMerge).toBe(true)
    })
  })

  describe('миссия 5 — развести ветки и слить коммитом слияния', () => {
    function divergedBothSides(): BranchingState {
      let s = run(baseState(), 'git checkout -b feature')
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -m "feature меняет стиль"')
      s = run(s, 'git checkout master')
      s = createFile(s, 'app.js')
      s = run(s, 'git add app.js', 'git commit -m "master добавляет app.js"')
      return s
    }

    it('не засчитана, пока не было настоящего коммита слияния (только перемотка — миссия 4)', () => {
      let s = run(baseState(), 'git checkout -b feature')
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', 'git commit -m "x"')
      s = run(s, 'git checkout master', 'git merge feature')
      expect(doneMap(s).divergedMerge).toBe(false)
    })

    it('засчитывается после коммита слияния двух разошедшихся веток', () => {
      let state = divergedBothSides()
      state = run(state, 'git merge feature')
      expect(doneMap(state).divergedMerge).toBe(true)
    })
  })

  describe('миссия 6 — удалить слитую ветку, прочитать отказ для неслитой ' +
    '(нужны ОБА события, порядок не важен)', () => {
    /** Слить feature в master перемоткой и удалить её "-d" — успешное удаление СЛИТОЙ ветки. */
    function deleteMergedBranch(state: BranchingState, branch: string): BranchingState {
      let s = run(state, `git checkout -b ${branch}`)
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', `git commit -m "коммит в ${branch}"`)
      return run(s, 'git checkout master', `git merge ${branch}`, `git branch -d ${branch}`)
    }

    /** Ветка с коммитом, которую НЕ сливали, — попытка "-d" даёт отказ "is not fully merged". */
    function refuseUnmergedBranch(state: BranchingState, branch: string): BranchingState {
      let s = run(state, `git checkout -b ${branch}`)
      s = editFile(s, 'style.css')
      s = run(s, 'git add style.css', `git commit -m "неслитая правка в ${branch}"`)
      return run(s, 'git checkout master', `git branch -d ${branch}`)
    }

    it('не засчитана одним только успешным удалением слитой ветки — нужен и отказ', () => {
      const state = deleteMergedBranch(baseState(), 'feature')
      expect(doneMap(state).deleteBranches).toBe(false)
    })

    it('не засчитана одним только отказом для неслитой ветки — нужно и успешное удаление слитой', () => {
      const state = refuseUnmergedBranch(baseState(), 'feature')
      expect(doneMap(state).deleteBranches).toBe(false)
    })

    it('засчитывается обоими событиями сразу, в порядке миссии (сначала слитая, потом неслитая)', () => {
      let state = deleteMergedBranch(baseState(), 'feature1')
      state = refuseUnmergedBranch(state, 'feature2')
      expect(doneMap(state).deleteBranches).toBe(true)
    })

    it('порядок событий не важен — отказ раньше успешного удаления тоже засчитывается', () => {
      let state = refuseUnmergedBranch(baseState(), 'feature2')
      state = deleteMergedBranch(state, 'feature1')
      expect(doneMap(state).deleteBranches).toBe(true)
    })

    it('удачное принудительное удаление (-D) не даёт отказа "not fully merged" — миссия не засчитывается им', () => {
      let state = run(baseState(), 'git checkout -b feature')
      state = editFile(state, 'style.css')
      state = run(state, 'git add style.css', 'git commit -m "x"')
      state = run(state, 'git checkout master', 'git branch -D feature')
      expect(doneMap(state).deleteBranches).toBe(false)
    })
  })

  it('тексты и подсказки миссий соответствуют словарю (без склейки строк в движке)', () => {
    const missions = getBranchMissions(baseState())
    expect(missions[0]).toMatchObject({ text: 'Посмотри список веток и пойми, где сейчас стоишь.', hint: 'git branch' })
  })
})
