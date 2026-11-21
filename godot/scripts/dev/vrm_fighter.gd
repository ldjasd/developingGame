extends "res://scripts/dev/proto_fighter.gd"
## 3D 渲染试点：用 VRM 模型代替几何体人偶。动作逻辑（预兆 / 出拳 / 闪避 / 受击）完全沿用父类，
## 这里只把算好的姿势用两段 IK 写进人形骨骼。

const GHOST_SHADER := preload("res://addons/mtoon/mtoon_trans_zwrite.gdshader")

var model_path := ""
var _skels: Array[Skeleton3D] = []
var _b := {}       # 骨骼名 -> 索引
var _scale := 1.0  # 模型相对几何体人偶的尺寸
var _len := {}     # 段长
var _rest_feet := {}
var _gloves: Array[MeshInstance3D] = []
var _sk_to_me := Transform3D.IDENTITY

const BONES := ["Hips", "Spine", "Chest", "UpperChest", "Neck", "Head",
	"LeftUpperArm", "LeftLowerArm", "LeftHand", "RightUpperArm", "RightLowerArm", "RightHand",
	"LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot"]


func build() -> void:
	var ps: PackedScene = load(model_path)
	var copies := 2 if ghost_layer > 0 else 1
	for c in copies:
		var inst: Node3D = ps.instantiate()
		add_child(inst)
		var layer_bits := 1
		if ghost_layer > 0:
			layer_bits = 2 if c == 0 else (1 << (ghost_layer - 1))
		_set_layers(inst, layer_bits, c == 1)
		var sk := _find_skeleton(inst)
		_skels.append(sk)
	var sk0 := _skels[0]
	for n: String in BONES:
		_b[n] = sk0.find_bone(n)
	var hip := _rest_g(sk0, "Hips")
	var sh := _rest_g(sk0, "LeftUpperArm")
	_scale = (sh.y - hip.y) / 0.52
	_len["arm1"] = _rest_g(sk0, "LeftUpperArm").distance_to(_rest_g(sk0, "LeftLowerArm"))
	_len["arm2"] = _rest_g(sk0, "LeftLowerArm").distance_to(_rest_g(sk0, "LeftHand")) + 0.04
	_len["leg1"] = _rest_g(sk0, "LeftUpperLeg").distance_to(_rest_g(sk0, "LeftLowerLeg"))
	_len["leg2"] = _rest_g(sk0, "LeftLowerLeg").distance_to(_rest_g(sk0, "LeftFoot"))
	_rest_feet["l"] = _rest_g(sk0, "LeftFoot")
	_rest_feet["r"] = _rest_g(sk0, "RightFoot")
	for s in ["l", "r"]:
		var gm := _mat(glove_color, 1.0)
		_glove_mats.append(gm)
		var g := MeshInstance3D.new()
		g.mesh = _sphere(0.088)
		g.material_override = gm
		g.layers = 1 | 2 | 4
		add_child(g)
		_gloves.append(g)
	update_pose(0.0)


func _rest_g(sk: Skeleton3D, n: String) -> Vector3:
	return sk.get_bone_global_rest(sk.find_bone(n)).origin


func _set_layers(n: Node, bits: int, ghost: bool) -> void:
	if n is VisualInstance3D:
		(n as VisualInstance3D).layers = bits
	if ghost and n is MeshInstance3D:
		# 兼容渲染器不支持 GeometryInstance3D.transparency：把 MToon 材质换成半透明变体
		var mi := n as MeshInstance3D
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		if mi.mesh:
			for si in mi.mesh.get_surface_count():
				var src := mi.get_active_material(si)
				if src is ShaderMaterial:
					var m := (src as ShaderMaterial).duplicate() as ShaderMaterial
					m.shader = GHOST_SHADER
					m.next_pass = null
					var c: Variant = m.get_shader_parameter("_Color")
					var col: Color = c if c is Color else Color.WHITE
					m.set_shader_parameter("_Color", Color(col.r, col.g, col.b, col.a * 0.3))
					mi.set_surface_override_material(si, m)
	for c in n.get_children():
		_set_layers(c, bits, ghost)


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _find_skeleton(c)
		if s:
			return s
	return null


