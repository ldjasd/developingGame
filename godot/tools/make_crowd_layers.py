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
    # 2026-11-21 analyze 结果：低声嘈杂取最平稳的 25:21；激动持续取 20:34（波动最小）
    'bed_low': (1521.0, 24.0),
    'bed_high': (1234.0, 16.0),
    # 爆发取平坦度最高（最像人声、最少喇叭 / 风琴）的两段：7:28、12:11
    # 7:28 那段频谱里 4.5~5.5kHz 有持续横线（疑似口哨 / 场馆喇叭），换成拳击现场呼喊最响的 0:29
    'roar': [(MSG, 730.5, 5.0), (FIGHT, 28.5, 4.5)],
    # 「噢」：反应合集里响度跳升的位置，往前留 0.25 秒
    'ooh': [(OOHS, 29.75, 2.4), (OOHS, 44.75, 2.4), (OOHS, 59.75, 2.4), (OOHS, 85.75, 2.4), (OOHS, 100.75, 2.4)],
}


def export(pick):
    xs = load(MSG, stereo=True)
    s, d = pick['bed_low']
    # （bed 都取自 MSG 立体声原录）
    wr('bed_low.wav', norm_rms(highpass(loop_seg(xs, s, d), 70), -24))
    s, d = pick['bed_high']
    wr('bed_high.wav', norm_rms(highpass(loop_seg(xs, s, d), 70), -18))
    for k, (src, s, d) in enumerate(pick['roar']):
        x = load(src, stereo=True) if src == MSG else load(src)
        seg = x[int(s * SR):int((s + d) * SR)].copy()
        wr(f'roar_{k}.wav', norm_rms(fade(highpass(seg, 70), 0.05, 1.8), -14))
    for k, (src, s, d) in enumerate(pick['ooh']):
        x = load(src)
        seg = x[int(s * SR):int((s + d) * SR)].copy()
        wr(f'ooh_{k}.wav', norm_rms(fade(highpass(seg, 90), 0.03, 0.6), -17))
    print('exported to', OUT)
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
    ramp = np.linspace(0, 1, SR * 8)
    build = low * (1 - ramp) + high * ramp  # 8 秒从嘈杂过渡到激动
    parts = [low[:SR * 5], build, gap]
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
