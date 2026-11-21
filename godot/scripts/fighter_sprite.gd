class_name FighterSprite
extends Node2D
## 整帧角色（2026-11-21 替换切件骨骼 FighterRig）。
## 为什么换：FighterRig 把「一张抱架整图」切成部件再旋转，手臂一伸，原来被手臂挡住的身体就是空洞，
## 旁边的头发会被一起拖走——这是做法本身的上限，调权重修不好。整帧方案每个姿势都是一张完整的画，
## 不存在撕裂；动作的力度靠程序叠加的整体位移/旋转/缩放（按参考作测得的帧数排时间轴）。
## 三种素材来源（自动选最好的）：
##   seq      ：对手帧序列 assets/fighters/<id>/（idle/attack/hit/down[/combo] + anim.json）
##   poses    ：主角 10 张整身姿势 assets/fighters/me/<pose>.webp
##   portrait ：其余对手的透明底立绘 assets/fighters/portraits/<key>.webp（单张 + 程序动作）
## 接口与 FighterRig 一致：play_anim / seek_anim / player（顿帧用 speed_scale）；另有 knockdown(stay)。
## 坐标：本节点原点 = 双脚中点；动作在素材原生朝向（朝右，前进 = +x）里写，flip 节点整体镜像。

const TARGET_H := 440.0
const SEQ_IDS := {
	"opp_world_champion": "evelyn", "opp_counter": "counter", "opp_champion_domestic": "champion_domestic",
	"opp_rookie": "rookie", "opp_shy": "shy", "opp_pocket": "pocket", "opp_braid": "braid", "opp_brick": "brick",
}

var mode := "portrait"
var player: AnimationPlayer
var flip: Node2D
var pivot: Node2D
var spr: Sprite2D
var meta: Dictionary = {}
var tex: Dictionary = {}
var cell := Vector2(700, 1004)
var feet := Vector2(350, 1000)

static func create_me() -> FighterSprite:
	var f := FighterSprite.new()
	f._setup_poses("res://assets/fighters/me")
	return f

## 对手：有帧序列用帧序列，否则透明底立绘，再不行用旧白底立绘
static func create_foe(roster_key: String) -> FighterSprite:
	var f := FighterSprite.new()
	var sid := String(SEQ_IDS.get(roster_key, ""))
	if sid != "" and FileAccess.file_exists("res://assets/fighters/%s/anim.json" % sid):
		f._setup_seq("res://assets/fighters/" + sid)
	else:
		var p := "res://assets/fighters/portraits/%s.webp" % roster_key
		if not ResourceLoader.exists(p):
			p = "res://assets/portraits/%s.webp" % roster_key
		f._setup_portrait(p)
	return f

## 朝向：+1 朝右（左侧选手），-1 朝左（右侧选手）
func set_facing(dir: int) -> void:
	var s := TARGET_H / (feet.y - _top_y())
	flip.scale = Vector2(s * float(dir), s)

func _top_y() -> float:
	return 14.0 if mode != "seq" else 8.0

func _base_nodes() -> void:
	flip = Node2D.new(); flip.name = "Flip"; add_child(flip)
	pivot = Node2D.new(); pivot.name = "Pivot"; flip.add_child(pivot)
	spr = Sprite2D.new(); spr.name = "Spr"; spr.centered = false; pivot.add_child(spr)
	player = AnimationPlayer.new(); add_child(player)

func _setup_seq(dir: String) -> void:
	mode = "seq"
	_base_nodes()
	meta = JSON.parse_string(FileAccess.get_file_as_string(dir + "/anim.json"))
	cell = Vector2(float(meta["cell"][0]), float(meta["cell"][1]))
	feet = Vector2(cell.x * 0.5, cell.y - 4.0)
	for st in meta["states"].keys():
		tex[st] = load(dir + "/" + String(meta["states"][st]["file"]))
	spr.position = -feet
	_build_anims()
	set_facing(1)

func _setup_poses(dir: String) -> void:
	mode = "poses"
	_base_nodes()
	for p in ["guard", "jab", "straight", "hook", "upper", "body", "block", "dodge", "hit", "victory"]:
		tex[p] = load("%s/%s.webp" % [dir, p])
	cell = Vector2(700, 1004)
	feet = Vector2(350, 988)
	spr.position = -feet
	_build_anims()
	set_facing(1)

