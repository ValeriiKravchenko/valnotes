# Ревью 5: движок раздела 2 тренажёра git

- Запуск: 24.09.2026 13:12 (МСК)
- Отчёт получен: 24.09.2026 13:20 (МСК)
- Сессия: `2f70e54d-be20-4eea-9201-d549383141ba`
- Как названо в поручении: шестой круг

Ниже отчёт reviewer дословно.

---

Шестой круг ревью, раздел 2, шаг A: branch*.ts и optionAbbrev.ts

`git --version` выдаёт `git version 2.53.0`. Bash был доступен. Все прогоны шли только в каталогах из `mktemp -d` (/tmp/tmp.Mpbc5PuMoy, /tmp/tmp.6MhZqsCexT и др.), в репозитории я ничего не менял. target.md и spec.md не открывал.

Итог: 5 находок из разряда «учит неправде», 1 расхождение в тексте ошибки и 1 замечание к комментарию. Все 5 исправлений пятого круга я перепроверил на настоящем git, они верны.

Ниже `branchCommands.ts` и `branchScope.ts` лежат в app/src/trainers/git/engine/.

---

## A. Дефекты, которые учат неправде (по убыванию)

### A1. Разделитель `--` превращается в выдуманную ошибку git
Где: `branchScope.ts:278-291`. Для токена `--` переменная `bare` равна `'--'`, её нет в `long`, условие `bare.length > 2` ложно, и возвращается `unknown` с текстом `` error: unknown option `' ``. Через этот путь идут все пять команд: checkout (`branchCommands.ts:263-268`), add (`:458-464`, здесь `--` находится поиском `args.find`), branch (`:136-142`), merge (`:327-331`), commit (`:551-558`). Такого текста git не печатает никогда.

Настоящий git:
```
$ echo b >> f.txt; git checkout -- f.txt 2>&1 | cat; echo rc=$?
rc=0                      (молча, файл восстановлен)
$ git add -- f.txt        -> rc=0
$ git branch -- y         -> rc=0, ветка y создана
$ git merge -- x          -> Already up to date.  rc=0
```
Последствия: `git checkout -- <файл>` — самая известная форма отката правки, её годами подсказывал сам `git status`. Тренажёр отвечает на неё ошибкой «такой опции нет», то есть учит, что `--` у git не существует. В тестах случаи с `--` не нашлись.

### A2. Не хватает скрытых опций, `git commit --allow-empty` объявлен несуществующим
Где: `branchScope.ts:189-233` (COMMIT_OPTIONS). Комментарий `:48-54` утверждает, что списки «взяты из -h целиком». Но `-h` не показывает скрытые опции, а по полному списку (`git <cmd> --git-completion-helper-all`) не хватает:
- у commit: `--allow-empty`, `--allow-empty-message` и их `--no-` формы;
- у branch: `--ignore-case`, `--with`, `--without`, `--set-upstream`;
- у add: `--warn-embedded-repo`.

Настоящий git:
```
$ git commit --allow-empty -m empty
[master 28c022a] empty                         rc=0
$ git commit --al
error: ambiguous option: al (could be --allow-empty or --allow-empty-message)   rc=129
$ git commit --n
error: ambiguous option: n (could be --no-allow-empty or --no-allow-empty-message)
```
Что выдаёт движок:
- `git commit --allow-empty -m x` даёт `` error: unknown option `allow-empty' ``: кандидатов с таким префиксом нет, срабатывает `branchScope.ts:291`.
- `git commit --al` однозначно раскрывается в `--all` и получает отказ «git commit --all — настоящая возможность git». Здесь движок ошибается уже в самой однозначности, а не только в паре кандидатов, так что упрощение A13 этот случай не покрывает.

Последствия: широко известная и документированная опция `--allow-empty` подаётся как выдуманная.

### A3. Короткие опции со значением разбираются как булевы флаги, склеенное значение даёт ложное «unknown switch»
Где: `branchScope.ts:293-297` проверяет каждую букву кластера по множеству `short` и не знает, что после `b`/`m`/`F`/`C`/`c`/`t`/`u`/`s`/`X`/`S` остаток токена — это значение. Особые случаи есть только для `-b` отдельным словом (`branchCommands.ts:237`) и для `-mXXX` в начале токена у commit (`:545`).

