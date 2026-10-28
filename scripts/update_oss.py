#!/usr/bin/env python3
"""Regenerate the open-source section of index.html from GitHub.

Finds merged PRs by the configured author in repositories they don't own,
keeps only popular repositories (data/oss.json: min_stars, max_repos), and
rewrites everything between the <!-- oss:... --> markers in index.html.

Usage: GITHUB_TOKEN=... python3 scripts/update_oss.py
Standard library only, so it runs on a bare Actions runner.
"""
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "data" / "oss.json").read_text())
INDEX = ROOT / "index.html"
API = "https://api.github.com"
LANGS = {"TypeScript": "typescript", "JavaScript": "typescript", "Go": "go", "Python": "python", "Rust": "rust, c++", "C++": "rust, c++"}


def get(path):
    req = urllib.request.Request(API + path, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "portfolio-oss-sync",
        **({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"} if os.environ.get("GITHUB_TOKEN") else {}),
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def merged_prs():
    author = CONFIG["author"]
    q = urllib.parse.quote(f"is:pr is:merged author:{author} -user:{author}")
    prs, page = {}, 1
    while True:
        res = get(f"/search/issues?q={q}&per_page=100&page={page}")
        for item in res["items"]:
            prs[item["html_url"]] = item
        if len(res["items"]) < 100:
            break
        page += 1
    for url in CONFIG.get("extra_prs", []):
        if url not in prs:
            owner, repo, _, num = url.split("/")[-4:]
            pr = get(f"/repos/{owner}/{repo}/pulls/{num}")
            if pr.get("merged_at"):
                prs[url] = {"html_url": url, "title": pr["title"], "number": pr["number"],
                            "repository_url": f"{API}/repos/{owner}/{repo}",
                            "pull_request": {"merged_at": pr["merged_at"]}}
    for url in CONFIG.get("exclude_prs", []):
        prs.pop(url, None)
    return list(prs.values())


def short_stars(n):
    if n >= 1000:
        k = n / 1000
        return f"{k:.1f}k".replace(".0k", "k") if k < 10 else f"{round(k)}k"
    return str(n)


def floor_count(n):
    """16 -> '10+', 23 -> '20+', 7 -> '5+'. Never claims more than is true."""
    step = 10 if n >= 10 else 5
    return f"{max(n // step * step, 1)}+"


def build():
    meta_cache = {}

    def repo_meta(full):
        if full not in meta_cache:
            meta_cache[full] = get(f"/repos/{full}")
        return meta_cache[full]

    # Group by the repo's current name: renamed orgs (facebook -> meta) redirect.
    repos, seen = {}, set()
    for pr in merged_prs():
        m = repo_meta(pr["repository_url"].split("/repos/")[1])
        key = (m["full_name"], pr["number"])
        if key not in seen:
            seen.add(key)
            repos.setdefault(m["full_name"], {"meta": m, "prs": []})["prs"].append(pr)
    total = len(seen)

    notes = {u.split("github.com/")[1].split("/", 1)[1]: n for u, n in CONFIG["notes"].items()}
    popular = sorted((r for r in repos.values() if r["meta"]["stargazers_count"] >= CONFIG["min_stars"]),
                     key=lambda r: -r["meta"]["stargazers_count"])[: CONFIG["max_repos"]]

    rows, graph = [], []
    for r in popular:
        m = r["meta"]
        full, owner, name = m["full_name"], m["owner"]["login"], m["name"]
        company = CONFIG["companies"].get(owner, owner)
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        items = sorted(r["prs"], key=lambda p: p["pull_request"]["merged_at"], reverse=True)
        lis = []
        for pr in items[: CONFIG["max_prs_per_repo"]]:
            note = notes.get(f"{name}/pull/{pr['number']}") or html.escape(pr["title"])
            url = f"https://github.com/{full}/pull/{pr['number']}"
            lis.append(f'        <li><a href="{url}">#{pr["number"]}</a><span>{note}</span></li>')
        rows.append(
            f'    <li class="row" id="r-{slug}">\n'
            f'      <div class="row-meta"><a class="repo" href="{m["html_url"]}">{full}</a>'
            f'<span class="company">{html.escape(company)}</span>'
            f'<span class="stars">{short_stars(m["stargazers_count"])} ★</span></div>\n'
            f'      <ul class="prs">\n' + "\n".join(lis) + "\n      </ul>\n    </li>"
        )
        graph.append({"id": slug, "label": name, "full": full, "company": company,
                      "short": CONFIG.get("short_companies", {}).get(company, company),
                      "lang": CONFIG.get("lang_overrides", {}).get(full) or LANGS.get(m.get("language"), "other"), "prs": len(items),
                      "stars": short_stars(m["stargazers_count"])})

    present = {g["company"] for g in graph}
    order = CONFIG.get("company_order", [])
    companies = [c for c in order if c in present] + sorted(present - set(order))
    return floor_count(total), companies, "\n".join(rows), json.dumps(graph, separators=(",", ":"))


def replace(text, name, value):
    pattern = re.compile(rf"(<!-- oss:{name} -->).*?(<!-- /oss:{name} -->)", re.S)
    if not pattern.search(text):
        sys.exit(f"marker oss:{name} missing from index.html")
    return pattern.sub(lambda m: m.group(1) + value + m.group(2), text)


def main():
    count, companies, rows, graph = build()
    repos = len(json.loads(graph))
    text = INDEX.read_text()
    text = replace(text, "rows", "\n" + rows + "\n    ")
    text = replace(text, "graph", f'<script type="application/json" id="oss-data">{graph}</script>')
    text = replace(text, "count", count)
    text = replace(text, "companies", html.escape(", ".join(companies[: CONFIG.get("max_companies", 6)])))
    text = re.sub(r'(<meta (?:name="description"|property="og:description") content="[^"]*?)\d+\+ merged',
                  lambda m: f"{m.group(1)}{count} merged", text)
    if text != INDEX.read_text():
        INDEX.write_text(text)
        print(f"updated: {count} merged PRs, {repos} popular repos")
    else:
        print("no changes")


if __name__ == "__main__":
    main()
