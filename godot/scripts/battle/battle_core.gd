class_name BattleCore
extends RefCounted
## 实时战斗规则内核（design/battle.md）。不引用任何节点，无画面可跑（机器人批量测试用）。
## 呈现层每帧调用 step(dt)，订阅 event 信号播动画 / 特效 / 音效。
##
## 规则层沿用 BattleEngine（回合制）已标定的口径，逐项不动：
##   伤害公式、连击加成、减伤封顶 70%、击腹穿透 70%、重创积累 K=40、跨 25/50/75 击倒、
##   方案 B（HP 归零 → 读秒起身概率）、同回合 3 倒 TKO、点数判定。
## 实时化新增：出拳前摇 / 停留 / 收招、预兆、受击打断、方向闪避 + 1 秒反击窗口（+40% 对应拳 / +30% 其他）、
##   高 / 低格挡、破防、体力回复。
## 标定面（只许动这几项）：HP_SCALE、TRAUMA_DECAY_SEC、AI 出拳频率、体力回复。

signal event(ev: Dictionary)

const PUNCH_KEYS := ["jab", "straight", "hook", "upper", "body"]
# [前摇, 停留, 收招]（秒），参考 Love Upper 60fps 帧数据，design/battle.md §3.2
const TIMING := {
	"jab": [0.07, 0.08, 0.15], "straight": [0.11, 0.10, 0.30], "hook": [0.17, 0.10, 0.40],
	"upper": [0.17, 0.10, 0.40], "body": [0.20, 0.10, 0.35],
}
# 受击硬直（秒）：轻重分档（逆向结论 5：受击时长和力度对应）
const STUN := {"jab": 0.12, "straight": 0.20, "hook": 0.32, "upper": 0.32, "body": 0.26}
const BLOCK_STUN := 0.08
const WHIFF_EXTRA := {"jab": 0.0, "straight": 0.06, "hook": 0.20, "upper": 0.20, "body": 0.10}
# 闪避：哪个方向躲得开哪些拳（摆拳克侧闪、上勾克下潜）
const DODGE_AVOIDS := {
	"l": ["jab", "straight", "upper", "body"], "r": ["jab", "straight", "upper", "body"],
	"duck": ["jab", "straight", "hook"],
}
const DODGE_COUNTER := {"l": "hook", "r": "hook", "duck": "upper"}
const DODGE_COST := 15.0
const DODGE_IFRAME := 0.30
const DODGE_DUR := 0.45
const DODGE_CD := 1.5
const COUNTER_WIN := 1.0
const COUNTER_MATCH := 1.40   # 用户硬数字
const COUNTER_OTHER := 1.30   # 用户硬数字
const GUARD_BREAK := 1.5
const BODY_PIERCE_RED := 0.30  # 击腹打在高格挡上只挡 30%（= 70% 穿透，用户硬数字）
const BLOCK_RED := 0.62
const COMBO_GAP := 1.6         # 两次命中间隔超过这个秒数，连击断
const ROUND_SEC := 60.0
const ROUNDS := 3
const COUNT_SEC := 1.0         # 读秒每个数字的时长（呈现用；回合钟在读秒时暂停）
const ROUND_STAM := 25.0       # 回合间体力回复

# —— 标定面 ——
var HP_SCALE := 3.0            # 实时出拳次数多于交换制，HP 池按比例放大（2026-11-21 rt_probe 标定：2.6→3.0）
var TRAUMA_DECAY_SEC := 0.55   # 起点为交换制折算 0.93/秒；标定后 0.55（让重创击倒 / TKO 出现）
var STAM_REGEN := 2.2          # 每秒（不出拳、不格挡 0.5 秒后）
var AI_RATE := 1.0             # AI 出拳频率总倍率

