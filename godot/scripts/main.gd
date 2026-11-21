extends Control
## 《心跳在左，拳头在右》Godot 正式版主程序（移植自 web v43 的系统与数值口径）。
## 流程：标题 → 生涯中枢（训练/休息/商店/比赛/睡觉）→ 战斗（手动/自动/模拟）→ 结算回中枢。
## 存档 3 槽（user://），阶段/影响力/排名/装备/成就/剧情日常事件均已接入（见各子系统）。

const PUNCH_ANIM := {"jab": "jab", "straight": "straight", "hook": "hook", "upper": "upper", "body": "body"}
const PUNCH_NAME := {"jab": "刺拳", "straight": "直拳", "hook": "摆拳", "upper": "上勾拳", "body": "击腹拳"}
const FOE_TACTIC := {"power": "attack", "guardcounter": "counter", "speed": "points", "balanced": "balanced", "technique": "counter"}
## 剧情说话人（web story.js CHARS 口径）：事件 JSON 里的 w 字段是 id，显示时换成名字 + 立绘
const SPEAKERS := {
	"senior": {"name": "藤原梢", "img": "res://assets/story/senior.webp"},
	"manager": {"name": "栗原真纪", "img": "res://assets/story/manager.webp"},
	"rival": {"name": "沈墨凛", "img": "res://assets/story/rival.webp"},
	"teammate": {"name": "林小葵", "img": "res://assets/story/teammate.webp"},
	"me": {"name": "你"},
	"narr": {"name": ""},
}
var modal_dim: ColorRect
var modal_portrait: TextureRect

# ---- 音效（godot/tools/gen_sfx.py 合成的原创音效）----
const SFX_FOR_REACT := {"hit_light": "hit_light", "hit_face": "hit_heavy", "hit_side": "hit_heavy", "hit_body": "hit_body", "stagger": "hit_heavy", "block": "block"}
var _sfx_cache := {}
var _sfx_players: Array = []

## 真实录音优先（Kenney「Impact Sounds」CC0，assets/audio/kenney/，每次随机一个变体），没有就用合成版 wav
## [文件列表, 音量修正 dB]——每次在列表里随机挑一个
## 拳套命中：Freesound CC0 真实拳套实录（assets/audio/freesound/，用 tools/slice_hits.py 只裁剪切出）
## 倒地、回合铃：Kenney Impact Sounds（CC0）；挥空、观众：合成版
## 用户 2026-11-21：变调后「像加了滤镜」→ 录音一律原速原调播放，只用音量平衡
## 2026-11-21 用户试听定稿：命中音用「打人版」降脆版（tools/design_punches.py person），格挡用去毛刺版拳套对拳套
const SFX_RECORDED := {
	"hit_light": [["designed_person/light_0", "designed_person/light_1", "designed_person/light_2", "designed_person/light_3"], -3.0],
	"hit_heavy": [["designed_person/heavy_0", "designed_person/heavy_1", "designed_person/heavy_2", "designed_person/heavy_3", "designed_person/heavy_4"], 0.0],
	"hit_body": [["designed_person/body_0", "designed_person/body_1", "designed_person/body_2", "designed_person/body_3"], 0.0],
	"block": [["designed/block_0", "designed/block_1", "designed/block_2"], -6.0],
	"knockdown": [["kenney/impactSoft_heavy_000.ogg", "kenney/impactSoft_heavy_002.ogg", "kenney/impactSoft_heavy_004.ogg"], 2.0],
	# 拳击铃：TRP 真实拳击铃实录（Freesound 571096，CC0），tools/make_bells.py 修音；开场单响 / 终场三连
	# 挥空：衣物挥动实录（用户 2026-11-21 试听选 夹克组为主 + T恤组）——Nox_Sound 夹克（CC0）6 条 + Soundholder T恤（CC BY 3.0）3 条
	# 竹竿版 air/whoosh_*（Kinoton）用户评价「像金属东西挥空」，已不再引用
	"whoosh": [["air_cloth/jacket_00", "air_cloth/jacket_03", "air_cloth/jacket_04", "air_cloth/jacket_07", "air_cloth/jacket_11", "air_cloth/jacket_13",
		"air_cloth/tshirt_33", "air_cloth/tshirt_07", "air_cloth/tshirt_00"], -3.0],
	# 观众：FoolBoyMedia 获胜欢呼实录（CC0，tools/make_air_crowd.py）
	"crowd": [["crowd/crowd_win"], 0.0], # 用户 2026-11-21 试听：只留第一段（FoolBoyMedia 获胜欢呼）
	"bell_start": [["bell/bell_start"], 0.0],
	"bell_end": [["bell/bell_end"], 0.0],
}

## 临时静音名单（空 = 全部正常播放）。2026-11-21 曾误把挥空/观众关掉（用户原意是「听一下」），已恢复
const SFX_DISABLED: Array = []

func _sfx(name: String, vol_db: float = 0.0, pitch: float = 1.0) -> void:
	if name in SFX_DISABLED:
		return
	if not _sfx_cache.has(name):
		var variants: Array = []
		if SFX_RECORDED.has(name):
			for f in SFX_RECORDED[name][0]:
				var rp := "res://assets/audio/%s" % String(f)
				if not rp.get_extension() in ["ogg", "wav"]:
					rp += ".wav"
				if ResourceLoader.exists(rp):
					variants.append(load(rp))
		if variants.is_empty():
			var path := "res://assets/audio/%s.wav" % name
			if ResourceLoader.exists(path):
				variants.append(load(path))
		_sfx_cache[name] = variants
	var vs: Array = _sfx_cache[name]
	if vs.is_empty():
		return
	var stream: AudioStream = vs[rng.randi_range(0, vs.size() - 1)]
	if SFX_RECORDED.has(name):
		vol_db += float(SFX_RECORDED[name][1])
	if _sfx_players.is_empty():
		for i in 8:
			var p := AudioStreamPlayer.new()
			add_child(p)
			_sfx_players.append(p)
	var pl: AudioStreamPlayer = _sfx_players[0]
	for p in _sfx_players:
		if not p.playing:
			pl = p
			break
	pl.stream = stream
	pl.volume_db = vol_db
	# 录音：原速原调（调用方传的 pitch 也忽略），只靠 5 个变体避免重复感；合成音效才允许调音高
	pl.pitch_scale = 1.0 if SFX_RECORDED.has(name) else pitch
	pl.play()

var gs: GameState
var rng := RandomNumberGenerator.new()

# 屏幕与控件
var scr_title: Control
var scr_hub: Control
var scr_battle: Control
var modal: PanelContainer
var modal_title: Label
var modal_text: RichTextLabel
var modal_choices: VBoxContainer
var hub_info: Label
var hub_attrs: Label
var hub_log: RichTextLabel
var hub_actions: VBoxContainer
var sub_panel: PanelContainer
var sub_scroll: ScrollContainer
var sub_box: VBoxContainer

# 战斗运行时
var engine: BattleEngine
var foe_key := ""
var foe_entry: Dictionary = {}
var battle_mode := "manual" # manual / auto / sim
var is_spar := false
var player_turn := true
var battle_over := false
var rig_me: FighterSprite
var rig_foe: FighterSprite
var foe_portrait: Sprite2D
var foe_anchor: Node2D
var me_anchor: Node2D
var b_name_a: Label
var b_name_b: Label
var b_hp_a: ProgressBar
var b_hp_b: ProgressBar
var b_st_a: ProgressBar
var b_st_b: ProgressBar
var b_tr_a: ProgressBar
var b_tr_b: ProgressBar
var b_round: Label
var b_log: RichTextLabel
var b_controls: HBoxContainer
var b_tactics: HBoxContainer
var auto_timer: Timer
var _hub_pending_result := ""
var _shop_ap_charged := false
var is_defense := false
var custom_sel := {"pattern": "classic", "outer": "calf", "lining": "latex", "oz": 12, "fix": "velcro"}
var craft_sel := {"pattern": "classic", "outer": "calf", "lining": "latex"}
var _custom_preview: Label
var _craft_preview: Label
var _rig_tweens := {}

# 序章运行时（web Phase 7 序章：测力机 → 梢姐搭话 → 拳馆试训 → 开启生涯）
var pro_state: Dictionary = {}
var pro_fx: Label
var pro_score: Label
var pro_bar: ProgressBar
var pro_timer: Timer
var pro_advance: Timer

func _ready() -> void:
	rng.randomize()
	gs = GameState.new()
	_build_ui()
	_show_title()

# ================= UI 构建 =================

func _mk_label(text: String, size: int = 16, color: Color = Color(0.95, 0.92, 1.0)) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l

func _mk_button(text: String, callable: Callable, min_w: float = 0.0) -> Button:
	var b := Button.new()
	b.text = text
	if min_w > 0.0:
		b.custom_minimum_size.x = min_w
	b.pressed.connect(callable)
	return b

func _bg_image(path: String) -> TextureRect:
	var tr := TextureRect.new()
	tr.texture = load(path)
	tr.set_anchors_preset(Control.PRESET_FULL_RECT)
	tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return tr