func _setup_portrait(path: String) -> void:
	mode = "portrait"
	_base_nodes()
	tex["portrait"] = load(path)
	var t: Texture2D = tex["portrait"]
	cell = Vector2(t.get_width(), t.get_height())
	feet = Vector2(cell.x * 0.5, cell.y - 2.0)
	spr.position = -feet
	_build_anims()
	set_facing(1)

# ================= 动画构建 =================
# motion key: [t, Vector2 位移(素材像素，+x=向前), 旋转度(+ = 顺时针=前倾), Vector2 缩放]
# image key : [t, 状态/姿势名, 帧号]

class Spec:
	var length := 0.5
	var loop := false
	var img: Array = []
	var mot: Array = []

func _mk(len: float, loop: bool = false) -> Spec:
	var s := Spec.new(); s.length = len; s.loop = loop; return s

func _rows(st: String) -> int:
	return int(ceil(float(meta["states"][st]["frames"]) / float(meta["cols"])))

## 把某状态的帧区间 [f0, f1] 平铺到时间 [t0, t1]
func _seq_span(s: Spec, st: String, f0: int, f1: int, t0: float, t1: float) -> void:
	var n := absi(f1 - f0)
	for i in n + 1:
		var fr := f0 + (i if f1 >= f0 else -i)
		var t := t0 + (t1 - t0) * (float(i) / maxf(1.0, float(n)))
		s.img.append([t, st, fr])

func _idle_img(s: Spec, t: float) -> void:
	match mode:
		"seq": s.img.append([t, "idle", 0])
		"poses": s.img.append([t, "guard", 0])
		_: s.img.append([t, "portrait", 0])

## 出拳：前摇 → 到顶（换出拳帧）→ 停留 → 收招回抱架
## 参考作 60fps 实测（×1.25）：刺拳 到顶 0.06 / 全长 0.28；直拳 0.125/0.6；勾拳 0.27/0.85；上勾 0.23/0.88；击腹 0.35/1.06
const PUNCH := {
	"jab": {"peak": 0.06, "len": 0.28, "pose": "jab", "fwd": 18.0, "rot": 2.0, "y": 0.0, "sc": 1.0},
	"straight": {"peak": 0.125, "len": 0.6, "pose": "straight", "fwd": 34.0, "rot": 4.0, "y": 0.0, "sc": 1.02},
	"hook": {"peak": 0.27, "len": 0.85, "pose": "hook", "fwd": 26.0, "rot": 6.0, "y": 4.0, "sc": 1.02},
	# upper.webp 稿有缺陷（光脚 + 不透明底块），暂借 hook 姿势 + 明显上冲；muse 重绘后改回 "upper"
	"upper": {"peak": 0.23, "len": 0.88, "pose": "hook", "fwd": 14.0, "rot": -7.0, "y": -26.0, "sc": 1.05},
	"body": {"peak": 0.35, "len": 1.06, "pose": "body", "fwd": 30.0, "rot": 9.0, "y": 14.0, "sc": 1.0},
}

func _punch_spec(key: String) -> Spec:
	var p: Dictionary = PUNCH[key]
	var pk: float = p["peak"]
	var ln: float = p["len"]
	var hold := pk + 0.06 + ln * 0.08
	var back := hold + (ln - hold) * 0.45
	var s := _mk(ln)
	var wind := pk * 0.45
	# 动作：先微微后收蓄力，到顶瞬间整个人压上去，收招慢慢回位
	var k := 1.0 if mode != "seq" else 0.8
	s.mot = [
		[0.0, Vector2.ZERO, 0.0, Vector2.ONE],
		[wind, Vector2(-6.0 * k, float(p["y"]) * 0.3), -1.5, Vector2(0.99, 1.01)],
		[pk, Vector2(float(p["fwd"]) * k, float(p["y"])), float(p["rot"]), Vector2(float(p["sc"]), float(p["sc"]) * 0.99)],
		[hold, Vector2(float(p["fwd"]) * k * 0.92, float(p["y"]) * 0.9), float(p["rot"]) * 0.9, Vector2(float(p["sc"]), float(p["sc"]))],
		[ln, Vector2.ZERO, 0.0, Vector2.ONE],
	]
	match mode:
		"poses":
			s.img = [[0.0, "guard", 0], [wind * 0.6, String(p["pose"]), 0], [back, "guard", 0]]
		"seq":
			var st := "combo" if key == "hook" and meta["states"].has("combo") else "attack"
			var n := int(meta["states"][st]["frames"])
			var mid := n / 2
			_seq_span(s, st, 1, mid, 0.0, pk)
			_seq_span(s, st, mid, n - 1, hold, ln)
		_:
			_idle_img(s, 0.0)
	return s

