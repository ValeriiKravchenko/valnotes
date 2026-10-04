// ============================================================
// Раздел 2 git-тренажёра, шаг A: чистые операции над графом коммитов
// и трёхстороннее слияние (branchRepo.ts) — без разбора командной строки.
// ============================================================
import { describe, expect, it } from 'vitest'
import { branchCommitHash, formatBranchingStatus, isAncestor, mergeBase, mergeFileContent, mergeTrees, sameTree } from './branchRepo'
import type { BranchCommit, BranchingState } from './branchTypes'
import { initialBranchMissionsDone } from './branchMissions'

function commit(id: string, parents: string[], tree: Record<string, string> = {}): BranchCommit {
  return { id, parents, message: id, tree }
}

describe('branchCommitHash — target.md, A5 (id зависит от момента коммита, не только от содержимого)', () => {
  it('тот же clock, то же содержимое — тот же id (детерминированность, не рандом/Date.now())', () => {
    const tree = { 'a.txt': 'x' }
    expect(branchCommitHash('m', tree, [], 3)).toBe(branchCommitHash('m', tree, [], 3))
  })

  it('разный clock при одинаковом содержимом и родителях — разный id (два одинаковых коммита ' +
    'в разных ветках — это разные коммиты, а не один и тот же)', () => {
    const tree = { 'a.txt': 'x' }
    expect(branchCommitHash('m', tree, ['p'], 0)).not.toBe(branchCommitHash('m', tree, ['p'], 1))
  })

  it('id по-прежнему зависит от родителей и содержимого, а не только от clock', () => {
    const tree = { 'a.txt': 'x' }
    expect(branchCommitHash('m', tree, ['p1'], 5)).not.toBe(branchCommitHash('m', tree, ['p2'], 5))
    expect(branchCommitHash('m1', tree, ['p'], 5)).not.toBe(branchCommitHash('m2', tree, ['p'], 5))
  })
})

/** Достаёт единственную (неоднозначную) базу из mergeBase — падает, если найдено несколько лучших общих предков. */
function base(g: BranchingState, a: string, b: string): string {
  const r = mergeBase(g, a, b)
  if (r.ambiguous) throw new Error(`ожидалась одна база, найдено несколько: ${r.bases.join(', ')}`)
  return r.base
}

/** Простое линейное состояние для тестов ancestor/mergeBase: a -> b -> c, d ответвился от b. */
function makeGraph(): BranchingState {
  const a = commit('a', [])
  const b = commit('b', ['a'])
  const c = commit('c', ['b'])
  const d = commit('d', ['b'])
  return {
    commits: { a, b, c, d },
    branches: { master: 'c', feature: 'd' },
    branchOrder: ['master', 'feature'],
    head: 'master',
    index: {},
    working: {},
    history: [],
    missionsDone: initialBranchMissionsDone(),
    lastMerge: null,
    clock: 0,
  }
}

