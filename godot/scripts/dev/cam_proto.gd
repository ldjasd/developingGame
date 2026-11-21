extends Node3D
## 战斗镜头试点：同一段攻防，四个机位同时看。
## 运行（可操作）：godot --path godot res://scenes/dev/cam_proto.tscn
##   1~4 单独看某个镜头，G 回到四分屏；J 刺拳 K 直拳 U 摆拳 I 上勾 B 击腹；空格 格挡；Shift+A/D 左右闪，Shift+S 下潜
## 录演示：... -- --demo [--out=<目录>]（自动播固定脚本，存关键帧截图，播完退出；配合 --write-movie 录视频）

const Fighter := preload("res://scripts/dev/proto_fighter.gd")
const VrmFighter := preload("res://scripts/dev/vrm_fighter.gd")
const SpriteFighter := preload("res://scripts/dev/sprite_fighter.gd")
# 3D 试点模型（VRoid CC0 样例，见 assets/proto3d/README.md）
const VRM_ME := "res://assets/proto3d/AvatarSample_G.vrm"
const VRM_FOE := "res://assets/proto3d/AvatarSample_E.vrm"
const GAP := 0.56  # 两人各自离中心的距离（米）

const CAMS := [
	{"name": "① 侧视（现状）", "mask": 3},
	{"name": "② 背后视角", "mask": 5},
	{"name": "③ 过肩视角", "mask": 5},
	{"name": "④ 第三人称 斜后方", "mask": 3},
]

# 演示脚本：[时间, 谁, 动作, 参数]  谁：P 玩家 / O 对手 / X 结算
const DEMO := [
	[0.6, "P", "jab"], [0.67, "X", "hit", "O", "light"],
	[1.15, "O", "block"], [1.2, "P", "straight"], [1.31, "X", "blocked", "O"],
	[2.0, "O", "hook", 0.4], [2.33, "P", "duck"], [2.57, "X", "whiff", "O"],
	[2.8, "P", "upper"], [2.97, "X", "hit", "O", "big"],
	[4.3, "O", "straight", 0.4], [4.6, "P", "dodge_l"], [4.81, "X", "whiff", "O"],
	[5.0, "P", "hook"], [5.17, "X", "hit", "O", "normal"],
	[6.3, "O", "jab", 0.25], [6.35, "P", "block"], [6.62, "X", "blocked", "P"],
	[7.3, "O", "straight", 0.4], [7.81, "X", "hit", "P", "big"],
	[8.8, "P", "body"], [9.0, "X", "hit", "O", "body"],
	[9.3, "P", "straight"], [9.41, "X", "hit", "O", "normal"],
	[9.7, "P", "hook"], [9.87, "X", "hit", "O", "big"],
	[11.4, "X", "end"],
]
const SHOTS := {2.30: "1_opp_tell", 2.50: "2_duck", 2.97: "3_counter_hit", 4.75: "4_slip", 7.81: "5_player_hit", 9.87: "6_finish"}

var me: Node3D
var foe: Node3D
var cams: Array[Camera3D] = []
var views: Array[SubViewportContainer] = []
var labels: Array[Label] = []
var grid: GridContainer
var game_t := 0.0
var freeze := 0.0
var fov_kick := 0.0
var demo := false
var out_dir := ""
var use_3d := false
var use_2d := false
var only_view := -1
var _next := 0
var _shots_done := {}
var _sfx := {}
var _player: AudioStreamPlayer
var _ai_next := 1.5
var _pending: Array = []  # 手动模式：[到点时间, 攻方是玩家?, 拳种]


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a == "--demo":
			demo = true
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a == "--model=3d":
			use_3d = true
		elif a == "--model=2d":
			use_2d = true
		elif a.begins_with("--view="):
			only_view = int(a.substr(7)) - 1
	_build_ring()
	me = _make_fighter(true)
	foe = _make_fighter(false)
	_build_views()
	if only_view >= 0:
		_show_only(only_view)
	_player = AudioStreamPlayer.new()
	add_child(_player)
	_sfx = {
		"light": load("res://assets/audio/designed_person/light_0.wav"),
		"heavy": load("res://assets/audio/designed_person/heavy_0.wav"),
		"body": load("res://assets/audio/designed_person/body_0.wav"),
		"block": load("res://assets/audio/designed/block_0.wav"),
		"whoosh": load("res://assets/audio/air_cloth/jacket_00.wav"),
	}