# 规则口径常量（与 BattleEngine 同值）
const TRAUMA_K := BattleEngine.TRAUMA_K
const TRAUMA_HP_FLOOR := BattleEngine.TRAUMA_HP_FLOOR
const THRESHOLDS := BattleEngine.THRESHOLDS
const GETUP_BASE := BattleEngine.GETUP_BASE
const GETUP_WILL := BattleEngine.GETUP_WILL
const GETUP_STAM := BattleEngine.GETUP_STAM
const GETUP_PER_KD := BattleEngine.GETUP_PER_KD
const GETUP_HP := BattleEngine.GETUP_HP

var rng := RandomNumberGenerator.new()
var a: Dictionary
var b: Dictionary
var phase := "fight"   # fight / down / over
var round_no := 1
var clock := ROUND_SEC
var t := 0.0
var finished := false
var result: Dictionary = {}
var _down_left := 0.0
var _punch_seq := 0


static func make(name: String, is_player: bool, attrs: Dictionary, opts: Dictionary = {}) -> Dictionary:
	var f := BattleEngine.make_fighter(name, is_player, attrs, opts)
	f["ai"] = bool(opts.get("ai", not is_player))
	f["tell"] = float(opts.get("tell", 0.0 if is_player else 0.4))   # 出拳预兆（AI 才有）
	f["tactic"] = String(opts.get("tactic", "balanced"))
	f["act"] = ""          # "" / punch / block / dodge
	f["act_t"] = 0.0
	f["punch"] = ""
	f["punch_id"] = 0
	f["resolved"] = false
	f["dur"] = 0.0
	f["contact"] = 0.0
	f["block_low"] = false
	f["dodge_dir"] = ""
	f["dodge_cd"] = 0.0
	f["counter_t"] = 0.0
	f["counter_kind"] = ""
	f["guard_break"] = 0.0
	f["stun"] = 0.0
	f["idle_t"] = 0.0
	f["last_hit_t"] = -99.0
	f["ai_next"] = 0.8
	f["ai_seen"] = 0
	f["ai_hold"] = 0.0
	return f


func start(pa: Dictionary, pb: Dictionary, seed_v: int = -1) -> void:
	if seed_v >= 0:
		rng.seed = seed_v
	else:
		rng.randomize()
	a = pa
	b = pb
	for f in [a, b]:
		f["max_hp"] = float(f["max_hp"]) * HP_SCALE
		f["hp"] = f["max_hp"]
	round_no = 1
	clock = ROUND_SEC
	t = 0.0
	phase = "fight"
	finished = false
	result = {}
	_emit({"type": "round_start", "round": 1})


func foe_of(f: Dictionary) -> Dictionary:
	return b if f == a else a


# ---------------- 输入（玩家或 AI 共用） ----------------

func can_act(f: Dictionary) -> bool:
	return phase == "fight" and float(f["stun"]) <= 0.0 and (String(f["act"]) == "" or String(f["act"]) == "block")


func input_punch(f: Dictionary, kind: String) -> bool:
	if not can_act(f) or not TIMING.has(kind):
		return false
	var p: Array = TIMING[kind]
	var spd := clampf(1.3 - eff_attr(f, "speed") * 0.012, 0.7, 1.2)
	var stam := float(f["stamina"])
	var rec_mul := 1.4 if stam < 30.0 else 1.0
	var cost := float(DataDB.punches()[kind]["stam"]) * float(f["gear_stam_mul"])
	if String(f["tactic"]) == "attack":
		cost *= 1.15
	f["stamina"] = maxf(0.0, stam - cost)
	_punch_seq += 1
	f["act"] = "punch"
	f["punch"] = kind
	f["punch_id"] = _punch_seq
	f["act_t"] = 0.0
	f["resolved"] = false
	f["contact"] = float(f["tell"]) + float(p[0]) * spd
	f["dur"] = float(f["contact"]) + float(p[1]) + float(p[2]) * rec_mul
	f["idle_t"] = 0.0
	_emit({"type": "punch_start", "who": _who(f), "punch": kind, "tell": f["tell"], "contact": f["contact"]})
	return true