describe('isAncestor / mergeBase', () => {
  it('корневой коммит — предок всех потомков', () => {
    const g = makeGraph()
    expect(isAncestor(g, 'a', 'c')).toBe(true)
    expect(isAncestor(g, 'a', 'd')).toBe(true)
  })

  it('коммит не является предком своего собственного предка', () => {
    const g = makeGraph()
    expect(isAncestor(g, 'c', 'a')).toBe(false)
  })

  it('коммит является предком самого себя (граница fast-forward)', () => {
    const g = makeGraph()
    expect(isAncestor(g, 'b', 'b')).toBe(true)
  })

  it('общий предок разошедшихся веток — точка ветвления', () => {
    const g = makeGraph()
    expect(base(g, 'c', 'd')).toBe('b')
  })

  it('общий предок ветки самой с собой — её собственный кончик', () => {
    const g = makeGraph()
    expect(base(g, 'c', 'c')).toBe('c')
  })

  /**
   * Граф слияния для проверки правила «лучший общий предок»: R(f=0); branch y; C1(f=1) на master;
   * branch z от master; Z1, Z2(f=2) на z; на y — Y1; в z вливается y коммитом слияния ZY (родители
   * [Z2, Y1]).
   * Общие предки master(=C1) и z(=ZY) — это {R, C1}, а не только R: обход в ширину от ZY по
   * ПЕРВОМУ встреченному предку C1 попадает на R раньше, чем на C1 (через ветку Y1 -> R), хотя
   * C1 — более поздний (лучший) общий предок. Сверено напрямую (git 2.53.0, временный каталог):
   * `git merge z` при HEAD=master(C1) даёт "Fast-forward", а не конфликт — то есть
   * merge-base(master, z) должен быть C1, не R.
   */
  function makeGraphWithMergeCommit(): BranchingState {
    const R = commit('R', [], { f: 'f0' })
    const C1 = commit('C1', ['R'], { f: 'f1' })
    const Z1 = commit('Z1', ['C1'], { f: 'f1', 'z.txt': 'z1' })
    const Z2 = commit('Z2', ['Z1'], { f: 'f1\nf2', 'z.txt': 'z1' })
    const Y1 = commit('Y1', ['R'], { f: 'f0', 'y.txt': 'y1' })
    const ZY = commit('ZY', ['Z2', 'Y1'], { f: 'f1\nf2', 'z.txt': 'z1', 'y.txt': 'y1' })
    return {
      commits: { R, C1, Z1, Z2, Y1, ZY },
      branches: { master: 'C1', z: 'ZY' },
      branchOrder: ['master', 'z'],
      head: 'master',
      index: {},
      working: {},
      history: [],
      missionsDone: initialBranchMissionsDone(),
      lastMerge: null,
      clock: 0,
    }
  }

  it('лучший общий предок после коммита слияния — C1 (предок другого общего предка R), а не R', () => {
    const g = makeGraphWithMergeCommit()
    expect(base(g, 'C1', 'ZY')).toBe('C1')
  })

  it('тот же случай, но с дополнительным коммитом A на master сверх C1 — база всё равно C1', () => {
    let g = makeGraphWithMergeCommit()
    const A = commit('A', ['C1'], { f: 'f1', 'a.txt': 'aa' })
    g = { ...g, commits: { ...g.commits, A }, branches: { ...g.branches, master: 'A' } }
    expect(base(g, 'A', 'ZY')).toBe('C1')
  })

  /**
   * Крест-накрест история (двойное слияние): R; A1(f=a) на master, B1(g=b) на b (оба — дети R);
   * M1 = слияние B1 в master (родители [A1, B1]); M2 = слияние A1 в b (родители [B1, A1]);
   * A2 — ещё один коммит на master поверх M1; B2 — ещё один коммит на b поверх M2. Общие предки
   * master(A2) и b(B2) — это {R, A1, B1}: A1 и B1 ОБА «лучшие» (ни один не предок другого, и ни
   * один не предок оставшегося общего предка R, а R как раз предок обоих — исключается). Ровно
   * такую историю строят команды шага A (branch/checkout/merge/add/commit), сверено напрямую (git
   * 2.53.0, временный каталог): `git merge-base --all master b` реально печатает ДВА коммита (не
   * один), а `git merge b` при этом сам сливает историю (rc=0, "Merge made by the 'ort'
   * strategy."), без единого конфликта — не выбор базы «наугад» и не отказ.
   */
  function makeCrissCrossGraph(): BranchingState {
    const R = commit('R', [], { f: 'x', g: 'y' })
    const A1 = commit('A1', ['R'], { f: 'a', g: 'y' })
    const B1 = commit('B1', ['R'], { f: 'x', g: 'b' })
    const M1 = commit('M1', ['A1', 'B1'], { f: 'a', g: 'b' })
    const M2 = commit('M2', ['B1', 'A1'], { f: 'a', g: 'b' })
    const A2 = commit('A2', ['M1'], { f: 'a2', g: 'b' })
    const B2 = commit('B2', ['M2'], { f: 'a', g: 'b2' })
    return {
      commits: { R, A1, B1, M1, M2, A2, B2 },
      branches: { master: 'A2', b: 'B2' },
      branchOrder: ['master', 'b'],
      head: 'master',
      index: {},
      working: {},
      history: [],
      missionsDone: initialBranchMissionsDone(),
      lastMerge: null,
      clock: 0,
    }
  }

  it('крест-накрест история — mergeBase возвращает ДВА лучших общих предка (неоднозначно), не выбирает один наугад', () => {
    const g = makeCrissCrossGraph()
    const r = mergeBase(g, 'A2', 'B2')
    expect(r.ambiguous).toBe(true)
    if (r.ambiguous) expect(r.bases.slice().sort()).toEqual(['A1', 'B1'])
  })
})

