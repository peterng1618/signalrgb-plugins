"""Light exactly one LED on one L10 hub port, for a manual LED-count walk.

Usage: python tools/l10_walk_led.py COM4 <port 1-10> <led 0-59>
       python tools/l10_walk_led.py COM4 <port> off

Wire rules: fillCount is always 60 for all ten ports; the colour payload is always
600 LEDs. Port block start = (port-1)*60. The hub latches the last frame, so the
selected LED stays lit until the next frame is sent.
"""
import sys
import time

import serial

PORT = sys.argv[1]
PORT_NO = int(sys.argv[2])
ARG = sys.argv[3]
BAUD = 2_000_000


def xor8(buf):
    x = 0
    for b in buf:
        x ^= b
    return x


def fill_frame(counts12):
    value = bytes(range(12)) + bytes(counts12)
    return (bytes([0x55, 0x25, 0x22, 0, 0, 0, 0]) + (len(value) + 1).to_bytes(2, "big")
            + value + bytes([xor8(value)]))


def color_frame(rgb):
    value = bytes(rgb)
    return (bytes([0x55, 0x25, 0x21, 0, 0, 0]) + (len(value) + 1).to_bytes(2, "big")
            + value + bytes([xor8(value)]))


def send(ser, frame):
    ser.reset_input_buffer()
    ser.write(frame)
    ser.flush()
    time.sleep(0.35)
    return ser.read(64)


def main():
    if ARG == "off":
        led = None
    else:
        led = int(ARG)
        if not 0 <= led < 60:
            raise SystemExit("led must be 0..59")

    with serial.Serial(PORT, BAUD, bytesize=8, parity="N", stopbits=1,
                       timeout=0.2, write_timeout=1.0) as ser:
        send(ser, bytes([0x55, 0x15, 0x01, 0x00, 0x00]))
        send(ser, fill_frame([60] * 12))
        rgb = [0] * (600 * 3)
        if led is not None:
            base = (PORT_NO - 1) * 60
            i = (base + led) * 3
            rgb[i:i + 3] = [255, 255, 255]
        send(ser, color_frame(rgb))
    print(f"port {PORT_NO} led {ARG} frame sent")


if __name__ == "__main__":
    main()
