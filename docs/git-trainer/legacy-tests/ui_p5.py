from playwright.sync_api import sync_playwright

URL = "file:///mnt/user-data/outputs/git-trenazher_15.html"

def done_flags(page):
    return page.eval_on_selector_all(".mission", "els => els.map(e => e.classList.contains('done'))")

def cmd(page, tid, text):
    inp = page.locator(f"#term-in-{tid}")
    inp.fill(text)
    inp.press("Enter")
    page.wait_for_timeout(60)

def out(page, tid):
    return page.inner_text(f"#term-out-{tid}")

def click_text(page, sel, text=None, idx=0):
    loc = page.locator(sel)
    if text: loc = loc.filter(has_text=text)
    loc.nth(idx).click()
    page.wait_for_timeout(60)

def goto_ch(page, i):
    page.locator(".nav-item").nth(i).click()
    page.wait_for_timeout(80)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.route("**/fonts.g*/**", lambda r: r.abort())
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_selector(".nav-item")

    print("=== FOCUS after Enter (ch1) ===")
    page.locator("#term-in-ch1").fill("git init")
    page.locator("#term-in-ch1").press("Enter")
    page.wait_for_timeout(80)
    print("activeElement after Enter:", page.evaluate("document.activeElement && (document.activeElement.id || document.activeElement.tagName)"))
    page.keyboard.type("git status")
    print("input value after typing w/o clicking:", repr(page.locator("#term-in-ch1").input_value()))

    print("\n=== CH1 missions ===")
    cmd(page, "ch1", "git status")
    cmd(page, "ch1", "git add index.html")
    cmd(page, "ch1", 'git commit -m "Первый коммит"')
    print(out(page, "ch1"))
    click_text(page, "[data-fileop=edit]")
    cmd(page, "ch1", "git add .")
    cmd(page, "ch1", 'git commit -m "Второй"')
    print("done flags:", done_flags(page))
    print("progress label:", page.inner_text("#progressLabel"))

    print("\n=== CH2 missions + flicker check ===")
    goto_ch(page, 1)
    cmd(page, "ch2", "git branch dark-theme")
    cmd(page, "ch2", "git checkout dark-theme")
    click_text(page, "[data-fileop=edit]")
    cmd(page, "ch2", "git add style.css")
    cmd(page, "ch2", 'git commit -m "Тёмная тема"')
    print("after commit on dark-theme:", done_flags(page))
    cmd(page, "ch2", "git checkout master")
    print("after checkout master   :", done_flags(page), "<- mission 3 should stay done")
    cmd(page, "ch2", "git merge dark-theme")
    print("after merge             :", done_flags(page))
    print(out(page, "ch2")[-300:])
    # demo conflict
    page.locator("#demo-ch2").click(); page.wait_for_timeout(80)
    cmd(page, "ch2", "git merge conflict-demo")
    print("conflict box visible:", page.locator(".conflict-box").count())
    cmd(page, "ch2", "git reset --hard")
    print("after reset --hard, conflict box still visible:", page.locator(".conflict-box").count())
    cmd(page, "ch2", 'git commit -m "x"')
    print("commit after reset:", out(page, "ch2").strip().splitlines()[-1])

    print("\n=== CH3 ===")
    goto_ch(page, 2)
    for c in ["git log", "git log --oneline", "git diff", "git diff --staged"]:
        cmd(page, "ch3", c)
    print("done flags:", done_flags(page))
    print(out(page, "ch3")[:420])

    print("\n=== CH4 ===")
    goto_ch(page, 3)
    cmd(page, "ch4", "git log --oneline")
    lines = out(page, "ch4").splitlines()
    bad = [l for l in lines if "Comic" in l][0].split()[0]
    cmd(page, "ch4", f"git revert {bad}")
    cmd(page, "ch4", "git reset --soft HEAD~1")
    cmd(page, "ch4", "git reset --hard HEAD~1")
    print("done flags:", done_flags(page))
    print(out(page, "ch4")[-500:])

    print("\n=== CH5 ===")
    goto_ch(page, 4)
    cmd(page, "ch5-local", "git clone origin local")
    click_text(page, "[data-fileop=edit]")
    cmd(page, "ch5-local", "git add README.md")
    cmd(page, "ch5-local", 'git commit -m "README"')
    cmd(page, "ch5-local", "git push")
    page.locator("#teammate-btn-ch5").click(); page.wait_for_timeout(60)
    page.locator("#teammate-btn-ch5").click(); page.wait_for_timeout(60)  # double click
    print("origin terminal after 2 teammate clicks:\n", out(page, "ch5-origin"))
    click_text(page, "[data-fileop=edit]")
    cmd(page, "ch5-local", "git add README.md")
    cmd(page, "ch5-local", 'git commit -m "README 2"')
    cmd(page, "ch5-local", "git push")
    cmd(page, "ch5-local", "git pull")
    cmd(page, "ch5-local", "git push")
    print(out(page, "ch5-local")[-700:])
    print("done flags:", done_flags(page))

    print("\n=== CH8 (appendix) ===")
    goto_ch(page, 7)
    cmd(page, "appx", "git tag v1.0.0")
    click_text(page, "[data-fileop=edit]")
    cmd(page, "appx", "git stash")
    cmd(page, "appx", "git stash pop")
    cmd(page, "appx", "git add app.js"); cmd(page, "appx", 'git commit -m "wip"')  # commit local edit to move on
    cmd(page, "appx", "git log --oneline feature")
    fid = [l for l in out(page, "appx").splitlines() if "опечатка" in l][0].split()[0]
    cmd(page, "appx", f"git cherry-pick {fid}")
    cmd(page, "appx", "git reflog")
    cmd(page, "appx", "git checkout feature")
    cmd(page, "appx", "git rebase master")
    print(out(page, "appx")[-900:])
    print("done flags:", done_flags(page))
    page.screenshot(path="appx.png", full_page=True)

    print("\nPAGE ERRORS:", errs)
    b.close()
