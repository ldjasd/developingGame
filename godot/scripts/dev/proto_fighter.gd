extends Node3D
## 镜头试点用的几何体人偶（胶囊 + 两段 IK）。只用来比较镜头，不是正式美术。
## 本地坐标：脚底在 y=0，面朝 -Z，右手 +X。

const UPPER := 0.29
const FORE := 0.29
const THIGH := 0.47
const SHIN := 0.47
const HIP_Y := 0.92

# 每种拳：[前摇, 停留, 收招]（秒）——节拍取 design/battle.md §3.2
const PUNCH := {
	"jab": [0.07, 0.08, 0.15], "straight": [0.11, 0.10, 0.30], "hook": [0.17, 0.10, 0.40],
	"upper": [0.17, 0.10, 0.40], "body": [0.20, 0.10, 0.35],
}
const HAND := {"jab": "l", "straight": "r", "hook": "l", "upper": "r", "body": "r"}
# 拳到顶时拳套的位置（相对胯部，躯干坐标系）
const PEAK := {
	"jab": Vector3(-0.04, 0.64, -0.80), "straight": Vector3(0.0, 0.64, -0.82),
	"hook": Vector3(0.06, 0.62, -0.62), "upper": Vector3(0.02, 0.72, -0.58),
	"body": Vector3(0.02, 0.36, -0.72),
}
const GUARD_L := Vector3(-0.10, 0.62, -0.30)
const GUARD_R := Vector3(0.11, 0.60, -0.22)
const BLOCK_L := Vector3(-0.07, 0.74, -0.24)
const BLOCK_R := Vector3(0.07, 0.74, -0.24)

var skin := Color(1.0, 0.86, 0.78)
var body_color := Color.WHITE
var glove_color := Color.RED
var hair_color := Color.BLACK
var ghost_layer := 0  # >0 时额外生成半透明副本放在该渲染层（给背后 / 过肩镜头用）

var _meshes := {}  # 名字 -> Array[MeshInstance3D]
var _glove_mats: Array[StandardMaterial3D] = []
var action := ""
var guard_hold := 0
var _t := 0.0
var _dur := 0.0
var _tele := 0.0
var _idle := 0.0
var glove_world_l := Vector3.ZERO
var glove_world_r := Vector3.ZERO


func build() -> void:
	var opaque := _mat(body_color, 1.0)
	var ghost := _mat(body_color, 0.42)
	var skin_m := _mat(skin, 1.0)
	var skin_g := _mat(skin, 0.42)
	var hair_m := _mat(hair_color, 1.0)
	var hair_g := _mat(hair_color, 0.42)
	var eye_m := _mat(Color(0.1, 0.1, 0.15), 1.0)
	_add("torso", _capsule(0.16, 0.62), opaque, ghost)
	_add("skirt", _cone(0.13, 0.25, 0.22), opaque, ghost)
	_add("head", _sphere(0.115), skin_m, skin_g)
	_add("hair", _sphere(0.125), hair_m, hair_g)
	_add("tail", _capsule(0.05, 0.36), hair_m, hair_g)
	_add("eye_l", _sphere(0.017), eye_m, eye_m)
	_add("eye_r", _sphere(0.017), eye_m, eye_m)
	for s in ["l", "r"]:
		_add("ua_" + s, _capsule(0.05, UPPER + 0.1), skin_m, skin_g)
		_add("fa_" + s, _capsule(0.045, FORE + 0.09), skin_m, skin_g)
		var gm := _mat(glove_color, 1.0)
		_glove_mats.append(gm)
		_add("glove_" + s, _sphere(0.085), gm, gm)  # 背后 / 过肩镜头里身体半透明，但拳套保持不透明，看得清自己的拳
		_add("th_" + s, _capsule(0.07, THIGH + 0.14), skin_m, skin_g)
		_add("sh_" + s, _capsule(0.055, SHIN + 0.11), skin_m, skin_g)
		_add("shoe_" + s, _capsule(0.05, 0.2), _mat(body_color.darkened(0.4), 1.0), ghost)
	update_pose(0.0)


