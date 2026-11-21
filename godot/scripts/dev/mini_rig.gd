extends Node2D
## 最小蒙皮复现：2 根骨头 + 渐变权重网格。参数：-- <out.png> <variant>
## variant: base | scaled | child | rot

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var out: String = args[0] if args.size() > 0 else "/tmp/mini.png"
	var variant: String = args[1] if args.size() > 1 else "base"
	var bg := ColorRect.new()
	bg.color = Color(0.1, 0.1, 0.15)
	bg.size = Vector2(1280, 800)
	add_child(bg)
	var holder := Node2D.new()
	if variant != "detached":
		add_child(holder)
	if variant == "scaled":
		holder.position = Vector2(300, 200)
		holder.scale = Vector2(0.68, 0.68)
	# 纹理：棋盘格 400x200
	var img := Image.create(400, 200, false, Image.FORMAT_RGBA8)
	for y in 200:
		for x in 400:
			var c := Color(0.9, 0.3, 0.3) if (x / 25 + y / 25) % 2 == 0 else Color(0.3, 0.3, 0.9)
			img.set_pixel(x, y, c)
	var tex := ImageTexture.create_from_image(img)
	# 骨骼
	var skel := Skeleton2D.new()
	skel.name = "Skeleton2D"
	holder.add_child(skel)
	var root := Bone2D.new()
	root.name = "Root"
	root.set_autocalculate_length_and_angle(false)
	root.position = Vector2(50, 100)
	skel.add_child(root)
	var child := Bone2D.new()
	child.name = "Child"
	child.set_autocalculate_length_and_angle(false)
	child.position = Vector2(150, 0)
	root.add_child(child)
	root.rest = root.transform
	child.rest = child.transform
	# 网格：x 0..400 step 25, y 0..200 step 25；权重按 x 平滑过渡 Root->Child（接缝在 x=200）
	var poly := Polygon2D.new()
	poly.name = "Body"
	poly.texture = tex
	var verts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var grid: Dictionary = {}
	var step := 25
	for gx in range(0, 401, step):
		for gy in range(0, 201, step):
			grid[Vector2i(gx, gy)] = verts.size()
			verts.append(Vector2(gx, gy))
			uvs.append(Vector2(gx, gy))
	var tris: Array = []
	for gx in range(0, 400, step):
		for gy in range(0, 200, step):
			var a = grid[Vector2i(gx, gy)]
			var b = grid[Vector2i(gx + step, gy)]
			var c = grid[Vector2i(gx, gy + step)]
			var d = grid[Vector2i(gx + step, gy + step)]
			tris.append(PackedInt32Array([a, b, c]))
			tris.append(PackedInt32Array([b, d, c]))
	poly.polygon = verts
	poly.uv = uvs
	poly.polygons = tris
	var wroot := PackedFloat32Array()
	var wchild := PackedFloat32Array()
	for v in verts:
		var t: float = clampf((v.x - 140.0) / 120.0, 0.0, 1.0)
		wroot.append(1.0 - t)
		wchild.append(t)
	poly.bones = [NodePath("Root"), wroot, NodePath("Root/Child"), wchild]
	if variant == "child":
		skel.add_child(poly)
	else:
		holder.add_child(poly)
	poly.skeleton = NodePath("../Skeleton2D") if variant != "child" else NodePath("..")
	if variant == "rot":
		child.rotation = deg_to_rad(45.0)
	if variant == "detached":
		add_child(holder)
	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(out)
	print("MINI_CAPTURED ", variant)
	get_tree().quit()
