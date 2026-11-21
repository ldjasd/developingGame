class_name RigFactory
extends RefCounted
## 按 data/rig_params.json 建 FighterRig（主角 me + 已备侧面图的对手）。
## rig_params 由 tools/prep_opponents.py 生成：对手关节点/部件多边形是按人物
## 包围盒从主角模板仿射映射的近似值，逐人截图 QA 后在该 JSON 里修数。

static var _cache: Dictionary = {}

static func _params() -> Dictionary:
	if _cache.is_empty():
		var f := FileAccess.open("res://data/rig_params.json", FileAccess.READ)
		if f:
			_cache = JSON.parse_string(f.get_as_text())
	return _cache

static func has_rig(char_id: String) -> bool:
	return _params().has(char_id)

static func rig_ids() -> Array:
	return _params().keys()

static func build_rig(char_id: String) -> FighterRig:
	var p: Dictionary = _params()[char_id]
	var rig := FighterRig.new()
	rig.anim_rot_scale = float(p.get("rot_scale", 1.0))
	if p.get("parts") != null:
		rig.part_defs = _convert_parts(p["parts"])
	var tex: Texture2D = load(p["texture"])
	rig.build(tex, p["joints"])
	return rig

static func _convert_parts(parts: Array) -> Array:
	var out: Array = []
	for pd in parts:
		var poly: Array = []
		for pt in pd["poly"]:
			poly.append(Vector2(float(pt[0]), float(pt[1])))
		var bones: Array = []
		for b in pd["bones"]:
			bones.append([String(b[0]), float(b[1])])
		var entry: Array = [String(pd["name"]), int(pd["z"]), poly, bones]
		var excl: Array = []
		for e in pd.get("excl", []):
			if float(e[2]) > 0.0:
				excl.append(Rect2(float(e[0]), float(e[1]), float(e[2]), float(e[3])))
		if not excl.is_empty():
			entry.append(excl)
		out.append(entry)
	return out
