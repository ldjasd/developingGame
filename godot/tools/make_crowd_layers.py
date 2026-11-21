"""随局势变化的观众声：从 CC0 场馆实录里切出 4 类素材（不变调）。
输入 D:/gamemake/third_party_dl/freesound_crowd2/（见 godot/assets/audio/CREDITS.md）
输出 godot/assets/audio/crowd_dyn/：
  bed_low.wav   场馆低声嘈杂（可无缝循环，立体声）
  bed_high.wav  激动的持续呼喊（可无缝循环，立体声）
  ooh_*.wav     重拳时的「噢！」一声（单声道）
  roar_*.wav    击倒 / KO 时的爆发（立体声）
用法：python make_crowd_layers.py analyze   # 打印候选窗口
      python make_crowd_layers.py           # 按下面选定的时间点导出
选段标准：每秒响度（RMS）+ 频谱平坦度（越高越像人群噪声；风琴、喇叭、广播是音调性的，平坦度低）。
"""
import os, sys, glob, subprocess, wave
import numpy as np

SR = 48000
SRC = r'D:\gamemake\third_party_dl\freesound_crowd2'
MSG = '398258__nyseagull__msg-rangers-atmosphere-2010.wav'
FIGHT = '438404__craigsmith__g29-44-fight-crowd-yelling.wav'
OOHS = '675056__craigsmith__s12-01-crowd-reactions-oohs.wav'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'audio', 'crowd_dyn')
FF = glob.glob(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\**\ffmpeg.exe'), recursive=True)[0]


def load(name, stereo=False):
    ch = 2 if stereo else 1
    af = [] if stereo else ['-af', 'pan=mono|c0=0.5*c0+0.5*c1'] if name == MSG else []
    raw = subprocess.run([FF, '-v', 'error', '-i', os.path.join(SRC, name), *af, '-ac', str(ch), '-f', 'f32le', '-ar', str(SR), '-'],
                         capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).copy()
    return x.reshape(-1, 2) if stereo else x


def per_second(x, hop=SR):
    rows = []
    for i in range(0, len(x) - hop, hop):
        seg = x[i:i + hop]
        rms = float(np.sqrt((seg ** 2).mean()) + 1e-9)
        P = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
        f = np.fft.rfftfreq(len(seg), 1 / SR)
        band = P[(f > 200) & (f < 6000)] + 1e-12
        flat = float(np.exp(np.log(band).mean()) / band.mean())
        rows.append((i // hop, 20 * np.log10(rms), flat))
    return rows


def analyze():
    for name in (MSG, FIGHT, OOHS):
        rows = per_second(load(name))
        db = np.array([r[1] for r in rows]); fl = np.array([r[2] for r in rows])
        print(f'== {name}  秒数 {len(rows)}  响度 p10 {np.percentile(db,10):.1f} p50 {np.percentile(db,50):.1f} p90 {np.percentile(db,90):.1f} dB  平坦度中位 {np.median(fl):.3f}')
        W = 20 if name == MSG else 8
        cands = []
        for s in range(0, len(rows) - W):
            d = db[s:s + W]; f = fl[s:s + W]
            cands.append((s, d.mean(), d.std(), f.min()))
        cands = np.array(cands)
        ok = cands[cands[:, 3] > np.percentile(fl, 15)]  # 去掉含音调（风琴 / 喇叭）的窗口
        def show(tag, rows_, w=W, n=5):
            shown = []
            for s, m, sd, fm in rows_:
                if any(abs(s - p) < w for p in shown):
                    continue  # 不重复列相邻窗口
                shown.append(s)
                print(f'  {tag}: {int(s)//60}:{int(s)%60:02d} 起 {w}s  均值 {m:.1f}dB  波动 {sd:.1f}  最低平坦度 {fm:.3f}')
                if len(shown) >= n:
                    break
        low = ok[(ok[:, 1] > np.percentile(db, 20)) & (ok[:, 1] < np.percentile(db, 50))]
        show('低声嘈杂', low[np.argsort(low[:, 2])])
        high = ok[ok[:, 1] > np.percentile(db, 70)]
        show('激动持续', high[np.argsort(high[:, 2])])
        # 爆发：4 秒窗口里最响的
        W4 = 4
        c4 = np.array([(s, db[s:s + W4].max(), db[s:s + W4].std(), fl[s:s + W4].min()) for s in range(0, len(rows) - W4)])
        c4 = c4[c4[:, 3] > np.percentile(fl, 15)]
        show('最响爆发', c4[np.argsort(-c4[:, 1])], W4)
        # 「噢」：响度 1 秒内跳升 ≥ 8dB 的起点
        jumps = [r[0] for k, r in enumerate(rows[1:], 1) if r[1] - rows[k - 1][1] >= 8 and r[2] > np.percentile(fl, 30)]
        print('  跳升点（秒）:', jumps[:20])


def clap_profile(x):
    """每秒：响度 dB、高频（2~8kHz）占比、掌声式瞬态次数（高频能量 25ms 内跳升 3 倍）。
    2026-11-21 用真实拳击 KO 现场视频（看台手机录像）实测参照：高频占比 0.05~0.10，掌声式瞬态 0。"""
    hop = int(SR * 0.025); n = 2048
    f = np.fft.rfftfreq(n, 1 / SR)
    mlo = (f > 100) & (f < 500); mmid = (f > 500) & (f < 2000); mhi = (f > 2000) & (f < 8000)
    prev = 0.0
    sec = {}
    for i in range(0, len(x) - n, hop):
        seg = x[i:i + n]
        P = np.abs(np.fft.rfft(seg * np.hanning(n))) ** 2
        lo, mid, hi = P[mlo].sum(), P[mmid].sum(), P[mhi].sum()
        s = i // SR
        d = sec.setdefault(s, [0.0, 0.0, 0, 0])
        d[0] += float((seg ** 2).mean()); d[1] += hi / (lo + mid + hi + 1e-12); d[3] += 1
        if prev > 0 and hi / prev > 3:
            d[2] += 1
        prev = hi
    out = []
    for s in sorted(sec):
        e, h, j, k = sec[s]
        out.append((s, 10 * np.log10(e / k + 1e-12), h / k, j))
    return out


def scan_clean(name, win, want='loud'):
    """找没有掌声的窗口：窗口内每秒瞬态 ≤ 1、高频占比 ≤ 0.11；按响度排序"""
    prof = clap_profile(load(name))
    res = []
    for s in range(0, len(prof) - win):
        w = prof[s:s + win]
        if max(r[3] for r in w) <= 1 and max(r[2] for r in w) <= 0.11:
            db = np.array([r[1] for r in w])
            res.append((s, db.mean(), db.std(), db.max()))
    res.sort(key=lambda r: -r[1] if want == 'loud' else r[2])
    return res, prof


def wr(name, x):
    os.makedirs(OUT, exist_ok=True)
    x = np.clip(x, -1, 1)
    ch = 2 if x.ndim == 2 else 1
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def highpass(x, fc):
    X = np.fft.rfft(x, axis=0); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = (f ** 4 / (f ** 4 + fc ** 4))
    return np.fft.irfft(X * (g[:, None] if x.ndim == 2 else g), len(x), axis=0)


def norm_rms(x, target_db):
    rms = np.sqrt((x ** 2).mean()) + 1e-9
    return x * (10 ** (target_db / 20) / rms)


def fade(x, fi, fo):
    a, b = int(SR * fi), int(SR * fo)
    env = np.ones(len(x))
    if a: env[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b: env[-b:] = np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x * (env[:, None] if x.ndim == 2 else env)


def loop_seg(x, start, dur, xf=2.0):
    """取 [start, start+dur+xf]，把尾部 xf 秒与开头等功率交叉淡化 → 可无缝循环的 dur 秒"""
    a = int(start * SR); n = int(dur * SR); m = int(xf * SR)
    seg = x[a:a + n + m].copy()
    t = np.linspace(0, np.pi / 2, m)
    fin = (np.sin(t) ** 2)[:, None] if seg.ndim == 2 else np.sin(t) ** 2
    fout = (np.cos(t) ** 2)[:, None] if seg.ndim == 2 else np.cos(t) ** 2
    head = seg[:m] * fin + seg[n:n + m] * fout
    return np.concatenate([head, seg[m:n]])


# ---- 选定的时间点（秒），由 analyze 的结果挑 ----
PICK = {
    # 第二版（2026-11-21 用户：「不需要鼓掌，找真实拳击比赛」）：
    # 对照真实拳击 KO 现场视频实测——全程没有掌声、全是人声吼叫，KO 后持续高位 20 秒以上。
    # 所以所有素材只从 scan_clean()（无掌声）窗口里取；「噢」不用观众反应合集（里面有鼓掌和笑声），
    # 改为从无掌声的吼叫声里切片、塑成「猛地冲上来再落下」的形状。
    'bed_low': (1511.0, 16.0),    # MSG 25:11 低声嘈杂
    'bed_high': (491.0, 16.0),    # MSG 8:11 激动呼喊
    'bed_roar': (481.0, 8.0),     # MSG 8:01 最响且平稳的持续吼叫（KO 后循环 20 秒以上）
    'roar': [(MSG, 445.0, 6.0), (FIGHT, 23.0, 6.0)],   # KO / 击倒那一下的爆发（MSG 7:25、拳击现场 0:23）
    'ooh': [(MSG, 482.0), (MSG, 485.5), (MSG, 446.5), (FIGHT, 24.0), (FIGHT, 43.0)],  # 「噢」的取材起点
}


def export(pick):
    xs = load(MSG, stereo=True)
    s, d = pick['bed_low']
    # （bed 都取自 MSG 立体声原录）
    wr('bed_low.wav', norm_rms(highpass(loop_seg(xs, s, d), 70), -24))
    s, d = pick['bed_high']
    wr('bed_high.wav', norm_rms(highpass(loop_seg(xs, s, d), 70), -18))
    s, d = pick['bed_roar']
    wr('bed_roar.wav', norm_rms(highpass(loop_seg(xs, s, d, 1.5), 70), -14))
    for k, (src, s, d) in enumerate(pick['roar']):
        x = load(src, stereo=True) if src == MSG else load(src)
        seg = x[int(s * SR):int((s + d) * SR)].copy()
        wr(f'roar_{k}.wav', norm_rms(fade(highpass(seg, 70), 0.04, 2.5), -14))
    # 「噢」：一群人同时「噢——」= 0.12 秒冲上来、0.25 秒顶住、约 1.3 秒落下
    for f in glob.glob(os.path.join(OUT, 'ooh_*.wav')):
        os.remove(f)
    for k, (src, s) in enumerate(pick['ooh']):
        x = load(src)
        seg = x[int(s * SR):int((s + 1.8) * SR)].copy()
        t = np.arange(len(seg)) / SR
        env = np.clip(t / 0.12, 0, 1) * np.where(t < 0.37, 1.0, np.exp(-(t - 0.37) / 0.45))
        wr(f'ooh_{k}.wav', norm_rms(fade(highpass(seg, 90) * env, 0.0, 0.2), -16))
    print('exported to', OUT)
    check()


def check():
    """出货检查：每个文件的高频占比、掌声式瞬态（真实拳击 KO 现场参照：0.05~0.10 / 0）"""
    for p in sorted(glob.glob(os.path.join(OUT, '*.wav'))):
        x = _rd(p)
        prof = clap_profile(x)
        h = np.mean([r[2] for r in prof]) if prof else 0
        j = np.mean([r[3] for r in prof]) if prof else 0
        print(f'  {os.path.basename(p):14s} {len(x) / SR:5.1f}s  高频占比 {h:.2f}  掌声式瞬态 {j:.2f} 次/秒  {"OK" if h <= 0.11 and j <= 1.0 else "有掌声嫌疑"}')
    audition()


def _rd(p):
    with wave.open(p) as w:
        ch = w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    return x.reshape(-1, 2).mean(axis=1) if ch == 2 else x


def audition():
    """试听：低声嘈杂 → 逐渐激动 → 「噢」×5 → 爆发 ×2，中间用短提示音隔开"""
    t = np.arange(int(SR * 0.06)) / SR
    beep = np.sin(2 * np.pi * 1200 * t) * np.exp(-t / 0.02) * 0.1
    gap = np.zeros(int(SR * 0.4))
    low = _rd(os.path.join(OUT, 'bed_low.wav'))[:SR * 8]
    high = _rd(os.path.join(OUT, 'bed_high.wav'))[:SR * 8]
    roar_bed = np.tile(_rd(os.path.join(OUT, 'bed_roar.wav')), 3)[:SR * 12]
    ramp = np.linspace(0, 1, SR * 8)
    build = low * (1 - ramp) + high * ramp  # 8 秒从嘈杂过渡到激动
    r2 = np.linspace(0, 1, SR * 3)
    to_roar = np.concatenate([high[:SR * 3] * (1 - r2) + roar_bed[:SR * 3] * r2, roar_bed[SR * 3:]])  # 再冲到持续吼叫 12 秒
    parts = [low[:SR * 5], build, to_roar, gap]
    for f in sorted(glob.glob(os.path.join(OUT, 'ooh_*.wav'))):
        parts += [beep, gap, _rd(f), gap]
    for f in sorted(glob.glob(os.path.join(OUT, 'roar_*.wav'))):
        parts += [beep, gap, _rd(f), gap]
    m = np.concatenate(parts); m = m / (np.abs(m).max() + 1e-9) * 0.9
    p = r'D:\gamemake\sfx_preview\crowd_dynamic_audition.wav'
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((m * 32767).astype(np.int16).tobytes())
    print('audition', p, round(len(m) / SR, 1), 's')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'analyze':
        analyze()
    else:
        export(PICK)
