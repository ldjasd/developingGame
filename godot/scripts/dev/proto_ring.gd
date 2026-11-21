extends Node3D
## 原型用擂台：灯光 + 擂台 + 围绳 + 方块观众。dim=true 时降光（MToon 卡通材质对强光敏感）。

var dim := true


func _ready() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.06, 0.05, 0.12)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.55, 0.5, 0.7)
	e.ambient_light_energy = 0.35 if dim else 0.6
	e.fog_enabled = true
	e.fog_light_color = Color(0.12, 0.08, 0.22)
	e.fog_density = 0.03
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-62, 25, 0)
	sun.light_energy = 0.75 if dim else 1.1
	sun.shadow_enabled = true
	add_child(sun)
	var spot := SpotLight3D.new()
	spot.position = Vector3(0, 5.5, 0)
	spot.rotation_degrees = Vector3(-90, 0, 0)
	spot.spot_range = 9.0
	spot.spot_angle = 38.0
	spot.light_energy = 0.9 if dim else 3.0
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
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in 220:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(5.0, 9.0)
		_box(Vector3(0.35, rng.randf_range(0.7, 1.1), 0.3), Vector3(cos(ang) * rad, -0.2 + rad * 0.12, sin(ang) * rad),
			Color.from_hsv(rng.randf(), 0.35, rng.randf_range(0.25, 0.5)))


func _m(col: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.diffuse_mode = BaseMaterial3D.DIFFUSE_TOON
	return m


func _box(size: Vector3, pos: Vector3, col: Color) -> void:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = _m(col)
	mi.position = pos
	add_child(mi)