func _build_ui() -> void:
	# ---- 标题屏 ----
	scr_title = Control.new()
	scr_title.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scr_title)
	scr_title.add_child(_bg_image("res://assets/backgrounds/title_stage.webp"))
	var tv := VBoxContainer.new()
	tv.set_anchors_preset(Control.PRESET_CENTER)
	tv.position = Vector2(-260, -240)
	tv.custom_minimum_size = Vector2(520, 480)
	scr_title.add_child(tv)
	var title := _mk_label("心跳在左，拳头在右", 44, Color(1.0, 0.75, 0.88))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tv.add_child(title)
	var sub := _mk_label("拳击养成 · Godot 正式版", 18, Color(0.85, 0.78, 1.0))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tv.add_child(sub)
	tv.add_child(_mk_button("新的生涯", _on_new_game))
	for slot in 3:
		var row := HBoxContainer.new()
		var info := "空"
		if GameState.slot_exists(slot):
			var tmp := GameState.load_from(slot)
			info = "第 %d 天 · 第 %d 名 · 胜 %d" % [int(tmp.s["day"]), tmp.my_rank(), int(tmp.s["wins"])]
		var slot_label := _mk_label("存档 %d：%s" % [slot + 1, info], 15)
		slot_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(slot_label)
		var lb := _mk_button("读取", _on_load_slot.bind(slot))
		lb.disabled = not GameState.slot_exists(slot)
		row.add_child(lb)
		tv.add_child(row)
	# ---- 中枢 ----
	scr_hub = Control.new()
	scr_hub.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scr_hub)
	scr_hub.add_child(_bg_image("res://assets/backgrounds/gym.webp"))
	var hub_dim := ColorRect.new()
	hub_dim.color = Color(0.04, 0.02, 0.09, 0.45)
	hub_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	hub_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scr_hub.add_child(hub_dim)
	var hub_root := VBoxContainer.new()
	hub_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	hub_root.offset_left = 16
	hub_root.offset_top = 12
	hub_root.offset_right = -16
	hub_root.offset_bottom = -12
	scr_hub.add_child(hub_root)
	hub_info = _mk_label("", 17)
	hub_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hub_root.add_child(hub_info)
	var mid := HBoxContainer.new()
	mid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hub_root.add_child(mid)
	hub_attrs = _mk_label("", 15)
	hub_attrs.custom_minimum_size = Vector2(300, 0)
	hub_attrs.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var at_style := _style(Color(0.05, 0.03, 0.10, 0.6))
	at_style.content_margin_left = 10
	at_style.content_margin_right = 10
	at_style.content_margin_top = 8
	at_style.content_margin_bottom = 8
	hub_attrs.add_theme_stylebox_override("normal", at_style)
	mid.add_child(hub_attrs)
	hub_actions = VBoxContainer.new()
	hub_actions.custom_minimum_size = Vector2(230, 0)
	mid.add_child(hub_actions)
	sub_panel = PanelContainer.new()
	sub_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mid.add_child(sub_panel)
	sub_scroll = ScrollContainer.new()
	sub_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sub_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sub_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sub_panel.add_child(sub_scroll)
	sub_box = VBoxContainer.new()
	sub_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sub_scroll.add_child(sub_box)
	# 子面板里的长文案统一自动换行（之前训练说明/工坊配方会冲出屏幕右边被截断）
	sub_box.child_entered_tree.connect(_fit_sub_child)
	var sp_style := _style(Color(0.05, 0.03, 0.10, 0.72))
	sp_style.content_margin_left = 12
	sp_style.content_margin_right = 12
	sp_style.content_margin_top = 8
	sp_style.content_margin_bottom = 8
	sub_panel.add_theme_stylebox_override("panel", sp_style)
	hub_log = RichTextLabel.new()
	hub_log.custom_minimum_size = Vector2(0, 110)
	hub_log.fit_content = true
	hub_root.add_child(hub_log)
	# ---- 战斗屏 ----
	scr_battle = Control.new()
	scr_battle.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scr_battle)
	scr_battle.add_child(_bg_image("res://assets/backgrounds/ring_side.webp"))
	var top := HBoxContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 16
	top.offset_right = -16
	top.offset_top = 8
	scr_battle.add_child(top)
	var col_a := VBoxContainer.new()
	col_a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(col_a)
	b_name_a = _mk_label("", 18)
	col_a.add_child(b_name_a)
	b_hp_a = _bar(Color(0.95, 0.4, 0.55))
	_bar_row(col_a, "HP", b_hp_a, false)
	b_st_a = _bar(Color(0.5, 0.8, 1.0))
	_bar_row(col_a, "体力", b_st_a, false)
	b_tr_a = _bar(Color(1.0, 0.75, 0.3))
	_bar_row(col_a, "重创", b_tr_a, false)
	b_round = _mk_label("第 1 回合", 20)
	b_round.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b_round.custom_minimum_size = Vector2(120, 0)
	top.add_child(b_round)
	var col_b := VBoxContainer.new()
	col_b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(col_b)
	b_name_b = _mk_label("", 18)
	b_name_b.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	col_b.add_child(b_name_b)
	b_hp_b = _bar(Color(0.95, 0.4, 0.55))
	_bar_row(col_b, "HP", b_hp_b, true)
	b_st_b = _bar(Color(0.5, 0.8, 1.0))
	_bar_row(col_b, "体力", b_st_b, true)
	b_tr_b = _bar(Color(1.0, 0.75, 0.3))
	_bar_row(col_b, "重创", b_tr_b, true)
	me_anchor = Node2D.new()
	me_anchor.position = Vector2(150, 235)
	scr_battle.add_child(me_anchor)
	foe_anchor = Node2D.new()
	foe_anchor.position = Vector2(760, 235)
	scr_battle.add_child(foe_anchor)
	b_log = RichTextLabel.new()
	b_log.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	# 战报放右下角、按钮放左下角：之前战报横跨整屏、压在两人腿上
	b_log.offset_left = 660
	b_log.offset_right = -16
	b_log.offset_top = -150
	b_log.offset_bottom = -12
	b_log.scroll_following = true
	b_log.add_theme_stylebox_override("normal", _style(Color(0.03, 0.02, 0.08, 0.62)))
	scr_battle.add_child(b_log)
	b_tactics = HBoxContainer.new()
	b_tactics.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	b_tactics.offset_left = 16
	b_tactics.offset_right = -640
	b_tactics.offset_top = -150
	b_tactics.offset_bottom = -120
	scr_battle.add_child(b_tactics)
	b_controls = HBoxContainer.new()
	b_controls.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	b_controls.offset_left = 16
	b_controls.offset_right = -640
	b_controls.offset_top = -112
	b_controls.offset_bottom = -30
	scr_battle.add_child(b_controls)
	auto_timer = Timer.new()
	auto_timer.wait_time = 0.85
	auto_timer.timeout.connect(_on_auto_tick)
	scr_battle.add_child(auto_timer)
	# ---- 通用弹窗 ----
	# 全屏遮罩：弹窗打开时挡住背后的中枢按钮（之前能透过弹窗点到下面的按钮）
	modal_dim = ColorRect.new()
	modal_dim.color = Color(0.02, 0.01, 0.05, 0.62)
	modal_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	modal_dim.mouse_filter = Control.MOUSE_FILTER_STOP
	modal_dim.hide()
	add_child(modal_dim)
	modal = PanelContainer.new()
	modal.set_anchors_preset(Control.PRESET_CENTER)
	modal.position = Vector2(-400, -250)
	modal.custom_minimum_size = Vector2(800, 500)
	var mstyle := _style(Color(0.09, 0.06, 0.16, 0.97))
	mstyle.border_color = Color(0.95, 0.55, 0.78)
	mstyle.set_border_width_all(2)
	mstyle.content_margin_left = 22
	mstyle.content_margin_right = 22
	mstyle.content_margin_top = 16
	mstyle.content_margin_bottom = 16
	modal.add_theme_stylebox_override("panel", mstyle)
	add_child(modal)
	modal.visibility_changed.connect(func() -> void: modal_dim.visible = modal.visible)
	var mh := HBoxContainer.new()
	mh.add_theme_constant_override("separation", 18)
	modal.add_child(mh)
	modal_portrait = TextureRect.new()
	modal_portrait.custom_minimum_size = Vector2(220, 0)
	modal_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	modal_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	modal_portrait.hide()
	mh.add_child(modal_portrait)
	var mv := VBoxContainer.new()
	mv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mh.add_child(mv)
	modal_title = _mk_label("", 22, Color(1.0, 0.8, 0.9))
	mv.add_child(modal_title)
	modal_text = RichTextLabel.new()
	modal_text.bbcode_enabled = true
	modal_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	modal_text.fit_content = true
	modal_text.add_theme_font_size_override("normal_font_size", 17)
	modal_text.add_theme_font_size_override("bold_font_size", 17)
	mv.add_child(modal_text)
	# 序章专用行（反馈行 / 测力机分数 / 力量条），平时隐藏
	pro_fx = _mk_label("", 15, Color(1.0, 0.85, 0.6))
	pro_fx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	mv.add_child(pro_fx)
	pro_score = _mk_label("", 34, Color(1.0, 0.8, 0.35))
	pro_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mv.add_child(pro_score)
	pro_bar = ProgressBar.new()
	pro_bar.min_value = 0
	pro_bar.max_value = 100
	pro_bar.value = 0
	pro_bar.custom_minimum_size = Vector2(0, 18)
	pro_bar.add_theme_stylebox_override("fill", _style(Color(0.95, 0.45, 0.6)))
	mv.add_child(pro_bar)
	pro_fx.hide()
	pro_score.hide()
	pro_bar.hide()
	modal_choices = VBoxContainer.new()
	mv.add_child(modal_choices)
	modal.hide()
	pro_timer = Timer.new()
	pro_timer.wait_time = 0.03
	pro_timer.timeout.connect(_on_pro_timer)
	add_child(pro_timer)
	pro_advance = Timer.new()
	pro_advance.wait_time = 1.4
	pro_advance.one_shot = true
	pro_advance.timeout.connect(_on_pro_spar_advance)
	add_child(pro_advance)

func _fit_sub_child(n: Node) -> void:
	if n is Label:
		(n as Label).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	elif n is Button:
		(n as Button).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		(n as Button).alignment = HORIZONTAL_ALIGNMENT_LEFT
	elif n is HBoxContainer:
		for c in n.get_children():
			if c is Label:
				(c as Label).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				(c as Label).size_flags_horizontal = Control.SIZE_EXPAND_FILL

## 一行「标签 + 条」：之前三条血条没有名字，分不清 HP / 体力 / 重创
func _bar_row(col: VBoxContainer, label: String, bar: ProgressBar, right: bool) -> void:
	var row := HBoxContainer.new()
	var l := _mk_label(label, 13, Color(0.9, 0.86, 1.0))
	l.custom_minimum_size = Vector2(40, 0)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if right else HORIZONTAL_ALIGNMENT_LEFT
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if right:
		bar.fill_mode = ProgressBar.FILL_END_TO_BEGIN
		row.add_child(bar)
		row.add_child(l)
	else:
		row.add_child(l)
		row.add_child(bar)
	col.add_child(row)

func _bar(color: Color) -> ProgressBar:
	var p := ProgressBar.new()
	p.min_value = 0
	p.max_value = 100
	p.value = 100
	p.custom_minimum_size = Vector2(0, 14)
	p.add_theme_stylebox_override("fill", _style(color))
	return p

func _style(color: Color) -> StyleBoxFlat:
	var st := StyleBoxFlat.new()
	st.bg_color = color
	st.corner_radius_top_left = 4
	st.corner_radius_top_right = 4
	st.corner_radius_bottom_left = 4
	st.corner_radius_bottom_right = 4
	return st

# ================= 屏幕切换 =================

func _show_title() -> void:
	scr_title.show()
	scr_hub.hide()
	scr_battle.hide()

func _show_hub() -> void:
	scr_title.hide()
	scr_battle.hide()
	scr_hub.show()
	_refresh_hub()
	_show_sub_main()

func _hub_log_add(text: String) -> void:
	hub_log.append_text(text + "\n")
	hub_log.scroll_to_line(hub_log.get_line_count())

func _refresh_hub() -> void:
	var stage_name := ""
	for st in DataDB.stages():
		if int(st["id"]) == int(gs.s["stage"]):
			stage_name = String(st["name"]) + "：" + String(st["goalText"])
	var inf_name := ""
	for lv in DataDB.influence_levels():
		if int(lv["lv"]) == int(gs.s["influence"]):
			inf_name = String(lv["name"])
	hub_info.text = "第 %d 天（第 %d 周） · 行动点 %d/%d · 资金 ¥%d · 排名 第 %d · 影响力 Lv%d %s · 心态 %s · 伤病 %d · 疲劳 %d\n阶段 %d %s · 战绩 %d 胜 %d 负（连胜 %d）· 卫冕 %d" % [
		int(gs.s["day"]), int(gs.s["week"]), int(gs.s["ap"]), GameState.AP_PER_DAY,
		int(gs.s["money"]), gs.my_rank(), int(gs.s["influence"]), inf_name,
		"%d·%s" % [int(gs.s["mind"]), GameState.mind_tier_name(int(gs.s["mind"]))], int(gs.s["injury"]), int(gs.s["fatigue"]),
		int(gs.s["stage"]), stage_name, int(gs.s["wins"]), int(gs.s["losses"]),
		int(gs.s["win_streak"]), int(gs.s["defenses"])]
	var lines := ""
	var names := {"power": "力量", "endurance": "耐久", "will": "意志", "speed": "出拳速度", "accuracy": "精准度", "footwork": "步伐速度", "defense": "防守技术", "technique": "技术"}
	for k in GameState.ATTR_KEYS:
		lines += "%s %d\n" % [names[k], int(float(gs.s["attrs"][k]))]
	lines += "\n拳种经验："
	for k in ["jab", "straight", "hook", "upper", "body"]:
		lines += "%s %d · " % [PUNCH_NAME[k], int(float(gs.s["punch_exp"][k]))]
	lines += "\n\n已装备："
	var eq: Dictionary = gs.s["gear_equipped"]
	if eq.is_empty():
		lines += "无"
	else:
		var slot_names: Dictionary = DataDB.slot_names()
		for slot in eq.keys():
			var g := gs.gear_by_id(String(eq[slot]))
			if not g.is_empty():
				lines += "\n%s（%s）" % [gs.gear_disp_name(g), String(slot_names.get(slot, slot))]
	lines += "\n\n材料："
	var mat_parts: Array = []
	for m in DataDB.materials():
		mat_parts.append("%s ×%d" % [String(m["name"]), int(gs.s["materials"].get(String(m["id"]), 0))])
	lines += " · ".join(mat_parts)
	var sp_now := gs.current_sponsor()
	lines += "\n赞助：%s" % (String(sp_now["name"]) + "（周薪 ¥%d）" % int(sp_now["weekly"]) if not sp_now.is_empty() else "无")
	lines += "\n拥有装备 %d 件 · 图鉴 %d 款 · 成就 %d 项" % [Array(gs.s["gear_owned"]).size(), Array(gs.s["dex_sigs"]).size(), Array(gs.s["achievements"]).size()]
	hub_attrs.text = lines

# ================= 中枢子面板 =================

func _clear_sub() -> void:
	for c in sub_box.get_children():
		c.queue_free()
	for c in hub_actions.get_children():
		c.queue_free()

