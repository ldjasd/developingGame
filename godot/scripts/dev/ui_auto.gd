extends Node
## 自动模式全程验证：开自动战斗 → 等结束 → 截图结算态 → 回中枢截图。
var out_dir := "res://../research/godot_rig"
var main: Control

func _ready() -> void:
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await get_tree().create_timer(0.5).timeout
	main._on_new_game()
	main._finish_prologue(true) # 新档先走序章：自动验证跳过序章直入中枢（顺带验跳过路径）
	main._on_start_battle("opp_rookie", "auto", false)
	var waited := 0.0
	while not main.battle_over and waited < 120.0:
		await get_tree().create_timer(0.5).timeout
		waited += 0.5
	print("battle_over=", main.battle_over, " waited=", waited)
	await get_tree().create_timer(1.0).timeout
	print("rig_me rotation=", main.rig_me.rotation if main.rig_me else -999.0, " foe rotation=", main.rig_foe.rotation if main.rig_foe else -999.0)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path(out_dir + "/ui_battle_result.png"))
	main._on_battle_exit()
	await get_tree().create_timer(0.5).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path(out_dir + "/ui_hub_after.png"))
	print("UI_AUTO_DONE wins=", int(main.gs.s["wins"]), " losses=", int(main.gs.s["losses"]), " rank=", main.gs.my_rank())
	get_tree().quit(0)
