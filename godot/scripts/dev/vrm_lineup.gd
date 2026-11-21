extends Node3D
## 3D 试点：把样例 VRM 排成一排截图，并打印骨骼名。
## godot --path godot res://scenes/dev/vrm_lineup.tscn -- --out=<目录>

const MODELS := ["AvatarSample_D", "AvatarSample_E", "AvatarSample_F", "AvatarSample_G", "Base_Female"]


func _ready() -> void:
	var out := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out = a.substr(6)
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.2, 0.18, 0.3)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.8, 0.8, 0.9)
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, 20, 0)
	add_child(sun)
	for i in MODELS.size():
		var ps: PackedScene = load("res://assets/proto3d/%s.vrm" % MODELS[i])
		var inst: Node3D = ps.instantiate()
		inst.position = Vector3((i - 2) * 0.9, 0, 0)
		add_child(inst)
		if i == 0:
			var sk := _find_skeleton(inst)
			if sk:
				var names: PackedStringArray = []
				for b in sk.get_bone_count():
					names.append(sk.get_bone_name(b))
				print("BONES ", sk.get_bone_count(), ": ", ", ".join(names))
			print("ROOT ", inst.get_class(), " rot=", inst.rotation_degrees)
	var cam := Camera3D.new()
	cam.position = Vector3(0, 1.0, 4.2)
	cam.fov = 45
	add_child(cam)
	cam.look_at(Vector3(0, 0.85, 0))
	cam.current = true
	for _i in 10:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	if out != "":
		DirAccess.make_dir_recursive_absolute(out)
		get_viewport().get_texture().get_image().save_png(out.path_join("lineup.png"))
	print("LINEUP_DONE")
	get_tree().quit()


func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _find_skeleton(c)
		if s:
			return s
	return null