func input_block(f: Dictionary, on: bool, low: bool = false) -> void:
	if on:
		if can_act(f):
			f["act"] = "block"
			f["block_low"] = low
	elif String(f["act"]) == "block":
		f["act"] = ""


func input_dodge(f: Dictionary, dir: String) -> bool:
	if not can_act(f) or float(f["dodge_cd"]) > 0.0 or not DODGE_AVOIDS.has(dir):
		return false
	f["stamina"] = maxf(0.0, float(f["stamina"]) - DODGE_COST)
	f["act"] = "dodge"
	f["dodge_dir"] = dir
	f["act_t"] = 0.0
	f["dodge_cd"] = DODGE_CD
	f["idle_t"] = 0.0
	_emit({"type": "dodge", "who": _who(f), "dir": dir})
	return true


# ---------------- 主循环 ----------------

func step(dt: float) -> void:
	if finished:
		return
	if phase == "down":
		_down_left -= dt
		if _down_left <= 0.0:
			phase = "fight"
			for f in [a, b]:
				f["act"] = ""
				f["stun"] = 0.0
				f["combo"] = 0
			_emit({"type": "getup"})
		return
	t += dt
	clock -= dt
	for f in [a, b]:
		_tick_fighter(f, dt)
	for f in [a, b]:
		if bool(f["ai"]):
			_ai(f, foe_of(f), dt)
	for f in [a, b]:
		_advance_action(f, dt)
		if finished or phase != "fight":
			return
	if clock <= 0.0:
		_end_round()


func _tick_fighter(f: Dictionary, dt: float) -> void:
	f["trauma"] = maxf(0.0, float(f["trauma"]) - TRAUMA_DECAY_SEC * dt)
	for k in ["dodge_cd", "counter_t", "guard_break", "stun", "ai_hold"]:
		f[k] = maxf(0.0, float(f[k]) - dt)
	if String(f["act"]) == "":
		f["idle_t"] = float(f["idle_t"]) + dt
		if float(f["idle_t"]) > 0.5:
			f["stamina"] = minf(100.0, float(f["stamina"]) + STAM_REGEN * dt)
	if t - float(f["last_hit_t"]) > COMBO_GAP:
		f["combo"] = 0


func _advance_action(f: Dictionary, dt: float) -> void:
	var act := String(f["act"])
	if act == "punch":
		f["act_t"] = float(f["act_t"]) + dt
		if not bool(f["resolved"]) and float(f["act_t"]) >= float(f["contact"]):
			f["resolved"] = true
			_resolve(f, foe_of(f))
		if String(f["act"]) == "punch" and float(f["act_t"]) >= float(f["dur"]):
			f["act"] = ""
	elif act == "dodge":
		f["act_t"] = float(f["act_t"]) + dt
		if float(f["act_t"]) >= DODGE_DUR:
			f["act"] = ""


func _end_round() -> void:
	_emit({"type": "round_end", "round": round_no})
	if round_no >= ROUNDS:
		_finish_by_decision()
		return
	round_no += 1
	clock = ROUND_SEC
	for f in [a, b]:
		f["knockdowns_round"] = 0
		f["crossed"] = {}
		f["stamina"] = minf(100.0, float(f["stamina"]) + ROUND_STAM)
		f["combo"] = 0
		f["act"] = ""
		f["stun"] = 0.0
	_emit({"type": "round_start", "round": round_no})


# ---------------- 结算 ----------------

func eff_attr(f: Dictionary, key: String) -> float:
	var base := float(f["attrs"].get(key, 10))
	var pct := float(f["gear_pct"].get(key, 0.0))
	var v := base * (1.0 + pct / 100.0)
	var stam := float(f["stamina"])
	if stam < 30.0:
		v *= 0.82 + stam * 0.006
	return v


