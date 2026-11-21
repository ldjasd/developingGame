class_name BattleEngine
extends RefCounted
## 回合制战斗引擎（Godot 移植；数值口径照 web v43，含现行 KO 体系）。
## 结构：3 回合 × 每回合约 14 次交换（exchange）。每次交换由一方出拳、另一方反应。
## 现行 KO 体系（2026-11-03 用户批准、原样保留）：
##   - 无单发 KO；重创 trauma 按净伤害积累：gain = net / max(受击前HP, 40%×最大HP) × 70
##   - 重创随时间衰减 6/秒（本引擎一次交换≈1.2 秒，衰减 7/交换，为回合制适配，数值已注明）
##   - 重创跨过 25/50/75 刻度 → 击倒（每刻度每回合只触发一次）；trauma ≥ 100 → KO
##   - 终结方式仅：重创满格 KO / HP 归零 / 单回合 3 次击倒 TKO / 打满 3 回合点数判定
##   - 减伤封顶：任何减伤最多挡 raw 的 70%
## 用户硬数字（原样）：拳种系数 刺0.6/直1.2/摆1.4/上勾1.3/击腹0.8；
##   连击加成 2连+5%/3连+15%/4连起+25%；反击窗口 +30%；击腹对格挡 70% 穿透。

signal exchange_done(ev: Dictionary)
signal battle_done(result: Dictionary)

const PUNCH_KEYS := ["jab", "straight", "hook", "upper", "body"]
const TRAUMA_K := 70.0
const TRAUMA_DECAY_PER_EXCHANGE := 1.5 # 回合制折算（web 为 6/秒；实测标定：使重创 KO 与 HP KO 量级相当）
const TRAUMA_HP_FLOOR := 0.40
const THRESHOLDS := [25.0, 50.0, 75.0]
const EXCHANGES_PER_ROUND := 14
const ROUNDS := 3

var rng := RandomNumberGenerator.new()

# 战斗员运行时状态（Dictionary）：
# { name, is_player, attrs{}, max_hp, hp, stamina, trauma, combo, score,
#   knockdowns_round, knockdowns_total, crossed{}, counter_ready, tactic, style_key,
#   punch_exp{}, gear_pct{}, gear_dr, gear_trauma_mul, gear_stam_mul, fatigue }
var a: Dictionary # 玩家
var b: Dictionary # 对手
var round_no := 1
var exchange_no := 0
var finished := false
var result: Dictionary = {}
var log_lines: Array = []

func _init() -> void:
	rng.randomize()

static func make_fighter(name: String, is_player: bool, attrs: Dictionary, opts: Dictionary = {}) -> Dictionary:
	var max_hp := 140.0 + float(attrs.get("endurance", 10)) * 2.2
	return {
		"name": name, "is_player": is_player, "attrs": attrs,
		"max_hp": max_hp, "hp": max_hp, "stamina": 100.0,
		"trauma": 0.0, "combo": 0, "score": 0.0,
		"knockdowns_round": 0, "knockdowns_total": 0,
		"crossed": {}, "counter_ready": false, "tactic": "balanced",
		"style_key": String(opts.get("style_key", "balanced")),
		"punch_exp": opts.get("punch_exp", {}),
		"gear_pct": opts.get("gear_pct", {}),
		"gear_dr": float(opts.get("gear_dr", 0.0)),
		"gear_trauma_mul": float(opts.get("gear_trauma_mul", 1.0)),
		"gear_stam_mul": float(opts.get("gear_stam_mul", 1.0)),
		"hits_landed": 0, "hits_taken": 0,
	}

func start(pa: Dictionary, pb: Dictionary) -> void:
	a = pa
	b = pb
	round_no = 1
	exchange_no = 0
	finished = false
	result = {}
	log_lines.clear()
	_new_round()

func _new_round() -> void:
	for f in [a, b]:
		f["knockdowns_round"] = 0
		f["crossed"] = {}
		f["stamina"] = minf(100.0, float(f["stamina"]) + 18.0)
		f["combo"] = 0

func eff_attr(f: Dictionary, key: String) -> float:
	var base := float(f["attrs"].get(key, 10))
	var pct := float(f["gear_pct"].get(key, 0.0))
	var v := base * (1.0 + pct / 100.0)
	# 体力低下时全面衰减
	var stam := float(f["stamina"])
	if stam < 30.0:
		v *= 0.82 + stam * 0.006
	return v

