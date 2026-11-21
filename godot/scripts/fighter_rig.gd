class_name FighterRig
extends Node2D
## 2D 骨骼角色（Godot 线，2026-11-17 v2 部件网格版）。
## 做法：整张侧面图按语义切成部件（头/躯干/每段肢体），每部件一张 Polygon2D 网格，
## 共享同一副 Skeleton2D+Bone2D 骨骼；权重只在部件自己的骨链内按距离平滑混合。
## 为什么切部件：抱架姿势下拳套贴脸、双臂交叠，单张整图按距离算权重必然交叉污染
## （脸的像素混进前臂权重、出拳时脸被拖糊）；部件隔离后各动各的，绑定姿势下
## 各部件采样同一源图同一 UV，拼合与原图逐像素一致；部件区域刻意重叠+边缘羽化，
## 关节弯曲时是「弯」不是「断」，不会分离/撕裂。
## 权重纪律：任何顶点不许全零权重（渲染器会把全零顶点塌缩到原点形成扇形撕裂），
## 超出覆盖半径的顶点兜底归最近骨骼，权重和恒为 1。
## 动画全部由引擎内骨骼关键帧生成（ANIM_DEFS），不使用任何抠帧素材。
## 朝向：按源图原生朝向建 rig，舞台侧用 scale.x = -1 翻转。

const BONE_DEFS := [
	# [骨名, 父骨, 起点关节, 终点关节, 影响半径]
	["Root", "", "root", "spine", 125.0],
	["Spine", "Root", "spine", "head", 130.0],
	["Head", "Spine", "head", "head_top", 125.0],
	["UpperArmFar", "Spine", "shF", "elF", 92.0],
	["ForeArmFar", "UpperArmFar", "elF", "wrF", 95.0],
	["UpperArmNear", "Spine", "shN", "elN", 95.0],
	["ForeArmNear", "UpperArmNear", "elN", "wrN", 98.0],
	["ThighFar", "Root", "hipF", "kneeF", 112.0],
	["ShinFar", "ThighFar", "kneeF", "ankF", 102.0],
	["ThighNear", "Root", "hipN", "kneeN", 115.0],
	["ShinNear", "ThighNear", "kneeN", "ankN", 105.0],
]

# 部件定义（按主角抱架图 700×1004 的解剖布局；区域刻意放大重叠，边缘 9px 羽化）：
# [部件名, z, 区域多边形(图像坐标), [[骨名, 半径], ...], (可选) 排除矩形列表]
# 排除矩形：该部件区域捎带到的「别人的像素」（如前臂区里的下巴）——挖掉后由
# 下层部件（头部）的同一像素兜底，绑定姿势合成不变，运动时不再被错误部件带走。
const PART_DEFS := [
	["legFarShin", 0, [Vector2(345, 675), Vector2(565, 695), Vector2(595, 835), Vector2(565, 905), Vector2(375, 885), Vector2(335, 770)], [["ShinFar", 115.0], ["ThighFar", 90.0]]],
	["legFarThigh", 1, [Vector2(315, 535), Vector2(465, 545), Vector2(475, 685), Vector2(425, 765), Vector2(325, 725), Vector2(305, 620)], [["ThighFar", 120.0], ["Root", 95.0]]],
	["armFarUpper", 2, [Vector2(235, 275), Vector2(370, 275), Vector2(382, 390), Vector2(330, 475), Vector2(228, 465), Vector2(195, 370)], [["UpperArmFar", 105.0], ["Spine", 75.0]]],
	["armFarFore", 3, [Vector2(130, 250), Vector2(300, 245), Vector2(312, 350), Vector2(292, 445), Vector2(168, 455), Vector2(125, 355)], [["ForeArmFar", 110.0], ["UpperArmFar", 85.0]], [Rect2(240, 240, 80, 42)]],
	["legNearThigh", 4, [Vector2(255, 515), Vector2(425, 525), Vector2(435, 645), Vector2(345, 725), Vector2(225, 695), Vector2(215, 590)], [["ThighNear", 125.0], ["Root", 95.0]]],
	["legNearShin", 5, [Vector2(135, 635), Vector2(335, 645), Vector2(345, 805), Vector2(315, 935), Vector2(145, 935), Vector2(125, 780)], [["ShinNear", 120.0], ["ThighNear", 90.0]]],
	["torso", 6, [Vector2(325, 285), Vector2(475, 285), Vector2(495, 430), Vector2(505, 570), Vector2(490, 665), Vector2(315, 665), Vector2(290, 545), Vector2(300, 400)], [["Spine", 150.0], ["Root", 140.0]]],
	["head", 7, [Vector2(232, 118), Vector2(298, 18), Vector2(450, 0), Vector2(585, 25), Vector2(645, 110), Vector2(640, 235), Vector2(575, 320), Vector2(480, 355), Vector2(395, 342), Vector2(298, 322), Vector2(222, 232)], [["Head", 175.0], ["Spine", 85.0]]],
	["armNearUpper", 8, [Vector2(338, 285), Vector2(462, 295), Vector2(472, 430), Vector2(430, 505), Vector2(338, 485), Vector2(315, 385)], [["UpperArmNear", 105.0], ["Spine", 75.0]], [Rect2(330, 280, 70, 54)]],
	["armNearFore", 9, [Vector2(195, 245), Vector2(382, 255), Vector2(402, 368), Vector2(382, 485), Vector2(248, 495), Vector2(195, 380)], [["ForeArmNear", 115.0], ["UpperArmNear", 85.0]], [Rect2(232, 242, 102, 60), Rect2(313, 246, 94, 46), Rect2(366, 292, 44, 44)]],
]

