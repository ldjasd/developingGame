extends Node2D
## 对手 rig 验收：-- <out_prefix> <char_id>，截 guard 与 straight_peak 两张。

func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.13, 0.08, 0.25)
	bg.size = Vector2(1280, 800)
	add_child(bg)
	var args := OS.get_cmdline_user_args()
	var out_prefix: String = args[0]
	var char_id: String = args[1]
	var rig := RigFactory.build_rig(char_id)
	# 显示高度与主角测试一致（约 683px）：按纹理高缩放
	var tex_h := 1904.0
	rig.scale = Vector2(683.0 / tex_h, 683.0 / tex_h)
	rig.position = Vector2(430, 55)
	add_child(rig)
	rig.seek_anim("idle", 0.0)
	await _shot(out_prefix + "_guard.png")
	rig.seek_anim("straight", 0.24)
	await _shot(out_prefix + "_straight.png")
	print("OPP_CAPTURED ", char_id)
	get_tree().quit()

func _shot(path: String) -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
