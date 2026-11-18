"""One-shot probe for the Colorful Z590M LED collection.

Writes a single 140-LED frame, then black. Refuses to touch usage page 0xFF00
(the firmware-update collection).

    python tools/probe.py [RRGGBB] [brightness 0-255]
"""

import sys
import time

import hid

VID, PID = 0x2F4C, 0x1000
LED_USAGE_PAGE, LED_USAGE = 0xFF01, 1
FIRMWARE_USAGE_PAGE = 0xFF00
TOTAL_LEDS = 140
LEDS_PER_PACKET = 20
PACKET_LEN = 65


def find_led_path():
    for info in hid.enumerate(VID, PID):
        if info["usage_page"] == LED_USAGE_PAGE and info["usage"] == LED_USAGE:
            return info["path"]
        if info["usage_page"] == FIRMWARE_USAGE_PAGE:
            continue
    raise SystemExit("LED collection not found (usage page 0xFF01 / usage 1)")


def build(color, count):
    return list(color) * count


def write_frame(dev, leds):
    stride = LEDS_PER_PACKET * 3
    for index in range(TOTAL_LEDS // LEDS_PER_PACKET):
        packet = [0x00, 0x01, 0x00, 0x88, index] + leds[index * stride:(index + 1) * stride]
        dev.write(packet)
    commit = [0x00, 0x01, 0x00, 0x88, 0xFF] + [0x00] * (PACKET_LEN - 5)
    dev.write(commit)


def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else "200000"
    scale = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    color = [int(raw[i:i + 2], 16) * scale // 255 for i in (0, 2, 4)]

    path = find_led_path()
    dev = hid.device()
    dev.open_path(path)
    print("opened", path)
    write_frame(dev, build(color, TOTAL_LEDS))
    print("wrote", color, "to", TOTAL_LEDS, "leds")
    time.sleep(3)
    write_frame(dev, build([0, 0, 0], TOTAL_LEDS))
    print("restored black")
    dev.close()


if __name__ == "__main__":
    main()