func _make_fighter(is_me: bool) -> Node3D:
	var f: Node3D
	if use_2d and not is_me:
		f = SpriteFighter.new()
		f.set("texture_path", "res://assets/fighters/portraits/opp_rookie.webp")
	elif use_3d:
		f = VrmFighter.new()
		f.set("model_path", VRM_ME if is_me else VRM_FOE)
	else:
		f = Fighter.new()
	if is_me:
		f.body_color = Color(0.93, 0.45, 0.70)
		f.glove_color = Color(0.55, 0.30, 0.85)
		f.hair_color = Color(0.98, 0.60, 0.78)
		f.ghost_layer = 3
		f.position = Vector3(0, 0, GAP)
	else:
		f.body_color = Color(0.20, 0.62, 0.32)
		f.glove_color = Color(0.15, 0.55, 0.25)
		f.hair_color = Color(0.40, 0.25, 0.15)
		f.position = Vector3(0, 0, -GAP)
		f.rotation.y = PI
	add_child(f)
	f.call("build")
	return f


func _build_ring() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.06, 0.05, 0.12)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.55, 0.5, 0.7)
	e.ambient_light_energy = 0.6
	e.fog_enabled = true
	e.fog_light_color = Color(0.12, 0.08, 0.22)
	e.fog_density = 0.03
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-62, 25, 0)
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	add_child(sun)
	var spot := SpotLight3D.new()
	spot.position = Vector3(0, 5.5, 0)
	spot.rotation_degrees = Vector3(-90, 0, 0)
	spot.spot_range = 9.0
	spot.spot_angle = 38.0
	spot.light_energy = 0.9 if use_3d else 3.0  # MToon 卡通材质对强光很敏感，3D 模式降光
	if use_3d:
		sun.light_energy = 0.75
		e.ambient_light_energy = 0.35
	spot.light_color = Color(1.0, 0.92, 0.85)
	add_child(spot)
	_box(Vector3(6.2, 0.12, 6.2), Vector3(0, -0.06, 0), Color(0.42, 0.40, 0.55))
	_box(Vector3(6.6, 0.5, 6.6), Vector3(0, -0.37, 0), Color(0.25, 0.15, 0.40))
	_box(Vector3(30, 0.1, 30), Vector3(0, -0.7, 0), Color(0.08, 0.06, 0.14))
	var c := 2.9
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			var post := MeshInstance3D.new()
			var pm := CylinderMesh.new()
			pm.top_radius = 0.07
			pm.bottom_radius = 0.07
			pm.height = 1.5
			post.mesh = pm
			post.material_override = _m(Color(0.85, 0.85, 0.9))
			post.position = Vector3(sx * c, 0.75, sz * c)
			add_child(post)
	for h in [0.55, 0.95, 1.35]:
		for i in 4:
			var r := MeshInstance3D.new()
			var cm := CylinderMesh.new()
			cm.top_radius = 0.025
			cm.bottom_radius = 0.025
			cm.height = c * 2.0
			r.mesh = cm
			r.material_override = _m(Color(0.62, 0.35, 0.85))
			var along_x := i < 2
			var s := -1.0 if i % 2 == 0 else 1.0
			r.position = Vector3(0 if along_x else s * c, h, s * c if along_x else 0)
			r.rotation_degrees = Vector3(0, 0, 90) if along_x else Vector3(90, 0, 0)
			add_child(r)
	# 观众：远处一圈小方块
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in 220:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(5.0, 9.0)
		_box(Vector3(0.35, rng.randf_range(0.7, 1.1), 0.3), Vector3(cos(ang) * rad, -0.2 + rad * 0.12, sin(ang) * rad),
			Color.from_hsv(rng.randf(), 0.35, rng.randf_range(0.25, 0.5)))


