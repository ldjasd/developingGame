#!/usr/bin/env python3
"""对手侧面图预处理 v2：纯色背景色键抠图 -> 带 alpha 的 PNG；
关节点逐人手放（看带网格的图定的位），部件多边形按「最近关节锚定 +
本地骨长比例缩放」从主角模板映射——站姿差异大时也贴合各自骨架。
输出 godot/data/rig_params.json（主角 me + 全部对手）。

主角基准关节点/部件与 fighter_rig.gd 的 PART_DEFS 保持一致。
"""
import json
import math
import os
from PIL import Image
import numpy as np

BASE = os.path.expanduser("~/workspace/game/boxing")
OUT_DIR = os.path.join(BASE, "godot/assets/parts/opp")
os.makedirs(OUT_DIR, exist_ok=True)

ME_JOINTS = {
    "root": (340, 545), "spine": (345, 430), "head": (355, 295),
    "shN": (392, 332), "elN": (343, 443), "wrN": (265, 335),
    "shF": (330, 322), "elF": (252, 418), "wrF": (185, 315),
    "hipN": (330, 560), "kneeN": (255, 665), "ankN": (190, 875),
    "hipF": (362, 572), "kneeF": (390, 715), "ankF": (510, 845),
    "head_top": (383, 195),
}
# 每个关节的「本地尺度」取哪条骨段长度之比
SEG_OF_JOINT = {
    "root": ("root", "spine"), "spine": ("spine", "head"),
    "head": ("head", "head_top"), "head_top": ("head", "head_top"),
    "shN": ("shN", "elN"), "elN": ("elN", "wrN"), "wrN": ("elN", "wrN"),
    "shF": ("shF", "elF"), "elF": ("elF", "wrF"), "wrF": ("elF", "wrF"),
    "hipN": ("hipN", "kneeN"), "kneeN": ("kneeN", "ankN"), "ankN": ("kneeN", "ankN"),
    "hipF": ("hipF", "kneeF"), "kneeF": ("kneeF", "ankF"), "ankF": ("kneeF", "ankF"),
}
ME_PARTS = [
    ("legFarShin", 0, [(345, 675), (565, 695), (595, 835), (565, 905), (375, 885), (335, 770)], [("ShinFar", 115), ("ThighFar", 90)], []),
    ("legFarThigh", 1, [(315, 535), (465, 545), (475, 685), (425, 765), (325, 725), (305, 620)], [("ThighFar", 120), ("Root", 95)], []),
    ("armFarUpper", 2, [(235, 275), (370, 275), (382, 390), (330, 475), (228, 465), (195, 370)], [("UpperArmFar", 105), ("Spine", 75)], []),
    ("armFarFore", 3, [(130, 250), (300, 245), (312, 350), (292, 445), (168, 455), (125, 355)], [("ForeArmFar", 110), ("UpperArmFar", 85)], [(240, 240, 80, 42)]),
    ("legNearThigh", 4, [(255, 515), (425, 525), (435, 645), (345, 725), (225, 695), (215, 590)], [("ThighNear", 125), ("Root", 95)], []),
    ("legNearShin", 5, [(135, 635), (335, 645), (345, 805), (315, 935), (145, 935), (125, 780)], [("ShinNear", 120), ("ThighNear", 90)], []),
    ("torso", 6, [(325, 285), (475, 285), (495, 430), (505, 570), (490, 665), (315, 665), (290, 545), (300, 400)], [("Spine", 150), ("Root", 140)], []),
    ("head", 7, [(232, 118), (298, 18), (450, 0), (585, 25), (645, 110), (640, 235), (575, 320), (480, 355), (395, 342), (298, 322), (222, 232)], [("Head", 175), ("Spine", 85)], []),
    ("armNearUpper", 8, [(338, 285), (462, 295), (472, 430), (430, 505), (338, 485), (315, 385)], [("UpperArmNear", 105), ("Spine", 75)], [(330, 280, 70, 54)]),
    ("armNearFore", 9, [(195, 245), (382, 255), (402, 368), (382, 485), (248, 495), (195, 380)], [("ForeArmNear", 115), ("UpperArmNear", 85)], [(232, 242, 102, 60), (313, 246, 94, 46), (366, 292, 44, 44)]),
]

OPPONENTS = {
    "evelyn": "assets/pose_src_pilot/evelyn_guard_side_ring.webp",
    "champion_domestic": "assets/pose_src_batch/champion_domestic_ring_guard_side.webp",
    "rookie": "assets/pose_src_batch/rookie_ring_guard_side.webp",
    "shy": "assets/pose_src_batch/shy_ring_guard_side.webp",
    "pocket": "assets/pose_src_batch/pocket_ring_guard_side.webp",
    "braid": "assets/pose_src_batch/braid_ring_guard_side.webp",
    "brick": "assets/pose_src_batch/brick_ring_guard_side.webp",
}

