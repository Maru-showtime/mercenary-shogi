# spec.md の中の JSON サンプルが、実際のデータと同じ書き方になっているか検証する。
# サンプルは「新しい傭兵を足すときの雛形」として写されるので、ここがずれていると実害が出る。
import json, io, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..") + "/"
merc = json.load(io.open(ROOT + "src/data/mercenaries.json", encoding="utf-8"))
spec = io.open(ROOT + "spec.md", encoding="utf-8").read()

NG = []


def check(cond, msg):
    print(("OK  " if cond else "NG  ") + msg)
    if not cond:
        NG.append(msg)


# spec.md 内の ```json ブロックを全部拾い、傭兵定義らしきものを実データと比べる
for block in re.findall(r"```json\n(.*?)```", spec, re.S):
    try:
        data = json.loads(block)
    except json.JSONDecodeError:
        continue
    if not isinstance(data, dict):
        continue
    for key, sample in data.items():
        if key not in merc or not isinstance(sample, dict):
            continue
        real = merc[key]
        for field in ["cost", "baseType", "name", "description", "effects", "promotionBonus"]:
            if field in sample:
                check(sample[field] == real.get(field), f"サンプルの {key}.{field} が実データと一致")
        unknown = [k for k in sample if k not in real]
        check(not unknown, f"サンプルの {key} に実データに無い項目が無い（{unknown or 'なし'}）")

# 実データが使っている効果タイプが、効果タイプ表にすべて載っているか
used = {e["type"] for v in merc.values() for e in v.get("effects", [])}
listed = set(re.findall(r"\|\s*`(\w+)`\s*\|", spec))
missing = sorted(used - listed)
check(not missing, f"使用中の効果タイプが全て spec に載っている（漏れ: {missing or 'なし'}）")

# 成り特典の型も表に載っているか
bonus = {v["promotionBonus"]["type"] for v in merc.values() if "promotionBonus" in v}
check(all(b in spec for b in bonus), f"成り特典の型 {sorted(bonus)} が spec に書かれている")

print("\n" + ("すべて一致" if not NG else f"要修正 {len(NG)} 件"))
sys.exit(0 if not NG else 1)
