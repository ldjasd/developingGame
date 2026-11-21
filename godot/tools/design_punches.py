"""游戏化拳击音效：用真实拳套实录做「皮革脆响」层，叠加低频冲击层 + 身体闷响层，再做轻压缩/饱和与极短房间感。
游戏里的拳声普遍是这种设计音效，而不是单独一条实录（单条实录听起来「像敲东西」、不够分量）。
原则：实录层不变调、不滤波（用户反馈变调像加滤镜）；分量全靠新叠加的层。
输入：assets/audio/freesound/*.wav（tools/slice_hits.py 切出的实录）
输出：assets/audio/designed/<role>_<n>.wav
"""
import os, glob, wave
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'audio', 'freesound')
OUT = os.path.join(HERE, '..', 'assets', 'audio', 'designed')
rng = np.random.default_rng(7)

def rd(p):
    with wave.open(p) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        return x if w.getnchannels() == 1 else x[::w.getnchannels()]

def wr(p, x):
    with wave.open(p, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def boom(sec, f_start, f_end, decay):
    """低频冲击：快速下滑的低音（30~90Hz 量级，听感是「胸口一震」，不是可辨认的音高）"""
    t = np.arange(int(SR * sec)) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / 0.012)
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = (1 - np.exp(-t / 0.0015)) * np.exp(-t / decay)
    return np.sin(ph) * e

def thud(sec, cutoff, decay):
    """身体闷响：低通噪声，无音高"""
    N = int(SR * sec)
    X = np.fft.rfft(rng.standard_normal(N)); f = np.fft.rfftfreq(N, 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    y = np.fft.irfft(X, N); y /= np.abs(y).max() + 1e-9
    t = np.arange(N) / SR
    return y * (1 - np.exp(-t / 0.002)) * np.exp(-t / decay)

def room(x, mix=0.12):
    """v2：平滑暗尾巴（指数衰减的低通噪声卷积），不用几条短延迟——短延迟会叠出金属感毛刺"""
    N = int(SR * 0.12)
    t = np.arange(N) / SR
    X = np.fft.rfft(rng.standard_normal(N)); f = np.fft.rfftfreq(N, 1 / SR)
    ir = np.fft.irfft(X / (1 + (f / 2500) ** 2), N) * np.exp(-t / 0.035)
    ir /= np.abs(ir).sum() + 1e-9
    wet = np.convolve(x, ir)[: len(x)]
    wet *= np.abs(x).max() / (np.abs(wet).max() + 1e-9)
    return x + wet * mix

def gate_tail(x, keep, fade=0.04):
    """只留主冲击：起音后 keep 秒开始平滑淡出，去掉实录尾部的底噪、沙袋链条声"""
    a = int(SR * keep); b = a + int(SR * fade)
    y = x.copy()
    if a < len(y):
        n = min(b, len(y)) - a
        y[a:a + n] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
        y[a + n:] = 0
    return y[: min(len(y), b)]

def dehiss(x, cutoff=11000):
    """去掉 11kHz 以上的嘶嘶底噪（缓坡，听感上不是「滤镜」）"""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / cutoff) ** 6), len(x))

def glue(x, drive=2.2):
    """v2：很轻的软限幅（drive 大幅降低），只抹平峰值、不制造失真毛刺"""
    pk = np.abs(x).max() + 1e-9
    y = x / pk
    y = np.where(np.abs(y) > 0.7, np.sign(y) * (0.7 + 0.3 * np.tanh((np.abs(y) - 0.7) / 0.3)), y)
    return y / (np.abs(y).max() + 1e-9) * 0.9

def place(base, layer, gain, at=0.0):
    i = int(SR * at); n = max(len(base), i + len(layer))
    out = np.zeros(n); out[:len(base)] += base; out[i:i + len(layer)] += layer * gain
    return out

RECIPES = {
    # role: (实录增益, boom(秒, 起始Hz, 终止Hz, 衰减), boom增益, thud(秒, 截止Hz, 衰减), thud增益, 房间, 饱和, 实录保留秒)
    'light': (1.0, (0.12, 140, 70, 0.03), 0.35, (0.08, 300, 0.02), 0.25, 0.05, 1.0, 0.09),
    'heavy': (1.0, (0.35, 120, 45, 0.09), 0.85, (0.2, 220, 0.05), 0.5, 0.09, 1.0, 0.13),
    'body': (0.85, (0.4, 100, 40, 0.11), 0.9, (0.3, 160, 0.08), 0.8, 0.07, 1.0, 0.14),
    'block': (1.0, (0.08, 160, 90, 0.02), 0.15, (0.06, 400, 0.015), 0.2, 0.03, 1.0, 0.07),
}

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(SRC, '*.wav'))):
        role = os.path.basename(f).split('_')[0]
        if role not in RECIPES: continue
        rg, bm, bg, th, tg, rm, dr, keep = RECIPES[role]
        x = rd(f) / (np.abs(rd(f)).max() + 1e-9) * rg
        x = dehiss(gate_tail(x, keep))
        y = place(x, boom(*bm), bg, 0.0015)
        y = place(y, thud(*th), tg, 0.001)
        y = glue(room(y, rm), dr)
        wr(os.path.join(OUT, os.path.basename(f)), y)
        print('designed', os.path.basename(f), round(len(y) / SR, 3), 's')

