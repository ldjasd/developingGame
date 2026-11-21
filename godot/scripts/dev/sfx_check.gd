extends Node
## 音效加载自检：每个音效名实际加载到几个变体、来自录音还是合成版。
func _ready() -> void:
	var main: Control = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	for n in ["hit_light", "hit_heavy", "hit_body", "block", "knockdown", "bell", "whoosh", "crowd"]:
		main._sfx(n, -80.0)
		var vs: Array = main._sfx_cache[n]
		print("SFX %s: %d 个变体 · %s" % [n, vs.size(), (vs[0] as Resource).resource_path if vs.size() > 0 else "无"])
	get_tree().quit(0)