func _m(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	return m


func _box(size: Vector3, pos: Vector3, c: Color) -> void:
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	mi.mesh = b
	mi.material_override = _m(c)
	mi.position = pos
	add_child(mi)


func _build_views() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	grid = GridContainer.new()
	grid.columns = 2
	grid.set_anchors_preset(Control.PRESET_FULL_RECT)
	grid.add_theme_constant_override("h_separation", 4)
	grid.add_theme_constant_override("v_separation", 4)
	layer.add_child(grid)
	for i in CAMS.size():
		var cont := SubViewportContainer.new()
		cont.stretch = true
		cont.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cont.size_flags_vertical = Control.SIZE_EXPAND_FILL
		grid.add_child(cont)
		var sv := SubViewport.new()
		sv.world_3d = get_world_3d()
		sv.msaa_3d = Viewport.MSAA_4X
		cont.add_child(sv)
		var cam := Camera3D.new()
		cam.cull_mask = int(CAMS[i]["mask"])
		sv.add_child(cam)
		cam.current = true
		cams.append(cam)
		views.append(cont)
		var lb := Label.new()
		lb.text = String(CAMS[i]["name"])
		lb.add_theme_font_size_override("font_size", 22)
		lb.add_theme_color_override("font_outline_color", Color.BLACK)
		lb.add_theme_constant_override("outline_size", 6)
		lb.position = Vector2(12, 8)
		cont.add_child(lb)
		labels.append(lb)


func _show_only(idx: int) -> void:
	for i in views.size():
		views[i].visible = idx < 0 or i == idx
	grid.columns = 2 if idx < 0 else 1


func _place_cams(delta: float) -> void:
	fov_kick = move_toward(fov_kick, 0.0, delta * 30.0)
	var mid := Vector3(0, 1.35, 0)
	var me_p := me.position
	var foe_head := foe.position + Vector3(0, 1.55, 0)
	# ① 侧视
	cams[0].position = Vector3(2.55, 1.25, 0)
	cams[0].look_at(Vector3(0, 1.1, 0))
	cams[0].fov = 46.0
	# ② 背后：主角背后偏上、居中
	# 镜头要比主角头顶高出足够多，主角的头才会落在对手脸的下方
	cams[1].position = me_p + Vector3(0, 2.7, 1.75)
	cams[1].look_at(foe.position + Vector3(0, 0.95, 0))
	cams[1].fov = 40.0 - fov_kick
	# ③ 过肩：右肩后方，贴近
	cams[2].position = me_p + Vector3(0.52, 1.66, 0.85)
	cams[2].look_at(foe_head + Vector3(-0.12, -0.15, 0))
	cams[2].fov = 60.0 - fov_kick * 1.2
	# ④ 第三人称斜后方：约 35° 斜角，缓慢绕动
	var a := deg_to_rad(38.0 + 7.0 * sin(game_t * 0.45))
	cams[3].position = mid + Vector3(sin(a) * 3.1, 0.75, cos(a) * 3.1)
	cams[3].look_at(mid + Vector3(0, -0.15, 0))
	cams[3].fov = 45.0 - fov_kick


func _process(delta: float) -> void:
	if freeze > 0.0:
		freeze -= delta
		_place_cams(delta)
		return
	game_t += delta
	if demo:
		_run_demo()
	else:
		_run_ai(delta)
	me.call("update_pose", delta)
	foe.call("update_pose", delta)
	_place_cams(delta)


func _run_demo() -> void:
	while _next < DEMO.size() and game_t >= float(DEMO[_next][0]):
		var ev: Array = DEMO[_next]
		_next += 1
		var who: String = ev[1]
		var what: String = ev[2]
		if who == "X":
			_resolve(ev)
			continue
		var f := me if who == "P" else foe
		if Fighter.PUNCH.has(what):
			f.call("punch", what, float(ev[3]) if ev.size() > 3 else 0.0)
		else:
			f.call("act", what, 0.5)
	for t: float in SHOTS:
		if game_t >= t and not _shots_done.has(t):
			_shots_done[t] = true
			_snap(String(SHOTS[t]))


func _resolve(ev: Array) -> void:
	var what: String = ev[2]
	if what == "end":
		get_tree().quit()
		return
	var target := me if String(ev[3]) == "P" else foe
	var attacker := foe if target == me else me
	var kind: String = attacker.get("action")
	var pos: Vector3 = attacker.call("glove_of", kind)
	match what:
		"hit":
			var tier: String = ev[4]
			if tier == "body":
				target.call("act", "hit_body", 0.45)
			elif tier == "big":
				target.call("act", "hit_big", 0.75)
			else:
				target.call("act", "hit", 0.35)
			_spark(pos, 1.6 if tier == "big" else 1.0, Color(1.0, 0.9, 0.4))
			_play("heavy" if tier == "big" else ("body" if tier == "body" else "light"))
			freeze = 0.10 if tier == "big" else 0.05
			if tier == "big":
				fov_kick = 6.0
		"blocked":
			_spark(pos, 0.6, Color(0.5, 0.75, 1.0))
			_play("block")
			freeze = 0.03
		"whiff":
			_play("whoosh")


func _spark(pos: Vector3, scale_k: float, c: Color) -> void:
	var mi := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = 0.07
	s.height = 0.14
	mi.mesh = s
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = c
	mi.material_override = m
	mi.position = pos
	add_child(mi)
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(mi, "scale", Vector3.ONE * 3.0 * scale_k, 0.18)
	tw.tween_property(m, "albedo_color:a", 0.0, 0.2)
	tw.chain().tween_callback(mi.queue_free)


func _play(key: String) -> void:
	var p := AudioStreamPlayer.new()
	p.stream = _sfx[key]
	p.volume_db = -4.0
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)