const FEATHER := 9.0
const GRID_STEP := 20

var joints: Dictionary = {} # name -> Vector2（纹理像素坐标）
var bones: Dictionary = {} # bone name -> Bone2D
var player: AnimationPlayer
var _root_bind_pos: Vector2

static func make_joints(d: Dictionary) -> Dictionary:
	var j: Dictionary = {}
	for k in d.keys():
		var v = d[k]
		j[k] = Vector2(float(v[0]), float(v[1]))
	# 派生关节点：头顶方向（头骨线段终点）；外部已给出时（如对手映射表）用外部值
	if not j.has("head_top"):
		j["head_top"] = j["head"] + Vector2(28, -100)
	return j

var part_defs: Array = PART_DEFS # 可由外部注入（对手按包围盒映射后的部件定义）
var anim_rot_scale := 1.0 # 对手骨架比例不同，旋转量按此缩放（RigFactory 注入）

func build(texture: Texture2D, joints_dict: Dictionary) -> void:
	joints = make_joints(joints_dict)
	var skel := Skeleton2D.new()
	skel.name = "Skeleton2D"
	add_child(skel)
	# ---- 骨骼链 ----
	for def in BONE_DEFS:
		var b := Bone2D.new()
		b.name = def[0]
		b.set_autocalculate_length_and_angle(false)
		bones[def[0]] = b
	for def in BONE_DEFS:
		var b: Bone2D = bones[def[0]]
		var start: Vector2 = joints[def[2]]
		if def[1] == "":
			b.position = start
			skel.add_child(b)
		else:
			var parent: Bone2D = bones[def[1]]
			parent.add_child(b)
			var parent_start: Vector2 = Vector2.ZERO
			for pdef in BONE_DEFS:
				if pdef[0] == def[1]:
					parent_start = joints[pdef[2]]
			b.position = start - parent_start
	for def in BONE_DEFS:
		var b: Bone2D = bones[def[0]]
		b.rest = b.transform
	_root_bind_pos = bones["Root"].position
	# ---- 部件网格 ----
	var src_img := texture.get_image()
	for pdef in part_defs:
		var poly := Polygon2D.new()
		poly.name = "Part_" + String(pdef[0])
		poly.z_index = int(pdef[1])
		poly.skeleton = NodePath("../Skeleton2D")
		_build_part(poly, src_img, pdef)
		add_child(poly)
	# ---- 动画 ----
	player = AnimationPlayer.new()
	player.name = "AnimationPlayer"
	add_child(player)
	var lib := AnimationLibrary.new()
	for anim_name in ANIM_DEFS.keys():
		lib.add_animation(anim_name, _make_animation(ANIM_DEFS[anim_name]))
	player.add_animation_library("", lib)

