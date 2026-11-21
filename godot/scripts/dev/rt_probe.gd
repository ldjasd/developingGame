extends SceneTree
## 实时战斗内核数据探针：双方都由 AI 打（自动观看同构），统计终结方式、回合、击倒、胜率。
## godot --headless --path . --script res://scripts/dev/rt_probe.gd -- [--n=60] [--hp=2.6] [--decay=0.93] [--rate=1.0]
## 验收线：design/battle.md §11

const DT := 1.0 / 30.0

func _attrs(v: float) -> Dictionary:
	var d := {}
	for k in GameState.ATTR_KEYS:
		d[k] = v
	return d


func _init() -> void:
	var n := 60
	var hp := -1.0
	var decay := -1.0
	var rate := -1.0
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--n="): n = int(arg.substr(4))
		elif arg.begins_with("--hp="): hp = float(arg.substr(5))
		elif arg.begins_with("--decay="): decay = float(arg.substr(8))
		elif arg.begins_with("--rate="): rate = float(arg.substr(7))
	var total := {"n": 0, "dec": 0, "ko": 0, "tko": 0, "trauma": 0, "rounds": 0.0, "kd": 0, "landed": 0}
	var even_w := 0
	var even_n := 0
	var plus6_w := 0
	var plus6_n := 0
	var t0 := Time.get_ticks_msec()
	for cfg in [[20.0, 20.0], [30.0, 30.0], [45.0, 45.0], [30.0, 36.0], [36.0, 30.0], [60.0, 60.0]]:
		var kinds := {}
		var wins := 0
		var rounds := 0.0
		var kds := 0
		for i in n:
			var core := BattleCore.new()
			if hp > 0.0: core.HP_SCALE = hp
			if decay >= 0.0: core.TRAUMA_DECAY_SEC = decay
			if rate > 0.0: core.AI_RATE = rate
			var style: String = ["balanced", "power", "speed", "guardcounter"][i % 4]
			var pa := BattleCore.make("A", true, _attrs(cfg[0]), {"style_key": "balanced", "ai": true, "tell": 0.4})
			var pb := BattleCore.make("B", false, _attrs(cfg[1]), {"style_key": style})
			core.start(pa, pb, 70000 + i * 31)
			var guard := 0
			while not core.finished and guard < 200000:
				core.step(DT)
				guard += 1
			var r := core.result
			var won := bool(r.get("winner_is_a", false))
			if won: wins += 1
			if cfg[0] == cfg[1]:
				even_n += 1
				if won: even_w += 1
			elif cfg[0] > cfg[1]:
				plus6_n += 1
				if won: plus6_w += 1
			else:
				plus6_n += 1
				if not won: plus6_w += 1
			var how := String(r.get("how", "?"))
			kinds[how] = int(kinds.get(how, 0)) + 1
			rounds += float(r.get("rounds_played", 0))
			kds += int(r.get("a_kd", 0)) + int(r.get("b_kd", 0))
			total["landed"] += int(r.get("a_landed", 0)) + int(r.get("b_landed", 0))
			total["n"] += 1
			if how == "点数判定": total["dec"] += 1
			elif how.begins_with("TKO"): total["tko"] += 1
			elif how.contains("重创"): total["trauma"] += 1
			else: total["ko"] += 1
		total["rounds"] += rounds
		total["kd"] += kds
		print("A %d vs B %d | A胜 %d%% | 平均回合 %.2f | 每场击倒 %.2f | %s" % [cfg[0], cfg[1], wins * 100 / n, rounds / n, float(kds) / n, str(kinds)])
	var N := float(total["n"])
	print("TOTAL n=%d 判定 %.0f%% KO(HP) %.0f%% 重创KO %.0f%% TKO %.0f%% 平均回合 %.2f 每场击倒 %.2f 每场命中 %.0f | 势均胜率 %.0f%% | +6 优势胜率 %.0f%% | %.1fs" % [
		total["n"], total["dec"] / N * 100, total["ko"] / N * 100, total["trauma"] / N * 100, total["tko"] / N * 100,
		total["rounds"] / N, total["kd"] / N, total["landed"] / N, even_w * 100.0 / even_n, plus6_w * 100.0 / plus6_n,
		(Time.get_ticks_msec() - t0) / 1000.0])
	quit(0)
