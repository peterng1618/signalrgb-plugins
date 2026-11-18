"""One-pixel walk over WLED realtime UDP (port 7778, DRGB 0x02).
Usage: python tools/walk.py [seconds_per_pixel] [rounds]
Index 0 is marked red first, then a green dot walks 0..117."""
import socket, sys, time
IP, PORT, N = "<strip-ip>", 7778, 118
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
def frame(colors):
    s.sendto(bytes([0x02, 2]) + bytes(c for rgb in colors for c in rgb), (IP, PORT))
black = [(0, 0, 0)] * N
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 2
try:
    for rnd in range(rounds):
        f = list(black); f[0] = (255, 0, 0); frame(f); time.sleep(3)
        for i in range(N):
            f = list(black); f[i] = (0, 255, 0)
            t0 = time.time()
            while time.time() - t0 < dur:
                frame(f); time.sleep(0.04)
        frame(black); time.sleep(0.5)
finally:
    frame(black)
