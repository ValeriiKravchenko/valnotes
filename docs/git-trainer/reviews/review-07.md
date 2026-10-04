# Ревью 7: движок раздела 2 тренажёра git

- Запуск: 25.09.2026 07:32 (МСК)
- Отчёт получен: 25.09.2026 07:43 (МСК)
- Сессия: `a346dc03-a1b7-4c02-a5df-c2afc746a30c`
- Как названо в поручении: девятый круг

Ниже отчёт reviewer дословно.

---

Девятый круг ревью, коммит cd3c32f. Я проверял его прогонами настоящего git во временных каталогах (mktemp -d). `git --version` у меня выдаёт **git version 2.53.0**, та же версия, что у владельца.

Итог: одна регрессия в разборе `git commit` учит неправде, её надо чинить в первую очередь. Остальные находки — отказы, которые называют причину неверно, и неточный текст ошибки в одном узком случае.

## Группа 1. Ветки, checkout, merge, commit

### 1.1 Дефект, учит неправде: реальная буква перед `m` в кластере молча выбрасывается
**Где:** `app/src/trainers/git/engine/commitFlags.ts:107-129`. Код общий для раздела 2 (`branchCommands.ts`, `handleCommit`) и раздела 1 (`commands.ts`, `parseCommitArgs`).

**В чём дело:** новая переменная `firstOtherRealFlag` проверяется только после цикла (стр. 129). Ветка `c === 'm'` (стр. 114-120) возвращает `{kind:'flag'}` раньше, поэтому ранее встреченная реальная, но не реализованная буква теряется. До этого коммита любая «прочая» буква сразу давала отказ, так что это регрессия. Тестов на `-qm`, `-sam`, `-iam` нет, есть только `-qx`.

Настоящий git:
```
$ git commit -qam msg        -> (ничего не печатает), rc=0
$ git commit -sam msg        -> [master 078b214] msg ...; git log -1 --format=%B:
                                msg
                                
                                Signed-off-by: t <a@b>
$ git commit -iam msg        -> fatal: options '-i/--include' and '-a/--all' cannot be used together   rc=128
$ GIT_EDITOR=false git commit -eam msg -> error: there was a problem with the editor 'false' ... rc=1
```
Тренажёр во всех четырёх случаях делает обычный коммит и печатает `[master xxxxxxx] msg`. При `-s` нет трейлера Signed-off-by, при `-q` вывод не подавлен, `-i` вместе с `-a` проходит без ошибки.

Для сравнения, `git commit -a -q -m msg` (отдельными словами) тренажёр честно отклоняет по `-q`. Получается, что `-qam` и `-a -q -m` ведут себя по-разному, хотя для git это одно и то же.

**Чем грозит:** игрок узнаёт, что `-s`, `-q` и `-i` в связке с `-m` ни на что не влияют и что `-i` с `-a` совместимы. Это неправда. Задеты оба раздела.

### 1.2 Дефект текста: при нескольких конфликтующих ветках назван не тот ref
**Где:** `branchCommands.ts:120`, `existing.find(...)` по `Object.keys(state.branches)`, то есть в порядке создания.

Git называет первую ветку по алфавиту. Я создал ветки в порядке feature/b, feature/a, feature/c/d:
```
$ git branch feature
fatal: cannot lock ref 'refs/heads/feature': 'refs/heads/feature/a' exists; cannot create 'refs/heads/feature'
```
Тренажёр в этой ситуации назовёт `feature/b`. Сама формулировка совпадает дословно (я сверил `git branch` и `checkout -b` в обе стороны и `feature/x/y`), расходится только имя ветки. Тяжесть низкая.

Для справки, отвлекаться на это не нужно: после `git pack-refs --all` git отвечает без префикса «cannot lock ref» (`fatal: 'refs/heads/feature/a' exists; cannot create 'refs/heads/feature'`). Модель loose-ссылок это приемлемо упрощает.

### 1.3 Замечание: комментарий утверждает, что путь не может содержать `~` или `^`
**Где:** `branchCommands.ts:325` («никогда не путь/ветку»), `looksLikeRevisionExpression` на стр. 332.
```
$ echo t > 'notes~'; git add 'notes~'; git commit -qm n; echo changed > 'notes~'
$ git checkout 'notes~'
Updated 1 path from the index
$ git checkout 'x^'          (файл x^)
Updated 1 path from the index
```
В репозитории может лежать файл с `~` или `^` в имени, например бэкап редактора `file~`. Тренажёр на такое ответит «выражение ревизии». Сейчас в разделе 2 не видно, как игроку создать такой файл, поэтому в поведении это пока не проявляется. Утверждение в комментарии тем не менее ложное и сработает при первом же засеве таких файлов.

