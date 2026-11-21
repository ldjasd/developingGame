extends Node3D
## 实时战斗可玩原型：BattleCore（规则）+ 3D VRM 角色（呈现）+ 键盘操作，背后视角。
## 运行：godot --path godot res://scenes/dev/rt_proto.tscn
## 操作：J 左手 / K 右手；按住 W = 上勾，按住 S = 击腹，按住 A 或 D = 摆拳，什么都不按 = J 刺拳 / K 直拳
##       空格 按住格挡（+S 低格挡，防击腹）；Shift + A / D 左右闪，Shift + S 下潜
##       C 切换镜头（背后 / 斜后方）；Enter 结束后再来一局；Esc 退出
## 录像：... -- --bot [--round=20] [--out=<目录>] [--max=90]（主角也交给 AI 打；配 --write-movie 录视频）

const VrmFighter := preload("res://scripts/dev/vrm_fighter.gd")
const Ring := preload("res://scripts/dev/proto_ring.gd")
const VRM_ME := "res://assets/proto3d/AvatarSample_G.vrm"
const VRM_FOE := "res://assets/proto3d/AvatarSample_E.vrm"
const GAP := 0.56

var core: BattleCore
var me_v: Node3D
var foe_v: Node3D
var cam: Camera3D
var cam_mode := 0
var freeze := 0.0
var fov_kick := 0.0
var pause_left := 0.0
var bot := false
var out_dir := ""
var max_t := 9999.0
var round_override := -1.0
var seed_v := -1
var me_attr := 30.0
var foe_attr := 30.0
var real_t := 0.0
var _shot_i := 0
var _next_shot := 2.0
var _end_t := -1.0
var _sfx := {}

# HUD
var hud: CanvasLayer
var bars := {}
var round_lb: Label
var banner: Label
var count_lb: Label
var info_lb: Label
var flash_rect: ColorRect
var _count_n := 0
var _count_t := 0.0
var _count_on := false
var _banner_t := 0.0
var _info_t := 0.0
var _pending_result := ""
var _pending_wait := 0.0

# KO 演出
const KO_COUNT_STEP := 0.55   # KO 后读秒加快（规则早已判定，读秒只是演出）
const KO_COUNT_DELAY := 1.0
var _count_step := 1.0
var _ko_popped := false
var _last_hit_pos := Vector3(0, 1.3, -GAP)
var white_rect: ColorRect
var _ko_cam_w := 0.0
var _ko_cam_on := false
var _ko_victim: Node3D
var _ko_orbit := 0.0
var _shake_t := 0.0
var _aside := 0.0
var _tap_key := -1
var _tap_t := -9.0
# 镜头：0 自动（贴身 = 背后，拉开 / 绕圈 = 斜后方）、1 背后锁定、2 第三人称斜后方、3 转播机位
const CAM_NAMES := ["自动", "背后锁定", "第三人称斜后方", "转播机位"]
var _auto_w := 0.0
var _cam_xf := Transform3D.IDENTITY
var _cam_fov := 40.0
var _cam_init := false
var cam_lb: Label


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a == "--bot":
			bot = true
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a.begins_with("--max="):
			max_t = float(a.substr(6))
		elif a.begins_with("--round="):
			round_override = float(a.substr(8))
		elif a.begins_with("--me="):
			me_attr = float(a.substr(5))
		elif a.begins_with("--foe="):
			foe_attr = float(a.substr(6))
		elif a.begins_with("--seed="):
			seed_v = int(a.substr(7))
		elif a.begins_with("--cam="):
			cam_mode = clampi(int(a.substr(6)), 0, 3)
	var ring: Node3D = Ring.new()
	add_child(ring)
	cam = Camera3D.new()
	cam.cull_mask = 5  # 环境 + 主角虚化副本 + 对手
	add_child(cam)
	cam.current = true
	_sfx = {
		"light": load("res://assets/audio/designed_person/light_0.wav"),
		"heavy": load("res://assets/audio/designed_person/heavy_0.wav"),
		"heavy2": load("res://assets/audio/designed_person/heavy_3.wav"),
		"crowd": load("res://assets/audio/crowd/crowd_win.wav"),
		"body": load("res://assets/audio/designed_person/body_0.wav"),
		"block": load("res://assets/audio/designed/block_0.wav"),
		"whoosh": load("res://assets/audio/air_cloth/jacket_00.wav"),
		"bell": load("res://assets/audio/bell/bell_start.wav"),
		"bell_end": load("res://assets/audio/bell/bell_end.wav"),
		"down": load("res://assets/audio/kenney/impactSoft_heavy_000.ogg"),
	}
	_build_hud()
	_new_match()


