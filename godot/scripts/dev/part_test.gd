extends Node2D
## 部件隔离渲染：只显示指定部件（参数 only=<部件名片段>），或隐藏指定部件（hide=<片段>）。

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
	var args := OS.get_cmdline_user_args()
	var out_path: String = args[0]
	var mode: String = args[1] if args.size() > 1 else ""
	for child in rig.get_children():
		if child is Polygon2D:
			var pname: String = child.name
			if mode.begins_with("only=") and not pname.contains(mode.trim_prefix("only=")):
				child.visible = false
			if mode.begins_with("hide=") and pname.contains(mode.trim_prefix("hide=")):
				child.visible = false
			print("PART ", pname, " verts=", child.polygon.size(), " visible=", child.visible)
	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(out_path)
	print("PART_CAPTURED")
	get_tree().quit()
