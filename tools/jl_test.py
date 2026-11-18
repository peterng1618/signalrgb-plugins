"""Controlled color test for the Jungle Leopard L10 ARGB hub.

Frames reverse-engineered from the vendor app (_baseClass/device_light.js):
  fillCount : 55 25 22 00 00 00 00 | len16(value+1) | [0..11, counts12] | xor8(value)
  color     : 55 25 21 00 00 00    | len16(rgb+1)    | rgb bytes         | xor8(rgb)
Payload order is port order; each port gets fillCount[port] * 3 RGB bytes.
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM4"
BAUD = 2_000_000


def xor8(buf):
    x = 0
    for b in buf:
        x ^= b
    return x


def fill_frame(counts12):
    value = bytes(range(12)) + bytes(counts12)
    return (bytes([0x55, 0x25, 0x22, 0, 0, 0, 0]) + value.__len__().__add__(1).to_bytes(2, "big")
            + value + bytes([xor8(value)]))


def color_frame(rgb):
    value = bytes(rgb)
    return (bytes([0x55, 0x25, 0x21, 0, 0, 0]) + len(value).__add__(1).to_bytes(2, "big")
            + value + bytes([xor8(value)]))


def send(ser, label, frame, wait=0.6, quiet=False):
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
    if not quiet:
        print(f"{label}: tx {len(frame)}B  rx {len(rx)}B {bytes(rx).hex()}")
    return bytes(rx)


def main():
    with serial.Serial(PORT, BAUD, bytesize=8, parity="N", stopbits=1,
                       timeout=0.2, write_timeout=1.0) as ser:
        info = send(ser, "handshake", bytes([0x55, 0x15, 0x01, 0x00, 0x00]))
        ports = info[14] if len(info) > 14 and info[14] else 10
        print(f"ports={ports} uid={info[3:6].hex()} version=1.{info[17]}")

        # step 1: one LED, dim red
        send(ser, "fill 1x1", fill_frame([1] + [0] * 11))
        time.sleep(0.2)
        send(ser, "one dim red", color_frame([64, 0, 0]))
        time.sleep(1.0)

        # step 2: port 0, 24 LEDs red
        send(ser, "fill 24p0", fill_frame([24] + [0] * 11))
        time.sleep(0.2)
        send(ser, "port0 red", color_frame([160, 0, 0] * 24))
        time.sleep(1.0)

        # step 3: all 10 ports, 24 LEDs each, distinct colors
        counts = [24] * ports + [0] * (12 - ports)
        send(ser, "fill all24", fill_frame(counts))
        time.sleep(0.2)
        palette = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (0, 255, 255),
                   (255, 0, 255), (255, 128, 0), (128, 0, 255), (0, 128, 255), (255, 255, 255)]
        rgb = []
        for p in range(ports):
            rgb += list(palette[p % len(palette)]) * 24
        send(ser, f"all {ports} ports distinct", color_frame(rgb))
        hold = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
        print(f"holding colors for {hold}s")
        time.sleep(hold)
        send(ser, "off", color_frame([0, 0, 0] * (24 * ports)))


if __name__ == "__main__":
    main()
