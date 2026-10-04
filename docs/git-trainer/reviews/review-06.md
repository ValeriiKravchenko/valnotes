# Ревью 6: движок раздела 2 тренажёра git

- Запуск: 24.09.2026 19:20 (МСК)
- Отчёт получен: 24.09.2026 19:28 (МСК)
- Сессия: `42468e99-1c76-499b-bbfe-b9bbc2282873`
- Как названо в поручении: восьмой круг

Ниже отчёт reviewer дословно.

---

git version 2.53.0

# Ревью движка раздела 2 git-тренажёра, круг 8

**Как проверял.** Настоящий git запускал в отдельных `mktemp -d`. Тренажёр прогонял через `runBranchingCommand` в копии `app/`, которая лежала в `/tmp/tmp.SiO5dhW3WK` (node_modules подключены симлинком). Обе стороны выполняли один и тот же сценарий. Начальное состояние одинаковое: `master`, один коммит с `a.txt` = "base". Хэши коммитов по понятным причинам не совпадают, остальное сравнивал дословно. В репозитории ничего не менял и запускал только читающие команды.

## Группа 1. Ветки, checkout, merge, commit

**1.1. `git checkout -- <ветка>` переключает ветку. Git в этом случае ищет файл. Дефект, учит неправде.**
Место: `branchCommands.ts:348-357` — после `--` вызывается `checkoutByName(state, rest[0])`, а он сначала ищет ветку.
```
real:    $ git branch feature ; git checkout -- feature
         error: pathspec 'feature' did not match any file(s) known to git   [rc=1]
trainer: $ git checkout -- feature
         [ok=true] Switched to branch 'feature'        (head=feature)
```
Смысл `--` как раз в том, чтобы убрать эту неоднозначность: после него идут только пути. Тренажёр учит обратному. С хэшем та же причина: `git checkout -- <хэш>` даёт отказ «detached HEAD вне области», хотя git отвечает pathspec-ошибкой.

**1.2. `git checkout -- <файл>` в git ничего не печатает. Тренажёр печатает «Updated N paths from the index». Дефект: выдуманный вывод.**
Место: `branchCommands.ts:356` → `checkoutByName`, строка 318. Строка печатается всегда, есть `--` или нет.
```
real:    $ echo y > a.txt; git checkout -- a.txt      → (пусто), файл восстановлен
         $ git checkout a.txt                          → Updated 1 path from the index
trainer: $ git checkout -- m.txt                       → [ok=true] Updated 0 paths from the index
```
Git печатает счётчик только в форме без `--`: `count_checkout_paths` выключается при явном `--`. Проверено прогоном.

**1.3. `git checkout -b<имя>` (склеенная форма) на грязном дереве: git печатает перенесённые файлы, тренажёр — нет. Дефект.**
Место: `branchCommands.ts:379-382` → `createAndSwitchBranch`, строки 289-296. Комментарий утверждает: «Прогон подтверждает то же самое и для глюетой формы». Это неверно.
```
real:    !write a.txt dirty
         $ git checkout -bfeat
         M	a.txt
         Switched to a new branch 'feat'
trainer: [ok=true] Switched to a new branch 'feat'
```
Проверка в git 2.53.0 срабатывает только на буквальное `argc == 3 && argv[1] == "-b"`. У `-bfeat` argv[1] другой, поэтому печать перенесённых файлов остаётся. То же видно на `git checkout -b x --`: git печатает `M a.txt / A n.txt / Switched…`, тренажёр отказывает по области (подробнее в 2.6).

**1.4. `git commit -a -m …`, когда `-a` делает индекс равным HEAD: тренажёр печатает статус до `-a`. Дефект.**
Место: `branchCommands.ts:691-692`, `formatBranchingStatus(state)`. Комментарий на строках 688-690 прямо говорит «по ИСХОДНОМУ состоянию».
```
сценарий: !write a.txt changed ; git add a.txt ; !write a.txt base ; git commit -a -m x
real:    On branch master
         nothing to commit, working tree clean          [rc=1]
trainer: On branch master
         Changes to be committed:
         	modified:   a.txt

         Changes not staged for commit:
           (use "git add <file>..." to update what will be committed)
           (use "git restore <file>..." to discard changes in working directory)
         	modified:   a.txt
```
Git считает статус по индексу, который уже прошёл через `-a`. Состояние после отказа совпадает с git: индекс в обоих случаях остаётся «changed», MM. Расходится только вывод.