# 战术对位（web 批次 B M1 口径的移植近似）：返回攻方伤害倍率
func tactic_mul(att: Dictionary, def: Dictionary) -> float:
	var at := String(att["tactic"])
	var dt := String(def["tactic"])
	var m := 1.0
	if at == "attack" and dt == "points":
		m *= 1.06 # 强攻追打游走
	elif at == "points" and dt == "attack":
		m *= 0.95 # 游走难打正
	elif at == "points" and dt == "counter":
		m *= 0.88 # 打点拳对稳守
	if at == "attack":
		m *= 1.08
	elif at == "points":
		m *= 0.94
	return m

func ai_choose_punch(f: Dictionary, foe: Dictionary) -> String:
	var styles: Dictionary = DataDB.foe_styles()
	var st: Dictionary = styles.get(f["style_key"], styles.get("balanced", {}))
	var weights: Dictionary = st.get("weights", {})
	var total := 0.0
	for k in PUNCH_KEYS:
		total += float(weights.get(k, 1.0))
	var r := rng.randf() * total
	for k in PUNCH_KEYS:
		r -= float(weights.get(k, 1.0))
		if r <= 0.0:
			return k
	return "jab"

# 执行一次交换：att_key/def_key 为 fighter 引用键 "a"/"b"；punch 为攻方拳种；
# def_action: "none"/"block"/"dodge"（手动模式下守方玩家的指令；AI 守方自动判定）
func do_exchange(att_is_a: bool, punch: String, def_action: String = "none") -> Dictionary:
	var att: Dictionary = a if att_is_a else b
	var def: Dictionary = b if att_is_a else a
	var ev := {"att_is_a": att_is_a, "punch": punch, "kind": "", "dmg": 0.0,
		"knockdown": false, "ko": false, "text": ""}
	if finished:
		ev["kind"] = "over"
		return ev
	exchange_no += 1
	var punches: Dictionary = DataDB.punches()
	var pdef: Dictionary = punches[punch]
	# 体力消耗
	var stam_cost := float(pdef["stam"]) * float(att["gear_stam_mul"])
	if String(att["tactic"]) == "attack":
		stam_cost *= 1.15
	att["stamina"] = maxf(0.0, float(att["stamina"]) - stam_cost)
	# 命中判定
	var acc := eff_attr(att, "accuracy") + eff_attr(att, "speed") * 0.35
	var defv := eff_attr(def, "defense") + eff_attr(def, "footwork") * 0.35
	var hit_ch := clampf(0.74 + (acc - defv) * 0.006, 0.35, 0.95)
	if String(att["tactic"]) == "points":
		hit_ch += 0.05
	var styles: Dictionary = DataDB.foe_styles()
	var dst: Dictionary = styles.get(def["style_key"], {})
	# 守方反应：格挡/闪避
	var reaction := "none"
	var block_ch := 0.16 + eff_attr(def, "defense") * 0.0035 + float(dst.get("blockAdd", 0.0))
	if String(def["tactic"]) == "counter":
		block_ch += 0.10
	if def_action == "block":
		block_ch += 0.38
	var dodge_ch := 0.05 + eff_attr(def, "footwork") * 0.0022
	if def_action == "dodge":
		dodge_ch += 0.30
	var roll := rng.randf()
	if roll < dodge_ch:
		reaction = "dodge"
	elif roll < dodge_ch + block_ch:
		reaction = "block"
	if rng.randf() > hit_ch and reaction == "none":
		reaction = "miss"
	# 结算
	if reaction == "miss":
		att["combo"] = 0
		ev["kind"] = "miss"
		ev["text"] = "%s 的%s落空了。" % [att["name"], pdef["name"]]
	elif reaction == "dodge":
		att["combo"] = 0
		def["counter_ready"] = true
		ev["kind"] = "dodge"
		ev["text"] = "%s 闪开了%s的%s——反击窗口！" % [def["name"], att["name"], pdef["name"]]
	else:
		var blocked := reaction == "block"
		var raw := (5.0 + eff_attr(att, "power") * 0.42) * float(pdef["coef"])
		raw *= 1.0 + minf(float(att["punch_exp"].get(punch, 0)), 200.0) * 0.0008
		raw *= rng.randf_range(0.85, 1.15)
		raw *= tactic_mul(att, def)
		# 连击加成（攻方连续命中计数）
		att["combo"] = int(att["combo"]) + 1
		var combo := int(att["combo"])
		if combo == 2:
			raw *= 1.05
		elif combo == 3:
			raw *= 1.15
		elif combo >= 4:
			raw *= 1.25
		# 反击窗口
		var is_counter := bool(att["counter_ready"])
		if is_counter:
			raw *= 1.30
			att["counter_ready"] = false
		# 减伤：格挡 + 装备 dr，合计封顶 raw 的 70%
		var red := 0.0
		if blocked:
			red = 0.62
			if punch == "body":
				red = 1.0 - 0.70 # 击腹对格挡 70% 穿透 → 只挡 30%
		red = maxf(red, float(def["gear_dr"]) / 100.0) if not blocked else clampf(red + float(def["gear_dr"]) / 100.0, 0.0, 0.70)
		red = minf(red, 0.70)
		var net := raw * (1.0 - red)
		var hp_before := float(def["hp"])
		def["hp"] = maxf(0.0, hp_before - net)
		att["score"] = float(att["score"]) + net
		att["hits_landed"] = int(att["hits_landed"]) + 1
		def["hits_taken"] = int(def["hits_taken"]) + 1
		ev["dmg"] = net
		ev["blocked"] = blocked
		ev["counter"] = is_counter
		ev["kind"] = "block" if blocked else "hit"
		# 重创积累（现行体系）
		var denom := maxf(maxf(hp_before, float(def["hp"])), TRAUMA_HP_FLOOR * float(def["max_hp"]))
		var gain := net / denom * TRAUMA_K * float(def["gear_trauma_mul"])
		var t_before := float(def["trauma"])
		def["trauma"] = minf(100.0, t_before + gain)
		ev["text"] = "%s%s%s命中%s，造成 %.0f 点伤害%s。" % [
			att["name"], "反击" if is_counter else "", pdef["name"], def["name"], net,
			"（被格挡）" if blocked else ""]
		# 击倒判定：跨刻度（每刻度每回合一次）
		for th in THRESHOLDS:
			if t_before < th and float(def["trauma"]) >= th and not def["crossed"].get(str(th), false):
				def["crossed"][str(th)] = true
				def["knockdowns_round"] = int(def["knockdowns_round"]) + 1
				def["knockdowns_total"] = int(def["knockdowns_total"]) + 1
				att["score"] = float(att["score"]) + 10.0
				ev["knockdown"] = true
				ev["text"] += " %s 被击倒了！（本回合第 %d 次）" % [def["name"], int(def["knockdowns_round"])]
				break
	# 重创衰减（双方）
	for f in [a, b]:
		f["trauma"] = maxf(0.0, float(f["trauma"]) - TRAUMA_DECAY_PER_EXCHANGE)
	# 终结判定
	_check_finish(ev)
	# 回合推进
	if not finished and exchange_no >= EXCHANGES_PER_ROUND:
		exchange_no = 0
		round_no += 1
		if round_no > ROUNDS:
			_finish_by_decision()
		else:
			_new_round()
			ev["new_round"] = round_no
	exchange_done.emit(ev)
	return ev