func _show_sub_main() -> void:
	_clear_sub()
	_shop_ap_charged = false
	var md_note := "今天是比赛日！正式赛报名不耗行动点，每个比赛日 1 场。" if gs.is_match_day() else "距离比赛日（每周第 7 天）还有 %d 天，抓紧训练。" % gs.days_to_match()
	sub_box.add_child(_mk_label("拳馆中枢——选择今天的安排。训练消耗行动点与疲劳。\n" + md_note, 15))
	hub_actions.add_child(_mk_button("训练", _show_trainings))
	hub_actions.add_child(_mk_button("休息（2 AP）", _on_rest))
	hub_actions.add_child(_mk_button("商店", _show_shop))
	hub_actions.add_child(_mk_button("背包工坊", _show_bag))
	hub_actions.add_child(_mk_button("赞助", _show_sponsor))
	var mb := _mk_button("★ 比赛（今天是比赛日）" if gs.can_fight_official() else ("比赛（还有 %d 天）" % gs.days_to_match() if not gs.is_match_day() else "比赛（今日已赛）"), _show_matches)
	if gs.can_fight_official():
		mb.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
		mb.add_theme_stylebox_override("normal", _style(Color(0.55, 0.2, 0.45, 0.9)))
	hub_actions.add_child(mb)
	hub_actions.add_child(_mk_button("约战（2 AP）", _show_spar))
	hub_actions.add_child(_mk_button("排行榜", _show_ranking))
	hub_actions.add_child(_mk_button("睡觉（结束今天）", _on_sleep))
	hub_actions.add_child(_mk_button("存档到槽 1", _on_save.bind(0)))
	hub_actions.add_child(_mk_button("存档到槽 2", _on_save.bind(1)))
	hub_actions.add_child(_mk_button("存档到槽 3", _on_save.bind(2)))
	hub_actions.add_child(_mk_button("回标题", _show_title))

func _show_trainings() -> void:
	_clear_sub()
	_show_sub_main()
	_clear_sub()
	sub_box.add_child(_mk_label("训练项目（消耗 AP 与疲劳）", 17))
	for t in DataDB.trainings():
		var can := int(gs.s["ap"]) >= int(t["pts"]) and int(gs.s["fatigue"]) + int(t.get("stam", 0)) <= 100
		var b := _mk_button("%s（%d AP）— %s" % [String(t["name"]), int(t["pts"]), String(t["desc"])], _on_training.bind(String(t["id"])))
		b.disabled = not can
		sub_box.add_child(b)
	sub_box.add_child(_mk_button("返回", _show_sub_main))

func _on_training(id: String) -> void:
	var msg := gs.do_training(id)
	if msg != "":
		_hub_log_add(msg)
		_check_achievements()
	_refresh_hub()
	_show_trainings()

func _on_rest() -> void:
	var msg := gs.do_rest()
	if msg != "":
		_hub_log_add(msg)
	_refresh_hub()

func _show_shop() -> void:
	if int(gs.s["ap"]) < 2 and not _shop_ap_charged:
		_hub_log_add("行动点不足，去商店要 2 AP。")
		return
	_clear_sub()
	sub_box.add_child(_mk_label("装备商店（进店扣 2 AP，购买不另耗 AP）", 17))
	for g in DataDB.shop_gear():
		var owned: bool = String(g["id"]) in gs.s["gear_owned"]
		var equipped: bool = String(gs.s["gear_equipped"].get(String(g["slot"]), "")) == String(g["id"])
		var txt := "%s ¥%d — %s%s" % [String(g["name"]), int(g["price"]), String(g["desc"]), "（已装备）" if equipped else ("（已拥有）" if owned else "")]
		var b := _mk_button(txt, _on_buy.bind(String(g["id"])))
		b.disabled = owned or int(gs.s["money"]) < int(g["price"])
		sub_box.add_child(b)
	# ---- 定制拳套工坊（双层结构：版型定骨架、外皮＋内衬定手感、盎司/固定微调） ----
	sub_box.add_child(_mk_label("定制拳套工坊（改选实时预览，确认购买才扣钱）", 17))
	sub_box.add_child(_mk_label("版型（第一层 · 骨架）", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_patterns(), func(o: Dictionary) -> String: return "%s · 基础 ¥%d · %s" % [String(o["name"]), int(o["base"]), String(o["note"])]), String(custom_sel["pattern"]), func(v: String) -> void: custom_sel["pattern"] = v; _update_custom_preview()))
	sub_box.add_child(_mk_label("外皮（第二层）", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_outers(), func(o: Dictionary) -> String: return "%s · ¥%d · %s" % [String(o["name"]), int(o["price"]), String(o["note"])]), String(custom_sel["outer"]), func(v: String) -> void: custom_sel["outer"] = v; _update_custom_preview()))
	sub_box.add_child(_mk_label("内衬（第二层）", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_linings(), func(o: Dictionary) -> String: return "%s · ¥%d · %s" % [String(o["name"]), int(o["price"]), String(o["note"])]), String(custom_sel["lining"]), func(v: String) -> void: custom_sel["lining"] = v; _update_custom_preview()))
	sub_box.add_child(_mk_label("盎司", 14))
	var oz_opts: Array = []
	for k in ["8", "10", "12", "14", "16"]:
		var ozd: Dictionary = DataDB.glove_oz()[k]
		oz_opts.append([k, "%soz · %s¥%d · %s" % [k, "+" if int(ozd["adj"]) >= 0 else "−", int(abs(int(ozd["adj"]))), String(ozd["note"])]])
	sub_box.add_child(_mk_options(oz_opts, str(int(custom_sel["oz"])), func(v: String) -> void: custom_sel["oz"] = int(v); _update_custom_preview()))
	sub_box.add_child(_mk_label("固定方式", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_fix(), func(o: Dictionary) -> String: return "%s · ¥%d · %s" % [String(o["name"]), int(o["price"]), String(o["note"])]), String(custom_sel["fix"]), func(v: String) -> void: custom_sel["fix"] = v; _update_custom_preview()))
	_custom_preview = _mk_label("", 15)
	_custom_preview.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub_box.add_child(_custom_preview)
	sub_box.add_child(_mk_button("定制这副拳套", _on_custom_buy))
	_update_custom_preview()
	sub_box.add_child(_mk_button("返回", _show_sub_main))

func _opts_of(table: Dictionary, label_of: Callable) -> Array:
	var out: Array = []
	for k in table.keys():
		out.append([String(k), String(label_of.call(table[k]))])
	return out

func _mk_options(options: Array, current: String, on_pick: Callable) -> OptionButton:
	var ob := OptionButton.new()
	for i in options.size():
		ob.add_item(String(options[i][1]), i)
		if String(options[i][0]) == current:
			ob.selected = i
	ob.item_selected.connect(func(i: int) -> void: on_pick.call(String(options[i][0])))
	return ob

func _update_custom_preview() -> void:
	if _custom_preview == null or not is_instance_valid(_custom_preview):
		return
	var c := gs.compute_glove(custom_sel)
	_custom_preview.text = "定制·%s拳套\n%s\n总价 ¥%d%s" % [String(c["short_name"]), String(c["desc"]), int(c["price"]), " · 金钱不足" if int(gs.s["money"]) < int(c["price"]) else ""]

func _on_custom_buy() -> void:
	if not _shop_ap_charged:
		gs.s["ap"] = int(gs.s["ap"]) - 2
		_shop_ap_charged = true
	var g := gs.buy_custom_glove(custom_sel)
	if g.is_empty():
		_hub_log_add("钱不够定制。")
	else:
		_hub_log_add("定制拳套：%s 已存入背包（去背包工坊装备）。%s" % [String(g["name"]), String(g["desc"])])
		for note in gs.last_dex_notes:
			_hub_log_add(String(note))
		_check_achievements()
	_refresh_hub()
	_show_shop()

# ================= 赞助（web Phase 3：状态屏赞助卡移植；签约/解约不耗 AP） =================

func _influence_name(lv: int) -> String:
	for x in DataDB.influence_levels():
		if int(x["lv"]) == lv:
			return String(x["name"])
	return ""

func _influence_label(lv: int) -> String:
	return "Lv%d「%s」" % [lv, _influence_name(lv)]

func _show_sponsor() -> void:
	_clear_sub()
	var cur := gs.current_sponsor()
	var lv := int(gs.s["influence"])
	var head := "当前影响力 %s。" % _influence_label(lv)
	if not cur.is_empty():
		head += "当前签约：%s（签约金 ¥%d 已领取，每周第 1 天自动到账周薪 ¥%d）。想换更高档，先解约再签新的。" % [String(cur["name"]), int(cur["sign"]), int(cur["weekly"])]
	else:
		head += "尚未签约。影响力达到门槛档位即可签约，签约金立即到账，之后每周第 1 天发周薪。"
	var head_label := _mk_label(head, 15)
	head_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub_box.add_child(head_label)
	for sp in DataDB.sponsors():
		var is_cur: bool = String(gs.s.get("sponsor", "")) == String(sp["id"])
		var locked: bool = lv < int(sp["need"])
		sub_box.add_child(_mk_label("%s%s\n%s\n门槛 影响力 Lv%d「%s」 · 签约金 ¥%d · 周薪 ¥%d / 周" % [
			String(sp["name"]), "（签约中）" if is_cur else "", String(sp["desc"]),
			int(sp["need"]), _influence_name(int(sp["need"])), int(sp["sign"]), int(sp["weekly"])], 15))
		if is_cur:
			sub_box.add_child(_mk_button("解约", _on_sponsor_cancel))
		elif not cur.is_empty():
			var nb := _mk_button("需先解约", _on_sponsor_sign.bind(String(sp["id"])))
			nb.disabled = true
			sub_box.add_child(nb)
		elif locked:
			var lb2 := _mk_button("影响力 Lv%d" % int(sp["need"]), _on_sponsor_sign.bind(String(sp["id"])))
			lb2.disabled = true
			sub_box.add_child(lb2)
		else:
			sub_box.add_child(_mk_button("签约", _on_sponsor_sign.bind(String(sp["id"]))))
	sub_box.add_child(_mk_button("返回", _show_sub_main))

func _on_sponsor_sign(id: String) -> void:
	var res := gs.sign_sponsor(id)
	if bool(res.get("ok", false)):
		var sp: Dictionary = res["sp"]
		_hub_log_add("签约赞助：%s，签约金 ¥%d 已到账；之后每周第 1 天到账周薪 ¥%d。" % [String(sp["name"]), int(sp["sign"]), int(sp["weekly"])])
		_check_achievements() # 「商业首秀」成就判定（web 同点）
	else:
		_hub_log_add("签约失败：" + String(res.get("msg", "")))
	_refresh_hub()
	_show_sponsor()

func _on_sponsor_cancel() -> void:
	var res := gs.cancel_sponsor()
	if bool(res.get("ok", false)):
		_hub_log_add("已与赞助商%s解约。" % String(res["sp"]["name"]))
	else:
		_hub_log_add("解约失败：" + String(res.get("msg", "")))
	_refresh_hub()
	_show_sponsor()

# ================= 背包工坊（材料 / 装备管理 / 强化 / 拆解 / 打造） =================