describe('mergeFileContent — трёхстороннее построчное слияние (target.md, часть IV, «опасное место 5»)', () => {
  it('правки в разных строках сливаются без конфликта', () => {
    const base = 'line1\nline2\nline3'
    const ours = 'line1-changed\nline2\nline3'
    const theirs = 'line1\nline2\nline3-changed'
    const result = mergeFileContent(base, ours, theirs)
    expect(result.conflict).toBe(false)
    expect(result.content).toBe('line1-changed\nline2\nline3-changed')
  })

  it('запрещённое упрощение исключено: правки в РАЗНЫХ строках — это не конфликт', () => {
    // Явная проверка того, что описано в CLAUDE.md/target.md как запрещённое:
    // «если файл менялся в обеих ветках — значит конфликт» не должно срабатывать.
    const base = 'a\nb\nc\nd'
    const ours = 'A\nb\nc\nd'
    const theirs = 'a\nb\nc\nD'
    expect(mergeFileContent(base, ours, theirs).conflict).toBe(false)
  })

  it('правки в одних и тех же строках — настоящий конфликт', () => {
    const base = 'line1\nline2'
    const ours = 'line1-a\nline2'
    const theirs = 'line1-b\nline2'
    expect(mergeFileContent(base, ours, theirs).conflict).toBe(true)
  })

  it('при conflict:true content — null, а не валидная строка, ' +
    'которую легко спутать с настоящим результатом слияния', () => {
    const base = 'line1\nline2'
    const ours = 'line1-a\nline2'
    const theirs = 'line1-b\nline2'
    const result = mergeFileContent(base, ours, theirs)
    expect(result.conflict).toBe(true)
    expect(result.content).toBeNull()
  })

  it('одинаковая правка с обеих сторон — не конфликт', () => {
    const base = 'line1\nline2'
    const ours = 'line1-changed\nline2'
    const theirs = 'line1-changed\nline2'
    const result = mergeFileContent(base, ours, theirs)
    expect(result.conflict).toBe(false)
    expect(result.content).toBe('line1-changed\nline2')
  })

  it('если изменилась только одна сторона — берётся её версия без построчного слияния (autoMerged=false)', () => {
    const base = 'line1\nline2'
    const ours = 'line1-changed\nline2'
    const theirs = 'line1\nline2'
    const result = mergeFileContent(base, ours, theirs)
    expect(result.content).toBe('line1-changed\nline2')
    expect(result.autoMerged).toBe(false)
  })

  it('соприкасающиеся правки без общей неизменённой строки базы между ' +
    'ними — конфликт, а не молчаливое слияние (сверено на git 2.53.0: CONFLICT (content))', () => {
    const base = 'a\nb\nc'
    const ours = 'a\nX\nc'
    const theirs = 'a\nb\nY'
    expect(mergeFileContent(base, ours, theirs).conflict).toBe(true)
  })

  it('обе стороны дописали РАЗНУЮ строку в конец файла — конфликт ' +
    '(самый частый учебный сценарий; сверено на git 2.53.0: CONFLICT (content))', () => {
    const base = 'a'
    const ours = 'a\nours'
    const theirs = 'a\ntheirs'
    expect(mergeFileContent(base, ours, theirs).conflict).toBe(true)
  })

  it('одинаковая вставка с обеих сторон схлопывается в одну, а не ' +
    'дублируется (сверено на git 2.53.0: результат "a\\nX\\nb\\nO", без повтора X)', () => {
    const base = 'a\nb'
    const ours = 'a\nX\nb\nO'
    const theirs = 'a\nX\nb'
    const result = mergeFileContent(base, ours, theirs)
    expect(result.conflict).toBe(false)
    expect(result.content).toBe('a\nX\nb\nO')
  })
})

