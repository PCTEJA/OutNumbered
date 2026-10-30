import bpy, math, json, struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=12
scene.world.color=(.3,.3,.3)
for variant,x in [('c01',-.65),('c01f',.65)]:
 path=ROOT/f'public/characters/{variant}-animated.glb'
 data=path.read_bytes(); length=struct.unpack_from('<I',data,12)[0]; doc=json.loads(data[20:20+length])
 print('GLB AUDIT',variant,[(a['name'],len(a['channels'])) for a in doc.get('animations',[])], 'skins',len(doc.get('skins',[])))
 before=set(bpy.context.scene.objects)
 old_actions=set(bpy.data.actions)
 bpy.ops.import_scene.gltf(filepath=str(path))
 added=set(bpy.context.scene.objects)-before
 rig=next(o for o in added if o.type=='ARMATURE')
 if rig.animation_data:
  for track in rig.animation_data.nla_tracks: track.mute=True
  act=next(a for a in set(bpy.data.actions)-old_actions if a.name.startswith('Walk'))
  rig.animation_data.action=act
 for o in added:
  if o.parent is None: o.location.x+=x
scene.frame_set(7)
for loc,power in [((2,-3,4),500),((-3,-1,3),350)]:
 bpy.ops.object.light_add(type='AREA',location=loc); bpy.context.object.data.energy=power; bpy.context.object.data.size=4
bpy.ops.mesh.primitive_plane_add(size=200); bpy.context.object.location.z=-.01
mat=bpy.data.materials.new('Floor'); mat.diffuse_color=(.15,.18,.2,1); bpy.context.object.data.materials.append(mat)
bpy.ops.object.camera_add(location=(2,-5,2.3)); cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.95))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=3.2; scene.camera=cam
scene.render.resolution_x=1100; scene.render.resolution_y=850; scene.render.resolution_percentage=100
scene.render.filepath=str(ROOT/'docs/animation/rig-review.png'); bpy.ops.render.render(write_still=True)
