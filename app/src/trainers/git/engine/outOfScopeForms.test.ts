// ============================================================
// Проверки общей границы области (outOfScopeForms.ts): классификатор ссылок, refspec, адресов,
// pathspec, аргументов init, форм blame и опций. Плюс сверка пресетов грамматик с настоящими
// резолверами разделов: токен, который грамматика называет чужим, резолвер раздела не должен
// разбирать, а токен «в грамматике» из образца обязан разбирать. Иначе классификатор и раздел
// расходятся молча.
// ============================================================
import { describe, expect, it } from 'vitest'
import {
  INSPECT_REF_GRAMMAR,
  REMOTE_REF_GRAMMAR,
  SEARCH_REF_GRAMMAR,
  UNDO_REF_GRAMMAR,
  classifyBlameForm,
  classifyInitArguments,
  classifyOptionToken,
  classifyPathspec,
  classifyPushRefspec,
  classifyRefToken,
  classifyRepositoryArgument,
  gitUnrecognizedArgument,
  type RefGrammar,
} from './outOfScopeForms'
import { createInspectSection } from './inspectSection'
import { resolveRef as resolveInspectRef } from './inspectRepo'
import { createUndoSection } from './undoSection'
import { resolveRef as resolveUndoRef } from './undoRepo'
import { createSearchSection } from './searchSection'
import { resolveSearchRef } from './searchRepo'
import { ru } from '../locales/ru'

