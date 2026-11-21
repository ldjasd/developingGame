"""挥空破风声 + 观众欢呼：从 Freesound CC0 实录切出并轻修（不变调）。
输入 D:/gamemake/third_party_dl/freesound_air_crowd/；输出 assets/audio/air/whoosh_*.wav、assets/audio/crowd/crowd_*.wav
修音：低频缓坡去轰鸣（挥空 120Hz / 观众 80Hz）、淡入淡出、统一音量。
"""
import os, glob, subprocess, wave
import numpy as np
SR = 48000
SRC = r'D:\gamemake\third_party_dl\freesound_air_crowd'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_AIR = os.path.join(HERE, '..', 'assets', 'audio', 'air')
OUT_CROWD = os.path.join(HERE, '..', 'assets', 'audio', 'crowd')
FF = glob.glob(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\**\ffmpeg.exe'), recursive=True)[0]

def load(name):
    raw = subprocess.run([FF, '-v', 'error', '-i', os.path.join(SRC, name), '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-ar', str(SR), '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def wr(folder, name, x):
    os.makedirs(folder, exist_ok=True)
    with wave.open(os.path.join(folder, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def highpass(x, fc):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (f ** 4 / (f ** 4 + fc ** 4)), len(x))

def fades(x, fi, fo):
    a, b = int(SR * fi), int(SR * fo)
    if a: x[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b: x[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return x

def norm(x, peak=0.89):
    return x / (np.abs(x).max() + 1e-9) * peak

def whooshes(name='427979__kinoton__short-whoosh-13x.wav', src=None, thr_db=-24):
    """按包络找每一下的能量块，取块前 60ms ~ 块后 120ms"""
    global SRC
    old = SRC
    if src: SRC = src
    x = load(name)
    SRC = old
    hop = int(SR * 0.01)
    env = np.array([np.sqrt((x[i:i + hop] ** 2).mean()) for i in range(0, len(x) - hop, hop)])
    thr = env.max() * 10 ** (thr_db / 20)
    on = env > thr
    segs, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]: j += 1
            segs.append((i * hop, j * hop)); i = j
        else:
            i += 1
    out = []
    for a, b in segs:
        a = max(0, a - int(SR * 0.06)); b = min(len(x), b + int(SR * 0.12))
        if (b - a) < SR * 0.12: continue
        out.append(x[a:b].copy())
    return out

def main():
    ws = whooshes()
    for k, w in enumerate(ws):
        wr(OUT_AIR, f'whoosh_{k}.wav', norm(fades(highpass(w, 120), 0.01, 0.06)))
    sw = load('395368__ihitokage__swish-5.ogg')
    wr(OUT_AIR, f'whoosh_{len(ws)}.wav', norm(fades(highpass(sw, 120), 0.005, 0.05)))
    pn = load('9509__petenice__whoosh.wav')
    wr(OUT_AIR, 'whoosh_petenice.wav', norm(fades(highpass(pn, 120), 0.003, 0.03)))
    print('whooshes', len(ws) + 1, '+ petenice')
    # 观众：每条取能量最高的 3.2s，淡入 0.15s、淡出 1.2s
    crowds = [('397434__foolboymedia__crowd-cheer.wav', 'crowd_win'), ('629884__kyles__crowd-large-cheer-arena.flac', 'crowd_arena'),
              ('486214__craigsmith__sporting-event-steady-cheers.wav', 'crowd_fight')]
    for f, nm in crowds:
        x = load(f); L = int(SR * 3.2); hop = int(SR * 0.1)
        best = max(range(0, len(x) - L, hop), key=lambda s: float((x[s:s + L] ** 2).mean()))
        seg = x[best:best + L].copy()
        wr(OUT_CROWD, nm + '.wav', norm(fades(highpass(seg, 80), 0.15, 1.2), 0.8))
        print(nm, 'from', round(best / SR, 1), 's')

## 衣物挥动版（用户 2026-11-21：竹竿挥空「像金属东西挥空，不像拳击」）
## 真实出拳的破风主要是手臂和袖子划过空气：更低、更闷、带布料摩擦
CLOTH_SRC = r'D:\gamemake\third_party_dl\freesound_cloth'
CLOTH = [('495390__nox_sound__jacket-whoosh-sequence.wav', 'jacket'), ('391448__saturdaysoundguy__shirt-whoosh-1.wav', 'shirt'),
         ('767407__vrymaa__woosh-collection-01.wav', 'vrymaa'), ('425856__soundholder__tshirt-fast-short-swings.wav', 'tshirt')]

def main_cloth():
    out = os.path.join(HERE, '..', 'assets', 'audio', 'air_cloth')
    for f, tag in CLOTH:
        ws = whooshes(f, CLOTH_SRC, -22)
        ws = [w for w in ws if 0.12 * SR <= len(w) <= 0.7 * SR]
        for k, w in enumerate(ws):
            wr(out, f'{tag}_{k:02d}.wav', norm(fades(highpass(w, 90), 0.008, 0.06)))
        print(tag, len(ws))

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'cloth':
        main_cloth()
    else:
        main()
