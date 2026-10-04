exec(open("p3.py").read().split("with sync_playwright")[0])
U9="file:///mnt/user-data/outputs/git-trenazher_15.html"; U10="file:///mnt/user-data/outputs/git-trenazher_15.html"
def c4(pg, t): cmd(pg, "ch4", t); return H(pg, "ch4")
R = "STATE.chapters.ch4.repo"
def cid(pg, msg_part): return pg.evaluate(f"Object.values({R}.commits).find(c=>c.message.includes({json.dumps(msg_part)})).id.slice(0,7)")
def work(pg, f): return pg.evaluate(f"{R}.working[{json.dumps(f)}]")
def setf(pg, f, t): pg.evaluate(f"{R}.working[{json.dumps(f)}]={json.dumps(t)}")
def st(pg): return pg.evaluate(f"(()=>{{const s={R}.status(); return JSON.stringify([s.staged.map(x=>x.file),s.notStaged.map(x=>x.file),s.untracked])}})()")
def flags(pg): return pg.eval_on_selector_all(".mission", "els => els.map(e => e.classList.contains('done'))")
def ghosts(pg): return pg.locator('.graph-wrap circle[stroke-dasharray="3 2"]').count()
def new(br, url): pg = fresh(br, url); nav(pg, 3); return pg
def later(pg):  # коммит D: style.css изменён после Comic Sans
    setf(pg, "style.css", "body { color: red; }"); c4(pg, "git add style.css"); c4(pg, 'git commit -m "красный текст"')
