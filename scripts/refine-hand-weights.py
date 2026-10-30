"""Apply the final hand exclusion to already generated editable Blender projects."""
import bpy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for variant in ['c01','c01f']:
 bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'docs/animation/{variant}-rig.blend'))
 for image in bpy.data.images:
  if image.size[0]>1024 or image.size[1]>1024:
   image.scale(1024,1024); image.pack()
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 mesh=next(o for o in bpy.context.scene.objects if o.type=='MESH')
 segments={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in rig.data.bones}
 def distance(p,a,b):
  ab=b-a; t=max(0,min(1,(p-a).dot(ab)/ab.length_squared)); return (p-a-t*ab).length
 for v in mesh.data.vertices:
  x,y,z=v.co
  if not (.60<z<.95 and abs(x)>.30): continue
  side='L' if x>0 else 'R'
  names=['Hips','Spine','Chest','Neck','Head','UpperArm_'+side,'Forearm_'+side,'Hand_'+side]
  near=sorted([(distance(v.co,*segments[n]),n) for n in names])[:4]
  values=[1/(d+.025)**4 for d,n in near]; total=sum(values)
  for group in mesh.vertex_groups: group.remove([v.index])
  for (_,name),w in zip(near,values): mesh.vertex_groups[name].add([v.index],w/total,'REPLACE')
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'docs/animation/{variant}-rig.blend'))
 bpy.ops.export_scene.gltf(filepath=str(ROOT/f'public/characters/{variant}-animated.glb'),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_anim_slide_to_zero=True)