func _react_spec(key: String) -> Spec:
	var s: Spec
	match key:
		"hit_light":
			s = _mk(0.13)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.03, Vector2(-10, 0), -3.0, Vector2(1.0, 0.99)], [0.13, Vector2.ZERO, 0.0, Vector2.ONE]]
		"hit_face":
			s = _mk(0.4)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.05, Vector2(-26, -2), -7.0, Vector2(0.98, 1.01)], [0.18, Vector2(-20, 0), -5.0, Vector2.ONE], [0.4, Vector2.ZERO, 0.0, Vector2.ONE]]
		"hit_body":
			s = _mk(0.42)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.05, Vector2(-14, 10), 10.0, Vector2(1.03, 0.95)], [0.2, Vector2(-12, 8), 8.0, Vector2(1.02, 0.96)], [0.42, Vector2.ZERO, 0.0, Vector2.ONE]]
		"hit_side":
			s = _mk(0.36)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.05, Vector2(-18, 2), -11.0, Vector2.ONE], [0.15, Vector2(-14, 2), -8.0, Vector2.ONE], [0.36, Vector2.ZERO, 0.0, Vector2.ONE]]
		_: # stagger
			s = _mk(1.05)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.06, Vector2(-40, -4), -10.0, Vector2(0.98, 1.02)], [0.3, Vector2(-62, 8), 6.0, Vector2(1.02, 0.97)],
				[0.55, Vector2(-54, 4), -4.0, Vector2.ONE], [0.8, Vector2(-30, 2), 3.0, Vector2.ONE], [1.05, Vector2.ZERO, 0.0, Vector2.ONE]]
	match mode:
		"poses":
			var pose := "guard" if key in ["hit_light", "hit_body"] else "hit"
			s.img = [[0.0, pose, 0], [s.length * 0.8, "guard", 0]]
		"seq":
			var n := int(meta["states"]["hit"]["frames"])
			var spans := {"hit_light": [4, 8], "hit_face": [4, 18], "hit_body": [4, 16], "hit_side": [4, 16], "stagger": [4, n - 1]}
			var sp: Array = spans[key]
			_seq_span(s, "hit", int(sp[0]), mini(int(sp[1]), n - 1), 0.0, s.length * 0.85)
			_idle_img(s, s.length)
		_:
			_idle_img(s, 0.0)
	return s

func _simple_spec(key: String) -> Spec:
	var s: Spec
	match key:
		"idle":
			s = _mk(2.4, true)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [1.2, Vector2(0, 4), 0.8, Vector2(1.0, 0.985)], [2.4, Vector2.ZERO, 0.0, Vector2.ONE]]
			if mode == "seq":
				var st: Dictionary = meta["states"]["idle"]
				var n := int(st["frames"])
				s.length = float(n) / float(st["fps"])
				s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [s.length, Vector2.ZERO, 0.0, Vector2.ONE]]
				_seq_span(s, "idle", 0, n - 1, 0.0, s.length - 1.0 / float(st["fps"]))
			else:
				_idle_img(s, 0.0)
		"block":
			s = _mk(0.8, true)
			s.mot = [[0.0, Vector2(-10, 4), -2.0, Vector2(0.98, 0.99)], [0.8, Vector2(-10, 4), -2.0, Vector2(0.98, 0.99)]]
			if mode == "poses": s.img = [[0.0, "block", 0]]
			else: _idle_img(s, 0.0)
		"dodge":
			s = _mk(0.45)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.12, Vector2(-26, 34), 8.0, Vector2(1.02, 0.94)], [0.45, Vector2.ZERO, 0.0, Vector2.ONE]]
			if mode == "poses": s.img = [[0.0, "dodge", 0], [0.36, "guard", 0]]
			else: _idle_img(s, 0.0)
		"victory":
			s = _mk(1.6, true)
			s.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.8, Vector2(0, -8), 0.0, Vector2(1.0, 1.01)], [1.6, Vector2.ZERO, 0.0, Vector2.ONE]]
			if mode == "poses": s.img = [[0.0, "victory", 0]]
			elif mode == "seq": _seq_span(s, "idle", 0, 0, 0.0, 0.0)
			else: _idle_img(s, 0.0)
		"down":
			s = _down_spec()
		"getup":
			s = _getup_spec()
	return s

