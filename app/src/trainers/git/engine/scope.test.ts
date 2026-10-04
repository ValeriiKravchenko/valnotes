import { describe, expect, it } from 'vitest'
import { createSection, runCommand } from './index'
import { ru } from '../locales/ru'
import { isSectionCommand, REAL_GIT_COMMANDS, SECTION_SCOPE } from './scope'

// Не пункты spec.md — эти тесты не проверяют поведение git (оно не реализовано для этих
// команд), а только то, что вне границ раздела 1 движок не бросает исключение и явно,
// не молча, говорит "не реализовано".
describe('границы раздела 1: команды вне init/status/add/commit', () => {
  it('известная git-подкоманда вне реализованного набора — явный отказ "не реализована", не throw', () => {
    const state = runCommand(createSection(), 'git init').state
    for (const cmd of ['git log', 'git branch', 'git checkout master', 'git diff', 'git rm index.html']) {
      expect(() => runCommand(state, cmd), cmd).not.toThrow()
      const { result } = runCommand(state, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).toContain('не реализована в этой части тренажёра')
    }
  })

  it('target.md, A9: полностью неизвестная git-подкоманда — "is not a git command", проверяется ДО репозитория', () => {
    const withoutRepo = createSection()
    expect(() => runCommand(withoutRepo, 'git foo')).not.toThrow()
    const beforeInit = runCommand(withoutRepo, 'git foo').result
    expect(beforeInit?.ok).toBe(false)
    expect(beforeInit?.output).toBe("git: 'foo' is not a git command. See 'git --help'.")

    const withRepo = runCommand(withoutRepo, 'git init').state
    const afterInit = runCommand(withRepo, 'git foo').result
    expect(afterInit?.output).toBe(beforeInit?.output) // репозиторий на этот отказ не влияет
  })
})

describe('target.md, A10: неизвестная команда — три разных случая, а не два', () => {
  const state = runCommand(createSection(), 'git init').state

  it('случай 1: команда реализована в тренажёре — выполняется как обычно (не "не реализована" и не "is not a git command")', () => {
    const { result } = runCommand(state, 'git status')
    expect(result?.ok).toBe(true)
    expect(result?.output).not.toContain('не реализована')
    expect(result?.output).not.toContain('is not a git command')
  })

  it('случай 2: команда настоящая (porcelain), но раздел 1 её не реализует — честно "git это умеет, тренажёр пока нет"', () => {
    const { result } = runCommand(state, 'git rebase master')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe(ru.errors.commandOutOfScope('rebase'))
    // target.md, часть III, правило 2: реплика тренажёра промаркирована, не подделывает git.
    expect(result?.output).toContain('[тренажёр]')
    // не должно путаться с "команды не существует" — rebase существует у настоящего git
    expect(result?.output).not.toContain('is not a git command')
  })

  it('случай 2: команда настоящая (plumbing), но раздел 1 её не реализует — та же честная формулировка, не "не git-команда"', () => {
    for (const cmd of ['git cat-file -p HEAD', 'git rev-parse HEAD', 'git hash-object index.html', 'git update-index --add index.html']) {
      const { result } = runCommand(state, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).toContain('не реализована в этой части тренажёра')
      expect(result?.output, cmd).not.toContain('is not a git command')
    }
  })

  it('случай 3: команды с таким именем у git вообще нет — "is not a git command", это не "не реализована"', () => {
    const { result } = runCommand(state, 'git frobnicate')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("git: 'frobnicate' is not a git command. See 'git --help'.")
    expect(result?.output).not.toContain('не реализована')
  })
})

describe('target.md, часть III, правило 1 — commands.ts сверяется с данными scope.ts, а не со своим списком', () => {
  it('SECTION_SCOPE.commands — ровно то, что реально выполняется (случай 1)', () => {
    for (const cmd of SECTION_SCOPE.commands) {
      expect(isSectionCommand(cmd), cmd).toBe(true)
    }
  })

  it('всё, что в REAL_GIT_COMMANDS, но не в SECTION_SCOPE.commands, — случай 2 (honest commandOutOfScope), не throw и не "is not a git command"', () => {
    const state = runCommand(createSection(), 'git init').state
    const sample = ['rebase', 'log', 'branch', 'diff', 'clone', 'help', 'config', 'cat-file', 'rev-parse']
    for (const cmd of sample) {
      expect(REAL_GIT_COMMANDS.has(cmd), cmd).toBe(true)
      expect(isSectionCommand(cmd), cmd).toBe(false)
      const { result } = runCommand(state, `git ${cmd}`)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).toBe(ru.errors.commandOutOfScope(cmd))
    }
  })

  it('правило 1, случай 2 для команд применяется НЕЗАВИСИМО от репозитория: clone/help/config получают отказ по области, а не "not a git repository"', () => {
    const noRepo = createSection()
    for (const cmd of ['clone', 'help', 'config']) {
      const { result } = runCommand(noRepo, `git ${cmd}`)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).not.toContain('not a git repository')
      expect(result?.output, cmd).toBe(ru.errors.commandOutOfScope(cmd))
    }
  })
})

