"""Light one L10 port at a time so the physical connector order is visible.

Usage: python tools/jl_port_walk.py [COM4] [seconds_per_port]
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM4"
HOLD = float(sys.argv[2]) if len(sys.argv) > 2 else 4.0
BAUD = 2_000_000
PORTS = 10
LEDS_PER_PORT = 30


def xor8(buf):
    x = 0
    for b in buf:
        x ^= b
    return x


def fill_frame(counts12):
    value = bytes(range(12)) + bytes(counts12)
    return (bytes([0x55, 0x25, 0x22, 0, 0, 0, 0])
            + (len(value) + 1).to_bytes(2, "big") + value + bytes([xor8(value)]))


def color_frame(rgb):
    value = bytes(rgb)
    return (bytes([0x55, 0x25, 0x21, 0, 0, 0])
            + (len(value) + 1).to_bytes(2, "big") + value + bytes([xor8(value)]))


def send(ser, frame, wait=0.4):
    ser.reset_input_buffer()
    ser.write(frame)
    ser.flush()
    end = time.time() + wait
    rx = bytearray()
    while time.time() < end:
        n = ser.in_waiting
        if n:
            rx += ser.read(n)
            end = time.time() + 0.1
        else:
            time.sleep(0.005)
    return bytes(rx)


with serial.Serial(PORT, BAUD, bytesize=8, parity="N", stopbits=1,
                   timeout=0.2, write_timeout=1.0) as ser:
    info = send(ser, bytes([0x55, 0x15, 0x01, 0x00, 0x00]), wait=1.0)
    print(f"handshake rx {info.hex()}")
    send(ser, bytes([0x55, 0x15, 0x03, 0x00, 0x00]))
    counts = [LEDS_PER_PORT] * PORTS + [0] * (12 - PORTS)
    print(f"fill rx {send(ser, fill_frame(counts)).hex()}")
    time.sleep(0.3)

    for p in range(PORTS):
        rgb = [0] * (LEDS_PER_PORT * 3 * PORTS)
        for i in range(LEDS_PER_PORT):
            rgb[(p * LEDS_PER_PORT + i) * 3:(p * LEDS_PER_PORT + i) * 3 + 3] = [255, 255, 255]
        send(ser, color_frame(rgb))
        print(f"PORT {p + 1} lit", flush=True)
        time.sleep(HOLD)

    send(ser, color_frame([0] * (LEDS_PER_PORT * 3 * PORTS)))
    print("off")