func _show_bag() -> void:
	_clear_sub()
	sub_box.add_child(_mk_label("背包工坊（拆解装备得材料，材料可打造拳套；强化让装备 +1~+10）", 17))
	var mat_line := "材料库存："
	for m in DataDB.materials():
		mat_line += "%s·%s ×%d  " % [String(m["kind"]), String(m["name"]), int(gs.s["materials"].get(String(m["id"]), 0))]
	sub_box.add_child(_mk_label(mat_line, 14))
	var slot_names: Dictionary = DataDB.slot_names()
	for slot in ["gloves", "guard", "boots", "head", "robe", "wrist"]:
		sub_box.add_child(_mk_label("【%s】" % String(slot_names.get(slot, slot)), 16))
		var mine: Array = []
		for g in gs.all_gear():
			if String(g["slot"]) == slot and String(g["id"]) in gs.s["gear_owned"]:
				mine.append(g)
		if mine.is_empty():
			sub_box.add_child(_mk_label("还没有这个部位的装备，去商店买或定制吧。", 14))
		for g in mine:
			var gid := String(g["id"])
			var equipped: bool = String(gs.s["gear_equipped"].get(slot, "")) == gid
			var lvl := gs.enh_of(gid)
			sub_box.add_child(_mk_label("%s%s — %s" % [gs.gear_disp_name(g), "（已装备）" if equipped else "", gs.bonus_desc_at(g, lvl)], 14))
			var row := HBoxContainer.new()
			var eb := _mk_button("已装备" if equipped else "装备", _on_bag_equip.bind(gid))
			eb.disabled = equipped
			row.add_child(eb)
			var c := gs.enh_cost(g)
			var hb := _mk_button("满级 +10" if lvl >= GameState.ENH_MAX else "强化 → +%d（¥%d＋材料 ×%d）" % [lvl + 1, int(c["money"]), int(c["mat_count"])], _on_bag_enhance.bind(gid))
			hb.disabled = lvl >= GameState.ENH_MAX
			row.add_child(hb)
			var db := _mk_button("拆解", _on_bag_dismantle.bind(gid))
			db.disabled = equipped
			row.add_child(db)
			sub_box.add_child(row)
	# ---- 工坊打造 ----
	sub_box.add_child(_mk_label("工坊打造（外皮材料 ×2 ＋ 内衬材料 ×2 ＋ 手工费 ¥200；规格 12oz · 魔术贴）", 17))
	sub_box.add_child(_mk_label("版型", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_patterns(), func(o: Dictionary) -> String: return "%s · %s" % [String(o["name"]), String(o["note"])]), String(craft_sel["pattern"]), func(v: String) -> void: craft_sel["pattern"] = v; _update_craft_preview()))
	sub_box.add_child(_mk_label("外皮（消耗对应皮料 ×2）", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_outers(), func(o: Dictionary) -> String: return "%s · %s" % [String(o["name"]), String(o["note"])]), String(craft_sel["outer"]), func(v: String) -> void: craft_sel["outer"] = v; _update_craft_preview()))
	sub_box.add_child(_mk_label("内衬（消耗对应内衬材料 ×2）", 14))
	sub_box.add_child(_mk_options(_opts_of(DataDB.glove_linings(), func(o: Dictionary) -> String: return "%s · %s" % [String(o["name"]), String(o["note"])]), String(craft_sel["lining"]), func(v: String) -> void: craft_sel["lining"] = v; _update_craft_preview()))
	_craft_preview = _mk_label("", 15)
	_craft_preview.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub_box.add_child(_craft_preview)
	sub_box.add_child(_mk_button("打造这副拳套（¥200 手工费）", _on_craft))
	_update_craft_preview()
	sub_box.add_child(_mk_button("返回", _show_sub_main))

func _update_craft_preview() -> void:
	if _craft_preview == null or not is_instance_valid(_craft_preview):
		return
	var sel := {"pattern": String(craft_sel["pattern"]), "outer": String(craft_sel["outer"]), "lining": String(craft_sel["lining"]), "oz": 12, "fix": "velcro"}
	var c := gs.compute_glove(sel)
	var miss: Array = []
	if int(gs.s["materials"].get(String(craft_sel["outer"]), 0)) < GameState.CRAFT_MAT_NEED:
		miss.append(gs.material_name(String(craft_sel["outer"])))
	if int(gs.s["materials"].get(String(craft_sel["lining"]), 0)) < GameState.CRAFT_MAT_NEED:
		miss.append(gs.material_name(String(craft_sel["lining"])))
	_craft_preview.text = "打造·%s拳套（12oz · 魔术贴）\n%s\n需要：%s ×2（现有 %d）＋ %s ×2（现有 %d）＋ 手工费 ¥200%s%s" % [
		String(c["short_name"]), String(c["desc"]),
		gs.material_name(String(craft_sel["outer"])), int(gs.s["materials"].get(String(craft_sel["outer"]), 0)),
		gs.material_name(String(craft_sel["lining"])), int(gs.s["materials"].get(String(craft_sel["lining"]), 0)),
		" · 材料不足：缺 " + "、".join(miss) if not miss.is_empty() else "",
		" · 金钱不足" if int(gs.s["money"]) < GameState.CRAFT_FEE else ""]

func _on_bag_equip(gid: String) -> void:
	if gs.equip_gear(gid):
		var g := gs.gear_by_id(gid)
		_hub_log_add("更换装备：%s（%s）。" % [gs.gear_disp_name(g), gs.bonus_desc_at(g, gs.enh_of(gid))])
	_refresh_hub()
	_show_bag()

func _on_bag_enhance(gid: String) -> void:
	var res := gs.enhance_gear(gid)
	if bool(res.get("ok", false)):
		var g := gs.gear_by_id(gid)
		_hub_log_add("强化成功：%s（花费 ¥%d、对应材料 ×%d），效果变为：%s。" % [gs.gear_disp_name(g), int(res["money"]), int(res["mat_count"]), gs.bonus_desc_at(g, int(res["lvl"]))])
		_check_achievements()
	else:
		_hub_log_add("强化失败：" + String(res.get("msg", "")))
	_refresh_hub()
	_show_bag()

func _on_bag_dismantle(gid: String) -> void:
	var res := gs.dismantle_gear(gid)
	if bool(res.get("ok", false)):
		_hub_log_add("拆解了%s：获得皮料 %s ×%d、内衬材料 %s ×%d。" % [String(res["name"]), gs.material_name(String(res["mat0"])), int(res["q0"]), gs.material_name(String(res["mat1"])), int(res["q1"])])
	else:
		_hub_log_add("拆解失败：" + String(res.get("msg", "")))
	_refresh_hub()
	_show_bag()

func _on_craft() -> void:
	var g := gs.craft_glove(String(craft_sel["pattern"]), String(craft_sel["outer"]), String(craft_sel["lining"]))
	if g.is_empty():
		_hub_log_add("打造失败：材料或手工费不足。")
	else:
		_hub_log_add("工坊打造：%s 已存入背包（手工费 ¥200）。%s" % [String(g["name"]), String(g["desc"])])
		for note in gs.last_dex_notes:
			_hub_log_add(String(note))
		_check_achievements()
	_refresh_hub()
	_show_bag()

func _on_buy(gid: String) -> void:
	if not _shop_ap_charged:
		gs.s["ap"] = int(gs.s["ap"]) - 2
		_shop_ap_charged = true
	var res := gs.buy_gear(gid)
	if bool(res.get("ok", false)):
		_hub_log_add("购入并装备了新装备。")
		for note in gs.last_dex_notes:
			_hub_log_add(String(note))
		_check_achievements()
	_refresh_hub()
	_show_shop()

func _match_candidates() -> Array:
	var my := gs.my_rank()
	var out: Array = []
	for off in [1, 3, 6]:
		var r: int = my - int(off)
		if r < 1:
			r = my + off # 名次到顶时改为向下挑战（登顶后仍有正式赛/约战可打，配合卫冕循环）
		r = clampi(r, 1, gs.s["ranking"].size())
		var key := String(gs.s["ranking"][r - 1])
		if key != "me" and key not in out:
			out.append(key)
	if my <= 4 and String(gs.s["ranking"][0]) != "me":
		out.append(String(gs.s["ranking"][0]))
	return out

func _show_matches() -> void:
	_clear_sub()
	# 卫冕挑战卡（web G9）：有待应战挑战时在比赛屏顶部出金色卡片，0 AP、正式赛全结算
	var ch: Dictionary = gs.s.get("defense_challenge", {})
	if not ch.is_empty():
		var card := _mk_label("👑 卫冕战挑战！%s（第 %d 名）向你发起正式挑战：「%s」\n卫冕战：0 AP · 计战绩/排名/影响力 · 奖金按正式赛口径，赢下计 1 次卫冕成功（每周至多 1 场）" % [
			String(ch.get("name", "")), int(ch.get("rank", 0)), gs.defense_line(String(ch.get("key", "")))], 16, Color(1.0, 0.84, 0.35))
		card.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		sub_box.add_child(card)
		var drow := HBoxContainer.new()
		for mode in [["manual", "手动应战"], ["auto", "自动观看"], ["sim", "模拟跳过"]]:
			drow.add_child(_mk_button(mode[1], _on_start_defense.bind(mode[0])))
		sub_box.add_child(drow)
	if not gs.is_match_day():
		sub_box.add_child(_mk_label("正式赛每周第 7 天开打——还有 %d 天。平时可以去「约战」切磋练手（2 AP，不计排名奖金）。" % gs.days_to_match(), 17))
		sub_box.add_child(_mk_button("返回", _show_sub_main))
		return
	if not gs.can_fight_official():
		sub_box.add_child(_mk_label("今天的正式赛已经打完了。好好休息，下周再来。", 17))
		sub_box.add_child(_mk_button("返回", _show_sub_main))
		return
	sub_box.add_child(_mk_label("比赛日！选择对手与模式（正式赛：影响排名/奖金/影响力，每个比赛日 1 场）", 17))
	for key in _match_candidates():
		var e := gs.roster_entry(key)
		var st: Dictionary = DataDB.foe_styles().get(String(e.get("style", "balanced")), {})
		sub_box.add_child(_mk_label("第 %d 名 · %s（%s）" % [gs.rank_of(key), String(e["name"]), String(st.get("name", ""))], 16))
		sub_box.add_child(_prediction_bar(_predict(key)))
		var row := HBoxContainer.new()
		for mode in [["manual", "手动"], ["auto", "自动观看"], ["sim", "模拟跳过"]]:
			row.add_child(_mk_button(mode[1], _on_start_battle.bind(key, mode[0], false)))
		sub_box.add_child(row)
	sub_box.add_child(_mk_button("返回", _show_sub_main))

## 赛前胜负预测（参考 Bloom Blow 赛前 5 段比例条）：用真实战斗引擎把当前双方模拟 N 场
func _predict(key: String, n: int = 40) -> Dictionary:
	var out := {"ko_w": 0, "dec_w": 0, "dec_l": 0, "ko_l": 0}
	var e := gs.roster_entry(key)
	var style := String(e.get("style", "balanced"))
	for i in n:
		var eng := BattleEngine.new()
		eng.rng.seed = 9100 + i * 13 + gs.rank_of(key)
		var fb := BattleEngine.make_fighter(String(e.get("name", key)), false, gs.foe_attrs(key), {"style_key": style})
		fb["tactic"] = FOE_TACTIC.get(style, "balanced")
		eng.start(_fighter_for_player(), fb)
		var r := eng.simulate_all()
		var dec := String(r.get("how", "")) == "点数判定"
		if bool(r.get("winner_is_a", false)):
			out["dec_w" if dec else "ko_w"] += 1
		else:
			out["dec_l" if dec else "ko_l"] += 1
	for k in out.keys():
		out[k] = float(out[k]) / float(n)
	return out

func _prediction_bar(p: Dictionary) -> Control:
	var box := VBoxContainer.new()
	var win := float(p["ko_w"]) + float(p["dec_w"])
	box.add_child(_mk_label("胜算 %d%%　（KO 胜 %d%% · 判定胜 %d%% · 判定负 %d%% · KO 负 %d%%）" % [
		roundi(win * 100), roundi(float(p["ko_w"]) * 100), roundi(float(p["dec_w"]) * 100),
		roundi(float(p["dec_l"]) * 100), roundi(float(p["ko_l"]) * 100)], 14, Color(0.9, 0.88, 1.0)))
	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 0)
	bar.custom_minimum_size = Vector2(0, 12)
	var cols := {"ko_w": Color(1.0, 0.45, 0.65), "dec_w": Color(1.0, 0.75, 0.85), "dec_l": Color(0.62, 0.66, 0.85), "ko_l": Color(0.35, 0.38, 0.6)}
	for k in ["ko_w", "dec_w", "dec_l", "ko_l"]:
		if float(p[k]) <= 0.0:
			continue
		var c := ColorRect.new()
		c.color = cols[k]
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		c.size_flags_stretch_ratio = float(p[k])
		c.custom_minimum_size = Vector2(2, 12)
		bar.add_child(c)
	box.add_child(bar)
	return box

func _show_spar() -> void:
	_clear_sub()
	sub_box.add_child(_mk_label("约战：指名切磋（2 AP，不计排名奖金，拳种经验成长）", 17))
	for key in _match_candidates():
		var e := gs.roster_entry(key)
		sub_box.add_child(_mk_button("约战 %s（第 %d 名）" % [String(e["name"]), gs.rank_of(key)], _on_start_battle.bind(key, "manual", true)))
	sub_box.add_child(_mk_button("返回", _show_sub_main))

func _show_ranking() -> void:
	_clear_sub()
	sub_box.add_child(_mk_label("国内排名", 17))
	var txt := ""
	var ranking: Array = gs.s["ranking"]
	for i in mini(15, ranking.size()):
		var key := String(ranking[i])
		var nm := "你" if key == "me" else String(gs.roster_entry(key).get("name", key))
		txt += "第 %d 名 · %s\n" % [i + 1, nm]
	txt += "……（你的名次：第 %d）" % gs.my_rank()
	sub_box.add_child(_mk_label(txt, 15))
	sub_box.add_child(_mk_button("返回", _show_sub_main))