## 倒地：有 down 帧序列就播（并照 web 倒地新规：后段按体长放大、贴地面线），否则整张向后倒
func _down_spec() -> Spec:
	if mode == "seq" and meta["states"].has("down"):
		var st: Dictionary = meta["states"]["down"]
		var n := int(st["frames"])
		var ln := float(n) / float(st["fps"]) * 0.75
		var s := _mk(ln)
		_seq_span(s, "down", 0, n - 1, 0.0, ln)
		var K := float(st.get("downK", 1.0))
		var o := Vector2(float(st.get("downOX", 50.0)) / 100.0 * cell.x, float(st.get("downOY", 100.0)) / 100.0 * cell.y) - feet
		var gy := (float(st.get("downGY", 99.8)) - float(st.get("downOY", 100.0))) / 100.0 * cell.y
		for i in 9:
			var p := float(i) / 8.0
			var t := clampf((p - 0.15) / 0.40, 0.0, 1.0)
			var e := t * t * (3.0 - 2.0 * t)
			var sc := 1.0 + (K - 1.0) * e
			s.mot.append([ln * p, o - o * sc + Vector2(0, gy * e), 0.0, Vector2(sc, sc)])
		return s
	# 没有倒地帧的角色：先被打得后仰半步，再向前扑倒（头朝擂台中央，不会倒出屏幕）
	var s2 := _mk(0.7)
	s2.mot = [[0.0, Vector2.ZERO, 0.0, Vector2.ONE], [0.18, Vector2(-34, -6), -12.0, Vector2.ONE], [0.34, Vector2(-10, 10), 22.0, Vector2(1.0, 0.97)],
		[0.56, Vector2(40, 0), 84.0, Vector2.ONE], [0.63, Vector2(36, -8), 78.0, Vector2.ONE], [0.7, Vector2(40, 0), 82.0, Vector2.ONE]]
	if mode == "poses": s2.img = [[0.0, "hit", 0]]
	else: _idle_img(s2, 0.0)
	return s2

func _getup_spec() -> Spec:
	if mode == "seq" and meta["states"].has("down"):
		var n := int(meta["states"]["down"]["frames"])
		var s := _mk(0.9)
		_seq_span(s, "down", n - 1, int(n * 0.35), 0.0, 0.7)
		_idle_img(s, 0.9)
		var d := _down_spec()
		var last: Array = d.mot[d.mot.size() - 1]
		s.mot = [[0.0, last[1], 0.0, last[3]], [0.5, Vector2(last[1]) * 0.4, 0.0, Vector2.ONE.lerp(last[3], 0.4)], [0.9, Vector2.ZERO, 0.0, Vector2.ONE]]
		return s
	var s2 := _mk(0.85)
	s2.mot = [[0.0, Vector2(40, 0), 82.0, Vector2.ONE], [0.4, Vector2(24, -4), 40.0, Vector2.ONE], [0.55, Vector2(20, 0), 48.0, Vector2.ONE], [0.85, Vector2.ZERO, 0.0, Vector2.ONE]]
	if mode == "poses": s2.img = [[0.0, "hit", 0], [0.6, "guard", 0]]
	else: _idle_img(s2, 0.0)
	return s2

func _build_anims() -> void:
	var lib := AnimationLibrary.new()
	var specs := {}
	for k in PUNCH.keys():
		specs[k] = _punch_spec(k)
	for k in ["hit_light", "hit_face", "hit_body", "hit_side", "stagger"]:
		specs[k] = _react_spec(k)
	specs["hit"] = specs["hit_face"]
	for k in ["idle", "block", "dodge", "victory", "down", "getup"]:
		specs[k] = _simple_spec(k)
	for k in specs.keys():
		lib.add_animation(k, _to_animation(specs[k]))
	player.add_animation_library("", lib)
	player.play("idle")

