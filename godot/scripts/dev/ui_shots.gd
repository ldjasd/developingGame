extends Node
## UI 截图自检：标题 → 中枢 → 骨骼对手战斗 → 立绘兜底对手战斗。
## 用法：DISPLAY=:99 godot --path . res://scenes/dev/ui_shots.tscn -- --out=<dir>

var out_dir := "res://../research/godot_rig"
var main: Control

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	for a in args:
		if a.begins_with("--out="):
			out_dir = a.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await _shot("ui_title")
	main._on_new_game()
	main._finish_prologue(true) # 新档先走序章：截图自检跳过序章，保持「中枢」镜头原意
	await _wait(0.6)
	await _shot("ui_hub")
	main.gs.s["day"] = 7 # 正式赛只在比赛日（每周第 7 天）开打
	main._on_start_battle("opp_rookie", "manual", false)
	await _wait(1.2)
	await _shot("ui_battle_guard")
	main._on_player_punch("straight")
	await _wait(0.38)
	await _shot("ui_battle_straight")
	await _wait(1.2)
	main._on_battle_exit()
	await _wait(0.4)
	main.gs.s["last_match_day"] = 0 # 截图自检：同一天再开一场
	main._on_start_battle("opp_counter", "manual", false)
	await _wait(1.0)
	await _shot("ui_battle_portrait")
	print("UI_SHOTS_DONE")
	get_tree().quit(0)

func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(ProjectSettings.globalize_path(out_dir + "/" + name + ".png"))
	print("shot: ", name)
