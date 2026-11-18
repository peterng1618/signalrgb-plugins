#!/usr/bin/env python3
"""Walk one LED at a time around the WLED strip so the physical order is visible.

Usage: python tools/wled_walk.py [host] [delay_seconds]
"""
import json
import sys
import time
import urllib.request

HOST = sys.argv[1] if len(sys.argv) > 1 else "<strip-ip>"
DELAY = float(sys.argv[2]) if len(sys.argv) > 2 else 0.8
COUNT = 118


def post(payload):
    req = urllib.request.Request(
        f"http://{HOST}/json/state",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=5).read()


post({"on": True, "bri": 255, "transition": 0})
time.sleep(0.5)
for i in range(COUNT):
    px = [[0, 0, 0]] * COUNT
    px[i] = [255, 255, 255]
    post({"on": True, "bri": 255, "transition": 0,
          "seg": [{"id": 0, "start": 0, "stop": COUNT, "i": px}]})
    print(f"LED {i}", flush=True)
    time.sleep(DELAY)
post({"on": False})
print("done")
