"""Prepare whole-frame fighter art for the Godot battle (replaces the cut-up 2D rig).
Sources (already in repo, art by muse):
  web/assets/anim/<id>/       opponent frame sequences (idle/attack/hit/down[/combo]) + anim.json
  web/assets/pose/*.webp      protagonist full poses (700x1004)
  web/assets/opponents_alpha  transparent-background portraits for all opponents
Output: godot/assets/fighters/<id>/..., godot/assets/fighters/portraits/<key>.webp
Run: python prep_fighters.py
"""
import os, json, shutil
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
WEB = os.path.join(ROOT, 'web', 'assets')
OUT = os.path.join(ROOT, 'godot', 'assets', 'fighters')

# protagonist poses: all should face RIGHT (toward the opponent); guard is drawn facing left
MIRROR = {'guard'}
# 帧序列朝向例外（2026-11-21 游戏内逐人目检 dev/facing_check）：伊芙琳 hit 序列原生朝左
FACE_OVERRIDE = {'evelyn': {'hit': -1}}

def clean_floor(im):
    """upper.webp has a white floor smear under the feet: drop near-white opaque pixels in the bottom 12%."""
    a = np.array(im.convert('RGBA'))
    h = a.shape[0]
    y0 = int(h * 0.88)
    reg = a[y0:].astype(np.int32)
    mx = reg[:, :, :3].max(2); mn = reg[:, :, :3].min(2)
    # 地面污迹：偏亮且低饱和（灰白/米色），不碰鞋子（饱和的粉紫色）
    smear = (mn > 170) & ((mx - mn) < 45)
    reg[smear, 3] = 0
    reg = reg.astype(np.uint8)
    a[y0:] = reg
    return Image.fromarray(a)

# 源视频残留的地面色块（深紫色平行四边形）：只在每格底部 14% 内、按颜色剔除
GROUND_PATCH = {('shy', 'hit')}

