"""Export articulated 16-DOF THUNDER R50/V4 Full-Armor Deep-Titanium GLB for doso-app.

Sources the complete full-armor Blender assembly (42_侧板DOSO留白对照_20261119 / 侧板字标调整_候选.blend):
  - All 4 legs carry full 3-piece outer shells + grooved rubber knee guards:
      * 01 Continuous Hip/Thigh Cover (R06_Original_{leg}_1) -> parented to {LEG}_THIGH
      * 02 Thigh-Side Knee Shell (R06_Original_{leg}_2) + 270° grooved rubber ({leg}_R20_Rubber_on_thigh_02) -> {LEG}_THIGH
      * 03 Calf Knee Cap with DOSO wave face (R06_Original_{leg}_3) + 270° grooved rubber ({leg}_R15_Rubber_on_calf) -> {LEG}_CALF
      * R27 knee edge rubber & supports -> auto-parented to nearest link ({LEG}_THIGH / {LEG}_CALF)
  - Full-length sleek R31 body side cover + R32 DOSO wordmark + R35 top TPU rubber strips + V082 sleek head shell
  - Strips rear blue LiDAR mushroom & invisible internal adhesive/fastener bloat for clean silhouette & mobile FPS
  - Calibrated Anodized Deep-Titanium Satin PBR materials (high metallic contrast vs matte grooved rubber)

Run via Blender 5.2 headless:
  D:/Development/Blender/5.2/blender.exe --factory-startup -b "<blend>" --python scripts/export-standby-robot-glb.py -- "<out.glb>"
"""
import json
import math
import os
import sys

import bmesh
import bpy
import mathutils

argv = sys.argv
out_path = argv[argv.index("--") + 1] if "--" in argv else os.path.abspath("assets/models/thunder-r50-standby.glb")

# Keep ONLY real exterior robot geometry (skip studio floor, hidden duplicates, invisible 0.2mm adhesive layers & internal T-slot nuts/bolts)
SKIP_EXACT = {
    "StudioPreview_Ground",
    "Courtyard_Ground",
    "Courtyard_Backwall",
    "DOSO_Body_170mm_positive",       # hidden duplicate behind R31 long cover (hr=1)
    "DOSO_Front_Surface_Paint_64mm",  # hidden duplicate inside V082 head (hv=1, hr=1)
}
SKIP_PREFIXES = (
    "Floor_Joint_",
    "Gallery_",
    "R04_03_",  # internal rubber gasket
    "R04_04_",  # internal backing plate
    "R04_05_",  # internal M4 countersunk bolts
    "R04_06_",  # internal M4 washers
    "R04_07_",  # internal M4 nuts
    "R04_08_",  # internal M3 set screws
    "R04_09_",  # internal M5 T-nuts
    "R34_23_",  # internal COB PCB
    "R34_24_",  # internal COB emitter box
    "V082_inserts",
    "V082_mount_screws",
    "V082_shared_mounting_plate",
)
SKIP_SUBSTRINGS = (
    "R14_Adhesive_display",  # 0.2mm internal glue visualization layer (1.1M redundant polys!)
)

# 1. Filter scene objects cleanly
for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    name = obj.name
    if (
        name in SKIP_EXACT
        or name.startswith(SKIP_PREFIXES)
        or any(sub in name for sub in SKIP_SUBSTRINGS)
        or obj.hide_viewport
        or obj.hide_render
    ):
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    obj.hide_viewport = False
    obj.hide_render = False

robot_objs = [o for o in bpy.data.objects if o.type == "MESH"]
print(f"[export16] kept {len(robot_objs)} exterior full-armor mesh objects")

# Make mesh datablocks single-user and bake world transforms
for o in robot_objs:
    if o.data and o.data.users > 1:
        o.data = o.data.copy()