describe('classifyRefToken: обычные имена и синтаксис ревизий', () => {
  it('голое имя, хэш, HEAD — plain: ошибка поиска остаётся настоящей ошибкой git', () => {
    for (const t of ['master', 'nosuch', 'abcd123', 'HEAD', 'feature/x']) {
      expect(classifyRefToken(t, INSPECT_REF_GRAMMAR)).toBe('plain')
    }
  })

  it('раздел 3: HEAD~N, HEAD^, HEAD~~, master~1, HEAD~1^ — в грамматике', () => {
    for (const t of ['HEAD~1', 'HEAD~3', 'HEAD^', 'HEAD^^', 'HEAD~~', 'master~1', 'HEAD~1^', 'HEAD~', 'HEAD^1', 'HEAD^0']) {
      expect(classifyRefToken(t, INSPECT_REF_GRAMMAR)).toBe('inGrammar')
    }
  })

  it('раздел 3: HEAD@{0} разрешён как тривиальный случай, HEAD@{1} и HEAD@{99} — чужие', () => {
    expect(classifyRefToken('HEAD@{0}', INSPECT_REF_GRAMMAR)).toBe('inGrammar')
    expect(classifyRefToken('HEAD@{1}', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('HEAD@{99}', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('master@{yesterday}', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('@', INSPECT_REF_GRAMMAR)).toBe('foreign')
  })

  it('раздел 3: HEAD^2 (второй родитель) — чужой, как требует решение по B2', () => {
    expect(classifyRefToken('HEAD^2', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('HEAD~1^2', INSPECT_REF_GRAMMAR)).toBe('foreign')
  })

  it('диапазоны: A..B в грамматике, пустая сторона и A...B — чужие, имена внутри — обычные', () => {
    expect(classifyRefToken('HEAD~2..HEAD', INSPECT_REF_GRAMMAR)).toBe('inGrammar')
    expect(classifyRefToken('a..b', INSPECT_REF_GRAMMAR)).toBe('inGrammar') // несуществующие имена: ошибка git остаётся
    expect(classifyRefToken('HEAD~1..', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('..HEAD', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('HEAD..', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('a...b', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('a..b..c', INSPECT_REF_GRAMMAR)).toBe('foreign')
    expect(classifyRefToken('HEAD@{1}..HEAD', INSPECT_REF_GRAMMAR)).toBe('foreign')
  })

  it('двоеточие (ревизия:путь) — чужое везде', () => {
    for (const g of [INSPECT_REF_GRAMMAR, UNDO_REF_GRAMMAR, REMOTE_REF_GRAMMAR, SEARCH_REF_GRAMMAR]) {
      expect(classifyRefToken('master:app.js', g)).toBe('foreign')
    }
  })

  it('раздел 4: только HEAD~N с числом; HEAD^, HEAD~~, master~1, HEAD~ — чужие', () => {
    expect(classifyRefToken('HEAD~1', UNDO_REF_GRAMMAR)).toBe('inGrammar')
    expect(classifyRefToken('HEAD~12', UNDO_REF_GRAMMAR)).toBe('inGrammar')
    for (const t of ['HEAD^', 'HEAD~~', 'master~1', 'HEAD~', 'HEAD~1^', 'HEAD~1~1', 'HEAD@{0}']) {
      expect(classifyRefToken(t, UNDO_REF_GRAMMAR)).toBe('foreign')
    }
    expect(classifyRefToken('HEAD~1..HEAD', UNDO_REF_GRAMMAR)).toBe('foreign')
  })

  it('раздел 5: любой оператор ревизий чужой', () => {
    for (const t of ['HEAD~1', 'HEAD^', 'origin/master~1']) {
      expect(classifyRefToken(t, REMOTE_REF_GRAMMAR)).toBe('foreign')
    }
    expect(classifyRefToken('origin/master', REMOTE_REF_GRAMMAR)).toBe('plain')
  })

  it('раздел 6: ^ и ~ разбираются, ^2, диапазоны и @{…} — чужие', () => {
    for (const t of ['HEAD~1', 'master~2', 'HEAD^', 'HEAD^^']) {
      expect(classifyRefToken(t, SEARCH_REF_GRAMMAR)).toBe('inGrammar')
    }
    for (const t of ['HEAD^2', 'HEAD~1..HEAD', '..HEAD', 'HEAD@{0}', 'HEAD@{1}']) {
      expect(classifyRefToken(t, SEARCH_REF_GRAMMAR)).toBe('foreign')
    }
  })
})

describe('пресеты грамматик сверены с резолверами разделов', () => {
  const inspect = createInspectSection({
    commits: [
      { message: 'one', tree: { 'index.html': 'a' } },
      { message: 'two', tree: { 'index.html': 'b' } },
      { message: 'three', tree: { 'index.html': 'c' } },
    ],
    index: { 'index.html': 'c' },
    working: { 'index.html': 'c' },
  })
  const undo = createUndoSection({ commits: ru.undo.seed.commits })
  const search = createSearchSection({ commits: ru.searching.seed.commits })

  const TOKENS = [
    'HEAD', 'master', 'HEAD~1', 'HEAD~2', 'HEAD~', 'HEAD^', 'HEAD^^', 'HEAD~~', 'HEAD^0', 'HEAD^1', 'HEAD^2',
    'master~1', 'HEAD~1^', 'HEAD@{0}', 'HEAD@{1}', 'HEAD@{99}', '@', 'master:app.js',
  ]

  function check(name: string, grammar: RefGrammar, resolve: (t: string) => string | null) {
    it(`${name}: то, что грамматика называет чужим, резолвер не разбирает`, () => {
      for (const t of TOKENS) {
        if (classifyRefToken(t, grammar) === 'foreign') expect(resolve(t), t).toBeNull()
      }
    })
  }

  check('раздел 3', INSPECT_REF_GRAMMAR, (t) => resolveInspectRef(inspect, t))
  check('раздел 4', UNDO_REF_GRAMMAR, (t) => resolveUndoRef(undo, t))
  check('раздел 6', SEARCH_REF_GRAMMAR, (t) => resolveSearchRef(search, t))

  it('раздел 3: образцы «в грамматике» резолвер разбирает', () => {
    for (const t of ['HEAD', 'master', 'HEAD~1', 'HEAD~2', 'HEAD^', 'HEAD~~', 'master~1', 'HEAD@{0}', 'HEAD~1^']) {
      expect(classifyRefToken(t, INSPECT_REF_GRAMMAR), t).not.toBe('foreign')
      expect(resolveInspectRef(inspect, t), t).not.toBeNull()
    }
  })

  it('раздел 4: образцы «в грамматике» резолвер разбирает', () => {
    for (const t of ['HEAD', 'HEAD~1']) expect(resolveUndoRef(undo, t), t).not.toBeNull()
  })

  it('раздел 6: образцы «в грамматике» резолвер разбирает', () => {
    for (const t of ['HEAD', 'HEAD~1', 'HEAD^']) expect(resolveSearchRef(search, t), t).not.toBeNull()
  })

  it('за корнем остаётся «в грамматике»: это настоящая ошибка git, а не отказ', () => {
    expect(classifyRefToken('HEAD~9', INSPECT_REF_GRAMMAR)).toBe('inGrammar')
    expect(resolveInspectRef(inspect, 'HEAD~9')).toBeNull()
  })
})

describe('classifyPushRefspec', () => {
  it('голая ветка и HEAD — обычные', () => {
    expect(classifyPushRefspec('master')).toBe('plain')
    expect(classifyPushRefspec('HEAD')).toBe('plain')
    expect(classifyPushRefspec('feature')).toBe('plain')
  })

  it('<src>:<dst>, :<dst>, +ветка, refs/…, шаблон, выражение ревизии — чужие', () => {
    for (const t of ['master:master', 'HEAD:other', ':master', ':other', '+master', 'refs/heads/master', 'refs/*:refs/*', 'HEAD~1', 'HEAD^']) {
      expect(classifyPushRefspec(t), t).toBe('foreign')
    }
  })
})

describe('classifyRepositoryArgument', () => {
  it('имя без слэшей — обычное: неизвестное имя остаётся настоящей ошибкой git', () => {
    expect(classifyRepositoryArgument('origin')).toBe('plain')
    expect(classifyRepositoryArgument('nosuch')).toBe('plain')
  })

  it('пути — pathLike', () => {
    for (const t of ['/team/origin', './origin', '../origin', 'origin/', '../team/origin', '~/x', '.']) {
      expect(classifyRepositoryArgument(t), t).toBe('pathLike')
    }
  })

  it('сетевые адреса — url', () => {
    for (const t of ['https://github.com/team/site.git', 'git@github.com:team/site.git', 'ssh://host/x', 'git://host/x', 'file:///tmp/x']) {
      expect(classifyRepositoryArgument(t), t).toBe('url')
    }
  })
})

describe('classifyPathspec', () => {
  it('голое имя и точка — обычные', () => {
    expect(classifyPathspec('index.html', { globs: false })).toBe('plain')
    expect(classifyPathspec('.', { globs: false })).toBe('plain')
  })

  it('./, ../ и магия pathspec — чужие в любом разделе', () => {
    for (const g of [{ globs: false }, { globs: true }]) {
      for (const t of ['./index.html', '../x', '..', ':(glob)*.html', ':!index.html']) {
        expect(classifyPathspec(t, g), t).toBe('foreign')
      }
    }
  })

  it('глоб: чужой там, где его не разбирают, обычный в разделе 1', () => {
    expect(classifyPathspec('*.html', { globs: false })).toBe('foreign')
    expect(classifyPathspec('in?ex.html', { globs: false })).toBe('foreign')
    expect(classifyPathspec('[ab].js', { globs: false })).toBe('foreign')
    expect(classifyPathspec('*.html', { globs: true })).toBe('plain')
    expect(classifyPathspec('a\\*b', { globs: false })).toBe('foreign')
    expect(classifyPathspec('a\\*b', { globs: true })).toBe('plain')
  })
})

describe('classifyInitArguments', () => {
  it('голая команда — none', () => {
    expect(classifyInitArguments([])).toBe('none')
  })

  it('любой аргумент — foreign', () => {
    for (const args of [['--bare'], ['extra'], ['-b', 'main'], ['-q'], ['.']]) {
      expect(classifyInitArguments(args), args.join(' ')).toBe('foreign')
    }
  })
})

describe('classifyBlameForm', () => {
  const ctx = {
    isTrackedFile: (n: string) => n === 'app.js' || n === 'utils.js',
    isRevision: (n: string) => n === 'HEAD' || n.startsWith('HEAD~') || n === 'master',
  }

  it('обычные формы — null', () => {
    expect(classifyBlameForm(['app.js'], ctx)).toBeNull()
    expect(classifyBlameForm(['-s', 'app.js'], ctx)).toBeNull()
    expect(classifyBlameForm(['-L', '5,5', 'app.js'], ctx)).toBeNull()
    expect(classifyBlameForm(['-L', '2', 'app.js'], ctx)).toBeNull()
  })

  it('ревизия перед файлом — чужая', () => {
    expect(classifyBlameForm(['HEAD', 'app.js'], ctx)).toBe('revisionBeforeFile')
    expect(classifyBlameForm(['HEAD~1', 'app.js'], ctx)).toBe('revisionBeforeFile')
    expect(classifyBlameForm(['master', '--', 'app.js'], ctx)).toBe('revisionBeforeFile')
  })

  it('два файла — это настоящая ошибка git (bad revision), а не отказ', () => {
    expect(classifyBlameForm(['app.js', 'utils.js'], ctx)).toBeNull()
  })

  it('повтор -L и приклеенное значение — чужие (по решению B8)', () => {
    expect(classifyBlameForm(['-L', '2', '-L', '5', 'app.js'], ctx)).toBe('repeatedLineRange')
    expect(classifyBlameForm(['-L5,5', 'app.js'], ctx)).toBe('gluedLineRange')
  })

  it('значение -L не принимается за позиционный аргумент', () => {
    expect(classifyBlameForm(['-L', 'HEAD', 'app.js'], ctx)).toBeNull()
  })
})

describe('classifyOptionToken', () => {
  const exhaustive = { inScope: ['-m', '--message'], verifiedReal: ['-m', '--message', '-v', '--verbose', '--amend'], exhaustive: true }
  const partial = { inScope: ['--oneline'], verifiedReal: ['--graph', '-p'], exhaustive: false, knownAbsent: ['--one'] }

  it('в области — scope, значение после = отбрасывается', () => {
    expect(classifyOptionToken('-m', exhaustive)).toBe('scope')
    expect(classifyOptionToken('--message=текст', exhaustive)).toBe('scope')
  })

  it('настоящая, но не разбираемая — refuse', () => {
    expect(classifyOptionToken('--amend', exhaustive)).toBe('refuse')
    expect(classifyOptionToken('-p', partial)).toBe('refuse')
  })

  it('исчерпывающий список: опции вне него не существует — unknown', () => {
    expect(classifyOptionToken('--bogus', exhaustive)).toBe('unknown')
    expect(classifyOptionToken('-Z', exhaustive)).toBe('unknown')
  })

  it('неисчерпывающий список: при сомнении refuse, unknown только для заведомо несуществующих', () => {
    expect(classifyOptionToken('--color', partial)).toBe('refuse')
    expect(classifyOptionToken('--bogus', partial)).toBe('refuse')
    expect(classifyOptionToken('--one', partial)).toBe('unknown')
  })
})

describe('gitUnrecognizedArgument', () => {
  it('дословный ответ git на git log --one', () => {
    expect(gitUnrecognizedArgument('--one')).toBe('fatal: unrecognized argument: --one')
  })
})
