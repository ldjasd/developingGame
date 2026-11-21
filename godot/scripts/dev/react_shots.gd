extends Node
## 出拳 / 受击动画关键帧自检：每条动画在其「到顶 / 最大位移」时刻截一张，拼成一张总图。
## 用法：godot --path . res://scenes/dev/react_shots.tscn -- --out=<dir>

var out_dir := "user://react_shots"
const SHOTS := [
	["me", "jab", 0.06], ["me", "straight", 0.125], ["me", "hook", 0.27], ["me", "upper", 0.23], ["me", "body", 0.35],
	["foe", "hit_light", 0.03], ["foe", "hit_face", 0.05], ["foe", "hit_body", 0.05], ["foe", "hit_side", 0.05], ["foe", "stagger", 0.3],
]

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	var main: Control = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	main._on_new_game()
	main._finish_prologue(true)
	main.gs.s["day"] = 7 # 正式赛只在比赛日开打
	main._on_start_battle("opp_rookie", "manual", false)
	await get_tree().create_timer(0.6).timeout
	var imgs: Array[Image] = []
	for s in SHOTS:
		var rig: FighterSprite = main.rig_me if s[0] == "me" else main.rig_foe
		var other: FighterSprite = main.rig_foe if s[0] == "me" else main.rig_me
		other.seek_anim("idle", 0.0)
		rig.seek_anim(s[1], float(s[2]))
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
		var full := get_viewport().get_texture().get_image()
		var im := full.get_region(Rect2i(250, 200, 900, 500)) # 只截两人所在区域，看清细节
		im.resize(450, 250)
		imgs.append(im)
		print("shot ", s[1])
	var w := imgs[0].get_width(); var h := imgs[0].get_height()
	var sheet := Image.create(w * 5, h * 2, false, imgs[0].get_format())
	for i in imgs.size():
		sheet.blit_rect(imgs[i], Rect2i(0, 0, w, h), Vector2i(w * (i % 5), h * (i / 5)))
	sheet.save_png(ProjectSettings.globalize_path(out_dir + "/react_sheet.png"))
	print("REACT_SHOTS_DONE")
	get_tree().quit(0)
