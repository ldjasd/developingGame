extends Node2D
## 骨骼样板自验场景：命令行驱动截图 / 逐帧录像。
## 用法（xvfb 下）：
##   godot --path . res://scenes/dev/rig_test.tscn -- --mode=shots --out=/abs/dir
##   godot --path . res://scenes/dev/rig_test.tscn -- --mode=video --out=/abs/dir

const ME_JOINTS := {
	"root": [340, 545], "spine": [345, 430], "head": [355, 295],
	"shN": [392, 332], "elN": [343, 443], "wrN": [265, 335],
	"shF": [330, 322], "elF": [252, 418], "wrF": [185, 315],
	"hipN": [330, 560], "kneeN": [255, 665], "ankN": [190, 875],
	"hipF": [362, 572], "kneeF": [390, 715], "ankF": [510, 845],
}

var rig: FighterRig
var mode := "shots"
var out_dir := "/tmp/rigcap"

func _ready() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--mode="):
			mode = arg.trim_prefix("--mode=")
		elif arg.begins_with("--out="):
			out_dir = arg.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(out_dir)
	# 背景
	var bg := ColorRect.new()
	bg.color = Color(0.13, 0.08, 0.25)
	bg.size = Vector2(1280, 800)
	add_child(bg)
	var floor_rect := ColorRect.new()
	floor_rect.color = Color(0.2, 0.13, 0.36)
	floor_rect.position = Vector2(0, 712)
	floor_rect.size = Vector2(1280, 88)
	add_child(floor_rect)
	# 角色
	rig = FighterRig.new()
	var tex: Texture2D = load("res://assets/parts/me/body.webp")
	rig.build(tex, ME_JOINTS)
	rig.position = Vector2(470, 62)
	rig.scale = Vector2(0.68, 0.68)
	add_child(rig)
	if mode == "video":
		_run_video()
	else:
		_run_shots()

func _capture(path: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	print("CAPTURED ", path)

func _run_shots() -> void:
	await get_tree().process_frame
	rig.seek_anim("idle", 0.6)
	await _capture(out_dir + "/shot_guard.png")
	rig.seek_anim("straight", 0.16)
	await _capture(out_dir + "/shot_straight_mid.png")
	rig.seek_anim("straight", 0.24)
	await _capture(out_dir + "/shot_straight_peak.png")
	rig.seek_anim("hit", 0.09)
	await _capture(out_dir + "/shot_hit.png")
	rig.seek_anim("jab", 0.19)
	await _capture(out_dir + "/shot_jab_peak.png")
	get_tree().quit()

func _timeline(t: float) -> Array:
	# 返回 [动画名, 局部时刻]
	if t < 1.2:
		return ["idle", t]
	if t < 1.82:
		return ["straight", t - 1.2]
	if t < 2.6:
		return ["idle", t - 1.82]
	if t < 3.1:
		return ["jab", t - 2.6]
	if t < 3.9:
		return ["idle", t - 3.1]
	if t < 4.28:
		return ["hit", t - 3.9]
	return ["idle", t - 4.28]

func _run_video() -> void:
	await get_tree().process_frame
	var frames := 150
	for i in frames:
		var t := float(i) / 30.0
		var seg := _timeline(t)
		rig.seek_anim(seg[0], float(seg[1]))
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		img.save_png(out_dir + "/f%03d.png" % i)
	print("VIDEO_FRAMES_DONE")
	get_tree().quit()