func _new_match() -> void:
	if me_v:
		me_v.queue_free()
		foe_v.queue_free()
	me_v = _make_visual(true)
	foe_v = _make_visual(false)
	core = BattleCore.new()
	if round_override > 0.0:
		core.round_sec = round_override
	var am := {}
	var af := {}
	for k in GameState.ATTR_KEYS:
		am[k] = me_attr
		af[k] = foe_attr
	var pa := BattleCore.make("你", true, am, {"ai": bot, "tell": 0.0})
	var pb := BattleCore.make("林小葵", false, af, {"style_key": "balanced"})
	core.event.connect(_on_event)
	core.start(pa, pb, seed_v)
	_end_t = -1.0
	_pending_result = ""
	_count_on = false
	count_lb.text = ""
	count_lb.add_theme_font_size_override("font_size", 96)
	Engine.time_scale = 1.0
	_ko_cam_on = false
	_ko_victim = null
	cam.cull_mask = 5 if cam_mode == 0 else 3
	banner.text = ""


func _make_visual(is_me: bool) -> Node3D:
	var f: Node3D = VrmFighter.new()
	f.set("model_path", VRM_ME if is_me else VRM_FOE)
	if is_me:
		f.set("glove_color", Color(0.55, 0.30, 0.85))
		f.set("ghost_layer", 3)
		f.position = Vector3(0, 0, GAP)
	else:
		f.set("glove_color", Color(0.15, 0.55, 0.25))
		f.position = Vector3(0, 0, -GAP)
		f.rotation.y = PI
	add_child(f)
	f.call("build")
	return f


func _v(who: String) -> Node3D:
	return me_v if who == "a" else foe_v


func _other(who: String) -> String:
	return "b" if who == "a" else "a"


# ---------------- 规则事件 → 画面 / 声音 ----------------

func _on_event(ev: Dictionary) -> void:
	var who := String(ev.get("who", ""))
	match String(ev["type"]):
		"punch_start":
			_v(who).call("punch", String(ev["punch"]), float(ev["tell"]))
		"dodge":
			var d := String(ev["dir"])
			_v(who).call("act", {"l": "dodge_l", "r": "dodge_r", "duck": "duck"}[d], 0.45)
		"hit", "block":
			var kind := String(ev["punch"])
			var tgt := _v(_other(who))
			var pos: Vector3 = _v(who).call("glove_of", kind)
			var blocked := String(ev["type"]) == "block"
			_last_hit_pos = pos
			var big := bool(ev["counter"]) or bool(ev["knockdown"]) or kind in ["hook", "upper"]
			if blocked:
				_spark(pos, 0.6, Color(0.5, 0.75, 1.0))
				_play("block")
				freeze = 0.03
			else:
				tgt.call("act", "hit_body" if kind == "body" else ("hit_big" if big else "hit"), 0.75 if big else 0.4)
				_spark(pos, 1.6 if big else 1.0, Color(1.0, 0.9, 0.4))
				_play("heavy" if big else ("body" if kind == "body" else "light"))
				freeze = 0.10 if big else 0.05
				if big:
					fov_kick = 5.0
				if who == "b":
					flash_rect.color.a = 0.28 if big else 0.14
			if who == "a" and not blocked:
				var txt := ""
				if bool(ev["counter"]):
					txt = "反击！"
				if int(ev["combo"]) >= 2:
					txt += "  %d 连击" % int(ev["combo"])
				if txt != "":
					_info(txt)
			if bool(ev.get("pierced", false)):
				_info("击腹破防！" if who == "a" else "被击腹破防！")
		"whiff":
			_play("whoosh")
			if bool(ev.get("dodged", false)) and who == "b":
				_info("闪开了！1 秒内反击 +40%")
		"knockdown":
			var n := int(ev["count"])
			var ko := n >= 10
			if bot:
				print("KD who=%s count=%d at %.2f" % [who, n, real_t])
			# KO：仰面倒下不再起来；普通击倒：先后仰再跪下，读秒后起身
			_v(who).call("act", "ko_fall" if ko else "knock", 60.0 if ko else n * BattleCore.COUNT_SEC + 1.2)
			_impact(who, ko)
			_count_n = n
			_count_step = KO_COUNT_STEP if ko else BattleCore.COUNT_SEC
			_count_t = -(KO_COUNT_DELAY if ko else 0.5)  # 先让人倒下，再开始数
			_count_on = true
			_ko_popped = false
			count_lb.text = ""
		"getup":
			count_lb.text = "站起来了！"
			_count_on = false
			get_tree().create_timer(0.8).timeout.connect(func() -> void: count_lb.text = "")
		"round_start":
			_banner("第 %d 回合" % int(ev["round"]))
			_play("bell")
		"round_end":
			if int(ev["round"]) < BattleCore.ROUNDS:
				_banner("第 %d 回合结束" % int(ev["round"]))
				pause_left = 3.0
				_play("bell_end")
		"finish":
			var r: Dictionary = ev["result"]
			var won := bool(r["winner_is_a"])
			_pending_result = ("你赢了！" if won else "你输了……") + "  " + String(r["how"]) + "\n按 Enter 再来一局"
			# KO：先把 10 秒读完、盖上 K.O.，再出结果
			_pending_wait = KO_COUNT_DELAY + 10.0 * KO_COUNT_STEP + 1.6 if (_count_on and _count_n >= 10) else 0.0


