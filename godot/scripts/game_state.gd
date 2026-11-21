class_name GameState
extends RefCounted
## 生涯状态与规则（Godot 移植；口径对齐 web v43，个别呈现层规则为移植近似、已注明）。
## 存档：user://save_slot_{0..2}.json，带 ver 字段。

const SAVE_VER := 1
const AP_PER_DAY := 6
const ATTR_KEYS := ["power", "endurance", "will", "speed", "accuracy", "footwork", "defense", "technique"]

var s: Dictionary # 全部可存档状态

static func default_state() -> Dictionary:
	var attrs := {}
	for k in ATTR_KEYS:
		attrs[k] = 10
	return {
		"ver": SAVE_VER,
		"day": 1, "week": 1, "ap": AP_PER_DAY,
		"money": 800, "attrs": attrs,
		"punch_exp": {"jab": 0, "straight": 0, "hook": 0, "upper": 0, "body": 0},
		"fatigue": 0, "injury": 0, "mind": 50,
		"wins": 0, "losses": 0, "win_streak": 0, "defenses": 0,
		"ranking": [], # 名字 key 列表，第 0 位 = 第 1 名；含 "me"
		"foe_bonus": {}, # key -> 累积成长（周成长）
		"influence": 1, "stage": 1, "stage_done": [],
		"gear_owned": [], "gear_equipped": {}, # slot -> gear id
		# 装备子系统补完（web Phase 5 口径）：材料库存 / 强化等级 / 定制打造装备 / 图鉴登记
		"materials": {"synthetic": 0, "calf": 0, "goat": 0, "kangaroo": 0, "latex": 0, "gel": 0, "horsehair": 0},
		"enh": {}, # gear id -> 强化等级 0~10
		"custom_gear": [], "custom_seq": 0,
		"dex_sigs": [], "dex_ach_done": [], "titles": [],
		"ko_wins": 0, "spar_rival": 0,
		# 赞助（web Phase 3）：当前签约赞助商 id（"" = 未签约）；序章（web Phase 7）：是否已走完/跳过
		"sponsor": "", "prologue_done": false,
		# 卫冕循环（web G9 口径）：待应战挑战 {key,name,rank,week}（空字典 = 无）/ 上次卫冕战结算周
		"defense_challenge": {}, "defense_week": 0,
		"achievements": [],
		"aff": {}, # 好感（剧情角色）
		"seen_story": [], "seen_daily": [],
		"champ_beaten": false,
		"last_match_day": 0, # 上次打正式赛的日子（每个比赛日只能打 1 场正式赛）
		"log": [],
	}

func _init() -> void:
	s = default_state()
	_reset_ranking()

func _reset_ranking() -> void:
	# 初始排名：roster 按强度（列表顺序近似强弱）排位，玩家插在第 50 名
	var roster := DataDB.roster()
	var keys: Array = []
	for r in roster:
		keys.append(String(r["key"]))
	keys.insert(maxi(0, keys.size() - 1), "me")
	s["ranking"] = keys

func my_rank() -> int:
	return int(s["ranking"].find("me")) + 1

func rank_of(key: String) -> int:
	return int(s["ranking"].find(key)) + 1

func roster_entry(key: String) -> Dictionary:
	for r in DataDB.roster():
		if String(r["key"]) == key:
			return r
	return {}

# 对手属性：由排名推导（名次越前越强）+ 风格倾斜 + 周成长
func foe_attrs(key: String) -> Dictionary:
	var rk := rank_of(key)
	var entry := roster_entry(key)
	var style := String(entry.get("style", "balanced"))
	var base := 14.0 + (51.0 - float(rk)) * 1.5
	base += float(s["foe_bonus"].get(key, 0.0))
	var attrs := {}
	for k in ATTR_KEYS:
		attrs[k] = base
	match style:
		"power":
			attrs["power"] += 8; attrs["endurance"] += 4; attrs["speed"] -= 3; attrs["footwork"] -= 3
		"speed":
			attrs["speed"] += 8; attrs["footwork"] += 6; attrs["power"] -= 3
		"guardcounter":
			attrs["defense"] += 8; attrs["technique"] += 5; attrs["power"] -= 2
		"technique":
			attrs["technique"] += 8; attrs["accuracy"] += 6
	for k in ATTR_KEYS:
		attrs[k] = clampf(float(attrs[k]), 5.0, 120.0)
	return attrs

# 训练收益递减（web G1 口径）：<20 全额 /20~40 ×0.45 /40~60 ×0.22 /60~80 ×0.12 /≥80 ×0.06，硬顶 100
static func diminish(current: float) -> float:
	if current < 20.0:
		return 1.0
	elif current < 40.0:
		return 0.45
	elif current < 60.0:
		return 0.22
	elif current < 80.0:
		return 0.12
	return 0.06

var _train_eff := 1.0 # 训练时由 do_training 置为心态效率，其余来源（事件等）恒为 1

# ================= 心态（web game.js 口径移植，2026-11-21 补） =================
static func mind_tier_name(v: int) -> String:
	if v >= 80: return "高昂"
	if v >= 60: return "良好"
	if v >= 40: return "平稳"
	if v >= 20: return "紧张"
	return "疲劳"

func mind_train_eff() -> float:
	var m := int(s["mind"])
	if m >= 80: return 1.1
	if m < 20: return 0.85
	return 1.0

