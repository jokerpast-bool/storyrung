"""把生成的书封压成可入库的 WebP。

源图：apps/web/public/generated/covers/<slug>.png（本地生成，不入库）
输出：apps/web/public/covers/<slug>.webp（600px 宽，入库）

用法：python apps/web/scripts/pack-covers.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "apps" / "web" / "public" / "generated" / "covers"
DST = ROOT / "apps" / "web" / "public" / "covers"
WIDTH = 600
QUALITY = 82


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC.glob("*.png"))
    total = 0
    for src in files:
        image = Image.open(src).convert("RGB")
        height = round(image.height * WIDTH / image.width)
        image = image.resize((WIDTH, height), Image.LANCZOS)
        out = DST / f"{src.stem}.webp"
        image.save(out, "WEBP", quality=QUALITY, method=6)
        total += out.stat().st_size
    print(f"{len(files)} 张 -> {DST}  (共 {total / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
