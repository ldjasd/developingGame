extends SceneTree
## 实时内核诊断：一场里出拳数、射程外空挥、闪开、格挡、命中、平均距离、各步法意图占比。
## godot --headless --path . --script res://scripts/dev/rt_diag.gd

var cnt := {}

func _on(ev: Dictionary) -> void:
	var k := String(ev["type"])
	if k == "whiff":
		k = "whiff_range" if bool(ev.get("range", false)) else ("whiff_dodged" if bool(ev.get("dodged", false)) else "whiff_miss")
	cnt[k] = int(cnt.get(k, 0)) + 1


func _init() -> void:
	var attrs := {}
	for k in GameState.ATTR_KEYS:
		attrs[k] = 30.0
	var dist_sum := 0.0
	var steps := 0
	var intents := {}
	for i in 6:
		var core := BattleCore.new()
		core.event.connect(_on)
		var pa := BattleCore.make("A", true, attrs.duplicate(), {"ai": true, "tell": 0.4})
		var pb := BattleCore.make("B", false, attrs.duplicate(), {"style_key": ["balanced", "power", "speed"][i % 3]})
		core.start(pa, pb, 900 + i)
		while not core.finished:
			core.step(1.0 / 30.0)
			dist_sum += core.distance()
			steps += 1
			var it := String(pb.get("ai_intent", "")) + ("+plan" if String(pb.get("ai_plan", "")) != "" else "")
			intents[it] = int(intents.get(it, 0)) + 1
	print("每场平均：", JSON.stringify(_per(cnt, 6.0)))
	print("平均距离 %.2f m" % (dist_sum / steps))
	print("B 意图占比：", JSON.stringify(_per(intents, steps / 100.0)))
	quit(0)


func _per(d: Dictionary, n: float) -> Dictionary:
	var o := {}
	for k in d:
		o[k] = snappedf(float(d[k]) / n, 0.1)
	return o
