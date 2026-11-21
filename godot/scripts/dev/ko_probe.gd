extends SceneTree
## KO 体系数据探针：不同实力差 × 风格，统计终结方式、回合数、击倒次数、胜率。
## godot --headless --path . --script res://scripts/dev/ko_probe.gd

func _attrs(v: float) -> Dictionary:
	var d := {}
	for k in GameState.ATTR_KEYS:
		d[k] = v
	return d

func _init() -> void:
	var total := {"n": 0, "dec": 0, "ko": 0, "tko": 0, "trauma": 0, "rounds": 0.0, "kd": 0}
	for cfg in [[20.0, 20.0], [30.0, 30.0], [45.0, 45.0], [30.0, 36.0], [36.0, 30.0], [60.0, 60.0]]:
		var kinds := {}
		var wins := 0
		var rounds := 0.0
		var kds := 0
		var n := 120
		for i in n:
			var eng := BattleEngine.new()
			eng.rng.seed = 51000 + i * 17
			var style: String = ["balanced", "power", "speed", "guardcounter"][i % 4]
			var pa := BattleEngine.make_fighter("A", true, _attrs(cfg[0]), {"style_key": "balanced"})
			var pb := BattleEngine.make_fighter("B", false, _attrs(cfg[1]), {"style_key": style})
			eng.start(pa, pb)
			var r := eng.simulate_all()
			if bool(r.get("winner_is_a", false)): wins += 1
			var how := String(r.get("how", "?"))
			kinds[how] = int(kinds.get(how, 0)) + 1
			rounds += float(r.get("rounds_played", 0))
			kds += int(r.get("a_kd", 0)) + int(r.get("b_kd", 0))
			total["n"] += 1
			if how == "点数判定": total["dec"] += 1
			elif how.begins_with("TKO"): total["tko"] += 1
			elif how.contains("重创"): total["trauma"] += 1
			else: total["ko"] += 1
		total["rounds"] += rounds
		total["kd"] += kds
		print("A %d vs B %d | A胜 %d%% | 平均回合 %.2f | 每场击倒 %.2f | %s" % [cfg[0], cfg[1], wins * 100 / n, rounds / n, float(kds) / n, str(kinds)])
	var N := float(total["n"])
	print("TOTAL n=%d 判定 %.0f%% KO(HP) %.0f%% 重创KO %.0f%% TKO %.0f%% 平均回合 %.2f 每场击倒 %.2f" % [
		total["n"], total["dec"] / N * 100, total["ko"] / N * 100, total["trauma"] / N * 100, total["tko"] / N * 100, total["rounds"] / N, total["kd"] / N])
	quit(0)