Побочно: в блоке «Changes to be committed» у `formatBranchingStatus` нет строки `(use "git restore --staged <file>..." to unstage)`, которая у git есть. Сейчас этот блок в выводе встречается только из-за описанной ошибки.

**1.5. Тренажёр создаёт ветки `feature` и `feature/x` одновременно. Git так не умеет. Дефект, учит неправде.**
Место: `handleBranchPositional` (`branchCommands.ts:157-160`) и `createAndSwitchBranch` (282-288). Конфликт каталог/файл в ссылках нигде не проверяется.
```
real:    $ git branch feature
         $ git branch feature/x
         fatal: cannot lock ref 'refs/heads/feature/x': 'refs/heads/feature' exists; cannot create 'refs/heads/feature/x'   [rc=128]
         $ git checkout -b feature/y  → то же fatal
         $ git branch a/b ; git branch a
         fatal: cannot lock ref 'refs/heads/a': 'refs/heads/a/b' exists; cannot create 'refs/heads/a'
trainer: все четыре команды ok=true; `git branch` показывает a, a/b, feature, feature/x, feature/y
```
На практике это частая ловушка: ветка `feature` плюс `feature/login`.

**1.6. `HEAD` и выражения ревизий: тренажёр выдаёт выдуманные ошибки git.**
Места: `checkoutByName` (`branchCommands.ts:301-320`), `handleMerge` (423-434). Комментарий на строках 431-432 называет текст «настоящим выводом git». Для таких имён это не так.
```
real:    $ git checkout HEAD        → (пусто) rc=0
         $ git merge HEAD           → Already up to date.
         $ git checkout master~0    → Note: switching to 'master~0'. … HEAD is now at …
trainer: $ git checkout HEAD        → error: pathspec 'HEAD' did not match any file(s) known to git
         $ git merge HEAD           → merge: HEAD - not something we can merge
         $ git checkout master~0    → error: pathspec 'master~0' did not match any file(s) known to git
```
Честный отказ по области здесь уместен, а утверждать, что git не знает `HEAD`, — нет.

**1.7. Имя ветки со `*` тренажёр принимает, git его отвергает.**
Место: `isInvalidBranchName` (`branchCommands.ts:75-98`), проверки `*` нет.
```
real:    $ git branch 'a*b'
         fatal: 'a*b' is not a valid branch name
         hint: See 'git help check-ref-format'
         hint: Disable this message with "git config set advice.refSyntax false"   [rc=128]
trainer: [ok=true] (ветка создана)
```
Остальные 40 проверенных имён совпали, список ниже.

## Группа 2. Разбор флагов и форм записи

**2.1. `--опция=значение` у опции без значения: git отказывает, тренажёр выполняет.**
Место: `classifySection2Option` (`branchScope.ts:446-447`) отбрасывает всё после `=` и возвращает `real`. Дальше `handleBranch` (`branchCommands.ts:200-209`) считает это за `--delete`.
```
real:    $ git branch --del=x feat      → error: option `delete' takes no value  [rc=129]
         $ git branch --delete= feat    → error: option `delete' takes no value
         $ git commit --all=1 -m x      → error: option `all' takes no value
         $ git merge --no-verify=x      → error: option `no-verify' takes no value
trainer: $ git branch --del=x feat      → [ok=true] Deleted branch feat (was ca403b1).
         $ git commit --all=1 -m x      → [тренажёр] git commit --all — настоящая возможность git…
         $ git merge --no-verify=x      → [тренажёр] git merge --no-verify — настоящая возможность git…
```
Первый случай — ветка удаляется, хотя git команду отверг. Это самое опасное в группе 2.

