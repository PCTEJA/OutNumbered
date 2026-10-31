"""Bake team jacket textures from the rig UVs; preserve all non-jacket pixels."""
import io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = Path(__file__).resolve().parents[1]
report = []
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
    w,h = original.size
    positions = read(primitive['attributes']['POSITION']); uv = read(primitive['attributes']['TEXCOORD_0'])
    triangles = read(primitive['indices']).reshape(-1,3)
    # Rasterize surface coordinates, not whole-triangle height decisions. UV
    # gutters can expand only into unoccupied texels, never another body part.
    surface = np.full((h,w,3), np.nan)
    coverage = Image.new('L',(w,h)); coverage_draw = ImageDraw.Draw(coverage)
    for tri in triangles:
        points = uv[tri]*np.array([w,h])
        center = positions[tri].mean(axis=0)
        if center[1] < 1.57 and (center[1] > .90 or (abs(center[0]) > .25 and center[1] > .83)):
            coverage_draw.polygon([tuple(point) for point in points],fill=255)
        lo = np.maximum(np.floor(points.min(axis=0)).astype(int),0)
        hi = np.minimum(np.ceil(points.max(axis=0)).astype(int),[w-1,h-1])
        if np.any(hi<lo): continue
        x,y = np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
        a,b,c = points
        denominator = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(denominator)<1e-10: continue
        u = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/denominator
        v = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/denominator
        inside = (u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)
        interpolated = u[:,:,None]*positions[tri[0]]+v[:,:,None]*positions[tri[1]]+(1-u-v)[:,:,None]*positions[tri[2]]
        surface[lo[1]:hi[1]+1,lo[0]:hi[0]+1][inside] = interpolated[inside]
    height = surface[:,:,1]; width = np.abs(surface[:,:,0])
    garment = (height < 1.57) & ((height > .90) | ((width > .25) & (height > .83)))
    gutter = np.asarray(coverage.filter(ImageFilter.MaxFilter(5)))>0
    protected = Image.fromarray((np.isfinite(height) & ~garment).astype('uint8')*255)
    near_protected = np.asarray(protected.filter(ImageFilter.MaxFilter(5)))>0
    region = (garment | (gutter & np.isnan(height) & ~near_protected)).astype(float)
    rgb = np.asarray(original).astype(float)/255
    r,g,b = rgb.transpose(2,0,1)
    # Only the blue fabric; neutral sleeves, buttons and skin stay untouched.
    # Fully replace blue chroma, including desaturated fabric in shadow. Blend
    # only the almost-neutral edge, rather than mixing the old hue into red.
    strength = np.clip((b-r)/.012,0,1)*np.clip((b-g)/.006,0,1)*region
    luminance = rgb @ np.array([.2126,.7152,.0722])
    # Preserve near-neutral cloth instead of amplifying tiny blue differences
    # in the undershirt and trousers into saturated patches of team color.
    saturation = (rgb.max(axis=2)-rgb.min(axis=2))/np.maximum(rgb.max(axis=2),1e-6)
    strength *= np.clip((saturation-.08)/.04,0,1)
    strength *= np.where((height < .96) & (width < .25), saturation >= .20, True)
    for team, color in [('blue',np.array([.24,.49,.85])),('red',np.array([.80,.22,.18]))]:
        tinted = luminance[:,:,None]*color/(color @ np.array([.2126,.7152,.0722]))
        result = rgb*(1-strength[:,:,None])+tinted*strength[:,:,None]
        output = ROOT/f'public/characters/{variant}-{team}.png'
        temporary = output.with_suffix('.tmp.png')
        Image.fromarray(np.rint(np.clip(result,0,1)*255).astype('uint8')).save(temporary)
        temporary.replace(output)
        core = (strength >= 1-1e-6)
        if team == 'red':
            residual = core & (result[:,:,2] > result[:,:,0])
            assert not residual.any(), f'{variant}: original blue remains in jacket'
            # Regression for the rear shoulder patch seen in gameplay: test
            # actual upper-garment triangle centers, independently of the mask.
            centers = positions[triangles].mean(axis=1)
            texels = uv[triangles].mean(axis=1)*np.array([w,h])
            checks = 0
            for position, texel in zip(centers,texels):
                if not 1.49 < position[1] < 1.55: continue
                x,y = np.clip(texel.astype(int),[0,0],[w-1,h-1])
                if np.isfinite(height[y,x]) and not 1.45 < height[y,x] < 1.57: continue
                if np.isnan(height[y,x]) and near_protected[y,x]: continue
                if b[y,x]-r[y,x] < .012 or b[y,x]-g[y,x] < .006: continue
                if saturation[y,x] < .12: continue
                assert result[y,x,0] > result[y,x,2], f'{variant}: upper shoulder retained blue {position} texel {x},{y} surface {surface[y,x]} color {rgb[y,x]}'
                checks += 1
            assert checks > 20, f'{variant}: insufficient shoulder coverage'
    report.append({'variant':variant,'recoloredPixels':int((strength>.5).sum()),'residualBlueCorePixels':int(residual.sum()),'upperShoulderChecks':checks})
    print(variant, 'jacket pixels:', int((strength>.5).sum()))
(ROOT/'public/characters/jacket-report.json').write_text(json.dumps(report,indent=2))
