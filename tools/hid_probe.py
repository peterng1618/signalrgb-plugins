"""Read-only HID probe for VID 04D8 / PID EED2 (Massdrop CTRL).

Enumerates every top-level collection exposed by the keyboard, opens each path
(read/write via hidapi, but never writes), dumps its HID report descriptor and
summarises report IDs and report sizes per collection.

Usage: python tools/hid_probe.py [--json]
"""
import ctypes
import json
import sys

import hid

VID, PID = 0x04D8, 0xEED2

# HID item tags we care about
ITEM_MAIN = 0x0
ITEM_GLOBAL = 0x1


def parse_descriptor(desc):
    """Return list of top-level collections with their report sizes."""
    i = 0
    usage_page = 0
    usage_stack = []
    report_id = 0
    report_size = 0
    report_count = 0
    depth = 0
    collections = []
    current = None
    while i < len(desc):
        prefix = desc[i]
        i += 1
        if prefix == 0xFE:  # long item
            size = desc[i]
            i += 2 + size
            continue
        size = prefix & 0x03
        if size == 3:
            size = 4
        itype = (prefix >> 2) & 0x03
        tag = (prefix >> 4) & 0x0F
        data = desc[i:i + size]
        i += size
        value = int.from_bytes(data, "little") if data else 0
        if itype == ITEM_GLOBAL:
            if tag == 0x0:
                usage_page = value
            elif tag == 0x7:
                report_size = value
            elif tag == 0x8:
                report_id = value
            elif tag == 0x9:
                report_count = value
        elif itype == ITEM_MAIN:
            if tag == 0x8:  # Input
                if current is not None:
                    nbytes = (report_size * report_count + 7) // 8
                    current["reports"].append({
                        "type": "input", "id": report_id, "bytes": nbytes,
                        "usage_page": usage_page, "usage": usage_stack[-1] if usage_stack else None,
                    })
            elif tag == 0x9:  # Output
                if current is not None:
                    nbytes = (report_size * report_count + 7) // 8
                    current["reports"].append({
                        "type": "output", "id": report_id, "bytes": nbytes,
                        "usage_page": usage_page, "usage": usage_stack[-1] if usage_stack else None,
                    })
            elif tag == 0xB:  # Feature
                if current is not None:
                    nbytes = (report_size * report_count + 7) // 8
                    current["reports"].append({
                        "type": "feature", "id": report_id, "bytes": nbytes,
                        "usage_page": usage_page, "usage": usage_stack[-1] if usage_stack else None,
                    })
            elif tag == 0xA:  # Collection
                usage_stack.append(value)
                if depth == 0:
                    current = {
                        "usage_page": usage_page,
                        "usage": value,
                        "reports": [],
                    }
                    collections.append(current)
                depth += 1
            elif tag == 0xC:  # End Collection
                depth -= 1
                if usage_stack:
                    usage_stack.pop()
                if depth == 0:
                    current = None
    return collections


def main():
    out = {"process_admin": bool(ctypes.windll.shell32.IsUserAnAdmin()), "devices": []}
    for d in hid.enumerate(VID, PID):
        rec = {
            "path": d["path"].decode(errors="replace") if isinstance(d["path"], bytes) else d["path"],
            "interface": d["interface_number"],
            "usage_page": d["usage_page"],
            "usage": d["usage"],
            "product": d["product_string"],
            "serial": d["serial_number"],
            "open": None,
            "descriptor_len": None,
            "collections": None,
            "error": None,
        }
        try:
            dev = hid.device()
            dev.open_path(d["path"])
            rec["open"] = "ok"
            try:
                desc = bytes(dev.get_report_descriptor())
                rec["descriptor_len"] = len(desc)
                rec["descriptor_hex"] = desc.hex()
                rec["collections"] = parse_descriptor(desc)
            except Exception as exc:  # noqa: BLE001 - evidence only
                rec["error"] = f"descriptor: {exc!r}"
            dev.close()
        except Exception as exc:  # noqa: BLE001 - evidence only
            rec["open"] = "failed"
            rec["error"] = repr(exc)
        out["devices"].append(rec)

    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