func change_mind(delta: int) -> void:
	s["mind"] = clampi(int(s["mind"]) + delta, 0, 100)

## 正式赛日：每周第 7 天（web isMatchDay：day % 7 == 0）
func is_match_day() -> bool:
	return int(s["day"]) % 7 == 0

func days_to_match() -> int:
	return (7 - int(s["day"]) % 7) % 7

## 今天还能不能打正式赛（比赛日且今天尚未打过）
func can_fight_official() -> bool:
	return is_match_day() and int(s.get("last_match_day", 0)) != int(s["day"])

func gain_attr(key: String, amount: float) -> float:
	var cur := float(s["attrs"][key])
	var real := amount * diminish(cur) * _train_eff
	s["attrs"][key] = minf(100.0, cur + real)
	return real

func gain_punch_exp(key: String, amount: float) -> void:
	s["punch_exp"][key] = float(s["punch_exp"].get(key, 0)) + amount

var _rng := RandomNumberGenerator.new()
var last_dex_notes: Array = [] # 最近一次获得装备时的图鉴成就播报（UI 层取用）

# 执行一次训练（trainings.json 的 id）；返回结果文案，AP/疲劳不足返回 ""
func do_training(id: String) -> String:
	var t: Dictionary = {}
	for x in DataDB.trainings():
		if String(x["id"]) == id:
			t = x
	if t.is_empty():
		return ""
	if int(s["ap"]) < int(t["pts"]):
		return ""
	if int(s["fatigue"]) + int(t.get("stam", 0)) > 100:
		return ""
	s["ap"] = int(s["ap"]) - int(t["pts"])
	s["fatigue"] = int(s["fatigue"]) + int(t.get("stam", 0))
	_rng.randomize()
	_train_eff = mind_train_eff()
	var msg := _training_effect(id)
	_train_eff = 1.0
	if msg != "" and mind_train_eff() != 1.0:
		msg += "（心态%s，训练效率 ×%.2f）" % [mind_tier_name(int(s["mind"])), mind_train_eff()]
	return msg

func _training_effect(id: String) -> String:
	match id:
		"spar":
			gain_attr("will", 1)
			for k in ["jab", "straight", "hook", "upper", "body"]:
				gain_punch_exp(k, 5)
			if _rng.randf() < 0.10:
				s["injury"] = mini(100, int(s["injury"]) + 10)
				return "陪练中挨了一记重拳，意志 +1，全拳种经验 +5——但眉角肿了，伤病 +10。"
			return "和陪练真刀真枪打了几回合，意志 +1，全部拳种经验 +5。"
		"strength":
			gain_attr("power", 3)
			return "杠铃卧推加深蹲，力量稳步上涨。"
		"bag":
			gain_attr("power", 2)
			gain_punch_exp("straight", 10)
			gain_punch_exp("hook", 10)
			return "重沙袋打得砰砰响，力量与直拳/摆拳经验上涨。"
		"pads":
			gain_attr("accuracy", 2)
			gain_attr("technique", 1)
			gain_punch_exp("jab", 10)
			return "手靶节奏越打越顺，精准与技术上涨。"
		"upper":
			gain_punch_exp("upper", 10)
			gain_attr("power", 1)
			return "上勾拳特训，腰腹发力更整了。"
		"body":
			gain_punch_exp("body", 10)
			gain_attr("accuracy", 1)
			return "击腹拳特训，专打呼吸的空档。"
		"rope":
			gain_attr("footwork", 2)
			gain_attr("endurance", 1)
			return "跳绳三千下，步伐轻快了。"
		"run":
			gain_attr("endurance", 2)
			return "长跑结束，耐久打底。"
		"speedball":
			gain_attr("speed", 2)
			gain_attr("accuracy", 1)
			return "速度球连成串，出拳速度上涨。"
		"dodgeball":
			gain_attr("defense", 2)
			gain_attr("footwork", 1)
			return "闪躲球训练，防守与步伐上涨。"
		"shadow":
			gain_attr("technique", 1)
			gain_attr("accuracy", 1)
			return "对着镜子空击，动作更干净了。"
		"video":
			gain_attr("technique", 1)
			gain_attr("accuracy", 1)
			return "录像研究一晚，读拳更准了。"
		"meditation":
			gain_attr("will", 1)
			s["mind"] = mini(100, int(s["mind"]) + 10)
			return "冥想调整，心态平稳了。"
	return ""

func do_rest() -> String:
	if int(s["ap"]) < 2:
		return ""
	s["ap"] = int(s["ap"]) - 2
	s["injury"] = maxi(0, int(s["injury"]) - 15)
	s["fatigue"] = maxi(0, int(s["fatigue"]) - 40)
	s["mind"] = mini(100, int(s["mind"]) + 5)
	return "好好休息了一阵，伤病与疲劳缓解。"

