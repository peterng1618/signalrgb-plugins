"""Rewrite each plugin's ImageUrl() to an embedded data: URI.

SignalRGB loads ImageUrl() as a URL, and the plugin sandbox has no way to
reference its own folder (no __dirname, no relative-path API), so a shipped
plugin cannot point at a photo beside it. Embedding the bytes keeps the image
with the plugin and makes it portable across machines and install paths.

Verified 2026-11-15: SignalRGB 2.5.86 renders a data: URI in ImageUrl().

Usage: python tools/embed_image_urls.py
"""
import base64
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[1]
PLUGINS = {
	"ColorfulZ590M": "colorful-cvn-z590m-gaming-frozen-v20.png",
	"JungleLeopardL10": "jungle-leopard-l10-argb-hub.png",
	"RainbowMusicLedDirect": "rainbow-music-led-monitor-backlight-led-bars.jpg",
	"YunariBridge": "yunari.svg",
}
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml"}
INSTALLED = pathlib.Path.home() / "Documents" / "WhirlwindFX" / "Plugins"
PATTERN = re.compile(r'(export function ImageUrl\(\)\s*\{[^}]*?return\s*")[^"]*(")')

for folder, image_name in PLUGINS.items():
	plugin_dir = ROOT / "plugins" / folder
	plugin = plugin_dir / f"{folder}.js"
	image = plugin_dir / image_name
	mime = MIME[image.suffix]
	uri = f"data:{mime};base64," + base64.b64encode(image.read_bytes()).decode()

	source = plugin.read_text(encoding="utf-8")
	patched, count = PATTERN.subn(lambda m: m.group(1) + uri + m.group(2), source)
	if count != 1:
		raise SystemExit(f"{plugin}: expected one ImageUrl() return, found {count}")
	plugin.write_text(patched, encoding="utf-8")

	installed = INSTALLED / folder / plugin.name
	if installed.exists():
		shutil.copyfile(plugin, installed)

	print(f"{folder}: {len(uri)} char data URI")
