extends Node
## 补完一 UI 截图自检：商店（含定制工坊）→ 背包工坊 → 卫冕挑战卡。
## 用法：DISPLAY=:99 godot --path . res://scenes/dev/gear_shots.tscn

var out_dir := "res://../research/godot_rig"
var main: Control

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await _wait(0.5)
	main._on_new_game()
	main.modal.hide() # 关掉序章剧情弹窗，避免遮挡自检画面（真实流程由玩家点掉）
	await _wait(0.4)
	# 备一点钱与材料，让工坊/打造预览呈可用状态
	main.gs.s["money"] = 20000
	main.gs.s["materials"]["calf"] = 6
	main.gs.s["materials"]["latex"] = 6
	main.gs.buy_gear("gloves1")
	main.gs.buy_gear("gloves2")
	main._refresh_hub()
	main._show_shop()
	await _wait(0.6)
	await _shot("ui_shop_list")
	await _scroll_sub_bottom()
	await _shot("ui_shop_custom")
	main._show_bag()
	await _wait(0.6)
	await _shot("ui_bag_top")
	await _scroll_sub_bottom()
	await _shot("ui_bag_workshop")
	# 卫冕挑战卡：把玩家顶到第 1 名并生成挑战
	var rk: Array = main.gs.s["ranking"]
	rk.erase("me")
	rk.insert(0, "me")
	main.gs.s["ranking"] = rk
	main.gs.s["wins"] = 8
	main.gs.maybe_defense_challenge()
	main._show_matches()
	await _wait(0.6)
	await _shot("ui_defense_card")
	print("GEAR_SHOTS_DONE")
	get_tree().quit(0)

func _scroll_sub_bottom() -> void:
	await _wait(0.3)
	var bar: VScrollBar = main.sub_scroll.get_v_scroll_bar()
	bar.value = bar.max_value
	await _wait(0.3)

func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(ProjectSettings.globalize_path(out_dir + "/" + name + ".png"))
	print("shot: ", name)