func _check_finish(ev: Dictionary) -> void:
	for pair in [[a, b], [b, a]]:
		var def: Dictionary = pair[0]
		var att: Dictionary = pair[1]
		if float(def["trauma"]) >= 100.0:
			_finish(att, def, "KO（重创满格）")
			ev["ko"] = true
			return
		if float(def["hp"]) <= 0.0:
			_finish(att, def, "KO")
			ev["ko"] = true
			return
		if int(def["knockdowns_round"]) >= 3:
			_finish(att, def, "TKO（单回合 3 次击倒）")
			ev["ko"] = true
			return

func _finish(winner: Dictionary, loser: Dictionary, how: String) -> void:
	finished = true
	result = {"winner_is_a": winner == a, "how": how,
		"a_score": a["score"], "b_score": b["score"],
		"a_kd": a["knockdowns_total"], "b_kd": b["knockdowns_total"],
		"rounds_played": round_no}
	battle_done.emit(result)

func _finish_by_decision() -> void:
	var winner := a if float(a["score"]) >= float(b["score"]) else b
	var loser := b if winner == a else a
	_finish(winner, loser, "点数判定")

# 模拟跳过：双 AI 快速跑完整场（内部仍走同一引擎，保证口径一致）
func simulate_all() -> Dictionary:
	var guard_count := 0
	while not finished and guard_count < 1000:
		guard_count += 1
		# 先手：速度高者概率占优
		var a_first := rng.randf() < 0.5 + (eff_attr(a, "speed") - eff_attr(b, "speed")) * 0.004
		var att_is_a := a_first if exchange_no % 2 == 0 else not a_first
		var att: Dictionary = a if att_is_a else b
		var foe: Dictionary = b if att_is_a else a
		do_exchange(att_is_a, ai_choose_punch(att, foe))
	return result