# 睡觉 → 次日（周结束时全池成长 + 排名小幅洗牌）
func sleep() -> Array:
	var notes: Array = []
	s["day"] = int(s["day"]) + 1
	s["ap"] = AP_PER_DAY
	s["fatigue"] = maxi(0, int(s["fatigue"]) - 60)
	# 睡觉时心态向 60 缓慢回归（±5，web doSleep 口径）
	var m := int(s["mind"])
	if m < 60:
		change_mind(mini(5, 60 - m))
	elif m > 60:
		change_mind(-mini(5, m - 60))
	if is_match_day():
		notes.append("今天是比赛日！去「比赛」报名正式赛。")
	if (int(s["day"]) - 1) % 7 == 0 and int(s["day"]) > 1:
		s["week"] = int(s["week"]) + 1
		_week_rollover()
		notes.append("新的一周开始了，对手们也在成长。")
		# 赞助周薪：每周第 1 天（Day 8、15、22…，与 web doSleep 同点）自动到账
		var sp := current_sponsor()
		if not sp.is_empty():
			s["money"] = int(s["money"]) + int(sp["weekly"])
			notes.append("赞助周薪到账：%s ¥%d（第 %d 周）。" % [String(sp["name"]), int(sp["weekly"]), int(s["week"])])
	return notes

func _week_rollover() -> void:
	_rng.randomize()
	for r in DataDB.roster():
		var key := String(r["key"])
		var g := 0.25
		match String(r.get("growth", "steady")):
			"genius":
				g = 0.5
			"early":
				g = 0.4 if int(s["week"]) <= 6 else 0.1
			"veteran":
				g = 0.15
			"volatile":
				g = _rng.randf_range(-0.2, 0.7)
		s["foe_bonus"][key] = float(s["foe_bonus"].get(key, 0.0)) + g
	# NPC 之间小幅换位（不越过玩家 3 名以上，避免无赛掉名次过多）
	var ranking: Array = s["ranking"]
	for i in 6:
		var idx := _rng.randi_range(0, ranking.size() - 2)
		var a_key := String(ranking[idx])
		var b_key := String(ranking[idx + 1])
		if a_key == "me" or b_key == "me":
			continue
		ranking[idx] = b_key
		ranking[idx + 1] = a_key
	s["ranking"] = ranking

# 比赛结算：foe_key 对手、win 胜负、is_defense 是否卫冕战（web G9：卫冕战走正式赛全结算，
# 只多一段卫冕记账——胜 → defenses+1 并清挑战；无论胜负都记 defense_week，每周至多 1 场。
# 注：普通正式赛在第 1 名获胜不再自动计卫冕（旧简化口径已替换，web 仅卫冕战计 defenses））
func settle_match(foe_key: String, win: bool, is_defense: bool = false, ko_loss: bool = false) -> Dictionary:
	var foe_rank := rank_of(foe_key)
	s["last_match_day"] = int(s["day"])
	# 心态结算（web 口径）：胜 +15 / 负 −10 / 被 KO −25
	change_mind(15 if win else (-25 if ko_loss else -10))
	var prize := 0
	var inf_levels := DataDB.influence_levels()
	var bonus := 0
	for lv in inf_levels:
		if int(lv["lv"]) == int(s["influence"]):
			bonus = int(lv["bonus"])
	if win:
		prize = int((300.0 + (51.0 - float(foe_rank)) * 60.0) * (1.0 + float(bonus) / 100.0))
		s["wins"] = int(s["wins"]) + 1
		s["win_streak"] = int(s["win_streak"]) + 1
		if foe_key == "opp_world_champion":
			s["champ_beaten"] = true
		# 排名：胜更高名次 → 顶替其位置
		if foe_rank < my_rank():
			var ranking: Array = s["ranking"]
			ranking.erase("me")
			ranking.insert(foe_rank - 1, "me")
			s["ranking"] = ranking
	else:
		prize = int((300.0 + (51.0 - float(foe_rank)) * 60.0) * 0.3)
		s["losses"] = int(s["losses"]) + 1
		s["win_streak"] = 0
		# 败给更低名次 → 掉 1 位（移植近似）
		if foe_rank > my_rank() and my_rank() < s["ranking"].size():
			var ranking: Array = s["ranking"]
			var my_idx := ranking.find("me")
			var other: String = ranking[my_idx + 1]
			ranking[my_idx] = other
			ranking[my_idx + 1] = "me"
			s["ranking"] = ranking
	if is_defense:
		# 卫冕记账放在影响力/阶段判定之前，让本场卫冕胜场同场计入阶段 6 与成就（web settleNow 同序）
		s["defense_week"] = int(s["week"])
		s["defense_challenge"] = {}
		if win:
			s["defenses"] = int(s["defenses"]) + 1
	s["money"] = int(s["money"]) + prize
	s["injury"] = mini(100, int(s["injury"]) + (4 if win else 8))
	_recalc_influence()
	var stage_note := _check_stage()
	return {"prize": prize, "stage_note": stage_note}

func _recalc_influence() -> void:
	# 影响力每场重算、可升可降（web 口径的移植实现）
	var rk := my_rank()
	var lv := 1
	if rk == 1:
		lv = 5
	elif rk <= 10:
		lv = 4
	elif rk <= 25:
		lv = 3
	elif rk <= 40 or int(s["wins"]) >= 5:
		lv = 2
	if int(s["wins"]) >= 25:
		lv = maxi(lv, 3)
	s["influence"] = lv

func _stage_goal_met(id: int) -> bool:
	match id:
		1:
			return int(s["wins"]) >= 1
		2:
			return (my_rank() <= 40 or int(s["wins"]) >= 5) and int(s["influence"]) >= 2
		3:
			return (my_rank() <= 25 or int(s["wins"]) >= 12) and int(s["win_streak"]) >= 3
		4:
			return (my_rank() <= 10 or int(s["wins"]) >= 25) and int(s["influence"]) >= 3
		5:
			return (my_rank() == 1 or bool(s["champ_beaten"])) and int(s["influence"]) >= 4
		6:
			return int(s["influence"]) >= 5 and int(s["defenses"]) >= 3
	return false