### Что в группе 1 я проверил и нашёл верным
- `checkout -- feature` при существующей ветке feature и `checkout -- <хэш>` дают `error: pathspec '...' did not match any file(s) known to git`.
- `checkout -- a.txt` и `checkout -- .` молчат. `checkout a.txt` и `checkout .` печатают `Updated N path(s) from the index`, в том числе `Updated 0 paths` на чистом дереве.
- Если есть и ветка, и файл с одним именем, `checkout <имя>` переключает ветку.
- `checkout -b f1` на грязном дереве печатает только заголовок. `-bf2`, `-b f3 --` и `-bf4 --` печатают `M a.txt / D b.txt / A n.txt`, затем заголовок. Буквы M/D верны и для случая «застейджено, потом откачено в рабочем дереве».
- `git branch @` создаёт ветку. `git branch HEAD` даёт ошибку ref-format. `git branch 'a*b'` даёт ошибку ref-format дословно.
- `commit -a -m x` при индексе, равном HEAD после `-a`, печатает `On branch master\nnothing to commit, working tree clean`, rc=1. Настоящий индекс после этого остаётся прежним (`MM a.txt`).
- `commit -a p1`, `-a -m x a.txt b.txt`, `-a -- a.txt`, `-a -- -m` печатают `fatal: paths '<первый> ...' with -a does not make sense`, текст совпадает.
- Подсказка `(use "git restore --staged <file>..." to unstage)` в статусе совпадает с git.

## Группа 2. Разбор флагов и форм записи

### 2.1 Дефект, учит неправде: `-h` внутри кластера получает «unknown switch `h'»
**Где:** `branchScope.ts:762` ловит только токен целиком (`-h`/`--help`). Разбор кластера на стр. 793-797 возвращает `unknown switch` для буквы `h`, которой нет в `short`. Это касается branch, checkout, merge и add. Commit обрабатывает `h` верно через `commitShortFlagIsReal`.

Настоящий git при `h` в любом месте кластера печатает справку:
```
$ git branch -qh      -> usage: git branch [<options>] [-r | -a] [--merged] [--no-merged] ... rc=129
$ git branch -hq      -> то же, rc=129
$ git merge -qh / git checkout -qh / git add -vh -> usage: ..., rc=129
```
Тренажёр выдаёт `error: unknown switch `h'`, то есть сообщает, что у git нет ключа `-h`.

### 2.2 Дефект: сокращения двойного отрицания git принимает, а тренажёр объявляет неизвестными
**Где:** `branchScope.ts`, константа `DOUBLE_NEGATION_LITERALS` (около стр. 703), проверка по точному совпадению на стр. 773. Комментарий на стр. 698 («сверено, что это НЕ участвует в поиске абревиатур») верен только для `--no-n` и `--no-no`.
```
$ git merge --no-n f          -> error: unknown option `no-n'
$ git merge --no-no f         -> error: unknown option `no-no'
$ git merge --no-no-v f       -> Already up to date.
$ git merge --no-no-ver f     -> Already up to date.
$ git commit --no-no-v -m x   -> On branch master / nothing to commit, working tree clean
$ git commit --no-no-p -m x   -> то же (сокращение --no-no-post-rewrite)
$ git merge --verif=x         -> error: ambiguous option: verif=x (could be --verify-signatures or --no-no-verify)
```
Тренажёр на `--no-no-v`, `--no-no-ver` и `--no-no-p` отвечает `error: unknown option `no-no-v'` и т.п., хотя у git такая опция есть. Случай узкий, но это ровно тот третий ответ «такого нет», которого правило области запрещает там, где опция существует.

### 2.3 Замечание: опции после `git branch -d` берутся как имена веток
**Где:** `branchCommands.ts:250`. Сам разбор старый, но в этом коммите сюда добавили обработку `--`.
```
$ git branch -d -x      -> error: unknown switch `x'   rc=129
$ git branch -d -h      -> usage: git branch ...        rc=129
$ git branch -d -- -h   -> error: branch '-h' not found rc=1
```
Тренажёр на `-d -x` и `-d -h` отвечает `error: branch '-x' not found` и `error: branch '-h' not found`. Верна только форма с `--`.

### Что в группе 2 я проверил и нашёл верным
- **`longNoValue`.** Перебрал все длинные опции из `long` пяти команд с `=zzq`. Множество «takes no value» совпадает с git полностью, без лишних и без пропущенных. Имена в тексте ошибки тоже совпадают, включая `no-no-verify` у `merge --verify=x` и `commit --verify=x`, а также `no-no-post-rewrite`.
- **Сокращения с `=значением`** дают полное имя в тексте: `--qui=x` → `quiet`, `--no-qui=x` → `no-quiet`, `--post-rew=x` → `no-no-post-rewrite`, `--ff-o=x` → `ff-only`.
- **Сокращения в целом.** Перебрал все префиксы длиной от 3 букв после `--` по всем пяти командам, 1820 штук. Классификация ambiguous / unknown / resolved совпадает с git во всех случаях, кроме отрицаний из пункта 2.2.
- `--end-of-options=x` даёт `unknown option `end-of-options=x'`, совпадает. `--end-of` и `--hel` git не сокращает, у тренажёра тоже.
- `checkout -b -h` даёт ошибку ref-format, совпадает.

Файлы с находками:
- `app/src/trainers/git/engine/commitFlags.ts`
- `app/src/trainers/git/engine/branchScope.ts`
- `app/src/trainers/git/engine/branchCommands.ts`