**2.2. `-h`, `--help`, `--end-of-options` тренажёр называет несуществующими.**
Место: `classifySection2Option` (`branchScope.ts:445-466`). `h` нет в `short`, а `help` и `end-of-options` нет в `long`: completion-helper их не выдаёт, но parse-options понимает.
```
real:    $ git branch -h     → usage: git branch [<options>] …  [rc=129]
         $ git commit -ah    → usage: git commit …
         $ git checkout --help → открывает справку, rc=0
         $ git branch --end-of-options x → ветка x создана, rc=0
trainer: error: unknown switch `h' / error: unknown option `help' / error: unknown option `end-of-options'
```
Тот, кто учится, наберёт `-h` одним из первых и узнает, что такого ключа нет.

**2.3. Пара кандидатов в «ambiguous option» не совпадает с git для префиксов с `no-` и для `--verify`/`--post-rewrite`.**
Место: `branchScope.ts:449-455`. Утверждения о точном совпадении — там же на строках 436-438 и в `optionAbbrev.ts:179-185`. Причина: `--verify` и `--post-rewrite` в выводе completion-helper — это отрицания опций `no-verify` и `no-post-rewrite`, а не самостоятельные длинные имена. Кроме того, parse-options разбирает `--no-…` особым путём.
```
команда                   real (git 2.53.0)                                      trainer
git merge --no-           (could be --no-verify or --no-verify)                  --no-overwrite-ignore or --no-signoff
git merge --no            (could be --no-signoff or --no-verify)                 --no-overwrite-ignore or --no-signoff
git merge --no-ver        (could be --no-verbose or --no-verify)                 --no-verify-signatures or --no-verbose
git merge --ver           (could be --verbose or --no-no-verify)                 --verbose or --verify
git commit --no-ver       (could be --no-verbose or --no-verify)                 --no-verify or --no-verbose
git commit --p            (could be --pathspec-from-file or --pathspec-file-nul) --pathspec-file-nul or --post-rewrite
git commit --no-          (… --no-allow-empty-message or --no-allow-empty-message) --no-allow-empty or --no-allow-empty-message
git checkout --no-        (… --no-pathspec-file-nul or --no-pathspec-file-nul)   --no-pathspec-from-file or --no-pathspec-file-nul
git add --no-             (то же, что у checkout)                                --no-pathspec-from-file or --no-pathspec-file-nul
git branch --no-          (could be --no-format or --no-format)                  --no-recurse-submodules or --no-format
```
Смежное: `git commit --no-no-verify` и `git merge --no-no-verify` git принимает (для commit ответ «nothing to commit», для merge «No remote…»). Тренажёр отвечает `error: unknown option 'no-no-verify'`. Совпали: `merge --s`, `merge --no-s`, `checkout --o`, `checkout --no-p`, `add --i`, `add --no-i`, `commit --no-a`, `commit --no-p`, `commit --re`, `commit --a`, `branch --no-c`, `--no-col`, `--co`, `--c=1`, `--no`.

**2.4. В кластере коротких флагов commit тренажёр останавливается на первой «реальной, но не реализованной» букве. Git идёт дальше.**
Место: `commitFlags.ts:275`. Комментарий на строках 248-251 («тот же результат») неверен.
```
real:    $ git commit -qx -m a    → error: unknown switch `x'  [rc=129]
         $ git commit -m a -qx    → error: unknown switch `x'
trainer: [тренажёр] git commit -q — настоящая возможность git, но этот шаг тренажёра её не разбирает…
```
Git эту команду отвергает, а тренажёр объявляет её настоящей возможностью.

