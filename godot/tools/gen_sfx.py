"""Generate the battle SFX set (original, procedurally synthesized) into ../assets/audio/*.wav.
Run: python gen_sfx.py   (needs numpy). Deterministic (fixed seed).

v2（2026-11-21）：按「拳套打在身上」重做。v1 用变调正弦扫频，听起来像底鼓/激光，不像拳击。
真实拳套命中 ≈ 皮革瞬间拍击：
  ① 皮革脆响：3~10ms 的带通噪声（1.5~5kHz），起音极快——这是「啪」；
  ② 身体闷响：40~90ms 的低通噪声（<250Hz），不带音高——这是「咚」；
  ③ 中频拍击：20~40ms 的 400~1500Hz 噪声，连接前两者；
  ④ 重拳加一点房间混响尾巴；击腹去掉大部分高频、加重闷响；格挡是拳套对拳套，两下更钝的拍击。
全部用噪声 + FFT 频带整形，不用任何正弦音高。
"""
import os, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio')
rng = np.random.default_rng(20261121)

def n(sec):
    return int(SR * sec)

def band_noise(sec, lo, hi, soft=0.25):
    """白噪声 → FFT 频带整形（lo~hi Hz，边缘按 soft 比例平滑过渡）"""
    N = max(n(sec), 64)
    x = rng.standard_normal(N)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(N, 1 / SR)
    lo_w, hi_w = max(lo * soft, 5.0), hi * soft
    m = np.clip((f - (lo - lo_w)) / (2 * lo_w), 0, 1) * np.clip(((hi + hi_w) - f) / (2 * hi_w), 0, 1)
    y = np.fft.irfft(X * m, N)
    return y / (np.abs(y).max() + 1e-9)

def env(N, attack, decay, hold=0.0):
    t = np.arange(N) / SR
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    d = np.exp(-np.maximum(t - attack - hold, 0) / decay)
    return a * d

def layer(total, sec, lo, hi, attack, decay, gain, offset=0.0, hold=0.0):
    out = np.zeros(n(total))
    x = band_noise(sec, lo, hi) * env(n(sec), attack, decay, hold) * gain
    o = n(offset)
    out[o:o + len(x)] += x[: len(out) - o]
    return out

def room(x, amount=0.18, delays=(0.023, 0.037, 0.051), fb=0.35):
    y = x.copy()
    for d in delays:
        k = n(d)
        tail = np.zeros_like(x)
        tail[k:] = x[:-k] * amount
        for _ in range(3):
            tail[k:] += tail[:-k] * fb * 0.5
        y += np.convolve(tail, np.ones(24) / 24, mode='same')  # 混响尾巴去掉刺耳高频
    return y

def soft_clip(x, drive=1.4):
    return np.tanh(x * drive) / np.tanh(drive)

def save(name, x, gain=0.9):
    x = soft_clip(x / (np.max(np.abs(x)) + 1e-9))
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    fade = min(len(x), n(0.004))
    x[-fade:] *= np.linspace(1, 0, fade)
    pcm = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(name, round(len(pcm) / SR, 3), 's')

os.makedirs(OUT, exist_ok=True)

# 刺拳：轻快的「啪」——脆响为主，闷响很少
T = 0.16
save('hit_light',
     layer(T, 0.02, 1800, 5500, 0.0004, 0.004, 1.0)
     + layer(T, 0.05, 500, 1600, 0.0008, 0.012, 0.55)
     + layer(T, 0.09, 60, 220, 0.002, 0.022, 0.45), 0.75)

# 直拳/勾拳打脸：「啪——咚」，脆响 + 明显的身体闷响 + 一点房间
T = 0.42
x = (layer(T, 0.025, 1500, 5000, 0.0003, 0.006, 1.0)
     + layer(T, 0.07, 450, 1500, 0.0006, 0.02, 0.75)
     + layer(T, 0.16, 45, 200, 0.0015, 0.05, 0.95, hold=0.006))
save('hit_heavy', room(x, 0.16), 0.95)

# 击腹：闷、厚——高频脆响很弱，低频多，像打在躯干上
T = 0.4
x = (layer(T, 0.02, 1200, 3200, 0.0005, 0.004, 0.35)
     + layer(T, 0.08, 250, 900, 0.0008, 0.028, 0.8)
     + layer(T, 0.2, 35, 160, 0.002, 0.07, 1.0, hold=0.01))
save('hit_body', room(x, 0.1), 0.9)

# 格挡：拳套撞拳套——两下钝拍（中频为主），没有身体闷响
T = 0.2
save('block',
     layer(T, 0.04, 700, 2200, 0.0005, 0.01, 1.0)
     + layer(T, 0.04, 600, 1900, 0.0005, 0.012, 0.55, offset=0.018)
     + layer(T, 0.06, 120, 380, 0.001, 0.015, 0.35), 0.6)

# 挥空：拳头划过空气，带通噪声先升后降，很轻
T = 0.22
t = np.arange(n(T)) / SR
sweep = band_noise(T, 500, 2600) * (np.sin(np.pi * t / T) ** 2)
save('whoosh', sweep, 0.35)

# 倒地：身体砸在擂台垫上——大块低频 + 帆布/垫子的中频，一次小反弹
T = 0.9
x = (layer(T, 0.35, 30, 140, 0.003, 0.11, 1.0)
     + layer(T, 0.12, 300, 1100, 0.002, 0.04, 0.6)
     + layer(T, 0.2, 30, 140, 0.003, 0.06, 0.35, offset=0.16))
save('knockdown', room(x, 0.12), 0.95)

# 回合铃：保留金属铃（这是唯一需要音高的），比 v1 更短更亮
T = 1.4
t = np.arange(n(T)) / SR
bell = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / d) * a for f, d, a in [(1180, 0.7, 1.0), (1760, 0.45, 0.5), (2950, 0.25, 0.3), (4020, 0.12, 0.2)])
bell[: n(0.003)] *= np.linspace(0, 1, n(0.003))
save('bell', bell, 0.55)

# 观众：多层带通噪声 + 缓慢起伏的包络（人声频段 300~3000Hz）
T = 2.4
t = np.arange(n(T)) / SR
crowd = band_noise(T, 250, 2600) * 0.8 + band_noise(T, 120, 600) * 0.5
mod = 0.75 + 0.25 * np.sin(2 * np.pi * 3.1 * t) * np.sin(2 * np.pi * 0.7 * t)
save('crowd', crowd * mod * np.sin(np.pi * np.clip(t / T, 0, 1)) ** 1.2, 0.45)
