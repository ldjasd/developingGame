extends SceneTree
## 无头冒烟：生涯循环 + 战斗引擎 + 存档 全流程断言。运行：
##   godot --headless --path <proj> --script res://scripts/dev/smoke_test.gd
## 输出 SMOKE_PASS / SMOKE_FAIL 行，最后 quit(0/1)。

var fails := 0

func check(cond: bool, label: String) -> void:
	if cond:
		print("  ok: ", label)
	else:
		fails += 1
		printerr("  FAIL: ", label)

func _init() -> void:
	print("== smoke start ==")
	# --- 数据表 ---
	check(DataDB.trainings().size() == 13, "trainings 13")
	check(DataDB.roster().size() == 50, "roster 50")
	check(DataDB.shop_gear().size() == 21, "shop 21")
	check(not DataDB.daily_events().is_empty(), "daily events")
	check(not DataDB.story_events().is_empty(), "story events")
	# --- 生涯 ---
	var gs := GameState.new()
	check(gs.my_rank() == 50, "初始排名 50 (got %d)" % gs.my_rank())
	var ap0 := int(gs.s["ap"])
	var msg := gs.do_training("strength")
	check(msg != "" and int(gs.s["ap"]) == ap0 - 3, "力量训练扣 3 AP")
	check(float(gs.s["attrs"]["power"]) > 10.0, "力量上涨")
	gs.do_training("meditation")
	check(int(gs.s["mind"]) > 50, "冥想心态 +10")
	for i in 7:
		gs.sleep()
	check(int(gs.s["week"]) == 2, "7 天后进入第 2 周")
	check(int(gs.s["ap"]) == GameState.AP_PER_DAY, "睡觉回满 AP")
	# --- 商店 ---
	gs.s["money"] = 5000
	check(bool(gs.buy_gear("gloves1").get("ok", false)), "购买新手拳套")
	var mods := gs.gear_battle_mods()
	check(float(mods["pct"].get("power", 0.0)) > 0.0, "装备属性生效")
	# --- 装备子系统补完：定制 / 拆解 / 打造 / 强化 / 图鉴 ---
	check(DataDB.materials().size() == 7, "材料表 7 种")
	check(DataDB.dismantle_map().size() == 21, "拆解表覆盖 21 件商店装备")
	var sel := {"pattern": "classic", "outer": "calf", "lining": "latex", "oz": 12, "fix": "velcro"}
	var comp := gs.compute_glove(sel)
	check(int(comp["price"]) == 700 + 600 + 300 + 100 + 0, "定制价格公式（版型+外皮+内衬+盎司+固定）")
	check(int(comp["pct"].get("power", 0)) == 5 and int(comp["pct"].get("technique", 0)) == 5, "定制 pct 五部件合成")
	gs.s["money"] = 30000
	var cg := gs.buy_custom_glove(sel)
	check(not cg.is_empty() and String(cg["source"]) == "custom", "定制拳套生成")
	check(String(cg["id"]) in gs.s["gear_owned"], "定制拳套入背包")
	check(gs.achievement_met("custom_first"), "成就「量身定制」可判定")
	# 拆解：gloves2 购买后自动装备，gloves1 让出装备位可拆
	check(bool(gs.buy_gear("gloves2").get("ok", false)), "购买标准拳套")
	var mat_before := int(gs.s["materials"]["synthetic"]) + int(gs.s["materials"]["latex"])
	check(not bool(gs.dismantle_gear("gloves2").get("ok", false)), "已装备装备不可拆解")
	var dis := gs.dismantle_gear("gloves1")
	check(bool(dis.get("ok", false)), "拆解新手拳套")
	var mat_after := int(gs.s["materials"]["synthetic"]) + int(gs.s["materials"]["latex"])
	check(mat_after - mat_before >= 2 and mat_after - mat_before <= 6, "拆解产出皮料+内衬各 1~3")
	check("gloves1" not in gs.s["gear_owned"], "拆解后装备消失")
	# 强化：gloves2 材料对 = [calf, latex]，+0→+1 需 ¥300＋材料 ×1，正向 pct +1
	gs.s["materials"]["calf"] = 10
	gs.s["materials"]["latex"] = 10
	var money_before_enh := int(gs.s["money"])
	var enh := gs.enhance_gear("gloves2")
	check(bool(enh.get("ok", false)) and int(enh["lvl"]) == 1, "强化到 +1")
	check(int(gs.s["money"]) == money_before_enh - 300, "强化费用 ¥300×(等级+1)")
	check(int(gs.eff_pct_of(gs.gear_by_id("gloves2"))["power"]) == 12, "强化后正向 pct +1（11→12）")
	check(float(gs.gear_battle_mods()["pct"].get("power", 0.0)) >= 12.0, "战斗汇总含强化 pct")
	# 打造：calf ×2 + latex ×2 + ¥200
	var calf_before := int(gs.s["materials"]["calf"])
	var money_before_craft := int(gs.s["money"])
	var crafted := gs.craft_glove("classic", "calf", "latex")
	check(not crafted.is_empty() and String(crafted["source"]) == "craft", "工坊打造生成")
	check(int(gs.s["materials"]["calf"]) == calf_before - 2 and int(gs.s["money"]) == money_before_craft - 200, "打造扣材料 ×2＋手工费 ¥200")
	check(gs.achievement_met("first_craft"), "成就「亲手打造」可判定")
	check(Array(gs.s["dex_sigs"]).size() >= 3, "图鉴登记（商店款+定制+打造）")
	# --- 成就补接判定 ---
	gs.s["ko_wins"] = 1
	check(gs.achievement_met("first_ko"), "成就「一击入魂」可判定（ko_wins）")
	gs.s["aff"]["rival"] = 60
	check(gs.achievement_met("affinity_60"), "成就「亲近信赖」可判定（好感 60）")
	gs.s["spar_rival"] = 3
	check(gs.achievement_met("spar_rival_3"), "成就「宿敌之约」可判定")
	check(not gs.achievement_met("sponsor_any"), "未签约时赞助成就未达成")
	check(not gs.achievement_met("prologue_done"), "新档序章成就未达成")
	var newly := gs.check_achievements()
	check(newly.size() >= 3, "成就批量解锁（got %d）" % newly.size())
	# --- 赞助系统（web Phase 3：门槛=影响力档 / 签约金立即到账 / 每周第 1 天周薪 / 解约） ---
	check(DataDB.sponsors().size() == 4, "赞助商 4 档")
	var gs4 := GameState.new()
	check(not bool(gs4.sign_sponsor("ranli").get("ok", false)), "影响力 Lv1 签不了 Lv2 赞助（门槛）")
	var money_pre_sign := int(gs4.s["money"])
	check(bool(gs4.sign_sponsor("ramen").get("ok", false)), "签约街边拉面店（Lv1 门槛）")
	check(int(gs4.s["money"]) == money_pre_sign + 300, "签约金 ¥300 立即到账")
	check(gs4.achievement_met("sponsor_any"), "成就「商业首秀」可判定")
	check(not bool(gs4.sign_sponsor("tiequan").get("ok", false)), "已签约时不可再签他家")
	var money_pre_week := int(gs4.s["money"])
	for i in 7:
		gs4.sleep()
	check(int(gs4.s["week"]) == 2, "赞助档进入第 2 周")
	check(int(gs4.s["money"]) == money_pre_week + 50, "每周第 1 天周薪 ¥50 到账")
	check(bool(gs4.cancel_sponsor().get("ok", false)), "解约成功")
	check(String(gs4.s.get("sponsor", "")) == "" and not gs4.achievement_met("sponsor_any"), "解约后无签约（判定回落）")
	gs4.s["influence"] = 4
	check(bool(gs4.sign_sponsor("shengdao").get("ok", false)), "影响力 Lv4 可签全国体育连锁「胜道」")
	check(int(gs4.s["money"]) == money_pre_week + 50 + 12000, "胜道签约金 ¥12000 到账")
	# --- 序章（web Phase 7：新档未完成 / 完成置位 / 老档迁移视为已完成） ---
	var gs5 := GameState.new()
	check(not bool(gs5.s.get("prologue_done", true)), "新档 prologue_done=false")
	gs5.s["prologue_done"] = true
	check(gs5.achievement_met("prologue_done"), "成就「命运的测力机」可判定")
	var f_old := FileAccess.open(GameState.save_path(1), FileAccess.WRITE)
	f_old.store_string(JSON.stringify({"ver": 1, "day": 5}))
	f_old.close()
	var gs_old := GameState.load_from(1)
	check(bool(gs_old.s.get("prologue_done", false)), "老档迁移：无序章字段视为已完成")
	check(int(gs_old.s["day"]) == 5, "老档其余字段照常读入")
	GameState.delete_slot(1)
	# --- 存档 ---
	check(gs.save_to(2), "存档槽 3")
	var gs2 := GameState.load_from(2)
	check(int(gs2.s["money"]) == int(gs.s["money"]) and int(gs2.s["wins"]) == int(gs.s["wins"]), "读档一致")
	# --- 战斗：新人 vs 49 名，应多败 ---
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	var newbie_wins := 0
	var ko_kinds := {}
	for i in 30:
		var eng := BattleEngine.new()
		eng.rng.seed = 1000 + i
		var pa := BattleEngine.make_fighter("你", true, _attrs(10.0), {"style_key": "balanced"})
		var pb := BattleEngine.make_fighter("对手", false, _attrs(26.0), {"style_key": "balanced"})
		eng.start(pa, pb)
		var res := eng.simulate_all()
		check(not res.is_empty(), "模拟完整场 #%d" % i) if i == 0 else null
		if bool(res.get("winner_is_a", false)):
			newbie_wins += 1
		ko_kinds[String(res.get("how", "?"))] = int(ko_kinds.get(String(res.get("how", "?")), 0)) + 1
	print("  新人 vs 强敌 胜场: ", newbie_wins, "/30; 终结方式: ", ko_kinds)
	check(newbie_wins <= 8, "新人打强敌不应多胜")
	# --- 战斗：强者 vs 弱者，应多胜 ---
	var strong_wins := 0
	for i in 30:
		var eng := BattleEngine.new()
		eng.rng.seed = 5000 + i
		var pa := BattleEngine.make_fighter("你", true, _attrs(60.0), {"style_key": "balanced"})
		var pb := BattleEngine.make_fighter("对手", false, _attrs(20.0), {"style_key": "speed"})
		eng.start(pa, pb)
		var res := eng.simulate_all()
		if bool(res.get("winner_is_a", false)):
			strong_wins += 1
	print("  强者 vs 弱者 胜场: ", strong_wins, "/30")
	check(strong_wins >= 20, "强者应多胜")
	# --- 结算：胜高位对手升名次 + 阶段 1 达成 ---
	var rank_before := gs.my_rank()
	var foe := String(gs.s["ranking"][rank_before - 2]) # 上一名
	var out := gs.settle_match(foe, true)
	check(gs.my_rank() == rank_before - 1, "胜上一名后升至 %d" % (rank_before - 1))
	check(int(out["prize"]) > 0, "奖金到账")
	check(1 in gs.s["stage_done"], "首胜达成阶段 1")
	check(int(gs.s["influence"]) >= 1, "影响力字段存在")
	# --- 卫冕挑战（G9）：生成 → 每周 1 场 → 结算记账 → 跌落作废 ---
	var gs3 := GameState.new()
	var rk3: Array = gs3.s["ranking"]
	rk3.erase("me")
	rk3.insert(0, "me")
	gs3.s["ranking"] = rk3
	gs3.s["wins"] = 5
	var notes3 := gs3.maybe_defense_challenge()
	check(notes3.size() == 1, "登顶后生成卫冕挑战播报")
	var ch3: Dictionary = gs3.s["defense_challenge"]
	check(not ch3.is_empty() and int(ch3["rank"]) >= 2 and int(ch3["rank"]) <= 6, "挑战者为第 2~6 名（got %s）" % str(ch3.get("rank", 0)))
	check(gs3.maybe_defense_challenge().is_empty(), "已有待应战挑战时不重复生成")
	gs3.settle_match(String(ch3["key"]), true, true)
	check(int(gs3.s["defenses"]) == 1, "卫冕战获胜计 1 次卫冕")
	check(Dictionary(gs3.s["defense_challenge"]).is_empty(), "卫冕结算清挑战")
	check(int(gs3.s["defense_week"]) == int(gs3.s["week"]), "卫冕结算记本周已战")
	check(gs3.maybe_defense_challenge().is_empty(), "同周不再生成挑战（每周至多 1 场）")
	for i in 7:
		gs3.sleep()
	check(int(gs3.s["week"]) == 2, "进入第 2 周")
	check(gs3.maybe_defense_challenge().size() == 1, "次周重新生成挑战")
	var rk3b: Array = gs3.s["ranking"]
	rk3b.erase("me")
	rk3b.insert(4, "me")
	gs3.s["ranking"] = rk3b
	var drop_notes := gs3.maybe_defense_challenge()
	check(drop_notes.size() == 1 and Dictionary(gs3.s["defense_challenge"]).is_empty(), "跌下第 1 名挑战作废")
	# --- KO 体系结构断言：无单发 KO（单次交换不可能直接终结满状态对手）---
	var eng2 := BattleEngine.new()
	eng2.rng.seed = 777
	var qa := BattleEngine.make_fighter("攻", true, _attrs(90.0), {"style_key": "power"})
	var qb := BattleEngine.make_fighter("守", false, _attrs(30.0), {"style_key": "balanced"})
	eng2.start(qa, qb)
	eng2.do_exchange(true, "upper")
	check(not eng2.finished, "单次交换不终结比赛（无单发 KO）")
	# --- 2026-11-21：比赛日 / 心态规则（web 口径补回）---
	var gs_md := GameState.new()
	check(not gs_md.is_match_day() and gs_md.days_to_match() == 6, "第 1 天不是比赛日，距比赛日 6 天")
	for i in 6:
		gs_md.sleep()
	check(int(gs_md.s["day"]) == 7 and gs_md.is_match_day() and gs_md.can_fight_official(), "第 7 天是比赛日且可报名")
	var foe_md := String(gs_md.s["ranking"][gs_md.my_rank() - 2])
	gs_md.s["mind"] = 50
	gs_md.settle_match(foe_md, true)
	check(not gs_md.can_fight_official(), "同一比赛日只能打 1 场正式赛")
	check(int(gs_md.s["mind"]) == 65, "胜场心态 +15（got %d）" % int(gs_md.s["mind"]))
	gs_md.settle_match(foe_md, false, false, true)
	check(int(gs_md.s["mind"]) == 40, "被 KO 心态 −25（got %d）" % int(gs_md.s["mind"]))
	gs_md.sleep()
	check(int(gs_md.s["mind"]) == 45, "睡觉心态向 60 回归 +5（got %d）" % int(gs_md.s["mind"]))
	gs_md.s["mind"] = 85
	gs_md.s["ap"] = 6
	var pw_md := float(gs_md.s["attrs"]["power"])
	gs_md.do_training("strength")
	check(absf(float(gs_md.s["attrs"]["power"]) - pw_md - 3.0 * GameState.diminish(pw_md) * 1.1) < 0.001, "心态高昂训练效率 ×1.1")
	print("== smoke done, fails=", fails, " ==")
	if fails == 0:
		print("SMOKE_PASS")
		quit(0)
	else:
		print("SMOKE_FAIL")
		quit(1)

func _attrs(v: float) -> Dictionary:
	var d := {}
	for k in GameState.ATTR_KEYS:
		d[k] = v
	return d
