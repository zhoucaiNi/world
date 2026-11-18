"""Rewrite a GLB keeping only the named animations, dropping every accessor and bufferView
nothing references any more. Usage: glb-keep-anims.py in.glb out.glb Clip1 Clip2 ..."""
import json, struct, sys

src, dst, keep = sys.argv[1], sys.argv[2], set(sys.argv[3:])
b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jl])
bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
bin_ = b[28 + jl:28 + jl + bl]

j['animations'] = [a for a in j.get('animations', []) if a['name'] in keep]
assert {a['name'] for a in j['animations']} == keep, 'missing clips'

used = set()
for m in j['meshes']:
    for p in m['primitives']:
        used |= set(p['attributes'].values())
        if 'indices' in p: used.add(p['indices'])
        for t in p.get('targets', []): used |= set(t.values())
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
for a in j['animations']:
    for sm in a['samplers']: used |= {sm['input'], sm['output']}

acc_map = {old: new for new, old in enumerate(sorted(used))}
accessors = [j['accessors'][old] for old in sorted(used)]
views_used = sorted({acc['bufferView'] for acc in accessors})
view_map, views, out = {}, [], bytearray()
for new, old in enumerate(views_used):
    v = dict(j['bufferViews'][old])
    while len(out) % 4: out.append(0)
    start = v.get('byteOffset', 0)
    chunk = bin_[start:start + v['byteLength']]
    v['byteOffset'] = len(out); v['buffer'] = 0
    out += chunk
    view_map[old] = new; views.append(v)
for acc in accessors: acc['bufferView'] = view_map[acc['bufferView']]

ra = lambda i: acc_map[i]
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: ra(v) for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = ra(p['indices'])
        if 'targets' in p: p['targets'] = [{k: ra(v) for k, v in t.items()} for t in p['targets']]
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = ra(s['inverseBindMatrices'])
for a in j['animations']:
    for sm in a['samplers']: sm['input'], sm['output'] = ra(sm['input']), ra(sm['output'])

while len(out) % 4: out.append(0)
j['accessors'], j['bufferViews'] = accessors, views
j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(dst, 'wb').write(glb)
print(f'{src}: {len(b)} B -> {dst}: {len(glb)} B, clips {sorted(keep)}')
