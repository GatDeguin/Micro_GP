"""Author original Spaceport fleet in Blender; meters, +Z forward in glTF.

Run through Blender MCP. All objects are placed in a fresh source scene. No
textures, external models, or user objects are modified. Vertex paint permits
one draw per material category; wheels share one mesh and an axle-centered pivot.
"""
import bpy, math, os, json
from mathutils import Vector

ROOT = 'D:/2026/Mini-GrandPrix'
OUT = ROOT + '/src/display/assets/spaceport-service-vehicles.glb'
SOURCE = ROOT + '/referencias/spaceport/spaceport-service-vehicles.blend'
old_scene = bpy.data.scenes.get('Spaceport Service Fleet')
if old_scene:
    if 'fleetManifest' not in old_scene:
        raise RuntimeError('Existing scene is not a generated fleet; preserve it and use a fresh Blender document.')
    # Only this generator's previous scene is replaced; other scenes are untouched.
    for old_object in list(old_scene.objects): bpy.data.objects.remove(old_object, do_unlink=True)
    bpy.data.scenes.remove(old_scene)
scene = bpy.data.scenes.new('Spaceport Service Fleet')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

PALETTE = {
    'white': '#e8e9e0', 'navy': '#223c52', 'blue': '#476779',
    'silver': '#adb8b9', 'dark': '#18252d', 'rubber': '#151d23',
    'amber': '#e7a23f', 'glass': '#294b5c', 'lamp': '#fff0bf', 'red': '#bb3d28',
}

def linear(hex_color):
    rgb = [int(hex_color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb) + (1,)

def mat(name, rough, metallic):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metallic
    color = m.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    m.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    return m

MATS = {'body': mat('Fleet satin enamel / vertex palette', .42, .28),
        'glass': mat('Fleet sealed blue glazing', .15, .55),
        'lamp': mat('Fleet head and tail lenses', .23, .12),
        'beacon': mat('Fleet amber warning lenses', .27, .05),
        'wheel': mat('Fleet rubber and alloy', .68, .08)}
MATS['body'].node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value = .25
MATS['body'].node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value = .25

class Batch:
    def __init__(self): self.v, self.f, self.c = [], [], []
    def face(self, points, color):
        at = len(self.v)
        self.v.extend((x, -z, y) for x, y, z in points)
        self.f.append(tuple(range(at, at + len(points))))
        self.c.append(linear(PALETTE.get(color, color)))
    def box(self, x,y,z, w,h,d, color, bevel=0):
        # The main panels and narrow chamfers catch light without subdivision.
        center = [x,y,z]; half=[w/2,h/2,d/2]; b=min(bevel,min(half)*.4)
        def pt(fixed): return tuple(center[i]+fixed[i] for i in range(3))
        for axis in range(3):
            other=[i for i in range(3) if i!=axis]
            for sign in [-1,1]:
                points=[]
                for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    a=[0,0,0]; a[axis]=sign*half[axis]
                    a[other[0]]=u*(half[other[0]]-b); a[other[1]]=v*(half[other[1]]-b)
                    points.append(pt(a))
                normal=Vector(points[1])-Vector(points[0]); edge=Vector(points[2])-Vector(points[0])
                if normal.cross(edge)[axis]*sign < 0: points.reverse()
                self.face(points,color)
        if not b: return
        for a in range(3):
            for c in range(a+1,3):
                free=3-a-c
                for sa in [-1,1]:
                    for sc in [-1,1]:
                        points=[]
                        for t,endpoint in [(0,-1),(1,-1),(1,1),(0,1)]:
                            v=[0,0,0]; v[a]=sa*(half[a]-(b if t else 0)); v[c]=sc*(half[c]-(0 if t else b)); v[free]=endpoint*(half[free]-b)
                            points.append(pt(v))
                        n=(Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])); aim=Vector([sa if i==a else sc if i==c else 0 for i in range(3)])
                        if n.dot(aim)<0: points.reverse()
                        self.face(points,color)
        for sx in [-1,1]:
            for sy in [-1,1]:
                for sz in [-1,1]:
                    signs=[sx,sy,sz]; points=[]
                    for a in range(3): points.append(pt([signs[i]*(half[i]-(0 if i==a else b)) for i in range(3)]))
                    if (Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0])).dot(Vector(signs))<0: points.reverse()
                    self.face(points,color)
    def prism(self, width, section, color):
        # Section is counter-clockwise in forward/up plane; local y is up.
        sides=[[(-width/2,y,z) for z,y in section],[(width/2,y,z) for z,y in section]]
        self.face(sides[0],color); self.face(list(reversed(sides[1])),color)
        for i in range(len(section)):
            j=(i+1)%len(section); self.face([sides[1][i],sides[1][j],sides[0][j],sides[0][i]],color)
    def ring(self, x,y,z, r1,r2,width,color,segments=16):
        for i in range(segments):
            a=i*math.tau/segments; b=(i+1)*math.tau/segments
            for side in [-1,1]:
                pts=[(x+side*width/2,y+math.cos(t)*r,z+math.sin(t)*r) for t,r in [(a,r1),(b,r1),(b,r2),(a,r2)]]
                if side>0: pts.reverse()
                self.face(pts,color)
            for r,inside in [(r1,True),(r2,False)]:
                pts=[(x+s*width/2,y+math.cos(t)*r,z+math.sin(t)*r) for s,t in [(-1,a),(1,a),(1,b),(-1,b)]]
                if not inside: pts.reverse()
                self.face(pts,color)
    def arc(self,x,y,z,r,width,color):
        for i in range(10):
            a=-.16+i*(math.pi+.32)/10; b=-.16+(i+1)*(math.pi+.32)/10
            pts=[(x,y+math.sin(t)*rr,z+math.cos(t)*rr) for t,rr in [(a,r),(b,r),(b,r+width),(a,r+width)]]
            if x<0:pts.reverse()
            self.face(pts,color)
    def object(self,name,material):
        if not self.f:return None
        mesh=bpy.data.meshes.new(name+' geometry'); mesh.from_pydata(self.v,[],self.f); mesh.update()
        mesh.materials.append(material)
        colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        for polygon,color in zip(mesh.polygons,self.c):
            for loop in polygon.loop_indices: colors.data[loop].color=color
        # Correct every disconnected primitive using its closed volume where possible.
        obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj)
        return obj

