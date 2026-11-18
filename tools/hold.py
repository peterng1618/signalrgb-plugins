"""Write one static frame to the Colorful Z590M LED collection and leave it latched.

No SignalRGB needed, no other HID device touched: only usage page 0xFF01 /
usage 1 is opened, usage page 0xFF00 (firmware) is never matched.

    python tools/hold.py 15:ffffff           slot 15 white, everything else black
    python tools/hold.py 15:ffffff 19:0000ff two slots, distinct colours
    python tools/hold.py                     everything black

Slot numbers are wire order (frame buffer index), not channel LEDs.
"""

import sys

import hid

VID, PID = 0x2F4C, 0x1000
LED_USAGE_PAGE, LED_USAGE = 0xFF01, 1
TOTAL_LEDS = 140
LEDS_PER_PACKET = 20
PACKET_LEN = 65


def find_led_path():
    for info in hid.enumerate(VID, PID):
        if info["usage_page"] == LED_USAGE_PAGE and info["usage"] == LED_USAGE:
            return info["path"]
    raise SystemExit("LED collection not found (usage page 0xFF01 / usage 1)")


def write_frame(dev, buf):
    stride = LEDS_PER_PACKET * 3
    for index in range(TOTAL_LEDS // LEDS_PER_PACKET):
        dev.write([0x00, 0x01, 0x00, 0x88, index] + buf[index * stride:(index + 1) * stride])
    dev.write([0x00, 0x01, 0x00, 0x88, 0xFF] + [0x00] * (PACKET_LEN - 5))


def main():
    buf = [0] * (TOTAL_LEDS * 3)
    for arg in sys.argv[1:]:
        slot_text, hex_text = arg.split(":")
        base = int(slot_text) * 3
        buf[base] = int(hex_text[0:2], 16)
        buf[base + 1] = int(hex_text[2:4], 16)
        buf[base + 2] = int(hex_text[4:6], 16)

    dev = hid.device()
    dev.open_path(find_led_path())
    write_frame(dev, buf)
    dev.close()
    print("held:", ", ".join(sys.argv[1:]) or "all black")


if __name__ == "__main__":
    main()