**2.5. `git checkout -tq`: тренажёр отказывает по области, git ругается на значение `q`.**
```
real:    error: option `--track' expects "direct" or "inherit"   [rc=129]
trainer: [тренажёр] git checkout -t — настоящая возможность git…
```
Это замечание: `-t` действительно существует.

**2.6. Честные отказы, которые неверно называют, что именно не разбирается.** Выдуманного вывода git здесь нет.
- `git checkout -b x --`: тренажёр называет `--` «начальной точкой», `branchCommands.ts:283-285`. Git создаёт ветку, см. 1.3.
- `git branch -d -- feat`: тренажёр говорит про «несколько веток за раз», `branchCommands.ts:203-207`. У git это удаление одной ветки.
- `git commit -a -- -m`: тренажёр отвечает «git commit -m — … не разбирает. Здесь поддерживается: git commit -m "..."», `branchCommands.ts:635`. Отказ противоречит сам себе. Git здесь отвечает `fatal: paths '-m ...' with -a does not make sense`.
- `git branch feat -d` и `git branch -d feat -x` — упрощение из `branchCommands.ts:163-174`, оно названо явно. Но `git branch feat -d` тренажёр описывает как «<имя> <начальная точка>», хотя git ветку удаляет.

**Вне предмета ревью, для сведения.** В общем `shell.ts` строка `git branch 'a'\''b'` разбирается как `a\b`, bash даёт `a'b`. Git создаёт ветку `a'b`, тренажёр отвечает `fatal: 'a\b' is not a valid branch name`.

## Проверил, совпало с git 2.53.0
- `git branch`: список, сортировка, `*`. Создание ветки. Ошибка «already exists» у `branch` и у `checkout -b`.
- `git branch -d`: удаление слитой ветки, отказ «not fully merged» с двумя hint, «branch 'x' not found». `-D` у неслитой ветки. Запрет удалить текущую ветку и для `-d`, и для `-D` (путь заменён на `/site`, это оговорено).
- `git branch --d x` удаляет, как в git.
- `checkout <ветка>`, «Already on», перенос `M`, `A`, `D` перед заголовком. Блокировка modified. Индекс, совпадающий с целью, при чистом и грязном рабочем дереве. Удалённый файл при одинаковом и при разном содержимом в целевой ветке.
- `checkout -b`: без изменений в дереве и на грязном дереве в двухсловной форме (без строк `M`). `-b` без значения. `-b -`. `-bq-`. `-b=feat` даёт ветку `=feat`. `checkout <файл>` и `checkout .` без `--`, «Updated 0/1 path(s)». `checkout <нет такого>`. `checkout -- -`.
- `merge`: fast-forward (`Updating a..b` / `Fast-forward`, diffstat опущен по оговорке). Коммит слияния, сообщение с `into dev` и без `into` для master и main. Auto-merging, когда правки в файле разнесены. Конфликт при соседних строках. Сообщение «Already up to date.» (включая слияние с самой собой). Блокировка untracked при fast-forward. Грязный индекс при настоящем слиянии (формат с двумя пробелами). Грязное рабочее дерево при настоящем слиянии (плюс «Merge with strategy ort failed.»). `merge` без аргументов. `merge nope`. `merge -- feat`. `--bogus` и `-x` (usage-блок опущен). `--abort` как отказ по области.
- `commit -m`, `-am`, `-ma` (сообщение «a»), `-am=x`, `-am` без значения, `-m ""`, пробелы в начале темы и несколько `-m`. Формы `-a -m x --` и `-m x --`. Статус «nothing added… untracked» и «Changes not staged».
- `commit -a`: неотслеживаемый файл в коммит не попадает. Удаление попадает. Застейдженное удаление с последующим пересозданием файла оставляет его `??`.
- Длинные опции всех пяти команд побайтно совпадают с `--git-completion-helper-all`, порядок тот же. Короткие буквы совпадают с `-h`.
- Имена веток, 40 штук: отвергаются `a..b`, `.a`, `a.`, `a/.b`, `a.lock`, `a.lock/b`, `a//b`, `/a`, `a/`, `a@{b`, `~`, `^`, `:`, `?`, `[`, `\`, `HEAD`, `@{-1}`, `.`, `a/./b`, `a/b/`, `a/b.`, `a/.lock`, `x.lock/`, пробел, `-`. Принимаются `head`, `a/-b`, `refs/heads/x`, `a@b`, `a/@`, `@/a`, `x/HEAD`, `a.lock.b`, `feature/x`, `@`, `a{b`, `a}b`, `a!b`, `a"b`.
- `git checkout -` и `git merge -` дают отказ по области; возможность у git есть.