## 击倒 / KO 那一拳的冲击：长顿帧 → 慢动作 → 白闪 → 爆点 → 叠层重击声 + 观众 → 落地闷响 + 小震
func _impact(who: String, ko: bool) -> void:
	var victim := _v(who)
	var pos := _last_hit_pos
	freeze = 0.24 if ko else 0.14
	white_rect.color.a = 0.75 if ko else 0.35
	_burst(pos, ko)
	_play("heavy")
	_play("heavy2")
	_play("crowd", -2.0 if ko else -8.0)
	fov_kick = 9.0 if ko else 6.0
	# 顿帧结束后进慢动作（计时不受慢动作影响）
	var slow := 0.25 if ko else 0.5
	var slow_len := 0.95 if ko else 0.35
	get_tree().create_timer(freeze, true, false, true).timeout.connect(func() -> void:
		Engine.time_scale = slow
		get_tree().create_timer(slow_len, true, false, true).timeout.connect(func() -> void: Engine.time_scale = 1.0))
	# 落地：KO 仰面倒下约 0.75 秒（游戏时间）落地；普通击倒 0.35 秒跪下
	get_tree().create_timer(0.75 if ko else 0.35).timeout.connect(func() -> void:
		_play("down")
		_shake_t = 0.25 if ko else 0.12)
	if ko:
		_ko_victim = victim
		_ko_cam_on = true
		_ko_orbit = 0.0
		get_tree().create_timer(1.4).timeout.connect(func() -> void: _play("bell_end"))


func _burst(pos: Vector3, ko: bool) -> void:
	_spark(pos, 2.8 if ko else 2.0, Color(1.0, 0.95, 0.6))
	_spark(pos, 1.4, Color(1.0, 1.0, 1.0))
	# 扩散环
	var ring := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.10
	tm.outer_radius = 0.13
	ring.mesh = tm
	var rm := StandardMaterial3D.new()
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	rm.albedo_color = Color(1.0, 0.85, 0.4, 0.9)
	ring.material_override = rm
	ring.position = pos
	ring.rotation_degrees = Vector3(90, 0, 0)  # 环面朝镜头（镜头在 +Z）
	add_child(ring)
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(ring, "scale", Vector3.ONE * (6.0 if ko else 4.0), 0.35)
	tw.tween_property(rm, "albedo_color:a", 0.0, 0.35)
	tw.chain().tween_callback(ring.queue_free)
	# 飞溅的汗珠 / 碎光
	var rng := RandomNumberGenerator.new()
	for i in (16 if ko else 9):
		var d := MeshInstance3D.new()
		var sm := SphereMesh.new()
		sm.radius = 0.018
		sm.height = 0.036
		d.mesh = sm
		var dm := StandardMaterial3D.new()
		dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		dm.albedo_color = Color(0.85, 0.95, 1.0) if i % 2 == 0 else Color(1.0, 0.9, 0.5)
		d.material_override = dm
		d.position = pos
		add_child(d)
		var dir := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.2, 1.0), rng.randf_range(-1.0, -0.2)).normalized()
		var dt := create_tween()
		dt.set_parallel(true)
		dt.tween_property(d, "position", pos + dir * rng.randf_range(0.35, 0.8), 0.45).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		dt.tween_property(dm, "albedo_color:a", 0.0, 0.5)
		dt.chain().tween_callback(d.queue_free)