with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"]); errs = []
    print("=== ДО (_9) ===")
    pg = new(br, U9); later(pg); c4(pg, f"git revert {cid(pg,'Comic')}"); print("  revert Comic Sans после правки того же файла:", H(pg,'ch4')['ok'], "| style.css:", repr(work(pg,'style.css')))
    pg = new(br, U9); c4(pg, "git revert"); print("  `git revert` без аргумента:", H(pg,'ch4')['ok'], H(pg,'ch4')['out'][:50])
    pg = new(br, U9); c4(pg, "git reset --hard HEAD~1"); print("  граф после reset --hard: бледных коммитов =", ghosts(pg), "| 💡:", H(pg,'ch4')['explain'][:70])
    pg = new(br, U9); c4(pg, "git add index.html"); pg.evaluate(f"{R}.working['style.css']='X'"); c4(pg, "git reset style.css"); print("  `git reset style.css` 💡:", H(pg,'ch4')['explain'][:60])
    print("\n=== ПОСЛЕ (_10) ===")
    # 1. обычный revert
    pg = new(br, U10); errs.append(pg.errs)
    idB = cid(pg, "Comic"); h = c4(pg, f"git revert {idB}")
    check("1 revert Comic Sans на чистом дереве: новый коммит, шрифт убран, index.html цел", h["ok"] and 'Revert "сменить шрифт на Comic Sans"' in h["out"] and "Comic" not in work(pg, "style.css") and work(pg, "index.html") == "<h1>Мой сайт</h1>", h["out"])
    check("1 …миссия 2 засчитана, пояснение", flags(pg)[1] and "нейтрализован" in h["explain"], str(flags(pg)))
    h = c4(pg, f"git revert {idB}"); check("1 повторный revert того же коммита → «нечего отменять»", (not h["ok"]) and "нечего отменять" in h["out"], h["out"].splitlines()[0])
    # 2. конфликт
    pg = new(br, U10); errs.append(pg.errs); later(pg); idB = cid(pg, "Comic"); h = c4(pg, f"git revert {idB}")
    check("2 revert при более поздней правке того же файла → CONFLICT, правка НЕ затёрта (в файле метки)", (not h["ok"]) and "CONFLICT" in h["out"] and "<<<<<<< HEAD" in work(pg, "style.css") and "color: red" in work(pg, "style.css"), h["out"].splitlines()[1] if len(h["out"].splitlines())>1 else h["out"])
    check("2 …красная рамка «Конфликт при revert», пояснение", "Конфликт при revert" in pg.inner_text(".conflict-box") and "менялся ещё раз" in h["explain"])
    pg.locator("[data-resolve=theirs]").click(); pg.wait_for_timeout(60)
    check("2 …«theirs» = версия до Comic Sans (чёрный текст, без red)", "Comic" not in work(pg, "style.css") and "red" not in work(pg, "style.css") and "color: black" in work(pg, "style.css"), work(pg, "style.css"))
    h = c4(pg, "git commit"); c = pg.evaluate(f"{R}.log()[0]")
    check("2 …commit без -m берёт сообщение Revert, один родитель", h["ok"] and c["message"].startswith('Revert "сменить шрифт') and len(c["parents"]) == 1, h["out"])
    pg = new(br, U10); errs.append(pg.errs); later(pg); c4(pg, f"git revert {cid(pg,'Comic')}"); before = "color: red"
    h = c4(pg, "git revert --abort"); check("2 revert --abort: возврат, метки убраны, правка на месте", h["ok"] and work(pg, "style.css") == "body { color: red; }" and st(pg) == "[[],[],[]]" and "Отмена revert" in h["explain"], st(pg))
    c4(pg, f"git revert {cid(pg,'Comic')}"); h = c4(pg, "git merge master"); check("2 во время конфликта revert другой merge блокируется", not h["ok"])
    h = c4(pg, f"git revert {cid(pg,'структуру')}"); check("2 …и повторный revert блокируется с подсказкой про --abort", (not h["ok"]) and "revert --abort" in h["out"])
    c4(pg, "git reset --hard"); check("2 reset --hard снимает и этот конфликт", pg.evaluate(f"!{R}.conflict"))
    # 3. без аргумента
    pg = new(br, U10); errs.append(pg.errs); n0 = pg.evaluate(f"{R}.log().length"); h = c4(pg, "git revert")
    check("3 git revert без аргумента → usage, ничего не откатывает", (not h["ok"]) and "usage" in h["out"] and pg.evaluate(f"{R}.log().length") == n0 and "не угадывает" in h["explain"])
    h = c4(pg, "git revert HEAD --no-edit"); check("3 revert HEAD --no-edit работает", h["ok"] and 'Revert "Добавить структуру страницы"' in h["out"] and "index.html" not in pg.evaluate(f"Object.keys({R}.working)"), h["out"])
    h = c4(pg, "git revert -n HEAD"); check("3 неподдерживаемый флаг → честный отказ", (not h["ok"]) and "не поддерживает" in h["out"])
    # 4. грязное дерево
    pg = new(br, U10); errs.append(pg.errs); idB = cid(pg, "Comic")
    setf(pg, "style.css", "своя правка"); h = c4(pg, f"git revert {idB}")
    check("4 revert при несохранённой правке в том же файле отказывает", (not h["ok"]) and "would be overwritten by revert" in h["out"] and work(pg, "style.css") == "своя правка")
    pg.evaluate(f"{R}.working['style.css']=STATE.chapters.ch4.repo._tree(STATE.chapters.ch4.repo._headCommitId())['style.css']")
    setf(pg, "index.html", "правка в другом файле"); h = c4(pg, f"git revert {idB}")
    check("4 правка в другом файле не мешает, и остаётся на месте", h["ok"] and work(pg, "index.html") == "правка в другом файле", h["out"])
    # 5. reset
    pg = new(br, U10); errs.append(pg.errs)
    h = c4(pg, "git reset --soft HEAD~1"); check("5 reset --soft: без вывода, ветка сдвинулась, изменения в индексе, пояснение про reflog/граф", h["ok"] and h["out"] == "" and st(pg) == '[["index.html"],[],[]]' and "reflog" in h["explain"], st(pg))
    pg = new(br, U10); errs.append(pg.errs); h = c4(pg, "git reset HEAD~2")
    check("5 reset (mixed) HEAD~2: список «Unstaged changes after reset», как у Git", h["ok"] and h["out"] == "Unstaged changes after reset:\nM\tstyle.css" and "не тронут" in h["explain"], h["out"])
    pg = new(br, U10); errs.append(pg.errs); setf(pg, "index.html", "несохранённая правка"); h = c4(pg, "git reset --hard")
    check("5 reset --hard без ссылки: «HEAD is now at», правка потеряна, пояснение «ветка на месте» + reflog не вернёт правки", h["ok"] and h["out"].startswith("HEAD is now at") and work(pg, "index.html") == "<h1>Мой сайт</h1>" and "осталась на месте" in h["explain"] and "потеряны навсегда" in h["explain"], h["explain"][:80])
    h = c4(pg, "git reset --soft HEAD"); check("5 reset --soft HEAD: пояснение «ничего не изменила»", "ничего не изменила" in h["explain"])
    # reset с файлами
    pg = new(br, U10); errs.append(pg.errs)
    setf(pg, "style.css", "правка A"); c4(pg, "git add style.css"); setf(pg, "index.html", "правка B"); c4(pg, "git add index.html")
    h = c4(pg, "git reset style.css"); check("5 reset <файл>: убран из индекса, содержимое на диске цело, пояснение про git add", h["ok"] and st(pg) == '[["index.html"],["style.css"],[]]' and work(pg, "style.css") == "правка A" and "обратная операция к git add" in h["explain"], st(pg))
    check("5 …вывод как у Git: Unstaged changes + M файл", h["out"] == "Unstaged changes after reset:\nM\tstyle.css", h["out"])
    h = c4(pg, "git reset HEAD index.html"); check("5 reset HEAD <файл> работает (раньше HEAD терялся)", h["ok"] and sorted(json.loads(st(pg))[1]) == ["index.html","style.css"] and json.loads(st(pg))[0] == [] and "обратная операция" in h["explain"], st(pg))
    c4(pg, "git add ."); h = c4(pg, "git reset -- style.css"); check("5 reset -- <файл>", h["ok"] and json.loads(st(pg))[0] == ["index.html"], st(pg))
    h = c4(pg, "git reset --hard style.css"); check("5 reset --hard <файл> → fatal Cannot do hard reset with paths", (not h["ok"]) and "Cannot do hard reset with paths" in h["out"])
    h = c4(pg, "git reset nosuch"); check("5 reset nosuch → fatal ambiguous", (not h["ok"]) and "ambiguous argument 'nosuch'" in h["out"])
    h = c4(pg, "git reset -q"); check("5 неизвестный флаг reset → отказ", not h["ok"] and "не поддерживает" in h["out"])
    # 6. граф
    pg = new(br, U10); errs.append(pg.errs); g0 = ghosts(pg); note0 = pg.locator(".graph-note").count()
    old = cid(pg, "структуру"); c4(pg, "git reset --hard HEAD~1")
    check("6 после reset --hard отброшенный коммит остаётся на графе бледным (1) + подпись про reflog; до этого 0", g0 == 0 and note0 == 0 and ghosts(pg) == 1 and "reflog" in pg.inner_text(".graph-note"), f"{g0} {note0} {ghosts(pg)}")
    h = c4(pg, f"git branch rescue {old}"); check("6 git branch rescue <хэш> возвращает коммит: бледных нет, подписи нет", h["ok"] and ghosts(pg) == 0 and pg.locator(".graph-note").count() == 0)
    pg = new(br, U10); errs.append(pg.errs); c4(pg, "git reset --soft HEAD~1"); c4(pg, 'git commit -m "новый"'); check("6 после нового коммита старый остаётся бледным", ghosts(pg) == 1)
    # разделы без reset: бледных нет
    pg = fresh(br, U10); errs.append(pg.errs); bad = []
    for i in range(8):
        nav(pg, i)
        if i == 4: cmd(pg, "ch5-local", "git clone origin local")
        if pg.locator(".graph-note").count(): bad.append(i + 1)
    check("6 в исходном состоянии ни в одном разделе нет «осиротевших» коммитов", not bad, str(bad))
    # 7. миссии
    pg = new(br, U10); errs.append(pg.errs); c4(pg, "git log --oneline"); c4(pg, "git revert HEAD"); f = flags(pg)
    check("7 revert НЕ того коммита миссию 2 не засчитывает", f[:2] == [True, False], str(f))
    c4(pg, "git reset --hard HEAD~1"); c4(pg, f"git revert {cid(pg,'Comic')}"); c4(pg, "git reset --soft HEAD~1"); c4(pg, "git reset --hard HEAD~1")
    check("7 все 4 миссии в нормальном порядке", all(flags(pg)), str(flags(pg)))
    # 8. тексты
    pg = new(br, U10); errs.append(pg.errs); th = pg.inner_text(".theory-block")
    check("8 теория: убрано «(кроме git reflog)», есть про reflog коммита, reset <файл>, конфликт revert", "кроме git reflog" not in th and "пропадают навсегда" in th and "git reset имя-файла" in th and "конфликте" in th)
    check("8 миссия 4 без «без права передумать»", "без права передумать" not in pg.inner_text("#content"))
    check("8 рамка «Чем тренажёр отличается» есть", "Чем тренажёр отличается" in pg.inner_text("#content"))
    ci = pg.evaluate("CHAPTERS[3].quiz.map(q => q.options.findIndex(o=>o.correct))"); L = pg.evaluate("CHAPTERS[3].quiz.map(q => { const l=q.options.map(o=>o.text.length); return l.indexOf(Math.max(...l)) === q.options.findIndex(o=>o.correct); })")
    check("8 квиз: верные на позициях C и B, в первом вопросе не самый длинный", ci == [2, 1] and not L[0], f"{ci} {L}")
    check("нет ошибок страницы", not [e for l in errs for e in l], str([e for l in errs for e in l][:2]))
    br.close()
print(f"\n{sum(res)}/{len(res)} passed")