# 逐人手放关节点（1328x1904 坐标，看网格图定的位；QA 截图后可在此修）
HAND_JOINTS = {
    "evelyn": {
        "root": (640, 810), "spine": (655, 580), "head": (650, 330), "head_top": (700, 140),
        "shN": (735, 395), "elN": (700, 605), "wrN": (650, 520),
        "shF": (570, 430), "elF": (475, 565), "wrF": (345, 385),
        "hipN": (565, 1015), "kneeN": (540, 1330), "ankN": (395, 1615),
        "hipF": (695, 1025), "kneeF": (745, 1345), "ankF": (820, 1625),
    },
    "champion_domestic": {
        "root": (760, 860), "spine": (790, 600), "head": (830, 330), "head_top": (880, 150),
        "shN": (660, 470), "elN": (720, 640), "wrN": (775, 535),
        "shF": (880, 470), "elF": (920, 620), "wrF": (985, 515),
        "hipN": (738, 1080), "kneeN": (748, 1380), "ankN": (883, 1620),
        "hipF": (608, 1090), "kneeF": (503, 1395), "ankF": (453, 1645),
    },
    "rookie": {
        "root": (615, 905), "spine": (655, 620), "head": (700, 330), "head_top": (755, 150),
        "shN": (575, 475), "elN": (635, 720), "wrN": (695, 575),
        "shF": (785, 505), "elF": (835, 705), "wrF": (870, 575),
        "hipN": (515, 1085), "kneeN": (455, 1335), "ankN": (295, 1600),
        "hipF": (675, 1095), "kneeF": (795, 1305), "ankF": (965, 1625),
    },
    "shy": {
        "root": (660, 950), "spine": (700, 700), "head": (740, 450), "head_top": (790, 270),
        "shN": (590, 560), "elN": (640, 770), "wrN": (715, 660),
        "shF": (790, 580), "elF": (840, 750), "wrF": (870, 640),
        "hipN": (540, 1130), "kneeN": (480, 1390), "ankN": (330, 1580),
        "hipF": (690, 1140), "kneeF": (810, 1360), "ankF": (890, 1590),
    },
    "pocket": {
        "root": (640, 930), "spine": (690, 680), "head": (740, 430), "head_top": (790, 240),
        "shN": (580, 540), "elN": (620, 760), "wrN": (675, 665),
        "shF": (790, 560), "elF": (850, 730), "wrF": (880, 630),
        "hipN": (500, 1120), "kneeN": (450, 1380), "ankN": (290, 1640),
        "hipF": (660, 1130), "kneeF": (800, 1360), "ankF": (930, 1640),
    },
    "braid": {
        "root": (670, 960), "spine": (720, 700), "head": (790, 430), "head_top": (830, 240),
        "shN": (600, 560), "elN": (620, 770), "wrN": (665, 680),
        "shF": (810, 570), "elF": (870, 740), "wrF": (895, 660),
        "hipN": (530, 1140), "kneeN": (490, 1400), "ankN": (330, 1610),
        "hipF": (680, 1150), "kneeF": (810, 1380), "ankF": (900, 1610),
    },
    "brick": {
        "root": (630, 930), "spine": (680, 680), "head": (730, 420), "head_top": (770, 230),
        "shN": (570, 520), "elN": (610, 740), "wrN": (670, 640),
        "shF": (780, 540), "elF": (840, 720), "wrF": (865, 620),
        "hipN": (500, 1120), "kneeN": (450, 1390), "ankN": (290, 1560),
        "hipF": (650, 1130), "kneeF": (790, 1370), "ankF": (920, 1580),
    },
}

