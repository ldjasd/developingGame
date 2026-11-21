extends Node2D
## 静态绑定姿势诊断：只 build、不播动画，打印骨骼全局变换并截图。

const ME_JOINTS := {
	"root": [340, 545], "spine": [345, 430], "head": [355, 295],
	"shN": [392, 332], "elN": [343, 443], "wrN": [265, 335],
	"shF": [330, 322], "elF": [252, 418], "wrF": [185, 315],
	"hipN": [330, 560], "kneeN": [255, 665], "ankN": [190, 875],
	"hipF": [362, 572], "kneeF": [390, 715], "ankF": [510, 845],
}

func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.13, 0.08, 0.25)
	bg.size = Vector2(1280, 800)
	add_child(bg)
	var rig := FighterRig.new()
	var tex: Texture2D = load("res://assets/parts/me/body.webp")
	rig.build(tex, ME_JOINTS)
	rig.position = Vector2(470, 62)
	rig.scale = Vector2(0.68, 0.68)
	add_child(rig)
	await get_tree().process_frame
	await get_tree().process_frame
	for name in rig.bones.keys():
		var b: Bone2D = rig.bones[name]
		print("BONE ", name, " local_pos=", b.position, " global_pos=", b.global_position, " rest_origin=", b.rest.origin, " global_rot=", b.global_rotation)
	var poly: Polygon2D = rig.get_node("Body")
	print("VERTS ", poly.polygon.size(), " BONES_ARR ", poly.bones.size())
	var args := OS.get_cmdline_user_args()
	var dmode: String = args[1] if args.size() > 1 else "full"
	if dmode.begins_with("solo"):
		var idx := int(dmode.trim_prefix("solo"))
		var arr: Array = []
		for bi in range(0, poly.bones.size(), 2):
			var ws: PackedFloat32Array = poly.bones[bi + 1]
			if bi != idx * 2:
				ws = PackedFloat32Array()
				ws.resize(poly.polygon.size())
			arr.append(poly.bones[bi])
			arr.append(ws)
		poly.bones = arr
		print("SOLO bone ", poly.bones[idx * 2])
	if dmode == "noskel":
		poly.skeleton = NodePath("")
	elif dmode == "rootonly":
		var arr: Array = []
		for bi in range(0, poly.bones.size(), 2):
			var ws: PackedFloat32Array = poly.bones[bi + 1]
			if bi > 0:
				ws = PackedFloat32Array()
				ws.resize(poly.polygon.size())
			arr.append(poly.bones[bi])
			arr.append(ws)
		poly.bones = arr
		print("ROOTONLY readback bone2 w[100]=", poly.bones[3][100], " bone0 w[100]=", poly.bones[1][100])
	elif dmode == "onerot":
		rig.bones["Head"].rotation = deg_to_rad(30.0)
		print("ONEROT applied")
	elif dmode == "rerest":
		for bname in rig.bones.keys():
			var bb: Bone2D = rig.bones[bname]
			bb.rest = bb.transform
		await get_tree().process_frame
		await get_tree().process_frame
		print("REREST applied")
	print("DMODE ", dmode)
	# 全零权重顶点统计
	var zero_count := 0
	var zero_pts: Array = []
	for i in poly.polygon.size():
		var s := 0.0
		for bi in range(0, poly.bones.size(), 2):
			s += poly.bones[bi + 1][i]
		if s <= 0.0001:
			zero_count += 1
			zero_pts.append(poly.polygon[i])
	print("ZERO_WEIGHT_VERTS ", zero_count, " / ", poly.polygon.size())
	var zs := ""
	for p in zero_pts:
		zs += str(p) + " "
	print("ZERO_PTS ", zs)
	# 权重诊断：找离目标点最近的顶点，打印其 11 骨权重
	var skel: Skeleton2D = rig.get_node("Skeleton2D")
	for bi in range(0, poly.bones.size(), 2):
		var p: NodePath = poly.bones[bi]
		var node := skel.get_node_or_null(p)
		print("BONPATH ", p, " -> ", node)
	var targets := [Vector2(560, 90), Vector2(355, 200), Vector2(350, 430), Vector2(340, 560), Vector2(200, 330), Vector2(255, 665)]
	for t in targets:
		var best := -1
		var bd := 1e9
		for i in poly.polygon.size():
			var d := poly.polygon[i].distance_squared_to(t)
			if d < bd:
				bd = d
				best = i
		var ws := []
		for bi in range(0, poly.bones.size(), 2):
			ws.append(snappedf(poly.bones[bi + 1][best], 0.01))
		print("VTX ", poly.polygon[best], " weights=", ws)
	poly.queue_redraw()
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(OS.get_cmdline_user_args()[0] if OS.get_cmdline_user_args().size() > 0 else "/tmp/rig_debug.png")
	print("DEBUG_CAPTURED")
	get_tree().quit()