func _check_stage() -> String:
	var note := ""
	while int(s["stage"]) <= 6 and _stage_goal_met(int(s["stage"])):
		var st: Dictionary = {}
		for x in DataDB.stages():
			if int(x["id"]) == int(s["stage"]):
				st = x
		s["stage_done"] = Array(s["stage_done"]) + [int(s["stage"])]
		s["money"] = int(s["money"]) + int(st.get("reward", 0))
		note += "阶段达成：「%s」奖金 ¥%d！" % [String(st.get("name", "")), int(st.get("reward", 0))]
		s["stage"] = int(s["stage"]) + 1
	return note

# ================= 装备子系统（web Phase 5 口径：双层结构＋定制/拆解/打造/强化 +10） =================

const ENH_MAX := 10
const CRAFT_FEE := 200
const CRAFT_MAT_NEED := 2

func all_gear() -> Array:
	var out: Array = DataDB.shop_gear().duplicate()
	out.append_array(Array(s["custom_gear"]))
	return out

func gear_by_id(gid: String) -> Dictionary:
	for g in all_gear():
		if String(g["id"]) == gid:
			return g
	return {}

func material_name(mid: String) -> String:
	for m in DataDB.materials():
		if String(m["id"]) == mid:
			return String(m["name"])
	return mid

func enh_of(gid: String) -> int:
	var v: Variant = s["enh"].get(gid, 0)
	if typeof(v) == TYPE_INT or typeof(v) == TYPE_FLOAT:
		return clampi(int(v), 0, ENH_MAX)
	return 0

# 装备基础 pct（老口径只有 bonus 时按 ×4 换算兜底，与 web legacyPctOf 同口径）
func gear_pct_of(g: Dictionary) -> Dictionary:
	if g.has("pct"):
		return g["pct"]
	if g.has("bonus"):
		var p := {}
		for k in g["bonus"].keys():
			if float(g["bonus"][k]) != 0.0:
				p[k] = float(g["bonus"][k]) * 4.0
		return p
	return {}

# 指定强化等级下的有效 pct：每级正向 +1 个百分点，负向保持不变（web effPctAt）
func eff_pct_at(g: Dictionary, lvl: int) -> Dictionary:
	var base := gear_pct_of(g)
	var out := {}
	for k in base.keys():
		out[k] = float(base[k]) + float(lvl) if float(base[k]) > 0.0 else float(base[k])
	return out

func eff_pct_of(g: Dictionary) -> Dictionary:
	return eff_pct_at(g, enh_of(String(g["id"])))

# 有效减伤%：有 dr 的装备每强化一级 +1（web effDrOf）
func eff_dr_of(g: Dictionary) -> float:
	if g.has("dr") and float(g["dr"]) != 0.0:
		return float(g["dr"]) + float(enh_of(String(g["id"])))
	return 0.0

# 机制倍率（trauma/stam/cd，均 <1 为正面）：每级按 per 变强、下限 floor（web effMechAt）
func eff_mech_at(g: Dictionary, field: String, lvl: int) -> float:
	var mech: Dictionary = g.get("mech", {})
	if not mech.has(field):
		return 1.0
	var defs: Dictionary = DataDB.constants().get("mech_defs", {})
	var d: Dictionary = defs.get(field, {})
	var floor_v := float(d.get("floor", 0.5))
	var per := float(d.get("per", 0.0))
	return maxf(floor_v, float(mech[field]) - per * float(lvl))

func gear_mech_mul(field: String) -> float:
	var defs: Dictionary = DataDB.constants().get("mech_defs", {})
	var floor_v := float(defs.get(field, {}).get("floor", 0.5))
	var m := 1.0
	for slot in s["gear_equipped"].keys():
		var g := gear_by_id(String(s["gear_equipped"][slot]))
		if not g.is_empty():
			m *= eff_mech_at(g, field, enh_of(String(g["id"])))
	return clampf(m, floor_v, 1.0)

func pct_desc(pct: Dictionary) -> String:
	var names := {"power": "力量", "endurance": "耐久", "will": "意志", "speed": "出拳速度", "accuracy": "精准度", "footwork": "步伐速度", "defense": "防守技术", "technique": "技术"}
	var parts: Array = []
	for k in pct.keys():
		if float(pct[k]) != 0.0:
			parts.append("%s生效 %s%d%%" % [String(names.get(k, k)), "+" if float(pct[k]) > 0.0 else "−", int(absf(float(pct[k])))])
	return " · ".join(parts) if not parts.is_empty() else "无属性加成"

# 指定强化等级下的完整效果说明（pct + 减伤 + 机制；web bonusDescAt）
func bonus_desc_at(g: Dictionary, lvl: int) -> String:
	var parts: Array = []
	var bd := pct_desc(eff_pct_at(g, lvl))
	if bd != "无属性加成":
		parts.append(bd)
	if g.has("dr") and float(g["dr"]) != 0.0:
		parts.append("减伤 %d%%" % int(float(g["dr"]) + float(lvl)))
	var defs: Dictionary = DataDB.constants().get("mech_defs", {})
	var mech: Dictionary = g.get("mech", {})
	for f in defs.keys():
		if mech.has(f):
			var eff := eff_mech_at(g, f, lvl)
			parts.append("%s −%d%%" % [String(defs[f].get("label", f)), int(round((1.0 - eff) * 100.0))])
	return " · ".join(parts) if not parts.is_empty() else "无加成"

