#!/usr/bin/env python3
"""动画试点：整段动作视频 → alpha 精灵图（对手帧序列接入用）。

来源：assets/pose_src_pilot/video/ 的纯色深紫底视频（736×1056/24fps）。
做法（沿用 make_alpha.py 的连通域口径，针对紫底调参）：
  1) ffmpeg 按窗抽帧（12fps 采样、缩到 352×505 cell）；
  2) 背景候选＝与边框中位色距离 <30（紫裙/紫拳套的亮紫像素虽是候选，
     但被深色轮廓包围、与边框不连通，binary_propagation 不会误伤）；
  3) 背景腐蚀 1px + alpha 高斯羽化 0.8；边缘带做去溢色（按羽化 alpha 反解混合色）；
  4) 帧拼精灵图（6 列网格）存 webp，逐状态写 anim.json（帧数/列数/播放 fps/循环标记）。
输出：web/assets/anim/<char>/<state>.webp ＋ anim.json；QC 合成图另存 research/anim_pilot_logs/。
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]  # boxing/
WEB = ROOT / "web"
SRC = ROOT / "assets/pose_src_pilot/video"
SRC_BATCH = ROOT / "assets/pose_src_batch/video"
OUT = WEB / "assets/anim"
QC = ROOT / "research/anim_pilot_logs"
QC_BATCH = ROOT / "research/anim_batch_logs"
BATCH_CHARS = {"champion_domestic", "rookie", "shy", "pocket", "braid", "brick"}
CELL_W, CELL_H = 352, 505
COLS = 6
SAMPLE_FPS = 12

# 取段表（秒）：start/end 为源视频时间窗；playFps 为游戏内播放速率；loop=待机循环
JOBS = {
    "evelyn": {
        # A2 比赛服回炉（2026-11-11）：换 ring 四段（黑金短款上衣＋黑短裤、无披风），
        # 旧披风版精灵图归档于 web/assets/anim/_archive_cape/evelyn/。
        # idle 源段她是朝左的 3/4 抱架（视线投向画面左），与另三段朝右不一致——播放器
        # 统一 scaleX(-1) 镜像，直接接入会背对主角；生产时水平翻转烘入（FLIP_STATES），
        # 显示端即与其他状态同向。窗口 2.60~4.90：避开 0.7~1.7s 拳套旁的紫色烟团段，
        # 6fps 细查此窗全程干净抱架律动、无出拳。
        "idle":   ("evelyn_ring_idle_v1.mp4",     2.60, 4.90, 12, True),
        # attack 选帧重构：ring 直拳两轮全伸展峰值拳套均冲出画框（24fps 管线同口径
        # 量测 f26~33/f52~63 右缘 351 触边），但第二轮伸展后带一段「近全伸展缓退
        # 平台」（f64~107 拳套完整在框内、alpha maxX 349→342 渐降）——取平台帧作
        # 伸展相：抱架 f48~51 蓄势、跳切平台 f66/f72 作峰值定格（maxX 349/347、
        # 全帧右缘接触＝0）、逆序回架（同苏雾/赤磊 1 帧弹射借帧口径）。下标自
        # from=2.00s（＝源 f48）起算。
        "attack": {"video": "evelyn_ring_straight_v1.mp4", "from": 2.00, "pick_fps": 24,
                   "picks": [0, 1, 2, 3, 18, 24, 24, 18, 3, 2, 1, 0], "fps": 18, "loop": False},
        "hit":    ("evelyn_ring_hit_v1.mp4",      0.95, 4.60, 22, False),  # 冲击前少许起、覆盖后仰→覆面回架前段
        # down：ring 段平躺帧全身完整在框内（与批量 6 人「平躺帧双脚出框」不同），
        # 按 A2 口径用完整平躺段：1.50s 踉跄起切、经跪倒→坐倒→后仰→平躺（约 5.5s
        # 落定），6.30s 收尾保证末帧＝平躺保持帧（downK/锚点由管线按末帧量测重算）。
        # 去底走 carpet_full 整带剔除（A2 残留修复，见 alpha_of 注释）。
        "down":   ("evelyn_ring_down_v1.mp4",     1.50, 6.30, 12, False),
    },
    "counter": {
        "idle":   ("counter_idle_v1.mp4",         2.70, 5.10, 12, True),  # 避开原窗 1.5~2.5s 拳套旁的紫色烟团
        # 同批修复：原 attack 峰值 3 帧（旧 f6~f8）拳套同样出框；选帧到 1.30s 框内
        # 发射帧（右端 714/736）作峰值＋乒乓回程。
        "attack": {"video": "counter_straight_v1.mp4", "from": 0.80, "pick_fps": 24,
                   "picks": [5, 8, 9, 10, 11, 12, 12, 11, 10, 9, 8], "fps": 18, "loop": False},
        # combo 两段直拳峰值同样出框（旧 f7/f26/f28 光臂）：选帧重组——两段伸展都
        # 截到最后框内帧作峰值、乒乓回收，其余流程（抱架/勾拳/转身）按 24fps 隔帧取。
        "combo":  {"video": "media-generation-animate-this-character-in-one-0-b20cbd02-b427-4aeb-a77d-a12fb1f8f70a.mp4",
                   "from": 0.80, "pick_fps": 24,
                   "picks": [1, 3, 5, 7, 9, 11, 9, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 49, 47, 45, 64, 66, 68],
                   "fps": 15, "loop": False},
        "hit":    ("counter_hit_v1.mp4",          1.55, 4.55, 22, False),
        "down":   ("counter_down_v1.mp4",         1.80, 4.70, 12, False),
    },
    # ===== A3 批量（2026-11-11）：6 名重点角色，素材在 assets/pose_src_batch/video（"batch:" 前缀）=====
    # 取段口径同试点：idle 取无出拳的最稳抱架窗（24fps bbox 量测选窗）；hit 从冲击前少许起、
    # 覆盖后仰→回架前段；down 从挨打帧起切（开头混有本人出拳的段一律切掉，见各注）；
    # attack 全员选帧重构——源视频全伸展帧拳套普遍出框，峰值取「框内最伸展帧」
    # （24fps 逐帧量测 maxX：丽华 715/小葵 680/小朵 721/小麦 721，触边帧 735 一律不用），
    # 苏雾改用其第二发完整框内直拳的自然周期（窗取，非选帧）。
    # down 落点口径：各人平躺帧双脚都伸出源画框（生成构图如此、无帧可补），保持帧一律
    # 收在「刚倒地、腿朝上/屈起、全身完整在框内」的落点帧——读秒停在刚倒地姿势，
    # 不用下肢被画框截断的平躺帧（全员一致，无例外）。
    "champion_domestic": {
        "idle":   ("batch:champion_domestic_idle_v1.mp4",     2.50, 4.92, 12, True),
        "attack": {"video": "batch:champion_domestic_straight_v1.mp4", "from": 0.833, "pick_fps": 24,
                   "picks": [1, 2, 3, 4, 5, 5, 4, 3, 2, 1], "fps": 18, "loop": False},
        "hit":    ("batch:champion_domestic_hit_v1.mp4",      0.95, 3.95, 22, False),
        "down":   ("batch:champion_domestic_down_v1.mp4",     1.00, 3.75, 12, False),  # 0.67s 她出拳、1.0s 挨打起切；3.75 收在刚倒地腿朝上（平躺帧双脚出框，见批量口径注）
    },
    "rookie": {
        "idle":   ("batch:rookie_idle_v1.mp4",     7.00, 9.42, 12, True),
        "attack": {"video": "batch:rookie_straight_v1.mp4", "from": 1.79, "pick_fps": 24,
                   "picks": [2, 3, 4, 6, 8, 8, 6, 4, 3, 2], "fps": 18, "loop": False},  # 刺拳渐进伸展：f47 671→f51 680 框内峰值，其后整段出框
        "hit":    ("batch:rookie_hit_v1.mp4",      0.60, 4.20, 22, False),
        "down":   ("batch:rookie_down_v1.mp4",     1.85, 4.27, 12, False),  # 1.3~1.7s 她本人出拳、约 1.85s 挨打起切；4.27 收在刚倒地腿朝上帧
    },
    "shy": {
        "idle":   ("batch:shy_idle_v1.mp4",     7.17, 9.59, 12, True),
        "attack": {"video": "batch:shy_straight_v1.mp4", "from": 4.17, "pick_fps": 24,
                   "picks": [2, 3, 4, 26, 26, 27, 28, 29], "fps": 18, "loop": False},  # 她的直拳全是 1 帧弹射出框：峰值借收拳首帧 j26（臂伸展、拳套完整在框内），j27/28 顺收拳序回架
        "hit":    ("batch:shy_hit_v1.mp4",      1.50, 5.00, 22, False),
        "down":   ("batch:shy_down_v1.mp4",     1.50, 4.42, 12, False),  # 收在坐倒屈腿帧（平躺帧双腿同样出框，她不例外）
    },
    "pocket": {
        "idle":   ("batch:pocket_idle_v1.mp4",     1.83, 4.25, 12, True),
        "attack": {"video": "batch:pocket_straight_v1.mp4", "from": 3.71, "pick_fps": 24,
                   "picks": [1, 2, 3, 4, 5, 5, 4, 3, 2, 1], "fps": 18, "loop": False},  # 她的拳几乎全出框，唯 3.92s 刺拳框内峰值 721
        "hit":    ("batch:pocket_hit_v1.mp4",      0.45, 4.20, 22, False),
        "down":   ("batch:pocket_down_v1.mp4",     1.20, 4.15, 12, False),  # 1.0s 她本人出拳、约 1.2s 挨打起切；4.15 收在刚倒地腿屈起帧
    },
    "braid": {
        "idle":   ("batch:braid_idle_v1.mp4",     5.33, 7.75, 12, True),
        "attack": {"video": "batch:braid_straight_v1.mp4", "from": 1.417, "pick_fps": 24,
                   "picks": [2, 3, 4, 5, 6, 6, 5, 4, 3, 2], "fps": 18, "loop": False},
        "hit":    ("batch:braid_hit_v1.mp4",      1.70, 5.05, 22, False),
        "down":   ("batch:braid_down_v1.mp4",     1.85, 4.20, 12, False),  # 1.3~1.7s 她本人出拳、约 1.85s 挨打起切；4.20 收在刚倒地腿朝上帧
    },
    "brick": {
        "idle":   ("batch:brick_idle_v1.mp4",     3.17, 5.59, 12, True),
        "attack": {"video": "batch:brick_straight_v1.mp4", "from": 3.29, "pick_fps": 24,
                   "picks": [10, 11, 12, 6, 6, 7, 8, 9], "fps": 18, "loop": False},  # 发射 1 帧出框、框内无伸展帧：峰值借第一发收拳首帧 j6（maxX 707、臂全伸展、拳套完整），j7~9 顺收拳序回架，前置 j10~12 抱架作起势
        "hit":    ("batch:brick_hit_v1.mp4",      1.05, 4.90, 22, False),
        "down":   ("batch:brick_down_v1.mp4",     1.15, 3.95, 12, False),  # 3.95 收在刚倒地腿朝上帧（强 alpha 包围盒右缘 331、全身在框内）
    },
}


def extract_frames(video: Path, t0: float, t1: float, tmp: Path, fps: int = SAMPLE_FPS) -> list[Path]:
    for p in tmp.glob("f*.png"):
        p.unlink()
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", str(t0), "-i", str(video),
         "-t", str(t1 - t0), "-vf", f"fps={fps},scale={CELL_W}:{CELL_H}",
         str(tmp / "f%03d.png")],
        check=True)
    return sorted(tmp.glob("f*.png"))


def skirt_fill(fg: np.ndarray, out: np.ndarray, dist: np.ndarray) -> np.ndarray:
    """沈墨凛裙面修复：裙摆亮褶与底色距离≈3，靠深色褶线分隔成格，其中接通腿间
    缝隙的一格会被连通去底吃穿，形成向裙摆下方开口的「湾」（补洞补不到）。
    规则：逐行找背景段，若其左右紧邻的前景像素都是裙色（距离<45），则该段是
    裙面内部——按两侧裙面原色的线性插值补回（P1-b 前曾用最近前景色，出拳帧
    拉出黑杠，见函数内注）。腿间缝两侧紧邻的是皮肤（距离大），不会误补；
    倒地帧几何不同，不走此修复。"""
    fg = fg.copy()
    h, w = fg.shape
    # 裙区纵界：含 ≥8 个裙色前景像素的最底行 +4；裙摆下方不补（靴子同为裙色距离，
    # 腿间行段会被两侧靴/长发夹住误判——v3.1 事故：裙下横条纹）
    skirt_rows = np.where((fg & (dist < 45)).sum(axis=1) >= 8)[0]
    if not len(skirt_rows):
        return fg
    y_max = int(skirt_rows.max()) + 4
    for y in range(min(h, y_max + 1)):
        row = fg[y]
        if row.all():
            continue
        d = np.diff(np.concatenate([[True], row, [True]]).astype(np.int8))
        starts = np.where(d == -1)[0]
        ends = np.where(d == 1)[0]
        for s, e in zip(starts, ends):  # 背景段 [s, e)
            if s == 0 or e == w:
                continue
            # 内容回补（P1-b 追加，先于下方 80px 跳过判定）：亮褶通道——出拳/
            # 受击帧里亮褶条纹被传播经腿间缝整条吃穿成通道，逐行看是背景段，
            # 段均值 ≥10（褶色，真背景 ≈0~5）、两侧都是前景且至少一侧是裙色
            # 邻域或两侧邻居距离都 <45（深色褶线）。相邻两条通道在个别行会
            # 连成整幅（实测宽达 82＝裙前幅量级），故上限取 100。这类段是
            # 裙面本体：置 fg、保留原色。夹逼测试（_skirt_flank 要求 ±3 行内
            # 有亮褶）对深色褶线夹住的通道不成立，故另设此支；腿间真缝段
            # 均值 ≈0~5、过不了 ≥10 关。
            if (e - s <= 100 and dist[y, s:e].mean() >= 10 and row[s - 1] and row[e]
                    and ((_skirt_flank(dist, y, s - 1) or _skirt_flank(dist, y, e))
                         or (dist[y, s - 1] < 45 and dist[y, e] < 45))):
                fg[y, s:e] = True
                row = fg[y]
                continue
            if e - s > 80:
                continue
            if _skirt_flank(dist, y, s - 1) and _skirt_flank(dist, y, e):
                fg[y, s:e] = True
                # 分两类（P1-b 定因，2026-11-11）：①段像素均值距离 ≥10 的是裙摆
                # 亮褶本体——抱架帧靠闭合封颈保住，出拳帧腿间缝变宽、传播经缝
                # 把整格亮褶吃穿（实测段均值 15~21、宽 26~40px）。这类像素本就是
                # 真实裙面，原色即正解，只置 fg 不动 out。旧版在此处覆写「最近
                # 前景色」：宽段内每像素的最近前景多为深色褶线，横向拉成一条条
                # 黑杠——C10 的「裙侧残影虚线」实为此管线伪影，源帧裙面干净。
                # ②均值 <10 的是真空湾（原色近底色），置 fg 后须覆色：用两侧
                # 裙面原色的线性插值（out 此前仅被补洞改过小洞像素，夹逼点
                # 取原色无误），不再引入黑发/肤色等异色。
                if dist[y, s:e].mean() >= 10:
                    continue
                c0 = out[y, s - 1].copy()
                c1 = out[y, e].copy()
                seg = e - s
                t = (np.arange(seg) + 1.0) / (seg + 1.0)
                out[y, s:e] = c0[None, :] * (1.0 - t[:, None]) + c1[None, :] * t[:, None]
    return fg


def _skirt_flank(dist: np.ndarray, y: int, x: int) -> bool:
    """夹逼像素是否裙面：本身距离<45（裙褶线 41.7）且上下 3 行内有亮褶（距离<30）。
    长发距离 35.6 也 <45，但其邻域没有亮褶，据此与裙褶线区分（v3.2）。"""
    if dist[y, x] >= 45:
        return False
    y0, y1 = max(0, y - 3), min(dist.shape[0], y + 4)
    return bool((dist[y0:y1, x] < 30).any())


# 生产时水平翻转烘入的状态：源段朝向与同人其余状态相反（播放器统一镜像、无逐状态
# 翻转开关），翻转后显示端才同向。仅伊芙琳比赛服 idle（源段朝左 3/4 抱架）。
FLIP_STATES = {("evelyn", "idle")}


def resolve_video(name: str) -> Path:
    """视频路径解析："batch:" 前缀走批量素材目录，其余走试点目录。"""
    if name.startswith("batch:"):
        return SRC_BATCH / name[len("batch:"):]
    return SRC / name


def alpha_of(img: Image.Image, down: bool = False, skirt: bool = False, dim_glow: bool = False,
             purge_pockets: bool = False, down_clean: bool = False, floor_ref: bool = False,
             carpet_full: bool = False, dark_restore: bool = False) -> Image.Image:
    """v3 管线：T=30 连通去底 → 清孤岛 → 闭合+补洞 →（伊芙琳）口袋清理 →（倒地帧）辉光毯清理 → 窄带去溢色。

    口径（两轮试错定型）：阈值必须停在 30——沈墨凛黑衣/黑发与底色距离仅 35~71，
    阈值抬到 84 会把整件衣服吃掉（v2 事故）；裙摆亮褶虽是候选（距离≈3），靠深色
    褶线（距离≈42）分隔成格，只有接通腿间缝隙的一格会被吃穿，先用 5×5 闭合封颈
    再 binary_fill_holes 补回（大洞>1500px 恢复原色＝裙面原貌；小洞＝手臂/头发围
    出的透光缝，取最近前景色避免补进紫底）。漂浮烟团等孤岛由连通域清理删除
    （保留最大域＋与其包围盒 12px 内相交的小域，保住出拳帧的拳套碎片）。
    倒地帧的身下紫毯（地面辉光，距离 39~72，T=30 吃不掉）：按「距实体核心
    （距离≥84 的皮肤/银发/金饰/黑披风）超过 20px 的低距离前景像素删除」清理，
    20px 内留下作贴地阴影；沈墨凛黑发距离仅 36、发梢离皮肤较远处会被削短，
    属试点已知取舍（远好于整块紫毯）。
    carpet_full（仅伊芙琳比赛服 down）：地板辉光均匀亮紫（距离≈71~79），20px 规则
    ＋dim_glow 会留下整带 45% alpha 的蓝灰矩形——改走 dist<84 整段剔除＋补洞填回
    轮廓内阴影（她的本体距离全 ≥84，见 down 分支注释）。
    """
    a = np.asarray(img.convert("RGB")).astype(np.float64)
    border = np.concatenate([a[0, :, :], a[-1, :, :], a[:, 0, :], a[:, -1, :]]).reshape(-1, 3)
    med = np.median(border, axis=0)
    dist = np.sqrt(((a - med) ** 2).sum(axis=2))
    if floor_ref:
        # 倒地帧地板参考（A3 批量）：生成视频的地板辉光自上而下渐亮，画面下部的地板色
        # 与全边框中位色距可达 100+，单参考会把整块地板当成前景（丽华 down 的紫色矩形
        # 即此故）。取底部 14 行中位作第二参考，色距取两者最小值（并集判底，随后仍走
        # 边框传播——地板与底边相连、整片传走）。底部条在倒地帧恒为纯地板（人物底边
        # ≤90% 高度），站立/下落帧靴子只占小幅宽、中位稳健；人物本体色与两种紫色
        # 参考的色距都远大于阈值，不受影响。
        med2 = np.median(a[-14:, :, :].reshape(-1, 3), axis=0)
        dist = np.minimum(dist, np.sqrt(((a - med2) ** 2).sum(axis=2)))
    cand = dist < 30
    seed = np.zeros_like(cand)
    seed[0, :] = cand[0, :]
    seed[-1, :] = cand[-1, :]
    seed[:, 0] = cand[:, 0]
    seed[:, -1] = cand[:, -1]
    bg = ndimage.binary_propagation(seed, mask=cand)
    fg = ~bg
    # 连通域清理：最大域 + 与其包围盒（外扩 12px）相交的小域
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum_labels(fg, lab, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1
        objs = ndimage.find_objects(lab)
        mb = objs[main - 1]
        y0, y1 = mb[0].start - 12, mb[0].stop + 12
        x0, x1 = mb[1].start - 12, mb[1].stop + 12
        keep = lab == main
        for i, ob in enumerate(objs, start=1):
            if i == main or ob is None:
                continue
            if ob[0].start <= y1 and ob[0].stop >= y0 and ob[1].start <= x1 and ob[1].stop >= x0:
                keep |= lab == i
        fg = keep
    # 闭合封颈 + 补洞：大洞恢复原色，小洞取最近前景色
    fg = ndimage.binary_closing(fg, structure=np.ones((5, 5)), border_value=0)
    filled = ndimage.binary_fill_holes(fg)
    holes = filled & ~fg
    out = a.copy()
    if holes.any():
        hlab, hn = ndimage.label(holes)
        _, inds = ndimage.distance_transform_edt(~fg, return_indices=True)
        near = a[inds[0], inds[1]]
        for i in range(1, hn + 1):
            m = hlab == i
            if m.sum() <= 1500:
                out[m] = near[m]
    fg = filled
    if purge_pockets:
        # 口袋清理（2026-11-11 黑矩形修复）：披风与腿之间夹出的封闭背景口袋——
        # 底色像素被人物轮廓包围，边框传播够不到、又被闭合封颈＋补洞填回，
        # 在实战里显成下半身后一块边缘笔直的深色板。判据（实测分布定型）：
        # fg∩cand 连通域中面积 ≥700px 且平均底色距离 ≤7 的整块剔除——真口袋
        # 是近乎纯底色（实测 3.9~6.8），发梢/披风褶的紫调阴影同面积下平均距离
        # 都在 8.5 以上、零误伤；倒地辉光毯平均距离 15+，同样不受影响。
        # 仅伊芙琳启用：沈墨凛紫裙本身就是底色近色的大块封闭前景，绝不能走此规则。
        m = fg & cand
        lab, n = ndimage.label(m)
        if n:
            sizes = ndimage.sum_labels(m, lab, range(1, n + 1))
            for i in range(1, n + 1):
                if sizes[i - 1] >= 700:
                    comp = lab == i
                    if dist[comp].mean() <= 7.0:
                        fg = fg & ~comp
    if skirt:
        fg = skirt_fill(fg, out, dist)
    # 倒地帧：清理身下辉光毯（保留核心近旁作贴地阴影）。试点口径保留 20px；
    # A3 批量（down_clean）收紧到 8px——用户裁定倒地帧身下深色矩形必须清净，
    # 8px 内残带读作接触阴影、矩形外缘（离核心远）整段删净。
    if down and carpet_full:
        # 伊芙琳比赛服 down 专用（A2 残留修复，2026-11-11）：她的地板辉光是均匀亮紫
        # （实测 RGB≈(98,67,165)、与边框中位色距≈71~79）——20px 毯规则只删核心
        # 20px 外的部分、余下整带再被 dim_glow 以 45% alpha 保留，在明亮擂台地板
        # 上显成一整块蓝灰矩形（用户点名过的「身下垫着没抠净的矩形」同族）。
        # 她本体距离全 ≥84（黑衣≈132/金饰≈188/皮肤≈199/银发≈272），故 dist<84
        # 的前景整段剔除；随后补洞把轮廓内被核心围住的低距离阴影填回原色——
        # 地板横带与画框边缘相通、不是洞，不会被填回。发丝间露出的辉光同理
        # 与外界相通、删净；dim_glow 对本路关闭（已无毯可压）。
        fg = fg & ~(dist < 84)
        fg = ndimage.binary_fill_holes(fg)
    elif down:
        core = fg & (dist >= 84)
        if core.any():
            fg_pre = fg
            dmap = ndimage.distance_transform_edt(~core)
            fg = fg & ~((dist < 84) & (dmap > (8 if down_clean else 20)))
            if dark_restore:
                # 发梢回补（P1-b，2026-11-11，仅沈墨凛 down）：毯规则按「离核心
                # >20px」删低距离前景，她铺在地板上的长发末梢（距离≈36、离皮肤
                # 核心远）被连带削短。被删像素里凡原色为暗色中性（亮度低、饱和
                # 低、蓝红差小——黑发/黑衣/黑靴的共同特征）的予以恢复；地板辉光
                # 是亮紫（max 高、B−R 大）与地板暗影（紫调、B−R 大）都过不了
                # 这三关，毯清理效果不变。恢复范围限 fg_pre（只撤销毯规则的
                # 误删，不新增任何前景）。
                mx = a.max(axis=2)
                mn = a.min(axis=2)
                dark = (mx < 120) & ((mx - mn) < 40) & ((a[:, :, 2] - a[:, :, 0]) < 28)
                fg = fg | (fg_pre & dark)
    bg2 = ndimage.binary_erosion(~fg, iterations=1, border_value=1)
    alpha = np.where(bg2, 0.0, 255.0)
    alpha = ndimage.gaussian_filter(alpha, 0.8)
    # 去溢色：只在背景 3px 窄带内、且与底色距离 <90 的边缘像素上反解混色
    band = ndimage.binary_dilation(bg2, iterations=3) & fg
    edge = band & (alpha > 8) & (alpha < 250) & (dist < 90)
    if edge.any():
        af = (alpha / 255.0)[..., None]
        un = (a - (1.0 - af) * med) / np.maximum(af, 0.35)
        out[edge] = np.clip(un[edge], 0, 255)
    if dim_glow:
        # 伊芙琳倒地专用：保留的辉光边在明亮擂台地板上会显成一块紫斑（源辉光自带
        # 近矩形边缘），把低距离前景的 alpha 压到 45% 使其退回「贴地阴影」的读法；
        # 她服装本体距离都在 84 外（黑披风 92/金饰 188/银发 272），不误伤。
        alpha = alpha * np.where(fg & (dist < 84), 0.45, 1.0)
    rgba = np.dstack([out, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def build_sheet(frames: list[Image.Image]) -> Image.Image:
    n = len(frames)
    rows = (n + COLS - 1) // COLS
    sheet = Image.new("RGBA", (COLS * CELL_W, rows * CELL_H), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr, ((i % COLS) * CELL_W, (i // COLS) * CELL_H))
    return sheet


def qc_strip(char: str, state: str, frames: list[Image.Image]) -> None:
    """QC：抽 4 帧贴到深色擂台色＋棋盘格上各一排，看边缘。"""
    qdir = QC_BATCH if char in BATCH_CHARS else QC
    qdir.mkdir(parents=True, exist_ok=True)
    picks = [frames[i] for i in np.linspace(0, len(frames) - 1, 4).astype(int)]
    for bgname, bgc in [("dark", (24, 18, 44, 255)), ("check", None)]:
        strip = Image.new("RGBA", (CELL_W * 4, CELL_H), bgc or (255, 255, 255, 255))
        if bgc is None:
            px = np.zeros((CELL_H, CELL_W * 4, 4), np.uint8)
            yy, xx = np.mgrid[0:CELL_H, 0:CELL_W * 4]
            px[((xx // 16) + (yy // 16)) % 2 == 0] = (200, 200, 200, 255)
            px[((xx // 16) + (yy // 16)) % 2 == 1] = (120, 120, 120, 255)
            strip = Image.fromarray(px, "RGBA")
        for i, fr in enumerate(picks):
            strip.alpha_composite(fr, (i * CELL_W, 0))
        strip.convert("RGB").save(qdir / f"qc_{char}_{state}_{bgname}.png")


def alpha_bbox(img: Image.Image):
    """已去底帧的 alpha 包围盒（cell 坐标）：(x0, y0, x1, y1)，无内容返回 None。"""
    a = np.asarray(img.split()[-1])
    ys, xs = np.nonzero(a > 8)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def main() -> None:
    only = sys.argv[1:] or None
    QC.mkdir(parents=True, exist_ok=True)
    tmp = Path("/tmp/anim_frames")
    tmp.mkdir(exist_ok=True)
    for char, states in JOBS.items():
        meta = {"cell": [CELL_W, CELL_H], "cols": COLS, "states": {}}
        keyed_bbox = {}  # state -> [bbox per frame]，供 down 显示元数据计算
        for state, spec in states.items():
            if only and f"{char}/{state}" not in only:
                continue
            if isinstance(spec, dict):
                # 选帧模式：高帧率抽帧后按下标挑帧（含重复＝峰值定格、逆序＝乒乓回程）
                video, fps, loop = spec["video"], spec["fps"], spec["loop"]
                pf = spec["pick_fps"]
                t0 = spec["from"]
                t1 = t0 + (max(spec["picks"]) + 2) / pf
                all_paths = extract_frames(resolve_video(video), t0, t1, tmp, fps=pf)
                paths = [all_paths[i] for i in spec["picks"]]
                src_desc = f"{video} [pick {pf}fps from {t0:.2f}s: {spec['picks']}]"
            else:
                video, t0, t1, fps, loop = spec
                paths = extract_frames(resolve_video(video), t0, t1, tmp)
                src_desc = f"{video} [{t0:.2f}~{t1:.2f}s]"
            # down 去底参数按人分档（A3 实测）：floor_ref 只给丽华——她的地板辉光亮到
            # 与边框色距 100+、非双参考吃不掉整块地板；但苏雾的深灰蓝服装与她的地板色
            # 距过近、双参考会把衣服吃穿（实测变黑影），其余人地板辉光都在毯规则射程内。
            # dim_glow 给丽华（压身下辉光毯的残影）；伊芙琳 down 改走 carpet_full
            # 整带剔除（A2 残留修复：dim_glow 的 45% 保留带在擂台上显成蓝灰矩形）。
            frames = [alpha_of(Image.open(p), down=(state == "down"),
                               skirt=(char == "counter" and state != "down"),
                               dim_glow=((char == "champion_domestic") and state == "down"),
                               purge_pockets=(char == "evelyn"),
                               down_clean=(char in BATCH_CHARS and state == "down"),
                               floor_ref=(char == "champion_domestic" and state == "down"),
                               carpet_full=(char == "evelyn" and state == "down"),
                               dark_restore=(char == "counter" and state == "down")) for p in paths]
            if (char, state) in FLIP_STATES:
                frames = [f.transpose(Image.FLIP_LEFT_RIGHT) for f in frames]
            keyed_bbox[state] = [alpha_bbox(f) for f in frames]
            sheet = build_sheet(frames)
            dst = OUT / char / f"{state}.webp"
            dst.parent.mkdir(parents=True, exist_ok=True)
            sheet.save(dst, "WEBP", quality=82, method=4)
            qc_strip(char, state, frames)
            meta["states"][state] = {
                "file": f"{state}.webp", "frames": len(frames),
                "fps": fps, "loop": bool(loop),
                "src": src_desc,
            }
            print(f"{char}/{state}: {len(frames)} frames -> {dst} ({dst.stat().st_size/1024:.0f} KiB)")
        # 倒地显示新规元数据（A3）：down 末帧躺姿 bbox → 体长缩放系数与地面锚点。
        # downK：躺姿体长（末帧 bbox 宽）放大到站立身高（idle bbox 高中位数）的 94%；
        # downOX/OY：末帧 bbox 底边中点（cell 百分比），播放器以此为变换原点，
        # 缩放时该点不动——身体贴地面线长大，不再缩成一团浮空。
        if "down" in keyed_bbox and "idle" in keyed_bbox:
            db = keyed_bbox["down"][-1]
            ih = [b[3] - b[1] for b in keyed_bbox["idle"] if b]
            if db and ih:
                idle_h = float(np.median(ih))
                idle_gy = float(np.median([b[3] for b in keyed_bbox["idle"] if b]))
                body_w = db[2] - db[0]
                st = meta["states"]["down"]
                st["downK"] = round(min(2.6, max(1.0, 0.94 * idle_h / body_w)), 3)
                st["downOX"] = round((db[0] + db[2]) / 2 / CELL_W * 100, 1)
                st["downOY"] = round(db[3] / CELL_H * 100, 1)
                # downGY：站立时脚底的地面线（idle 包围盒底边中位）。倒地帧的身体底边
                # 一般高于地面线（源视频构图），播放器用 downGY−downOY 做竖直补偿，
                # 让放大后的身体底边正好落回地面线（治「浮在半空」）。
                st["downGY"] = round(idle_gy / CELL_H * 100, 1)
                print(f"{char}/down meta: downK={st['downK']} origin=({st['downOX']}%,{st['downOY']}%) "
                      f"groundY={st['downGY']}% idleH={idle_h:.0f} bodyW={body_w}")
        # anim.json 合并写回（only 模式只覆盖本次处理的状态，其余沿用已有记录）
        jpath = OUT / char / "anim.json"
        if jpath.exists():
            old = json.loads(jpath.read_text())
            old["states"].update(meta["states"])
            meta = old
        jpath.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
        print(f"{char}: anim.json written")


if __name__ == "__main__":
    main()
