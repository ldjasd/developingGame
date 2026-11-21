extends SceneTree
## 平衡探针：势均力敌对局的终结方式分布与时长。godot --headless --script 本文件。

func _attrs(v: float) -> Dictionary:
	var d := {}
	for k in GameState.ATTR_KEYS:
		d[k] = v
	return d

func _init() -> void:
	for cfg in [[30.0, 30.0], [45.0, 45.0], [15.0, 15.0]]:
		var kinds := {}
		var total_ex := 0
		var wins_a := 0
		for i in 40:
			var eng := BattleEngine.new()
			eng.rng.seed = 31000 + i * 7
			var pa := BattleEngine.make_fighter("A", true, _attrs(cfg[0]), {"style_key": "balanced"})
			var pb := BattleEngine.make_fighter("B", false, _attrs(cfg[1]), {"style_key": "power"})
			eng.start(pa, pb)
			var ex := 0
			while not eng.finished and ex < 200:
				ex += 1
				var att_is_a := ex % 2 == 1
				var att: Dictionary = eng.a if att_is_a else eng.b
				var foe: Dictionary = eng.b if att_is_a else eng.a
				eng.do_exchange(att_is_a, eng.ai_choose_punch(att, foe), "block" if randf() < 0.25 else "none")
			total_ex += ex
			if bool(eng.result.get("winner_is_a", false)):
				wins_a += 1
			var how := String(eng.result.get("how", "?"))
			kinds[how] = int(kinds.get(how, 0)) + 1
		print("attrs ", cfg[0], " vs ", cfg[1], " -> A胜 ", wins_a, "/40, 平均交换 ", float(total_ex) / 40.0, ", 终结: ", kinds)
	quit(0)
