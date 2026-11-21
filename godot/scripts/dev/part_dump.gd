extends SceneTree
## 离线诊断：复刻 FighterRig 的部件纹理生成，把 head 部件纹理存盘检查。

func _init() -> void:
	var tex: Texture2D = load("res://assets/parts/me/body.webp")
	var src := tex.get_image()
	var region: Array = [Vector2(280, 130), Vector2(330, 25), Vector2(450, 0), Vector2(585, 25), Vector2(645, 110), Vector2(640, 235), Vector2(575, 320), Vector2(480, 355), Vector2(395, 340), Vector2(320, 305), Vector2(275, 225)]
	var w := src.get_width()
	var h := src.get_height()
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.1, 0.1, 0.2, 1))
	for y in range(0, 360):
		for x in range(260, 650):
			var c := src.get_pixel(x, y)
			if c.a <= 0.001:
				continue
			var f := _region_factor(Vector2(x, y), region)
			if f <= 0.001:
				continue
			c.a *= f
			img.set_pixel(x, y, c)
	img.save_png("/home/hatch/workspace/game/boxing/research/godot_rig/part_head_tex.png")
	print("DUMPED")
	quit()

func _region_factor(p: Vector2, region: Array) -> float:
	if not _point_in_polygon(p, region):
		return 0.0
	var d := 1e18
	for i in region.size():
		var a: Vector2 = region[i]
		var b: Vector2 = region[(i + 1) % region.size()]
		d = minf(d, FighterRig._dist_to_segment(p, a, b))
	return clampf(d / 9.0, 0.0, 1.0)

static func _point_in_polygon(p: Vector2, region: Array) -> bool:
	var inside := false
	var n := region.size()
	for i in n:
		var a: Vector2 = region[i]
		var b: Vector2 = region[(i + 1) % n]
		if (a.y > p.y) != (b.y > p.y):
			var x_int := a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y)
			if p.x < x_int:
				inside = not inside
	return inside
