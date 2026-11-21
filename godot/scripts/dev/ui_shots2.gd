extends Node
## UI 截图自检（补完三）：序章（开场/测力机/试训）→ 跳过 → 赞助屏（未签约/签约后）。
## 用法：DISPLAY=:99 godot --path . res://scenes/dev/ui_shots2.tscn -- --out=<dir>

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
	await _wait(0.5)
	main._on_new_game() # 新档 → 序章 step 0
	await _wait(0.5)
	await _shot("ui_prologue_start")
	_press("站到测力机前")
	await _wait(0.8) # 力量条来回冲刺中
	await _shot("ui_prologue_punch")
	_press("出拳！")
	await _wait(0.3)
	_press("出拳！")
	await _wait(0.3)
	_press("出拳！")
	await _wait(0.3)
	_press("收拳，回头看看")
	await _wait(0.4)
	_press("天赋？我只是") # 梢姐搭话选项一（好感 +6）
	await _wait(0.3)
	_press("继续")
	await _wait(0.4)
	_press("戴上拳套，上台")
	await _wait(0.4)
	await _shot("ui_prologue_spar")
	_press("跳过序章")
	await _wait(0.5)
	main._show_sponsor()
	await _wait(0.5)
	await _shot("ui_sponsor")
	_press("签约") # 第一家（拉面店，Lv1 可签）
	await _wait(0.4)
	await _shot("ui_sponsor_signed")
	print("UI_SHOTS2_DONE")
	get_tree().quit(0)

func _press(text_sub: String) -> void:
	var b := _find_button(main, text_sub)
	if b:
		b.pressed.emit()
	else:
		printerr("button not found: ", text_sub)

func _find_button(root: Node, text_sub: String) -> Button:
	for c in root.get_children():
		if c is Button and not c.disabled and String(c.text).contains(text_sub):
			return c
		var found := _find_button(c, text_sub)
		if found:
			return found
	return null

func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(ProjectSettings.globalize_path(out_dir + "/" + name + ".png"))
	print("shot: ", name)