def build(kind):
    batches={key:Batch() for key in ['body','glass','lamp','beacon']}
    body,glass,lamps,beacon=[batches[key] for key in batches]
    truck=kind=='truck'; security=kind=='security'
    width=2.45 if truck else 1.88; length=7.75 if truck else 4.65
    nose=length/2; rear=-length/2; rw=.48 if truck else .37
    axles=[2.55,-1.9,-2.85] if truck else [1.43,-1.48]
    # Underbody, transmission, rails and axle hardware.
    body.box(0,.47,0,width*.82,.24,length-.3,'dark',.05)
    for x in [-width*.35,width*.35]: body.box(x,.52,0,.12,.22,length-.6,'silver')
    for z in axles:
        body.box(0,rw,z,width-.15,.13,.13,'dark')
        body.box(0,rw,z,.35,.23,.25,'dark',.05)
    if truck:
        body.box(0,1.04,2.76,2.40,.8,2.10,'white',.12)
        body.prism(2.34,[(1.78,1.37),(3.79,1.37),(3.46,2.52),(1.85,2.52)],'white')
        glass.face([(-1.05,1.62,3.74),(1.05,1.62,3.74),(1.02,2.39,3.52),(-1.02,2.39,3.52)],'glass')
        body.box(0,2.58,2.55,2.43,.15,1.88,'white',.04)
        body.box(0,2.09,-1.07,2.45,2.55,5.48,'white',.05)
        body.box(0,3.40,-1.07,2.50,.12,5.53,'silver',.03)
        for x in [-1.24,1.24]:
            body.box(x,1.35,-1.08,.045,.23,5.4,'navy')
            for z in [-3.65,-2.8,-1.95,-1.1,-.25,.6,1.52]: body.box(x,2.27,z,.06,2.03,.06,'silver')
        for z in [-3.8,1.65]: body.box(0,2.1,z,2.48,2.56,.07,'silver',.02)
        body.box(0,2.06,-3.85,2.22,2.19,.06,'navy')
        for y in [1.1,1.45,1.8,2.15,2.5,2.85,3.1]: body.box(0,y,-3.89,2.15,.035,.035,'silver')
        for x in [-.45,.45]: body.box(x,2.08,-3.94,.055,2.08,.055,'silver')
        for x in [-1.08,1.08]:
            for z in axles: body.arc(x,rw,z,rw+.06,.1,'dark')
        cabin_front=3.72; cab_rear=1.9; cabin_top=2.4
    else:
        # A stepped lower body leaves proper open wheel wells.
        body.box(0,.83,-.04,1.85,.52,1.95,'white',.06)
        body.box(0,.87,2.0,1.84,.43,.59,'white',.06)
        body.box(0,.87,-2.08,1.84,.43,.45,'white',.05)
        body.box(0,1.05,1.49,1.83,.27,1.28,'white',.06)
        body.prism(1.78,[(-.80,1.0),(.98,1.0),(.56,1.70),(-.61,1.70)],'white')
        body.box(0,1.74,-.03,1.81,.12,1.20,'white',.035)
        glass.face([(-.79,1.19,.93),(.79,1.19,.93),(.76,1.65,.59),(-.76,1.65,.59)],'glass')
        glass.face([(-.75,1.17,-.78),(-.73,1.62,-.64),(.73,1.62,-.64),(.75,1.17,-.78)],'glass')
        body.box(0,.94,-1.60,1.78,.15,1.34,'dark')
        for x in [-.88,.88]:
            body.box(x,1.12,-1.57,.13,.4,1.40,'white',.035)
            body.box(x,1.34,-1.57,.16,.07,1.44,'dark',.015)
        body.box(0,1.10,-2.29,1.84,.42,.12,'white',.02)
        if security:
            body.box(0,1.40,-1.55,1.73,.72,1.37,'white',.07)
            for x in [-.88,.88]: glass.box(x,1.46,-1.53,.025,.33,.80,'glass')
            body.box(0,1.81,-1.53,1.79,.11,1.46,'navy',.025)
        else:
            body.box(0,1.17,-1.65,1.29,.39,.60,'silver',.03)
            for x in [-.57,.57]: body.box(x,1.40,-1.65,.04,.05,.59,'dark')
            for x in [-.79,.79]: body.box(x,1.54,-.91,.06,.65,.06,'silver')
            body.box(0,1.83,-.91,1.64,.07,.07,'silver')
        for x in [-.94,.94]:
            for z in axles: body.arc(x,rw,z,rw+.07,.09,'navy')
            body.box(x,.67,-.04,.15,.08,1.98,'silver')
        cabin_front=.93; cab_rear=-.73; cabin_top=1.64
    # Doors, window seals, handles, rear view mirrors and running boards.
    side=width/2+.006
    for sign in [-1,1]:
        x=side*sign
        window=[(x,1.20 if not truck else 1.62,cab_rear+.08),(x,1.20 if not truck else 1.62,cabin_front-.15),(x,cabin_top,cabin_front-.38),(x,cabin_top,cab_rear+.11)]
        if sign>0:window.reverse()
        glass.face(window,'glass')
        body.box(x,.99 if not truck else 1.39,(cabin_front+cab_rear)/2,.025,.04,cabin_front-cab_rear-.08,'navy')
        body.box(x,1.38 if not truck else 1.92,cab_rear+.1,.045,.55,.05,'dark')
        body.box(x,1.10 if not truck else 1.53,cab_rear+.35,.06,.055,.21,'dark',.009)
        body.box(x,.88 if not truck else 1.18,cab_rear+.05,.022,.37,.021,'dark')
        body.box(x+sign*.09,1.24 if not truck else 1.92,cabin_front-.24,.21,.055,.06,'dark')
        body.box(x+sign*.16,1.34 if not truck else 1.98,cabin_front-.20,.15,.18 if not truck else .29,.12,'dark',.025)
        glass.box(x+sign*.16,1.34 if not truck else 1.98,cabin_front-.265,.11,.13 if not truck else .22,.016,'silver')
        # Stylized original technical emblem: paired wings and amber central bar.
        badge_z=2.4 if truck else -.08; badge_y=1.22 if truck else .87
        body.box(x+.012*sign,badge_y,badge_z,.022,.16,.39,'navy')
        body.box(x+.026*sign,badge_y,badge_z,.025,.115,.055,'amber')
        body.box(x+.026*sign,badge_y+.047,badge_z+.1,.025,.025,.14,'silver')
        body.box(x+.026*sign,badge_y-.047,badge_z-.1,.025,.025,.14,'silver')
    # Front and rear bumpers, grilles, dual lamps and blank technical plates.
    body.box(0,.59 if not truck else .66,nose-.01,width+.04,.20,.20,'navy',.035)
    body.box(0,.60 if not truck else .70,rear+.01,width+.04,.18,.16,'navy',.025)
    grille_y=.89 if not truck else 1.14
    body.box(0,grille_y,nose-.01,width*.46,.27 if not truck else .36,.055,'dark',.02)
    for y in [-.08,0,.08]: body.box(0,grille_y+y,nose+.025,width*.43,.025,.025,'silver')
    for sign in [-1,1]:
        for dx in [0,.17 if not truck else .20]: lamps.box(sign*(width*.30+dx),grille_y,nose+.012,.145 if not truck else .18,.18,.035,'lamp',.015)
        lamps.box(sign*width*.4,.89 if not truck else .95,rear-.025,.18,.20,.035,'red',.015)
        beacon.box(sign*width*.42,grille_y-.17,nose+.026,.13,.055,.025,'amber')
    for z in [nose+.10,rear-.10]:
        body.box(0,.63 if not truck else .73,z,.41,.11,.018,'white')
        for i in range(5): body.box(-.14+i*.06,.63 if not truck else .73,z+(.012 if z>0 else -.012),.023,.055,.008,'navy')
    # Roof rack, paired beacon lenses and wipers.
    top=2.68 if truck else 1.87; mid=2.56 if truck else -.05
    body.box(0,top,mid,width*.57,.06,.15,'dark',.015)
    for x in [-width*.22,width*.22]: beacon.box(x,top+.065,mid,.23,.11,.16,'amber',.025)
    for x in [-width*.22,width*.22]: body.box(x,1.59 if truck else 1.20,cabin_front+.015,.04,.035,.36 if truck else .25,'dark')
    for category,batch in batches.items(): batch.object(kind+'_'+category,MATS[category])
    return {'kind':kind,'wheelRadius':rw,'wheelWidth':.28 if truck else .22,'wheelX':width/2-.05,'axles':axles}

