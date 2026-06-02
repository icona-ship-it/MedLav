#!/usr/bin/env python3
"""
Estrae il testo da un file Apple Pages (.pages, formato iWork IWA) usando solo la
stdlib: il bundle .pages è uno zip; Index/Document.iwa è una sequenza di blocchi
Snappy (raw) di protobuf. Decomprimiamo i blocchi e recuperiamo i run di testo
leggibili (it/de). Usato da scripts/extract-gold-standards.ts per i benchmark.

USO:  python3 scripts/extract-pages.py <file.pages>   # testo su stdout
"""
import sys
import re
import zipfile


def snappy_decompress(data: bytes) -> bytes:
    pos = 0

    def read_varint() -> int:
        nonlocal pos
        shift = 0
        result = 0
        while True:
            b = data[pos]
            pos += 1
            result |= (b & 0x7F) << shift
            if not (b & 0x80):
                break
            shift += 7
        return result

    read_varint()  # uncompressed length preamble (non serve)
    out = bytearray()
    while pos < len(data):
        tag = data[pos]
        pos += 1
        t = tag & 0x03
        if t == 0:  # literal
            length = tag >> 2
            if length >= 60:
                nbytes = length - 59
                length = int.from_bytes(data[pos:pos + nbytes], "little")
                pos += nbytes
            length += 1
            out += data[pos:pos + length]
            pos += length
        else:
            if t == 1:
                length = 4 + ((tag >> 2) & 0x07)
                offset = ((tag >> 5) << 8) | data[pos]
                pos += 1
            elif t == 2:
                length = 1 + (tag >> 2)
                offset = int.from_bytes(data[pos:pos + 2], "little")
                pos += 2
            else:
                length = 1 + (tag >> 2)
                offset = int.from_bytes(data[pos:pos + 4], "little")
                pos += 4
            start = len(out) - offset
            for i in range(length):
                out.append(out[start + i])
    return bytes(out)


def decode_iwa(raw: bytes) -> bytes:
    out = bytearray()
    pos = 0
    while pos + 4 <= len(raw):
        length = raw[pos + 1] | (raw[pos + 2] << 8) | (raw[pos + 3] << 16)
        pos += 4
        block = raw[pos:pos + length]
        pos += length
        try:
            out += snappy_decompress(block)
        except Exception:
            pass
    return bytes(out)


def extract(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        raw = z.read("Index/Document.iwa")
    text = decode_iwa(raw).decode("utf-8", errors="ignore")
    runs = re.findall(r"[ -~ -ſ‘-‟–—àèéìòùÀÈÉÌÒÙäöüÄÖÜß°]{4,}", text)
    out_lines = []
    for r in runs:
        s = r.strip()
        # tieni i run con almeno una vocale e lunghezza ragionevole; scarta rumore
        if len(s) >= 4 and re.search(r"[aeiouAEIOU]", s) and not re.search(r"iiiii", s):
            out_lines.append(s)
    return "\n".join(out_lines)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("usage: python3 scripts/extract-pages.py <file.pages>\n")
        sys.exit(2)
    sys.stdout.write(extract(sys.argv[1]))
