#!/usr/bin/env python3
"""Create a local PNG composition for the QQ image pipeline.

This script is deliberately a narrow file transformation:
- inputs and output are explicit filesystem paths resolved by the bridge;
- supports a base image, optional overlay image, and optional wrapped caption;
- never fetches URLs or executes user-provided text.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True)
    parser.add_argument("--overlay")
    parser.add_argument("--output", required=True)
    parser.add_argument("--text", default="")
    parser.add_argument("--font")
    parser.add_argument("--font-size", type=int, default=48)
    parser.add_argument("--max-side", type=int, default=1600)
    parser.add_argument("--overlay-position", choices=["top-left", "top-right", "bottom-left", "bottom-right", "center"], default="bottom-right")
    parser.add_argument("--overlay-scale", type=float, default=0.28)
    parser.add_argument("--position", choices=["bottom", "top", "center"], default="bottom")
    return parser.parse_args()


def load_font(path: str | None, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        path,
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        r"C:\Windows\Fonts\simhei.ttf",
        r"C:\Windows\Fonts\Deng.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            try:
                return ImageFont.truetype(candidate, max(12, int(size)))
            except OSError:
                pass
    return ImageFont.load_default()


def fit_canvas(image: Image.Image, max_side: int) -> Image.Image:
    if max_side <= 0:
        return image
    width, height = image.size
    scale = min(1.0, max_side / max(width, height))
    if scale >= 1.0:
        return image
    return image.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)


def ensure_min_canvas(image: Image.Image, min_side: int = 320) -> Image.Image:
    """Small source files are still valid images, but unreadable caption boxes are not."""
    if max(image.size) >= min_side:
        return image
    scale = min_side / max(1, max(image.size))
    return image.resize(
        (max(1, int(image.width * scale)), max(1, int(image.height * scale))),
        Image.Resampling.NEAREST,
    )


def place_overlay(base: Image.Image, overlay: Image.Image, position: str, scale: float) -> None:
    scale = min(0.8, max(0.05, scale))
    max_w = int(base.width * 0.55)
    max_h = int(base.height * 0.55)
    overlay.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    # Apply the requested scale after preserving aspect ratio.
    target_w = max(1, int(base.width * scale))
    ratio = min(target_w / overlay.width, max_h / overlay.height)
    if ratio < 1:
        overlay = overlay.resize((max(1, int(overlay.width * ratio)), max(1, int(overlay.height * ratio))), Image.Resampling.LANCZOS)
    margin = max(12, int(min(base.size) * 0.03))
    coords = {
        "top-left": (margin, margin),
        "top-right": (base.width - overlay.width - margin, margin),
        "bottom-left": (margin, base.height - overlay.height - margin),
        "bottom-right": (base.width - overlay.width - margin, base.height - overlay.height - margin),
        "center": ((base.width - overlay.width) // 2, (base.height - overlay.height) // 2),
    }
    x, y = coords[position]
    if overlay.mode != "RGBA":
        overlay = overlay.convert("RGBA")
    base.alpha_composite(overlay, (max(0, x), max(0, y)))


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines() or [""]:
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            probe = current + char
            if current and draw.textlength(probe, font=font) > max_width:
                lines.append(current)
                current = char
            else:
                current = probe
        if current:
            lines.append(current)
    return lines


def draw_caption(base: Image.Image, text: str, font_path: str | None, font_size: int, position: str) -> None:
    if not text:
        return
    draw = ImageDraw.Draw(base, "RGBA")
    font = load_font(font_path, font_size)
    margin = max(18, int(min(base.size) * 0.04))
    max_text_width = max(40, base.width - margin * 2)
    lines = wrap_text(draw, text, font, max_text_width)
    line_height = max(1, int(font.size * 1.35)) if hasattr(font, "size") else font_size + 8
    text_w = max((int(draw.textlength(line, font=font)) for line in lines), default=0)
    text_h = line_height * max(1, len(lines))
    pad_x = max(18, font_size // 2)
    pad_y = max(14, font_size // 3)
    box_w = min(base.width - margin, text_w + pad_x * 2)
    box_h = min(base.height - margin, text_h + pad_y * 2)
    if position == "top":
        x, y = margin, margin
    elif position == "center":
        x, y = (base.width - box_w) // 2, (base.height - box_h) // 2
    else:
        x, y = margin, base.height - box_h - margin
    x = max(0, x)
    y = max(0, min(base.height - box_h, y))

    radius = max(10, min(28, font_size // 2))
    draw.rounded_rectangle((x, y, x + box_w, y + box_h), radius=radius, fill=(16, 18, 22, 205), outline=(255, 255, 255, 40), width=1)
    cursor_y = y + pad_y
    for line in lines:
        draw.text((x + pad_x + 1, cursor_y + 2), line, font=font, fill=(0, 0, 0, 170))
        draw.text((x + pad_x, cursor_y), line, font=font, fill=(255, 255, 255, 245))
        cursor_y += line_height


def main() -> int:
    args = parse_args()
    base_path = Path(args.base).resolve(strict=True)
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(base_path) as opened:
        base = ImageOps.exif_transpose(opened).convert("RGBA")
    base = fit_canvas(base, args.max_side)
    base = ensure_min_canvas(base)

    if args.overlay:
        overlay_path = Path(args.overlay).resolve(strict=True)
        with Image.open(overlay_path) as opened_overlay:
            overlay = ImageOps.exif_transpose(opened_overlay).convert("RGBA")
        place_overlay(base, overlay, args.overlay_position, args.overlay_scale)

    draw_caption(base, args.text, args.font, args.font_size, args.position)
    base.convert("RGB").save(output_path, "PNG", optimize=True)

    data = output_path.read_bytes()
    result = {
        "ok": True,
        "path": str(output_path),
        "bytes": len(data),
        "width": base.width,
        "height": base.height,
        "mimeType": "image/png",
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