func _seg_ext_end(bone_name: String) -> Vector2:
	# 线段终点：拳套/鞋在线段方向外推，吃住手套与鞋的体积
	for def in BONE_DEFS:
		if def[0] == bone_name:
			var a: Vector2 = joints[def[2]]
			var b: Vector2 = joints[def[3]]
			if bone_name.begins_with("ForeArm"):
				return b + (b - a) * 0.55
			if bone_name.begins_with("Shin"):
				return b + (b - a) * 0.38
			return b
	return Vector2.ZERO

func _bone_segment(bone_name: String) -> Array:
	for def in BONE_DEFS:
		if def[0] == bone_name:
			return [joints[def[2]], _seg_ext_end(bone_name)]
	return [Vector2.ZERO, Vector2.ZERO]

func _build_part(poly: Polygon2D, src_img: Image, pdef: Array) -> void:
	var region: Array = pdef[2]
	var part_bones: Array = pdef[3]
	var w := src_img.get_width()
	var h := src_img.get_height()
	# 部件包围盒
	var bb := Rect2(Vector2(1e9, 1e9), Vector2.ZERO)
	for p in region:
		bb = bb.expand(p)
	var x0 := maxi(0, int(bb.position.x))
	var y0 := maxi(0, int(bb.position.y))
	var x1 := mini(w, int(bb.position.x + bb.size.x))
	var y1 := mini(h, int(bb.position.y + bb.size.y))
	# 部件纹理：源图 alpha × 区域羽化掩码
	var excludes: Array = pdef[4] if pdef.size() > 4 else []
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in range(y0, y1):
		for x in range(x0, x1):
			var c := src_img.get_pixel(x, y)
			if c.a <= 0.001:
				continue
			var excluded := false
			for r in excludes:
				if (r as Rect2).has_point(Vector2(x, y)):
					excluded = true
					break
			if excluded:
				continue
			var f := _region_factor(Vector2(x, y), region)
			if f <= 0.001:
				continue
			c.a *= f
			img.set_pixel(x, y, c)
	poly.texture = ImageTexture.create_from_image(img)
	# 网格：包围盒内格点，保留自身或邻格有可见 alpha 的点
	var verts := PackedVector2Array()
	var uvs := PackedVector2Array()
	var grid := {}
	var step := GRID_STEP
	var gy := y0 - (y0 % step)
	while gy <= y1:
		var gx := x0 - (x0 % step)
		while gx <= x1:
			# 保留条件：部件纹理附近有像素；或（源图附近有像素且落在区域内/边缘一格内）。
			# 后者让网格几何覆盖到多边形边缘，避免相邻部件交界因羽化+顶点剔除出现楔形孔。
			var keep := _near_part_alpha(img, gx, gy, step)
			if not keep and _near_region(Vector2(gx, gy), region, step):
				keep = _near_part_alpha(src_img, gx, gy, step)
			if keep:
				grid[Vector2i(gx, gy)] = verts.size()
				verts.append(Vector2(gx, gy))
				uvs.append(Vector2(gx, gy))
			gx += step
		gy += step
	var tris: Array = []
	gy = y0 - (y0 % step)
	while gy <= y1:
		var gx := x0 - (x0 % step)
		while gx <= x1:
			var a = grid.get(Vector2i(gx, gy), -1)
			var b = grid.get(Vector2i(gx + step, gy), -1)
			var c = grid.get(Vector2i(gx, gy + step), -1)
			var dd = grid.get(Vector2i(gx + step, gy + step), -1)
			if a >= 0 and b >= 0 and c >= 0 and dd >= 0:
				tris.append(PackedInt32Array([a, b, c]))
				tris.append(PackedInt32Array([b, dd, c]))
			gx += step
		gy += step
	poly.polygon = verts
	poly.uv = uvs
	poly.polygons = tris
	# 权重：仅部件骨链内计算；全零兜底归最近骨骼
	var segs: Array = []
	for pb in part_bones:
		segs.append(_bone_segment(pb[0]))
	var bone_arr: Array = []
	for bi in part_bones.size():
		var weights := PackedFloat32Array()
		weights.resize(verts.size())
		bone_arr.append(NodePath(_bone_path(part_bones[bi][0])))
		bone_arr.append(weights)
	for i in verts.size():
		var raw: Array = []
		var total := 0.0
		var nearest := 0
		var nearest_d := 1e18
		for bi in part_bones.size():
			var d := _dist_to_segment(verts[i], segs[bi][0], segs[bi][1])
			if d < nearest_d:
				nearest_d = d
				nearest = bi
			var t: float = clampf(1.0 - d / float(part_bones[bi][1]), 0.0, 1.0)
			raw.append(t * t)
			total += t * t
		for bi in part_bones.size():
			if total > 0.0001:
				bone_arr[bi * 2 + 1][i] = raw[bi] / total
			else:
				bone_arr[bi * 2 + 1][i] = 1.0 if bi == nearest else 0.0
	poly.bones = bone_arr

