#!/usr/bin/env python3
"""Godot 中枢状态图标 4 个（A5）— 与 build_ui_kit.py 同管线同风格（PIL 超采样）。
文件：stat_mood.png（心态）/ stat_influence.png（影响力）/ stat_fatigue.png（疲劳）/ stat_injury.png（伤病）
输出：~/workspace/game/boxing/godot/assets/ui/（128x128，薰衣草徽章底＋紫环，与 attr_*.png 并排一致）
公共绘制函数（badge/glyph_base/star 等）与 build_ui_kit.py 保持同实现，保证风格同源。
"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, os, itertools

OUT = os.path.expanduser("~/workspace/game/boxing/godot/assets/ui")
os.makedirs(OUT, exist_ok=True)

PINK   = (242, 123, 181)
PINK_L = (255, 174, 214)
PURPLE = (123, 75, 181)
DEEP   = (74, 42, 122)
DEEPER = (42, 22, 80)
LAV    = (201, 167, 235)
LAV_L  = (226, 205, 250)
GOLD   = (245, 197, 66)
GOLD_L = (255, 224, 130)
WHITE  = (255, 255, 255)
INK    = (46, 24, 84)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def vgrad(size, top, bot):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bot, y / max(1, h - 1)))
    return img

def overlay(base, draw_fn):
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    base.alpha_composite(layer)
    return base

ISS = 4
ISZ = 128
C = ISZ * ISS // 2

def badge():
    S = ISZ * ISS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    R = 200
    for i in range(24, 0, -1):
        t = i / 24
        col = lerp((255, 240, 252), (196, 160, 235), t)
        rr = R * i // 24
        d.ellipse([C - rr, C - rr, C + rr, C + rr], fill=col + (255,))
    d.ellipse([C - R, C - R, C + R, C + R], outline=PURPLE + (255,), width=9)
    overlay(img, lambda od: od.ellipse([C - R + 14, C - R + 14, C + R - 14, C + R - 14],
                                       outline=(255, 255, 255, 150), width=4))
    overlay(img, lambda od: od.ellipse([C - 120, C - 168, C + 120, C - 58],
                                       fill=(255, 255, 255, 52)))
    return img

def glyph_base(draw_silhouette, grad_top, grad_bot):
    S = ISZ * ISS
    sil = Image.new("L", (S, S), 0)
    draw_silhouette(ImageDraw.Draw(sil), 255)
    grow = Image.new("L", (S, S), 0)
    r = 9
    for dx, dy in itertools.product(range(-r, r + 1, 3), repeat=2):
        if dx * dx + dy * dy <= r * r:
            tmp = Image.new("L", (S, S), 0)
            tmp.paste(sil, (dx, dy))
            grow = ImageChops.lighter(grow, tmp)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    om = Image.new("RGBA", (S, S), INK + (255,))
    out.paste(om, (0, 0), grow)
    grad = vgrad((S, S), grad_top, grad_bot).convert("RGBA")
    out.paste(grad, (0, 0), sil)
    return out

def star(d, cx, cy, r, fill):
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i
        rr = r if i % 2 == 0 else r * 0.40
        pts.append((cx + rr * math.cos(ang - math.pi / 2), cy + rr * math.sin(ang - math.pi / 2)))
    d.polygon(pts, fill=fill)

def finish(img, name):
    img = img.resize((ISZ, ISZ), Image.LANCZOS)
    img.save(os.path.join(OUT, name))

# ---------------------------------------------------------------- 心态 mood：笑脸
def face_sil(d, col, cx=0, cy=0, s=1.0):
    d.ellipse([C + (cx - 104) * s, C + (cy - 104) * s, C + (cx + 104) * s, C + (cy + 104) * s], fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: face_sil(d, col, 0, 2, 1.0), PINK_L, (240, 110, 168)))
d = ImageDraw.Draw(img)
# 闭眼笑弧（^ ^）+ 微笑嘴
for ex in (-46, 46):
    d.arc([C + ex - 26, C - 38, C + ex + 26, C + 14], 180, 360, fill=INK + (255,), width=11)
d.arc([C - 38, C - 6, C + 38, C + 62], 20, 160, fill=INK + (255,), width=11)
for cx in (-72, 72):  # 腮红
    overlay(img, lambda od, cx=cx: od.ellipse([C + cx - 20, C + 16, C + cx + 20, C + 38],
                                              fill=(255, 90, 150, 90)))
d = ImageDraw.Draw(img)
star(d, C + 118, C - 118, 17, GOLD + (255,))
finish(img, "stat_mood.png")

# ---------------------------------------------------------------- 影响力 influence：金星 + 涟漪环
img = badge()
d = ImageDraw.Draw(img)
for r, col, w in [(146, PURPLE + (170,), 9), (112, PINK + (200,), 8)]:
    d.ellipse([C - r, C - r, C + r, C + r], outline=col, width=w)
star(d, C, C, 84, GOLD + (255,))
star(d, C, C, 48, GOLD_L + (255,))
d.ellipse([C - 9, C - 9, C + 9, C + 9], fill=(232, 74, 140, 255))
finish(img, "stat_influence.png")

# ---------------------------------------------------------------- 疲劳 fatigue：低电量电池
def battery_sil(d, col, cx=0, cy=0, s=1.0):
    d.rounded_rectangle([C + (cx - 118) * s, C + (cy - 56) * s, C + (cx + 82) * s, C + (cy + 56) * s],
                        18 * s, fill=col)
    d.rounded_rectangle([C + (cx + 92) * s, C + (cy - 24) * s, C + (cx + 118) * s, C + (cy + 24) * s],
                        8 * s, fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: battery_sil(d, col, -2, 0, 1.0), LAV_L, PURPLE))
d = ImageDraw.Draw(img)
# 内腔 + 三格电量（仅第一格亮粉，其余空）
d.rounded_rectangle([C - 102, C - 40, C + 66, C + 40], 10, fill=(238, 226, 252, 255))
d.rounded_rectangle([C - 94, C - 31, C - 46, C + 31], 7, fill=(232, 74, 140, 255))
for x0 in (-34, 14):
    d.rounded_rectangle([C + x0, C - 31, C + x0 + 44, C + 31], 7, outline=(178, 150, 215, 255), width=5)
# 电池上方一颗下坠小星（电量告急的疲惫感）
star(d, C + 96, C - 108, 15, PURPLE + (200,))
finish(img, "stat_fatigue.png")

# ---------------------------------------------------------------- 伤病 injury：医疗十字 + 绷带点
def cross_sil(d, col, cx=0, cy=0, s=1.0):
    d.rounded_rectangle([C + (cx - 34) * s, C + (cy - 106) * s, C + (cx + 34) * s, C + (cy + 106) * s],
                        14 * s, fill=col)
    d.rounded_rectangle([C + (cx - 106) * s, C + (cy - 34) * s, C + (cx + 106) * s, C + (cy + 34) * s],
                        14 * s, fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: cross_sil(d, col, 0, 0, 1.0), (255, 138, 168), (226, 62, 112)))
d = ImageDraw.Draw(img)
# 绷带质感：横臂两颗小白点 + 中心垫点
for x in (-72, 72):
    d.ellipse([C + x - 9, C - 9, C + x + 9, C + 9], fill=WHITE + (220,))
d.ellipse([C - 11, C - 11, C + 11, C + 11], fill=WHITE + (235,))
finish(img, "stat_injury.png")

print("done:", [f for f in sorted(os.listdir(OUT)) if f.startswith("stat_")])