func _on_sleep() -> void:
	var sleep_notes := gs.sleep()
	_hub_log_add("—— 第 %d 天 ——" % int(gs.s["day"]))
	for note in sleep_notes:
		_hub_log_add(String(note))
	_log_defense_check() # 睡觉跨日补检卫冕挑战（web 三处补检之一）
	_refresh_hub()
	_show_sub_main()
	_maybe_story_or_daily()

# ================= 剧情 / 日常 / 成就 =================

func _maybe_story_or_daily() -> void:
	var sev: Dictionary = DataDB.story_events()
	for key in sev.keys():
		if key in gs.s["seen_story"]:
			continue
		var need_stage := 0
		if key.begins_with("ev_stage"):
			need_stage = int(key.trim_prefix("ev_stage"))
		if need_stage > 0 and int(gs.s["stage"]) > need_stage:
			gs.s["seen_story"] = Array(gs.s["seen_story"]) + [key]
			_show_event_modal(String(sev[key].get("title", "剧情")), sev[key])
			return
	if rng.randf() < 0.30:
		var dev: Dictionary = DataDB.daily_events()
		var keys := dev.keys()
		if not keys.is_empty():
			var key := String(keys[rng.randi_range(0, keys.size() - 1)])
			_show_event_modal(String(dev[key].get("title", "日常")), dev[key])

func _show_event_modal(title: String, ev: Dictionary) -> void:
	pro_timer.stop()
	pro_score.hide()
	pro_bar.hide()
	pro_fx.hide()
	modal_title.text = title
	var txt := ""
	var first_char := String(ev.get("char", ""))
	for p in ev.get("pages", []):
		var w := String(p.get("w", ""))
		if first_char == "" and SPEAKERS.has(w) and w != "me":
			first_char = w
		var who := String(SPEAKERS.get(w, {}).get("name", w))
		if w == "narr" or w == "":
			txt += "[color=#c9bde6]%s[/color]\n\n" % String(p.get("t", ""))
		else:
			txt += "[b][color=#ffc2dd]%s[/color][/b]　%s\n\n" % [who, String(p.get("t", ""))]
	modal_text.text = txt
	_set_modal_portrait(first_char)
	for c in modal_choices.get_children():
		c.queue_free()
	var choices: Array = ev.get("choices", [])
	if choices.is_empty():
		modal_choices.add_child(_mk_button("继续", func() -> void: modal.hide()))
	else:
		for ch in choices:
			modal_choices.add_child(_mk_button(String(ch.get("text", "……")), _on_event_choice.bind(ch)))
	modal.show()

func _on_event_choice(ch: Dictionary) -> void:
	var fx: Dictionary = ch.get("fx", {})
	if fx.has("mind"):
		gs.s["mind"] = clampi(int(gs.s["mind"]) + int(fx["mind"]), 0, 100)
	if fx.has("attr"):
		gs.gain_attr(String(fx["attr"]), float(fx.get("attrN", 1)))
	if fx.has("aff"):
		for k in fx["aff"].keys():
			gs.s["aff"][k] = int(gs.s["aff"].get(k, 0)) + int(fx["aff"][k])
	modal_text.text = String(ch.get("result", ""))
	for c in modal_choices.get_children():
		c.queue_free()
	modal_choices.add_child(_mk_button("继续", func() -> void: modal.hide()))
	_refresh_hub()

func _check_achievements() -> void:
	for a in gs.check_achievements():
		_hub_log_add("成就达成：%s（%s）" % [String(a["name"]), String(a["desc"])])

func _log_defense_check() -> void:
	for note in gs.maybe_defense_challenge():
		_hub_log_add(String(note))

# ================= 序章（web Phase 7 人工抄录：测力机 → 梢姐搭话 → 拳馆试训 → 开启生涯） =================
# 文案与数值照 web story-engine.js 原文：测力机分数 = round(500 + 条值×4.3 ± 15)、3 拳取最高；
# 搭话选项好感 senior +6 / +4 且心态 +5；试训三回合正解序 [格挡, 侧闪, 打进去]，好评（≥2 对）好感 +6、否则 +3。

func _pro_spar_rounds() -> Array:
	return [
		{"sit": "第一回合：梢姐压上来了，一记刺拳点向你的面门——", "opts": ["迎上去对攻", "先格挡，再看", "脚下绕开"], "best": 1,
			"ok": "你稳稳架住了这一拳。她眼睛一亮：「哦？下盘很稳。」", "ng": "头盔被轻轻敲了一下。「急什么？先活下来，再谈进攻。」"},
		{"sit": "第二回合：她突然沉下肩，一记直拳奔着你胸口来——", "opts": ["迎上去对攻", "抱架硬挡", "侧身闪开"], "best": 2,
			"ok": "你侧身让过，拳风擦着耳朵过去。她笑了：「反应不错。」", "ng": "你闷哼一声退了半步。「直拳要躲，别拿身体接。」"},
		{"sit": "第三回合：她故意卖了个空当，中门大开——", "opts": ["全力打进去", "谨慎试探", "绕着她打转"], "best": 0,
			"ok": "你一拳打实了她的护具！全场安静了一秒。她大笑：「好！就是这股劲！」", "ng": "你犹豫了，空当转瞬即逝。「机会这东西，犹豫一下就没了。」"},
	]

func _start_prologue() -> void:
	if bool(gs.s.get("prologue_done", false)):
		return
	pro_state = {"step": 0, "page": 0, "punch_tries": 0, "punch_best": 0,
		"punch_val": 0.0, "punch_dir": 1.0, "spar_round": 0, "spar_score": 0,
		"spar_started": false, "spar_rewarded": false}
	_render_prologue()

func _set_modal_portrait(char_id: String) -> void:
	var path := String(SPEAKERS.get(char_id, {}).get("img", ""))
	if path != "" and ResourceLoader.exists(path):
		modal_portrait.texture = load(path)
		modal_portrait.show()
	else:
		modal_portrait.texture = null
		modal_portrait.hide()

func _pro_set(title: String, speaker: String, text: String) -> void:
	modal_title.text = title
	modal_text.text = ("[b][color=#ffc2dd]%s[/color][/b]\n" % speaker if speaker != "" else "") + text
	_set_modal_portrait("senior" if speaker.contains("梢") else "")
	pro_fx.text = ""
	pro_fx.hide()
	if int(pro_state.get("step", 0)) != 1:
		pro_score.hide()
		pro_bar.hide()

func _pro_btns(list: Array) -> void:
	for c in modal_choices.get_children():
		c.queue_free()
	for b in list:
		modal_choices.add_child(_mk_button(String(b["label"]), b["fn"]))
	modal_choices.add_child(_mk_button("跳过序章", _on_pro_skip)) # web storySkip：序章全程可跳

func _render_prologue() -> void:
	if pro_state.is_empty():
		return
	modal.show()
	match int(pro_state["step"]):
		0:
			_pro_set("序章 · 街机厅", "旁白 · 序章 · 一", "放学路上，你钻进了常去的街机厅。角落里那台拳击测力机刚换了新榜单——第一名的分数，高得有点离谱。你摸了摸口袋里剩下的游戏币，反正只是玩玩，站到了测力机前，握紧了拳头。")
			_pro_btns([{"label": "站到测力机前", "fn": func() -> void: pro_state["step"] = 1; _render_prologue()}])
		1:
			_pro_set("序章 · 拳击测力机", "拳击测力机 · 投币 1 枚 · 共 3 拳取最高分", "力量条会来回冲刺。在你感觉最猛的那一瞬间，按下「出拳！」——打完 3 拳，就能继续。")
			pro_score.show()
			pro_bar.show()
			pro_score.text = str(int(pro_state["punch_best"])) if int(pro_state["punch_best"]) > 0 else "---"
			pro_bar.value = float(pro_state["punch_val"])
			pro_fx.text = "已打 %d / 3 拳 · 最高分 %d" % [int(pro_state["punch_tries"]), int(pro_state["punch_best"])]
			pro_fx.show()
			if int(pro_state["punch_tries"]) < 3:
				pro_timer.start()
				_pro_btns([{"label": "出拳！", "fn": _on_pro_punch}])
			else:
				pro_timer.stop()
				_pro_btns([{"label": "收拳，回头看看", "fn": func() -> void: pro_state["step"] = 2; pro_state["page"] = 0; _render_prologue()}])
		2:
			_pro_set("序章 · 藤原梢", "藤原梢 · 退役拳手", "身后有人说话：「……小姑娘。刚才那拳，再打一次，我看看。我叫藤原梢，以前是打职业的。你那一拳，腰、腿、肩是一条线——没人教过你吧？这叫天赋，浪费在游戏机上可惜了。」")
			_pro_btns([
				{"label": "「天赋？我只是经常来玩这个……」", "fn": func() -> void: _pro_choice({"aff": {"senior": 6}}, "她哼了一声：「所以才叫天赋。跟我来。」")},
				{"label": "「姐姐，你也是来打测力机的吗？」", "fn": func() -> void: _pro_choice({"aff": {"senior": 4}, "mind": 5}, "她被逗笑了：「我打过的东西，可比这台机器贵多了。跟我来。」")},
			])
		3:
			_render_pro_spar()
		4:
			var pages := [
				{"speaker": "藤原梢 · 前辈 · 退役拳手", "t": "就这么定了。从今天起，你就是这家拳馆的人了。排名？从最后一名开始——第 50 名。上面 49 个人，都是你要翻过去的山。"},
				{"speaker": "栗原真纪 · 经纪人", "t": "「合同我带来了。从今天起，我是你的经纪人。先说好——我很严格的。」拳馆的灯亮着，沙袋还在轻轻晃。你的职业生涯，就从这一天开始。"},
			]
			var p: Dictionary = pages[int(pro_state["page"])]
			_pro_set("序章 · 新的开始", String(p["speaker"]), String(p["t"]))
			var last: bool = int(pro_state["page"]) >= pages.size() - 1
			_pro_btns([{"label": "开始生涯" if last else "继续", "fn": _on_pro_page_next.bind(pages.size())}])

func _on_pro_page_next(total: int) -> void:
	if pro_state.is_empty():
		return
	if int(pro_state["page"]) < total - 1:
		pro_state["page"] = int(pro_state["page"]) + 1
		_render_prologue()
	else:
		_finish_prologue(false)

func _on_pro_timer() -> void:
	if pro_state.is_empty() or int(pro_state.get("step", -1)) != 1:
		pro_timer.stop()
		return
	var v := float(pro_state["punch_val"]) + float(pro_state["punch_dir"]) * 3.4
	if v >= 100.0:
		v = 100.0
		pro_state["punch_dir"] = -1.0
	if v <= 0.0:
		v = 0.0
		pro_state["punch_dir"] = 1.0
	pro_state["punch_val"] = v
	pro_bar.value = v

func _on_pro_punch() -> void:
	if pro_state.is_empty() or int(pro_state["step"]) != 1 or int(pro_state["punch_tries"]) >= 3:
		return
	var score := int(round(500.0 + float(pro_state["punch_val"]) * 4.3 + float(rng.randi_range(-15, 15))))
	pro_state["punch_tries"] = int(pro_state["punch_tries"]) + 1
	if score > int(pro_state["punch_best"]):
		pro_state["punch_best"] = score
	pro_score.text = str(score)
	var suf := " 还不错，但你总觉得没打满。"
	if score >= 880:
		suf = " 机器轰隆作响，整个街机厅都回头了！"
	elif score >= 780:
		suf = " 围观的人发出一阵惊呼。"
	pro_fx.text = "第 %d 拳：%d 分！%s（已打 %d / 3 拳）" % [int(pro_state["punch_tries"]), score, suf, int(pro_state["punch_tries"])]
	pro_fx.show()
	if int(pro_state["punch_tries"]) >= 3:
		pro_timer.stop()
		_pro_btns([{"label": "收拳，回头看看", "fn": func() -> void: pro_state["step"] = 2; pro_state["page"] = 0; _render_prologue()}])