def clean_ground_patch(path, cell, cols, n):
    im = np.array(Image.open(path).convert('RGBA')).astype(np.int32)
    cw, ch = cell
    removed = 0
    for i in range(n):
        x0, y0 = (i % cols) * cw, (i // cols) * ch
        ys = slice(y0 + int(ch * 0.86), y0 + ch)
        reg = im[ys, x0:x0 + cw]
        r, g, b, a = reg[:, :, 0], reg[:, :, 1], reg[:, :, 2], reg[:, :, 3]
        purple = (a > 0) & (b > r + 12) & (r > g + 8) & (b < 200) & (g < 110)
        reg[purple, 3] = 0
        removed += int(purple.sum())
        im[ys, x0:x0 + cw] = reg
    Image.fromarray(im.astype(np.uint8)).save(path, 'WEBP', quality=92, method=6)
    print('  ground patch removed px:', removed, os.path.basename(path))

def _frames(path, cell, cols, n):
    im = np.array(Image.open(path).convert('RGBA'))
    cw, ch = cell
    return [im[(i // cols) * ch:(i // cols + 1) * ch, (i % cols) * cw:(i % cols + 1) * cw, 3] > 32 for i in range(n)]

def _head_x(a):
    ys, xs = np.where(a)
    if len(ys) == 0: return 0.0
    top = ys.min(); sel = ys < top + (ys.max() - top) * 0.15
    return float(xs[sel].mean())

def detect_facing(dirpath, meta):
    """+1 = drawn facing right, -1 = facing left, per state (auto)."""
    cell, cols = meta['cell'], meta['cols']
    out = {}
    for st, s in meta['states'].items():
        fr = _frames(os.path.join(dirpath, s['file']), cell, cols, s['frames'])
        if st in ('attack', 'combo'):
            # the punching glove grows the silhouette toward the facing side
            def ext(a):
                xs = np.where(a.any(0))[0]; return (xs.min(), xs.max()) if len(xs) else (0, 0)
            l0, r0 = ext(fr[0]); grow_r = max(ext(f)[1] for f in fr) - r0; grow_l = l0 - min(ext(f)[0] for f in fr)
            out[st] = 1 if grow_r >= grow_l else -1
        elif st == 'hit':
            # head is knocked away from the attacker; the attacker is in front
            hx0 = _head_x(fr[0]); dx = [_head_x(f) - hx0 for f in fr[: max(3, len(fr) // 2)]]
            d = max(dx, key=abs)
            out[st] = -1 if d > 0 else 1
        elif st == 'down':
            # falls backward: head ends up behind (opposite to facing)
            a = fr[-1]; ys, xs = np.where(a)
            if len(xs) == 0: out[st] = 1; continue
            head = xs[ys < ys.min() + (ys.max() - ys.min()) * 0.5].mean() if (ys.max() - ys.min()) > 5 else xs.mean()
            left_part = xs[xs < np.median(xs)]
            # compare where the topmost-but-low (head) mass sits: use leftmost/rightmost 20% column density of top half
            w = a.shape[1]
            colsum = a.sum(0); cx = (colsum * np.arange(w)).sum() / max(1, colsum.sum())
            hy_l = a[:, : int(cx)].any(1).nonzero()[0]; hy_r = a[:, int(cx):].any(1).nonzero()[0]
            # head side = side whose silhouette reaches lower rows (lying head on the floor) is ambiguous; use hair/head = side with max height at top
            top_l = hy_l.min() if len(hy_l) else 1e9; top_r = hy_r.min() if len(hy_r) else 1e9
            # legs often kick up (feet higher); the side reaching higher is the legs -> head is the other side
            legs_left = top_l < top_r
            head_left = not legs_left
            out[st] = 1 if head_left else -1
        else:  # idle
            out[st] = 1
    return out

def main():
    os.makedirs(OUT, exist_ok=True)
    # 1) opponent frame sequences
    n_seq = 0
    for cid in sorted(os.listdir(os.path.join(WEB, 'anim'))):
        src = os.path.join(WEB, 'anim', cid)
        if cid.startswith('_') or not os.path.isfile(os.path.join(src, 'anim.json')):
            continue
        dst = os.path.join(OUT, cid); os.makedirs(dst, exist_ok=True)
        for f in os.listdir(src):
            shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
        meta = json.load(open(os.path.join(dst, 'anim.json'), encoding='utf-8'))
        for st, s in meta['states'].items():
            if (cid, st) in GROUND_PATCH:
                clean_ground_patch(os.path.join(dst, s['file']), meta['cell'], meta['cols'], s['frames'])
        # 生产规范（docs/plan/SCHEDULE.md A1）：各状态都是「侧身首帧、视线锁定对手」朝右生成，
        # 倒地头朝远离对手侧。detect_facing 对甩发/冲击特效误判较多，只作诊断输出，实际一律按规范 = 朝右。
        print('  (auto facing diag)', detect_facing(dst, meta))
        face = {st: 1 for st in meta['states']}
        face.update(FACE_OVERRIDE.get(cid, {}))
        for st, v in face.items():
            meta['states'][st]['face'] = v
        json.dump(meta, open(os.path.join(dst, 'anim.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(cid, face)
        n_seq += 1
    # 2) protagonist poses
    dst = os.path.join(OUT, 'me'); os.makedirs(dst, exist_ok=True)
    poses = []
    for f in sorted(os.listdir(os.path.join(WEB, 'pose'))):
        name = os.path.splitext(f)[0]
        im = Image.open(os.path.join(WEB, 'pose', f)).convert('RGBA')
        # upper.webp 是有缺陷的稿（光脚 + 下方 1/5 是不透明的米白底块，和腿同色系无法抠净）：
        # 照常拷贝但游戏里暂不使用（FighterSprite 上勾拳借 hook 姿势 + 上冲位移），已列入给 muse 的重绘需求。
        if name in MIRROR:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        im.save(os.path.join(dst, name + '.webp'), 'WEBP', quality=92, method=6)
        poses.append(name)
    json.dump({'mode': 'poses', 'poses': poses, 'size': [700, 1004]}, open(os.path.join(dst, 'poses.json'), 'w'), indent=1)
    # 3) transparent portraits
    pdst = os.path.join(OUT, 'portraits'); os.makedirs(pdst, exist_ok=True)
    n_p = 0
    for f in os.listdir(os.path.join(WEB, 'opponents_alpha')):
        if f.endswith('.webp'):
            shutil.copy2(os.path.join(WEB, 'opponents_alpha', f), os.path.join(pdst, f)); n_p += 1
    print('sequences', n_seq, 'poses', poses, 'portraits', n_p)

if __name__ == '__main__':
    main()