func _rot(sk: Skeleton3D, n: String, e: Vector3) -> void:
	var i: int = _b[n]
	if i < 0:
		return
	sk.set_bone_pose_rotation(i, Quaternion.from_euler(e) * sk.get_bone_rest(i).basis.get_rotation_quaternion())


func _aim(sk: Skeleton3D, bone: String, child: String, target: Vector3) -> void:
	var bi: int = _b[bone]
	var ci: int = _b[child]
	var gp := sk.get_bone_global_pose(bi)
	var cp := sk.get_bone_global_pose(ci)
	var cur := (cp.origin - gp.origin).normalized()
	var want := (target - gp.origin).normalized()
	if cur.dot(want) > 0.99999:
		return
	var new_basis := Basis(Quaternion(cur, want)) * gp.basis
	var parent := sk.get_bone_parent(bi)
	var pb := sk.get_bone_global_pose(parent).basis if parent >= 0 else Basis.IDENTITY
	sk.set_bone_pose_rotation(bi, (pb.inverse() * new_basis).get_rotation_quaternion())
	sk.force_update_all_bone_transforms()


func _apply(off: Vector3, pitch: float, yaw: float, roll: float, gl: Vector3, gr: Vector3, glow: float) -> bool:
	for gi in 2:
		var hand_glow := glow if PUNCH.has(action) and HAND[action] == ("l" if gi == 0 else "r") else 0.0
		_glove_mats[gi].emission_enabled = hand_glow > 0.01
		_glove_mats[gi].emission = Color(1.0, 0.9, 0.4) * hand_glow * 1.6
	for si in _skels.size():
		var sk := _skels[si]
		sk.reset_bone_poses()
		var hi: int = _b["Hips"]
		sk.set_bone_pose_position(hi, sk.get_bone_rest(hi).origin + off)
		var e := Vector3(pitch, yaw, roll) / 3.0
		for n in ["Spine", "Chest", "UpperChest"]:
			_rot(sk, n, e)
		_rot(sk, "Neck", Vector3(pitch * 0.4, 0, 0))
		sk.force_update_all_bone_transforms()
		_sk_to_me = global_transform.affine_inverse() * sk.global_transform
		var hip := sk.get_bone_global_pose(hi).origin
		var bas := Basis.from_euler(Vector3(pitch, yaw, roll))
		var sides := {"l": [-1.0, gl, "Left"], "r": [1.0, gr, "Right"]}
		for s: String in sides:
			var sx: float = sides[s][0]
			var g: Vector3 = sides[s][1]
			var pre: String = sides[s][2]
			# 拳套目标：父类给的是几何体人偶胯部坐标，按身高比例换算到模型
			var tgt := hip + bas * (Vector3(g.x, g.y, g.z) * _scale)
			var sh := sk.get_bone_global_pose(_b[pre + "UpperArm"]).origin
			var el := _ik(sh, tgt, _len["arm1"], _len["arm2"], bas * Vector3(0.6 * sx, -1.0, 0.3))
			_aim(sk, pre + "UpperArm", pre + "LowerArm", el)
			_aim(sk, pre + "LowerArm", pre + "Hand", tgt)
			# 腿：脚踩地不动，胯部下沉时膝盖自然弯
			var hp := sk.get_bone_global_pose(_b[pre + "UpperLeg"]).origin
			var rest_foot: Vector3 = _rest_feet[s]
			var foot := rest_foot + Vector3(0.03 * sx, 0.0, -0.15 if s == "l" else 0.17)
			var kn := _ik(hp, foot, _len["leg1"], _len["leg2"], Vector3(0.1 * sx, 0.0, -1.0))
			_aim(sk, pre + "UpperLeg", pre + "LowerLeg", kn)
			_aim(sk, pre + "LowerLeg", pre + "Foot", foot)
			if si == 0:
				var hand := sk.get_bone_global_pose(_b[pre + "Hand"]).origin
				var fore := sk.get_bone_global_pose(_b[pre + "LowerArm"]).origin
				var gpos := _sk_to_me * (hand + (hand - fore).normalized() * 0.05)
				_gloves[0 if s == "l" else 1].position = gpos
				if s == "l":
					glove_world_l = to_global(gpos)
				else:
					glove_world_r = to_global(gpos)
	return true
