"""Генератор PNG-иконок приложения.

Стандартной библиотеки достаточно: PNG собирается вручную из zlib-потока,
поэтому скрипт работает на любой машине без Pillow и без Node.

Запуск:  python tools/make_icons.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent.parent / "assets"

SUPERSAMPLE = 4  # сглаживание скруглений

GRADIENT_TOP = (0x1B, 0x24, 0x40)
GRADIENT_BOTTOM = (0x0F, 0x14, 0x20)

BAR_COLORS = ((0x4C, 0x8D, 0xFF), (0x2E, 0xCC, 0x9B), (0xFF, 0xB0, 0x20))
BAR_HEIGHT_RATIOS = (0.42, 0.68, 1.0)
BAR_WIDTH_RATIO = 0.20

TRANSPARENT, BACKGROUND = 0, 1
FIRST_BAR = 2


def scanline_span(y, x0, y0, x1, y1, radius):
    """Горизонтальный отрезок скруглённого прямоугольника на высоте y."""
    if y < y0 or y > y1:
        return None

    inset = 0.0
    if radius > 0:
        if y < y0 + radius:
            dy = (y0 + radius) - y
        elif y > y1 - radius:
            dy = y - (y1 - radius)
        else:
            dy = 0.0
        if dy > 0:
            inset = radius - math.sqrt(max(radius * radius - dy * dy, 0.0))

    left, right = x0 + inset, x1 - inset
    return None if right <= left else (left, right)


def build_geometry(size, maskable):
    """Фон и три столбца в пикселях итогового размера."""
    padding = size * (0.29 if maskable else 0.20)
    inner = size - 2 * padding
    bar_width = inner * BAR_WIDTH_RATIO
    gap = (inner - 3 * bar_width) / 2
    baseline = size - padding

    background = (
        (0.0, 0.0, float(size), float(size), 0.0)
        if maskable
        else (0.0, 0.0, float(size), float(size), size * 0.234)
    )

    bars = []
    for index, ratio in enumerate(BAR_HEIGHT_RATIOS):
        left = padding + index * (bar_width + gap)
        height = inner * ratio
        bars.append((left, baseline - height, left + bar_width, baseline, bar_width / 2))

    return background, bars


def render(size, maskable):
    """Возвращает список строк RGBA для PNG."""
    background, bars = build_geometry(size, maskable)
    width = size * SUPERSAMPLE
    samples_per_pixel = SUPERSAMPLE * SUPERSAMPLE

    def subrow(sample_y):
        y = (sample_y + 0.5) / SUPERSAMPLE
        row = bytearray(width)

        for value, rect in ((BACKGROUND, background), *enumerate(bars, start=FIRST_BAR)):
            span = scanline_span(y, *rect)
            if span is None:
                continue
            start = max(0, math.ceil(span[0] * SUPERSAMPLE - 0.5))
            end = min(width, math.floor(span[1] * SUPERSAMPLE - 0.5) + 1)
            if end > start:
                row[start:end] = bytes([value]) * (end - start)
        return row

    rows = []
    for y in range(size):
        # Фон — вертикальный градиент, поэтому его цвет зависит от строки.
        mix = y / max(size - 1, 1)
        palette = [
            (0, 0, 0, 0),
            (*(round(top + (bottom - top) * mix) for top, bottom in zip(GRADIENT_TOP, GRADIENT_BOTTOM)), 255),
            *((*color, 255) for color in BAR_COLORS),
        ]

        subrows = [subrow(y * SUPERSAMPLE + offset) for offset in range(SUPERSAMPLE)]
        row = bytearray(size * 4)

        for x in range(size):
            r = g = b = a = 0
            base = x * SUPERSAMPLE
            for sub in subrows:
                for index in sub[base:base + SUPERSAMPLE]:
                    pr, pg, pb, pa = palette[index]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa

            out = x * 4
            if a:
                row[out] = r // a
                row[out + 1] = g // a
                row[out + 2] = b // a
                row[out + 3] = a // samples_per_pixel
        rows.append(row)

    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + bytes(row) for row in rows)

    def chunk(tag, payload):
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    path.write_bytes(png)
    print(f"{path.name}: {size}x{size}, {len(png) / 1024:.1f} КБ")


def main():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-180.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-maskable-512.png", 512, True),
    ]
    for name, size, maskable in targets:
        write_png(ASSETS_DIR / name, size, render(size, maskable))


if __name__ == "__main__":
    main()
