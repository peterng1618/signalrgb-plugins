#!/usr/bin/env python3
"""Pulse DTR on the Jungle Leopard L10 hub to revive a wedged CH340 TX path.

SignalRGB's plugin serial API exposes no setSignals/setDTR, so the plugin cannot
do this itself. Close SignalRGB (it holds the port) before running.

Usage:
    python tools/l10_reset.py COM4
    python tools/l10_reset.py COM4 --hold 0.3 --baud 2000000
    python tools/l10_reset.py COM4 --no-pulse      # handshake only

Exit code 0 when a valid handshake reply is seen after the pulse.
"""
import argparse
import sys
import time

import serial


def handshake(link):
    link.reset_input_buffer()
    link.write(bytes([0x55, 0x15, 0x01, 0x00, 0x00]))
    link.flush()

    deadline = time.time() + 1.5
    buffer = b""

    while time.time() < deadline:
        waiting = link.in_waiting
        buffer += link.read(waiting if waiting else 1)

        at = buffer.find(b"\x55\x04\x02")

        if at >= 0 and len(buffer) - at >= 21:
            info = buffer[at:at + 21]
            uid = info[3:6].hex()
            return f"uid v2_{uid}, {info[14]} ports, firmware 1.{info[17]}"

        time.sleep(0.02)

    return None


def main():
    parser = argparse.ArgumentParser(description="Pulse DTR on the L10 hub, then handshake.")
    parser.add_argument("port", help="COM port, e.g. COM4")
    parser.add_argument("--baud", type=int, default=2_000_000)
    parser.add_argument("--hold", type=float, default=0.3, help="DTR-low time in seconds (default 0.3)")
    parser.add_argument("--no-pulse", action="store_true", help="skip the DTR pulse")
    args = parser.parse_args()

    if not args.no_pulse:
        with serial.Serial(args.port, args.baud, timeout=0.2) as link:
            link.dtr = False
            time.sleep(max(0.05, args.hold))
            link.dtr = True
        time.sleep(0.5)

    with serial.Serial(args.port, args.baud, timeout=0.2, write_timeout=2) as link:
        reply = handshake(link)

    if reply:
        print(reply)
        return 0

    print("no valid handshake reply")
    return 1


if __name__ == "__main__":
    sys.exit(main())