func _tactic_mul(att: Dictionary, def: Dictionary) -> float:
	var at := String(att["tactic"])
	var dt := String(def["tactic"])
	var m := 1.0
	if at == "attack" and dt == "points":
		m *= 1.06
	elif at == "points" and dt == "attack":
		m *= 0.95
	elif at == "points" and dt == "counter":
		m *= 0.88
	if at == "attack":
		m *= 1.08
	elif at == "points":
		m *= 0.94
	return m


func _resolve(att: Dictionary, def: Dictionary) -> void:
	var kind := String(att["punch"])
	var who := _who(att)
	var pdef: Dictionary = DataDB.punches()[kind]
	# 1) 闪避
	if String(def["act"]) == "dodge":
		var dir := String(def["dodge_dir"])
		var avoided: Array = DODGE_AVOIDS[dir]
		if float(def["act_t"]) <= DODGE_IFRAME and kind in avoided:
			att["combo"] = 0
			att["dur"] = float(att["dur"]) + float(WHIFF_EXTRA[kind])
			def["counter_t"] = COUNTER_WIN
			def["counter_kind"] = DODGE_COUNTER[dir]
			_emit({"type": "whiff", "who": who, "punch": kind, "dodged": true, "dir": dir})
			return
		def["stun"] = float(def["stun"]) + 0.2  # 闪错方向 / 闪晚了，多吃硬直
	# 2) 命中率（擦边落空）
	var acc := eff_attr(att, "accuracy") + eff_attr(att, "speed") * 0.35
	var defv := eff_attr(def, "defense") + eff_attr(def, "footwork") * 0.35
	var hit_ch := clampf(0.82 + (acc - defv) * 0.006, 0.45, 0.97)
	if String(att["tactic"]) == "points":
		hit_ch += 0.04
	if rng.randf() > hit_ch:
		att["combo"] = 0
		att["dur"] = float(att["dur"]) + float(WHIFF_EXTRA[kind]) * 0.5
		_emit({"type": "whiff", "who": who, "punch": kind, "dodged": false})
		return
	# 3) 格挡
	var red := 0.0
	var blocked := false
	var pierced := false
	if String(def["act"]) == "block" and float(def["guard_break"]) <= 0.0:
		if bool(def["block_low"]):
			if kind == "body":
				red = BLOCK_RED
				blocked = true
		else:
			if kind == "body":
				red = BODY_PIERCE_RED
				blocked = true
				pierced = true
				def["guard_break"] = GUARD_BREAK
			else:
				red = BLOCK_RED
				blocked = true
	if blocked:
		red = clampf(red + float(def["gear_dr"]) / 100.0, 0.0, 0.70)
	else:
		red = minf(float(def["gear_dr"]) / 100.0, 0.70)
	# 4) 伤害（与 BattleEngine 同口径）
	var raw := (5.0 + eff_attr(att, "power") * 0.42) * float(pdef["coef"])
	raw *= 1.0 + minf(float(att["punch_exp"].get(kind, 0)), 200.0) * 0.0008
	raw *= rng.randf_range(0.85, 1.15)
	raw *= _tactic_mul(att, def)
	att["combo"] = int(att["combo"]) + 1
	att["last_hit_t"] = t
	var combo := int(att["combo"])
	if combo == 2:
		raw *= 1.05
	elif combo == 3:
		raw *= 1.15
	elif combo >= 4:
		raw *= 1.25
	var is_counter := float(att["counter_t"]) > 0.0
	if is_counter:
		raw *= COUNTER_MATCH if kind == String(att["counter_kind"]) else COUNTER_OTHER
		att["counter_t"] = 0.0
	var net := raw * (1.0 - red)
	var hp_before := float(def["hp"])
	def["hp"] = maxf(0.0, hp_before - net)
	att["score"] = float(att["score"]) + net
	att["hits_landed"] = int(att["hits_landed"]) + 1
	def["hits_taken"] = int(def["hits_taken"]) + 1
	def["combo"] = 0
	# 受击：打断对方正在蓄的拳，进入硬直
	if String(def["act"]) == "punch" and not bool(def["resolved"]):
		def["act"] = ""
		_emit({"type": "interrupted", "who": _who(def)})
	if not blocked or pierced:
		if String(def["act"]) != "block":
			def["act"] = ""
		def["stun"] = maxf(float(def["stun"]), float(STUN[kind]))
	else:
		def["stun"] = maxf(float(def["stun"]), BLOCK_STUN)
	# 重创积累
	var denom := maxf(maxf(hp_before, float(def["hp"])), TRAUMA_HP_FLOOR * float(def["max_hp"]))
	var gain := net / denom * TRAUMA_K * float(def["gear_trauma_mul"])
	var t_before := float(def["trauma"])
	def["trauma"] = minf(100.0, t_before + gain)
	var ev := {"type": "block" if blocked and not pierced else "hit", "who": who, "punch": kind, "dmg": net,
		"counter": is_counter, "combo": combo, "pierced": pierced, "knockdown": false}
	for th in THRESHOLDS:
		if t_before < th and float(def["trauma"]) >= th and not def["crossed"].get(str(th), false):
			def["crossed"][str(th)] = true
			def["knockdowns_round"] = int(def["knockdowns_round"]) + 1
			def["knockdowns_total"] = int(def["knockdowns_total"]) + 1
			att["score"] = float(att["score"]) + 10.0
			ev["knockdown"] = true
			break
	_emit(ev)
	_check_finish(att, def, bool(ev["knockdown"]))


