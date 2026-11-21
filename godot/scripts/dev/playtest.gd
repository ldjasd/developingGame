extends Node
## 自动试玩：按「普通玩家」策略驱动真实 UI 代码跑一整段生涯，记录数据，可选截图。
## 用法：godot --path . res://scenes/dev/playtest.tscn -- --weeks=20 --out=<dir> [--shots] [--seed=N] [--policy=normal|grind]
##  normal：每周只在第 7 天打 1 场正式赛（照设计意图玩）
##  grind ：每天都打正式赛（检验有没有刷法）

var out_dir := "user://playtest"
var weeks := 20
var shots := false
var policy := "normal"
var main: Control
var gs
var log_rows: Array = []
var notes: Array = []
var shot_taken := {}

func _ready() -> void:
	var seed := 1
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.trim_prefix("--out=")
		if a.begins_with("--weeks="): weeks = int(a.trim_prefix("--weeks="))
		if a == "--shots": shots = true
		if a.begins_with("--seed="): seed = int(a.trim_prefix("--seed="))
		if a.begins_with("--policy="): policy = a.trim_prefix("--policy=")
	seed(seed)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	main = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await _frames(2)
	await _shot("01_title")
	main._on_new_game()
	await _frames(2)
	await _shot("02_prologue")
	main._finish_prologue(true)
	gs = main.gs
	main.rng.seed = seed
	await _frames(2)
	await _shot("03_hub")
	var start_ms := Time.get_ticks_msec()
	while int(gs.s["week"]) <= weeks:
		await _play_day()
	_report(Time.get_ticks_msec() - start_ms)
	get_tree().quit(0)

func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame

func _shot(name: String) -> void:
	if not shots or shot_taken.has(name):
		return
	shot_taken[name] = true
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path(out_dir + "/" + name + ".png"))

func _close_modal() -> void:
	var guard := 0
	while main.modal.visible and guard < 6:
		guard += 1
		await _shot("09_event_modal")
		var btns: Array = main.modal_choices.get_children().filter(func(c): return c is Button and not c.is_queued_for_deletion())
		if btns.is_empty():
			main.modal.hide()
		else:
			btns[0].emit_signal("pressed")
		await _frames(1)

func _train_day() -> void:
	# 普通玩家：疲劳高就休息，否则挑当前最低属性对应的训练
	var attr_train := {"power": "strength", "endurance": "run", "will": "meditation", "speed": "speedball",
		"accuracy": "pads", "footwork": "rope", "defense": "dodgeball", "technique": "shadow"}
	var guard := 0
	while int(gs.s["ap"]) >= 2 and guard < 6:
		guard += 1
		if int(gs.s["fatigue"]) >= 70 or int(gs.s["injury"]) >= 40:
			if gs.do_rest() == "":
				break
			continue
		var keys: Array = attr_train.keys()
		keys.sort_custom(func(x, y): return float(gs.s["attrs"][x]) < float(gs.s["attrs"][y]))
		var done := false
		for k in keys:
			if gs.do_training(attr_train[k]) != "":
				done = true
				break
		if not done:
			if gs.do_rest() == "":
				break
	if not shot_taken.has("04_trainings"):
		main._show_trainings(); await _shot("04_trainings")
		main._show_shop(); await _shot("05_shop")
		main._show_bag(); await _shot("06_bag")
		main._show_sponsor(); await _shot("07_sponsor")
		main._show_ranking(); await _shot("08_ranking")
		main._show_sub_main()