func _near_region(p: Vector2, region: Array, margin: float) -> bool:
	if _point_in_polygon(p, region):
		return true
	for i in region.size():
		var a: Vector2 = region[i]
		var b: Vector2 = region[(i + 1) % region.size()]
		if _dist_to_segment(p, a, b) < margin:
			return true
	return false

func _region_factor(p: Vector2, region: Array) -> float:
	# 多边形内=按到边距离羽化；外=0
	if not _point_in_polygon(p, region):
		return 0.0
	var d := 1e18
	for i in region.size():
		var a: Vector2 = region[i]
		var b: Vector2 = region[(i + 1) % region.size()]
		d = minf(d, _dist_to_segment(p, a, b))
	return clampf(d / FEATHER, 0.0, 1.0)

static func _point_in_polygon(p: Vector2, region: Array) -> bool:
	var inside := false
	var n := region.size()
	for i in n:
		var a: Vector2 = region[i]
		var b: Vector2 = region[(i + 1) % n]
		if (a.y > p.y) != (b.y > p.y):
			var x_int := a.x + (p.y - a.y) * (b.x - a.x) / (b.y - a.y)
			if p.x < x_int:
				inside = not inside
	return inside

func _near_part_alpha(img: Image, x: int, y: int, r: int) -> bool:
	for dy in range(-r, r + 1, 5):
		for dx in range(-r, r + 1, 5):
			var px := clampi(x + dx, 0, img.get_width() - 1)
			var py := clampi(y + dy, 0, img.get_height() - 1)
			if img.get_pixel(px, py).a > 0.02:
				return true
	return false

func _bone_path(bname: String) -> String:
	# 返回骨骼在 Skeleton2D 下的层级路径
	match bname:
		"Root":
			return "Root"
		"Spine", "ThighNear", "ThighFar":
			return "Root/" + bname
		"Head", "UpperArmNear", "UpperArmFar":
			return "Root/Spine/" + bname
		"ForeArmNear":
			return "Root/Spine/UpperArmNear/ForeArmNear"
		"ForeArmFar":
			return "Root/Spine/UpperArmFar/ForeArmFar"
		"ShinNear":
			return "Root/ThighNear/ShinNear"
		"ShinFar":
			return "Root/ThighFar/ShinFar"
	return bname

static func _dist_to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var t: float = 0.0
	if ab.length_squared() > 0.001:
		t = clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
	return p.distance_to(a + ab * t)

