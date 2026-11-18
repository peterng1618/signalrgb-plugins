"""Light every L10 port a different colour so the populated ports are visible.

Usage: python tools/jl_port_colors.py [COM4] [hold_seconds]
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM4"
HOLD = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0
BAUD = 2_000_000
PORTS = 10
LEDS_PER_PORT = 60

PALETTE = [(255, 0, 0), (255, 255, 0), (0, 255, 0), (0, 255, 255), (0, 0, 255),
           (255, 128, 0), (255, 0, 255), (255, 255, 255), (0, 128, 128), (128, 0, 255)]


def xor8(buf):
    x = 0
    for b in buf:
        x ^= b
    return x


def frame(header, value):
    return bytes(header) + (len(value) + 1).to_bytes(2, "big") + value + bytes([xor8(value)])


def send(ser, data, wait=0.4):
    ser.reset_input_buffer()
    ser.write(data)
    ser.flush()
    end = time.time() + wait
    while time.time() < end:
        if ser.in_waiting:
            ser.read(ser.in_waiting)
            end = time.time() + 0.1
        else:
            time.sleep(0.005)


with serial.Serial(PORT, BAUD, bytesize=8, parity="N", stopbits=1,
                   timeout=0.2, write_timeout=1.0) as ser:
    send(ser, bytes([0x55, 0x15, 0x01, 0x00, 0x00]), wait=1.0)
    send(ser, bytes([0x55, 0x15, 0x03, 0x00, 0x00]))
    counts = bytes(range(12)) + bytes([LEDS_PER_PORT] * PORTS + [0] * (12 - PORTS))
    send(ser, frame([0x55, 0x25, 0x22, 0, 0, 0, 0], counts))
    time.sleep(0.3)

    rgb = []
    for p in range(PORTS):
        rgb += list(PALETTE[p]) * LEDS_PER_PORT
    send(ser, frame([0x55, 0x25, 0x21, 0, 0, 0], bytes(rgb)))
    for p in range(PORTS):
        print(f"PORT {p + 1} = RGB{PALETTE[p]}", flush=True)
    print(f"holding {HOLD}s", flush=True)
    time.sleep(HOLD)
    send(ser, frame([0x55, 0x25, 0x21, 0, 0, 0], bytes(LEDS_PER_PORT * PORTS * 3)))
    print("off")
