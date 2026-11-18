"""Post-flash check: proves the CTRL exposes QMK raw HID and answers the
SignalRGB protocol queries the shipped plugin uses.

Usage: python tools/verify-after-flash.py
Exit code 0 = raw HID present and every query answered; 1 = not (prints why).

Read-only: sends only the identity queries (0x28, 0x21, 0x22, 0x23, 0x27).
It never sends 0x24/0x25/0x26, so keyboard lighting is not changed.
"""
import sys

import hid

VID, PID = 0x04D8, 0xEED2
REPORT = 32
QUERIES = {
    0x28: "firmware type",
    0x21: "qmk version",
    0x22: "signalrgb protocol version",
    0x23: "unique id",
    0x27: "led count",
}


def find_raw_hid():
    for d in hid.enumerate(VID, PID):
        if d["usage_page"] == 0xFF60 and d["usage"] == 0x61:
            return d
    return None


def query(dev, cmd):
    dev.write(bytes([0x00, cmd] + [0] * (REPORT - 2)))
    reply = dev.read(REPORT, 250)
    assert reply, f"no reply to 0x{cmd:02X}"
    # hidapi drops the report-ID byte: the reply starts at the command byte.
    body = reply[2:] if reply[1] == cmd else reply[1:]
    assert reply[0] == cmd or reply[1] == cmd, f"reply to 0x{cmd:02X} has command {reply[0]:#x}/{reply[1]:#x}"
    return body


def main():
    targets = [d for d in hid.enumerate(VID, PID)]
    print(f"collections: {[(d['interface_number'], hex(d['usage_page']), hex(d['usage'])) for d in targets]}")
    dev_info = find_raw_hid()
    if dev_info is None:
        print("FAIL: no raw HID collection (usage page 0xFF60, usage 0x61)")
        return 1

    dev = hid.device()
    dev.open_path(dev_info["path"])
    ok = True
    try:
        for cmd, name in QUERIES.items():
            data = query(dev, cmd)
            if cmd == 0x21:
                print(f"{name}: {data[0]}.{data[1]}.{data[2]}")
            elif cmd == 0x22:
                print(f"{name}: {data[0]}.{data[1]}.{data[2]}")
            else:
                print(f"{name}: {bytes(data[:4]).hex()}")
        fw = query(dev, 0x28)
        assert fw[0] in (1, 2), f"unexpected firmware type {fw[0]}"
    except Exception as exc:  # noqa: BLE001 - report the failure
        print(f"FAIL: {exc!r}")
        ok = False
    finally:
        dev.close()
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
