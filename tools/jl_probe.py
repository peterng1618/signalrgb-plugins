"""Read-only probe for the Jungle Leopard L10 ARGB hub (CH340, 1A86:8042).

Frames reverse-engineered from the vendor app's device_light.js:
  handshake : 55 15 01 00 00
  bindPort  : 55 15 03 00 00
No firmware/display collection is touched.
"""
import sys
import time

import serial

PORT = sys.argv[1] if len(sys.argv) > 1 else "COM4"
BAUD = 2_000_000

HANDSHAKE = bytes([0x55, 0x15, 0x01, 0x00, 0x00])
BINDPORT = bytes([0x55, 0x15, 0x03, 0x00, 0x00])


def xfer(ser, label, frame, wait=0.8):
    ser.reset_input_buffer()
    ser.write(frame)
    ser.flush()
    deadline = time.time() + wait
    buf = bytearray()
    while time.time() < deadline:
        n = ser.in_waiting
        if n:
            buf += ser.read(n)
            if len(buf) >= 64:
                break
        else:
            time.sleep(0.01)
    print(f"{label}: tx={frame.hex()} rx({len(buf)})={buf.hex()}")
    return bytes(buf)


def parse_info(rx):
    if len(rx) < 18:
        print("  info: short response")
        return
    uid = rx[3:6].hex()
    ports = rx[14] or 12
    region = rx[16]
    ver_minor = rx[17]
    print(f"  uid=v2_{uid} ports={ports} regionByte={region:#04x} version=1.{ver_minor}")


def parse_bind(rx, ports):
    if len(rx) < 15 + ports:
        print("  bind: short response")
        return
    flags = rx[15:15 + ports]
    print(f"  boundPorts={[i for i, f in enumerate(flags) if f == 1]} flags={list(flags)}")


def main():
    with serial.Serial(PORT, BAUD, bytesize=8, parity="N", stopbits=1,
                       timeout=0.2, write_timeout=1.0) as ser:
        print(f"opened {PORT} @ {BAUD} 8N1")
        info = xfer(ser, "handshake", HANDSHAKE)
        parse_info(info)
        bind = xfer(ser, "bindPort", BINDPORT)
        ports = info[14] if len(info) >= 15 and info[14] else 12
        parse_bind(bind, ports)


if __name__ == "__main__":
    main()