describe('mergeTrees — трёхстороннее слияние деревьев файлов', () => {
  it('файл, изменённый только в одной ветке, берётся из неё без слияния строк (autoMerged пуст)', () => {
    const base = { 'a.txt': 'x' }
    const ours = { 'a.txt': 'x-ours' }
    const theirs = { 'a.txt': 'x' }
    const result = mergeTrees(base, ours, theirs)
    expect(result.tree).toEqual({ 'a.txt': 'x-ours' })
    expect(result.autoMerged).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('файл, изменённый в разных строках в обеих ветках, — в autoMerged', () => {
    const base = { 'a.txt': 'l1\nl2\nl3' }
    const ours = { 'a.txt': 'L1\nl2\nl3' }
    const theirs = { 'a.txt': 'l1\nl2\nL3' }
    const result = mergeTrees(base, ours, theirs)
    expect(result.tree['a.txt']).toBe('L1\nl2\nL3')
    expect(result.autoMerged).toEqual(['a.txt'])
    expect(result.conflicts).toEqual([])
  })

  it('новый файл в одной ветке (нет в базе и в другой ветке) добавляется без конфликта', () => {
    const base = {}
    const ours = { 'new.txt': 'x' }
    const theirs = {}
    const result = mergeTrees(base, ours, theirs)
    expect(result.tree).toEqual({ 'new.txt': 'x' })
  })

  it('удаление файла в одной ветке при отсутствии правок в другой — файл удаляется без конфликта', () => {
    const base = { 'a.txt': 'x' }
    const ours = {} // удалён
    const theirs = { 'a.txt': 'x' } // не менялся
    const result = mergeTrees(base, ours, theirs)
    expect(result.tree).toEqual({})
    expect(result.conflicts).toEqual([])
  })

  it('пересекающийся конфликт попадает в conflicts, а не в tree', () => {
    const base = { 'a.txt': 'line1\nline2' }
    const ours = { 'a.txt': 'ours1\nline2' }
    const theirs = { 'a.txt': 'theirs1\nline2' }
    const result = mergeTrees(base, ours, theirs)
    expect(result.conflicts).toEqual([{ file: 'a.txt', kind: 'content' }])
    expect(result.tree['a.txt']).toBeUndefined()
  })

  it('modify/delete — файл удалён в одной ветке, изменён в другой ' +
    '(сверено на git 2.53.0: CONFLICT (modify/delete))', () => {
    const base = { 'a.txt': 'x' }
    const ours = {} // удалён
    const theirs = { 'a.txt': 'x-changed' } // изменён
    const result = mergeTrees(base, ours, theirs)
    expect(result.conflicts).toEqual([{ file: 'a.txt', kind: 'modify-delete' }])
  })

  it('add/add — файл создан в обеих ветках с разным содержимым, ' +
    'общей базы нет (сверено на git 2.53.0: CONFLICT (add/add))', () => {
    const base = {}
    const ours = { 'new.txt': 'ours-content' }
    const theirs = { 'new.txt': 'theirs-content' }
    const result = mergeTrees(base, ours, theirs)
    expect(result.conflicts).toEqual([{ file: 'new.txt', kind: 'add-add' }])
  })
})

describe('sameTree', () => {
  it('деревья с одинаковым содержимым равны независимо от порядка ключей', () => {
    expect(sameTree({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
  })
  it('разное содержимое — не равны', () => {
    expect(sameTree({ a: '1' }, { a: '2' })).toBe(false)
  })
})

describe('formatBranchingStatus — блок "Changes to be committed"', () => {
  it('печатает подсказку "(use \\"git restore --staged <file>...\\" to unstage)" под заголовком блока, как настоящий git', () => {
    const h = commit('h', [], { 'a.txt': 'base' })
    const g: BranchingState = {
      commits: { h },
      branches: { master: 'h' },
      branchOrder: ['master'],
      head: 'master',
      index: { 'a.txt': 'changed' },
      working: { 'a.txt': 'changed' },
      history: [],
      missionsDone: initialBranchMissionsDone(),
      lastMerge: null,
      clock: 0,
    }
    expect(formatBranchingStatus(g)).toBe(
      'On branch master\n' + 'Changes to be committed:\n' + '  (use "git restore --staged <file>..." to unstage)\n' + '\tmodified:   a.txt\n',
    )
  })
})
