exec(open("p3.py").read().split("with sync_playwright")[0])
U10="file:///mnt/user-data/outputs/git-trenazher_10.html"; U11="file:///mnt/user-data/outputs/git-trenazher_15.html"
L="ch5-local"
def c5(pg, t): cmd(pg, L, t); return H(pg, "ch5", True)
def new(br, url): pg = fresh(br, url); nav(pg, 4); return pg
def flags(pg): return pg.eval_on_selector_all(".mission", "els => els.map(e => e.classList.contains('done'))")
def cloned(br, url):
    pg = new(br, url); c5(pg, "git clone origin local"); return pg
def own(pg, msg="r"):
    edit(pg); c5(pg, "git add README.md"); return c5(pg, f'git commit -m "{msg}"')
def team(pg): pg.locator("#teammate-btn-ch5").click(); pg.wait_for_timeout(80)
def logs(pg, w): return pg.evaluate(f"STATE.chapters.ch5.{w}.log().map(c=>c.message)")
with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"]); errs = []
    print("=== ДО (_10) ===")
    pg = cloned(br, U10); print("  git remote -v:", repr(c5(pg,"git remote -v")["out"]))
    own(pg); c5(pg, "git push"); print("  повторный push:", repr(c5(pg,"git push")["out"]), "| 💡", c5(pg,"git push")["explain"][:50])
    print("  status после push:", repr(c5(pg,"git status")["out"]))
    pg = cloned(br, U10); team(pg); team(pg); print("  два клика по кнопке коллеги → коммитов на сервере:", len(logs(pg,'origin')), "| заметок:", pg.evaluate("STATE.chapters.ch5.histOrigin.length"))
    pg = cloned(br, U10); c5(pg,"git push"); c5(pg,"git pull"); print("  миссия 3/5 без единого коммита:", flags(pg))
    print("  pull без коллеги, вывод:", repr(c5(pg,"git pull")["out"]))

    print("\n=== ПОСЛЕ (_11) ===")
    # 1 remote
    pg = new(br, U11); errs.append(pg.errs)
    check("1 до clone: git remote — пусто", c5(pg,"git status")["ok"] is False)
    c5(pg,"git clone origin local")
    h = c5(pg,"git remote"); check("1 git remote → origin", h["ok"] and h["out"]=="origin", h["out"])
    h = c5(pg,"git remote -v"); check("1 git remote -v → fetch/push", h["out"].count("origin\t")==2 and "(fetch)" in h["out"] and "(push)" in h["out"] and "условный" in h["explain"], h["out"])
    h = c5(pg,"git remote add x y"); check("1 remote add → честный отказ", not h["ok"])
    h = c5(pg,"git clone origin local"); check("1 повторный clone → «already exists»", (not h["ok"]) and "already exists" in h["out"], h["out"][:40])
    pg2 = new(br, U11); h = c5(pg2,"git clone https://x/y.git"); check("1 clone чужого адреса → ошибка, локальной копии нет", (not h["ok"]) and pg2.evaluate("!STATE.chapters.ch5.local"), h["out"][:40])
    # status
    pg = cloned(br, U11); errs.append(pg.errs)
    h = c5(pg,"git status"); check("2 сразу после clone: up to date with origin/master", "Your branch is up to date with 'origin/master'." in h["out"] and "Up to date" in h["explain"] and "fetch" in h["explain"], h["out"])
    check("2 панель статуса тоже показывает «совпадает с сервером»", "совпадает с сервером" in pg.inner_text("body"), "")
    own(pg); h = c5(pg,"git status")
    check("2 после своего коммита: ahead by 1 commit", "ahead of 'origin/master' by 1 commit." in h["out"] and 'use "git push"' in h["out"] and "Ahead" in h["explain"], h["out"].splitlines()[1])
    check("2 панель: «на 1 коммит больше»", "на 1 коммит больше" in pg.inner_text("body"))
    check("2 граф: метка origin/master стоит у первого коммита, master — впереди", pg.evaluate("[...document.querySelectorAll('.graph-wrap text')].some(t=>t.textContent.includes('origin/master'))"))
    h = c5(pg,"git push"); check("2 push отправил, «отправлены» в 💡", h["ok"] and "->" in h["out"] and "отправлены" in h["explain"], h["out"])
    h = c5(pg,"git status"); check("2 после push снова up to date", "up to date with" in h["out"], h["out"].splitlines()[1])
    # 3 повторный push
    h = c5(pg,"git push"); check("3 повторный push → Everything up-to-date, ok, 💡 про «нечего отправлять» (а не «отправлены»)", h["ok"] and h["out"]=="Everything up-to-date" and "нечего" in h["explain"] and "отправлены" not in h["explain"], h["explain"][:50])
    h = c5(pg,"git push -u origin master"); check("3 push -u без новых коммитов: строка про tracking + up-to-date", h["out"]=="branch 'master' set up to track 'origin/master'.\nEverything up-to-date", repr(h["out"]))
    # 4 коллега
    pg = cloned(br, U11); errs.append(pg.errs); own(pg); c5(pg,"git push")
    team(pg); n1 = len(logs(pg,"origin"))
    h = c5(pg,"git status"); check("4 после коллеги без fetch status НЕ видит новых коммитов (как в реальном Git)", "up to date with" in h["out"], h["out"].splitlines()[1])
    h = c5(pg,"git fetch"); check("4 fetch: вывод From origin, 💡 про merge origin/master", h["ok"] and h["out"].startswith("From origin") and "merge origin/master" in h["explain"], h["out"][:20])
    h = c5(pg,"git status"); check("4 после fetch: behind by 1 commit, can be fast-forwarded", "behind 'origin/master' by 1 commit, and can be fast-forwarded" in h["out"] and "Behind" in h["explain"], h["out"].splitlines()[1])
    h = c5(pg,"git fetch"); check("4 второй fetch → Already up to date + 💡 «нового нет»", h["out"]=="Already up to date." and "нового там нет" in h["explain"], h["explain"])
    h = c5(pg,"git pull"); check("4 pull после fetch: fast-forward, без коммита слияния, 💡 про «сдвинулась вперёд»", h["ok"] and "Fast-forward" in h["out"] and "сдвинулась" in h["explain"], h["out"])
    h = c5(pg,"git pull"); check("4 pull, когда всё свежо → Already up to date + 💡", h["out"]=="Already up to date." and "сливать нечего" in h["explain"], h["out"])
    # 5 полный цикл + разошлись
    pg = cloned(br, U11); errs.append(pg.errs); own(pg,"m1"); c5(pg,"git push"); team(pg)
    own(pg,"m2")
    h = c5(pg,"git push"); check("5 push после коллеги → rejected", (not h["ok"]) and "rejected" in h["out"] and "git pull" in h["out"], h["out"].splitlines()[0])
    check("5 миссии: 1–4 выполнены, 5 — ещё нет", flags(pg)==[True,True,True,True,False], str(flags(pg)))
    h = c5(pg,"git fetch"); h = c5(pg,"git status"); check("5 после fetch: diverged, 1 и 1", "have diverged" in h["out"] and "1 and 1 different commits" in h["out"] and "разошлись" in h["explain"], h["out"].splitlines()[1])
    check("5 панель: «ветки разошлись»", "ветки разошлись" in pg.inner_text("body"))
    h = c5(pg,"git pull"); check("5 pull после fetch: коммит слияния, 💡 про отдельный коммит слияния", h["ok"] and "Merge made" in h["out"] and "коммит слияния" in h["explain"], h["out"])
    check("5 …README.md с правкой m2 не потерян, CHANGELOG.md пришёл", pg.evaluate("(()=>{const w=STATE.chapters.ch5.local.working; return !!w['CHANGELOG.md'] && w['README.md'].includes('Установка')})()"))
    check("5 миссия 5 ещё не выполнена (push не сделан)", flags(pg)[4] is False)
    h = c5(pg,"git push"); check("5 push после pull проходит", h["ok"] and "->" in h["out"], h["out"])
    check("5 все 5 миссий выполнены", all(flags(pg)), str(flags(pg)))
    check("5 origin и local сошлись: история одинаковая", sorted(logs(pg,"origin"))==sorted(logs(pg,"local")), "")
    h = c5(pg,"git status"); check("5 в конце up to date", "up to date with" in h["out"])
    # 6 pull сразу без fetch (diverged) + несохранённые правки в другом файле сохранились
    pg = cloned(br, U11); errs.append(pg.errs); own(pg,"m1"); c5(pg,"git push"); team(pg); own(pg,"m2")
    pg.evaluate("STATE.chapters.ch5.local.working['notes.txt']='моя заметка'"); pg.evaluate("STATE.chapters.ch5.local.working['README.md']=STATE.chapters.ch5.local.working['README.md']")
    h = c5(pg,"git pull"); check("6 pull с неотслеживаемым notes.txt не трогает его", h["ok"] and pg.evaluate("STATE.chapters.ch5.local.working['notes.txt']")=="моя заметка", h["out"])
    # 7 коллега — повторяемый
    pg = cloned(br, U11); errs.append(pg.errs); team(pg); team(pg)
    check("7 два клика коллеги → 2 разных коммита, 2 заметки, названия разные", len(logs(pg,"origin"))==3 and pg.evaluate("STATE.chapters.ch5.histOrigin.length")==2 and len(set(logs(pg,'origin')))==3, str(logs(pg,'origin')))
    check("7 подпись кнопки после первого клика поменялась", "ещё одну" in pg.inner_text("#teammate-btn-ch5"))
    check("7 в заметке — сообщение коммита", "Обновить changelog" in pg.evaluate("STATE.chapters.ch5.histOrigin[1].text"))
    # 8 миссии не засчитываются «вхолостую»
    pg = cloned(br, U11); errs.append(pg.errs); c5(pg,"git push"); c5(pg,"git pull"); c5(pg,"git push")
    check("8 push/pull без коммитов не закрывает миссии 3 и 5", flags(pg)==[True,False,False,False,False], str(flags(pg)))
    pg = cloned(br, U11); errs.append(pg.errs); own(pg); c5(pg,"git push")
    for _ in range(2): c5(pg,"git pull"); c5(pg,"git push")
    check("8 pull + push «вхолостую» без отказа не закрывает миссию 5", flags(pg)==[True,True,True,False,False], str(flags(pg)))
    team(pg); own(pg,"m2"); c5(pg,"git pull"); c5(pg,"git push")
    check("8 коммит по порядку (коллега → свой коммит) засчитывается, но миссия 5 без отказа — нет", flags(pg)[3] is True and flags(pg)[4] is False, str(flags(pg)))
    pg = cloned(br, U11); errs.append(pg.errs); own(pg); c5(pg,"git push"); own(pg,"m2"); team(pg)
    check("8 свой коммит ДО клика коллеги не засчитывает миссию 4", flags(pg)[3] is False, str(flags(pg)))
    own(pg,"m3"); check("8 …а после клика — засчитывает", flags(pg)[3] is True)
    # 9 tracking-ветки
    pg = cloned(br, U11); errs.append(pg.errs); c5(pg,"git checkout -b feature"); h = c5(pg,"git pull")
    check("9 pull на новой ветке без tracking → понятная ошибка + 💡", (not h["ok"]) and "no tracking information" in h["out"] and "git push -u" in h["explain"], h["out"].splitlines()[0])
    h = c5(pg,"git status"); check("9 status на такой ветке без строки про origin", "origin" not in h["out"])
    edit(pg); c5(pg,"git add README.md"); c5(pg,'git commit -m "f"'); h = c5(pg,"git push -u origin feature")
    check("9 push -u связывает ветку", "set up to track" in h["out"] and "up to date with 'origin/feature'" in c5(pg,"git status")["out"])
    h = c5(pg,"git pull origin nosuch"); check("9 pull несуществующей ветки → couldn't find remote ref", (not h["ok"]) and "couldn't find remote ref" in h["out"], h["out"])
    # 10 force
    pg = cloned(br, U11); errs.append(pg.errs); own(pg); c5(pg,"git push"); team(pg); own(pg,"m2"); h = c5(pg,"git push --force")
    check("10 push --force: forced update, CHANGELOG-коммит коллеги пропал с ветки origin", h["ok"] and "forced update" in h["out"] and "Обновить" not in " ".join(logs(pg,"origin")) and "Добавить changelog и лицензию" not in " ".join(logs(pg,"origin")), str(logs(pg,'origin')))
    check("10 …в графе origin он бледный (ghost)", pg.locator('.graph-wrap circle[stroke-dasharray="3 2"]').count()>=1)
    # 11 квиз
    pg = new(br, U11); errs.append(pg.errs)
    pos = pg.evaluate("STATE_DEFS.ch5.quiz.map(q=>q.options.findIndex(o=>o.correct))"); print("  позиции верных ответов:", pos)
    check("11 квиз: 3 вопроса, верный не всегда B", len(pos)==3 and len(set(pos))>1 and pos.count(1)<3)
    check("11 квиз: верный ответ не самый длинный ни в одном вопросе", all(max(range(4), key=lambda i: len(q["options"][i]["text"]))!=q["options"].index(next(o for o in q["options"] if o.get("correct"))) for q in pg.evaluate("STATE_DEFS.ch5.quiz")))
    # 12 миссия 1 / прочие главы не пострадали: remote
    pg = fresh(br, U11); nav(pg, 0); errs.append(pg.errs)
    print("  ошибки страницы:", [e for e in sum(errs, []) if e] or "нет")
print(f"\nИТОГ: {sum(res)}/{len(res)}")
