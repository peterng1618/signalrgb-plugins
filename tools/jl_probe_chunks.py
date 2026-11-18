"""Chunk-level probe for the Jungle Leopard L10 ARGB hub (CH340, 1A86:8042).

Logs each serial read chunk separately so multi-frame responses are visible.
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM4"
BAUD = 2_000_000


def drain(ser, seconds=1.0):
    end = time.time() + seconds
    chunks = []
    while time.time() < end:
        n = ser.in_waiting
        if n:
            data = ser.read(n)
            chunks.append((round(time.time() % 1000, 3), data))
            end = time.time() + 0.15  # keep reading while frames keep arriving
        else:
            time.sleep(0.005)
    return chunks


def cmd(ser, label, frame):
    ser.reset_input_buffer()
    time.sleep(0.05)
    ser.write(frame)
    ser.flush()
    print(f"\n{label}: tx={frame.hex()}")
    for ts, data in drain(ser):
        print(f"  rx @{ts}: {len(data):3d} {data.hex()}")


def main():
    with serial.Serial(PORT, BAUD, bytesize=8, parity="N", stopbits=1,
                       timeout=0.2, write_timeout=1.0) as ser:
        print(f"opened {PORT} @ {BAUD} 8N1")
        cmd(ser, "handshake 55 15 01", bytes([0x55, 0x15, 0x01, 0x00, 0x00]))
        cmd(ser, "bindPort  55 15 03", bytes([0x55, 0x15, 0x03, 0x00, 0x00]))


if __name__ == "__main__":
    main()