# web applyStoryFx 的序章用子集：心态（钳 0~100）＋好感（钳 0~100），返回播报文案
func _pro_apply_fx(fx: Dictionary) -> Array:
	var notes: Array = []
	if fx.has("mind"):
		gs.s["mind"] = clampi(int(gs.s["mind"]) + int(fx["mind"]), 0, 100)
		notes.append("心态 +%d" % int(fx["mind"]))
	if fx.has("aff"):
		var chars := DataDB.story_chars()
		for k in fx["aff"].keys():
			gs.s["aff"][k] = clampi(int(gs.s["aff"].get(k, 0)) + int(fx["aff"][k]), 0, 100)
			notes.append("%s好感 +%d" % [String(chars.get(k, {}).get("name", k)), int(fx["aff"][k])])
	return notes

func _pro_choice(fx: Dictionary, result: String) -> void:
	var notes := _pro_apply_fx(fx)
	pro_fx.text = result + ("（" + " · ".join(notes) + "）" if not notes.is_empty() else "")
	pro_fx.show()
	_pro_btns([{"label": "继续", "fn": func() -> void: pro_state["step"] = 3; pro_state["page"] = 0; _render_prologue()}])

func _render_pro_spar() -> void:
	if not bool(pro_state["spar_started"]):
		_pro_set("序章 · 拳馆试训", "藤原梢 · 试训 · 三回合", "「光嘴上说没用。戴上拳套，陪我走三个回合。是骡子是马，台上见。每回合选一个应对，选错了……就挨一下。」")
		_pro_btns([{"label": "戴上拳套，上台", "fn": func() -> void: pro_state["spar_started"] = true; _render_prologue()}])
		return
	var rounds := _pro_spar_rounds()
	if int(pro_state["spar_round"]) >= 3:
		var good: bool = int(pro_state["spar_score"]) >= 2
		_pro_set("序章 · 拳馆试训", "藤原梢 · 试训 · 结束", "三个回合走完，你还站着，眼睛还亮着。她摘下手套，拍了拍你的头盔：「……捡到宝了，我这回是真捡到宝了。」" if good else "三个回合走完，你挨了好几下，却一次都没往后退。她看着你，慢慢笑了：「挨打的姿势不好看。但不肯倒的人，我最喜欢。」")
		if not bool(pro_state["spar_rewarded"]):
			pro_state["spar_rewarded"] = true
			var notes := _pro_apply_fx({"aff": {"senior": 6 if good else 3}})
			pro_fx.text = ("梢姐对你的评价，比你想的还要高。" if good else "她嘴上不饶人，却悄悄把你的名字写上了拳馆的名单。") + ("（" + " · ".join(notes) + "）" if not notes.is_empty() else "")
			pro_fx.show()
		_pro_btns([{"label": "继续", "fn": func() -> void: pro_state["step"] = 4; pro_state["page"] = 0; _render_prologue()}])
		return
	var r: Dictionary = rounds[int(pro_state["spar_round"])]
	_pro_set("序章 · 拳馆试训", "藤原梢 · 试训 · 第 %d 回合" % (int(pro_state["spar_round"]) + 1), String(r["sit"]))
	var btns: Array = []
	var opts: Array = r["opts"]
	for i in opts.size():
		btns.append({"label": String(opts[i]), "fn": _pro_spar_pick.bind(i)})
	_pro_btns(btns)

func _pro_spar_pick(i: int) -> void:
	if pro_state.is_empty() or int(pro_state["step"]) != 3 or not bool(pro_state.get("spar_started", false)):
		return
	var rounds := _pro_spar_rounds()
	if int(pro_state["spar_round"]) >= rounds.size():
		return
	var r: Dictionary = rounds[int(pro_state["spar_round"])]
	var good_pick: bool = i == int(r["best"])
	if good_pick:
		pro_state["spar_score"] = int(pro_state["spar_score"]) + 1
	pro_fx.text = String(r["ok"]) if good_pick else String(r["ng"])
	pro_fx.show()
	_pro_btns([]) # 选后清空选项防连点，反馈停留 1.4 秒自动进下一回合（web 同口径；跳过序章仍在）
	pro_advance.start()

func _on_pro_spar_advance() -> void:
	if pro_state.is_empty() or int(pro_state.get("step", -1)) != 3:
		return
	pro_state["spar_round"] = int(pro_state["spar_round"]) + 1
	_render_prologue()

func _on_pro_skip() -> void:
	if not pro_state.is_empty():
		_finish_prologue(true)

func _finish_prologue(skipped: bool) -> void:
	pro_timer.stop()
	pro_advance.stop()
	pro_state = {}
	gs.s["prologue_done"] = true
	pro_score.hide()
	pro_bar.hide()
	pro_fx.hide()
	modal.hide()
	_check_achievements() # 「命运的测力机」成就判定（跳过序章同样置 prologueDone，web finishPrologue 同口径）
	if skipped:
		_hub_log_add("已跳过序章")
	else:
		_hub_log_add("序章完成，生涯开始！")
		_begin_career(true) # web：序章后排 ev_stage1 主线（练习赛邀请属练习赛子系统，Godot 未移植，见提案 §6 注记）
	_refresh_hub()

# ================= 标题/存档 =================

func _on_new_game() -> void:
	gs = GameState.new()
	_show_hub()
	if not bool(gs.s.get("prologue_done", false)):
		_start_prologue() # 新档先走序章（web enterGame 同口径），走完/跳过后再进中枢
		return
	_begin_career(true)

# 进游戏收尾：卫冕补检＋开场白＋（可选）ev_stage1 主线开场
func _begin_career(show_stage1: bool) -> void:
	_log_defense_check()
	_hub_log_add("新的生涯开始了。你现在是国内第 %d 名，从第一场胜利开始。" % gs.my_rank())
	if show_stage1:
		var sev: Dictionary = DataDB.story_events()
		if sev.has("ev_stage1") and "ev_stage1" not in gs.s["seen_story"]:
			gs.s["seen_story"] = Array(gs.s["seen_story"]) + ["ev_stage1"]
			_show_event_modal(String(sev["ev_stage1"].get("title", "主线")), sev["ev_stage1"])

func _on_load_slot(slot: int) -> void:
	gs = GameState.load_from(slot)
	_show_hub()
	_log_defense_check() # 进游戏补检卫冕挑战（web 三处补检之一）
	_hub_log_add("已读取存档 %d。" % (slot + 1))
	if not bool(gs.s.get("prologue_done", false)):
		_start_prologue() # 序章未走完的档读入后续走序章（老档已由迁移置 true，不受影响）

func _on_save(slot: int) -> void:
	if gs.save_to(slot):
		_hub_log_add("已存档到槽 %d。" % (slot + 1))

# ================= 战斗 =================

func _on_start_defense(mode: String) -> void:
	var ch: Dictionary = gs.s.get("defense_challenge", {})
	if ch.is_empty():
		_hub_log_add("现在没有待应战的卫冕挑战。")
		return
	if gs.my_rank() != 1:
		_log_defense_check()
		_hub_log_add("你已经不是第 1 名了，这份挑战已经作废。")
		_show_matches()
		return
	foe_key = String(ch["key"])
	foe_entry = gs.roster_entry(foe_key)
	battle_mode = mode
	is_spar = false
	is_defense = true
	_start_battle_scene()

func _on_start_battle(key: String, mode: String, spar: bool) -> void:
	is_defense = false
	if spar:
		if int(gs.s["ap"]) < 2:
			_hub_log_add("行动点不足，约战要 2 AP。")
			return
		gs.s["ap"] = int(gs.s["ap"]) - 2
		gs.s["spars"] = int(gs.s.get("spars", 0)) + 1
	elif not gs.can_fight_official():
		# 规则在入口处兜底，不只靠比赛屏隐藏按钮（防止任何入口绕过：每周第 7 天、每天 1 场）
		_hub_log_add("正式赛只在比赛日（每周第 7 天）开打，且每个比赛日 1 场。")
		return
	foe_key = key
	foe_entry = gs.roster_entry(key)
	battle_mode = mode
	is_spar = spar
	_start_battle_scene()

func _fighter_for_player() -> Dictionary:
	var attrs := {}
	var mind := int(gs.s["mind"])
	# 心态修正（web battle.js 口径）：紧张（20~39）全属性 ×0.95；疲劳（<20）体力消耗 ×1.1
	var mind_mul := 0.95 if mind >= 20 and mind < 40 else 1.0
	for k in GameState.ATTR_KEYS:
		attrs[k] = float(gs.s["attrs"][k]) * (1.0 - float(int(gs.s["injury"])) * 0.002) * mind_mul
	var mods := gs.gear_battle_mods()
	var stam_mul := float(mods["stam_mul"]) * (1.1 if mind < 20 else 1.0)
	return BattleEngine.make_fighter("你", true, attrs, {
		"punch_exp": gs.s["punch_exp"], "gear_pct": mods["pct"],
		"gear_dr": mods["dr"], "gear_trauma_mul": mods["trauma_mul"], "gear_stam_mul": stam_mul,
		"style_key": "balanced"})

func _fighter_for_foe() -> Dictionary:
	var style := String(foe_entry.get("style", "balanced"))
	return BattleEngine.make_fighter(String(foe_entry["name"]), false, gs.foe_attrs(foe_key), {"style_key": style})

func _start_battle_scene() -> void:
	modal.hide()
	scr_hub.hide()
	scr_title.hide()
	scr_battle.show()
	battle_over = false
	player_turn = true
	# 上一场残留的倒地 / 震屏补间先停掉（否则回调会落在已释放的角色上）
	for t in _rig_tweens.values():
		if t and t.is_valid():
			t.kill()
	_rig_tweens.clear()
	if _shake_tw and _shake_tw.is_valid():
		_shake_tw.kill()
	scr_battle.position = Vector2.ZERO
	scr_battle.scale = Vector2.ONE
	Engine.time_scale = 1.0
	_count_busy = false
	for n in _count_nodes:
		if is_instance_valid(n):
			n.queue_free()
	_count_nodes.clear()
	_combo_chain = {true: [], false: []}
	if auto_timer:
		auto_timer.paused = false
	rig_foe = null
	foe_portrait = null
	for c in me_anchor.get_children():
		c.queue_free()
	for c in foe_anchor.get_children():
		c.queue_free()
	# 整帧角色（FighterSprite）替换切件骨骼：原点 = 双脚中点。舞台脚线 y≈672（锚点局部 437）
	rig_me = FighterSprite.create_me()
	rig_me.position = Vector2(300, 437) # 绝对 ≈ (450, 672)
	me_anchor.add_child(rig_me)
	rig_me.set_facing(1)
	rig_me.play_anim("idle")
	rig_foe = FighterSprite.create_foe(foe_key)
	rig_foe.position = Vector2(205, 437) # 绝对 ≈ (965, 672)
	foe_anchor.add_child(rig_foe)
	rig_foe.set_facing(-1)
	rig_foe.play_anim("idle")
	engine = BattleEngine.new()
	var fa := _fighter_for_player()
	var fb := _fighter_for_foe()
	fb["tactic"] = FOE_TACTIC.get(String(foe_entry.get("style", "balanced")), "balanced")
	engine.start(fa, fb)
	b_log.text = ("【卫冕战】冠军挑战——她是冲着你的冠军来的。\n" if is_defense else "") + ("比赛开始！你 对阵 %s。\n" % String(foe_entry["name"]))
	_refresh_battle_ui()
	_setup_tactic_buttons()
	if battle_mode != "sim":
		_sfx("bell_start", -3.0)
	if battle_mode == "sim":
		_run_sim()
	elif battle_mode == "auto":
		_setup_auto_controls()
		auto_timer.start()
	else:
		_setup_manual_controls()

func _bar_set(p: ProgressBar, v: float, maxv: float) -> void:
	p.max_value = maxv
	p.value = v

func _refresh_battle_ui() -> void:
	if engine == null:
		return
	_bar_set(b_hp_a, float(engine.a["hp"]), float(engine.a["max_hp"]))
	_bar_set(b_hp_b, float(engine.b["hp"]), float(engine.b["max_hp"]))
	b_st_a.value = float(engine.a["stamina"])
	b_st_b.value = float(engine.b["stamina"])
	b_tr_a.value = float(engine.a["trauma"])
	b_tr_b.value = float(engine.b["trauma"])
	b_round.text = "第 %d 回合" % mini(engine.round_no, BattleEngine.ROUNDS)
	b_name_a.text = "你 · HP %.0f · 重创 %.0f" % [float(engine.a["hp"]), float(engine.a["trauma"])]
	b_name_b.text = "%s · HP %.0f · 重创 %.0f" % [String(foe_entry["name"]), float(engine.b["hp"]), float(engine.b["trauma"])]