Настоящий git:
```
$ git checkout -bfeature        -> Switched to a new branch 'feature'
$ git checkout -bz              -> Switched to a new branch 'z'
$ git commit -am"fix bug"       -> [master 8bfa33d] fix bug    rc=0
$ git merge -mmsg master        -> Updating ...  Fast-forward (no commit created; -m option ignored)
$ git branch -ufoo              -> fatal: the requested upstream branch 'foo' does not exist
```
Что выдаёт движок: `git checkout -bfeature` даёт `` error: unknown switch `e' ``, `-bz` даёт `` unknown switch `z' ``. `git commit -am"fix bug"` превращается в токен `-amfix bug` и получает `` unknown switch `f' ``. `git merge -mmsg x` даёт `` unknown switch `g' ``.

Последствия: форма `-am"сообщение"` встречается на практике. Тренажёр говорит, что git такой ключ не знает, хотя git его принимает.

### A4. Недопустимые имена веток создаются
Где: `branchCommands.ts:71-87`, вызовы на `:168` и `:247`. Все правила, которые проверяет движок, я перепроверил, они совпадают с git: `a~b`, `a:b`, `a//b`, `a.lock`, `a/`, `/a`, `a.`, `.a`, `a..b`, `a b`, `HEAD` git отвергает; `feature/x`, `@`, `head`, `a@b` принимает. Но остальные правила движок пропускает, и ветка **создаётся**:
```
$ git branch ""          -> fatal: '' is not a valid branch name   (+2 hint), rc=128
$ git checkout -b ""     -> то же
$ git branch 'a^b'  / 'a?b' / 'a[b' / 'a\b' / 'a/.b' / 'a.lock/b' / 'a/b.lock'
                         -> fatal: '<имя>' is not a valid branch name ... rc=128
$ git branch -           -> fatal: '-' is not a valid branch name ... rc=128
```
Что выдаёт движок:
- `git branch ""` создаёт ветку с пустым именем: токенизатор выдаёт пустой токен `''`, а `isInvalidBranchName('')` возвращает false. `git checkout -b ""` создаёт такую ветку и переключается на неё.
- `a^b`, `a?b`, `a[b`, `a/.b`, `a.lock/b` тоже создаются успешно. `*` сюда не попадает: его раньше перехватывает шелл через `unsupportedGlob`.
- `git branch -` классификатор помечает как `real`, потому что список букв пуст. В ответ идёт отказ «git branch - — настоящая возможность git» (`:157`), хотя у git это ошибка имени ветки.

Оговорка: в комментарии эти правила названы невоспроизводимыми. Но движок при этом не отказывает честно, а **выполняет** команду. Игрок усвоит, что такие имена допустимы.

### A5. Опции после имени ветки и флаг после `-d`
Где: `branchCommands.ts:159-162` и `:150-155`.

Настоящий git переставляет аргументы, поэтому опции можно писать и после имён:
```
$ git branch x -d            -> Deleted branch x (was 079dcbf).
$ git branch -d --bogus      -> error: unknown option `bogus'   rc=129
$ git branch -d -x w         -> error: unknown switch `x'       rc=129
```
Что выдаёт движок:
- `git branch x -d` даёт отказ с текстом «git branch <имя> <начальная точка> — настоящая возможность», то есть называет `-d` начальной точкой.
- `git branch -d --bogus` даёт `error: branch '--bogus' not found`: флаг принят за имя ветки.
- `git branch -d -x w` называется «удалением нескольких веток».

Серьёзность низкая, но все три ответа описывают разбор аргументов неверно.

## B. Расхождение в тексте ошибки

