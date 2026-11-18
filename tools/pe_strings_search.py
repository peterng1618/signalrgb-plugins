"""Read-only byte search in a PE for ASCII / UTF-16LE literals.

Usage: python pe_strings_search.py <exe> <term> [term...]
Prints file offset + 80 bytes of decoded context for each hit.
"""
import sys

def contexts(data, needle, width):
    raw = needle.encode("utf-16-le" if width == 2 else "ascii")
    start = 0
    while True:
        i = data.find(raw, start)
        if i < 0:
            return
        lo = max(0, i - 120)
        hi = min(len(data), i + 260)
        chunk = data[lo:hi]
        if width == 2:
            text = chunk.decode("utf-16-le", errors="replace")
        else:
            text = chunk.decode("ascii", errors="replace")
        text = "".join(c if 32 <= ord(c) < 127 else "." for c in text)
        yield i, text
        start = i + 1

def main():
    path = sys.argv[1]
    terms = sys.argv[2:]
    with open(path, "rb") as f:
        data = f.read()
    for term in terms:
        print(f"=== {term!r} ===")
        hits = 0
        for width in (1, 2):
            for off, text in contexts(data, term, width):
                hits += 1
                print(f"[{width}B] 0x{off:X} {text}")
                if hits >= 40:
                    break
            if hits >= 40:
                break
        if not hits:
            print("(no hits)")

if __name__ == "__main__":
    main()
