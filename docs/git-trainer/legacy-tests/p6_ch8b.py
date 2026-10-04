exec(open("p3.py").read().split("with sync_playwright")[0])
with sync_playwright() as p:
    br = p.chromium.launch(args=["--no-sandbox"])
    pg = fresh(br, "file:///mnt/user-data/outputs/git-trenazher_8.html"); nav(pg, 7); A="appx"
    cmd(pg, A, "git tag v1.0.0"); edit(pg); cmd(pg, A, "git stash"); cmd(pg, A, "git stash pop"); cmd(pg, A, "git log --oneline feature")
    fid = [l for l in pg.inner_text("#term-out-appx").splitlines() if "опечатка" in l][0].split()[0]
    cmd(pg, A, f"git cherry-pick {fid}"); h=H(pg,"appx"); print("1:", h["ok"], h["out"].splitlines()[0], "|", h.get("explain","")[:50])
    cmd(pg, A, "git checkout -- app.js"); cmd(pg, A, f"git cherry-pick {fid}"); print("2:", H(pg,"appx")["ok"])
    cmd(pg, A, "git reflog"); cmd(pg, A, "git checkout feature"); cmd(pg, A, "git rebase master")
    print("миссии:", pg.eval_on_selector_all(".mission", "els=>els.map(e=>e.classList.contains('done'))"), pg.errs)
    br.close()
