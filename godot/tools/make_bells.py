"""拳击铃：用 TRP 的真实拳击铃实录（Freesound 571096，CC0）做开场铃与终场铃，并修音。
修音链（不变调）：70Hz 以下缓坡去低频轰鸣 → 尾部噪声门 → 短「场馆」混响 → 统一到 -1dBFS。
开场铃 = 一下单响（余响最干净的一条）；终场铃 = 同一只铃的三下真实敲击按 0.3s 间隔叠成「铛-铛-铛」。
输入：third_party_dl/freesound_bell/bells/（tools/slice_bells.py 切出）；输出：assets/audio/bell/
"""
import os, wave
import numpy as np
SR = 48000
SRC = r'D:\gamemake\third_party_dl\freesound_bell\bells'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'audio', 'bell')
rng = np.random.default_rng(3)

def rd(n):
    with wave.open(os.path.join(SRC, n + '.wav')) as w:
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768

def wr(name, x):
    os.makedirs(OUT, exist_ok=True)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def highpass(x, fc=70):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (f ** 4 / (f ** 4 + fc ** 4)), len(x))

def gate_tail(x, floor_db=-48.0, win=0.03):
    """噪声门：包络低于峰值 floor_db 后平滑压掉，去掉余响尾部的底噪"""
    n = int(SR * win)
    env = np.sqrt(np.convolve(x ** 2, np.ones(n) / n, mode='same'))
    thr = np.abs(x).max() * 10 ** (floor_db / 20)
    g = np.clip((env - thr * 0.5) / (thr * 0.5), 0, 1)
    g = np.convolve(g, np.ones(n) / n, mode='same')  # 平滑，避免抽吸感
    return x * g

def hall(x, rt=1.1, mix=0.14):
    N = int(SR * rt)
    t = np.arange(N) / SR
    X = np.fft.rfft(rng.standard_normal(N)); f = np.fft.rfftfreq(N, 1 / SR)
    ir = np.fft.irfft(X / (1 + (f / 5000) ** 2), N) * np.exp(-t / (rt / 6.9))
    ir[: int(SR * 0.012)] = 0  # 12ms 预延迟
    ir /= np.abs(ir).sum() + 1e-9
    wet = np.convolve(x, ir)
    wet *= np.abs(x).max() / (np.abs(wet).max() + 1e-9)
    out = np.zeros(len(wet)); out[:len(x)] += x
    return out + wet * mix

def finish(x):
    x = x / (np.abs(x).max() + 1e-9) * 0.89
    fo = int(SR * 0.08); x[-fo:] *= np.linspace(1, 0, fo)
    return x

def main():
    # 开场铃：余响最干净的单响
    start = rd('trp_001_1x')
    start = finish(hall(gate_tail(highpass(start))))
    wr('bell_start.wav', start)
    # 终场铃：三下真实敲击（不同条，避免机械重复），0.30s 间隔叠加，最后一下保留完整余响
    hits = [rd('trp_000_1x'), rd('trp_002_1x'), rd('trp_001_1x')]
    gap = int(SR * 0.30)
    total = gap * 2 + len(hits[-1])
    end = np.zeros(total)
    for i, h in enumerate(hits):
        h = h / (np.abs(h).max() + 1e-9) * (0.9 if i < 2 else 1.0)
        if i < 2:  # 前两下：被下一下盖住，只留 0.6s 并自然衰减
            n6 = min(len(h), int(SR * 0.6))
            h = h[:n6] * np.cos(np.linspace(0, np.pi / 2, n6)) ** 1.5  # 平滑衰减到 0，避免截断爆音
        end[i * gap: i * gap + len(h)] += h[: total - i * gap]
    end = finish(hall(gate_tail(highpass(end))))
    wr('bell_end.wav', end)
    print('bell_start', round(len(start) / SR, 2), 's | bell_end', round(len(end) / SR, 2), 's')

if __name__ == '__main__':
    main()