## ===== 打人版（用户 2026-11-21：打沙袋和打人的声音不一样）=====
## 主体换成「打在人身上」的拟音实录（Kinoton 打脸/打身体、qubodup 打面团），
## 拳套实录只取最前 14ms 的皮革「啪」薄薄叠一层；沙袋录音不再用于命中音。
BODY_SRC = r'D:\gamemake\third_party_dl\freesound_body\slices'
PERSON = {
    'heavy': ['kinoton503277_000', 'kinoton503277_001', 'kinoton503277_002', 'kinoton586841_002', 'kinoton586841_005'],
    'body': ['kinoton586841_003', 'kinoton586841_006', 'kinoton503277_003', 'qubodup172489_004'],
    'light': ['qubodup172489_005', 'qubodup172489_013', 'qubodup172489_011', 'qubodup172489_017'],
}
PERSON_MIX = {  # role: (主体保留秒, 皮革层增益, boom 参数, boom 增益, 房间, 肉感层增益)
    # v2（用户：「稍微脆了」）：皮革层减半，加中低频「肉感」层，整体高频轻微下倾
    'heavy': (0.22, 0.2, (0.3, 110, 45, 0.08), 0.5, 0.07, 0.55),
    'body': (0.26, 0.1, (0.35, 95, 40, 0.1), 0.65, 0.06, 0.75),
    'light': (0.12, 0.25, (0.1, 140, 70, 0.025), 0.25, 0.04, 0.35),
}

def flesh(sec, decay):
    """肉感层：150~400Hz 的带通噪声，无音高——拳头陷进身体的那一下软「噗」"""
    N = int(SR * sec)
    X = np.fft.rfft(rng.standard_normal(N)); f = np.fft.rfftfreq(N, 1 / SR)
    X *= np.exp(-((np.log2(np.maximum(f, 1) / 250.0)) ** 2) / (2 * 0.6 ** 2))
    y = np.fft.irfft(X, N); y /= np.abs(y).max() + 1e-9
    t = np.arange(N) / SR
    return y * (1 - np.exp(-t / 0.003)) * np.exp(-t / decay)

def tilt(x, corner=4000, db=-3.0):
    """高频缓坡下倾：4kHz 以上平滑降约 3dB（不是滤镜式的硬切）"""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 10 ** (db / 20)
    shelf = 1 + (g - 1) * (f ** 2 / (f ** 2 + corner ** 2))
    return np.fft.irfft(X * shelf, len(x))

def leather(n_ms=9):
    """从拳套实录里取皮革「啪」：每次随机一条重拳实录的最前 14ms"""
    f = rng.choice(sorted(glob.glob(os.path.join(SRC, 'heavy_*.wav'))))
    x = rd(f); x = x / (np.abs(x).max() + 1e-9)
    i = int(np.argmax(np.abs(x) > 0.3)); n = int(SR * n_ms / 1000)
    seg = x[max(0, i - int(SR * 0.002)): i + n].copy()
    seg[-int(SR * 0.006):] *= np.linspace(1, 0, int(SR * 0.006))
    return seg

def main_person():
    out = os.path.join(HERE, '..', 'assets', 'audio', 'designed_person')
    os.makedirs(out, exist_ok=True)
    for role, names in PERSON.items():
        keep, lg, bm, bg, rm, fg = PERSON_MIX[role]
        for k, nm in enumerate(names):
            x = rd(os.path.join(BODY_SRC, nm + '.wav')); x = x / (np.abs(x).max() + 1e-9)
            x = dehiss(gate_tail(x, keep, 0.06))
            y = place(x, leather(), lg, 0.0)
            y = place(y, boom(*bm), bg, 0.002)
            y = place(y, flesh(0.12 if role != 'light' else 0.07, 0.035 if role != 'light' else 0.02), fg, 0.001)
            y = glue(room(tilt(y), rm))
            wr(os.path.join(out, f'{role}_{k}.wav'), y)
            print('person', role, k, nm)

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'person':
        main_person()
    else:
        main()
