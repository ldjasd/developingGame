extends Node
## 打击特效自检：构造命中事件喂给真实的 _play_exchange_visuals，命中后瞬间截图；再截倒地→起身过程。
## 用法：godot --path . res://scenes/dev/fx_shots.tscn -- --out=<dir> [--foe=opp_rookie]

var main: Control
var out_dir := "user://fx_shots"

func _ready() -> void:
	var foe := "opp_rookie"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.trim_prefix("--out=")
		if a.begins_with("--foe="): foe = a.trim_prefix("--foe=")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	main._on_new_game()
	main._finish_prologue(true)
	main.gs.s["day"] = 7
	main._on_start_battle(foe, "manual", false)
	await get_tree().create_timer(0.5).timeout
	var imgs: Array[Image] = []
	var cases := [
		{"att_is_a": true, "punch": "jab", "kind": "hit", "dmg": 6.0},
		{"att_is_a": true, "punch": "straight", "kind": "hit", "dmg": 14.0},
		{"att_is_a": true, "punch": "body", "kind": "hit", "dmg": 12.0},
		{"att_is_a": false, "punch": "hook", "kind": "block", "dmg": 4.0},
		{"att_is_a": true, "punch": "upper", "kind": "hit", "dmg": 22.0, "knockdown": true},
	]
	for ev in cases:
		main.rig_me.play_anim("idle"); main.rig_foe.play_anim("idle")
		await get_tree().create_timer(0.3).timeout
		main._play_exchange_visuals(ev)
		await get_tree().create_timer(0.07, true, false, true).timeout
		imgs.append(await _grab())
	# 倒地 → 读秒 → 起身 时间序列（上一条 knockdown 已触发）
	for t in [0.5, 0.9, 1.6, 3.2, 4.4]:
		await get_tree().create_timer(t - (0.0 if t == 0.5 else 0.0), true, false, true).timeout
		imgs.append(await _grab())
	var w := imgs[0].get_width(); var h := imgs[0].get_height()
	var sheet := Image.create(w * 5, h * 2, false, imgs[0].get_format())
	for i in imgs.size():
		sheet.blit_rect(imgs[i], Rect2i(0, 0, w, h), Vector2i(w * (i % 5), h * (i / 5)))
	sheet.save_png(ProjectSettings.globalize_path(out_dir + "/fx_%s.png" % foe))
	print("FX_SHOTS_DONE")
	get_tree().quit(0)

func _grab() -> Image:
	await RenderingServer.frame_post_draw
	var im := get_viewport().get_texture().get_image().get_region(Rect2i(250, 150, 900, 560))
	im.resize(450, 280)
	return im
