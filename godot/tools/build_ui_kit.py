#!/usr/bin/env python3
"""Godot 中枢 UI 素材套 — 程序化绘制（PIL，超采样保证边缘干净）
风格：粉 #f27bb5 / 紫 #7b4bb5 / 深紫 #4a2a7a / 薰衣草，金色仅点缀。
输出：~/workspace/game/boxing/godot/assets/ui/
"""
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, os

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
INK    = (46, 24, 84)      # 描边深紫

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def vgrad(size, top, bot):
    w, h = size
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bot, y / max(1, h - 1)))
    return img

def paste_masked(base, img, mask, box=(0, 0)):
    base.paste(img, box, mask)

def overlay(base, draw_fn):
    """在独立图层上绘制（可含 alpha），再 alpha_composite 回 base——避免 ImageDraw 直接写 alpha 覆盖出洞。"""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    base.alpha_composite(layer)
    return base

# ---------------------------------------------------------------- 按钮（四态）
# 成品 256x96，SS=4 绘制。圆角半径 18（成品），9-slice 建议 24。
BW, BH, BSS = 256, 96, 4
def draw_button(name, top, bot, border, border_w=3, glow=False, stars=True, desat=False):
    W, H = BW * BSS, BH * BSS
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    r = 18 * BSS
    bw = border_w * BSS
    if glow:  # 悬停外发光
        g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(g)
        gd.rounded_rectangle([bw, bw, W - bw, H - bw], r, fill=border + (120,))
        g = g.filter(ImageFilter.GaussianBlur(6 * BSS))
        img.alpha_composite(g)
    d = ImageDraw.Draw(img)
    grad = vgrad((W, H), top, bot).convert("RGBA")
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([bw // 2, bw // 2, W - bw // 2, H - bw // 2], r, fill=255)
    paste_masked(img, grad, mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([bw // 2, bw // 2, W - bw // 2 - 1, H - bw // 2 - 1], r,
                        outline=border + (255,), width=bw)
    # 内侧细线（距边 8px 的薰衣草细框——九宫格安全：只用直边+角弧）
    inset = 8 * BSS
    overlay(img, lambda od: od.rounded_rectangle(
        [inset, inset, W - inset, H - inset], r - 6 * BSS,
        outline=(255, 255, 255, 80), width=max(1, BSS)))
    # 顶部柔光（上 34% 的薄带，独立图层合成，不挖洞）
    def sheen(od):
        od.rounded_rectangle([bw * 2, bw * 2, W - bw * 2, int(H * 0.36)], r - 4 * BSS,
                             fill=(255, 255, 255, 52 if not desat else 20))
    hl = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sheen(ImageDraw.Draw(hl))
    m2 = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m2).rounded_rectangle([bw, bw, W - bw, H - bw], r, fill=255)
    hl.putalpha(ImageChops.multiply(hl.split()[3], m2))
    img.alpha_composite(hl)
    if stars:  # 四角内小星（落在 9-slice 角区内）
        d = ImageDraw.Draw(img)
        for cx, cy in [(16, 16), (BW - 16, 16), (16, BH - 16), (BW - 16, BH - 16)]:
            star(d, cx * BSS, cy * BSS, 7 * BSS, GOLD_L + (255,) if not desat else (200, 200, 210, 200))
    img = img.resize((BW, BH), Image.LANCZOS)
    img.save(os.path.join(OUT, name))

def star(d, cx, cy, r, fill):
    """四角星（闪光星）"""
    pts = []
    for i in range(8):
        ang = math.pi / 4 * i
        rr = r if i % 2 == 0 else r * 0.40
        pts.append((cx + rr * math.cos(ang - math.pi / 2), cy + rr * math.sin(ang - math.pi / 2)))
    d.polygon(pts, fill=fill)

draw_button("btn_normal.png",   (172, 100, 196), (108, 62, 168), LAV)
draw_button("btn_hover.png",    (216, 130, 205), (140, 82, 190), PINK_L, border_w=4, glow=True)
draw_button("btn_pressed.png",  (96, 56, 148), (58, 32, 104), lerp(LAV, DEEP, 0.35), border_w=3)
draw_button("btn_disabled.png", (122, 112, 142), (88, 80, 108), (172, 164, 192), stars=False, desat=True)

# ---------------------------------------------------------------- 面板（9 宫格）
# 成品 256x256，SS=2。半深紫底 + 双层霓虹描边 + 四角星/缎带点。9-slice 建议 36。
PW, PSS = 256, 2
def draw_panel():
    W = PW * PSS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    grad = vgrad((W, W), (52, 30, 96), (36, 19, 68)).convert("RGBA")
    grad.putalpha(242)
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], 20 * PSS, fill=255)
    paste_masked(img, grad, mask)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([1 * PSS, 1 * PSS, W - 2 * PSS, W - 2 * PSS], 20 * PSS,
                        outline=LAV + (255,), width=3 * PSS)
    d.rounded_rectangle([7 * PSS, 7 * PSS, W - 8 * PSS, W - 8 * PSS], 15 * PSS,
                        outline=PINK + (200,), width=1 * PSS + 1)
    # 四角：金色小星 + 缎带点（全部落在 36px 角区内）
    for cx, cy in [(20, 20), (PW - 20, 20), (20, PW - 20), (PW - 20, PW - 20)]:
        star(d, cx * PSS, cy * PSS, 7 * PSS, GOLD + (255,))
        d.ellipse([(cx - 2.6) * PSS, (cy - 2.6) * PSS, (cx + 2.6) * PSS, (cy + 2.6) * PSS],
                  fill=DEEPER + (255,))
    # 边中点小菱形点缀（在直边中段，拉伸时位于边区中央，不变形）
    for cx, cy in [(PW // 2, 4), (PW // 2, PW - 4), (4, PW // 2), (PW - 4, PW // 2)]:
        s = 3.4 * PSS
        d.polygon([(cx * PSS, cy * PSS - s), (cx * PSS + s, cy * PSS),
                   (cx * PSS, cy * PSS + s), (cx * PSS - s, cy * PSS)], fill=PINK_L + (230,))
    img = img.resize((PW, PW), Image.LANCZOS)
    img.save(os.path.join(OUT, "panel.png"))
draw_panel()

# ---------------------------------------------------------------- 图标公共
ISS = 4            # 图标超采样
ISZ = 128          # 成品尺寸
C = ISZ * ISS // 2 # 画布中心（512 画布）

def badge():
    """统一徽章底：薰衣草径向盘 + 紫环 + 顶部高光"""
    S = ISZ * ISS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    R = 200
    # 径向感：多层同心圆由外浅到内亮
    for i in range(24, 0, -1):
        t = i / 24
        col = lerp((255, 240, 252), (196, 160, 235), t)
        rr = R * i // 24
        d.ellipse([C - rr, C - rr, C + rr, C + rr], fill=col + (255,))
    d.ellipse([C - R, C - R, C + R, C + R], outline=PURPLE + (255,), width=9)
    overlay(img, lambda od: od.ellipse([C - R + 14, C - R + 14, C + R - 14, C + R - 14],
                                       outline=(255, 255, 255, 150), width=4))
    overlay(img, lambda od: od.ellipse([C - 120, C - 168, C + 120, C - 58],
                                       fill=(255, 255, 255, 52)))  # 顶部 sheen
    return img

def outlined(draw_fn, grow, outline_col=INK):
    """先以放大版画描边层，再画本体。draw_fn(d, scale) 以中心为原点按 scale 绘制填充形状。"""
    layer = Image.new("RGBA", (ISZ * ISS, ISZ * ISS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_fn(d, 1.0 + grow, outline_col + (255,))
    return layer

def glyph_base(draw_silhouette, grad_top, grad_bot):
    """draw_silhouette(d, col) 在给定图层上以 col 画实心剪影；返回带描边的渐变字形层。"""
    S = ISZ * ISS
    sil = Image.new("L", (S, S), 0)
    draw_silhouette(ImageDraw.Draw(sil), 255)
    grow = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(grow)
    # 膨胀：多次偏移叠画近似描边
    import itertools
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

def finish(img, name):
    img = img.resize((ISZ, ISZ), Image.LANCZOS)
    img.save(os.path.join(OUT, name))

# ---- 拳套剪影（正面，经典圆润连指）：以中心为原点，参数 s=缩放
def glove_sil(d, col, cx=0, cy=0, s=1.0, cuff=True):
    def E(x0, y0, x1, y1):
        d.ellipse([C + (cx + x0) * s, C + (cy + y0) * s, C + (cx + x1) * s, C + (cy + y1) * s], fill=col)
    def RR(x0, y0, x1, y1, r):
        d.rounded_rectangle([C + (cx + x0) * s, C + (cy + y0) * s, C + (cx + x1) * s, C + (cy + y1) * s],
                            r * s, fill=col)
    E(-86, -124, 92, 58)          # 主体
    E(-112, 4, -30, 70)           # 拇指（贴体、低位）
    E(-70, 20, 40, 84)            # 掌根过渡，避免拇指与主体间凹陷
    if cuff:
        RR(-88, 48, 88, 128, 16)  # 腕口

def glove_full(cx=0, cy=0, s=1.0, body=((250, 150, 200), (222, 80, 146)), cuff_col=DEEP):
    """完整拳套层：描边+渐变主体+腕口+高光+系带"""
    S = ISZ * ISS
    layer = glyph_base(lambda d, col: glove_sil(d, col, cx, cy, s), body[0], body[1])
    d = ImageDraw.Draw(layer)
    # 腕口覆盖（深紫）+ 金线 + 系带点
    d.rounded_rectangle([C + (cx - 86) * s, C + (cy + 52) * s, C + (cx + 86) * s, C + (cy + 126) * s],
                        15 * s, fill=cuff_col + (255,))
    d.rectangle([C + (cx - 86) * s, C + (cy + 52) * s, C + (cx + 86) * s, C + (cy + 63) * s],
                fill=GOLD + (255,))
    for i in range(4):
        x = (cx - 48 + i * 32) * s
        d.ellipse([C + x - 5 * s, C + (cy + 82) * s, C + x + 5 * s, C + (cy + 92) * s], fill=LAV_L + (255,))
    # 主体高光（独立图层按剪影裁剪后 alpha 合成，不覆盖本体 alpha）
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse([C + (cx - 66) * s, C + (cy - 102) * s, C + (cx - 2) * s, C + (cy - 30) * s],
                               fill=(255, 255, 255, 88))
    sil = Image.new("L", (S, S), 0)
    glove_sil(ImageDraw.Draw(sil), 255, cx, cy, s, cuff=False)
    hl.putalpha(ImageChops.multiply(hl.split()[3], sil))
    layer.alpha_composite(hl)
    # 拇指分界缝线（左側小弧，暗示拇指与主体的分界）
    overlay(layer, lambda od: od.arc(
        [C + (cx - 96) * s, C + (cy - 26) * s, C + (cx - 6) * s, C + (cy + 62) * s],
        start=96, end=196, fill=INK + (110,), width=max(2, int(5 * s))))
    return layer

def compose(glyph_layer, name, bg=True):
    img = badge() if bg else Image.new("RGBA", (ISZ * ISS, ISZ * ISS), (0, 0, 0, 0))
    img.alpha_composite(glyph_layer)
    finish(img, name)

# ---------------------------------------------------------------- 属性图标
# 1 力量 power：大拳套
img = badge(); img.alpha_composite(glove_full(0, -6, 0.92))
d = ImageDraw.Draw(img)
star(d, C - 148, C - 130, 20, GOLD + (255,)); star(d, C + 152, C - 96, 15, GOLD_L + (255,))
finish(img, "attr_power.png")

# 2 耐久 endurance：心 + 心电线（呼应标题《心跳在左》）
def heart_sil(d, col, cx=0, cy=0, s=1.0):
    d.ellipse([C + (cx - 92) * s, C + (cy - 88) * s, C + (cx + 2) * s, C + (cy + 6) * s], fill=col)
    d.ellipse([C + (cx - 2) * s, C + (cy - 88) * s, C + (cx + 92) * s, C + (cy + 6) * s], fill=col)
    d.polygon([(C + (cx - 88) * s, C + (cy - 18) * s), (C + (cx + 88) * s, C + (cy - 18) * s),
               (C + cx * s, C + (cy + 108) * s)], fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: heart_sil(d, col, 0, -4, 0.95), PINK_L, (232, 74, 140)))
d = ImageDraw.Draw(img)
pts = [(-120, 6), (-58, 6), (-34, -34), (-6, 34), (14, 6), (120, 6)]
d.line([(C + x * 0.95, C + y * 0.95 - 4) for x, y in pts], fill=WHITE + (255,), width=13, joint="curve")
finish(img, "attr_endurance.png")

# 3 意志 will：火焰
def flame_sil(d, col, cx=0, cy=0, s=1.0):
    pts = [(0, -125), (34, -58), (66, -18), (84, 34), (70, 84), (36, 116), (0, 126),
           (-36, 116), (-70, 84), (-84, 34), (-64, -22), (-38, -52), (-30, -92), (-8, -66)]
    d.polygon([(C + (cx + x) * s, C + (cy + y) * s) for x, y in pts], fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: flame_sil(d, col, 0, 2, 0.95), (255, 138, 92), (236, 64, 122)))
img.alpha_composite(glyph_base(lambda d, col: flame_sil(d, col, 0, 42, 0.52), GOLD_L, GOLD))
finish(img, "attr_will.png")

# 4 出拳速度 speed：闪电 + 速度线
def bolt_sil(d, col, cx=0, cy=0, s=1.0):
    pts = [(28, -128), (-52, 8), (-2, 8), (-30, 128), (62, -22), (10, -22)]
    d.polygon([(C + (cx + x) * s, C + (cy + y) * s) for x, y in pts], fill=col)
img = badge()
d = ImageDraw.Draw(img)
for i, yy in enumerate([-58, 2, 62]):
    x0 = -168 + i * 14
    d.line([(C + x0, C + yy), (C - 66, C + yy)], fill=PURPLE + (200,), width=11)
img.alpha_composite(glyph_base(lambda d2, col: bolt_sil(d2, col, 22, 0, 0.95), GOLD_L, (245, 158, 40)))
finish(img, "attr_speed.png")

# 5 精准度 accuracy：靶心 + 十字刻度
img = badge(); d = ImageDraw.Draw(img)
for r, col in [(118, PURPLE), (88, WHITE), (58, PINK), (28, WHITE)]:
    d.ellipse([C - r, C - r, C + r, C + r], fill=col + (255,), outline=INK + (255,), width=5 if r == 118 else 0)
d.ellipse([C - 13, C - 13, C + 13, C + 13], fill=(232, 74, 140, 255))
for ang in (0, 90, 180, 270):
    x = math.cos(math.radians(ang)); y = math.sin(math.radians(ang))
    d.line([(C + x * 126, C + y * 126), (C + x * 150, C + y * 150)], fill=INK + (255,), width=12)
finish(img, "attr_accuracy.png")

# 6 步伐速度 footwork：拳击鞋 + 弧线步迹
def shoe_sil(d, col, cx=0, cy=0, s=1.0):
    pts = [(-118, 62), (-118, -78), (-58, -92), (-30, -30), (28, 6), (86, 26), (116, 44), (116, 62)]
    d.polygon([(C + (cx + x) * s, C + (cy + y) * s) for x, y in pts], fill=col)
    d.rounded_rectangle([C + (cx - 122) * s, C + (cy + 58) * s, C + (cx + 122) * s, C + (cy + 88) * s],
                        12 * s, fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: shoe_sil(d, col, 2, -16, 1.0), LAV_L, PURPLE))
d = ImageDraw.Draw(img)
d.rectangle([C - 118, C + 40, C + 120, C + 53], fill=GOLD + (255,))       # 鞋底金线
for i in range(3):                                                          # 鞋带
    y = -62 + i * 30
    d.line([(C - 68, C + y), (C - 30, C + y + 14)], fill=WHITE + (230,), width=9)
for ax, ay in [(-128, 116), (-52, 130), (28, 138)]:                         # 鞋下步迹弧
    d.arc([C + ax - 40, C + ay - 22, C + ax + 40, C + ay + 22], 190, 320, fill=PINK + (230,), width=9)
finish(img, "attr_footwork.png")

# 7 防守技术 defense：盾 + 金星
def shield_sil(d, col, cx=0, cy=0, s=1.0):
    pts = [(0, 122), (-84, 74), (-100, 6), (-100, -84), (-52, -102), (0, -116),
           (52, -102), (100, -84), (100, 6), (84, 74)]
    d.polygon([(C + (cx + x) * s, C + (cy + y) * s) for x, y in pts], fill=col)
img = badge()
img.alpha_composite(glyph_base(lambda d, col: shield_sil(d, col, 0, 0, 0.98), lerp(PURPLE, PINK, 0.35), DEEP))
d = ImageDraw.Draw(img)
star(d, C, C - 8, 86, GOLD + (255,))
star(d, C, C - 8, 50, GOLD_L + (255,))
finish(img, "attr_defense.png")

# 8 技术 technique：齿轮 + 星心
def gear_sil(d, col, cx=0, cy=0, s=1.0, teeth=8, r_out=112, r_in=84):
    pts = []
    for i in range(teeth * 4):
        ang = math.pi * 2 * i / (teeth * 4)
        r = r_out if (i % 4) in (0, 1) else r_in
        pts.append((C + (cx + r * math.cos(ang)) * s, C + (cy + r * math.sin(ang)) * s))
    d.polygon(pts, fill=col)
    d.ellipse([C + (cx - 40) * s, C + (cy - 40) * s, C + (cx + 40) * s, C + (cy + 40) * s], fill=0)
img = badge()
g = glyph_base(lambda d, col: gear_sil(d, col, 0, 0, 0.95), LAV, PURPLE)
# 齿轮中心挖空处补徽章底色 + 金星
d = ImageDraw.Draw(g)
d.ellipse([C - 38, C - 38, C + 38, C + 38], fill=(238, 226, 252, 255), outline=INK + (255,), width=6)
img.alpha_composite(g)
d = ImageDraw.Draw(img)
star(d, C, C, 30, (232, 74, 140, 255))
finish(img, "attr_technique.png")

# ---------------------------------------------------------------- 拳种图标
TRAJ = (238, 164, 40)  # 轨迹线用深金，在薰衣草底上对比更足
def traj_line(pts, width=15, col=TRAJ, dash=None):
    layer = Image.new("RGBA", (ISZ * ISS, ISZ * ISS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    P = [(C + x, C + y) for x, y in pts]
    if dash:
        # 按折线分段虚线
        import itertools
        segs = []
        for a, b in zip(P, P[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L // dash))
            for i in range(n):
                if i % 2 == 0:
                    t0, t1 = i / n, min(1, (i + 0.72) / n)
                    segs.append(((a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                                 (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)))
        for a, b in segs:
            d.line([a, b], fill=col + (255,), width=width)
    else:
        d.line(P, fill=col + (255,), width=width, joint="curve")
        for p in P:
            d.ellipse([p[0] - width // 2, p[1] - width // 2, p[0] + width // 2, p[1] + width // 2],
                      fill=col + (255,))
    return layer

def burst(cx, cy, r=44, col=PINK):
    layer = Image.new("RGBA", (ISZ * ISS, ISZ * ISS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    star(d, C + cx, C + cy, r, col + (255,))
    star(d, C + cx, C + cy, r * 0.55, WHITE + (255,))
    return layer

# 刺拳 jab：短促虚线直轨 + 拳
img = badge()
img.alpha_composite(traj_line([(-172, 8), (2, 8)], width=15, dash=46))
img.alpha_composite(glove_full(100, 2, 0.64))
finish(img, "punch_jab.png")

# 直拳 straight：长实线直轨 + 命中星爆 + 大拳
img = badge()
img.alpha_composite(traj_line([(-174, 4), (-16, 4)], width=19))
img.alpha_composite(burst(30, 2, 42))
img.alpha_composite(glove_full(108, -2, 0.74))
finish(img, "punch_straight.png")

# 摆拳 hook：大弧线横扫轨
img = badge()
arc = Image.new("RGBA", (ISZ * ISS, ISZ * ISS), (0, 0, 0, 0))
ImageDraw.Draw(arc).arc([C - 182, C - 154, C + 146, C + 170], start=95, end=336,
                        fill=TRAJ + (255,), width=18)
img.alpha_composite(arc)
img.alpha_composite(glove_full(98, -58, 0.68))
finish(img, "punch_hook.png")

# 上勾拳 upper：贝塞尔上挑轨（自左下兜起、向右上挑）
def bezier_pts(p0, p1, p2, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        pts.append((x, y))
    return pts
img = badge()
img.alpha_composite(traj_line(bezier_pts((-128, 128), (-118, -36), (26, -92)), width=17))
img.alpha_composite(burst(44, -88, 34))
img.alpha_composite(glove_full(66, -80, 0.66))
finish(img, "punch_upper.png")

# 击腹 body：躯干（斜肩）+ 腹部靶环 + 斜下轨，拳停在躯干左侧不遮靶
img = badge()
torso = Image.new("RGBA", (ISZ * ISS, ISZ * ISS), (0, 0, 0, 0))
td = ImageDraw.Draw(torso)
tcx, tcy = 95, 6
shape = [(38, -104), (84, -124), (132, -102), (148, -20), (142, 124), (58, 124), (44, 14)]
td.polygon([(C + tcx + (x - tcx) * 1.06, C + tcy + (y - tcy) * 1.04) for x, y in shape], fill=INK + (255,))
td.polygon([(C + x, C + y) for x, y in shape], fill=(255, 205, 230, 255))
td.arc([C + 60, C + 34, C + 138, C + 84], 15, 165, fill=PURPLE + (255,), width=6)  # 腰线
img.alpha_composite(torso)
d = ImageDraw.Draw(img)
d.ellipse([C + 67, C + 18, C + 123, C + 74], outline=(232, 74, 140, 255), width=9)  # 腹部靶环
d.ellipse([C + 86, C + 37, C + 104, C + 55], fill=(232, 74, 140, 255))
img.alpha_composite(traj_line([(-174, -58), (-62, -2)], width=16))
img.alpha_composite(burst(-28, 12, 34))
img.alpha_composite(glove_full(2, 14, 0.60))
finish(img, "punch_body.png")

print("done:", sorted(os.listdir(OUT)))