func _spark(pos: Vector3, k: float, c: Color) -> void:
	var mi := MeshInstance3D.new()
	var s := SphereMesh.new()
	s.radius = 0.06
	s.height = 0.12
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
	tw.tween_property(mi, "scale", Vector3.ONE * 3.0 * k, 0.18)
	tw.tween_property(m, "albedo_color:a", 0.0, 0.2)
	tw.chain().tween_callback(mi.queue_free)


func _play(key: String, db: float = -4.0) -> void:
	if not _sfx.has(key) or _sfx[key] == null:
		return
	var p := AudioStreamPlayer.new()
	p.stream = _sfx[key]
	p.volume_db = db
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)


# ---------------- 主循环 ----------------

func _process(delta: float) -> void:
	real_t += delta
	if _pending_result != "":
		_pending_wait -= delta
		if _pending_wait <= 0.0:
			_banner(_pending_result)
			_banner_t = 999.0
			_pending_result = ""
			_play("bell_end")
			_end_t = real_t
	_update_hud(delta)
	_place_cam(delta)
	if out_dir != "" and real_t >= _next_shot:
		_next_shot += 4.0
		_snap("t%02d" % _shot_i)
		_shot_i += 1
	if real_t > max_t or (_end_t > 0.0 and bot and real_t - _end_t > 3.0):
		if out_dir != "":
			_snap("end")
		get_tree().quit()
		return
	_layout(delta)
	if freeze > 0.0:
		freeze -= delta
		return
	if pause_left > 0.0:
		pause_left -= delta
		_sync_guard()
		me_v.call("update_pose", delta)
		foe_v.call("update_pose", delta)
		return
	if not bot:
		_poll_block()
		_poll_move()
	core.step(delta)
	_sync_guard()
	me_v.call("update_pose", delta)
	foe_v.call("update_pose", delta)


## 角色站位跟规则内核走；读秒时站着的一方让到一边（不挡倒地的人）
func _layout(delta: float) -> void:
	var down := core.phase == "down" or core.finished
	var downed_is_b := String(foe_v.get("action")) in ["knock", "ko_fall", "down"]
	_aside = move_toward(_aside, 1.0 if down else 0.0, delta * 1.2)
	for pair in [[core.a, me_v], [core.b, foe_v]]:
		var f: Dictionary = pair[0]
		var v: Node3D = pair[1]
		var p: Vector2 = f["pos"]
		var ax := core.axis_of(f)
		var off := Vector2.ZERO
		var is_stander := (v == me_v) == downed_is_b
		if is_stander and _aside > 0.0:
			var right := Vector2(-ax.y, ax.x)
			off = (right * 0.75 - ax * 0.35) * ease(_aside, -2.0)
		var newp := Vector3(p.x + off.x, 0.0, p.y + off.y)
		# 本地移动速度 → 步法动画
		if delta > 0.0:
			var vel := (newp - v.position) / delta
			var right := Vector2(-ax.y, ax.x)
			v.set("walk", Vector2(vel.x * right.x + vel.z * right.y, vel.x * ax.x + vel.z * ax.y))
		v.position = newp
		v.rotation.y = atan2(-ax.x, -ax.y)


func _p3(f: Dictionary) -> Vector3:
	var p: Vector2 = f["pos"]
	return Vector3(p.x, 0.0, p.y)


func _ax3(f: Dictionary) -> Vector3:
	var ax := core.axis_of(f)
	return Vector3(ax.x, 0.0, ax.y)


func _sync_guard() -> void:
	for pair in [[core.a, me_v], [core.b, foe_v]]:
		var f: Dictionary = pair[0]
		var v: Node3D = pair[1]
		var g := 0
		if String(f["act"]) == "block":
			g = 2 if bool(f["block_low"]) else 1
		v.set("guard_hold", g)