func _check_finish(att: Dictionary, def: Dictionary, trauma_kd: bool) -> void:
	if float(def["trauma"]) >= 100.0:
		_finish(att, "KO（重创满格）")
		return
	if float(def["hp"]) <= 0.0:
		def["knockdowns_round"] = int(def["knockdowns_round"]) + 1
		def["knockdowns_total"] = int(def["knockdowns_total"]) + 1
		att["score"] = float(att["score"]) + 10.0
		if int(def["knockdowns_round"]) >= 3:
			_emit({"type": "knockdown", "who": _who(def), "count": 10})
			_finish(att, "TKO（单回合 3 次击倒）")
			return
		var p := clampf(GETUP_BASE + eff_attr(def, "will") * GETUP_WILL + float(def["stamina"]) * GETUP_STAM
			- float(int(def["knockdowns_total"]) - 1) * GETUP_PER_KD, 0.05, 0.92)
		if rng.randf() < p:
			def["hp"] = float(def["max_hp"]) * GETUP_HP
			var cnt := clampi(int(round(9.0 - p * 6.0)) + rng.randi_range(-1, 1), 3, 9)
			_start_down(def, cnt)
		else:
			_emit({"type": "knockdown", "who": _who(def), "count": 10})
			_finish(att, "KO")
		return
	if int(def["knockdowns_round"]) >= 3:
		_emit({"type": "knockdown", "who": _who(def), "count": 10})
		_finish(att, "TKO（单回合 3 次击倒）")
		return
	if trauma_kd:
		_start_down(def, rng.randi_range(3, 7))


func _start_down(def: Dictionary, count: int) -> void:
	phase = "down"
	_down_left = count * COUNT_SEC + 1.2
	_emit({"type": "knockdown", "who": _who(def), "count": count})


func _finish(winner: Dictionary, how: String) -> void:
	finished = true
	phase = "over"
	result = {"winner_is_a": winner == a, "how": how,
		"a_score": a["score"], "b_score": b["score"],
		"a_kd": a["knockdowns_total"], "b_kd": b["knockdowns_total"],
		"rounds_played": round_no, "time": t,
		"a_landed": a["hits_landed"], "b_landed": b["hits_landed"]}
	_emit({"type": "finish", "result": result})


func _finish_by_decision() -> void:
	_finish(a if float(a["score"]) >= float(b["score"]) else b, "点数判定")


func _who(f: Dictionary) -> String:
	return "a" if f == a else "b"