# ================= 动画定义 =================
# 每条动画： { len, loop, keys: [ [time, {bone: rot_deg, ..., "@root": Vector2 offset}] ] }
# 旋转为相对 rest 的局部旋转偏移（度，图像坐标系：正值顺时针）。
const ANIM_DEFS := {
	"idle": {
		"len": 2.4, "loop": true,
		"keys": [
			[0.0, {}],
			[1.2, {"@root": Vector2(0, 5), "Spine": 1.6, "Head": -1.2, "UpperArmNear": 2.5, "ForeArmNear": 2.0, "UpperArmFar": 2.0, "ForeArmFar": 1.5, "ThighNear": 1.0, "ThighFar": -1.0}],
			[2.4, {}],
		],
	},
	# ---- 出拳（2026-11-21 按参考作实测帧数重排时间轴）----
	# 参考（60fps）：刺拳 3 帧到顶/全长 13；直拳 6/29；勾拳 13/41；上勾 11/42；击腹 16~18/51。
	# 规律：轻拳几乎无前摇，轻重差距主要在收招；这里整体 ×1.25 放慢以便 2D 看清。
	# 重拳整体位移（@root/Spine）约为刺拳的 2~3 倍——重量感来自身体压上去。
	"jab": {
		"len": 0.28, "loop": false,
		"keys": [
			[0.0, {}],
			[0.025, {"@root": Vector2(2, 1), "UpperArmFar": -6.0, "ForeArmFar": 6.0}],
			[0.06, {"@root": Vector2(-11, 0), "UpperArmFar": 40.0, "ForeArmFar": -94.0, "Spine": 6.0, "Head": -4.0, "UpperArmNear": -10.0, "ForeArmNear": -12.0}],
			[0.11, {"@root": Vector2(-10, 0), "UpperArmFar": 39.0, "ForeArmFar": -93.0, "Spine": 5.5, "Head": -3.5}],
			[0.28, {}],
		],
	},
	"straight": {
		"len": 0.6, "loop": false,
		"keys": [
			[0.0, {}],
			[0.05, {"@root": Vector2(5, 1), "UpperArmNear": -10.0, "ForeArmNear": 10.0, "Spine": -3.0, "Head": 2.0}],
			[0.125, {"@root": Vector2(-20, 0), "UpperArmNear": 60.0, "ForeArmNear": -120.0, "Spine": 11.0, "Head": -6.0, "UpperArmFar": -14.0, "ForeArmFar": -18.0, "ThighNear": 5.0, "ThighFar": -5.0}],
			[0.2, {"@root": Vector2(-19, 0), "UpperArmNear": 59.0, "ForeArmNear": -119.0, "Spine": 10.5, "Head": -5.5}],
			[0.6, {}],
		],
	},
	"hook": {
		"len": 0.85, "loop": false,
		"keys": [
			[0.0, {}],
			[0.13, {"@root": Vector2(8, 2), "UpperArmNear": -18.0, "ForeArmNear": 14.0, "Spine": -8.0}],
			[0.27, {"@root": Vector2(-22, 2), "UpperArmNear": 38.0, "ForeArmNear": -52.0, "Spine": 17.0, "Head": -8.0, "ThighNear": 5.0, "ThighFar": -5.0}],
			[0.36, {"@root": Vector2(-21, 2), "UpperArmNear": 37.0, "ForeArmNear": -51.0, "Spine": 16.0, "Head": -7.0}],
			[0.85, {}],
		],
	},
	"upper": {
		"len": 0.88, "loop": false,
		"keys": [
			[0.0, {}],
			[0.11, {"@root": Vector2(4, 18), "UpperArmNear": -6.0, "ForeArmNear": 6.0, "Spine": 9.0, "Head": 5.0, "ThighNear": 6.0, "ShinNear": -6.0}],
			[0.23, {"@root": Vector2(-16, -12), "UpperArmNear": 22.0, "ForeArmNear": -78.0, "Spine": -6.0, "Head": -10.0}],
			[0.32, {"@root": Vector2(-15, -11), "UpperArmNear": 21.0, "ForeArmNear": -77.0, "Spine": -5.5, "Head": -9.0}],
			[0.88, {}],
		],
	},
	"body": {
		"len": 1.06, "loop": false,
		"keys": [
			[0.0, {}],
			[0.16, {"@root": Vector2(5, 12), "Spine": 10.0, "UpperArmNear": -8.0, "ForeArmNear": 8.0, "ThighNear": 5.0}],
			[0.35, {"@root": Vector2(-20, 26), "UpperArmNear": 78.0, "ForeArmNear": -98.0, "Spine": 20.0, "Head": 7.0, "ThighNear": 8.0, "ShinNear": -8.0}],
			[0.44, {"@root": Vector2(-19, 25), "UpperArmNear": 77.0, "ForeArmNear": -97.0, "Spine": 19.0, "Head": 6.5}],
			[1.06, {}],
		],
	},
	# ---- 受击（参考作分 5 档时长：6 / 9~14 / 19~25 帧短硬直，60 帧踉跄；方向区分打脸 / 打腹 / 侧面）----
	"hit_light": {
		"len": 0.13, "loop": false,
		"keys": [
			[0.0, {}],
			[0.03, {"@root": Vector2(6, 0), "Spine": -4.0, "Head": -8.0}],
			[0.13, {}],
		],
	},
	"hit_face": {
		"len": 0.4, "loop": false,
		"keys": [
			[0.0, {}],
			[0.05, {"@root": Vector2(14, 1), "Spine": -12.0, "Head": -20.0, "UpperArmNear": -12.0, "ForeArmNear": 16.0, "UpperArmFar": -10.0, "ForeArmFar": 14.0, "ThighNear": -4.0, "ThighFar": 4.0}],
			[0.16, {"@root": Vector2(12, 1), "Spine": -9.0, "Head": -14.0, "UpperArmNear": -8.0, "ForeArmNear": 10.0}],
			[0.4, {}],
		],
	},
	"hit_body": {
		"len": 0.42, "loop": false,
		"keys": [
			[0.0, {}],
			[0.05, {"@root": Vector2(8, 10), "Spine": 16.0, "Head": 12.0, "UpperArmNear": 14.0, "ForeArmNear": 20.0, "UpperArmFar": 12.0, "ForeArmFar": 18.0, "ThighNear": 6.0, "ShinNear": -6.0}],
			[0.2, {"@root": Vector2(7, 9), "Spine": 13.0, "Head": 9.0, "UpperArmNear": 10.0, "ForeArmNear": 14.0}],
			[0.42, {}],
		],
	},
	"hit_side": {
		"len": 0.36, "loop": false,
		"keys": [
			[0.0, {}],
			[0.05, {"@root": Vector2(10, 3), "Spine": -6.0, "Head": -28.0, "UpperArmNear": -8.0, "UpperArmFar": -14.0, "ForeArmFar": 18.0}],
			[0.15, {"@root": Vector2(9, 3), "Spine": -4.0, "Head": -20.0}],
			[0.36, {}],
		],
	},
	"stagger": {
		"len": 1.05, "loop": false,
		"keys": [
			[0.0, {}],
			[0.06, {"@root": Vector2(22, 2), "Spine": -16.0, "Head": -24.0, "UpperArmNear": -20.0, "ForeArmNear": 24.0, "UpperArmFar": -18.0, "ForeArmFar": 22.0, "ThighNear": -8.0, "ThighFar": 8.0}],
			[0.3, {"@root": Vector2(34, 10), "Spine": 10.0, "Head": 8.0, "UpperArmNear": 10.0, "ForeArmNear": 16.0, "UpperArmFar": 8.0, "ForeArmFar": 14.0, "ThighNear": 6.0, "ThighFar": -10.0, "ShinFar": 8.0}],
			[0.55, {"@root": Vector2(30, 6), "Spine": 4.0, "Head": -4.0, "ThighNear": -4.0, "ThighFar": 5.0}],
			[0.8, {"@root": Vector2(18, 3), "Spine": 6.0, "Head": 3.0}],
			[1.05, {}],
		],
	},
	"block": {
		"len": 0.8, "loop": true,
		"keys": [
			[0.0, {"UpperArmNear": -6.0, "ForeArmNear": -14.0, "UpperArmFar": -4.0, "ForeArmFar": -12.0, "Head": 3.0, "@root": Vector2(2, 3)}],
			[0.8, {"UpperArmNear": -6.0, "ForeArmNear": -14.0, "UpperArmFar": -4.0, "ForeArmFar": -12.0, "Head": 3.0, "@root": Vector2(2, 3)}],
		],
	},
	"hit": {
		"len": 0.38, "loop": false,
		"keys": [
			[0.0, {}],
			[0.09, {"@root": Vector2(13, 2), "Spine": -11.0, "Head": -15.0, "UpperArmNear": -12.0, "ForeArmNear": 16.0, "UpperArmFar": -10.0, "ForeArmFar": 14.0, "ThighNear": -4.0, "ThighFar": 4.0}],
			[0.38, {}],
		],
	},
	"dodge": {
		"len": 0.45, "loop": false,
		"keys": [
			[0.0, {}],
			[0.14, {"@root": Vector2(6, 27), "Spine": 15.0, "Head": 9.0, "UpperArmNear": 6.0, "ForeArmNear": -8.0, "ThighNear": 7.0, "ThighFar": -6.0, "ShinNear": -6.0}],
			[0.45, {}],
		],
	},
	"victory": {
		"len": 1.6, "loop": true,
		"keys": [
			[0.0, {"UpperArmNear": -148.0, "ForeArmNear": -24.0, "Head": -5.0, "@root": Vector2(0, 0)}],
			[0.8, {"UpperArmNear": -146.0, "ForeArmNear": -22.0, "Head": -5.0, "@root": Vector2(0, -6)}],
			[1.6, {"UpperArmNear": -148.0, "ForeArmNear": -24.0, "Head": -5.0, "@root": Vector2(0, 0)}],
		],
	},
}

