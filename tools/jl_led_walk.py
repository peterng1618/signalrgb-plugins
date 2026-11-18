"""Walk one LED at a time on one L10 port to settle its order/direction.

Usage: python tools/jl_led_walk.py [COM4] [port_index_1based] [leds] [delay] [loops]
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM4"
PORT_INDEX = int(sys.argv[2]) if len(sys.argv) > 2 else 2
LEDS = int(sys.argv[3]) if len(sys.argv) > 3 else 24
DELAY = float(sys.argv[4]) if len(sys.argv) > 4 else 0.8
LOOPS = int(sys.argv[5]) if len(sys.argv) > 5 else 2
BAUD = 2_000_000
COUNTS = [0, 0, 0, 0, 0, 24, 16, 16, 0, 0]  # logical: port 6=24, port 7=16, port 8=16
WIRE = [60] * 10  # wire fillCount is always 60 per port; payload is 600 LEDs


def xor8(buf):
    x = 0
    for b in buf:
        x ^= b
    return x


def frame(header, value):
    return bytes(header) + (len(value) + 1).to_bytes(2, "big") + value + bytes([xor8(value)])


def send(ser, data, wait=0.3):
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
    counts = bytes(range(12)) + bytes(WIRE + [0, 0])
    send(ser, frame([0x55, 0x25, 0x22, 0, 0, 0, 0], counts))
    time.sleep(0.3)

    p = PORT_INDEX - 1
    total = sum(WIRE)
    offset = p * 60
    for loop in range(LOOPS):
        for i in range(LEDS):
            rgb = [0] * (total * 3)
            off = (offset + i) * 3
            rgb[off:off + 3] = [255, 255, 255]
            send(ser, frame([0x55, 0x25, 0x21, 0, 0, 0], bytes(rgb)), wait=0.05)
            print(f"loop {loop + 1} port {PORT_INDEX} led {i}", flush=True)
            time.sleep(DELAY)
    send(ser, frame([0x55, 0x25, 0x21, 0, 0, 0], bytes(total * 3)))
    print("off")
