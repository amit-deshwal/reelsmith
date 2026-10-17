"""Local 2x photo upscaler for Reelsmith (Real-ESRGAN x2plus through spandrel, on the Apple GPU when available).
usage: upscale.py <in> <out> [--tile 256]
Prints one JSON line: {"width":..,"height":..,"seconds":..,"device":..}. No network access."""
import json, sys, time, pathlib
import numpy as np, torch
from PIL import Image
from spandrel import ModelLoader

WEIGHTS = pathlib.Path(__file__).with_name('upscale-models') / 'RealESRGAN_x2plus.pth'

def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    tile = int(sys.argv[sys.argv.index('--tile') + 1]) if '--tile' in sys.argv else 256
    device = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    t0 = time.time()
    model = ModelLoader().load_from_file(str(WEIGHTS)).to(device).eval()
    img = Image.open(src).convert('RGB')
    x = torch.from_numpy(np.array(img)).permute(2, 0, 1).float().div(255).unsqueeze(0).to(device)
    _, _, h, w = x.shape
    s, pad = model.scale, 16
    out = torch.zeros(1, 3, h * s, w * s)
    with torch.inference_mode():
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
                py0, px0, py1, px1 = max(y0 - pad, 0), max(x0 - pad, 0), min(y1 + pad, h), min(x1 + pad, w)
                tile_out = model(x[:, :, py0:py1, px0:px1]).clamp(0, 1).cpu()
                out[:, :, y0 * s:y1 * s, x0 * s:x1 * s] = tile_out[:, :, (y0 - py0) * s:(y0 - py0) * s + (y1 - y0) * s, (x0 - px0) * s:(x0 - px0) * s + (x1 - x0) * s]
    arr = (out[0].permute(1, 2, 0).numpy() * 255).round().astype(np.uint8)
    result = Image.fromarray(arr)
    result.save(dst, quality=95) if dst.lower().endswith(('.jpg', '.jpeg')) else result.save(dst)
    print(json.dumps({'width': arr.shape[1], 'height': arr.shape[0], 'seconds': round(time.time() - t0, 2), 'device': device.type}))

main()
