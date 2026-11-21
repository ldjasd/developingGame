extends Node2D
## 帧序列朝向检查：每个有帧序列的对手（站在右侧、应朝左看向主角）× idle / attack 到顶 / hit 前段 / down 末帧。
const STATES := [["idle", 0.0], ["straight", 0.125], ["hit_face", 0.12], ["stagger", 0.35], ["down", 99.0]]

func _ready() -> void:
	var out := "user://facing.png"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out = a.trim_prefix("--out=")
	var keys: Array = FighterSprite.SEQ_IDS.keys()
	get_window().size = Vector2i(STATES.size() * 260, keys.size() * 250)
	RenderingServer.set_default_clear_color(Color(0.15, 0.6, 0.35))
	for r in keys.size():
		for c in STATES.size():
			var f := FighterSprite.create_foe(String(keys[r]))
			add_child(f)
			f.TARGET_H
			f.scale = Vector2(0.5, 0.5)
			f.set_facing(-1)
			f.position = Vector2(c * 260 + 150, r * 250 + 235)
			var st: String = STATES[c][0]
			var t: float = STATES[c][1]
			if t > 50.0:
				t = f.player.get_animation(st).length
			f.seek_anim(st, t)
		var lab := Label.new(); lab.text = String(keys[r]); lab.position = Vector2(4, r * 250 + 4); add_child(lab)
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(out)
	print("FACING_DONE")
	get_tree().quit(0)
