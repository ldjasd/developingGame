extends "res://scripts/dev/proto_fighter.gd"
## 2D 基线：用现有的单张正面立绘（透明底）当对手，动作只能靠整张图的位移 / 倾斜 / 缩放。
## 这就是「不补画姿势」时 2D 路线能做到的程度；补画 12 张正面姿势后可以换成逐帧切图。

var texture_path := ""
var _spr: Sprite3D
var _height := 1.5


func build() -> void:
	_spr = Sprite3D.new()
	_spr.texture = load(texture_path)
	_spr.pixel_size = _height / float(_spr.texture.get_height())
	_spr.centered = true
	_spr.offset = Vector2(0, _spr.texture.get_height() * 0.5)  # 脚底对齐 y=0
	_spr.shaded = false
	_spr.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	add_child(_spr)
	# 立绘画的是正面，人物面朝镜头（+Z），这里父节点已转 180°，所以 sprite 再转回来
	_spr.rotation.y = PI
	update_pose(0.0)


func _apply(off: Vector3, pitch: float, yaw: float, roll: float, gl: Vector3, gr: Vector3, glow: float) -> bool:
	# 出拳：整张图往前冲、放大一点；受击：后仰倾斜；闪避：横移
	var reach := 0.0
	if PUNCH.has(action) and _t >= 0.0:
		var p: Array = PUNCH[action]
		reach = _env(_t, float(p[0]), float(p[1]), float(p[2]))
	_spr.position = Vector3(off.x, off.y * 0.6, off.z - reach * 0.18)
	_spr.rotation = Vector3(pitch * 0.35, PI + yaw * 0.25, -roll * 0.8 + (gl.x + gr.x) * 0.0)
	var s := 1.0 + reach * 0.06
	_spr.scale = Vector3(s, s, s)
	_spr.modulate = Color(1, 1, 1).lerp(Color(1.0, 0.95, 0.55), glow * 0.6)
	var hand := Vector3(0.0, 1.15, -0.35 - reach * 0.3)
	glove_world_l = to_global(hand + Vector3(-0.12, 0, 0))
	glove_world_r = to_global(hand + Vector3(0.12, 0, 0))
	return true
