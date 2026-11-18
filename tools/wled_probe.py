import socket, json, sys, urllib.request

IP = "<strip-ip>"
N = 118

def state():
    with urllib.request.urlopen(f"http://{IP}/json/info", timeout=3) as r:
        i = json.load(r)
    with urllib.request.urlopen(f"http://{IP}/json/state", timeout=3) as r:
        s = json.load(r)
    return i, s

def send(port, pkt, n=1):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    for _ in range(n):
        s.sendto(bytes(pkt), (IP, port))
    s.close()

def drgb(colors, timeout=2):
    pkt = [0x02, timeout]
    for r,g,b in colors:
        pkt += [r,g,b]
    return pkt

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "info"
    if mode == "info":
        i, s = state()
        print(json.dumps({"live": i["live"], "lm": i["lm"], "lip": i["lip"],
                          "on": s["on"], "bri": s["bri"],
                          "col": s["seg"][0]["col"][0], "fx": s["seg"][0]["fx"]}, indent=1))
    elif mode == "drgb":
        port = int(sys.argv[2]); r,g,b = map(int, sys.argv[3:6])
        send(port, drgb([(r,g,b)]*N, 2), 10)
        print("sent DRGB 0x02 to", port)
    elif mode == "dnrgb":
        port = int(sys.argv[2]); start = int(sys.argv[3]); r,g,b = map(int, sys.argv[4:7])
        pkt = [0x04, 2, start>>8, start&255] + [r,g,b]*(N-start)
        send(port, pkt, 10)
        print("sent DNRGB 0x04 to", port, "start", start, "len", len(pkt))