func _mat(c: Color, alpha: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(c.r, c.g, c.b, alpha)
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	m.specular_mode = BaseMaterial3D.SPECULAR_TOON
	m.roughness = 0.8
	if alpha < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
	return m


func _capsule(r: float, h: float) -> Mesh:
	var m := CapsuleMesh.new()
	m.radius = r
	m.height = h
	return m


func _sphere(r: float) -> Mesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	return m


func _cone(top: float, bottom: float, h: float) -> Mesh:
	var m := CylinderMesh.new()
	m.top_radius = top
	m.bottom_radius = bottom
	m.height = h
	return m


func _add(key: String, mesh: Mesh, mat: Material, ghost_mat: Material) -> void:
	var list: Array[MeshInstance3D] = []
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	if ghost_layer > 0:
		mi.layers = 2  # 不透明版本：渲染层 2
	add_child(mi)
	list.append(mi)
	if ghost_layer > 0:
		var g := MeshInstance3D.new()
		g.mesh = mesh
		g.material_override = ghost_mat
		g.layers = 1 << (ghost_layer - 1)
		g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(g)
		list.append(g)
	_meshes[key] = list


func _put(key: String, xf: Transform3D) -> void:
	for mi: MeshInstance3D in _meshes[key]:
		mi.transform = xf


func _seg(key: String, a: Vector3, b: Vector3) -> void:
	var y := (b - a).normalized()
	var ref := Vector3.FORWARD if absf(y.dot(Vector3.FORWARD)) < 0.9 else Vector3.RIGHT
	var x := y.cross(ref).normalized()
	var z := x.cross(y).normalized()
	_put(key, Transform3D(Basis(x, y, z), (a + b) * 0.5))


func _ik(root: Vector3, target: Vector3, l1: float, l2: float, hint: Vector3) -> Vector3:
	var d := root.distance_to(target)
	d = clampf(d, 0.05, l1 + l2 - 0.002)
	var dir := (target - root).normalized()
	var a := (l1 * l1 - l2 * l2 + d * d) / (2.0 * d)
	var h := sqrt(maxf(l1 * l1 - a * a, 0.0))
	var bend := (hint - dir * hint.dot(dir)).normalized()
	return root + dir * a + bend * h


# ---------- 动作 ----------

func punch(kind: String, tele: float = 0.0) -> void:
	action = kind
	_tele = tele
	_t = -tele
	var p: Array = PUNCH[kind]
	_dur = float(p[0]) + float(p[1]) + float(p[2])


func peak_time(kind: String, tele: float = 0.0) -> float:
	return tele + float(PUNCH[kind][0])


func act(kind: String, dur: float) -> void:
	action = kind
	_t = 0.0
	_tele = 0.0
	_dur = dur


func glove_of(kind: String) -> Vector3:
	return glove_world_l if HAND.get(kind, "r") == "l" else glove_world_r


func _env(t: float, a: float, hold: float, r: float) -> float:
	if t < 0.0:
		return 0.0
	if t < a:
		return ease(t / a, 0.4)
	if t < a + hold:
		return 1.0
	if t < a + hold + r:
		return 1.0 - ease((t - a - hold) / r, 2.0)
	return 0.0


func _bump(t: float, dur: float) -> float:
	# 0→1→0 的平滑包络（闪避 / 受击 / 格挡）
	if t < 0.0 or t > dur:
		return 0.0
	var u := t / dur
	return clampf(minf(u / 0.25, (1.0 - u) / 0.45), 0.0, 1.0)


func update_pose(delta: float) -> void:
	_idle += delta
	if action != "":
		_t += delta
		if _t > _dur:
			action = ""
	var off := Vector3(0.0, sin(_idle * 5.0) * 0.012, 0.0)
	var pitch := 0.0
	var yaw := sin(_idle * 2.3) * 0.03
	var roll := 0.0
	var gl := GUARD_L
	var gr := GUARD_R
	var glow := 0.0

	if PUNCH.has(action):
		var p: Array = PUNCH[action]
		if _t < 0.0:
			# 预兆：出拳的手往后拉、肩膀后转、拳套发光
			var w := 1.0 - (-_t / maxf(_tele, 0.001))
			glow = w
			if HAND[action] == "l":
				gl += Vector3(-0.04, -0.04, 0.16) * w
				yaw += 0.18 * w
			else:
				gr += Vector3(0.04, -0.04, 0.16) * w
				yaw -= 0.22 * w
			if action == "body" or action == "upper":
				off.y -= 0.08 * w
		var k := _env(_t, float(p[0]), float(p[1]), float(p[2]))
		var peak: Vector3 = PEAK[action]
		match action:
			"jab":
				gl = gl.lerp(peak, k)
				yaw -= 0.12 * k
			"straight":
				gr = gr.lerp(peak, k)
				yaw += 0.42 * k
				off.z -= 0.06 * k
			"hook":
				var mid := Vector3(-0.42, 0.66, -0.42)
				gl = _bez(gl, mid, peak, k)
				yaw -= 0.55 * k
				off.z -= 0.04 * k
			"upper":
				var low := Vector3(0.12, 0.30, -0.32)
				gr = _bez(gr, low, peak, k)
				yaw += 0.30 * k
				off.y += 0.04 * k
				pitch += 0.12 * k
			"body":
				gr = gr.lerp(peak, k)
				yaw += 0.35 * k
				off.y -= 0.18 * k
				pitch -= 0.30 * k
				off.z -= 0.08 * k
	else:
		var b := _bump(_t, _dur) if action != "" else 0.0
		match action:
			"dodge_l":
				off.x -= 0.26 * b
				roll += 0.30 * b
				off.y -= 0.05 * b
			"dodge_r":
				off.x += 0.26 * b
				roll -= 0.30 * b
				off.y -= 0.05 * b
			"duck":
				off.y -= 0.26 * b
				pitch -= 0.35 * b
				off.z -= 0.05 * b
			"block":
				gl = gl.lerp(BLOCK_L, b)
				gr = gr.lerp(BLOCK_R, b)
				off.y -= 0.04 * b
				pitch -= 0.10 * b
			"hit":
				pitch += 0.30 * b
				off.z += 0.08 * b
				yaw += 0.12 * b
			"hit_body":
				pitch -= 0.38 * b
				off.z += 0.05 * b
				off.y -= 0.06 * b
			"hit_big":
				pitch += 0.55 * b
				off.z += 0.22 * b
				roll += 0.18 * b
				gl = gl.lerp(Vector3(-0.22, 0.40, -0.10), b)
				gr = gr.lerp(Vector3(0.22, 0.38, -0.08), b)
			"ko_fall":
				# KO：先被打得头猛地后仰、整个人往后弹（0.18 秒），再仰面倒下（0.55 秒落地）
				var s1 := clampf(_t / 0.18, 0.0, 1.0)
				var s2 := ease(clampf((_t - 0.22) / 0.55, 0.0, 1.0), 2.2)
				pitch += 0.65 * s1 + 0.95 * s2
				off.z += 0.32 * s1 + 0.30 * s2
				off.y -= 0.10 * s1 + 0.66 * s2
				roll += 0.18 * s2
				yaw += 0.25 * s1
				gl = gl.lerp(Vector3(-0.42, 0.30, 0.10), maxf(s1 * 0.6, s2))
				gr = gr.lerp(Vector3(0.40, 0.45, 0.05), maxf(s1 * 0.6, s2))
			"knock":
				# 普通击倒：被打得往后一仰（0.15 秒），然后膝盖一软跪下去（快）
				var k1 := clampf(_t / 0.15, 0.0, 1.0) * (1.0 - clampf((_t - 0.15) / 0.2, 0.0, 1.0))
				var k2 := clampf((_t - 0.12) / 0.25, 0.0, 1.0) * (1.0 - clampf((_t - (_dur - 0.6)) / 0.6, 0.0, 1.0))
				pitch += 0.45 * k1 - 0.55 * k2
				off.z += 0.18 * k1 + 0.10 * k2
				off.y -= 0.42 * k2
				roll += 0.10 * k2
				gl = gl.lerp(Vector3(-0.20, 0.10, -0.32), k2)
				gr = gr.lerp(Vector3(0.20, 0.05, -0.30), k2)
			"down":
				# 单膝跪地：0.4 秒崩下去，最后 0.6 秒站起来
				var k := clampf(_t / 0.4, 0.0, 1.0) * (1.0 - clampf((_t - (_dur - 0.6)) / 0.6, 0.0, 1.0))
				off.y -= 0.42 * k
				off.z += 0.10 * k
				pitch -= 0.55 * k
				roll += 0.10 * k
				gl = gl.lerp(Vector3(-0.20, 0.10, -0.32), k)
				gr = gr.lerp(Vector3(0.20, 0.05, -0.30), k)
	# 按住格挡（呈现层每帧同步规则内核的状态）：1 = 高格挡，2 = 低格挡
	if guard_hold > 0 and not PUNCH.has(action) and not action in ["down", "knock", "ko_fall"]:
		var low := guard_hold == 2
		gl = BLOCK_L + (Vector3(0.02, -0.30, -0.06) if low else Vector3.ZERO)
		gr = BLOCK_R + (Vector3(-0.02, -0.30, -0.06) if low else Vector3.ZERO)
		pitch -= 0.12
		off.y -= 0.05

	if _apply(off, pitch, yaw, roll, gl, gr, glow):
		return
	for i in _glove_mats.size():
		var hand_glow := glow if PUNCH.has(action) and HAND[action] == ("l" if i == 0 else "r") else 0.0
		_glove_mats[i].emission_enabled = hand_glow > 0.01
		_glove_mats[i].emission = Color(1.0, 0.9, 0.4) * hand_glow * 1.6

	var hip := Vector3(0.0, HIP_Y, 0.0) + off
	var bas := Basis.from_euler(Vector3(pitch, yaw, roll))
	var chest := hip + bas * Vector3(0.0, 0.30, 0.0)
	_put("torso", Transform3D(bas, chest))
	_put("skirt", Transform3D(Basis.from_euler(Vector3(pitch * 0.3, yaw * 0.5, roll * 0.5)), hip + Vector3(0.0, -0.02, 0.0)))
	var head := hip + bas * Vector3(0.0, 0.72, 0.0)
	var hb := bas * Basis.from_euler(Vector3(pitch * 0.4, 0.0, 0.0))
	_put("head", Transform3D(hb, head))
	_put("hair", Transform3D(hb, head + hb * Vector3(0.0, 0.025, 0.02)))
	var tail_a := head + hb * Vector3(0.0, 0.08, 0.10)
	_seg("tail", tail_a, tail_a + hb * Vector3(0.0, -0.28, 0.12))
	_put("eye_l", Transform3D(hb, head + hb * Vector3(-0.04, 0.01, -0.105)))
	_put("eye_r", Transform3D(hb, head + hb * Vector3(0.04, 0.01, -0.105)))

	var sides := {"l": [-1.0, gl], "r": [1.0, gr]}
	for s: String in sides:
		var sx: float = sides[s][0]
		var g: Vector3 = sides[s][1]
		var sh := hip + bas * Vector3(0.19 * sx, 0.52, 0.0)
		var gw := hip + bas * g
		var el := _ik(sh, gw, UPPER, FORE, bas * Vector3(0.6 * sx, -1.0, 0.3))
		_seg("ua_" + s, sh, el)
		_seg("fa_" + s, el, gw)
		_put("glove_" + s, Transform3D(Basis.IDENTITY, gw))
		if s == "l":
			glove_world_l = to_global(gw)
		else:
			glove_world_r = to_global(gw)
		# 腿：正架，左脚在前
		var hp := hip + Vector3(0.10 * sx, -0.02, 0.0)
		var foot := Vector3(0.14 * sx, 0.06, -0.16 if s == "l" else 0.18)
		var kn := _ik(hp, foot, THIGH, SHIN, Vector3(0.1 * sx, 0.0, -1.0))
		_seg("th_" + s, hp, kn)
		_seg("sh_" + s, kn, foot)
		_seg("shoe_" + s, foot + Vector3(0, -0.02, 0.06), foot + Vector3(0, -0.02, -0.10))


## 子类（3D 模型版）覆盖：用算好的姿势驱动骨骼；返回 true 表示已处理，不再摆几何体
func _apply(_off: Vector3, _pitch: float, _yaw: float, _roll: float, _gl: Vector3, _gr: Vector3, _glow: float) -> bool:
	return false


func _bez(a: Vector3, m: Vector3, b: Vector3, k: float) -> Vector3:
	return a.lerp(m, k).lerp(m.lerp(b, k), k)