func _to_animation(s: Spec) -> Animation:
	var a := Animation.new()
	a.length = s.length
	a.loop_mode = Animation.LOOP_LINEAR if s.loop else Animation.LOOP_NONE
	# 轨道路径相对 AnimationPlayer 的 root_node（默认 ".." = 本节点）
	var tp := a.add_track(Animation.TYPE_VALUE); a.track_set_path(tp, NodePath("Flip/Pivot:position"))
	var tr := a.add_track(Animation.TYPE_VALUE); a.track_set_path(tr, NodePath("Flip/Pivot:rotation"))
	var ts := a.add_track(Animation.TYPE_VALUE); a.track_set_path(ts, NodePath("Flip/Pivot:scale"))
	for t in [tp, tr, ts]:
		a.track_set_interpolation_type(t, Animation.INTERPOLATION_CUBIC)
	for m in s.mot:
		a.track_insert_key(tp, float(m[0]), Vector2(m[1]))
		a.track_insert_key(tr, float(m[0]), deg_to_rad(float(m[2])))
		a.track_insert_key(ts, float(m[0]), Vector2(m[3]))
	if not s.img.is_empty():
		var spr_path := "Flip/Pivot/Spr"
		var tt := a.add_track(Animation.TYPE_VALUE); a.track_set_path(tt, NodePath(spr_path + ":texture"))
		var th := a.add_track(Animation.TYPE_VALUE); a.track_set_path(th, NodePath(spr_path + ":hframes"))
		var tv := a.add_track(Animation.TYPE_VALUE); a.track_set_path(tv, NodePath(spr_path + ":vframes"))
		var tf := a.add_track(Animation.TYPE_VALUE); a.track_set_path(tf, NodePath(spr_path + ":frame"))
		# 个别状态的素材原生朝左（anim.json face = -1）：该状态单独镜像，整体朝向仍由 Flip 决定
		var tfl := a.add_track(Animation.TYPE_VALUE); a.track_set_path(tfl, NodePath(spr_path + ":flip_h"))
		for t in [tt, th, tv, tf, tfl]:
			a.value_track_set_update_mode(t, Animation.UPDATE_DISCRETE)
		for im in s.img:
			var key := String(im[1])
			a.track_insert_key(tt, float(im[0]), tex[key])
			var hf := int(meta["cols"]) if mode == "seq" else 1
			var vf := _rows(key) if mode == "seq" else 1
			a.track_insert_key(th, float(im[0]), hf)
			a.track_insert_key(tv, float(im[0]), vf)
			a.track_insert_key(tf, float(im[0]), int(im[2]))
			var native_left := mode == "seq" and int(meta["states"].get(key, {}).get("face", 1)) < 0
			a.track_insert_key(tfl, float(im[0]), native_left)
	return a

# ================= 播放接口 =================
func play_anim(anim_name: String) -> void:
	if player and player.has_animation(anim_name):
		player.stop()
		player.play(anim_name)
		if not player.get_animation(anim_name).loop_mode and anim_name not in ["down"]:
			if not player.animation_finished.is_connected(_on_finished):
				player.animation_finished.connect(_on_finished)

func _on_finished(anim_name: StringName) -> void:
	if String(anim_name) in ["down", "victory"]:
		return
	player.play("idle")

func seek_anim(anim_name: String, t: float) -> void:
	if player and player.has_animation(anim_name):
		player.play(anim_name)
		player.seek(t, true)
		player.pause()

var _kd_tween: Tween
## 倒地（stay = KO 不起身）：踉跄 → 倒地 → 读秒 → 起身
func knockdown(stay: bool) -> void:
	if _kd_tween and _kd_tween.is_valid():
		_kd_tween.kill()
	_kd_tween = create_tween()
	_kd_tween.tween_interval(0.2)
	_kd_tween.tween_callback(func() -> void: play_anim("down"))
	if not stay:
		_kd_tween.tween_interval(player.get_animation("down").length + 0.8)
		_kd_tween.tween_callback(func() -> void: play_anim("getup"))
