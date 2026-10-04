exec(open("p3.py").read().split("with sync_playwright")[0])
with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    for name, url in (("_7","file:///mnt/user-data/outputs/git-trenazher_7.html"),("_8","file:///mnt/user-data/outputs/git-trenazher_8.html")):
        pg = fresh(br, url); nav(pg, 7); A="appx"
        print(name, [m[:40] for m in pg.eval_on_selector_all(".mission", "els=>els.map(e=>e.innerText.split('\\n')[0])")])
        cmd(pg, A, "git tag v1.0.0"); edit(pg); cmd(pg, A, "git stash"); cmd(pg, A, "git stash pop")
        cmd(pg, A, "git stash"); cmd(pg, A, "git log --oneline feature")
        fid = [l for l in pg.inner_text("#term-out-appx").splitlines() if "опечатка" in l][0].split()[0]
        cmd(pg, A, f"git cherry-pick {fid}"); cmd(pg, A, "git stash pop"); cmd(pg, A, "git reflog"); cmd(pg, A, "git checkout feature")
        cmd(pg, A, "git rebase master")
        print(" ", name, "миссии:", pg.eval_on_selector_all(".mission", "els=>els.map(e=>e.classList.contains('done'))"), "| ошибки:", pg.errs)
        print("   stash pop после cherry-pick:", [h for h in pg.evaluate("STATE.chapters.appx.hist.filter(x=>x.type==='cmd').map(x=>x.cmd+' => '+x.out.split('\\n')[0])") if 'stash pop' in h or 'checkout' in h or 'rebase' in h])
    br.close()
