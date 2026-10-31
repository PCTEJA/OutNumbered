"""Rebuild optimized GLBs, shared humanoid rig and baked clips in Blender 5.x.
Run: blender -b --python scripts/build-character-rigs.py
Coordinates here are Blender Z-up, facing -Y; glTF exporter converts to Y-up.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'public/characters'
OUT.mkdir(parents=True, exist_ok=True)
report = []
for variant, filename in [('c01','c01-varsity'), ('c01f','c01f-varsity')]:
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/f'docs/art-direction/v2fun/{variant}/{filename}.glb'))
 for image in bpy.data.images:
  if image.size[0]>1024 or image.size[1]>1024:
   image.scale(1024,1024); image.pack()
 mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
 bpy.context.view_layer.objects.active=mesh; mesh.select_set(True)
 bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
 low=min(v.co.z for v in mesh.data.vertices)
 for v in mesh.data.vertices: v.co.z-=low
 # The imported UV islands have duplicate boundary vertices. Decimating them
 # independently opens real cracks; weld geometry first, keeping per-loop UVs.
 bm=bmesh.new(); bm.from_mesh(mesh.data)
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
 bm.to_mesh(mesh.data); bm.free()
 dec=mesh.modifiers.new('Game topology','DECIMATE'); dec.ratio=.064
 bpy.ops.object.modifier_apply(modifier=dec.name)
 bm=bmesh.new(); bm.from_mesh(mesh.data)
 boundary_edges=sum(e.is_boundary for e in bm.edges)
 nonmanifold_edges=sum(not e.is_manifold for e in bm.edges)
 bm.free()
 assert nonmanifold_edges == 0, f'{variant}: simplification opened the surface'
 for p in mesh.data.polygons: p.use_smooth=True
 mesh.name=f'Varsity_{variant}'
 bpy.ops.object.armature_add(enter_editmode=True)
 rig=bpy.context.object; rig.name='OutNumberedRig'
 bones=rig.data.edit_bones; bones.remove(bones[0])
 def bone(name, head, tail, parent=None):
  b=bones.new(name); b.head=head; b.tail=tail
  if parent: b.parent=bones[parent]
  return b
 bone('Hips',(0,0,.91),(0,0,1.04))
 bone('Spine',(0,0,1.04),(0,0,1.22),'Hips')
 bone('Chest',(0,0,1.22),(0,0,1.43),'Spine')
 bone('Neck',(0,0,1.43),(0,0,1.54),'Chest')
 bone('Head',(0,0,1.54),(0,0,1.78),'Neck')
 for side, s in [('L',1),('R',-1)]:
  bone('UpperArm_'+side,(s*.19,0,1.40),(s*.30,0,1.15),'Chest')
  bone('Forearm_'+side,(s*.30,0,1.15),(s*.38,0,.87),'UpperArm_'+side)
  bone('Hand_'+side,(s*.38,0,.87),(s*.405,0,.72),'Forearm_'+side)
  bone('Thigh_'+side,(s*.10,0,.91),(s*.105,0,.51),'Hips')
  bone('Shin_'+side,(s*.105,0,.51),(s*.105,0,.12),'Thigh_'+side)
  bone('Foot_'+side,(s*.105,0,.12),(s*.105,-.14,.065),'Shin_'+side)
 bpy.ops.object.mode_set(mode='OBJECT')
 # Region-aware smooth weights prevent cross-binding between nearby hands and hips.
 segments={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in rig.data.bones}
 groups={name:mesh.vertex_groups.new(name=name) for name in segments}
 def distance(p,a,b):
  ab=b-a; t=max(0,min(1,(p-a).dot(ab)/ab.length_squared)); return (p-a-t*ab).length
 for v in mesh.data.vertices:
  x,y,z=v.co; side='L' if x>0 else 'R'
  if z<.60: names=['Thigh_'+side,'Shin_'+side,'Foot_'+side]
  else: names=['Hips','Spine','Chest','Neck','Head','Thigh_'+side,'Shin_'+side,'UpperArm_'+side,'Forearm_'+side,'Hand_'+side]
  if .60<z<.95 and abs(x)>.30: names=[n for n in names if not n.startswith(('Thigh','Shin','Foot'))]
  near=sorted([(distance(v.co,*segments[n]),n) for n in names])[:4]
  weights=[1/(d+.025)**4 for d,n in near]; total=sum(weights)
  for (_,name),w in zip(near,weights): groups[name].add([v.index],w/total,'REPLACE')
 mod=mesh.modifiers.new('Humanoid deformation','ARMATURE'); mod.object=rig; mesh.parent=rig
 scene=bpy.context.scene; scene.render.fps=30
 actions=[]
 for name,frames in [('Idle',60),('Walk',30),('Run',22)]:
  rig.animation_data_create(); action=bpy.data.actions.new(name); rig.animation_data.action=action
  for f in range(frames+1):
   scene.frame_set(f); phase=f/frames*2*math.pi
   for p in rig.pose.bones: p.rotation_mode='XYZ'; p.rotation_euler=(0,0,0); p.location=(0,0,0)
   active=name!='Idle'; running=name=='Run'; amp=.63 if running else .40
   hip_shift=-.035+(.012 if running else .006)*(1-math.cos(phase*2)) if active else -.015+.002*math.sin(phase)
   rig.pose.bones['Hips'].location.z=hip_shift
   rig.pose.bones['Spine'].rotation_euler.x=.10 if running else .025 if active else .006*math.sin(phase)
   rig.pose.bones['Chest'].rotation_euler.y=.045*math.sin(phase) if active else 0
   for side,offset in [('L',0),('R',math.pi)]:
    wave=math.sin(phase+offset)
    # Two-link sagittal IK: straight ground-contact trajectory during stance,
    # rounded clearance arc during swing; counter-rotate the shoe to stay level.
    t=((phase+offset)/(2*math.pi))%1
    stride=.40 if running else .30
    ankle_y=stride*(t/.6-.5) if t<.6 else stride*(.5-(t-.6)/.4)
    ankle_z=.12+(math.sin(math.pi*(t-.6)/.4)*(.14 if running else .09) if t>=.6 else 0)
    if not active: ankle_y=0; ankle_z=.12
    down=.91+hip_shift-ankle_z; d=min(.789,max(.2,math.hypot(down,ankle_y)))
    thigh=math.atan2(ankle_y,down)-math.acos(max(-1,min(1,(.4**2+d*d-.39**2)/(2*.4*d))))
    knee=math.acos(max(-1,min(1,(d*d-.4**2-.39**2)/(2*.4*.39))))
    rig.pose.bones['Thigh_'+side].rotation_euler.x=thigh
    rig.pose.bones['Shin_'+side].rotation_euler.x=knee
    rig.pose.bones['Foot_'+side].rotation_euler.x=-(thigh+knee)
    rig.pose.bones['UpperArm_'+side].rotation_euler.x=-amp*.72*wave if active else .025*math.sin(phase)
    rig.pose.bones['UpperArm_'+side].rotation_euler.z=(1 if side=='L' else -1)*.23
    rig.pose.bones['Forearm_'+side].rotation_euler.x=-.85 if running else -.20 if active else -.10
   for p in rig.pose.bones:
    p.keyframe_insert(data_path='rotation_euler',frame=f,group=p.name)
    if p.name=='Hips': p.keyframe_insert(data_path='location',frame=f,group=p.name)
  track=rig.animation_data.nla_tracks.new(); track.name=name
  strip=track.strips.new(name,1,action); strip.action_frame_start=0; strip.action_frame_end=frames
  track.mute=True; actions.append(action)
 rig.animation_data.action=None
 for track in rig.animation_data.nla_tracks: track.mute=False
 scene.frame_set(0)
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'docs/animation/{variant}-rig.blend'))
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'{variant}-animated.glb'),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_anim_slide_to_zero=True)
 report.append({'variant':variant,'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'boundaryEdges':boundary_edges,'nonManifoldEdges':nonmanifold_edges,'bones':len(rig.data.bones),'clips':['Idle','Walk','Run']})
(OUT/'rig-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
