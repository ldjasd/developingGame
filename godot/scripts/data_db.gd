class_name DataDB
extends RefCounted
## 数据表访问：data/*.json（从 web 版提取，数值口径以 web v43 为准）。

static var _cache: Dictionary = {}

static func load_json(name: String) -> Variant:
	if _cache.has(name):
		return _cache[name]
	var path := "res://data/" + name + ".json"
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("DataDB: missing " + path)
		return {}
	var v: Variant = JSON.parse_string(f.get_as_text())
	_cache[name] = v
	return v

static func punches() -> Dictionary:
	return load_json("punches")

static func constants() -> Dictionary:
	return load_json("constants")

static func trainings() -> Array:
	return load_json("trainings")

static func roster() -> Array:
	return load_json("roster")

static func stages() -> Array:
	return load_json("stages")

static func shop_gear() -> Array:
	return load_json("shop_gear")

static func foe_styles() -> Dictionary:
	return load_json("foe_styles")

static func influence_levels() -> Array:
	return load_json("influence_levels")

static func daily_events() -> Dictionary:
	var d: Dictionary = load_json("daily_events")
	return d.get("events", {})

static func story_events() -> Dictionary:
	return load_json("story_events")

static func achievements() -> Array:
	var d: Dictionary = load_json("achievements")
	return d.get("achievements", [])

static func slot_names() -> Dictionary:
	return load_json("slot_names")

static func materials() -> Array:
	return load_json("materials")

static func dismantle_map() -> Dictionary:
	return load_json("dismantle_map")

static func glove_patterns() -> Dictionary:
	return load_json("glove_patterns")

static func glove_outers() -> Dictionary:
	return load_json("glove_outers")

static func glove_linings() -> Dictionary:
	return load_json("glove_linings")

static func glove_oz() -> Dictionary:
	return load_json("glove_oz")

static func glove_fix() -> Dictionary:
	return load_json("glove_fix")

static func dex_ach() -> Array:
	return load_json("dex_ach")

static func defense_lines() -> Dictionary:
	return load_json("defense_lines")

static func sponsors() -> Array:
	return load_json("sponsors")

static func story_chars() -> Dictionary:
	return load_json("story_chars")

static func rig_char_for(roster_key: String) -> String:
	# 与 web FOE_ANIM_CHARS 同一映射：有侧面图、可骨骼化的重点角色
	var m := {
		"opp_world_champion": "evelyn",
		"opp_champion_domestic": "champion_domestic",
		"opp_rookie": "rookie",
		"opp_shy": "shy",
		"opp_pocket": "pocket",
		"opp_braid": "braid",
		"opp_brick": "brick",
	}
	return String(m.get(roster_key, ""))
