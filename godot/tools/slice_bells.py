"""从拳击铃实录里找「单响」和「连敲」片段（只裁剪 + 短淡入淡出，不变调）。
输入 D:/gamemake/third_party_dl/freesound_bell/，输出同目录 bells/ + bells.csv
"""
import os, glob, subprocess, csv
import numpy as np
SRC = r'D:\gamemake\third_party_dl\freesound_bell'
OUT = os.path.join(SRC, 'bells')
FF = glob.glob(os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\**\ffmpeg.exe'), recursive=True)[0]
SR = 48000

def load(p):
    raw = subprocess.run([FF, '-v', 'error', '-i', p, '-af', 'pan=mono|c0=c0', '-f', 'f32le', '-ar', str(SR), '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def save(p, x):
    subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'pcm_s16le', p], input=x.astype(np.float32).tobytes(), check=True)

def strikes(x):
    hop = int(SR * 0.005)
    env = np.array([np.abs(x[i:i + hop]).max() for i in range(0, len(x) - hop, hop)])
    edb = 20 * np.log10(env + 1e-9); top = np.percentile(edb, 99.9)
    on, last = [], -1e9
    for i in range(3, len(edb)):
        if edb[i] > top - 24 and edb[i] - edb[i - 3:i].min() > 10 and (i - last) * hop / SR > 0.09:
            on.append(i * hop); last = i
    return on

def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for f in sorted(glob.glob(os.path.join(SRC, '*.*'))):
        if os.path.isdir(f): continue
        tag = os.path.basename(f).split('__')[1]
        x = load(f); on = strikes(x)
        # 把间隔 < 0.6s 的敲击归为一组（连敲），组间留出余响
        groups, cur = [], [on[0]] if on else []
        for o in on[1:]:
            if (o - cur[-1]) / SR < 0.6: cur.append(o)
            else: groups.append(cur); cur = [o]
        if cur: groups.append(cur)
        for k, g in enumerate(groups):
            a = max(0, g[0] - int(SR * 0.01))
            nxt = next((h[0] for h in groups[k + 1:]), len(x))
            b = min(nxt - int(SR * 0.05), g[-1] + int(SR * 2.2))
            seg = x[a:b].copy()
            if len(seg) < SR * 0.3: continue
            pk = np.abs(seg).max(); clipped = int((np.abs(seg) >= 0.985).sum())
            fo = int(SR * 0.25); seg[-fo:] *= np.linspace(1, 0, fo) ** 2
            seg[: int(SR * 0.002)] *= np.linspace(0, 1, int(SR * 0.002))
            seg = seg / (pk + 1e-9) * 0.89
            # 余响底噪：最后 0.3s 相对峰值
            tail_db = 20 * np.log10(np.sqrt((x[max(a, b - int(SR * 0.3)):b] ** 2).mean()) / (pk + 1e-9) + 1e-9)
            name = f'{tag}_{k:03d}_{len(g)}x.wav'
            save(os.path.join(OUT, name), seg)
            rows.append({'file': name, 'src': tag, 'dings': len(g), 'start_s': round(a / SR, 2), 'dur_s': round(len(seg) / SR, 2),
                         'peak': round(float(pk), 3), 'clipped': clipped, 'tail_db': round(float(tail_db), 1)})
        print(tag, 'groups', len(groups))
    with open(os.path.join(OUT, 'bells.csv'), 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

if __name__ == '__main__':
    main()
