"""Bake team jacket textures from the rig UVs; preserve all non-jacket pixels."""
import io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = Path(__file__).resolve().parents[1]
for variant in ('c01', 'c01f'):
    raw = (ROOT / f'public/characters/{variant}-animated.glb').read_bytes()
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20+length]); binary = raw[28+length:]
    def read(index):
        a = doc['accessors'][index]; v = doc['bufferViews'][a['bufferView']]
        dtype = {5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
        size = {'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
        return np.ndarray((a['count'],size), dtype=dtype, buffer=binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(v.get('byteStride',np.dtype(dtype).itemsize*size),np.dtype(dtype).itemsize))
    primitive = doc['meshes'][0]['primitives'][0]
    material = doc['materials'][primitive['material']]
    texture = material['pbrMetallicRoughness']['baseColorTexture']['index']
    source = doc['textures'][texture]['source']; view = doc['bufferViews'][doc['images'][source]['bufferView']]
    offset = view.get('byteOffset',0)
    original = Image.open(io.BytesIO(binary[offset:offset+view['byteLength']])).convert('RGB')
    w,h = original.size; mask = Image.new('L',(w,h)); draw = ImageDraw.Draw(mask)
    positions = read(primitive['attributes']['POSITION']); uv = read(primitive['attributes']['TEXCOORD_0'])
    for tri in read(primitive['indices']).reshape(-1,3):
        # glTF Y-up: jacket torso and cuffs, excluding head, hands, trousers and shoes.
        p = positions[tri]
        if p[:,1].min() > .79 and p[:,1].max() < 1.49:
            draw.polygon([(float(u*w),float(v*h)) for u,v in uv[tri]], fill=255)
    region = np.asarray(mask.filter(ImageFilter.MaxFilter(5))) / 255
    rgb = np.asarray(original).astype(float)/255
    r,g,b = rgb.transpose(2,0,1)
    # Only the blue fabric; neutral sleeves, buttons and skin stay untouched.
    strength = np.clip((b-r-.015)/.055,0,1)*np.clip((b-g)/.025,0,1)*region
    luminance = rgb @ np.array([.2126,.7152,.0722])
    for team, color in [('blue',np.array([.24,.49,.85])),('red',np.array([.80,.22,.18]))]:
        tinted = luminance[:,:,None]*color/(color @ np.array([.2126,.7152,.0722]))
        result = rgb*(1-strength[:,:,None])+tinted*strength[:,:,None]
        Image.fromarray((np.clip(result,0,1)*255).astype('uint8')).save(ROOT/f'public/characters/{variant}-{team}.png')
    print(variant, 'jacket pixels:', int((strength>.5).sum()))
