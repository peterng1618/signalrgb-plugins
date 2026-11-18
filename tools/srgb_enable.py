"""Drive SignalRGB via orca computer: open Devices, enable the L10 card."""
import json
import re
import subprocess
import sys
import time

ORCA = r"%LOCALAPPDATA%\Programs\orca\resources\bin\orca.exe"


def cli(*args):
    p = subprocess.run([ORCA, "computer", *args, "--json"], capture_output=True, text=True)
    try:
        return json.loads(p.stdout)
    except Exception:
        return {"ok": False, "error": {"message": p.stdout[:300] + p.stderr[:300]}}


def pid():
    d = cli("list-apps")
    for a in d.get("result", {}).get("apps", []):
        if a.get("name") == "SignalRgb":
            return a["pid"]
    return None


def state(p, full=False):
    args = ["get-app-state", "--app", f"pid:{p}"]
    d = cli(*args)
    return d.get("result", {}).get("snapshot", {}).get("treeText", ""), d


def idx_of(txt, needle):
    for line in txt.splitlines():
        if needle in line:
            m = re.match(r"\s*(\d+)\s", line)
            if m:
                return int(m.group(1))
    return None


def click(p, idx):
    return cli("click", "--app", f"pid:{p}", "--element-index", str(idx))


p = pid()
print("pid", p)
if not p:
    sys.exit(1)

for attempt in range(6):
    txt, d = state(p, full=True)
    if "Devices" in txt and "Jungle Leopard" in txt:
        break
    i = idx_of(txt, "button Devices")
    if i is None:
        print("no Devices button", d.get("error", {}).get("message"))
        time.sleep(1)
        p = pid() or p
        continue
    r = click(p, i)
    print("click Devices", r.get("ok"), r.get("error", {}).get("message", ""))
    time.sleep(0.6)
    txt, d = state(p, full=True)
    if "Jungle Leopard" in txt:
        break
    print("attempt", attempt, "jungle not visible")

lines = txt.splitlines()
card = next((i for i, l in enumerate(lines) if "Jungle Leopard L10 ARGB Hub" in l), None)
print("card", card)
if card is not None:
    for attempt in range(6):
        txt, _ = state(p)
        lines = txt.splitlines()
        card = next((i for i, l in enumerate(lines) if "Jungle Leopard L10 ARGB Hub" in l), None)
        if card is None:
            print("card gone; retrying page")
            txt, _ = state(p)
            i = idx_of(txt, "button Devices")
            if i:
                click(p, i)
            time.sleep(0.8)
            continue
        buttons = []
        for l in lines[card:card + 6]:
            m = re.match(r"\s*(\d+)\s+button\b", l)
            if m:
                buttons.append(int(m.group(1)))
        print("buttons", buttons)
        if len(buttons) >= 2:
            r = click(p, buttons[1])
            ok = r.get("ok")
            print("click toggle", ok, r.get("error", {}).get("message", ""))
            if ok:
                break
        time.sleep(0.6)
