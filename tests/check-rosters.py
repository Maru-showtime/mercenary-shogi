# AI の編成が「存在する傭兵か」「コスト上限内か」「駒種の枚数上限内か」を検証する
import json, io, os, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
COST_CAP = 10
BASE_TYPE_COUNT = {"P": 9, "L": 2, "N": 2, "S": 2, "G": 2, "K": 1, "B": 1, "R": 1}

defs = json.load(io.open(ROOT + "src/data/mercenaries.json", encoding="utf-8"))
rosters = json.load(io.open(ROOT + "src/data/aiRosters.json", encoding="utf-8"))

ok = True
for r in rosters:
    problems = []
    missing = [i for i in r["roster"] if i not in defs]
    if missing:
        problems.append(f"存在しない傭兵 {missing}")
    known = [i for i in r["roster"] if i in defs]
    total = sum(defs[i]["cost"] for i in known)
    if total > COST_CAP:
        problems.append(f"コスト超過 {total}/{COST_CAP}")
    per = {}
    for i in known:
        bt = defs[i]["baseType"]
        per[bt] = per.get(bt, 0) + 1
    for bt, n in per.items():
        if n > BASE_TYPE_COUNT[bt]:
            problems.append(f"{bt} の枚数超過 {n}/{BASE_TYPE_COUNT[bt]}")
    for i in known:
        mx = defs[i].get("maxCount")
        if mx and r["roster"].count(i) > mx:
            problems.append(f"{defs[i]['name']} は最大{mx}枚")

    names = "＋".join(defs[i]["name"] if i in defs else f"?{i}" for i in r["roster"])
    if problems:
        ok = False
        print(f"NG  {r['name']:8s} {names}  → {' / '.join(problems)}")
    else:
        print(f"OK  {r['name']:8s} {names}  (コスト{total})")

sys.exit(0 if ok else 1)
