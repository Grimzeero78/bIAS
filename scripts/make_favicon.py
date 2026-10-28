#!/usr/bin/env python3
"""Generate TrueMerit favicon assets: favicon.ico (16/32/48) + apple-icon.png (180)."""
from PIL import Image, ImageDraw
import os

APP = "/home/z/my-project/src/app"
os.makedirs(APP, exist_ok=True)

# Draw the TrueMerit scales mark at high resolution, then downscale.
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded-square background (dark ink gradient approximation)
bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(bg)
bd.rounded_rectangle([0, 0, S - 1, S - 1], radius=240, fill=(12, 20, 32, 255))
bd.rounded_rectangle([1, 1, S - 2, S - 2], radius=239, outline=(148, 163, 184, 56), width=4)
img.alpha_composite(bg)

# gradient stroke: emerald -> gold (interpolate along y)
def grad_color(t):
    # t: 0 top (emerald) -> 1 bottom (gold)
    em = (16, 185, 129)
    go = (229, 184, 75)
    mid = (45, 212, 168)
    if t < 0.55:
        k = t / 0.55
        c = tuple(int(em[i] + (mid[i] - em[i]) * k) for i in range(3))
    else:
        k = (t - 0.55) / 0.45
        c = tuple(int(mid[i] + (go[i] - mid[i]) * k) for i in range(3))
    return c + (255,)

W = 62  # stroke width

def line(x1, y1, x2, y2):
    d.line([x1, y1, x2, y2], fill=grad_color((y1 + y2) / 2 / S), width=W)
    r = W // 2
    for (x, y) in [(x1, y1), (x2, y2)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=grad_color(y / S))

def polyline(pts):
    for i in range(len(pts) - 1):
        line(*pts[i], *pts[i + 1])

def arc_v(pts):
    """V-shaped pan with rounded joints"""
    polyline(pts)

# scale geometry (relative to 64-unit design, scaled by 16)
u = S / 64.0
L = lambda v: int(v * u)

# beam
line(L(17), L(21), L(47), L(21))
# finial dot
fr = L(3.2)
d.ellipse([L(32) - fr, L(16) - fr, L(32) + fr, L(16) + fr], fill=grad_color(0.3))
# post
line(L(32), L(19), L(32), L(45))
# base
line(L(24), L(49), L(40), L(49))
# left pan V
arc_v([(L(10), L(24)), (L(17), L(35.5)), (L(24), L(24))])
# right pan V
arc_v([(L(40), L(24)), (L(47), L(35.5)), (L(54), L(24))])

# apple-icon 180
img.resize((180, 180), Image.LANCZOS).save(f"{APP}/apple-icon.png")

# favicon.ico with 16/32/48
sizes = [16, 32, 48]
frames = [img.resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(f"{APP}/favicon.ico", format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])

# also drop a 512 png for PWA/og usage
img.resize((512, 512), Image.LANCZOS).save("/home/z/my-project/public/icon-512.png")
print("favicon assets written:", os.listdir(APP))