func _make_animation(def: Dictionary) -> Animation:
	var anim := Animation.new()
	anim.length = float(def["len"])
	anim.loop_mode = Animation.LOOP_LINEAR if def.get("loop", false) else Animation.LOOP_NONE
	var keys: Array = def["keys"]
	# 收集所有出现过的轨道
	var rot_tracks: Dictionary = {} # bone -> track idx
	var root_pos_track := -1
	for key in keys:
		var pose: Dictionary = key[1]
		for bone_name in pose.keys():
			if bone_name == "@root":
				if root_pos_track < 0:
					root_pos_track = anim.add_track(Animation.TYPE_VALUE)
					anim.track_set_path(root_pos_track, NodePath("Skeleton2D/" + _bone_path("Root") + ":position"))
					anim.track_set_interpolation_type(root_pos_track, Animation.INTERPOLATION_CUBIC)
			elif not rot_tracks.has(bone_name):
				var ti := anim.add_track(Animation.TYPE_VALUE)
				anim.track_set_path(ti, NodePath("Skeleton2D/" + _bone_path(bone_name) + ":rotation"))
				anim.track_set_interpolation_type(ti, Animation.INTERPOLATION_CUBIC)
				rot_tracks[bone_name] = ti
	# 填关键帧：每个轨道在每个 key 时刻都有值（缺省 0 / root 基准位）
	for key in keys:
		var t: float = float(key[0])
		var pose: Dictionary = key[1]
		for bone_name in rot_tracks.keys():
			var v: float = deg_to_rad(float(pose.get(bone_name, 0.0))) * anim_rot_scale
			anim.track_insert_key(rot_tracks[bone_name], t, v)
		if root_pos_track >= 0:
			var off: Vector2 = pose.get("@root", Vector2.ZERO)
			anim.track_insert_key(root_pos_track, t, _root_bind_pos + off)
	return anim

func play_anim(anim_name: String) -> void:
	if player and player.has_animation(anim_name):
		player.play(anim_name)

func seek_anim(anim_name: String, t: float) -> void:
	if player and player.has_animation(anim_name):
		player.play(anim_name)
		player.seek(t, true)
		player.pause()