## WASD：W 前压 / S 后退 / A D 绕圈（按住 Shift 时是闪避，按住空格时 S 是低格挡，都不移动）
func _poll_move() -> void:
	var v := Vector2.ZERO
	if not Input.is_physical_key_pressed(KEY_SHIFT):
		if Input.is_physical_key_pressed(KEY_W): v.y += 1.0
		if Input.is_physical_key_pressed(KEY_S) and not Input.is_physical_key_pressed(KEY_SPACE): v.y -= 1.0
		if Input.is_physical_key_pressed(KEY_D): v.x += 1.0
		if Input.is_physical_key_pressed(KEY_A): v.x -= 1.0
	core.input_move(core.a, v)


func _poll_block() -> void:
	var want := Input.is_physical_key_pressed(KEY_SPACE)
	var low := Input.is_physical_key_pressed(KEY_S)
	var f := core.a
	if want:
		if String(f["act"]) != "block" or bool(f["block_low"]) != low:
			core.input_block(f, true, low)
	elif String(f["act"]) == "block":
		core.input_block(f, false)


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var k := (event as InputEventKey).physical_keycode
	if k == KEY_ESCAPE:
		get_tree().quit()
		return
	if k == KEY_C:
		cam_mode = (cam_mode + 1) % CAM_NAMES.size()
		return
	if k == KEY_ENTER and core.finished:
		_new_match()
		return
	if bot or core.finished:
		return
	var f := core.a
	if Input.is_physical_key_pressed(KEY_SHIFT):
		var dir: String = {KEY_A: "l", KEY_D: "r", KEY_S: "duck"}.get(k, "")
		if dir != "":
			core.input_dodge(f, dir)
		return
	# 双击 WASD = 垫步
	var dash_dir := {KEY_W: Vector2(0, 1), KEY_S: Vector2(0, -1), KEY_A: Vector2(-1, 0), KEY_D: Vector2(1, 0)}
	if dash_dir.has(k) and not Input.is_physical_key_pressed(KEY_SPACE):
		if k == _tap_key and real_t - _tap_t < 0.28:
			core.input_dash(f, dash_dir[k])
			_tap_key = -1
		else:
			_tap_key = k
			_tap_t = real_t
		return
	var keymap := {KEY_J: "jab", KEY_K: "straight", KEY_U: "hook", KEY_I: "upper", KEY_L: "body"}
	if keymap.has(k):
		if String(f["act"]) == "block":
			core.input_block(f, false)
		core.input_punch(f, String(keymap[k]))


