# Ревью 1: движок раздела 2 тренажёра git

- Запуск: 23.09.2026 19:44 (МСК)
- Отчёт получен: 23.09.2026 20:02 (МСК)
- Сессия: `5343199f-69a3-42d2-a0da-557e74cb8622`
- Как названо в поручении: без номера

Ниже отчёт reviewer дословно.

---

## Оговорка о методе

Bash в этой сессии отключён («No such tool available: Bash. Bash is disabled for this session, in subagents as well as here»), поэтому запустить настоящий git во временном каталоге я не смог. Всё проверено по первоисточникам: исходники git (`master`), его собственный тест-сьют и документация git-scm. Где вывод зависит от версии/окружения, я это отмечаю.

Побочное следствие: многочисленные комментарии вида «сверено запуском git 2.53.0 во временном каталоге 23.09.2026» я подтвердить не мог, а два из них исходникам git прямо противоречат (находки 5 и 6). Такие комментарии опаснее отсутствия комментария: они снимают вопрос у следующего читателя.

---

# Учит неправде

### 1. Соседние (но не одинаковые) правки сливаются молча — настоящий git даёт конфликт
`app/src/trainers/git/engine/branchRepo.ts:157-159` (`hunksOverlap`), используется в `mergeFileContent` (там же, 200-218).

```ts
function hunksOverlap(h1: Hunk, h2: Hunk): boolean {
  return h1.bStart < h2.bEnd && h2.bStart < h1.bEnd
}
```

Это «строгое пересечение». У настоящего git правило другое: в `xdiff/xmerge.c` две правки считаются независимыми только если `xscr1->i1 + xscr1->chg1 < xscr2->i1` (и симметрично) — **строгое** `<`, то есть конец одной правки должен быть строго раньше начала другой. Между правками должна остаться хотя бы одна неизменённая строка; иначе git строит конфликтный регион и разрешает его, только если правки буквально идентичны (`xscr1->i1 != xscr2->i1 || xscr1->chg1 != xscr2->chg1 || xscr1->chg2 != xscr2->chg2 || xdl_merge_cmp_lines(...)` → конфликт).

Конкретные случаи, где движок выдаёт готовый результат, а git — конфликт:

- база `a\nb\nc`, ours `a\nX\nc`, theirs `a\nb\nY` → ханки базы `[1,2)` и `[2,3)`, соприкасаются. Движок: `1 < 3 && 2 < 2` → false → «не пересекаются» → чистый результат `a\nX\nY`. Git: `1+1 < 2` ложно → CONFLICT.
- **обе ветки дописали свою строку в конец файла** (база `a`, ours `a\nours`, theirs `a\ntheirs`): оба ханка — вставки `[1,1)`, `1 < 1` ложно → движок выдаёт `a\nours\ntheirs`. Git: `1+0 < 1` ложно → CONFLICT. Это самый частый учебный сценарий раздела про ветки (две ветки дописали по правилу в CSS) — он почти наверняка встретится в миссиях.
- обе ветки вставили разный текст в одно и то же место в середине файла — то же самое.

Чем грозит: игрок выучит, что «конфликт бывает, только если правки в одной и той же строке». В жизни он получит конфликт на соседних строках и не поймёт, почему. Хуже того, тренажёр не просто умалчивает — он **придумывает содержимое файла**, которого настоящий git никогда бы не создал, и записывает его в коммит слияния. Это ровно тот случай, от которого защищает честный отказ `mergeConflictOutOfScope`: отказ здесь не срабатывает, потому что `conflict` не выставлен.