func gear_disp_name(g: Dictionary) -> String:
	var lvl := enh_of(String(g["id"]))
	return String(g["name"]) + (" +%d" % lvl if lvl > 0 else "")

# 装备生效汇总（battle 用；含强化后的 pct/dr/机制倍率，web gearPctTotals/gearDrPct/gearMechMul）
func gear_battle_mods() -> Dictionary:
	var pct := {}
	var dr := 0.0
	for slot in s["gear_equipped"].keys():
		var g := gear_by_id(String(s["gear_equipped"][slot]))
		if g.is_empty():
			continue
		var ep := eff_pct_of(g)
		for k in ep.keys():
			pct[k] = float(pct.get(k, 0.0)) + float(ep[k])
		dr += eff_dr_of(g)
	return {"pct": pct, "dr": dr,
		"trauma_mul": gear_mech_mul("trauma"), "stam_mul": gear_mech_mul("stam"),
		"cd_mul": gear_mech_mul("cd")} # cd：Godot 战斗暂无指令冷却系统，倍率照算、引擎暂未消费（见提案 §6 注记）

# ---- 图鉴登记（web registerDex/checkDexAchievements：款式 sig 去重，DEX_ACH 发奖金/称号） ----
func glove_sig(sel: Dictionary) -> String:
	return "%s|%s|%s|%s|%s" % [String(sel["pattern"]), String(sel["outer"]), String(sel["lining"]), str(int(sel["oz"])), String(sel["fix"])]

func register_dex(g: Dictionary) -> Array:
	var notes: Array = []
	if g.is_empty():
		return notes
	var sig := String(g.get("sig", ""))
	if sig == "":
		sig = "combo:" + glove_sig(g["custom"]) if g.has("custom") else "shop:" + String(g["id"])
	if sig not in s["dex_sigs"]:
		s["dex_sigs"] = Array(s["dex_sigs"]) + [sig]
	for a in DataDB.dex_ach():
		if int(a["need"]) <= Array(s["dex_sigs"]).size():
			var ach_id := "dexach_" + String(a["id"])
			if ach_id not in s.get("dex_ach_done", []):
				s["dex_ach_done"] = Array(s.get("dex_ach_done", [])) + [ach_id]
				s["money"] = int(s["money"]) + int(a["reward"])
				var t: Variant = a.get("title", null)
				if t != null and String(t) not in s["titles"]:
					s["titles"] = Array(s["titles"]) + [String(t)]
				notes.append("图鉴成就达成：集齐 %d 款装备！奖励 ¥%d 已到账%s。" % [int(a["need"]), int(a["reward"]), "，获得称号「%s」" % String(t) if t != null else ""])
	return notes

# ---- 定制 / 打造（web computeGlove/makeCustomGear） ----
func compute_glove(sel: Dictionary) -> Dictionary:
	var p: Dictionary = DataDB.glove_patterns()[String(sel["pattern"])]
	var o: Dictionary = DataDB.glove_outers()[String(sel["outer"])]
	var l: Dictionary = DataDB.glove_linings()[String(sel["lining"])]
	var ozd: Dictionary = DataDB.glove_oz().get(str(int(sel["oz"])), DataDB.glove_oz()["12"])
	var fx: Dictionary = DataDB.glove_fix().get(String(sel["fix"]), DataDB.glove_fix()["velcro"])
	var pct := {}
	for b in [p["pct"], o["pct"], l["pct"], ozd["pct"], fx["pct"]]:
		for k in b.keys():
			pct[k] = float(pct.get(k, 0.0)) + float(b[k])
	for k in pct.keys():
		if float(pct[k]) == 0.0:
			pct.erase(k)
	var price := clampi(int(p["base"]) + int(o["price"]) + int(l["price"]) + int(ozd["adj"]) + int(fx["price"]), 800, 6000)
	var short_name := String(p["name"]).replace("系", "") + String(o["name"]) + str(int(sel["oz"])) + "oz"
	return {"price": price, "pct": pct, "short_name": short_name,
		"desc": "%s · %s外皮 · %s内衬 · %doz · %s — %s" % [String(p["name"]), String(o["name"]), String(l["name"]), int(sel["oz"]), String(fx["name"]), pct_desc(pct)]}

func make_custom_gear(sel: Dictionary, source: String) -> Dictionary:
	var c := compute_glove(sel)
	s["custom_seq"] = int(s["custom_seq"]) + 1
	var g := {
		"id": ("craft" if source == "craft" else "custom") + "-" + str(int(s["custom_seq"])),
		"slot": "gloves",
		"name": ("打造·" if source == "craft" else "定制·") + String(c["short_name"]) + "拳套",
		"price": int(c["price"]), "desc": String(c["desc"]), "pct": c["pct"],
		"custom": {"pattern": String(sel["pattern"]), "outer": String(sel["outer"]), "lining": String(sel["lining"]), "oz": int(sel["oz"]), "fix": String(sel["fix"])},
		"source": source, "sig": "combo:" + glove_sig(sel),
	}
	s["custom_gear"] = Array(s["custom_gear"]) + [g]
	s["gear_owned"] = Array(s["gear_owned"]) + [String(g["id"])]
	last_dex_notes = register_dex(g)
	return g