func _setup_tactic_buttons() -> void:
	for c in b_tactics.get_children():
		c.queue_free()
	b_tactics.add_child(_mk_label("本回合战术：", 15))
	for t in [["attack", "强攻压制"], ["counter", "稳守反击"], ["points", "游走打点"], ["balanced", "均衡"]]:
		b_tactics.add_child(_mk_button(t[1], _on_tactic.bind(t[0])))
	var dmg_btn := _mk_button("伤害数字：%s" % ("开" if show_damage_numbers else "关"), func() -> void: pass)
	dmg_btn.pressed.connect(func() -> void:
		show_damage_numbers = not show_damage_numbers
		dmg_btn.text = "伤害数字：%s" % ("开" if show_damage_numbers else "关"))
	b_tactics.add_child(dmg_btn)

func _on_tactic(t: String) -> void:
	if engine:
		engine.a["tactic"] = t

func _setup_manual_controls() -> void:
	for c in b_controls.get_children():
		c.queue_free()
	if battle_over:
		b_controls.add_child(_mk_button("返回中枢", _on_battle_exit))
		return
	if player_turn:
		for k in ["jab", "straight", "hook", "upper", "body"]:
			b_controls.add_child(_mk_button(PUNCH_NAME[k], _on_player_punch.bind(k)))
	else:
		b_controls.add_child(_mk_button("格挡", _on_player_defend.bind("block")))
		b_controls.add_child(_mk_button("闪避（反击窗口）", _on_player_defend.bind("dodge")))
		b_controls.add_child(_mk_button("硬扛", _on_player_defend.bind("none")))

func _setup_auto_controls() -> void:
	for c in b_controls.get_children():
		c.queue_free()
	b_controls.add_child(_mk_label("自动观看中……（战术可在上方切换）", 15))

func _battle_log(text: String) -> void:
	b_log.append_text(text + "\n")
	b_log.scroll_to_line(b_log.get_line_count())

## 受击反应选择（参考作：轻拳 6 帧小顿、打脸后仰、打腹前屈、勾拳侧甩、重击 60 帧踉跄）。
## 只决定表现，不碰引擎数值。heavy = 单发净伤害 ≥ 守方最大 HP 的 9%，或打出击倒。
func _hit_reaction(ev: Dictionary, def: Dictionary) -> String:
	var punch := String(ev["punch"])
	var heavy := float(ev["dmg"]) >= float(def["max_hp"]) * 0.09 or bool(ev.get("knockdown", false))
	if heavy and punch != "jab":
		return "stagger"
	match punch:
		"jab":
			return "hit_light"
		"body":
			return "hit_body"
		"hook":
			return "hit_side"
		_:
			return "hit_face"

## 打击反馈分 4 档（2026-11-21 参考 Bloom Blow 试玩：平时克制、大事件才猛，满屏一直震会削弱大事件）
## light = 刺拳/被格挡；normal = 普通命中；heavy = 重击踉跄/反击；big = 击倒/KO
const TIER_HITSTOP := {"light": 0.03, "normal": 0.06, "heavy": 0.09, "big": 0.14}
# 震屏只当点缀（用户 2026-11-21：之前太严重，打击感不该靠震屏）——打击感主要来自顿帧、受击姿势、闪白和音效
const TIER_SHAKE := {"light": 0.0, "normal": 0.0, "heavy": 1.5, "big": 3.0}
const TIER_POWER := {"light": 0.15, "normal": 0.3, "heavy": 0.65, "big": 1.0}
var _shake_tw: Tween
var show_damage_numbers := false # 伤害数字默认隐藏（战斗里可切换）
var _combo_chain := {true: [], false: []} # 攻方 is_a -> 最近连中的拳种

func _hit_tier(ev: Dictionary, react: String) -> String:
	if bool(ev.get("knockdown", false)) or bool(ev.get("ko", false)):
		return "big"
	if react == "stagger" or bool(ev.get("counter", false)):
		return "heavy"
	if react == "block" or react == "hit_light":
		return "light"
	return "normal"

func _play_exchange_visuals(ev: Dictionary) -> void:
	var att_rig: FighterSprite = rig_me if bool(ev["att_is_a"]) else rig_foe
	var def_rig: FighterSprite = rig_foe if bool(ev["att_is_a"]) else rig_me
	var def: Dictionary = engine.b if bool(ev["att_is_a"]) else engine.a
	if att_rig:
		att_rig.play_anim(PUNCH_ANIM.get(String(ev["punch"]), "straight"))
	var kind := String(ev["kind"])
	_update_combo_label(ev, att_rig)
	if kind == "hit" or kind == "block":
		var react := _hit_reaction(ev, def) if kind == "hit" else "block"
		if bool(ev.get("knockdown", false)) or bool(ev.get("ko", false)):
			react = "stagger"
		if def_rig:
			def_rig.play_anim(react)
		elif not bool(ev["att_is_a"]) and foe_portrait:
			_flash(foe_portrait)
		var tier := _hit_tier(ev, react)
		_hitstop([att_rig, def_rig], float(TIER_HITSTOP[tier]))
		_screen_shake(float(TIER_SHAKE[tier]))
		if def_rig:
			var power := float(TIER_POWER[tier])
			var at := _impact_point(def_rig, String(ev["punch"]), bool(ev["att_is_a"]))
			_impact_fx(at, power, kind == "block", tier == "heavy" or tier == "big")
			_flash(def_rig, 1.4 + power if kind == "hit" else 1.2)
			if show_damage_numbers:
				_damage_pop(at, float(ev["dmg"]), kind == "block", bool(ev.get("counter", false)))
			if tier == "big":
				_camera_punch(at, 1.06 if not bool(ev.get("ko", false)) else 1.1)
		if bool(ev.get("ko", false)):
			_slowmo(0.3, 0.5)
		_sfx(String(SFX_FOR_REACT.get(react, "hit_light")), -2.0 if tier == "light" else 0.0)
	elif kind == "dodge":
		if def_rig:
			def_rig.play_anim("dodge")
		_sfx("whoosh", -4.0, 1.1)
	elif kind == "miss":
		_sfx("whoosh", -6.0)
	if bool(ev.get("ko", false)):
		_sfx("knockdown")
		_sfx("crowd", -3.0)
		if def_rig:
			_knockdown_visual(def_rig, true, int(ev.get("count", 10)))
	elif bool(ev.get("knockdown", false)):
		_sfx("knockdown", -2.0)
		_sfx("crowd", -8.0)
		if def_rig:
			_knockdown_visual(def_rig, false, int(ev.get("count", -1)))
	if ev.has("new_round"):
		# 回合结束「铛-铛-铛」，间隔一会儿再敲下一回合的开场单响
		_sfx("bell_end", -3.0)
		get_tree().create_timer(1.6).timeout.connect(func() -> void:
			if not battle_over:
				_sfx("bell_start", -4.0))

## 顿帧：命中瞬间双方动画同时停住一小下，再继续（不影响逻辑与计时器）。
func _hitstop(rigs: Array, secs: float) -> void:
	var paused: Array = []
	for r in rigs:
		if r and is_instance_valid(r) and r.player:
			r.player.speed_scale = 0.0
			paused.append(r)
	if paused.is_empty():
		return
	get_tree().create_timer(secs, true, false, true).timeout.connect(func() -> void:
		for r in paused:
			if is_instance_valid(r) and r.player:
				r.player.speed_scale = 1.0)

## 震屏：整个比赛画面按衰减抖动，幅度随打击档位。
func _screen_shake(amp: float) -> void:
	if amp <= 0.0 or scr_battle == null:
		return
	if _shake_tw and _shake_tw.is_valid():
		_shake_tw.kill()
	scr_battle.position = Vector2.ZERO
	_shake_tw = create_tween()
	var steps := 6
	for i in steps:
		var k := amp * (1.0 - float(i) / steps)
		_shake_tw.tween_property(scr_battle, "position", Vector2(rng.randf_range(-k, k), rng.randf_range(-k * 0.6, k * 0.6)), 0.025)
	_shake_tw.tween_property(scr_battle, "position", Vector2.ZERO, 0.03)

func _flash(tr: CanvasItem, k: float = 2.0) -> void:
	tr.modulate = Color(k, k * 0.85, k * 0.85)
	var tw := tr.create_tween()
	tw.tween_property(tr, "modulate", Color.WHITE, 0.14)

# ================= 打击特效（2026-11-21）=================
## 命中点：守方脸部或腹部高度、朝攻方一侧（角色原点 = 双脚中点，身高约 440）
func _impact_point(def_rig: Node2D, punch: String, att_is_a: bool) -> Vector2:
	var h := 250.0 if punch == "body" else 345.0
	var toward := -1.0 if att_is_a else 1.0 # 守方在右 → 命中点偏左
	return def_rig.global_position + Vector2(toward * 55.0, -h)

## 冲击光：星形闪光 + 扩散圆环 + 火花，越重越大；格挡时偏蓝、偏小
func _impact_fx(at: Vector2, power: float, blocked: bool, full: bool = true) -> void:
	var col := Color(0.7, 0.85, 1.0) if blocked else Color(1.0, 0.92, 0.55)
	# 普通命中只留约头部大小的小星爆；圆环 + 火花只给重击 / 反击 / 击倒
	var size := (34.0 + 80.0 * power) * (0.6 if blocked else 1.0)
	var star := Polygon2D.new()
	var pts := PackedVector2Array()
	var n := 10
	for i in n * 2:
		var r := size if i % 2 == 0 else size * 0.32
		var ang := TAU * float(i) / float(n * 2) + rng.randf_range(-0.08, 0.08)
		pts.append(Vector2(cos(ang), sin(ang)) * r * rng.randf_range(0.75, 1.15))
	star.polygon = pts
	star.color = Color(1, 1, 1, 0.95)
	star.position = at
	star.rotation = rng.randf() * TAU
	star.scale = Vector2(0.25, 0.25)
	scr_battle.add_child(star)
	var core := Polygon2D.new()
	core.polygon = pts
	core.color = col
	core.scale = Vector2(0.55, 0.55)
	star.add_child(core)
	var tw := star.create_tween().set_parallel(true)
	tw.tween_property(star, "scale", Vector2(1.0, 1.0), 0.06).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(star, "modulate:a", 0.0, 0.16).set_delay(0.05)
	tw.chain().tween_callback(star.queue_free)
	if not full:
		return
	var ring := Line2D.new()
	var rp := PackedVector2Array()
	for i in 33:
		rp.append(Vector2(cos(TAU * i / 32.0), sin(TAU * i / 32.0)) * size * 0.6)
	ring.points = rp
	ring.width = 6.0 + 6.0 * power
	ring.default_color = col
	ring.position = at
	ring.scale = Vector2(0.3, 0.3)
	scr_battle.add_child(ring)
	var tw2 := ring.create_tween().set_parallel(true)
	tw2.tween_property(ring, "scale", Vector2(1.5, 1.5), 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw2.tween_property(ring, "modulate:a", 0.0, 0.22)
	tw2.chain().tween_callback(ring.queue_free)
	var sp := CPUParticles2D.new()
	sp.position = at
	sp.one_shot = true
	sp.explosiveness = 1.0
	sp.amount = int(8 + 18 * power)
	sp.lifetime = 0.35
	sp.spread = 180.0
	sp.initial_velocity_min = 220.0 + 300.0 * power
	sp.initial_velocity_max = 420.0 + 500.0 * power
	sp.gravity = Vector2(0, 900)
	sp.scale_amount_min = 3.0
	sp.scale_amount_max = 6.0 + 4.0 * power
	sp.color = col
	scr_battle.add_child(sp)
	sp.emitting = true
	get_tree().create_timer(0.6).timeout.connect(sp.queue_free)

## 伤害数字：从命中点弹出上飘；反击标金色
func _damage_pop(at: Vector2, dmg: float, blocked: bool, counter: bool) -> void:
	if dmg <= 0.0:
		return
	var l := _mk_label(("反击 " if counter else "") + "%d" % int(round(dmg)), 26 if not blocked else 18,
		Color(1.0, 0.82, 0.3) if counter else (Color(0.75, 0.85, 1.0) if blocked else Color(1.0, 1.0, 1.0)))
	l.add_theme_color_override("font_outline_color", Color(0.25, 0.05, 0.2))
	l.add_theme_constant_override("outline_size", 6)
	l.position = at + Vector2(rng.randf_range(-20, 20), -30)
	l.pivot_offset = Vector2(20, 14)
	l.scale = Vector2(1.6, 1.6)
	scr_battle.add_child(l)
	var tw := l.create_tween().set_parallel(true)
	tw.tween_property(l, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "position:y", l.position.y - 60.0, 0.7).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 0.0, 0.3).set_delay(0.45)
	tw.chain().tween_callback(l.queue_free)