func _snap(name: String) -> void:
	if out_dir == "":
		return
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(out_dir)
	img.save_png(out_dir.path_join(name + ".png"))


# ---------- 手动模式 ----------

func _run_ai(_delta: float) -> void:
	for i in range(_pending.size() - 1, -1, -1):
		var pd: Array = _pending[i]
		if game_t >= float(pd[0]):
			_pending.remove_at(i)
			_judge(bool(pd[1]), String(pd[2]))
	if game_t >= _ai_next and foe.get("action") == "":
		var kinds := ["jab", "straight", "hook", "upper", "body"]
		var k: String = kinds[randi() % kinds.size()]
		var tele := 0.4
		foe.call("punch", k, tele)
		_pending.append([game_t + float(foe.call("peak_time", k, tele)), false, k])
		_ai_next = game_t + randf_range(1.3, 2.4)


func _judge(by_me: bool, kind: String) -> void:
	var target := foe if by_me else me
	var t_act: String = target.get("action")
	var ev := ["", "", "", "O" if by_me else "P", "normal"]
	if t_act in ["dodge_l", "dodge_r"] and kind != "body":
		ev[2] = "whiff"
	elif t_act == "duck" and kind in ["hook", "straight", "jab"]:
		ev[2] = "whiff"
	elif t_act == "block" and kind != "body":
		ev[2] = "blocked"
	else:
		ev[2] = "hit"
		ev[4] = "big" if kind in ["hook", "upper"] else ("body" if kind == "body" else "normal")
	_resolve(ev)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var k := (event as InputEventKey).keycode
	var shift := (event as InputEventKey).shift_pressed
	match k:
		KEY_1, KEY_2, KEY_3, KEY_4:
			_show_only(int(k - KEY_1))
		KEY_G:
			_show_only(-1)
	if demo or me.get("action") != "":
		return
	if shift and k in [KEY_A, KEY_D, KEY_S]:
		me.call("act", {KEY_A: "dodge_l", KEY_D: "dodge_r", KEY_S: "duck"}[k], 0.5)
		return
	var keymap := {KEY_J: "jab", KEY_K: "straight", KEY_U: "hook", KEY_I: "upper", KEY_B: "body"}
	if keymap.has(k):
		var kind: String = keymap[k]
		me.call("punch", kind, 0.0)
		if randf() < 0.25 and foe.get("action") == "":
			foe.call("act", "block", 0.5)
		_pending.append([game_t + float(me.call("peak_time", kind, 0.0)), true, kind])
	elif k == KEY_SPACE:
		me.call("act", "block", 0.5)