func _place_cam(delta: float) -> void:
	fov_kick = move_toward(fov_kick, 0.0, delta * 25.0)
	var me3 := _p3(core.a)
	var foe3 := _p3(core.b)
	var ax3 := _ax3(core.a)
	var mid := (me3 + foe3) * 0.5
	# ① 背后锁定：永远在主角身后、沿两人连线
	var back_xf := Transform3D(Basis.IDENTITY, me3 - ax3 * 1.75 + Vector3(0, 2.7, 0)).looking_at(foe3 + Vector3(0, 0.95, 0), Vector3.UP)
	# ② 第三人称斜后方：连线后方转 40°，看两人中点
	var side_dir := (-ax3).rotated(Vector3.UP, deg_to_rad(40.0))
	var dist := core.distance()
	var tp_xf := Transform3D(Basis.IDENTITY, mid + side_dir * (2.6 + dist * 0.6) + Vector3(0, 1.9, 0)).looking_at(mid + Vector3(0, 1.0, 0), Vector3.UP)
	# ③ 转播机位：擂台边固定位置，只转头跟两人中点
	var bc_xf := Transform3D(Basis.IDENTITY, Vector3(4.6, 2.4, 1.2)).looking_at(mid + Vector3(0, 0.9, 0), Vector3.UP)
	var target := back_xf
	var fov := 40.0
	var ghost := true
	match cam_mode:
		0:
			# 自动：贴身对打时背后；拉开距离或在绕圈时拉到斜后方
			var mv: Vector2 = core.a["move"]
			var want := clampf((dist - 1.15) / 0.45, 0.0, 1.0)
			want = maxf(want, clampf(absf(mv.x) * 1.2, 0.0, 1.0) * 0.8)
			_auto_w = move_toward(_auto_w, want, delta * (1.6 if want > _auto_w else 0.9))
			var w := ease(_auto_w, -1.8)
			target = back_xf.interpolate_with(tp_xf, w)
			fov = lerpf(40.0, 45.0, w)
			ghost = w < 0.8
		1:
			pass
		2:
			target = tp_xf
			fov = 45.0
			ghost = false
		3:
			target = bc_xf
			fov = clampf(24.0 + dist * 6.0, 26.0, 40.0)
			ghost = false
	# 镜头平滑跟随（避免绕圈时抖）
	if not _cam_init:
		_cam_xf = target
		_cam_fov = fov
		_cam_init = true
	var k := clampf(delta * 7.0, 0.0, 1.0)
	_cam_xf = _cam_xf.interpolate_with(target, k)
	_cam_fov = lerpf(_cam_fov, fov, k)
	cam.global_transform = _cam_xf
	cam.fov = _cam_fov - fov_kick
	cam.cull_mask = 5 if ghost else 3
	if cam_lb:
		cam_lb.text = "镜头：" + CAM_NAMES[cam_mode] + "（C 切换）"
	# KO 镜头：从侧前方推近倒地的人，然后像转播一样慢慢绕
	_ko_cam_w = move_toward(_ko_cam_w, 1.0 if _ko_cam_on else 0.0, delta * 2.5)
	if _ko_cam_w > 0.0 and _ko_victim:
		_ko_orbit = minf(_ko_orbit + delta * 0.18, 0.7)  # 往远离站立方的方向绕，绕到一定角度停住
		var c := _ko_victim.global_position + Vector3(0, 0.45, 0)
		# 从倒地者的正面斜侧看（站着的一方让到另一边，不挡镜头）
		var fz := 1.0 if _ko_victim == foe_v else -1.0   # 倒地者正面朝向
		var sx := -1.0 if _ko_victim == foe_v else 1.0   # 镜头放在站立方让开方向的反侧
		var ang := deg_to_rad(50.0) + _ko_orbit
		var ko_xf := Transform3D(Basis.IDENTITY, c + Vector3(sx * sin(ang) * 2.0, 0.95, fz * cos(ang) * 2.0))
		ko_xf = ko_xf.looking_at(c, Vector3.UP)
		var w := ease(_ko_cam_w, -2.0)
		cam.global_transform = cam.global_transform.interpolate_with(ko_xf, w)
		cam.fov = lerpf(cam.fov, 38.0 - fov_kick, w)
		if w > 0.5:
			cam.cull_mask = 3  # KO 镜头里主角显示实体
	# 落地小震（只给击倒 / KO，3px 量级）
	if _shake_t > 0.0:
		_shake_t -= delta
		cam.position += Vector3(randf_range(-1, 1), randf_range(-1, 1), 0) * 0.012


# ---------------- HUD ----------------

