import { describe, expect, it } from 'vitest'
import { createFile, createSection, deleteFile, resetSection, runCommand } from './index'
import type { SectionState } from './index'
import { commitHash } from './repo'
import { ru } from '../locales/ru'

function run(state: SectionState, ...lines: string[]): SectionState {
  return lines.reduce((s, line) => runCommand(s, line).state, state)
}

describe('spec 2.5 — git add', () => {
  it('target.md, B2: git add без аргументов — успех (настоящий git завершается кодом 0)', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git add')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe(
      "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\n" +
        'hint: Disable this message with "git config set advice.addEmptyPathspec false"',
    )
    expect(result?.explanation).toBeNull()
  })

  it('spec S1-51: git add nosuch — pathspec-отказ с пояснением, индекс не меняется', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add nosuch')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: pathspec 'nosuch' did not match any files")
    expect(result?.explanation).toBe(
      'Git не нашёл такого файла. Имя должно совпадать с тем, что в списке «Файлы в рабочем дереве» — проверь его в git status.',
    )
    expect(after.index).toEqual({})
  })

  it('spec S1-52: git add index.html nosuch — ни один файл не добавлен', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add index.html nosuch')
    expect(result?.ok).toBe(false)
    expect(after.index).toEqual({})
  })

  it('target.md, часть III, правило 1: git add -p — опция реальна, но раздел 1 не разбирает (случай 2, честный маркированный отказ)', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add -p')
    expect(result?.ok).toBe(false)
    // Список "здесь поддерживаются" перечисляет ВСЁ, что реально работает у add
    // (SECTION_SCOPE.options.add), не только флаги -A/--all.
    expect(result?.output).toBe(
      '[тренажёр] git add -p — настоящая опция git, но раздел 1 её не разбирает. Здесь поддерживаются: git add <файл>, git add ., -A, --all, git add *, --.',
    )
    expect(after.index).toEqual({})
  })

  it('target.md, часть III, правило 1 (пункт 4): git add -nv — кластер коротких опций разбирается посимвольно (та же модель, что у commit), не как один неизвестный токен "nv"', () => {
    // "-n" (dry-run) и "-v" (verbose) — обе реальные опции git add, обе вне области раздела 1.
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git add -nv')
    expect(result?.ok).toBe(false)
    expect(result?.output).not.toContain('unknown')
    expect(result?.output).toContain('git add -n')
  })

  it('кластер "-An" — первый символ ("-A") в области, второй ("-n") нет: посимвольный разбор доходит до второго и честно останавливается на нём', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git add -An')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('git add -n')
  })

  it('target.md, часть III, правило 1: git add -x index.html — такой опции у git нет (случай 3, буквальная ошибка git)', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add -x index.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: unknown switch `x'")
    expect(after.index).toEqual({})
  })

  it('target.md, часть III, правило 1 (scope.ts, SECTION_SCOPE.options.add.separator): git add -- <файл> — "--" отделяет опции от pathspec, путь распознаётся даже если начинается с "-" (проверено напрямую: `git add -- -weird.txt` на git 2.53)', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, '-weird.txt')
    const { state: after, result } = runCommand(state, 'git add -- -weird.txt')
    expect(result?.ok).toBe(true)
    expect(after.index['-weird.txt']).toBeDefined()
  })

  it('контраст: без "--" то же самое слово трактуется как флаг, а не как pathspec — поэтому не добавляется', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, '-weird.txt')
    const { state: after, result } = runCommand(state, 'git add -weird.txt')
    expect(result?.ok).toBe(false)
    expect(after.index['-weird.txt']).toBeUndefined()
  })

  it('git add -- index.html other.txt — несколько путей после "--", ни один не начинается с "-"', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, 'other.txt')
    const { state: after, result } = runCommand(state, 'git add -- index.html other.txt')
    expect(result?.ok).toBe(true)
    expect(after.index['index.html']).toBeDefined()
    expect(after.index['other.txt']).toBeDefined()
  })

  it('git add -- без путей после разделителя — тот же ответ, что и у "git add" совсем без аргументов (проверено напрямую на git 2.53)', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add --')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe(
      "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?\n" +
        'hint: Disable this message with "git config set advice.addEmptyPathspec false"',
    )
    expect(result?.explanation).toBeNull()
    expect(after.index).toEqual({})
  })

  it('spec S1-54: несколько файлов сразу — оба в индексе, вывод пуст', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, 'a.txt')
    state = createFile(state, 'b.txt')
    const { state: after, result } = runCommand(state, 'git add a.txt b.txt')
    expect(result?.ok).toBe(true)
    expect(result?.output).toBe('')
    expect(after.index['a.txt']).toBeDefined()
    expect(after.index['b.txt']).toBeDefined()
  })

  it('spec S1-55: git add . / -A / --all эквивалентны и снимают удалённые файлы с учёта', () => {
    // target.md, A4: "*" в этот список не входит — его раскрывает шелл, а не git (см. тест ниже).
    for (const cmd of ['git add .', 'git add -A', 'git add --all']) {
      let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
      state = deleteFile(state, 'index.html')
      state = createFile(state, 'new.txt')
      const { state: after, result } = runCommand(state, cmd)
      expect(result?.ok, cmd).toBe(true)
      expect(after.index['index.html'], cmd).toBeUndefined()
      expect(after.index['new.txt'], cmd).toBeDefined()
    }
  })

  it('target.md, A4: git add * раскрывается шеллом — не ловит удаления и пропускает файлы с точкой (классические грабли)', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = deleteFile(state, 'index.html') // удалён файл — "*" его не видит (нет в рабочем дереве)
    state = createFile(state, 'new.txt') // обычный видимый файл — "*" его подхватит
    state = createFile(state, '.hidden') // файл с точкой — "*" его не подхватывает (в отличие от -A)
    const { state: after, result } = runCommand(state, 'git add *')
    expect(result?.ok).toBe(true)
    // грабли 1: git add * не фиксирует удаление — index.html остаётся в индексе как был
    expect(after.index['index.html']).toBe('<h1>Мой сайт</h1>')
    // обычный видимый файл добавлен
    expect(after.index['new.txt']).toBeDefined()
    // грабли 2: файл, начинающийся с точки, "*" не подхватывает
    expect(after.index['.hidden']).toBeUndefined()
  })

  it('target.md, A4: "*" без единого совпадения — git получает литеральную строку "*" и не находит такой файл', () => {
    let state = run(createSection(), 'git init')
    state = deleteFile(state, 'index.html') // рабочее дерево пусто — раскрывать "*" не во что
    const { result } = runCommand(state, 'git add *')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: pathspec '*' did not match any files")
  })

  it('spec S1-56: git add -A d.txt — флаг не расширяет действие, добавляется только d.txt', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = deleteFile(state, 'index.html')
    state = createFile(state, 'd.txt')
    const { state: after } = runCommand(state, 'git add -A d.txt')
    expect(after.index['d.txt']).toBeDefined()
    expect(after.index['index.html']).toBe('<h1>Мой сайт</h1>') // не снято с учёта — -A не сработал на весь каталог
  })

  it('spec S1-57: файл удалён, но есть в индексе — git add отмечает удаление в "to be committed"', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = deleteFile(state, 'index.html')
    const { state: after, result } = runCommand(state, 'git add index.html')
    expect(result?.ok).toBe(true)
    expect('index.html' in after.index).toBe(false)
    const status = runCommand(after, 'git status').result
    expect(status?.output).toContain('Changes to be committed:\n\tdeleted:    index.html')
  })

  it('spec S1-58: файл удалён и его нет в индексе (нет коммитов) — pathspec-отказ', () => {
    let state = run(createSection(), 'git init')
    state = deleteFile(state, 'index.html')
    const { result } = runCommand(state, 'git add index.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: pathspec 'index.html' did not match any files")
  })
})

describe('spec 2.5 — git commit', () => {
  it('spec S1-60: git commit -m без значения — отказ, без пояснения', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -m')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: switch `m' requires a value")
    expect(result?.explanation).toBeNull()
  })

  it('spec S1-61: сообщение без кавычек (два слова) — второе слово как pathspec, есть пояснение про кавычки', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m Первый коммит')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: pathspec 'коммит' did not match any file(s) known to git")
    expect(result?.explanation).toBe(
      'Сообщение коммита нужно взять в кавычки: git commit -m "Первый коммит". Без кавычек строку на слова разбивает шелл ещё до того, как её увидит git, — git получает только первое слово как сообщение, а остальные слова достаются ему как имена файлов.',
    )
    expect(after.commits).toHaveLength(0)
  })

  it('spec S1-66: git commit nosuch -m x — путь ПЕРЕД -m, пояснения про кавычки НЕТ (target.md, сужение условия)', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit nosuch -m x')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: pathspec 'nosuch' did not match any file(s) known to git")
    expect(result?.explanation).toBeNull()
  })

  it('spec S1-62: git commit -m Первый (одно слово без кавычек) — успех', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m Первый')
    expect(result?.ok).toBe(true)
    expect(after.commits[0]?.message).toBe('Первый')
  })

  it('spec S1-63: git commit -m "" — отказ Aborting due to empty message, с пояснением про пустое сообщение (не про редактор — -m БЫЛ дан)', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m ""')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe('Aborting commit due to empty commit message.')
    expect(result?.explanation).toBe(ru.explain.commitAbortingEmptyMessage)
    expect(after.commits).toHaveLength(0)
    expect(after.index).toEqual(state.index) // индекс откатывается при неудачном коммите
  })

  it('target.md, часть III, правило 1: git commit -x / --amend — три ответа, не один общий "не поддерживается"', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    // -x: такой короткой опции у commit нет вообще — случай 3, буквальная ошибка git.
    const short = runCommand(state, 'git commit -x')
    expect(short.result?.ok).toBe(false)
    expect(short.result?.output).toBe("error: unknown switch `x'")
    // --amend: опция настоящая, но раздел 1 её не разбирает — случай 2, честный маркированный отказ.
    const long = runCommand(state, 'git commit --amend')
    expect(long.result?.ok).toBe(false)
    // Полный список того, что реально работает у commit (SECTION_SCOPE.options.commit),
    // а не только флаги.
    expect(long.result?.output).toBe(
      '[тренажёр] git commit --amend — настоящая опция git, но раздел 1 её не разбирает. Здесь поддерживаются: git commit -m "..." <файл>, -m, -a, --all, --.',
    )
  })

  it('commitFlags.ts общий для разделов 1 и 2: git commit -qx — виновата "x" (unknown switch), а не "-q" ' +
    '(сверено на git 2.53.0, 24.09.2026: git проходит "-q" — она реальна, REAL_GIT_OPTIONS.commit, scope.ts — и останавливается только на "x")', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -qx -m "текст"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: unknown switch `x'")
  })

  it('та же правка: git commit -qv — обе буквы реальны и не реализованы разделом 1: честный отказ на всём кластере, не на первой букве', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -qv -m "текст"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('[тренажёр]')
    expect(result?.output).not.toMatch(/^error: unknown/)
  })

  // Регрессия: буква, реальная у git, но не реализованная разделом 1 (не "a"/"m"), стоящая ПЕРЕД
  // "m" в одном кластере, не должна молча теряться — классификация "m" обязана сначала проверить,
  // не встретилась ли уже такая буква раньше в этом же токене (classifyCommitFlagToken,
  // commitFlags.ts). Настоящий git ведёт себя для каждой из этих форм по-разному (сверено
  // напрямую, git 2.53.0, 25.09.2026, временный каталог): "-qam" — тихий коммит (код 0, коммит
  // создан); "-sam" — коммит с трейлером "Signed-off-by"; "-iam" — fatal (несовместимость "-i" и
  // "-a"); "-eam" (со значением сообщения сразу за собой) — вызывает редактор. Раздел 1 ни одно из
  // этих поведений не реализует (target.md, «-q»/«-s»/«-i»/«-e» вне области) — важно только, что
  // ни одна из этих форм не должна тихо превращаться в ОБЫЧНЫЙ коммит без честного отказа.
  it.each(['-qam', '-sam', '-iam', '-eam'])(
    'регрессия: git commit %s "текст" — реальная нереализованная буква ДО "a"/"m" в кластере не теряется: честный отказ, не обычный коммит',
    (flag) => {
      const state = run(createSection(), 'git init', 'git add index.html')
      const { state: after, result } = runCommand(state, `git commit ${flag} "текст"`)
      expect(result?.ok).toBe(false)
      expect(result?.output).toContain('[тренажёр]')
      expect(result?.output).not.toMatch(/^error: unknown/)
      expect(after.commits).toHaveLength(0)
    },
  )

  it('регрессия: git commit -aqm "текст" — та же реальная нереализованная буква В СЕРЕДИНЕ кластера (между "a" и "m") тоже не теряется', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -aqm "текст"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('[тренажёр]')
    expect(result?.output).not.toMatch(/^error: unknown/)
    expect(after.commits).toHaveLength(0)
  })

  it('после "m" остаток кластера — всегда текст сообщения, а не флаг: "-amq" коммитит с сообщением "q" (сверено напрямую, git 2.53.0, 25.09.2026)', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -amq')
    expect(result?.ok).toBe(true)
    expect(after.commits[0]?.message).toBe('q')
  })

  it('spec S1-65 / target.md A8 уточнение: git commit index.html (путь без -m) — отказ, редактора в песочнице нет', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit index.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(
      '[тренажёр] коммит по конкретным файлам без сообщения (-m) в этом разделе не поддерживается — здесь нет текстового редактора, который бы его запросил. Добавь сообщение сразу: git commit -m "текст" <файл>.',
    )
    expect(result?.explanation).toBeNull()
  })

  it('target.md, A12: git commit -m Первый index.html СРАЗУ после git init — index.html нигде не отслеживается, pathspec-отказ, коммит не создаётся', () => {
    // Pathspec проверяется по известности git, а не по наличию на диске: index.html лежит в
    // рабочем дереве, но его нет ни в индексе, ни в HEAD, то есть git его "не знает".
    // Настоящий git отказывает.
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git commit -m Первый index.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: pathspec 'index.html' did not match any file(s) known to git")
    expect(after.commits).toHaveLength(0)
    expect(after.index).toEqual({})
  })

  it('target.md, A8, «самый опасный случай» (уточнение A12): лишний аргумент — файл, ИЗВЕСТНЫЙ git (застейджен), — git реально коммитит только его, и A11 стейджит закоммиченное содержимое', () => {
    // git commit -m Первый index.html — забытые кавычки вокруг сообщения, но index.html уже
    // добавлен (git add), то есть известен git — поэтому это не отказ: git честно коммитит
    // только его с обрезанным сообщением.
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m Первый index.html')
    expect(result?.ok).toBe(true)
    expect(result?.output).toMatch(/^\[master \(root-commit\) [0-9a-f]{7}\] Первый$/)
    expect(after.commits).toHaveLength(1)
    expect(after.commits[0]?.message).toBe('Первый')
    expect(after.commits[0]?.tree).toEqual({ 'index.html': '<h1>Мой сайт</h1>' })
    // target.md, A11: закоммиченное содержимое перечисленных путей застейджено — index совпадает
    // с тем, что реально попало в коммит (иначе следующий commit -a отправил бы файл "назад").
    expect(after.index).toEqual({ 'index.html': '<h1>Мой сайт</h1>' })
    expect(result?.explanation).toBe(ru.explain.commitAccidentalPathspec('Первый', ['index.html']))
  })

  it('target.md, A8: git commit -m "Правка" index.html — сообщение в кавычках, файл существует: git честно коммитит только его (проверено на git 2.43+)', () => {
    // Разбор здесь не сводится к "самому опасному случаю" (забытым кавычкам вокруг сообщения).
    // Здесь сообщение ЕСТЬ в кавычках, а index.html — существующий файл: это не
    // опечатка про кавычки, а законный git commit -m "..." <pathspec> — реальный git выполняет
    // его как частичный коммит, а не отклоняет и не коммитит весь индекс молча.
    let state = run(createSection(), 'git init', 'git add index.html')
    state = createFile(state, 'other.txt')
    state = run(state, 'git add other.txt') // ещё один staged файл — не должен попасть в этот коммит
    const { state: after, result } = runCommand(state, 'git commit -m "Правка" index.html')
    expect(result?.ok).toBe(true)
    expect(result?.output).toMatch(/^\[master \(root-commit\) [0-9a-f]{7}\] Правка$/)
    expect(after.commits).toHaveLength(1)
    expect(after.commits[0]?.message).toBe('Правка') // сообщение НЕ обрезано — оно было в кавычках целиком
    expect(after.commits[0]?.tree).toEqual({ 'index.html': '<h1>Мой сайт</h1>' }) // только index.html, other.txt не попал
    expect(after.index['other.txt']).toBeDefined() // other.txt остался staged, не тронут
    expect(result?.explanation).toBe(ru.explain.commitExplicitPathspec('Правка', ['index.html']))
  })

  it('target.md, A8: -a вместе с pathspec — отказ, как в настоящем git, а не молчаливый частичный коммит', () => {
    // Проверено на git 2.43+: git commit -a -m "x" <pathspec> завершается отказом ДО проверки
    // существования путей — "fatal: paths '<путь> ...' with -a does not make sense" (код 128).
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -a -m "x" index.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: paths 'index.html ...' with -a does not make sense")
    expect(result?.explanation).toBeNull()
  })

  it('target.md, A8: сообщение было в кавычках — лишний путь считается опечаткой, подсказки про кавычки НЕТ', () => {
    // git commit -m "текст" nonexistent-file — сообщение корректно взято в кавычки, значит дело не в забытых кавычках, а просто в опечатке
    // в имени файла (это законный синтаксис "git commit -m ... <pathspec>").
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -m "текст" nonexistent-file')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: pathspec 'nonexistent-file' did not match any file(s) known to git")
    expect(result?.explanation).toBeNull()
  })

  it('spec S1-67: git commit --all (без -m) — отказ "Aborting" (буквальный текст git, редактора в песочнице нет)', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { result } = runCommand(state, 'git commit --all')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe('Aborting commit due to empty commit message.')
    expect(result?.explanation).toBe(ru.explain.commitAborting)
  })

  it('spec S1-68: Ш1, только неотслеживаемый файл, commit -am "x" — отказ (не добавляет новые файлы)', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git commit -am "x"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toContain('nothing added to commit but untracked files present')
    expect(result?.explanation).toBe(
      'Коммит берёт только то, что лежит в индексе. Сначала добавь файл: git add index.html — и только потом git commit.',
    )
  })

  it('spec S1-69: -am "текст" и -a -m "текст" работают одинаково', () => {
    let base = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    base = { ...base, working: { ...base.working, 'index.html': base.working['index.html'] + ' + правка' } }
    const r1 = runCommand(base, 'git commit -am "текст"')
    const r2 = runCommand(base, 'git commit -a -m "текст"')
    expect(r1.result?.ok).toBe(true)
    expect(r2.result?.ok).toBe(true)
    expect(r1.state.commits[1]?.message).toBe('текст')
    expect(r2.state.commits[1]?.message).toBe('текст')
  })

  it('target.md, A6: -m"текст" — шелл склеивает в один аргумент -mтекст, git разбирает приклеенное значение', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m"Первый коммит"')
    expect(result?.ok).toBe(true)
    expect(after.commits[0]?.message).toBe('Первый коммит')
  })

  it('target.md, A6: -amПервый — приклеенное значение работает и вместе с -a', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { state: after, result } = runCommand(state, 'git commit -amВторой')
    expect(result?.ok).toBe(true)
    expect(after.commits[1]?.message).toBe('Второй')
  })

  it('target.md, A6: -ma — после "m" в кластере остаток всегда значение, даже похожее на другой флаг (проверено на git 2.43)', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -ma')
    expect(result?.ok).toBe(true)
    expect(after.commits[0]?.message).toBe('a')
  })

  it('target.md, A7 (заменяет S1-70): типографские кавычки — обычные символы, шелл их не снимает', () => {
    // Без пробела внутри — “текст” остаётся ОДНИМ словом целиком (кавычки никуда не делись,
    // это просто два символа “ и ” внутри слова) — коммит проходит, но сообщение содержит
    // литеральные кавычки, а не «текст» без них.
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -am “текст”')
    expect(result?.ok).toBe(true)
    expect(after.commits[0]?.message).toBe('“текст”')
  })

  it('target.md, A7: типографские кавычки с пробелом внутри — слово разваливается, как без кавычек вообще', () => {
    // “текст два” — пробел между "текст" и "два" НЕ защищён (это не настоящие кавычки),
    // поэтому шелл всё равно режет по пробелу: “текст (сообщение) и два” (лишний pathspec).
    // Типографские кавычки шелл кавычками не считает, поэтому здесь срабатывает подсказка A8
    // про забытые кавычки.
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, 'git commit -m “текст два”')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: pathspec 'два”' did not match any file(s) known to git")
    expect(result?.explanation).toBe(
      'Сообщение коммита нужно взять в кавычки: git commit -m "Первый коммит". Без кавычек строку на слова разбивает шелл ещё до того, как её увидит git, — git получает только первое слово как сообщение, а остальные слова достаются ему как имена файлов.',
    )
  })

  it('spec S1-71: лишние пробелы вокруг команды не мешают выполнению', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { result } = runCommand(state, '  git   status  ')
    expect(result?.ok).toBe(true)
  })

  it('spec S1-72: GIT status (заглавные) — регистр важен, отказ bash-not-found', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'GIT status')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(ru.errors.bashCommandNotFound('GIT'))
  })

  it('spec S1-73: пустая/пробельная строка — ничего не происходит, история не меняется', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, '   ')
    expect(result).toBeNull()
    expect(after).toBe(state)
    expect(after.history).toHaveLength(state.history.length)
  })

  it('target.md, A5: id коммита — хэш от содержимого (сообщение, файлы, родитель), не от счётчика', () => {
    // Одинаковое содержимое первого коммита (то же сообщение, тот же единственный файл,
    // родителя нет в обоих случаях) после "начать раздел заново" должно давать один и тот же id —
    // если бы id считался по счётчику коммитов, это совпадение было бы истинным ВСЕГДА, даже
    // при разном содержимом; обратный случай — в следующем тесте (target.md, A5).
    const first = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    const afterReset = run(resetSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    expect(afterReset.commits[0]?.id).toBe(first.commits[0]?.id)
    expect(afterReset.commits[0]?.id).toMatch(/^[0-9a-f]{7}$/)
  })

  it('target.md, A5: разное содержимое первого коммита даёт разный id', () => {
    const a = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    const b = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Другое сообщение"')
    expect(a.commits[0]?.id).not.toBe(b.commits[0]?.id)
  })

  it('target.md, A5: id зависит от родителя, а не только от сообщения и дерева (commitHash напрямую)', () => {
    const tree = { 'index.html': '<h1>Мой сайт</h1>' }
    const rootId = commitHash('x', tree, null, 0)
    const childId = commitHash('x', tree, rootId, 0)
    expect(rootId).not.toBe(childId)
    // Повторный вызов с теми же аргументами — тот же id (детерминированность, а не рандом/Date.now()).
    expect(commitHash('x', tree, null, 0)).toBe(rootId)
  })

  it('target.md, A5: id зависит и от «момента» коммита (clock), не только от содержимого — ' +
    'иначе два коммита с одинаковым содержимым, сделанные в разное время, склеились бы в один', () => {
    const tree = { 'index.html': '<h1>Мой сайт</h1>' }
    expect(commitHash('x', tree, null, 0)).not.toBe(commitHash('x', tree, null, 1))
  })

  it('target.md, часть III, правила 1–2: "--" отделяет опции от pathspec в git commit так же, как в git status', () => {
    // "--" — не опция, а разделитель: после него идут пути, как и в status.
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { state: after, result } = runCommand(state, 'git commit -m "Правка" -- index.html')
    expect(result?.ok).toBe(true)
    expect(after.commits).toHaveLength(2)
    expect(after.commits[1]?.message).toBe('Правка')
  })

  it('target.md, часть III: "--" защищает путь, начинающийся с "-", от разбора как флага', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, '-weird.txt')
    state = run(state, 'git add -A')
    const { result } = runCommand(state, 'git commit -m "x" -- -weird.txt')
    expect(result?.ok).toBe(true)
    expect(result?.output).not.toContain('unknown')
  })

  // Общий с разделом 2 механизм разбора сообщения commit (commitFlags.ts, buildCommitMessage):
  // несколько "-m" не перезаписывают друг друга, а склеиваются в абзацы через пустую строку.
  // Сверено напрямую на git 2.53.0, 24.09.2026 (временный каталог): `git commit -m x -m y` даёт
  // "[master (root-commit) xxx] x", `git log -1 --format=%B` — "x\n\ny".
  it('target.md, часть III, правила 1–2: несколько -m склеиваются абзацами через пустую строку, вывод показывает только первый абзац (как в разделе 2 — сверено на git 2.53.0)', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m Первый -m Второй')
    expect(result?.ok).toBe(true)
    expect(result?.output).toMatch(/^\[master \(root-commit\) [0-9a-f]{7}\] Первый$/)
    expect(after.commits[0]?.message).toBe('Первый\n\nВторой')
  })

  // Тот же общий механизм: cleanup=whitespace — дефолтный режим для -m без редактора, обрезает
  // только ХВОСТОВЫЕ пробелы/табы, ведущие не трогает (сверено напрямую, git 2.53.0, 24.09.2026).
  it('target.md, часть III, правила 1–2: git commit -m обрезает хвостовые пробелы сообщения (cleanup=whitespace, как в разделе 2 — сверено на git 2.53.0)', () => {
    const state = run(createSection(), 'git init', 'git add index.html')
    const { state: after, result } = runCommand(state, 'git commit -m "Первый  "')
    expect(result?.ok).toBe(true)
    expect(after.commits[0]?.message).toBe('Первый')
  })
})

describe('target.md, A11: git commit <pathspec> стейджит закоммиченное содержимое', () => {
  it('после commit -m "x" <pathspec> git status для этого пути — "working tree clean" (индекс == HEAD), а не MM', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' v2' } }
    state = run(state, 'git add index.html') // застейджена v2
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' v3' } }
    // git commit -m "x" index.html коммитит v3 (рабочее дерево), А11 требует застейджить v3.
    const { state: after } = runCommand(state, 'git commit -m "x" index.html')
    expect(after.index['index.html']).toBe(after.commits[after.commits.length - 1]?.tree['index.html'])
    const status = runCommand(after, 'git status -s').result
    expect(status?.output).toBe('') // ни staged, ни notStaged для index.html — не "MM"
  })

  it('несвязанный staged-файл не трогается коммитом по чужому pathspec', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = createFile(state, 'other.txt')
    state = run(state, 'git add other.txt')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' v2' } }
    const { state: after } = runCommand(state, 'git commit -m "x" index.html')
    expect(after.index['other.txt']).toBe('новый файл') // остался staged, коммит его не тронул
  })

  it('commit -m "x" <pathspec>, когда для указанного файла коммитить нечего (не менялся) — тот же вывод, что и обычный git status, без пустой строки в чистом репозитории (проверено на git 2.53.0)', () => {
    const state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    const { result } = runCommand(state, 'git commit -m "x" index.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe('On branch master\nnothing to commit, working tree clean')
  })
})

describe('target.md, часть III, правило 1: маска "*.html" — честный отказ шелла, не выдуманная ошибка git', () => {
  it('git add *.html — не "pathspec не найден", а честное "шелл это умеет, здесь нет"', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add *.html')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(
      '[тренажёр] шаблон «*.html» раскрыл бы шелл (bash), а не git — а этот шелл раскрывает только голую «*» целиком отдельным словом. Впиши имя файла целиком.',
    )
    expect(result?.output).not.toContain('did not match')
    expect(after.index).toEqual({})
  })
})

describe('target.md, часть III, правило 1 (пункт 1): pathspec-глоббинг — это git, не шелл', () => {
  it('закавыченная маска git add "*.html" — не отказ, а настоящий git-глоб: matcher находит все .html файлы', () => {
    // Шелл кавычки снимает, но НЕ раскрывает "*.html" (это не голая "*" — см. shell.ts) —
    // git получает буквальную строку "*.html" и раскрывает её сам (git-add(1), пример
    // "git add Documentation/\*.txt"; проверено напрямую на git 2.53.0).
    let state = run(createSection(), 'git init') // index.html уже в рабочем дереве
    state = createFile(state, 'about.html')
    state = createFile(state, 'notes.txt') // другое расширение — не должно попасть
    const { state: after, result } = runCommand(state, 'git add "*.html"')
    expect(result?.ok).toBe(true)
    expect(after.index['index.html']).toBeDefined()
    expect(after.index['about.html']).toBeDefined()
    expect(after.index['notes.txt']).toBeUndefined()
  })

  it('git-глоб "*" матчит и файлы, начинающиеся с точки — в отличие от "*" самого шелла (проверено на git 2.53: git add "*.html" матчит .hidden.html)', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, '.hidden.html')
    const { state: after, result } = runCommand(state, 'git add "*.html"')
    expect(result?.ok).toBe(true)
    expect(after.index['.hidden.html']).toBeDefined()
  })

  it('git add "*.md" без единого совпадения — честная git-ошибка pathspec, паттерн в сообщении как есть', () => {
    const state = run(createSection(), 'git init')
    const { result } = runCommand(state, 'git add "*.md"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("fatal: pathspec '*.md' did not match any files")
  })

  it('экранирование: git add "\\*.txt" матчит только файл, БУКВАЛЬНО названный "*.txt" — не любой .txt (проверено на git 2.53)', () => {
    let state = run(createSection(), 'git init')
    state = createFile(state, '*.txt')
    state = createFile(state, 'a.txt')
    const { state: after, result } = runCommand(state, 'git add "\\*.txt"')
    expect(result?.ok).toBe(true)
    expect(after.index['*.txt']).toBeDefined()
    expect(after.index['a.txt']).toBeUndefined()
  })

  it('символ "?" — ровно один символ (даже незакавыченный, шелл его не трогает — unsupportedGlob ставится только на "*")', () => {
    let state = run(createSection(), 'git init', 'git add index.html') // унести index.html с дороги
    state = createFile(state, 'a.txt')
    state = createFile(state, 'b.txt')
    state = createFile(state, 'ab.txt')
    const { state: after, result } = runCommand(state, 'git add ?.txt')
    expect(result?.ok).toBe(true)
    expect(after.index['a.txt']).toBeDefined()
    expect(after.index['b.txt']).toBeDefined()
    expect(after.index['ab.txt']).toBeUndefined()
  })

  it('класс символов "[ab].txt" — матчит только перечисленные буквы, не "ab.txt" (проверено на git 2.53)', () => {
    let state = run(createSection(), 'git init', 'git add index.html')
    state = createFile(state, 'a.txt')
    state = createFile(state, 'b.txt')
    state = createFile(state, 'c.txt')
    state = createFile(state, 'ab.txt')
    const { state: after, result } = runCommand(state, 'git add "[ab].txt"')
    expect(result?.ok).toBe(true)
    expect(after.index['a.txt']).toBeDefined()
    expect(after.index['b.txt']).toBeDefined()
    expect(after.index['c.txt']).toBeUndefined()
    expect(after.index['ab.txt']).toBeUndefined()
  })

  it('паттерн без метасимволов — вырожденный случай того же алгоритма: ведёт себя как точное имя', () => {
    const state = run(createSection(), 'git init')
    const { state: after, result } = runCommand(state, 'git add index.html')
    expect(result?.ok).toBe(true)
    expect(after.index).toEqual({ 'index.html': '<h1>Мой сайт</h1>' })
  })
})

describe('target.md, часть III, правило 1 (пункт 2): commit -a стейджит только уже отслеживаемые (в индексе) файлы, не по HEAD', () => {
  it('сценарий A1: коммит → удаление → git add (фиксирует удаление) → пересоздание под тем же именем → commit -am НЕ воскрешает старый файл', () => {
    // Проверено напрямую на git 2.53.0: после этого сценария `git commit -am "auto"` коммитит
    // только ранее застейдженное удаление ("1 file changed, 1 deletion(-)"), а пересозданный
    // файл остаётся "??" (untracked) — -a не подхватывает его, потому что в индексе его нет.
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = deleteFile(state, 'index.html')
    state = run(state, 'git add index.html') // фиксирует удаление — index.html выходит из индекса
    expect('index.html' in state.index).toBe(false)
    state = createFile(state, 'index.html') // тот же файл, новое содержимое, полностью неотслеживаемый

    const { state: after, result } = runCommand(state, 'git commit -am "auto"')
    expect(result?.ok).toBe(true)

    // Закоммичена только фиксация удаления — дерево последнего коммита БЕЗ index.html.
    const lastCommit = after.commits[after.commits.length - 1]
    expect('index.html' in lastCommit.tree).toBe(false)
    expect(after.index).toEqual({})

    // Пересозданный файл остался неотслеживаемым — commit -a его не подхватил и не закоммитил.
    const status = runCommand(after, 'git status -s').result
    expect(status?.output).toBe('?? index.html')
  })

  it('контраст: файл, который реально отслеживается (в индексе), -a стейджит и коммитит его', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "Первый"')
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { state: after, result } = runCommand(state, 'git commit -am "текст"')
    expect(result?.ok).toBe(true)
    expect(after.commits[1]?.tree['index.html']).toBe('<h1>Мой сайт</h1> + правка')
  })
})

describe('распространение pathspec-глоббинга (matchPathspec) на git commit <pathspec>', () => {
  it('git commit -m x "*.html" — глоб коммитит только файл, ИЗВЕСТНЫЙ git (в индексе/HEAD), файл того же расширения, который лишь лежит на диске и никогда не индексировался, — не трогает', () => {
    // Проверено напрямую на git 2.53.0, 20.09.2026: index.html отслеживается и изменён —
    // коммитится; other.html существует только на диске (никогда не был в индексе) — остаётся
    // untracked, второй коммит его не подхватывает, хотя маска "*.html" совпадает с обоими именами.
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = createFile(state, 'other.html') // никогда не индексировался — известен только рабочему дереву
    state = { ...state, working: { ...state.working, 'index.html': state.working['index.html'] + ' + правка' } }
    const { state: after, result } = runCommand(state, 'git commit -m "x" "*.html"')
    expect(result?.ok).toBe(true)
    expect(after.commits).toHaveLength(2)
    const lastCommit = after.commits[after.commits.length - 1]
    expect(lastCommit.tree['index.html']).toBe('<h1>Мой сайт</h1> + правка')
    expect('other.html' in lastCommit.tree).toBe(false) // untracked-файл не попал в коммит
    // A11: index.html застейджен закоммиченным содержимым, other.html остаётся untracked.
    const status = runCommand(after, 'git status -s').result
    expect(status?.output).toBe('?? other.html')
  })

  it('git commit -m x "*.md" — ни один известный git файл не совпал (совпадение есть только на диске) — честный отказ git, а не молчаливое "нечего коммитить"', () => {
    // Проверено напрямую на git 2.53.0: то же сообщение, что и для литерального несуществующего
    // пути — "did not match any file(s) known to git" — даже если файл с подходящим именем
    // физически лежит в рабочем дереве.
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = createFile(state, 'notes.md') // только на диске, никогда не индексировался
    const { state: after, result } = runCommand(state, 'git commit -m "x" "*.md"')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: pathspec '*.md' did not match any file(s) known to git")
    expect(after.commits).toHaveLength(1) // новый коммит не создан
  })

  it('git commit -m x "index.*" — глоб матчит застейдженный (в индексе, не в HEAD) файл — коммитится наравне с уже закоммиченными', () => {
    let state = run(createSection(), 'git init', 'git add index.html', 'git commit -m "root"')
    state = createFile(state, 'index.css')
    state = run(state, 'git add index.css') // в индексе, ещё не в HEAD
    const { state: after, result } = runCommand(state, 'git commit -m "x" "index.*"')
    expect(result?.ok).toBe(true)
    const lastCommit = after.commits[after.commits.length - 1]
    expect(lastCommit.tree['index.html']).toBeDefined()
    expect(lastCommit.tree['index.css']).toBeDefined()
  })
})
