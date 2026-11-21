"""把 Freesound CC0 拳套实录切成单发打击音（只裁剪 + 2ms 淡入/25ms 淡出防爆音，不变调、不滤波、不压缩）。
输入：D:/gamemake/third_party_dl/freesound/*（仓库外原始下载）
输出：D:/gamemake/third_party_dl/freesound/slices/<来源>_<序号>.wav + slices.csv（峰值、能量、亮度，供挑选）
用法：python slice_hits.py
"""
import os, glob, subprocess, csv
import numpy as np

SRC = r'D:\gamemake\third_party_dl\freesound'
OUT = os.path.join(SRC, 'slices')
FF = glob.glob(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\**\ffmpeg.exe'), recursive=True)[0]
SR = 48000

def load(path):
    # 只取左声道（双声道相加会把峰值顶到 1.414 导致削波）；不重采样（原文件已是 48kHz）
    raw = subprocess.run([FF, '-v', 'error', '-i', path, '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-ar', str(SR), '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def save(path, x):
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', path],
                   input=x.astype(np.float32).tobytes(), check=True)

def onsets(x, min_gap=0.12, thr_db=-26.0):
    hop = int(SR * 0.002)
    frames = len(x) // hop
    env = np.array([np.abs(x[i * hop:(i + 1) * hop]).max() for i in range(frames)])
    env_db = 20 * np.log10(env + 1e-9)
    peak_db = env_db.max()
    on = []
    last = -1e9
    for i in range(2, frames):
        rise = env_db[i] - env_db[max(0, i - 4):i].min()
        if env_db[i] > peak_db + thr_db and rise > 14 and (i - last) * hop / SR > min_gap:
            on.append(i * hop); last = i
    return on

def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for f in sorted(glob.glob(os.path.join(SRC, '*.*'))):
        if os.path.isdir(f): continue
        tag = os.path.basename(f).split('__')[1] if '__' in f else os.path.basename(f)
        x = load(f)
        ons = onsets(x)
        for k, o in enumerate(ons):
            a = max(0, o - int(SR * 0.008))
            nxt = ons[k + 1] - int(SR * 0.01) if k + 1 < len(ons) else len(x)
            b = min(nxt, a + int(SR * 0.45))
            seg = x[a:b].copy()
            if len(seg) < int(SR * 0.05): continue
            # 尾部：降到峰值 -45dB 以下就截掉
            pk = np.abs(seg).max()
            above = np.where(np.abs(seg) > pk * 10 ** (-45 / 20))[0]
            seg = seg[: max(above[-1] + int(SR * 0.02), int(SR * 0.06))]
            clipped = int((np.abs(seg) >= 0.985).sum())  # 原始录音里已削波的采样数（>0 的会有失真）
            fi, fo = int(SR * 0.002), min(int(SR * 0.025), len(seg) // 3)
            seg[:fi] *= np.linspace(0, 1, fi); seg[-fo:] *= np.linspace(1, 0, fo)
            seg = seg / (np.abs(seg).max() + 1e-9) * 0.89  # 只调音量：统一到 -1dBFS 峰值
            X = np.abs(np.fft.rfft(seg)); fr = np.fft.rfftfreq(len(seg), 1 / SR)
            cen = float((X * fr).sum() / (X.sum() + 1e-9))
            low = float(X[fr < 250].sum() / (X.sum() + 1e-9))
            rms = float(np.sqrt((seg ** 2).mean()))
            name = f'{tag}_{k:03d}.wav'
            save(os.path.join(OUT, name), seg)
            rows.append({'file': name, 'src': tag, 'dur_ms': round(len(seg) / SR * 1000), 'peak': round(float(pk), 3), 'clipped': clipped,
                         'rms': round(rms, 4), 'centroid': round(cen), 'low250': round(low, 2)})
        print(tag, 'hits', len(ons))
    with open(os.path.join(OUT, 'slices.csv'), 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    print('total', len(rows))

if __name__ == '__main__':
    main()