bpy.ops.object.select_all(action="DESELECT")
for o in robot_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = robot_objs[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Center X/Y to 0 and ground lowest tire contact to Z=0
all_mins = [1e9, 1e9, 1e9]
all_maxs = [-1e9, -1e9, -1e9]
for o in robot_objs:
    for v in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(v)
        for i in range(3):
            all_mins[i] = min(all_mins[i], w[i])
            all_maxs[i] = max(all_maxs[i], w[i])

cx = 0.5 * (all_mins[0] + all_maxs[0])
cy = 0.5 * (all_mins[1] + all_maxs[1])
min_z = all_mins[2]
for o in robot_objs:
    o.location.x -= cx
    o.location.y -= cy
    o.location.z -= min_z

bpy.ops.object.select_all(action="DESELECT")
for o in robot_objs:
    o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 2. Physically-calibrated Anodized Deep-Titanium Satin PBR materials
# Matches DOSO flagship satin deep-titanium outer armor contrasting cleanly against dark leg struts & matte grooved rubber
TITANIUM_SHELL = ((0.128, 0.142, 0.162, 1.0), 0.70, 0.33, None)       # 01/02/03 shells, R31 side cover, V082 head
TITANIUM_DARK_TRIM = ((0.056, 0.064, 0.076, 1.0), 0.56, 0.40, None)   # leg struts, inner chassis, hip collar
GRAPHITE_WAVE = ((0.028, 0.032, 0.038, 1.0), 0.30, 0.48, None)        # hip/knee concentric ripple center recess
RUBBER_MATTE = ((0.018, 0.020, 0.022, 1.0), 0.0, 0.90, None)          # 270° grooved knee guards, tires, TPU strips
DOSO_WHITE = ((0.90, 0.93, 0.97, 1.0), 0.06, 0.32, None)              # crisp silver-white DOSO typography
DARK_OPTICS = ((0.015, 0.022, 0.032, 1.0), 0.25, 0.10, None)          # front LiDAR/camera glass lens
OPAL_LED_STRIP = ((0.72, 0.86, 0.96, 1.0), 0.0, 0.22, ((0.62, 0.82, 0.98, 1.0), 0.85))
BATTERY_GREEN_LED = ((0.16, 0.92, 0.56, 1.0), 0.0, 0.22, ((0.14, 0.92, 0.56, 1.0), 2.2))

def classify_material_pbr(mat_name: str):
    n = mat_name.lower()
    if "doso" in n or "white_fill" in n or "graphite_ink" in n:
        return ("DOSO_WHITE", DOSO_WHITE)
    if "wave_face" in n:
        return ("GRAPHITE_WAVE", GRAPHITE_WAVE)
    if "rubber" in n or "tire" in n or "tpu_石墨" in n or "tpu_边缘" in n:
        return ("RUBBER_MATTE", RUBBER_MATTE)
    if any(k in n for k in ("battery_led", "emissive", "status_led", "_led", "green")):
        return ("BATTERY_GREEN_LED", BATTERY_GREEN_LED)
    if "opal_pc" in n or "status_light" in n:
        return ("OPAL_LED_STRIP", OPAL_LED_STRIP)
    if "sensor" in n or "device_dark" in n or "lidar" in n or "lens" in n or "glass" in n:
        return ("DARK_OPTICS", DARK_OPTICS)
    if any(k in n for k in ("r26_satin", "r21_satin", "r32_satin", "head_silver", "titanium", "guard", "shell")):
        return ("TITANIUM_SHELL", TITANIUM_SHELL)
    if "silver" in n or "graphite" in n or "satin_black" in n or "screw" in n or "深灰金属" in n:
        return ("TITANIUM_DARK_TRIM", TITANIUM_DARK_TRIM)
    return ("TITANIUM_DARK_TRIM", TITANIUM_DARK_TRIM)

for m in bpy.data.materials:
    if not m or not m.node_tree:
        continue
    bucket_label, (bc, met, rough, em) = classify_material_pbr(m.name)
    print(f"  [mat] {m.name:44s} -> {bucket_label}")
    for node in m.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            for inp_name in ("Base Color", "Metallic", "Roughness", "Coat Weight", "Specular IOR Level"):
                if inp_name in node.inputs:
                    for link in list(node.inputs[inp_name].links):
                        m.node_tree.links.remove(link)
            node.inputs["Base Color"].default_value = bc
            node.inputs["Metallic"].default_value = met
            node.inputs["Roughness"].default_value = rough
            if em and "Emission Color" in node.inputs and "Emission Strength" in node.inputs:
                node.inputs["Emission Color"].default_value = em[0]
                node.inputs["Emission Strength"].default_value = em[1]

# 3. Compute exact thunder_v4 v4_nominal_stand joint pivots in Blender world coordinates
def rot_axis(axis, angle):
    return mathutils.Matrix.Rotation(angle, 4, mathutils.Vector(axis))

def trans(xyz):
    return mathutils.Matrix.Translation(mathutils.Vector(xyz))

LEG_DEFS = {
    "FR": {
        "hip_pos": (0.249499, -0.0649956, 0.08105), "hip_axis": (-1, 0, 0), "hip_q": -0.1,
        "thigh_pos": (0.078, -0.0795, 0.0), "thigh_axis": (0, 1, 0), "thigh_q": -0.8,
        "calf_pos": (-0.249452, -0.0695, -0.01655), "calf_axis": (0, 1, 0), "calf_q": 1.8,
        "foot_pos": (0.240758, -0.0729, 0.0305), "foot_axis": (0, 1, 0),
    },
    "FL": {
        "hip_pos": (0.249499, 0.0650044, 0.08105), "hip_axis": (-1, 0, 0), "hip_q": 0.1,
        "thigh_pos": (0.078, 0.0795, 0.0), "thigh_axis": (0, -1, 0), "thigh_q": 0.8,
        "calf_pos": (-0.249478, 0.0695, -0.01615), "calf_axis": (0, -1, 0), "calf_q": -1.8,
        "foot_pos": (0.240809, 0.0729, 0.0301), "foot_axis": (0, -1, 0),
    },
    "RR": {
        "hip_pos": (-0.249501, -0.0649956, 0.08105), "hip_axis": (1, 0, 0), "hip_q": 0.1,
        "thigh_pos": (-0.078, -0.0795, 0.0), "thigh_axis": (0, 1, 0), "thigh_q": 0.8,
        "calf_pos": (0.249452, -0.0695, -0.01655), "calf_axis": (0, 1, 0), "calf_q": -1.8,
        "foot_pos": (-0.240758, -0.0729, 0.0305), "foot_axis": (0, 1, 0),
    },
    "RL": {
        "hip_pos": (-0.249501, 0.0650044, 0.08105), "hip_axis": (1, 0, 0), "hip_q": -0.1,
        "thigh_pos": (-0.078, 0.0795, 0.0), "thigh_axis": (0, -1, 0), "thigh_q": -0.8,
        "calf_pos": (0.249452, 0.0695, -0.01655), "calf_axis": (0, -1, 0), "calf_q": 1.8,
        "foot_pos": (-0.240758, 0.0729, 0.0305), "foot_axis": (0, -1, 0),
    },
}

main_obj = bpy.data.objects["robot_thunderv4"]
bm_probe = bmesh.new()
bm_probe.from_mesh(main_obj.data)
visited = set()
mesh_islands = []
for v in bm_probe.verts:
    if v.index in visited:
        continue
    stack = [v]
    visited.add(v.index)
    vlist = []
    flist = set()
    while stack:
        cur = stack.pop()
        vlist.append(cur)
        for f in cur.link_faces:
            flist.add(f.index)
        for e in cur.link_edges:
            nxt = e.other_vert(cur)
            if nxt.index not in visited:
                visited.add(nxt.index)
                stack.append(nxt)
    coords = [x.co for x in vlist]
    mn = mathutils.Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
    mx = mathutils.Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
    ctr = 0.5 * (mn + mx)
    mesh_islands.append((vlist, flist, mn, mx, ctr))

tire_ctrs = {}
for vlist, flist, mn, mx, ctr in mesh_islands:
    if len(vlist) > 10000 and ctr.z < 0.14 and abs(ctr.y) > 0.24:
        leg = ("F" if ctr.x > 0 else "R") + ("L" if ctr.y > 0 else "R")
        tire_ctrs[leg] = ctr

fk_raw = {}
for leg, d in LEG_DEFS.items():
    m_hip = trans(d["hip_pos"]) @ rot_axis(d["hip_axis"], d["hip_q"])
    m_thigh = m_hip @ trans(d["thigh_pos"]) @ rot_axis(d["thigh_axis"], d["thigh_q"])
    m_calf = m_thigh @ trans(d["calf_pos"]) @ rot_axis(d["calf_axis"], d["calf_q"])
    m_foot = m_calf @ trans(d["foot_pos"])
    fk_raw[leg] = (m_hip, m_thigh, m_calf, m_foot)

offsets = [tire_ctrs[leg] - fk_raw[leg][3].translation for leg in tire_ctrs]
base_offset = sum(offsets, mathutils.Vector()) / len(offsets)
print(f"[export16] calibrated base_link offset: {[round(v, 5) for v in base_offset]}")

pivots = {}
for leg, (m_hip, m_thigh, m_calf, m_foot) in fk_raw.items():
    d = LEG_DEFS[leg]
    p_hip = base_offset + m_hip.translation
    p_thigh = base_offset + m_thigh.translation
    p_calf = base_offset + m_calf.translation
    p_foot = base_offset + m_foot.translation
    a_hip = (m_hip.to_3x3() @ mathutils.Vector(d["hip_axis"])).normalized()
    a_thigh = (m_thigh.to_3x3() @ mathutils.Vector(d["thigh_axis"])).normalized()
    a_calf = (m_calf.to_3x3() @ mathutils.Vector(d["calf_axis"])).normalized()
    a_foot = (m_foot.to_3x3() @ mathutils.Vector(d["foot_axis"])).normalized()
    p_wheel_exact = tire_ctrs.get(leg, p_foot)
    err_mm = (p_wheel_exact - p_foot).length * 1000.0
    print(f"  [fk] {leg}: hip={[round(x,4) for x in p_hip]} thigh={[round(x,4) for x in p_thigh]} calf={[round(x,4) for x in p_calf]} wheel={[round(x,4) for x in p_wheel_exact]} (fk_err={err_mm:.2f}mm)")
    pivots[leg] = {
        "hip": p_hip, "thigh": p_thigh, "calf": p_calf, "wheel": p_wheel_exact,
        "axis_hip": a_hip, "axis_thigh": a_thigh, "axis_calf": a_calf, "axis_wheel": a_foot,
    }

# 4. Classify every island of robot_thunderv4 into its exact kinematic link bucket
link_face_sets = {"body": set()}
for leg in ("FL", "FR", "RL", "RR"):
    for part in ("hip", "thigh", "calf", "wheel"):
        link_face_sets[f"{leg}_{part}"] = set()

removed_lidar_faces = 0
for vlist, flist, mn, mx, ctr in mesh_islands:
    # Strip rear blue LiDAR mushroom sticking up behind top rails
    if ctr.x < -0.25 and mn.z > 0.555 and abs(ctr.y) < 0.06:
        removed_lidar_faces += len(flist)
        continue

    leg = ("F" if ctr.x >= 0.0 else "R") + ("L" if ctr.y >= 0.0 else "R")
    ay = abs(ctr.y)
    ax = abs(ctr.x)
    pv = pivots[leg]

    if ctr.z < 0.16 and ay > 0.238 and (ctr - pv["wheel"]).length < 0.125:
        link_face_sets[f"{leg}_wheel"].update(flist)
    elif (ctr.z < 0.25 and ay > 0.19) or (mn.z < 0.16 and ay > 0.195):
        link_face_sets[f"{leg}_calf"].update(flist)
    elif ay > 0.138 and (mn.z < 0.42 or ctr.z < 0.45):
        link_face_sets[f"{leg}_thigh"].update(flist)
    elif ax > 0.235 and ay > 0.085 and ctr.z > 0.40 and mx.z < 0.57:
        link_face_sets[f"{leg}_hip"].update(flist)
    else:
        link_face_sets["body"].update(flist)

print(f"[export16] stripped rear LiDAR mushroom ({removed_lidar_faces} faces)")

def extract_faces_to_object(src_obj, bm_src, face_indices, new_name):
    bm_new = bmesh.new()
    vert_map = {}
    bm_src.faces.ensure_lookup_table()
    for fi in face_indices:
        f = bm_src.faces[fi]
        new_verts = []
        for v in f.verts:
            nv = vert_map.get(v.index)
            if nv is None:
                nv = bm_new.verts.new(v.co)
                vert_map[v.index] = nv
            new_verts.append(nv)
        try:
            nf = bm_new.faces.new(new_verts)
            nf.material_index = f.material_index
            nf.smooth = f.smooth
        except ValueError:
            pass
    mesh = bpy.data.meshes.new(new_name)
    for slot in src_obj.material_slots:
        mesh.materials.append(slot.material)
    bm_new.to_mesh(mesh)
    bm_new.free()
    obj = bpy.data.objects.new(new_name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj

link_objs = {}
for lname, fset in link_face_sets.items():
    link_objs[lname] = extract_faces_to_object(main_obj, bm_probe, fset, f"LINK_{lname}")

bm_probe.free()
bpy.data.objects.remove(main_obj, do_unlink=True)

# 5. Classify all external armor shells & leg covers to their exact moving kinematic link!
extra_objs = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("LINK_")]

body_attachments = []
doso_objs = []
leg_attachments = {f"{leg}_{part}": [] for leg in ("FL", "FR", "RL", "RR") for part in ("hip", "thigh", "calf")}

def get_obj_center(o):
    pts = [o.matrix_world @ mathutils.Vector(c) for c in o.bound_box]
    return sum(pts, mathutils.Vector()) / 8.0

for o in extra_objs:
    name = o.name
    low = name.lower()

    # Preserve DOSO graphics at full fidelity under body
    if name.startswith("DOSO_") or "DOSO_82mm" in name:
        doso_objs.append(o)
        continue

    # 3-piece leg shells (R06_Original_{leg}_{1,2,3})
    matched_leg = None
    for leg in ("fl", "fr", "rl", "rr"):
        if f"_{leg}_" in low or low.startswith(f"{leg}_"):
            matched_leg = leg.upper()
            break

    if matched_leg:
        if low.endswith("_1") or low.endswith("_2") or "rubber_on_thigh" in low:
            # 01 hip/thigh outer shell, 02 thigh knee shell & 02 rubber band rotate with THIGH!
            leg_attachments[f"{matched_leg}_thigh"].append(o)
        elif low.endswith("_3") or "rubber_on_calf" in low:
            # 03 calf knee cap (with DOSO) & 03 rubber band rotate with CALF!
            leg_attachments[f"{matched_leg}_calf"].append(o)
        elif "r27_" in low:
            # R27 trim near hip/thigh joint: attach to THIGH (moves cleanly with thigh pitch)
            leg_attachments[f"{matched_leg}_thigh"].append(o)
        else:
            body_attachments.append(o)
    else:
        body_attachments.append(o)

for k, lst in leg_attachments.items():
    if lst:
        print(f"  [attach] {k}: {[o.name for o in lst]}")

# 6. Clean, weld, preserve sharp CAD creases & DOSO logos, decimate, and bake Weighted Normals!
def apply_cad_weighted_normals(o, sharp_deg=32.0):
    """Bake razor-crisp CAD shading directly into mesh normals (zero crumpled-foil triangle artifacts!)."""
    sharp_rad = math.radians(sharp_deg)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            ang = e.calc_face_angle(0.0)
            e.smooth = ang < sharp_rad
        else:
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

    # 1. Split sharp CAD creases (>= 32°) cleanly first so hard mechanical corners NEVER bleed smooth shading!
    es = o.modifiers.new(name="BakeSharpSplit", type="EDGE_SPLIT")
    es.use_edge_angle = False
    es.use_edge_sharp = True
    try:
        bpy.ops.object.modifier_apply(modifier=es.name)
    except Exception:
        o.modifiers.remove(es)

    # 2. Bake face-area Weighted Normals across each smooth island -> silky KeyShot/Cycles CAD reflections!
    wn = o.modifiers.new(name="BakeWeightedNormals", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA"
    wn.weight = 50
    wn.keep_sharp = True
    try:
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        o.modifiers.remove(wn)
    o.data.validate(clean_customdata=False)

def optimize_mesh_to_target(o, target_polys: int, weld_dist=0.00035, smooth_deg=32.0, preserve_materials=True, protect_doso=False):
    while len(o.data.uv_layers) > 0:
        o.data.uv_layers.remove(o.data.uv_layers[0])
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.material_slot_remove_unused()

    # Apply any existing Bevel/CAD modifiers (e.g. R35 TPU bevels) cleanly before cleaning!
    for mod in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            o.modifiers.remove(mod)

    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception:
        pass

    # Pre-mark sharp CAD creases so Decimate preserves design lines & bevels!
    sharp_rad = math.radians(smooth_deg)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld_dist)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0001, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < sharp_rad
        else:
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()
    o.data.validate(clean_customdata=True)

    # Protect DOSO letter material faces from decimation using a vertex group so letters NEVER chip!
    vg_name = None
    if protect_doso and len(o.material_slots) > 1:
        doso_slot_idxs = {
            i for i, slot in enumerate(o.material_slots)
            if slot.material and any(k in slot.material.name.lower() for k in ("doso", "white_fill", "graphite_ink"))
        }
        if doso_slot_idxs:
            doso_verts = set()
            for poly in o.data.polygons:
                if poly.material_index in doso_slot_idxs:
                    doso_verts.update(poly.vertices)
            non_doso_verts = [v.index for v in o.data.vertices if v.index not in doso_verts]
            if non_doso_verts and doso_verts:
                vg = o.vertex_groups.new(name="DecimateAllow")
                vg.add(non_doso_verts, 1.0, "REPLACE")
                vg_name = vg.name

    cur_polys = len(o.data.polygons)
    if cur_polys > target_polys * 1.08:
        ratio = max(0.006, min(1.0, target_polys / float(cur_polys)))
        mod = o.modifiers.new(name="DecimateClean", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        if vg_name:
            mod.vertex_group = vg_name
            mod.vertex_group_factor = 1.0
        if preserve_materials:
            mod.delimit = {"MATERIAL", "SHARP"}
        else:
            mod.delimit = {"SHARP"}
        bpy.ops.object.modifier_apply(modifier=mod.name)

    if vg_name and vg_name in o.vertex_groups:
        o.vertex_groups.remove(o.vertex_groups[vg_name])

    apply_cad_weighted_normals(o, sharp_deg=smooth_deg)

# Optimize body shells & head (hero V082 sculpted head + sleek R31 side cover kept ultra-smooth!)
for o in body_attachments:
    n = o.name
    if "R31_SW_native_long_cover" in n:
        target, wd, sdeg = 12000, 0.00018, 28.0
    elif "V082_outer_shell" in n:
        target, wd, sdeg = 22000, 0.00015, 25.0
    elif "V082_inner_shell" in n:
        target, wd, sdeg = 3800, 0.00025, 28.0
    elif "V082_camera" in n or "V082_lidar" in n:
        target, wd, sdeg = 1200, 0.00035, 30.0
    elif "HIP_Cover" in n:
        target, wd, sdeg = 6500, 0.00020, 26.0
    elif "Host_04" in n:
        target, wd, sdeg = 5200, 0.00022, 28.0
    else:
        target, wd, sdeg = 2200, 0.00025, 28.0
    optimize_mesh_to_target(o, target, weld_dist=wd, smooth_deg=sdeg, protect_doso=True)

# Optimize leg armor shells (01 hip/thigh cover, 02 thigh knee shell, 03 calf knee cap + grooved rubber!)
for bucket, lst in leg_attachments.items():
    for o in lst:
        low = o.name.lower()
        if "r06_original" in low and (low.endswith("_1") or low.endswith("_3")):
            # Preserves razor-crisp DOSO letters (protected vertex group!) + silky concentric cylinders!
            target, wd, sdeg, protect = 11500, 0.00020, 28.0, True
        elif "r06_original" in low and low.endswith("_2"):
            target, wd, sdeg, protect = 5600, 0.00022, 28.0, False
        elif "rubber_on_" in low:
            target, wd, sdeg, protect = 3400, 0.00030, 32.0, False
        else:
            target, wd, sdeg, protect = 700, 0.00035, 30.0, False
        optimize_mesh_to_target(o, target, weld_dist=wd, smooth_deg=sdeg, preserve_materials=True, protect_doso=protect)
        print(f"  [shell] {o.name:30s} -> {len(o.data.polygons):6d} polys")

for o in doso_objs:
    optimize_mesh_to_target(o, 6500, weld_dist=0.00015, smooth_deg=25.0)
    # Offset flush side graphics outward by 1.2mm so cover never clips letters
    for v in o.data.vertices:
        v.co.y += 0.0012 if v.co.y >= 0 else -0.0012
    o.data.update()

LINK_TARGETS = {
    "body": (48000, 0.00018, 28.0),
    "hip": (3500, 0.00030, 30.0),
    "thigh": (4500, 0.00030, 30.0),
    "calf": (4500, 0.00030, 30.0),
    "wheel": (3400, 0.00035, 32.0),
}
for lname, obj in link_objs.items():
    part = lname.split("_")[-1] if "_" in lname else lname
    target, wd, sdeg = LINK_TARGETS.get(part, (4000, 0.00030, 30.0))
    optimize_mesh_to_target(obj, target, weld_dist=wd, smooth_deg=sdeg)
    print(f"  [link]  {lname:16s} -> {len(obj.data.polygons):6d} polys")

# 7. Build exact 16-DOF parented hierarchy with all 01/02/03 shells moving natively with their joints!
def set_origin_to_world_point(obj, world_pt):
    delta = mathutils.Vector(world_pt)
    for v in obj.data.vertices:
        v.co -= delta
    obj.data.update()
    obj.location = delta

body_pivot = mathutils.Vector((0.0, 0.0, base_offset.z + 0.08105))
body_root = bpy.data.objects.new("R50_BODY", None)
bpy.context.collection.objects.link(body_root)
body_root.location = body_pivot

for bobj in [link_objs["body"]] + body_attachments + doso_objs:
    set_origin_to_world_point(bobj, body_pivot)
    bobj.parent = body_root
    bobj.location = (0.0, 0.0, 0.0)

rig_meta = {
    "body_pivot_three": [round(body_pivot.x, 5), round(body_pivot.z, 5), round(-body_pivot.y, 5)],
    "wheel_radius_m": 0.095,
    "legs": {},
}

def blender_to_three_vec(v):
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]

for leg in ("FL", "FR", "RL", "RR"):
    pv = pivots[leg]

    hip_obj = link_objs[f"{leg}_hip"]
    hip_obj.name = f"{leg}_HIP"
    set_origin_to_world_point(hip_obj, pv["hip"])
    hip_obj.parent = body_root
    hip_obj.location = pv["hip"] - body_pivot

    thigh_obj = link_objs[f"{leg}_thigh"]
    thigh_obj.name = f"{leg}_THIGH"
    set_origin_to_world_point(thigh_obj, pv["thigh"])
    thigh_obj.parent = hip_obj
    thigh_obj.location = pv["thigh"] - pv["hip"]
    for att in leg_attachments[f"{leg}_thigh"]:
        set_origin_to_world_point(att, pv["thigh"])
        att.parent = thigh_obj
        att.location = (0.0, 0.0, 0.0)

    calf_obj = link_objs[f"{leg}_calf"]
    calf_obj.name = f"{leg}_CALF"
    set_origin_to_world_point(calf_obj, pv["calf"])
    calf_obj.parent = thigh_obj
    calf_obj.location = pv["calf"] - pv["thigh"]
    for att in leg_attachments[f"{leg}_calf"]:
        set_origin_to_world_point(att, pv["calf"])
        att.parent = calf_obj
        att.location = (0.0, 0.0, 0.0)

    wheel_obj = link_objs[f"{leg}_wheel"]
    wheel_obj.name = f"{leg}_WHEEL"
    set_origin_to_world_point(wheel_obj, pv["wheel"])
    wheel_obj.parent = calf_obj
    wheel_obj.location = pv["wheel"] - pv["calf"]

    rig_meta["legs"][leg] = {
        "hip_axis_three": blender_to_three_vec(pv["axis_hip"]),
        "thigh_axis_three": blender_to_three_vec(pv["axis_thigh"]),
        "calf_axis_three": blender_to_three_vec(pv["axis_calf"]),
        "wheel_axis_three": blender_to_three_vec(pv["axis_wheel"]),
        "hip_world_three": blender_to_three_vec(pv["hip"]),
        "thigh_world_three": blender_to_three_vec(pv["thigh"]),
        "calf_world_three": blender_to_three_vec(pv["calf"]),
        "wheel_world_three": blender_to_three_vec(pv["wheel"]),
        "l1": round((pv["calf"] - pv["thigh"]).length, 5),
        "l2": round((pv["wheel"] - pv["calf"]).length, 5),
    }

total_polys = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
total_verts = sum(len(o.data.vertices) for o in bpy.data.objects if o.type == "MESH")
print(f"[export16] TOTAL full-armor articulated mesh: {total_polys} polys / {total_verts} verts")
print(f"[export16] RIG_META={json.dumps(rig_meta)}")

# 8. Export articulated full-armor GLB (+Y up, binary)
os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_yup=True,
    export_texcoords=False,
    export_normals=True,
    export_tangents=False,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_draco_mesh_compression_enable=False,
)
size_mb = os.path.getsize(out_path) / (1024 * 1024)
print(f"[export16] DONE -> {out_path} ({size_mb:.2f} MB)")
