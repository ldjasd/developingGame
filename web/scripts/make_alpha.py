#!/usr/bin/env python3
"""呈现框架重构·一期素材：立绘/对手图程序化去底（米色平底 → 透明）。

姿势图与对手图均为不透明米色平底（约 #fdf4f0）矩形图。做法（非破坏、脚本可复现）：
  1) 估计背景候选色：与四边中位色距离近，或低饱和且高明度 → 背景候选掩膜；
  2) binary_propagation：只保留与画面边框连通的候选像素为真背景（角色内部的浅色不误伤）；
  3) 背景腐蚀 1px 去米色描边，alpha 高斯羽化 0.9。
输出：姿势图同名覆盖 assets/pose/*.webp（战斗/冒烟按原路径引用，透明版直接生效）；
      对手图另存 assets/opponents_alpha/*.webp（名鉴/剧情仍用原图，战斗由代码映射）。
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

WEB = Path(__file__).resolve().parent.parent


def alpha_of(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.int32)
    h, w, _ = a.shape
    border = np.concatenate([a[0, :, :], a[-1, :, :], a[:, 0, :], a[:, -1, :]]).reshape(-1, 3)
    med = np.median(border, axis=0)
    dist = np.sqrt(((a - med) ** 2).sum(axis=2))
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    sat = mx - mn
    cand = (dist < 42) | ((sat < 30) & (mn > 185) & (dist < 90))
    seed = np.zeros_like(cand)
    seed[0, :] = cand[0, :]
    seed[-1, :] = cand[-1, :]
    seed[:, 0] = cand[:, 0]
    seed[:, -1] = cand[:, -1]
    bg = ndimage.binary_propagation(seed, mask=cand)
    # border_value=1：画外视为背景，否则图像最外一圈会被误蚀成不透明矩形框
    bg = ndimage.binary_erosion(bg, iterations=1, border_value=1)
    alpha = np.where(bg, 0.0, 255.0)
    alpha = ndimage.gaussian_filter(alpha, 0.9)
    out = img.convert("RGBA")
    out.putalpha(Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8)))
    return out


def run(src: Path, dst: Path) -> tuple[int, float]:
    img = Image.open(src)
    out = alpha_of(img)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "WEBP", quality=90, method=6)
    al = np.asarray(out)[:, :, 3]
    return (al > 10).sum(), float((al > 10).mean())


def main() -> None:
    only = sys.argv[1:] or None
    jobs: list[tuple[Path, Path]] = []
    for p in sorted((WEB / "assets/pose").glob("*.webp")):
        jobs.append((p, p))  # 姿势：同路径覆盖（原图不在 dist 中另行保留，源图在 assets 上层目录有备份）
    for p in sorted((WEB / "assets/opponents").glob("*.webp")):
        jobs.append((p, WEB / "assets/opponents_alpha" / p.name))
    if only:
        jobs = [j for j in jobs if any(k in j[0].name for k in only)]
    for src, dst in jobs:
        px, ratio = run(src, dst)
        print(f"{src.name}: opaque {px}px ({ratio:.1%}) -> {dst.relative_to(WEB)}")


if __name__ == "__main__":
    main()
