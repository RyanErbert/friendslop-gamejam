extends Node3D

@export var cameraRay : RayCast3D
@export var camera : Camera3D

var paint:=1
# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	if cameraRay.is_colliding():
		paint=2


# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta: float) -> void:
	pass