func _fight() -> void:
	var cands: Array = main._match_candidates()
	if cands.is_empty():
		return
	# 挑名次最高（最强）的候选
	cands.sort_custom(func(x, y): return gs.rank_of(x) < gs.rank_of(y))
	var key := String(cands[0])
	var foe_rank: int = gs.rank_of(key)
	var my_rank_before: int = gs.my_rank()
	var money_before := int(gs.s["money"])
	main._on_start_battle(key, "manual", false)
	if main.engine == null or not main.scr_battle.visible:
		return # 被规则拦下（非比赛日 / 今日已赛）
	await _frames(2)
	await _shot("10_battle_start")
	var exchanges := 0
	while not main.battle_over and exchanges < 200:
		exchanges += 1
		if main.player_turn:
			var r := randf()
			var p := "jab" if r < 0.25 else ("straight" if r < 0.55 else ("hook" if r < 0.72 else ("body" if r < 0.87 else "upper")))
			main._on_player_punch(p)
		else:
			var r2 := randf()
			main._on_player_defend("block" if r2 < 0.45 else ("dodge" if r2 < 0.75 else "none"))
		if exchanges == 3:
			await _frames(4)
			await _shot("11_battle_mid")
	await _frames(2)
	await _shot("12_battle_end")
	var eng = main.engine
	var res: Dictionary = eng.result
	log_rows.append({
		"week": int(gs.s["week"]), "day": int(gs.s["day"]), "foe": key, "foe_rank": foe_rank,
		"my_rank_before": my_rank_before, "win": bool(res.get("winner_is_a", false)), "how": String(res.get("how", "?")),
		"rounds": int(res.get("rounds_played", 0)), "exchanges": exchanges,
		"my_hp_pct": float(eng.a["hp"]) / float(eng.a["max_hp"]), "foe_hp_pct": float(eng.b["hp"]) / float(eng.b["max_hp"]),
		"my_kd": int(eng.a["knockdowns_total"]), "foe_kd": int(eng.b["knockdowns_total"]),
		"attr_avg": _attr_avg(), "money_gain": 0,
	})
	main._on_battle_exit()
	log_rows[-1]["money_gain"] = int(gs.s["money"]) - money_before
	log_rows[-1]["my_rank_after"] = gs.my_rank()
	await _frames(1)
	await _shot("13_hub_after_match")
	await _close_modal()

func _attr_avg() -> float:
	var t := 0.0
	for k in gs.s["attrs"].keys():
		t += float(gs.s["attrs"][k])
	return t / float(gs.s["attrs"].size())

func _play_day() -> void:
	await _close_modal()
	var dow := (int(gs.s["day"]) - 1) % 7 + 1
	if policy == "grind":
		await _fight()
		await _fight()
	elif dow == 7:
		await _fight()
	await _train_day()
	main._on_sleep()
	await _frames(1)
	await _close_modal()

func _report(ms: int) -> void:
	var f := FileAccess.open(ProjectSettings.globalize_path(out_dir + "/matches_%s.csv" % policy), FileAccess.WRITE)
	var keys := ["week", "day", "foe", "foe_rank", "my_rank_before", "my_rank_after", "win", "how", "rounds", "exchanges", "my_hp_pct", "foe_hp_pct", "my_kd", "foe_kd", "attr_avg", "money_gain"]
	f.store_line(",".join(keys))
	for r in log_rows:
		var vals: Array = []
		for k in keys:
			vals.append(str(r.get(k, "")))
		f.store_line(",".join(vals))
	f.close()
	var wins := 0
	var r1 := 0
	var hows := {}
	for r in log_rows:
		if r["win"]: wins += 1
		if int(r["rounds"]) <= 1: r1 += 1
		hows[r["how"]] = int(hows.get(r["how"], 0)) + 1
	print("PLAYTEST policy=%s weeks=%d matches=%d wins=%d R1-finish=%d hows=%s" % [policy, weeks, log_rows.size(), wins, r1, str(hows)])
	print("FINAL rank=%d money=%d stage=%d influence=%d attr_avg=%.1f achievements=%d injury=%d mind=%d" % [
		gs.my_rank(), int(gs.s["money"]), int(gs.s["stage"]), int(gs.s["influence"]), _attr_avg(),
		Array(gs.s["achievements"]).size(), int(gs.s["injury"]), int(gs.s["mind"])])
	print("ELAPSED_MS ", ms)