# 定制购买（商店工坊）：扣全款、存入背包（不自动装备，与 web 同口径）；成功时心态 +10（web changeMind）
func buy_custom_glove(sel: Dictionary) -> Dictionary:
	var c := compute_glove(sel)
	if int(s["money"]) < int(c["price"]):
		return {}
	var g := make_custom_gear(sel, "custom")
	s["money"] = int(s["money"]) - int(c["price"])
	s["mind"] = mini(100, int(s["mind"]) + 10)
	return g

# 工坊打造：对应外皮材料 ×2 ＋ 内衬材料 ×2 ＋ 手工费 ¥200，规格固定 12oz·魔术贴（web confirmCraft）
func craft_glove(pattern: String, outer: String, lining: String) -> Dictionary:
	if int(s["money"]) < CRAFT_FEE:
		return {}
	if int(s["materials"].get(outer, 0)) < CRAFT_MAT_NEED or int(s["materials"].get(lining, 0)) < CRAFT_MAT_NEED:
		return {}
	s["materials"][outer] = int(s["materials"][outer]) - CRAFT_MAT_NEED
	s["materials"][lining] = int(s["materials"][lining]) - CRAFT_MAT_NEED
	s["money"] = int(s["money"]) - CRAFT_FEE
	var g := make_custom_gear({"pattern": pattern, "outer": outer, "lining": lining, "oz": 12, "fix": "velcro"}, "craft")
	s["mind"] = mini(100, int(s["mind"]) + 10) # web 打造成功 changeMind(+10)
	return g

func equip_gear(gid: String) -> bool:
	var g := gear_by_id(gid)
	if g.is_empty() or gid not in s["gear_owned"]:
		return false
	s["gear_equipped"][String(g["slot"])] = gid
	return true

# ---- 拆解（web confirmDismantle：产出 [皮料, 内衬] 各随机 1~3；已装备不可拆；不耗 AP） ----
func dismantle_yield_for(g: Dictionary) -> Array:
	if g.has("custom"):
		return [String(g["custom"]["outer"]), String(g["custom"]["lining"])]
	var m: Dictionary = DataDB.dismantle_map()
	return Array(m.get(String(g["id"]), ["synthetic", "latex"]))

func dismantle_gear(gid: String) -> Dictionary:
	var g := gear_by_id(gid)
	if g.is_empty() or gid not in s["gear_owned"]:
		return {"ok": false, "msg": "背包里没有这件装备"}
	if String(s["gear_equipped"].get(String(g["slot"]), "")) == gid:
		return {"ok": false, "msg": "已装备的装备不能拆解，先换上别的再拆"}
	var y := dismantle_yield_for(g)
	_rng.randomize()
	var q0 := 1 + _rng.randi_range(0, 2)
	var q1 := 1 + _rng.randi_range(0, 2)
	s["materials"][y[0]] = int(s["materials"].get(y[0], 0)) + q0
	s["materials"][y[1]] = int(s["materials"].get(y[1], 0)) + q1
	var owned: Array = Array(s["gear_owned"])
	owned.erase(gid)
	s["gear_owned"] = owned
	if g.has("custom"):
		var cg: Array = Array(s["custom_gear"])
		for i in cg.size():
			if String(cg[i]["id"]) == gid:
				cg.remove_at(i)
				break
		s["custom_gear"] = cg
	s["enh"].erase(gid) # 拆解后强化等级随装备消失（web 同口径）
	return {"ok": true, "mat0": y[0], "q0": q0, "mat1": y[1], "q1": q1, "name": String(g["name"])}

# ---- 强化 +0~+10（web confirmEnhance：成功率 100%；费用 ¥300×(等级+1)；
#      材料按 ENH_MAT_CURVE 从该装备对应的皮料＋内衬两类合计扣除，先扣皮料、内衬补足） ----
func enh_cost(g: Dictionary) -> Dictionary:
	var lvl := enh_of(String(g["id"]))
	var curve: Array = DataDB.constants().get("enh_mat_curve", [1, 1, 1, 1, 2, 2, 2, 2, 3, 3])
	return {"lvl": lvl, "money": 300 * (lvl + 1), "mat_ids": dismantle_yield_for(g),
		"mat_count": 0 if lvl >= ENH_MAX else int(curve[lvl])}

func enh_mat_stock(g: Dictionary) -> int:
	var y := dismantle_yield_for(g)
	return int(s["materials"].get(y[0], 0)) + int(s["materials"].get(y[1], 0))

func enhance_gear(gid: String) -> Dictionary:
	var g := gear_by_id(gid)
	if g.is_empty() or gid not in s["gear_owned"]:
		return {"ok": false, "msg": "背包里没有这件装备"}
	var c := enh_cost(g)
	if int(c["lvl"]) >= ENH_MAX:
		return {"ok": false, "msg": "%s 已强化满级（+10）" % String(g["name"])}
	if int(s["money"]) < int(c["money"]):
		return {"ok": false, "msg": "金钱不够（需 ¥%d）" % int(c["money"])}
	if enh_mat_stock(g) < int(c["mat_count"]):
		return {"ok": false, "msg": "材料不足：对应皮料＋内衬合计需 %d 个" % int(c["mat_count"])}
	s["money"] = int(s["money"]) - int(c["money"])
	var ids: Array = c["mat_ids"]
	var take0 := mini(int(s["materials"].get(ids[0], 0)), int(c["mat_count"]))
	s["materials"][ids[0]] = int(s["materials"].get(ids[0], 0)) - take0
	s["materials"][ids[1]] = int(s["materials"].get(ids[1], 0)) - (int(c["mat_count"]) - take0)
	s["enh"][gid] = int(c["lvl"]) + 1
	return {"ok": true, "lvl": int(c["lvl"]) + 1, "money": int(c["money"]), "mat_count": int(c["mat_count"]), "name": String(g["name"])}