describe('target.md, часть III, правило 1 (пункт 3): опции самого git ДО подкоманды — честный отказ, не "is not a git command"', () => {
  it('git --help / -h / --version / -C / -c — реальные глобальные опции git (git(1) SYNOPSIS), второй ответ, а не выдуманная "не git-команда"', () => {
    const noRepo = createSection()
    for (const cmd of ['git --help', 'git -h', 'git --version', 'git -C .', 'git -c user.name=x']) {
      const { result } = runCommand(noRepo, cmd)
      expect(result?.ok, cmd).toBe(false)
      expect(result?.output, cmd).not.toContain('is not a git command')
      expect(result?.output, cmd).toContain('[тренажёр]')
    }
  })

  it('"--version" и "--help" — обе глобальные опции git, отказ по области одинаковый; "--help" не "is not a git command"', () => {
    const a = runCommand(createSection(), 'git --version').result
    const b = runCommand(createSection(), 'git --help').result
    expect(a?.output).toContain('[тренажёр]')
    expect(b?.output).toContain('[тренажёр]')
    expect(b?.output).not.toContain('is not a git command')
  })

  it('глобальная опция классифицируется ДО репозитория, независимо от Ш0/Ш1+', () => {
    const withRepo = runCommand(createSection(), 'git init').state
    const before = runCommand(createSection(), 'git -h').result
    const after = runCommand(withRepo, 'git -h').result
    expect(before?.output).toBe(after?.output)
  })
})

describe('аббревиатуры длинных опций', () => {
  it('однозначное сокращение работает как полная опция — "--a" у git add резолвится в "--all" (проверено: git 2.53.0, unambiguous)', () => {
    const state = runCommand(createSection(), 'git init').state
    const { state: after, result } = runCommand(state, 'git add --a')
    expect(result?.ok).toBe(true)
    // Ведёт себя РОВНО как "git add --all" — застейджило единственный файл рабочего дерева.
    expect(after.index).toEqual({ 'index.html': '<h1>Мой сайт</h1>' })
  })

  it('однозначное сокращение реальной (но не реализованной здесь) опции — честный отказ с КАНОНИЧЕСКИМ именем, не с введённым сокращением', () => {
    const state = runCommand(createSection(), 'git init').state
    const { result } = runCommand(state, 'git commit --mess "текст"')
    expect(result?.ok).toBe(false)
    // "--mess" — однозначное сокращение "--message" (проверено: git 2.53.0, `git commit --mess`
    // работает как `git commit --message`) — но раздел 1 реализует только короткую форму "-m",
    // поэтому это честный отказ (случай 2), а название опции в тексте — каноническое "--message",
    // а не введённое сокращение (текст явно называет полную опцию, которую сокращение разрешило).
    expect(result?.output).toBe(
      '[тренажёр] git commit --message — настоящая опция git, но раздел 1 её не разбирает. Здесь поддерживаются: git commit -m "..." <файл>, -m, -a, --all, --.',
    )
  })

  it('неоднозначное сокращение — та же ошибка, что и настоящий git: "error: ambiguous option: … (could be … or …)"', () => {
    const state = runCommand(createSection(), 'git init').state
    const { result } = runCommand(state, 'git status --s')
    expect(result?.ok).toBe(false)
    // Проверено напрямую (git 2.53.0, 20.09.2026): `git status --s` →
    // "error: ambiguous option: s (could be --short or --show-stash)".
    expect(result?.output).toBe('error: ambiguous option: s (could be --short or --show-stash)')
  })

  it('неоднозначное сокращение у commit ("--a") — тоже "ambiguous", а не придуманное "unknown option"', () => {
    const initialized = runCommand(createSection(), 'git init').state
    const state = runCommand(initialized, 'git add index.html').state
    const { result } = runCommand(state, 'git commit --a')
    expect(result?.ok).toBe(false)
    expect(result?.output).toMatch(/^error: ambiguous option: a \(could be .+ or .+\)$/)
    expect(result?.output).not.toContain('unknown')
  })

  it('однозначное сокращение "--short" ("--shor") распознаётся и как выбор короткого формата вывода, не только классифицируется', () => {
    const initialized = runCommand(createSection(), 'git init').state
    const state = runCommand(initialized, 'git add index.html').state
    const short = runCommand(state, 'git status --short').result
    const abbrev = runCommand(state, 'git status --shor').result
    expect(abbrev?.ok).toBe(true)
    expect(abbrev?.output).toBe(short?.output)
  })

  it('короткие опции ("-x") не сокращаются — неизвестная короткая опция даёт "unknown switch"', () => {
    const state = runCommand(createSection(), 'git init').state
    const { result } = runCommand(state, 'git status -x')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: unknown switch `x'")
  })

  // Текст с "=" (расхождение B1, общее для обоих разделов — см. ambiguousOptionOutput,
  // optionAbbrev.ts): настоящий git не отрезает значение после "=" ни у неизвестной опции,
  // ни у неоднозначного сокращения (сверено на git 2.53.0, 24.09.2026).
  it('неизвестная опция со значением через "=" — "=значение" остаётся в тексте ошибки, не обрезается', () => {
    const state = runCommand(createSection(), 'git init').state
    const { result } = runCommand(state, 'git add --bogus=1')
    expect(result?.ok).toBe(false)
    expect(result?.output).toBe("error: unknown option `bogus=1'")
  })

  it('неоднозначное сокращение со значением через "=" — "=значение" остаётся в тексте ошибки', () => {
    const initialized = runCommand(createSection(), 'git init').state
    const state = runCommand(initialized, 'git add index.html').state
    const { result } = runCommand(state, 'git commit --a=1')
    expect(result?.ok).toBe(false)
    // Форма сообщения сверена дословно (git 2.53.0): "ambiguous option: a=1 (could be … or …)" —
    // сама пара кандидатов здесь не проверяется (A13, см. ambiguousOptionOutput).
    expect(result?.output).toMatch(/^error: ambiguous option: a=1 \(could be .+ or .+\)$/)
  })
})
