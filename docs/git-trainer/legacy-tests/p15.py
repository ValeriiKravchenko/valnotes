exec(open("p3.py").read().split("with sync_playwright")[0])
U14="file:///mnt/user-data/outputs/git-trenazher_14.html"; U15="file:///mnt/user-data/outputs/git-trenazher_15.html"
IDS=["ch1","ch2","ch3","ch4","ch5","ch6","ch7","appx"]
def answer(pg, cid, wrong=None, i=None):
    """ответить на все вопросы: верно, кроме индексов в wrong"""
    n=pg.evaluate(f"STATE_DEFS.{cid}.quiz.length")
    for qi in range(n):
        corr=pg.evaluate(f"STATE_DEFS.{cid}.quiz[{qi}].options.findIndex(o=>o.correct)")
        oi = (0 if corr!=0 else 1) if (wrong and qi in wrong) else corr
        pg.locator(f"[data-qi='{qi}'][data-oi='{oi}'][data-ch='{cid}']").click(); pg.wait_for_timeout(40)
def done_dots(pg): return pg.eval_on_selector_all(".nav-dot", "els=>els.map(e=>e.classList.contains('done'))")
with sync_playwright() as p:
    br=p.chromium.launch(args=["--no-sandbox"]); errs=[]
    print("=== ДО (_14) ===")
    pg=fresh(br,U14); nav(pg,1); answer(pg,"ch2",wrong={0,1}); print("  ch2 с двумя неверными: отмечен пройденным =", done_dots(pg)[1])
    print("\n=== ПОСЛЕ (_15) ===")
    for k,cid in enumerate(IDS):
        pg=fresh(br,U15); errs.append(pg.errs); nav(pg,k)
        n=pg.evaluate(f"STATE_DEFS.{cid}.quiz.length")
        answer(pg,cid,wrong={0})
        check(f"{cid}: с одним неверным ответом раздел НЕ пройден", done_dots(pg)[k]==False)
        txt=pg.locator(f"#quiz-result-{cid}").inner_text()
        check(f"{cid}: строка результата «Верных ответов: {n-1} из {n}»", f"Верных ответов: {n-1} из {n}" in txt, txt[:40])
        check(f"{cid}: есть кнопка «Пройти квиз заново»", pg.locator(f"#quiz-retry-{cid}").count()==1)
        pg.locator(f"#quiz-retry-{cid}").click(); pg.wait_for_timeout(60)
        check(f"{cid}: после «заново» ответы сброшены", pg.evaluate(f"Object.keys(STATE.chapters.{cid}.quizState).length")==0 and pg.locator(f"#quiz-result-{cid}").count()==0)
        answer(pg,cid)
        check(f"{cid}: все верно → раздел пройден", done_dots(pg)[k]==True)
        check(f"{cid}: «Все ответы верны — раздел пройден.»", "раздел пройден" in pg.locator(f"#quiz-result-{cid}").inner_text())
        # перезагрузка: сохранение
        pg.reload(); pg.wait_for_selector(".nav-item"); 
        check(f"{cid}: после перезагрузки статус «пройден» сохранился", done_dots(pg)[k]==True)
    # неверные ответы + перезагрузка
    pg=fresh(br,U15); nav(pg,2); answer(pg,"ch3",wrong={1}); pg.reload(); pg.wait_for_selector(".nav-item")
    check("ch3: неверный ответ после перезагрузки — всё ещё не пройден", done_dots(pg)[2]==False)
    # прогресс-бар
    pg=fresh(br,U15)
    for k,cid in enumerate(IDS): nav(pg,k); answer(pg,cid)
    lab=pg.locator(".progress-label").inner_text(); check("все 8 верно → прогресс 8/8", "8" in lab and "0/8" not in lab, lab)
    # ---- телефон
    print("\n--- телефон 375px ---")
    for k,cid in [(0,"ch1"),(1,"ch2"),(2,"ch3"),(3,"ch4"),(7,"appx")]:
        pg=fresh(br,U15,viewport={"width":375,"height":800}); errs.append(pg.errs); nav(pg,k)
        t=pg.evaluate("document.querySelector('.terminal').getBoundingClientRect().top")
        pn=pg.evaluate("document.querySelector('.split-panels').getBoundingClientRect().top")
        check(f"{cid}: терминал выше панелей на телефоне", t<pn, f"{t:.0f} < {pn:.0f}")
        check(f"{cid}: нет горизонтальной прокрутки", pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    pg=fresh(br,U15,viewport={"width":375,"height":800}); errs.append(pg.errs); nav(pg,4)
    lo=pg.evaluate("document.querySelector('#term-in-ch5-local').getBoundingClientRect().top"); orr=pg.evaluate("document.querySelector('.remote-split > div').getBoundingClientRect().top")
    check("ch5: LOCAL (терминал) выше ORIGIN на телефоне", lo<orr, f"{lo:.0f}<{orr:.0f}")
    check("ch5: нет горизонтальной прокрутки", pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    pg=fresh(br,U15,viewport={"width":1280,"height":900}); nav(pg,4)
    a=pg.evaluate("document.querySelector('.remote-split > div:nth-child(1)').getBoundingClientRect().left"); b=pg.evaluate("document.querySelector('.remote-split > div:nth-child(2)').getBoundingClientRect().left")
    check("ch5 на десктопе: ORIGIN слева, LOCAL справа (без изменений)", a<b)
    pg=fresh(br,U15,viewport={"width":1280,"height":900}); nav(pg,1)
    a=pg.evaluate("document.querySelector('.terminal').getBoundingClientRect().left"); b=pg.evaluate("document.querySelector('.split-panels').getBoundingClientRect().left")
    check("ch2 на десктопе: терминал слева, панели справа", a<b)
    # doctype / режим
    pg=fresh(br,U15); check("режим стандартов (не quirks)", pg.evaluate("document.compatMode")=="CSS1Compat"); check("viewport meta есть", pg.evaluate("!!document.querySelector('meta[name=viewport]')"))
    check("нет ошибок страницы", all(not e for e in errs), str([e for e in errs if e][:2]))
print("\nИТОГО:", sum(res), "/", len(res))