## 连招名标签：攻方连续命中 ≥2 时，头顶飘「刺拳 → 直拳 · 2 连击」（参考 Bloom Blow，成本低、可读性高）
var _combo_labels := {}
func _update_combo_label(ev: Dictionary, att_rig: FighterSprite) -> void:
	var side: bool = bool(ev["att_is_a"])
	var att: Dictionary = engine.a if side else engine.b
	var kind := String(ev["kind"])
	var chain: Array = _combo_chain[side]
	if kind != "hit" and kind != "block":
		chain.clear()
		return
	if int(att.get("combo", 0)) <= 1:
		chain.clear()
	chain.append(String(PUNCH_NAME.get(String(ev["punch"]), "")))
	_combo_chain[side] = chain
	if chain.size() < 2 or att_rig == null:
		return
	var old = _combo_labels.get(side)
	if old != null and is_instance_valid(old):
		old.queue_free()
	var shown: Array = chain.slice(maxi(0, chain.size() - 3))
	var l := _mk_label(" → ".join(shown) + " · %d 连击 " % chain.size(), 18, Color(1, 1, 1))
	var st := _style(Color(0.08, 0.04, 0.14, 0.78))
	st.content_margin_left = 10; st.content_margin_right = 10; st.content_margin_top = 4; st.content_margin_bottom = 4
	l.add_theme_stylebox_override("normal", st)
	scr_battle.add_child(l)
	l.position = att_rig.global_position + Vector2(-110, -500)
	l.modulate.a = 0.0
	_combo_labels[side] = l
	var tw := l.create_tween()
	tw.tween_property(l, "modulate:a", 1.0, 0.1)
	tw.tween_interval(1.0)
	tw.tween_property(l, "modulate:a", 0.0, 0.25)
	tw.tween_callback(l.queue_free)

## 镜头冲击：重击时整屏朝命中点瞬间推近再回弹
var _cam_tw: Tween
func _camera_punch(at: Vector2, zoom: float) -> void:
	if _cam_tw and _cam_tw.is_valid():
		_cam_tw.kill()
	scr_battle.pivot_offset = at
	_cam_tw = create_tween()
	_cam_tw.tween_property(scr_battle, "scale", Vector2(zoom, zoom), 0.05).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	_cam_tw.tween_property(scr_battle, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)

## KO 慢动作：全局时间放慢一小段（计时器按真实时间）
func _slowmo(scale: float, real_secs: float) -> void:
	Engine.time_scale = scale
	get_tree().create_timer(real_secs, true, false, true).timeout.connect(func() -> void: Engine.time_scale = 1.0)

func _knockdown_visual(rig: FighterSprite, stay: bool = false, count: int = -1) -> void:
	# 参考作：先踉跄（stagger 已在播）→ 倒地 → 读秒 → 挣扎起身（KO 则留在地上）。
	# 整帧角色自带 down/getup 动画（有帧序列的 8 人播真实倒地帧），补间在角色节点内部，随节点释放。
	if rig and is_instance_valid(rig):
		rig.knockdown(stay)
		_count_sequence(rig, stay, count)

## 读秒（参考 Bloom Blow：倒地后画面中上方逐个弹出大号数字；数到 10 → KO 标志）
## 读秒期间锁住操作 / 暂停自动观看计时器，起身后恢复。
var _count_busy := false
var _count_nodes: Array = []
## count：引擎给的读秒结果（方案 B：起身时的读数 / KO=10）；-1 = 重创刻度击倒，没有判定数，按倒地动画长度数
func _count_sequence(rig: FighterSprite, ko: bool, count: int = -1) -> void:
	_count_busy = true
	for c in b_controls.get_children():
		if c is Button:
			(c as Button).disabled = true
	if auto_timer and not auto_timer.is_stopped():
		auto_timer.paused = true
	var down_len := 2.0
	if rig.player and rig.player.has_animation("down"):
		down_len = rig.player.get_animation("down").length
	var n := 10 if ko else (count if count > 0 else clampi(int((0.2 + down_len + 0.8) / 0.5), 3, 9))
	var step := 0.32 if ko else 0.5
	# 起身时刻跟读秒对齐：数到 n 时角色正好站起来
	if not ko and rig.has_method("set_getup_delay"):
		rig.set_getup_delay(0.45 + step * float(n) - 0.2)
	var tw := create_tween()
	tw.tween_interval(0.45)
	for i in n:
		tw.tween_callback(_count_pop.bind(i + 1, i + 1 == n and ko))
		tw.tween_interval(step)
	if ko:
		tw.tween_callback(_ko_stamp)
	tw.tween_callback(_count_done)

func _count_pop(num: int, final: bool) -> void:
	var l := _mk_label(str(num), 96 if not final else 120, Color(1.0, 0.86, 0.95) if not final else Color(1.0, 0.45, 0.6))
	l.add_theme_color_override("font_outline_color", Color(0.3, 0.05, 0.25))
	l.add_theme_constant_override("outline_size", 14)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.custom_minimum_size = Vector2(240, 0)
	l.position = Vector2(520, 150)
	l.pivot_offset = Vector2(120, 70)
	l.scale = Vector2(1.8, 1.8)
	scr_battle.add_child(l)
	_count_nodes.append(l)
	var tw := l.create_tween().set_parallel(true)
	tw.tween_property(l, "scale", Vector2.ONE, 0.15).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 0.0, 0.2).set_delay(0.3)
	tw.chain().tween_callback(l.queue_free)
	_sfx("block", -8.0, 0.7)

func _ko_stamp() -> void:
	var holder := Node2D.new()
	holder.position = Vector2(640, 250)
	scr_battle.add_child(holder)
	_count_nodes.append(holder)
	for i in 7: # 墨溅
		var blob := Polygon2D.new()
		var pts := PackedVector2Array()
		var r := rng.randf_range(30, 70)
		for k in 9:
			var a := TAU * k / 9.0
			pts.append(Vector2(cos(a), sin(a)) * r * rng.randf_range(0.6, 1.3))
		blob.polygon = pts
		blob.color = Color(0.55, 0.08, 0.3, 0.85)
		blob.position = Vector2(rng.randf_range(-230, 230), rng.randf_range(-70, 70))
		holder.add_child(blob)
	var l := _mk_label("K.O.", 150, Color(1.0, 0.95, 0.98))
	l.add_theme_color_override("font_outline_color", Color(0.85, 0.2, 0.5))
	l.add_theme_constant_override("outline_size", 22)
	l.position = Vector2(-190, -105)
	holder.add_child(l)
	holder.scale = Vector2(3, 3)
	holder.modulate.a = 0.0
	var tw := holder.create_tween().set_parallel(true)
	tw.tween_property(holder, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(holder, "modulate:a", 1.0, 0.1)
	_screen_shake(3.0)
	_sfx("knockdown", 2.0, 0.8)
	_sfx("crowd", 0.0)

func _count_done() -> void:
	_count_busy = false
	if battle_over:
		return
	if battle_mode == "manual":
		_setup_manual_controls()
	if auto_timer:
		auto_timer.paused = false

func _after_exchange(ev: Dictionary) -> void:
	_battle_log(String(ev["text"]))
	_play_exchange_visuals(ev)
	_refresh_battle_ui()
	if engine.finished:
		_on_battle_finished()
		return
	if ev.has("new_round"):
		_battle_log("—— 第 %d 回合 ——" % int(ev["new_round"]))
	player_turn = not player_turn
	if battle_mode == "manual":
		_setup_manual_controls()
		if _count_busy: # 读秒中：按钮先锁住，读秒结束 _count_done 重建
			for c in b_controls.get_children():
				if c is Button:
					(c as Button).disabled = true

func _on_player_punch(punch: String) -> void:
	if battle_over or not player_turn or _count_busy:
		return
	var ev := engine.do_exchange(true, punch)
	_after_exchange(ev)

func _on_player_defend(action: String) -> void:
	if battle_over or player_turn or _count_busy:
		return
	var punch := engine.ai_choose_punch(engine.b, engine.a)
	var ev := engine.do_exchange(false, punch, action)
	_after_exchange(ev)

func _on_auto_tick() -> void:
	if battle_over or engine == null or engine.finished:
		auto_timer.stop()
		return
	if player_turn:
		var punch := engine.ai_choose_punch(engine.a, engine.b)
		_after_exchange(engine.do_exchange(true, punch))
	else:
		var punch := engine.ai_choose_punch(engine.b, engine.a)
		var def := "block" if rng.randf() < 0.3 else ("dodge" if rng.randf() < 0.18 else "none")
		_after_exchange(engine.do_exchange(false, punch, def))

func _run_sim() -> void:
	for c in b_controls.get_children():
		c.queue_free()
	var guard := 0
	while not engine.finished and guard < 500:
		guard += 1
		if player_turn:
			engine.do_exchange(true, engine.ai_choose_punch(engine.a, engine.b))
		else:
			engine.do_exchange(false, engine.ai_choose_punch(engine.b, engine.a), "block" if rng.randf() < 0.3 else "none")
		player_turn = not player_turn
	_battle_log("模拟跳过完成：%s 获胜（%s）。比分 %.0f : %.0f，击倒 %d : %d。" % [
		"你" if bool(engine.result["winner_is_a"]) else String(foe_entry["name"]),
		String(engine.result["how"]), float(engine.result["a_score"]), float(engine.result["b_score"]),
		int(engine.result["b_kd"]), int(engine.result["a_kd"])])
	_refresh_battle_ui()
	_on_battle_finished()

func _on_battle_finished() -> void:
	battle_over = true
	auto_timer.stop()
	var win := bool(engine.result["winner_is_a"])
	_battle_log("比赛结束：%s 以 %s 获胜！" % ["你" if win else String(foe_entry["name"]), String(engine.result["how"])])
	if battle_mode != "sim":
		_sfx("bell_end", -2.0)
		if win:
			_sfx("crowd", -4.0)
	if win and rig_me:
		rig_me.play_anim("victory")
	if is_spar:
		for k in ["jab", "straight", "hook", "upper", "body"]:
			gs.gain_punch_exp(k, 8)
		if foe_key == "opp_counter": # 宿敌约战计数（web sparRival：与沈墨凛的约战）
			gs.s["spar_rival"] = int(gs.s["spar_rival"]) + 1
		_hub_pending_result = "约战结束（%s）。全拳种经验 +8。" % ("胜" if win else "负")
		_check_achievements()
	else:
		# 累计 KO 胜场（web koWins：正式赛获胜且对手 HP 归零才计，纯计数不参与数值逻辑）
		if win and float(engine.b["hp"]) <= 0.0:
			gs.s["ko_wins"] = int(gs.s["ko_wins"]) + 1
		var res := gs.settle_match(foe_key, win, is_defense, not win and float(engine.a["hp"]) <= 0.0)
		_hub_pending_result = "正式赛%s！奖金 ¥%d。%s" % ["胜" if win else "负", int(res["prize"]), String(res["stage_note"])]
		if is_defense:
			_hub_pending_result += "卫冕战：%s（累计卫冕 %d 次）。" % ["卫冕成功" if win else "卫冕失败，冠军易主", int(gs.s["defenses"])]
		_check_achievements()
		# 正式赛结算后补检卫冕挑战（web 三处补检之一）；播报攒到回中枢时呈现
		for note in gs.maybe_defense_challenge():
			_hub_pending_result += "\n" + String(note)
	is_defense = false
	if battle_mode != "sim":
		_setup_manual_controls()
	else:
		b_controls.add_child(_mk_button("返回中枢", _on_battle_exit))

func _on_battle_exit() -> void:
	Engine.time_scale = 1.0
	scr_battle.scale = Vector2.ONE
	_show_hub()
	if _hub_pending_result != "":
		_hub_log_add(_hub_pending_result)
		_hub_pending_result = ""
	_refresh_hub()
	_show_sub_main()
	_maybe_story_or_daily()