func _build_hud() -> void:
	hud = CanvasLayer.new()
	add_child(hud)
	flash_rect = ColorRect.new()
	flash_rect.color = Color(1, 0.1, 0.1, 0)
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(flash_rect)
	white_rect = ColorRect.new()
	white_rect.color = Color(1, 1, 1, 0)
	white_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	white_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(white_rect)
	for side in ["a", "b"]:
		var box := VBoxContainer.new()
		box.position = Vector2(24, 20) if side == "a" else Vector2(840, 20)
		box.custom_minimum_size = Vector2(416, 0)
		hud.add_child(box)
		var name_lb := _label("你" if side == "a" else "林小葵", 22)
		if side == "b":
			name_lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		box.add_child(name_lb)
		for spec in [["hp", Color(0.95, 0.40, 0.55), 18], ["stamina", Color(0.45, 0.75, 1.0), 10], ["trauma", Color(1.0, 0.70, 0.25), 8]]:
			var pb := ProgressBar.new()
			pb.show_percentage = false
			pb.custom_minimum_size = Vector2(416, int(spec[2]))
			pb.fill_mode = ProgressBar.FILL_BEGIN_TO_END if side == "a" else ProgressBar.FILL_END_TO_BEGIN
			var fill := StyleBoxFlat.new()
			fill.bg_color = spec[1]
			var bg := StyleBoxFlat.new()
			bg.bg_color = Color(0, 0, 0, 0.45)
			pb.add_theme_stylebox_override("fill", fill)
			pb.add_theme_stylebox_override("background", bg)
			box.add_child(pb)
			bars[side + "_" + String(spec[0])] = pb
	round_lb = _label("", 26)
	round_lb.position = Vector2(560, 18)
	round_lb.custom_minimum_size = Vector2(160, 0)
	round_lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(round_lb)
	banner = _label("", 44)
	banner.position = Vector2(190, 430)
	banner.custom_minimum_size = Vector2(900, 0)
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(banner)
	count_lb = _label("", 96)
	count_lb.position = Vector2(440, 160)
	count_lb.custom_minimum_size = Vector2(400, 0)
	count_lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	count_lb.add_theme_color_override("font_outline_color", Color(0.85, 0.2, 0.5))
	hud.add_child(count_lb)
	info_lb = _label("", 28)
	info_lb.position = Vector2(440, 640)
	info_lb.custom_minimum_size = Vector2(400, 0)
	info_lb.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	info_lb.add_theme_color_override("font_color", Color(1.0, 0.9, 0.4))
	hud.add_child(info_lb)
	var help := _label("WASD 走位（A/D 绕圈，双击垫步）   J 刺拳 · K 直拳 · U 摆拳 · I 上勾 · L 击腹   空格 格挡（+S 低格挡）   Shift+A/D 闪避 · Shift+S 下潜   C 切镜头", 16)
	help.position = Vector2(24, 764)
	hud.add_child(help)
	cam_lb = _label("", 16)
	cam_lb.position = Vector2(24, 120)
	hud.add_child(cam_lb)


func _label(t: String, size: int) -> Label:
	var lb := Label.new()
	lb.text = t
	lb.add_theme_font_size_override("font_size", size)
	lb.add_theme_color_override("font_outline_color", Color.BLACK)
	lb.add_theme_constant_override("outline_size", 6)
	return lb


func _banner(t: String) -> void:
	banner.text = t
	_banner_t = 1.6


func _info(t: String) -> void:
	info_lb.text = t
	_info_t = 1.0


func _update_hud(delta: float) -> void:
	for side in ["a", "b"]:
		var f: Dictionary = core.a if side == "a" else core.b
		(bars[side + "_hp"] as ProgressBar).value = float(f["hp"]) / float(f["max_hp"]) * 100.0
		(bars[side + "_stamina"] as ProgressBar).value = float(f["stamina"])
		(bars[side + "_trauma"] as ProgressBar).value = float(f["trauma"])
	var sec := maxi(0, int(ceil(core.clock)))
	round_lb.text = "R%d  %d:%02d" % [core.round_no, sec / 60, sec % 60]
	flash_rect.color.a = move_toward(flash_rect.color.a, 0.0, delta * 1.2)
	_banner_t -= delta
	if _banner_t <= 0.0:
		banner.text = ""
	_info_t -= delta
	if _info_t <= 0.0:
		info_lb.text = ""
	white_rect.color.a = move_toward(white_rect.color.a, 0.0, delta * 2.5)
	if _count_on:
		_count_t += delta
		if _count_t < 0.0:
			count_lb.text = ""
		elif _count_n >= 10 and _count_t > 10.0 * _count_step:
			if not _ko_popped:
				_ko_popped = true
				count_lb.text = "K.O."
				count_lb.add_theme_font_size_override("font_size", 150)
				count_lb.pivot_offset = count_lb.size / 2.0
				count_lb.scale = Vector2(2.2, 2.2)
				var tw := create_tween()
				tw.tween_property(count_lb, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
				_play("heavy", 0.0)
				_play("crowd", 0.0)
				white_rect.color.a = 0.35
		else:
			var shown := mini(int(_count_t / _count_step) + 1, _count_n)
			var txt := str(shown)
			if count_lb.text != txt:
				count_lb.text = txt
				count_lb.pivot_offset = count_lb.size / 2.0
				count_lb.scale = Vector2(1.5, 1.5)
				create_tween().tween_property(count_lb, "scale", Vector2.ONE, 0.15)


func _snap(name: String) -> void:
	if out_dir == "":
		return
	await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(out_dir)
	get_viewport().get_texture().get_image().save_png(out_dir.path_join(name + ".png"))
