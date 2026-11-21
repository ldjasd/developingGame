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
	var ring: Node3D = Ring.new()
	add_child(ring)
	cam = Camera3D.new()
	cam.cull_mask = 5  # 环境 + 主角虚化副本 + 对手
	add_child(cam)
	cam.current = true
	_sfx = {
		"light": load("res://assets/audio/designed_person/light_0.wav"),
		"heavy": load("res://assets/audio/designed_person/heavy_0.wav"),
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
	core.start(pa, pb)
	_end_t = -1.0
	_pending_result = ""
	_count_on = false
	count_lb.text = ""
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
			if bot:
				print("KD who=%s count=%d at %.2f" % [who, n, real_t])
			_v(who).call("act", "down", 60.0 if n >= 10 else n * BattleCore.COUNT_SEC + 1.2)  # KO 就不站起来了
			_play("down")
			fov_kick = 7.0
			_count_n = n
			_count_t = 0.0
			_count_on = true
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
			_pending_wait = 10.0 * BattleCore.COUNT_SEC + 1.0 if (_count_on and _count_n >= 10) else 0.0


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


func _play(key: String) -> void:
	if not _sfx.has(key) or _sfx[key] == null:
		return
	var p := AudioStreamPlayer.new()
	p.stream = _sfx[key]
	p.volume_db = -4.0
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
	# 读秒时站着的一方退回中立角（背后视角下也不会挡住倒地的人）
	if core.phase == "down" or core.finished:
		var down_is_b := float(core.b["hp"]) <= float(core.a["hp"]) if core.finished else (String(foe_v.get("action")) == "down")
		var stander := me_v if down_is_b else foe_v
		var base_z := GAP if stander == me_v else -GAP
		var back := 0.25 if stander == me_v else -0.9
		stander.position.z = move_toward(stander.position.z, base_z + back, delta * 1.0)
		stander.position.x = move_toward(stander.position.x, 0.75 if stander == me_v else -0.55, delta * 1.2)
	else:
		for v in [me_v, foe_v]:
			var bz := GAP if v == me_v else -GAP
			v.position.z = move_toward(v.position.z, bz, delta * 2.0)
			v.position.x = move_toward(v.position.x, 0.0, delta * 1.5)
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
	core.step(delta)
	_sync_guard()
	me_v.call("update_pose", delta)
	foe_v.call("update_pose", delta)


func _sync_guard() -> void:
	for pair in [[core.a, me_v], [core.b, foe_v]]:
		var f: Dictionary = pair[0]
		var v: Node3D = pair[1]
		var g := 0
		if String(f["act"]) == "block":
			g = 2 if bool(f["block_low"]) else 1
		v.set("guard_hold", g)


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
		cam_mode = 1 - cam_mode
		cam.cull_mask = 5 if cam_mode == 0 else 3
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
	if k == KEY_J or k == KEY_K:
		var kind := "jab" if k == KEY_J else "straight"
		if Input.is_physical_key_pressed(KEY_W):
			kind = "upper"
		elif Input.is_physical_key_pressed(KEY_S):
			kind = "body"
		elif Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_D):
			kind = "hook"
		if String(f["act"]) == "block":
			core.input_block(f, false)
		core.input_punch(f, kind)


func _place_cam(delta: float) -> void:
	fov_kick = move_toward(fov_kick, 0.0, delta * 25.0)
	var me_p := Vector3(0, 0, GAP)  # 镜头不跟主角退角：主角往侧边让开，倒地的人露出来
	if cam_mode == 0:
		cam.position = me_p + Vector3(0, 2.7, 1.75)
		cam.look_at(Vector3(0, 0.95, -GAP))
		cam.fov = 40.0 - fov_kick
	else:
		var mid := Vector3(0, 1.2, 0)
		cam.position = mid + Vector3(sin(deg_to_rad(38.0)) * 3.0, 0.7, cos(deg_to_rad(38.0)) * 3.0)
		cam.look_at(mid + Vector3(0, -0.1, 0))
		cam.fov = 45.0 - fov_kick


# ---------------- HUD ----------------

func _build_hud() -> void:
	hud = CanvasLayer.new()
	add_child(hud)
	flash_rect = ColorRect.new()
	flash_rect.color = Color(1, 0.1, 0.1, 0)
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(flash_rect)
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
	banner.position = Vector2(190, 300)
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
	var help := _label("J 左手 / K 右手（+W 上勾 · +S 击腹 · +A/D 摆拳）   空格 格挡（+S 低格挡）   Shift+A/D 闪避 · Shift+S 下潜   C 切镜头", 16)
	help.position = Vector2(24, 764)
	hud.add_child(help)


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
	if _count_on:
		_count_t += delta
		var shown := mini(int(_count_t / BattleCore.COUNT_SEC) + 1, _count_n)
		count_lb.text = "K.O." if _count_n >= 10 and _count_t > 10.0 * BattleCore.COUNT_SEC else str(shown)


func _snap(name: String) -> void:
	if out_dir == "":
		return
	await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(out_dir)
	get_viewport().get_texture().get_image().save_png(out_dir.path_join(name + ".png"))