func buy_gear(gid: String) -> Dictionary:
	# 返回新解锁的图鉴成就播报（可能为空）；购买失败返回 {"ok": false}
	for g in DataDB.shop_gear():
		if String(g["id"]) == gid:
			if int(s["money"]) < int(g["price"]) or gid in s["gear_owned"]:
				return {"ok": false}
			s["money"] = int(s["money"]) - int(g["price"])
			s["gear_owned"] = Array(s["gear_owned"]) + [gid]
			s["gear_equipped"][String(g["slot"])] = gid
			last_dex_notes = register_dex(g)
			return {"ok": true}
	return {"ok": false}

# ================= 赞助（web Phase 3：4 档，门槛 = 影响力档位 need，同时只能签一家） =================

func sponsor_by_id(id: String) -> Dictionary:
	for sp in DataDB.sponsors():
		if String(sp["id"]) == id:
			return sp
	return {}

func current_sponsor() -> Dictionary:
	var id := String(s.get("sponsor", ""))
	return sponsor_by_id(id) if id != "" else {}

# 签约：门槛未达/已签他家 → {ok:false, msg}；成功签约金立即到账（web signSponsor 同口径，不耗 AP）
func sign_sponsor(id: String) -> Dictionary:
	var sp := sponsor_by_id(id)
	if sp.is_empty():
		return {"ok": false, "msg": "没有这家赞助商"}
	if String(s.get("sponsor", "")) != "":
		return {"ok": false, "msg": "已签约其他赞助商，先解约再换"}
	if int(s["influence"]) < int(sp["need"]):
		return {"ok": false, "msg": "影响力不足（需要 Lv%d）" % int(sp["need"])}
	s["sponsor"] = id
	s["money"] = int(s["money"]) + int(sp["sign"])
	return {"ok": true, "sp": sp}

# 解约：已领签约金不退还，解约后可立即签其他家（web cancelSponsor 同口径，不耗 AP）
func cancel_sponsor() -> Dictionary:
	var sp := current_sponsor()
	if sp.is_empty():
		return {"ok": false, "msg": "当前没有签约中的赞助商"}
	s["sponsor"] = ""
	return {"ok": true, "sp": sp}

# ================= 成就判定（web Phase 9：31 项纯荣誉，判定只读状态字段） =================
# 31/31 全可判定（2026-11-18 补完三：sponsor_any 接赞助系统、prologue_done 接序章）。

func achievement_met(id: String) -> bool:
	match id:
		"first_win":
			return int(s["wins"]) >= 1
		"wins_10":
			return int(s["wins"]) >= 10
		"wins_25":
			return int(s["wins"]) >= 25
		"wins_50":
			return int(s["wins"]) >= 50
		"first_ko":
			return int(s["ko_wins"]) >= 1
		"ko_10":
			return int(s["ko_wins"]) >= 10
		"streak_3":
			return int(s["win_streak"]) >= 3
		"streak_5":
			return int(s["win_streak"]) >= 5
		"streak_10":
			return int(s["win_streak"]) >= 10
		"spar_first":
			return int(s.get("spars", 0)) >= 1
		"rank_25":
			return my_rank() <= 25
		"rank_10":
			return my_rank() <= 10
		"rank_1":
			return my_rank() <= 1
		"influence_3":
			return int(s["wins"]) >= 10 or my_rank() <= 25
		"influence_5":
			return my_rank() <= 1
		"stage_4":
			return int(s["stage"]) >= 4 or 4 in s["stage_done"]
		"stage_6":
			return int(s["stage"]) >= 6 or 6 in s["stage_done"]
		"champ_slayer":
			return bool(s["champ_beaten"])
		"defend_1":
			return int(s["defenses"]) >= 1
		"defend_3":
			return int(s["defenses"]) >= 3
		"first_craft":
			for g in s["custom_gear"]:
				if String(g.get("source", "")) == "craft":
					return true
			return false
		"custom_first":
			for g in s["custom_gear"]:
				if String(g.get("source", "")) == "custom":
					return true
			return false
		"enh_5":
			for k in s["enh"].keys():
				if enh_of(String(k)) >= 5:
					return true
			return false
		"enh_10":
			for k in s["enh"].keys():
				if enh_of(String(k)) >= 10:
					return true
			return false
		"dex_10":
			return Array(s["dex_sigs"]).size() >= 10
		"money_10k":
			return int(s["money"]) >= 10000
		"affinity_60":
			for k in s["aff"].keys():
				if int(s["aff"][k]) >= 60:
					return true
			return false
		"affinity_90":
			for k in s["aff"].keys():
				if int(s["aff"][k]) >= 90:
					return true
			return false
		"spar_rival_3":
			return int(s["spar_rival"]) >= 3
		"sponsor_any": # web check：!!s.sponsor
			return String(s.get("sponsor", "")) != ""
		"prologue_done": # web check：s.story.prologueDone
			return bool(s.get("prologue_done", false))
	return false