Источники: [xdiff/xmerge.c](https://github.com/git/git/blob/master/xdiff/xmerge.c), [Adjacent lines conflicts (versionpress#719 — «This is correct Git behavior»)](https://github.com/versionpress/versionpress/issues/719).

### 2. Одинаковая вставка с обеих сторон дублируется в результате
`branchRepo.ts:200-222`. Дедупликация («одинаковая правка с обеих сторон — не конфликт») живёт **внутри** ветки `if (!hunksOverlap(...)) continue`, а для чистых вставок `bStart === bEnd`, и `hunksOverlap` для двух вставок в одной точке всегда false. Значит `sameRange && arraysEqual` до этого случая не доходит, и обе вставки применяются.

Трассировка: база `a\nb`, ours `a\nX\nb\nO`, theirs `a\nX\nb`.
ours-ханки: `{b:[1,1) → "X"}`, `{b:[2,2) → "O"}`; theirs-ханки: `{b:[1,1) → "X"}`. Пересечений нет → применяются все три → результат **`a\nX\nX\nb\nO`**.
Настоящий git: правки `X` совпадают по `i1/chg1/chg2` и содержимому → одна `X`, результат `a\nX\nb\nO`.

Чем грозит: тренажёр показывает удвоенную строку как «нормальный результат слияния». Игрок либо решит, что git так и работает, либо потеряет доверие к тренажёру. Тест `branchRepo.test.ts:83-90` проверяет только тривиальный случай `ours === theirs` (он отсекается ранним возвратом на строке 187), поэтому дефект тестами не ловится.

### 3. Слияние с непустым индексом: настоящий git отказывается, движок сливает
`branchCommands.ts:189-244` (весь путь трёхстороннего слияния) + `branchRepo.ts:328-344` (`checkSafety`). Движок блокирует только те файлы, чьё содержимое операция реально меняет. Настоящий git при **не-перемоточном** слиянии требует, чтобы индекс совпадал с HEAD целиком, даже по файлам, которых слияние не касается:

> To avoid recording unrelated changes in the merge commit, `git pull` and `git merge` will also abort if there are any changes registered in the index relative to the `HEAD` commit. (Special narrow exceptions to this rule may exist depending on which merge strategy is in use, but generally, the index must match `HEAD`.)
> — [git-merge(1), PRE-MERGE CHECKS](https://git-scm.com/docs/git-merge)

Это же зафиксировано в тест-сьюте git — файл так и называется: [`t/t6424-merge-unrelated-index-changes.sh`](https://github.com/git/git/blob/master/t/t6424-merge-unrelated-index-changes.sh). Там `touch random_file && git add random_file && git merge E^0` **проходит** для перемотки («ff update»), но `test_must_fail git merge -s recursive C^0` / `-s resolve` / октопус — для настоящего слияния, с диагностикой «changes to the following files would be overwritten». Текст (`builtin/merge.c`, тот же msgid) — вариант с двухпробельным отступом и перечислением через запятую, без «Please commit…»/«Aborting»:

```
error: Your local changes to the following files would be overwritten by merge:
  notes.txt
```

То есть различие поведения FF/не-FF, которое движок стирает, у git есть и оно содержательное: перемотка ничего не коммитит, а коммит слияния собирается так, чтобы в него не попало ничего постороннего. Сейчас игрок может сделать `git add` и спокойно слиться — и выучить, что индекс слиянию не мешает.

Попутно: в `handleMerge` вообще нет ветки, печатающей этот двухпробельный вариант сообщения, так что реализация не «упрощена», а отсутствует.

### 4. `git commit` без staged-правок сообщает «working tree clean», когда дерево не чистое
`branchCommands.ts:305-308`:

```ts
if (sameTree(head, state.index)) return fail(state, 'nothing to commit, working tree clean', null)
```

Настоящий git печатает в этой ситуации обычный статус. Если игрок отредактировал `style.css` и не сделал `git add`, git скажет:

```
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   style.css

no changes added to commit (use "git add" and/or "git commit -a")
```

Движок в том же случае утверждает, что рабочее дерево чистое. Это прямая ложь о состоянии репозитория игрока, и она бьёт ровно по главному уроку индекса («коммит берёт то, что в индексе, а не то, что на диске»).

Это ещё и регресс относительно раздела 1: `engine/commands.ts:477-491` в этом случае возвращает `formatStatusFriendly(state)`, а `states.test.ts:194` фиксирует `On branch master\nnothing to commit, working tree clean` — с первой строкой. В разделе 2 потеряна и строка `On branch <ветка>`, и различение «чисто / есть незастейдженное». Тест `branchCommands.test.ts:335-339` закрепляет усечённый вариант.

### 5. Порядок строк вывода `git checkout` перевёрнут
`branchCommands.ts:174-177`:

```ts
const header = wasCurrent ? `Already on '${name}'` : `Switched to branch '${name}'`
const output = [header, ...carried.map((c) => `${c.type}\t${c.file}`)].join('\n')
```

В `builtin/checkout.c` `show_local_changes()` (она и печатает `M\t<файл>` в формате `--name-status`) вызывается в конце `merge_working_tree()`, а `merge_working_tree()` в `switch_branches()` выполняется **до** `update_refs_for_switch()`, где печатаются `Switched to branch '%s'` / `Already on '%s'`. То есть в терминале порядок такой:

```
M	f1.txt
Switched to branch 'dev'
```

Подтверждение из тест-сьюта git, [`t/t7201-co.sh`](https://github.com/git/git/blob/master/t/t7201-co.sh), тест «checkout with unrelated dirty tree without -m»: `git checkout side >messages` (перехвачен только stdout) и ожидание — ровно `M\tsame`. Значит `M`-строки идут в stdout, а `Switched to branch` — в stderr (`fprintf(stderr, ...)`), и в интерактивном терминале (что и симулирует тренажёр) stdout строчно буферизован, так что `M` появляется первой.

Тест `branchCommands.test.ts:108` закрепляет неверный порядок: `"Switched to branch 'dev'\nM\tf1.txt"`.

Нюанс, который стоит знать: при перенаправлении в файл/пайп порядок может перевернуться из-за блочной буферизации stdout. Но тренажёр рисует терминал, значит правильный образец — терминальный.

### 6. `git checkout -b` с грязным деревом: отчёт `M\t<файл>` не печатается, а комментарий утверждает, что это проверено
`branchCommands.ts:143-146`:

```ts
// Дерево не меняется (новая ветка = текущий коммит) — checkout -b никогда не может затереть
// локальную правку и никогда не печатает построчный отчёт "M\t<файл>" (сверено на git 2.53.0:
// в отличие от обычного checkout той же ветки, -b этот отчёт не показывает вовсе).
```

В `builtin/checkout.c` для `-b` не существует отдельного пути: `switch_branches()` вызывает `merge_working_tree()` так же, как и для обычного переключения, а вызов в конце `merge_working_tree()` ограничен только тремя условиями:

```c
if (!opts->discard_changes && !opts->quiet && new_branch_info->commit)
	show_local_changes(&new_branch_info->commit->object, &opts->diff_options);
```

Ни `opts->new_branch`, ни равенство коммитов там не проверяются, а `show_local_changes()` диффит рабочее дерево против целевого коммита — при грязном файле выдаст `M\t<файл>`. Ожидаемый реальный вывод:

```
M	f.txt
Switched to a new branch 'feature'
```

Чем грозит: игрок выучит, что `checkout -b` «тихий», и не свяжет `M`-строки с «правки уехали со мной». Отдельно плохо, что ложный факт зафиксирован как проверенный — следующий, кто будет править этот код, поверит комментарию, а не git.

(Оговорка: без запуска git это вывод из исходников, а не из эксперимента. Проверить строчкой `git checkout -b tmp` в грязном репозитории — дело одной минуты.)

### 7. Сообщение коммита слияния без «into &lt;ветка&gt;»
`branchCommands.ts:231`: `const message = \`Merge branch '${name}'\``.

`fmt-merge-msg.c`, `fmt_merge_msg_title()`:

```c
if (!dest_suppressed(current_branch))
	strbuf_addf(out, " into %s", current_branch);
```

а список подавляемых имён по умолчанию — ровно `main` и `master` (`merge.suppressDest`). Значит на ветке `master`/`main` движок прав, а на любой другой git пишет `Merge branch 'feature' into develop`, тренажёр — `Merge branch 'feature'`. Сценарий достижим одной командой: `git checkout -b develop` → работа → `git checkout -b feature` → работа → `git checkout develop` → `git merge feature`. Сообщение хранится в коммите и, судя по `getAllCommits`, попадёт в граф на экране.

Чем грозит: мелко, но это ровно тот «дословный вывод git», который проект обещает не подделывать. И это неудобно объяснимое расхождение, когда игрок увидит настоящий лог.

### 8. Настоящие команды получают выдуманный отказ git вместо честного «вне области»
`branchCommands.ts:156-162` и `195`.

- `git checkout style.css` (файл существует в рабочем дереве) → `error: pathspec 'style.css' did not match any file(s) known to git`. Настоящий git этой ошибки не выдаст: pathspec совпал, и git восстановит файл из индекса. Тренажёр печатает **ложное утверждение от имени git** — именно то, что запрещено правилом 1. То же для `git checkout .`.
- `git merge <7-значный хэш>` → `merge: 1a2b3c4 - not something we can merge`. Настоящий git сливает коммит по хэшу штатно.
- `git checkout <укороченный префикс хэша>` (4-5 символов) → тот же pathspec-error, хотя git разрешает однозначные префиксы. Проверка на detached HEAD (`has(state.commits, name)`) работает только для полного 7-символьного id.

Контраст с остальным файлом резкий: `switch`, `restore`, detached-HEAD по полному хэшу и конфликт слияния обработаны честно (`[тренажёр] …`, тесты 265-321), а эти четыре случая — подделка. Чем грозит: игрок, который после раздела 1 привык к подсказке `use "git restore <file>"` и попробует старый эквивалент `git checkout <файл>`, получит уверенное вранье.

---

# Мешает работе

### 9. `git add <удалённый файл>` вместо постановки удаления даёт fatal
`branchCommands.ts:276-277`: файл ищется только в `state.working`. Если игрок удалит отслеживаемый файл, `git add f.txt` вернёт `fatal: pathspec 'f.txt' did not match any files`, тогда как настоящий git застейджит удаление (pathspec совпадает с путём в индексе). `git add .` (строки 265-273) удаления обрабатывает правильно, то есть поведение двух форм одной команды разъезжается. Насколько это достижимо, зависит от того, даст ли интегратор удалять файлы в разделе 2 — в разделе 1 такая кнопка есть (`fileOps`/`deleteFile`).

### 10. Буква типа в отчёте переноса неверна для удаления
`branchRepo.ts:376-379`: тип вычисляется как `inIndex && !inHead ? 'A' : !inIndex && inHead ? 'D' : 'M'`. Файл, который есть в HEAD и в индексе, но удалён из рабочего дерева, получит `M`, тогда как `run_diff_index` (без `--cached`) покажет `D`. Комментарий честно признаёт, что проверена только `M`, — но тогда лучше не печатать недостоверную букву, чем печатать.

### 11. `error: switch \`b' requires a value` без блока usage
`branchCommands.ts:136` и `294`. parse-options печатает эту строку и следом полный `usage: git checkout ...` (через `usage_with_options`, код выхода 129). Движок печатает только первую строку. Это тот же класс, что и честно обработанный `gitUsageNoArgs`, но здесь обрезка молчаливая: вывод выглядит полным выводом git, хотя таковым не является.

---

# Замечания

### 12. Отсутствие диффстата: на грани допустимого, но у перемотки съедает весь смысл
`handleMerge` печатает `Updating a..b\nFast-forward` и `Auto-merging f.txt\nMerge made by the 'ort' strategy.`; `finish()` в `builtin/merge.c` при `show_diffstat` (по умолчанию включён, `merge.stat=true`) добавляет к обоим:

```
 f.txt | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

Моя оценка: для коммита слияния это допустимое умолчание — раздел 1 так же опускает статистику после `git commit` (`repo.ts:456`), «Auto-merging» уже показывает затронутые файлы, и ничего ложного о ветвлении игрок отсюда не выучит. А вот у перемотки `Updating a..b\nFast-forward` — единственный вывод, и без диффстата игрок не видит ни одного признака, что файлы вообще поменялись; урок «перемотка двигает указатель и обновляет рабочее дерево» остаётся без доказательства на экране. Если что-то из этого добавлять, начинать надо с перемотки. (Проверить не смог, но по `merge.c` в выводе слияния возможны ещё строки вида `Removing <файл>` при удалениях — это стоит подтвердить запуском, прежде чем считать вывод полным.)

### 13. `mergeBase`: не «lowest» общий предок и одна база вместо нескольких
`branchRepo.ts:91-104`. BFS от `b` возвращает первого встреченного предка `a`, а BFS по рёбрам — не топологический порядок. Пример: `b = merge(x, old)`, где `old` — древний коммит, тоже предок `a`, а настоящая база `L` лежит в истории `x` на шаг глубже. Обход вернёт `old`, git — `L`. База старше нужной означает больше «чужих» изменений в трёхстороннем слиянии и, как следствие, другой результат (и, с учётом находки 1, скорее фальшивое бесконфликтное слияние, чем лишний конфликт). Плюс известный случай крест-накрест: у git в `ort` при нескольких базах они рекурсивно сливаются в виртуальную базу, здесь берётся одна. Комментарий про это есть, но описывает ограничение как «для несложных историй достаточно» — про неминимальность базы там не сказано.

### 14. Переименования читаются как конфликт удаление/правка
`mergeTrees` (`branchRepo.ts:258-284`) не знает о переименованиях. Если одна ветка переименовала файл (в модели это `delete` + `create`), а другая его правила, `ort` с включённым по умолчанию rename detection перенесёт правку в новое имя и сольёт чисто, а движок отправит путь в `conflicts` → игрок получит «конфликт, вне области». Тут хотя бы честный отказ, а не выдуманный результат, поэтому это замечание, а не дефект.

### 15. Текст про `git restore` обещает замену, которой в шаге A нет
`locales/ru.ts:318-319`: «git restore умеет то же, для чего здесь используются git checkout». `git restore` заменяет `git checkout -- <файл>`, а этой формы шаг A не реализует (см. находку 8). Фраза подталкивает игрока попробовать `git checkout <файл>` — и получить ложную ошибку.

### 16. Выдуманный путь `/site` внутри дословного сообщения git
`branchCommands.ts:69`: `error: cannot delete branch 'master' used by worktree at '/site'`. Само сообщение и префикс `error:` подтверждаются исходником и тестом [`t/t3200-branch.sh`](https://github.com/git/git/blob/master/t/t3200-branch.sh) (`^error: cannot delete branch 'my7' used by worktree at '.*'$`). Упрощение осознанное и описано в комментарии, но формально это подделанный фрагмент вывода git. Если раздел 2 где-то показывает игроку «путь к проекту», лучше взять его оттуда, чтобы строки не разъехались.

### 17. Дублирование кода между разделами
`hashString` (`branchRepo.ts:22-29`) и `gitNotACommand` (`branchScope.ts:33-35`) — копии из `repo.ts`/`commands.ts`. Причины в комментариях изложены и разумны (разные сигнатуры, запрет трогать раздел 1), но это две пары строк, которые со временем разойдутся. Как минимум `gitNotACommand` просится в экспорт из `scope.ts` при первой же плановой правке раздела 1.

### 18. Мелочи по коду
- `mergeFileContent` при конфликте возвращает `{ content: ours, autoMerged: true, conflict: true }` — осмысленного содержимого там нет, и вызывающий, забывший проверить `conflict`, тихо получит «наш» вариант. Безопаснее `content: ''` или отдельный тип результата.
- `handleAdd` (`branchCommands.ts:265`): `args.includes('.')` — при `git add . lost.txt` второй аргумент молча игнорируется.
- `handleCheckout`: при `wasCurrent` всё равно вызывается `applyTreeChange` — безвредно, но лишний проход и лишний повод думать, что состояние меняется.
- `formatBranchList` сортирует именами через `Array.sort()` — для ASCII-имён совпадает с побайтовым порядком refname у git; для не-ASCII имён веток разойдётся. В шаге A имена задаёт миссия, так что это скорее заметка на будущее.

---

# Что проверено и подтвердилось

- `Deleted branch <имя> (was <хэш>).`, `error: branch '<имя>' not found`, `error: the branch '<имя>' is not fully merged` + два `hint:`-а, включая современную формулировку `"git config set advice.forceDeleteBranch false"` (именно с `set` — `advice.c`, `turn_off_instructions`), и `error: cannot delete branch … used by worktree at …` с префиксом `error:` — совпадают дословно, порядок строк верный (`builtin/branch.c`, `t/t3200-branch.sh`).
- «Слито относительно чего» у `-d`: `branch_merged()` сравнивает с upstream ветки, а при его отсутствии — с HEAD. Удалённых в тренажёре нет, значит правило движка (`isAncestor(tip, currentTip)`) верное, включая отказ для ветки, слитой в master, когда стоишь на третьей ветке.
- `-D` удаляет неслитую ветку, текущую не удаляет ни `-d`, ни `-D` — верно.
- Текст блокировок `checkout`/`merge`: `error: Your local changes to the following files would be overwritten by checkout:` → `\t<файл>` → `Please commit your changes or stash them before you switch branches.` → `Aborting`, и варианты для `merge` / untracked (`Please move or remove them before you …`) — совпадают с `setup_unpack_trees_porcelain()`/`display_error_msgs()` в `unpack-trees.c`, включая табуляцию и `Aborting` последней строкой.
- Правило переноса незакоммиченных правок при `checkout` совпадает с документацией: «The checkout will fail if there are uncommitted changes to any files where &lt;branch&gt; and your current commit have different content. Uncommitted changes will otherwise be kept» ([git-checkout(1)](https://git-scm.com/docs/git-checkout)). Одна оговорка к комментарию на `branchRepo.ts:321-326`: в `twoway_merge()` есть случай 18/19 — если правка **застейджена** и по содержимому совпадает с целевой веткой, git делает `keep_entry` и переключение разрешает. Для незастейдженной правки утверждение комментария верно. Разница узкая, поэтому в находки не вынес.
- Различение перемотки и коммита слияния, «Already up to date.», `Updating <7>..<7>`, `Fast-forward`, `Auto-merging <файл>` перед `Merge made by the 'ort' strategy.`, суффикс `Merge with strategy ort failed.` после блокировки, `merge: <имя> - not something we can merge`, `fatal: No remote for the current branch.` на `git merge` без аргументов — всё соответствует `builtin/merge.c`/`merge-ort.c`/`help.c`.
- `'ort'` действительно помечен `NO_TRIVIAL` (`all_strategy[]` в `builtin/merge.c`), поэтому ветка «Trying really trivial in-index merge… / Nope. / In-index merge» в современном git не выполняется — движок правильно делает, что её не воспроизводит.
- Порядок «Auto-merging» строк и их условие (обе стороны правили файл → `handle_content_merge()` в `merge-ort.c`) — верны; при правке только с одной стороны git этой строки не печатает, движок тоже.
- Правила слияния деревьев для add/add с одинаковым содержимым, delete/delete, delete+modify (конфликт), modify только с одной стороны — совпадают со стандартным поведением.
- `fatal: a branch named '<имя>' already exists`, `fatal: branch name required`, `error: pathspec '<имя>' did not match any file(s) known to git` (для реально несуществующего имени), `git: '<имя>' is not a git command. See 'git --help'.`, `Nothing specified, nothing added.` + hint с кодом 0, `Aborting commit due to empty commit message.` — соответствуют git.
- Сценарии, объявленные вне области (`git switch`, `git restore`, checkout по полному хэшу, конфликт слияния), отвечают честным `[тренажёр] …` без поддельного `fatal:`/`error:` и без имитации результата; состояние при этом не меняется (тесты `branchCommands.test.ts:265-321` это фиксируют). Единственная брешь в этом правиле — находка 8.
