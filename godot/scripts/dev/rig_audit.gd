extends Node2D
## 骨骼角色撕裂审查：每个角色 × 每个动作的「最大变形」时刻，亮色底拼图（洞/撕裂一眼可见）。
## 用法：godot --path . res://scenes/dev/rig_audit.tscn -- --out=<dir> [--only=me]

const POSES := [["idle", 0.0], ["jab", 0.06], ["straight", 0.125], ["hook", 0.27], ["upper", 0.23], ["body", 0.35],
	["block", 0.1], ["dodge", 0.14], ["hit_face", 0.05], ["hit_body", 0.05], ["hit_side", 0.05], ["stagger", 0.3]]
const CELL := Vector2i(300, 400)

func _ready() -> void:
	var out_dir := "user://rig_audit"
	var only := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="): out_dir = a.trim_prefix("--out=")
		if a.begins_with("--only="): only = a.trim_prefix("--only=")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(out_dir))
	get_window().size = Vector2i(CELL.x * 6, CELL.y * 2)
	RenderingServer.set_default_clear_color(Color(0.1, 0.95, 0.4))
	for id in RigFactory.rig_ids():
		if only != "" and id != only:
			continue
		var rigs: Array = []
		for i in POSES.size():
			var r := RigFactory.build_rig(id)
			add_child(r)
			rigs.append(r)
		await get_tree().process_frame
		for i in POSES.size():
			var r: FighterRig = rigs[i]
			# 按纹理高度缩放进格子
			var tex_h := 1004.0
			for c in r.get_children():
				if c is Polygon2D and c.texture:
					tex_h = float(c.texture.get_height())
					break
			var sc := (CELL.y - 20.0) / tex_h
			r.scale = Vector2(sc, sc)
			r.position = Vector2((i % 6) * CELL.x + 10, (i / 6) * CELL.y + 10)
			r.seek_anim(POSES[i][0], float(POSES[i][1]))
		await RenderingServer.frame_post_draw
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(ProjectSettings.globalize_path("%s/audit_%s.png" % [out_dir, id]))
		print("audit ", id)
		for r in rigs:
			r.queue_free()
		await get_tree().process_frame
	print("RIG_AUDIT_DONE")
	get_tree().quit(0)