# 返回本次新解锁的成就条目数组（调用方负责播报）
func check_achievements() -> Array:
	var newly: Array = []
	for a in DataDB.achievements():
		var id := String(a["id"])
		if id in s["achievements"]:
			continue
		if achievement_met(id):
			s["achievements"] = Array(s["achievements"]) + [id]
			newly.append(a)
	return newly

# ================= 对手人格（web foePersonaFor：风格 × key 确定性散列派生，跨场一致） =================

static func persona_hash(text: String) -> int:
	var h := 0
	for i in text.length():
		h = (h * 31 + text.unicode_at(i)) & 0xFFFFFFFF
	return h

static func foe_persona(style: String, key: String) -> Dictionary:
	var h := persona_hash(key + "|" + style)
	var base := ""
	match style:
		"power":
			base = "attack"
		"speed":
			base = "points"
		"guardcounter":
			base = "counter"
		_:
			base = ["attack", "counter", "points"][h % 3]
	var adjust_pool := {
		"attack": ["comeback", "desperate", "none"],
		"points": ["protect", "comeback", "none"],
		"counter": ["comeback", "protect", "none"],
	}
	return {"base": base, "adjust": adjust_pool[base][(h / 3) % 3]}

# ================= 卫冕挑战（web G9：maybeDefenseChallenge/pickChallenger） =================

func defense_line(key: String) -> String:
	var d := DataDB.defense_lines()
	var spec: Dictionary = d.get("specific", {})
	if spec.has(key):
		return String(spec[key])
	var gen: Array = d.get("generic", [])
	if gen.is_empty():
		return "冠军只有一个。下一场，我来当那一个。"
	_rng.randomize()
	return String(gen[_rng.randi_range(0, gen.size() - 1)])

# 挑战者：第 2~6 名具名角色，按战绩水位（rating 代理）＋人格侵略性打分取最高（web pickChallenger）
func _pick_challenger() -> Dictionary:
	var ranking: Array = s["ranking"]
	if ranking.size() < 6:
		return {}
	var best := {}
	var best_score := -1.0e18
	_rng.randomize()
	for r in range(2, 7):
		var key := String(ranking[r - 1])
		if key == "me":
			continue
		var entry := roster_entry(key)
		var p := foe_persona(String(entry.get("style", "balanced")), key)
		# rating 代理：web rosterRatingFor 的名次/周数组成 + Godot 侧个体成长 foe_bonus（量级近似）
		var rating := 9.3 + (50.0 - float(r)) * 0.3 + 0.7 * float(maxi(0, int(s["week"]) - 1)) + float(s["foe_bonus"].get(key, 0.0))
		var score := rating + (0.6 if String(p["base"]) == "attack" else 0.0) \
			+ (0.4 if String(p["adjust"]) == "desperate" else (0.3 if String(p["adjust"]) == "comeback" else 0.0)) \
			+ _rng.randf() * 0.5
		if score > best_score:
			best_score = score
			best = {"key": key, "name": String(entry.get("name", key)), "rank": r, "week": int(s["week"])}
	return best

# 补检挑战生命周期（进游戏/睡觉跨日/正式赛结算后调用）；返回需要播报的日志行
func maybe_defense_challenge() -> Array:
	var notes: Array = []
	var ch: Dictionary = s.get("defense_challenge", {})
	if not ch.is_empty():
		if my_rank() != 1: # 王座已失：挑战作废
			notes.append("你已跌下第 1 名，%s 的卫冕战挑战随之作废——先把王座抢回来再说。" % String(ch.get("name", "挑战者")))
			s["defense_challenge"] = {}
		return notes
	if my_rank() != 1:
		return notes
	if int(s["wins"]) + int(s["losses"]) < 1:
		return notes
	if int(s["week"]) <= int(s["defense_week"]): # 本周已打过卫冕战：每周至多 1 场
		return notes
	var pick := _pick_challenger()
	if pick.is_empty():
		return notes
	s["defense_challenge"] = pick
	notes.append("👑 卫冕战挑战！%s（第 %d 名）向国内冠军发起正式挑战：「%s」——去比赛屏应战，赢下它才算坐稳王座。" % [String(pick["name"]), int(pick["rank"]), defense_line(String(pick["key"]))])
	return notes

# ---- 存档 ----
static func save_path(slot: int) -> String:
	return "user://save_slot_%d.json" % slot

func save_to(slot: int) -> bool:
	var f := FileAccess.open(save_path(slot), FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(s))
	return true

static func slot_exists(slot: int) -> bool:
	return FileAccess.file_exists(save_path(slot))

static func load_from(slot: int) -> GameState:
	var gs := GameState.new()
	if not slot_exists(slot):
		return gs
	var f := FileAccess.open(save_path(slot), FileAccess.READ)
	var v: Variant = JSON.parse_string(f.get_as_text())
	if typeof(v) == TYPE_DICTIONARY and int(v.get("ver", 0)) <= SAVE_VER:
		# 与默认档合并，老档缺字段自动补齐
		var merged := default_state()
		for k in v.keys():
			merged[k] = v[k]
		# 序章迁移（web Phase 7 同口径）：无 prologue_done 字段的老档视为序章已完成，绝不被序章卡住
		if not v.has("prologue_done"):
			merged["prologue_done"] = true
		gs.s = merged
	return gs

static func delete_slot(slot: int) -> void:
	if slot_exists(slot):
		DirAccess.remove_absolute(save_path(slot))
