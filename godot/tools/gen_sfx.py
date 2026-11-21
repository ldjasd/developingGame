"""Generate the battle SFX set (original, procedurally synthesized) into ../assets/audio/*.wav.
Run: python gen_sfx.py   (needs numpy). Deterministic (fixed seed)."""
import os, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio')
rng = np.random.default_rng(20261121)

def t(sec):
    return np.arange(int(SR * sec)) / SR

def env(n, attack=0.002, decay=0.08):
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(x - attack, 0) / decay)

def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y

def thump(sec, f0, f1, decay):
    x = t(sec)
    f = f1 + (f0 - f1) * np.exp(-x / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(len(x), 0.001, decay)

def noise(sec, decay, cutoff):
    n = rng.standard_normal(int(SR * sec))
    return lowpass(n, cutoff) * env(len(n), 0.001, decay)

def save(name, x, gain=0.9):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    pcm = (x * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(name, len(pcm) / SR)

os.makedirs(OUT, exist_ok=True)
save('hit_light', thump(0.12, 260, 120, 0.035) * 0.8 + noise(0.12, 0.018, 5000) * 0.6, 0.7)
save('hit_heavy', thump(0.28, 180, 55, 0.09) + noise(0.28, 0.04, 2600) * 0.7 + thump(0.28, 90, 40, 0.14) * 0.5, 0.95)
save('hit_body', thump(0.24, 140, 50, 0.08) + noise(0.24, 0.05, 900) * 0.8, 0.9)
save('block', noise(0.14, 0.03, 1400) * 0.9 + thump(0.14, 200, 110, 0.03) * 0.4, 0.55)
x = t(0.2); sweep = rng.standard_normal(len(x))
save('whoosh', lowpass(sweep, 1800) * np.sin(np.pi * x / 0.2) ** 2, 0.4)
x = t(1.6)
bell = sum(np.sin(2 * np.pi * f * x) * np.exp(-x / d) * a for f, d, a in [(880, 0.9, 1.0), (1320, 0.5, 0.45), (2210, 0.3, 0.3), (2970, 0.18, 0.2)])
save('bell', bell * env(len(x), 0.002, 10.0), 0.6)
x = t(2.2)
crowd = lowpass(rng.standard_normal(len(x)), 1200) + lowpass(rng.standard_normal(len(x)), 500) * 0.8
save('crowd', crowd * np.sin(np.pi * np.clip(x / 2.2, 0, 1)) ** 1.5, 0.5)
save('knockdown', thump(0.6, 120, 38, 0.2) + noise(0.6, 0.12, 600) * 0.9, 0.95)