# 骨名 -> 起点关节（半径缩放用）
BONE_START = {
    "Root": "root", "Spine": "spine", "Head": "head",
    "UpperArmFar": "shF", "ForeArmFar": "elF",
    "UpperArmNear": "shN", "ForeArmNear": "elN",
    "ThighFar": "hipF", "ShinFar": "kneeF",
    "ThighNear": "hipN", "ShinNear": "kneeN",
}


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def chroma_key(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    corners = np.stack([a[5, 5], a[5, -6], a[-6, 5], a[-6, -6]])
    bg = corners.mean(axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((d - 18) / 42.0, 0, 1) * 255
    return Image.fromarray(np.dstack([a, alpha]).astype(np.uint8), "RGBA")


def char_bbox(img: Image.Image):
    a = np.asarray(img)[:, :, 3]
    ys, xs = np.where(a > 25)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def map_params(opp_joints, mirror=False):
    scales = {}
    for j, (a, b) in SEG_OF_JOINT.items():
        scales[j] = dist(opp_joints[a], opp_joints[b]) / dist(ME_JOINTS[a], ME_JOINTS[b])
    # 注意：镜像是图+关节点一起翻，模板偏移在镜像帧里方向不变，不需要取反。
    xsign = 1.0

    def anchor_map(px, py):
        best, bd = None, 1e18
        for j, (jx, jy) in ME_JOINTS.items():
            d = (px - jx) ** 2 + (py - jy) ** 2
            if d < bd:
                bd, best = d, j
        ax, ay = ME_JOINTS[best]
        ox, oy = opp_joints[best]
        s = scales[best]
        return [round(ox + (px - ax) * s * xsign, 1), round(oy + (py - ay) * s, 1)]

    parts = []
    for name, z, poly, bones, excl in ME_PARTS:
        nb = []
        for bname, r in bones:
            s = scales[BONE_START[bname]]
            nb.append([bname, round(r * s, 1)])
        ne = []
        for (ex, ey, ew, eh) in excl:
            tl = anchor_map(ex, ey)
            s = scales[min(ME_JOINTS, key=lambda j: (ex - ME_JOINTS[j][0]) ** 2 + (ey - ME_JOINTS[j][1]) ** 2)]
            ne.append([tl[0], tl[1], round(ew * s, 1), round(eh * s, 1)])
        mapped = [anchor_map(*p) for p in poly]
        # 锚定映射会 uneven 地吃掉主角模板的手工重叠量；绕多边形质心外扩补回，
        # 避免部件交界处出现覆盖缺口（绑定姿势合成不变，下层像素相同）。
        # 腿/躯干交界（短裤下摆处）缺口最常见，外扩给得更大。
        expand = {"legNearThigh": 1.25, "legFarThigh": 1.22, "legNearShin": 1.15,
                  "legFarShin": 1.15, "torso": 1.16, "head": 1.18}.get(name, 1.12)
        expand = EXPAND_OVERRIDES.get(CUR_OPP, {}).get(name, expand)
        cx = sum(p[0] for p in mapped) / len(mapped)
        cy = sum(p[1] for p in mapped) / len(mapped)
        mapped = [[round(cx + (p[0] - cx) * expand, 1), round(cy + (p[1] - cy) * expand, 1)] for p in mapped]
        parts.append({"name": name, "z": z, "poly": mapped, "bones": nb, "excl": ne})
    return parts


result = {"me": {"texture": "res://assets/parts/me/body.webp",
                 "joints": {k: list(v) for k, v in ME_JOINTS.items()},
                 "parts": None}}

# 个别对手的专属追加部件（模板覆盖不到的身份特征，如 braid 的长辫）
EXTRA_PARTS = {
    "braid": [{"name": "braid", "z": 1,
               "poly": [[215, 460], [365, 450], [355, 720], [305, 950], [215, 905], [195, 640]],
               "bones": [["Spine", 260.0], ["Head", 200.0]], "excl": []}],
}
# 朝右的对手：整图镜像成朝左（关节点随图镜像，标签跟随同一条手臂）
MIRROR = {"champion_domestic"}
# 逐人外扩覆盖（模板比例差异大的人，如 shy 头大）
EXPAND_OVERRIDES = {"shy": {"head": 1.38}, "braid": {"head": 1.22}}
CUR_OPP = ""

for name, rel in OPPONENTS.items():
    src = Image.open(os.path.join(BASE, rel))
    keyed = chroma_key(src)
    joints = {k: tuple(v) for k, v in HAND_JOINTS[name].items()}
    if name in MIRROR:
        w_full = keyed.size[0]
        keyed = keyed.transpose(Image.FLIP_LEFT_RIGHT)
        joints = {k: (w_full - v[0], v[1]) for k, v in joints.items()}
    bbox = char_bbox(keyed)
    out_png = os.path.join(OUT_DIR, name + ".png")
    keyed.save(out_png)
    CUR_OPP = name
    parts = map_params(joints, mirror=name in MIRROR)
    parts.extend(EXTRA_PARTS.get(name, []))
    result[name] = {"texture": f"res://assets/parts/opp/{name}.png",
                    "joints": {k: list(v) for k, v in joints.items()},
                    "parts": parts, "bbox": list(bbox), "canvas": list(keyed.size),
                    "rot_scale": {"evelyn": 0.8, "champion_domestic": 0.85}.get(name, 0.9)}
    print(name, "bbox", bbox, "ok")

with open(os.path.join(BASE, "godot/data/rig_params.json"), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=1)
print("rig_params.json written")