func _emit(ev: Dictionary) -> void:
	ev["t"] = t
	event.emit(ev)


# ---------------- AI 大脑（对手；自动观看时双方都用） ----------------

func _ai(f: Dictionary, o: Dictionary, _dt: float) -> void:
	var styles: Dictionary = DataDB.foe_styles()
	var st: Dictionary = styles.get(String(f["style_key"]), styles.get("balanced", {}))
	# 1) 看到对方出拳：按防守能力决定要不要、怎么反应（每一拳只判一次）
	if String(o["act"]) == "punch" and not bool(o["resolved"]) and int(o["punch_id"]) != int(f["ai_seen"]):
		f["ai_seen"] = o["punch_id"]
		var p_react := 0.18 + eff_attr(f, "defense") * 0.006 + float(st.get("blockAdd", 0.0))
		p_react += float(o["tell"]) * 0.35  # 预兆越长越好躲
		if String(f["tactic"]) == "counter":
			p_react += 0.10
		if rng.randf() < clampf(p_react, 0.05, 0.85) and can_act(f):
			var kind := String(o["punch"])
			if rng.randf() < 0.55 or float(f["dodge_cd"]) > 0.0 or float(f["stamina"]) < DODGE_COST + 5.0:
				var right_guard := rng.randf() < 0.45 + eff_attr(f, "defense") * 0.008
				var low := (kind == "body") == right_guard
				input_block(f, true, low)
				f["ai_hold"] = float(o["contact"]) - float(o["act_t"]) + 0.15
			else:
				var right_dir := rng.randf() < 0.45 + eff_attr(f, "footwork") * 0.008
				var dirs := ["l", "r", "duck"]
				var good: Array = []
				for d in dirs:
					if kind in DODGE_AVOIDS[d]:
						good.append(d)
				var bad: Array = dirs.filter(func(d: String) -> bool: return not good.has(d))
				var pick: String = good[rng.randi() % good.size()] if (right_dir or bad.is_empty()) else bad[rng.randi() % bad.size()]
				input_dodge(f, pick)
			return
	# 格挡保持到对方这一拳结算完
	if String(f["act"]) == "block" and float(f["ai_hold"]) <= 0.0:
		input_block(f, false)
	# 2) 反击窗口：立刻打对应拳
	if float(f["counter_t"]) > 0.0 and can_act(f) and String(f["act"]) != "block":
		input_punch(f, String(f["counter_kind"]))
		return
	# 3) 主动进攻
	if t >= float(f["ai_next"]) and can_act(f) and String(f["act"]) == "":
		if float(f["stamina"]) < 8.0:
			f["ai_next"] = t + 0.6
			return
		var kind := _pick_punch(f, st)
		input_punch(f, kind)
		var freq := (0.24 + eff_attr(f, "speed") * 0.012) / 0.42 * float(st.get("freqMul", 1.0)) * AI_RATE
		match String(f["tactic"]):
			"attack": freq *= 1.2
			"counter": freq *= 0.75
		if float(f["stamina"]) < 30.0:
			freq *= 0.6
		var gap := rng.randf_range(0.7, 1.5) / maxf(freq, 0.2)
		if rng.randf() < 0.35:
			gap = rng.randf_range(0.05, 0.2)  # 连打：紧接下一拳
		f["ai_next"] = t + float(f["dur"]) + gap


func _pick_punch(f: Dictionary, st: Dictionary) -> String:
	var weights: Dictionary = st.get("weights", {})
	var total := 0.0
	var w := {}
	for k in PUNCH_KEYS:
		var v := float(weights.get(k, 1.0)) * (1.0 + minf(float(f["punch_exp"].get(k, 0)), 200.0) * 0.004)
		w[k] = v
		total += v
	var r := rng.randf() * total
	for k in PUNCH_KEYS:
		r -= float(w[k])
		if r <= 0.0:
			return k
	return "jab"