### B1. Значение после `=` пропадает из текста ошибки
Где: `branchScope.ts:291` (`bare.slice(2)`) и `optionAbbrev.ts:46` (`split('=')[0]`).
```
$ git branch --bogus=1   -> error: unknown option `bogus=1'
$ git commit --bogus=x   -> error: unknown option `bogus=x'
$ git branch --c=1       -> error: ambiguous option: c=1 (could be --create-reflog or --column)
```
Движок печатает `` unknown option `bogus' `` и `ambiguous option: c (...)`. Функция `ambiguousOptionOutput` общая с разделом 1, поэтому то же расхождение есть и там.

## C. Замечание: комментарий неверно описывает git

`optionAbbrev.ts:29-35` утверждает, что git «останавливается, как только находит второй совпадающий», и что порядок кандидатов «не выводится из --help». Оба утверждения неверны. `register_abbrev` в parse-options.c (https://raw.githubusercontent.com/git/git/master/parse-options.c) при каждом новом совпадении сдвигает `abbrev` в `ambiguous`. Поэтому в сообщение попадают **последние два** совпадения в порядке объявления опций, а этот порядок виден в `-h` (скрытые опции идут в конце таблицы). Проверка:
```
$ git branch --c   -> error: ambiguous option: c (could be --create-reflog or --column)
$ git branch -h | grep -n -- '--\(\[no-\]\)\?c'
18: --[no-]color   20: --contains   32: --copy   36: --create-reflog   42: --column
```
Если бы git останавливался на втором совпадении, он назвал бы `--color` и `--contains`. Игрок этот комментарий не видит, но он учит неправде следующего разработчика и закрывает дорогу к точному воспроизведению.

---

## Что проверено и совпадает с git

- **Сокращения.** `git branch --del`, `--d` и `--de` без имени дают `fatal: branch name required`; `--dele x` даёт `error: branch 'x' not found`; `--del y` на неслитой ветке выдаёт тот же текст с подсказкой про `-D`, что и `-d`. `git checkout --b` даёт `` unknown option `b' ``. Пары кандидатов совпали у `git add --i` (случайно); у `branch --c` и `merge --s` не совпали, это оговорённое упрощение A13. `git add --a` git принимает (rc=0), движок честно отвечает «вне области».
- **Порядок проверок в commit** совпадает с git:
  - чистое дерево и `-m ""` или `-m "   "`: выводится `On branch master` / `nothing to commit, working tree clean`;
  - только неотслеживаемые файлы и `-m ""`: полный статус с `nothing added to commit but untracked files present...` и пустой строкой перед ней;
  - застейдженные изменения и `-m ""`, `-m "   "` или `-m " " -m "  "`: `Aborting commit due to empty commit message.`;
  - `-m` без значения, в том числе `-m a -m`: `` error: switch `m' requires a value `` без блока usage;
  - `-m -x`: `-x` принимается как сообщение;
  - `-m "  lead" -m "" -m "second  "`: сообщение `  lead\n\nsecond`, строка итога `[master c08392d]   lead`, ведущие пробелы сохраняются;
  - `-m "<TAB>tab"`: ведущий таб сохраняется.
- **Коммит по сокращению.** `git commit --mess "..."` настоящий git выполняет; движок честно отвечает «вне области», неправды здесь нет.
- **Два общих предка.** На истории «крест-накрест» `git merge-base --all` печатает 2 коммита, и `git merge p` сливает сам (`Merge made by the 'ort' strategy.`). Определение «лучших» общих предков в `mergeBase` совпадает с git, текст отказа `multipleMergeBasesOutOfScope` честный.
- **Удаление веток.** `git merge` без аргументов даёт `fatal: No remote for the current branch.`. `branch -d master` на текущей ветке даёт `used by worktree at '<путь>'`: путь в движке заменён на `/site`, упрощение задокументировано. Сверены тексты `not fully merged` с двумя hint, `Deleted branch y (was 1c1c791).`, `error: branch 'nope' not found`.
- **checkout -b.** `checkout -b master` даёт `fatal: a branch named 'master' already exists`; `checkout -b HEAD` даёт ошибку имени ветки с двумя hint.
- **Раздел 1.** Перенос `abbreviatedOptionCandidates` и `ambiguousOptionOutput` в `optionAbbrev.ts` сохраняет поведение: фильтр и объединение списков те же (`git diff` по `scope.ts`/`commands.ts`), регрессий не вижу.

Источники: прогоны git 2.53.0 во временных каталогах; `git <cmd> --git-completion-helper-all`; parse-options.c (https://raw.githubusercontent.com/git/git/master/parse-options.c).