manifest=[build(kind) for kind in ['truck','pickup','security']]
wheel=Batch()
wheel.ring(0,0,0,.61,1,1,'rubber',16)
wheel.ring(0,0,0,.20,.64,1.025,'silver',12)
wheel.ring(0,0,0,.05,.24,1.10,'dark',12)
for sign in [-1,1]:
    for i in range(6):
        a=math.tau*i/6
        wheel.box(sign*.56,math.cos(a)*.40,math.sin(a)*.40,.045,.10,.10,'dark')
    for i in range(5):
        a=math.tau*i/5
        wheel.box(sign*.57,math.cos(a)*.15,math.sin(a)*.15,.03,.045,.045,'silver')
wheel.object('shared_wheel',MATS['wheel'])
for obj in scene.objects:
    if obj.type=='MESH':
        obj.select_set(True)
scene['fleetManifest']=json.dumps(manifest)
os.makedirs(os.path.dirname(OUT),exist_ok=True)
backup_versions=bpy.context.preferences.filepaths.save_version
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
bpy.context.preferences.filepaths.save_version=backup_versions
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',use_selection=True,use_active_scene=True,
    export_yup=True,export_apply=True,export_materials='EXPORT',
    export_extras=True,export_cameras=False,export_lights=False)
print(json.dumps({'asset':OUT,'bytes':os.path.getsize(OUT),'sourceBytes':os.path.getsize(SOURCE),'objects':len(scene.objects),'triangles':sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in scene.objects if obj.type=='MESH'),'manifest':manifest}))
