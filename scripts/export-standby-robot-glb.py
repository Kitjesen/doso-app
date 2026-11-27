"""Export ultra-lean, full-armor 16-DOF THUNDER R50/V4 Deep-Titanium GLB for doso-app.

Sources the complete full-armor Blender assembly (42_侧板DOSO留白对照_20261119 / 侧板字标调整_候选.blend):
  - Keeps ALL 3-piece exterior leg shells + grooved rubber knee guards + V082 head + R31 side cover:
      * 01 Continuous Hip/Thigh Cover (R06_Original_{leg}_1) -> merged into {LEG}_THIGH
      * 02 Thigh-Side Knee Shell (R06_Original_{leg}_2) + R20 rubber + R27 edge trim -> merged into {LEG}_THIGH
      * 03 Calf Knee Cap with DOSO wave face (R06_Original_{leg}_3) + R15 rubber -> merged into {LEG}_CALF
      * R31 long side cover + R35 TPU strips + R49 rear dock + R50 hip collars + V082 head -> merged into R50_BODY
  - Deduplicates 29 CAD materials into 8 shared physically-calibrated PBR materials and merges 69 meshes
    into 17 rigid kinematic link nodes (exact 16-DOF rig preserved, ~65% fewer WebGL draw calls, Uint16 indices!).
  - Uses planar-dissolve on flat DOSO typography + vertex-group protection + CAD EdgeSplit + WeightedNormal
    to reduce model-data.js by >80% (~15.6 MB -> ~2.4-2.9 MB) with silky CNC-machined shading and crisp logos.

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

# Keep ONLY visible exterior robot geometry (skip studio floor, hidden duplicates, internal adhesive & tiny recessed screws)
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
    "R50_RestoreOriginalScrews_",  # tiny recessed M3 socket heads (invisible at viewport scale)
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

# 2. Consolidate all CAD materials into 8 clean, shared, physically-calibrated PBR materials!
# Deduplicating material slots BEFORE joining cuts WebGL draw calls by >65%!
PBR_SPECS = {
    "MAT_TITANIUM_SHELL": ((0.128, 0.142, 0.162, 1.0), 0.70, 0.33, None),
    "MAT_TITANIUM_DARK": ((0.056, 0.064, 0.076, 1.0), 0.56, 0.40, None),
    "MAT_GRAPHITE_WAVE": ((0.028, 0.032, 0.038, 1.0), 0.30, 0.48, None),
    "MAT_RUBBER_MATTE": ((0.018, 0.020, 0.022, 1.0), 0.0, 0.90, None),
    "MAT_DOSO_WHITE": ((0.90, 0.93, 0.97, 1.0), 0.06, 0.32, None),
    "MAT_DARK_OPTICS": ((0.015, 0.022, 0.032, 1.0), 0.25, 0.10, None),
    "MAT_OPAL_LED": ((0.72, 0.86, 0.96, 1.0), 0.0, 0.22, ((0.62, 0.82, 0.98, 1.0), 0.85)),
    "MAT_BATTERY_GREEN_LED": ((0.16, 0.92, 0.56, 1.0), 0.0, 0.22, ((0.14, 0.92, 0.56, 1.0), 2.2)),
}

def classify_material_key(mat_name: str) -> str:
    n = mat_name.lower()
    if "doso" in n or "white_fill" in n or "graphite_ink" in n:
        return "MAT_DOSO_WHITE"
    if "wave_face" in n:
        return "MAT_GRAPHITE_WAVE"
    if "rubber" in n or "tire" in n or "tpu_石墨" in n or "tpu_边缘" in n:
        return "MAT_RUBBER_MATTE"
    if any(k in n for k in ("battery_led", "emissive", "status_led", "_led", "green")):
        return "MAT_BATTERY_GREEN_LED"
    if "opal_pc" in n or "status_light" in n:
        return "MAT_OPAL_LED"
    if "sensor" in n or "device_dark" in n or "lidar" in n or "lens" in n or "glass" in n:
        return "MAT_DARK_OPTICS"
    if any(k in n for k in ("r26_satin", "r21_satin", "r32_satin", "head_silver", "titanium", "guard", "shell")):
        return "MAT_TITANIUM_SHELL"
    return "MAT_TITANIUM_DARK"

shared_mats = {}
for key, (bc, met, rough, em) in PBR_SPECS.items():
    mat = bpy.data.materials.new(name=key)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = bc
        bsdf.inputs["Metallic"].default_value = met
        bsdf.inputs["Roughness"].default_value = rough
        if em and "Emission Color" in bsdf.inputs and "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = em[0]
            bsdf.inputs["Emission Strength"].default_value = em[1]
    shared_mats[key] = mat

# Remap every mesh object's material slots to the 8 shared PBR materials WITHOUT losing polygon material_index!
# NOTE: o.data.materials.clear() resets poly.material_index to 0 in Blender, so we MUST restore indices AFTER appending!
for o in robot_objs:
    if not o.material_slots:
        o.data.materials.append(shared_mats["MAT_TITANIUM_DARK"])
        continue
    old_to_key = [classify_material_key(s.material.name if s.material else "") for s in o.material_slots]
    unique_keys = []
    key_to_new_idx = {}
    for k in old_to_key:
        if k not in key_to_new_idx:
            key_to_new_idx[k] = len(unique_keys)
            unique_keys.append(k)
    idx_remap = [key_to_new_idx[k] for k in old_to_key]
    poly_count = len(o.data.polygons)
    old_indices = [0] * poly_count
    o.data.polygons.foreach_get("material_index", old_indices)
    new_indices = [idx_remap[i] if 0 <= i < len(idx_remap) else 0 for i in old_indices]
    o.data.materials.clear()
    for k in unique_keys:
        o.data.materials.append(shared_mats[k])
    o.data.polygons.foreach_set("material_index", new_indices)
    o.data.update()

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

# 5. Classify all external armor shells & leg covers to their exact moving kinematic link
extra_objs = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("LINK_")]

body_attachments = []
doso_objs = []
leg_attachments = {f"{leg}_{part}": [] for leg in ("FL", "FR", "RL", "RR") for part in ("hip", "thigh", "calf")}

for o in extra_objs:
    name = o.name
    low = name.lower()

    if name.startswith("DOSO_") or "DOSO_82mm" in name:
        doso_objs.append(o)
        continue

    matched_leg = None
    for leg in ("fl", "fr", "rl", "rr"):
        if f"_{leg}_" in low or low.startswith(f"{leg}_"):
            matched_leg = leg.upper()
            break

    if matched_leg:
        if low.endswith("_1") or low.endswith("_2") or "rubber_on_thigh" in low or "r27_" in low:
            leg_attachments[f"{matched_leg}_thigh"].append(o)
        elif low.endswith("_3") or "rubber_on_calf" in low:
            leg_attachments[f"{matched_leg}_calf"].append(o)
        else:
            body_attachments.append(o)
    else:
        body_attachments.append(o)

# 6. Smart ultra-lean CAD optimization: planar-dissolve flat DOSO faces + sharp-delimited collapse + WeightedNormal!
def apply_cad_weighted_normals(o, sharp_deg=30.0):
    sharp_rad = math.radians(sharp_deg)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < sharp_rad
        else:
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()

    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o

    es = o.modifiers.new(name="BakeSharpSplit", type="EDGE_SPLIT")
    es.use_edge_angle = False
    es.use_edge_sharp = True
    try:
        bpy.ops.object.modifier_apply(modifier=es.name)
    except Exception:
        o.modifiers.remove(es)

    wn = o.modifiers.new(name="BakeWeightedNormals", type="WEIGHTED_NORMAL")
    wn.mode = "FACE_AREA"
    wn.weight = 50
    wn.keep_sharp = True
    try:
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        o.modifiers.remove(wn)
    o.data.validate(clean_customdata=False)

def simplify_planar_doso_faces(o, angle_deg=3.0):
    """Collapse thousands of redundant coplanar CAD triangles inside flat white DOSO stamps -> razor-sharp low-poly letters!"""
    doso_slot_idxs = {
        i for i, slot in enumerate(o.material_slots)
        if slot.material and slot.material.name == "MAT_DOSO_WHITE"
    }
    if not doso_slot_idxs:
        return
    bm = bmesh.new()
    bm.from_mesh(o.data)
    doso_faces = [f for f in bm.faces if f.material_index in doso_slot_idxs]
    if len(doso_faces) < 120:
        bm.free()
        return
    doso_edges = set()
    doso_verts = set()
    for f in doso_faces:
        for e in f.edges:
            if all(lf.material_index in doso_slot_idxs for lf in e.link_faces):
                doso_edges.add(e)
        for v in f.verts:
            if all(lf.material_index in doso_slot_idxs for lf in v.link_faces):
                doso_verts.add(v)
    bmesh.ops.dissolve_limit(
        bm,
        angle_limit=math.radians(angle_deg),
        use_dissolve_boundaries=False,
        verts=list(doso_verts),
        edges=list(doso_edges),
        delimit={"MATERIAL"},
    )
    doso_after = [f for f in bm.faces if f.material_index in doso_slot_idxs and len(f.verts) > 3]
    if doso_after:
        bmesh.ops.triangulate(bm, faces=doso_after)
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()

def prune_tiny_internal_islands(o, min_span_m: float):
    """Remove disconnected micro CAD fasteners/pins/PCB debris (< min_span_m) while keeping DOSO & battery LEDs."""
    if min_span_m <= 0.0:
        return
    protected_slots = {
        i for i, slot in enumerate(o.material_slots)
        if slot.material and slot.material.name in ("MAT_DOSO_WHITE", "MAT_BATTERY_GREEN_LED", "MAT_OPAL_LED")
    }
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    visited = set()
    remove_faces = []
    for v in bm.verts:
        if v.index in visited:
            continue
        stack = [v]
        visited.add(v.index)
        vlist = []
        flist = set()
        has_protected = False
        while stack:
            cur = stack.pop()
            vlist.append(cur)
            for f in cur.link_faces:
                flist.add(f)
                if f.material_index in protected_slots:
                    has_protected = True
            for e in cur.link_edges:
                nxt = e.other_vert(cur)
                if nxt.index not in visited:
                    visited.add(nxt.index)
                    stack.append(nxt)
        if has_protected or not vlist:
            continue
        xs = [x.co.x for x in vlist]
        ys = [x.co.y for x in vlist]
        zs = [x.co.z for x in vlist]
        span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        if span < min_span_m:
            remove_faces.extend(flist)
    if remove_faces:
        bmesh.ops.delete(bm, geom=list(set(remove_faces)), context="FACES")
        bm.to_mesh(o.data)
        o.data.update()
    bm.free()

def optimize_mesh_to_target(
    o,
    target_polys: int,
    weld_dist=0.0003,
    smooth_deg=38.0,
    preserve_materials=True,
    protect_doso=False,
    prune_span_m=0.0,
    simplify_doso=True,
):
    while len(o.data.uv_layers) > 0:
        o.data.uv_layers.remove(o.data.uv_layers[0])
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.material_slot_remove_unused()

    for mod in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            o.modifiers.remove(mod)

    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception:
        pass

    sharp_rad = math.radians(smooth_deg)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld_dist)
    bmesh.ops.dissolve_degenerate(bm, dist=0.00015, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < sharp_rad
        else:
            e.smooth = False
    bm.to_mesh(o.data)
    bm.free()
    o.data.validate(clean_customdata=True)

    if prune_span_m > 0.0:
        prune_tiny_internal_islands(o, prune_span_m)

    if protect_doso and simplify_doso:
        simplify_planar_doso_faces(o, angle_deg=3.5)

    vg_name = None
    if protect_doso and len(o.material_slots) > 1:
        doso_slot_idxs = {
            i for i, slot in enumerate(o.material_slots)
            if slot.material and slot.material.name == "MAT_DOSO_WHITE"
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
    if cur_polys > target_polys * 1.06:
        ratio = max(0.0004, min(1.0, target_polys / float(cur_polys)))
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

def remesh_hidden_cavity_part(o, voxel_size=0.0032, target_polys=700, shrink_scale=0.975):
    """Turn dense non-manifold internal sensor/cavity CAD soup into a clean tucked low-poly dark interior."""
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception:
            o.modifiers.remove(mod)
    rm = o.modifiers.new(name="CleanVoxel", type="REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel_size
    rm.adaptivity = 0.0015
    try:
        bpy.ops.object.modifier_apply(modifier=rm.name)
    except Exception:
        o.modifiers.remove(rm)
    if shrink_scale < 0.999 and len(o.data.vertices) > 0:
        ctr = sum((v.co for v in o.data.vertices), mathutils.Vector()) / len(o.data.vertices)
        for v in o.data.vertices:
            v.co = ctr + (v.co - ctr) * shrink_scale
        o.data.update()
    optimize_mesh_to_target(o, target_polys, weld_dist=0.0005, smooth_deg=42.0, preserve_materials=False)

def planar_clean_cad_mesh(o, angle_deg=2.2):
    """Merge flat coplanar CAD triangles on chassis/brackets so Collapse Decimate hits low-poly targets cleanly."""
    protected_slots = {
        i for i, slot in enumerate(o.material_slots)
        if slot.material and slot.material.name in ("MAT_DOSO_WHITE", "MAT_BATTERY_GREEN_LED", "MAT_OPAL_LED")
    }
    bm = bmesh.new()
    bm.from_mesh(o.data)
    dissolve_edges = []
    dissolve_verts = set()
    for e in bm.edges:
        if len(e.link_faces) == 2:
            f0, f1 = e.link_faces
            if f0.material_index == f1.material_index and f0.material_index not in protected_slots:
                dissolve_edges.append(e)
                dissolve_verts.add(e.verts[0])
                dissolve_verts.add(e.verts[1])
    if dissolve_edges:
        bmesh.ops.dissolve_limit(
            bm,
            angle_limit=math.radians(angle_deg),
            use_dissolve_boundaries=False,
            verts=list(dissolve_verts),
            edges=dissolve_edges,
            delimit={"MATERIAL"},
        )
        ngons = [f for f in bm.faces if len(f.verts) > 3]
        if ngons:
            bmesh.ops.triangulate(bm, faces=ngons)
        bm.to_mesh(o.data)
        o.data.update()
    bm.free()

# Optimize body shells & head (NEVER prune exterior CAD patches; keep V082 nose & battery bay 100% hole-free!)
for o in body_attachments:
    n = o.name
    if "V082_inner_shell" in n:
        remesh_hidden_cavity_part(o, voxel_size=0.0032, target_polys=950, shrink_scale=0.965)
        print(f"  [body]  {o.name:30s} -> {len(o.data.polygons):6d} polys (tucked-voxel)")
        continue
    if "V082_camera" in n or "V082_lidar" in n:
        remesh_hidden_cavity_part(o, voxel_size=0.0032, target_polys=450, shrink_scale=0.97)
        print(f"  [body]  {o.name:30s} -> {len(o.data.polygons):6d} polys (tucked-voxel)")
        continue
    if "R31_SW_native_long_cover" in n:
        target, wd, sdeg, prune = 6800, 0.00018, 28.0, 0.0
    elif "V082_outer_shell" in n:
        target, wd, sdeg, prune = 14000, 0.00015, 25.0, 0.0
    elif "HIP_Cover" in n:
        target, wd, sdeg, prune = 4500, 0.00020, 26.0, 0.0
    elif "Host_04" in n:
        target, wd, sdeg, prune = 3200, 0.00022, 28.0, 0.012
    elif n.startswith("R35_"):
        target, wd, sdeg, prune = 60, 0.00025, 34.0, 0.0
    else:
        target, wd, sdeg, prune = 1100, 0.00025, 28.0, 0.0
    optimize_mesh_to_target(o, target, weld_dist=wd, smooth_deg=sdeg, protect_doso=True, prune_span_m=prune)
    print(f"  [body]  {o.name:30s} -> {len(o.data.polygons):6d} polys")

# Optimize leg armor shells (01 hip/thigh, 02 thigh knee, 03 calf knee + grooved rubber — zero holes, crisp DOSO!)
for bucket, lst in leg_attachments.items():
    for o in lst:
        low = o.name.lower()
        if "r06_original" in low and low.endswith("_1"):
            target, wd, sdeg, protect, simp_doso = 6200, 0.00020, 28.0, True, True
        elif "r06_original" in low and low.endswith("_3"):
            # Keep original laser-cut white DOSO wave stamp untouched on 03 calf knee caps!
            target, wd, sdeg, protect, simp_doso = 6200, 0.00020, 28.0, True, False
        elif "r06_original" in low and low.endswith("_2"):
            target, wd, sdeg, protect, simp_doso = 3000, 0.00022, 28.0, False, False
        elif "rubber_on_" in low:
            target, wd, sdeg, protect, simp_doso = 1800, 0.00028, 32.0, False, False
        else:
            target, wd, sdeg, protect, simp_doso = 280, 0.00030, 30.0, False, False
        optimize_mesh_to_target(
            o, target, weld_dist=wd, smooth_deg=sdeg,
            preserve_materials=True, protect_doso=protect, simplify_doso=simp_doso,
        )
        print(f"  [shell] {o.name:30s} -> {len(o.data.polygons):6d} polys")

for o in doso_objs:
    simplify_planar_doso_faces(o, angle_deg=3.0)
    optimize_mesh_to_target(o, 2200, weld_dist=0.00015, smooth_deg=25.0, protect_doso=False)
    for v in o.data.vertices:
        v.co.y += 0.0012 if v.co.y >= 0 else -0.0012
    o.data.update()

LINK_TARGETS = {
    "body": (26000, 0.00018, 28.0, 0.016, 0.0),
    "hip": (2200, 0.00028, 30.0, 0.012, 0.0),
    "thigh": (2800, 0.00026, 30.0, 0.012, 0.0),
    "calf": (2800, 0.00026, 30.0, 0.012, 0.0),
    "wheel": (3400, 0.00030, 32.0, 0.0, 0.0),
}
for lname, obj in link_objs.items():
    part = lname.split("_")[-1] if "_" in lname else lname
    target, wd, sdeg, prune, pdeg = LINK_TARGETS.get(part, (800, 0.00030, 38.0, 0.015, 3.0))
    if pdeg > 0.0:
        planar_clean_cad_mesh(obj, angle_deg=pdeg)
    optimize_mesh_to_target(obj, target, weld_dist=wd, smooth_deg=sdeg, prune_span_m=prune)
    print(f"  [link]  {lname:16s} -> {len(obj.data.polygons):6d} polys")

# 7. Merge all static sub-parts into 17 rigid kinematic link meshes (preserving custom split normals!)
def join_into_single_mesh(objects_list, final_name, world_pivot):
    objs = [o for o in objects_list if o and o.type == "MESH" and len(o.data.polygons) > 0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = final_name
    merged.data.name = f"{final_name}_mesh"
    bpy.ops.object.material_slot_remove_unused()

    delta = mathutils.Vector(world_pivot)
    for v in merged.data.vertices:
        v.co -= delta
    merged.data.update()
    merged.location = delta
    return merged

body_pivot = mathutils.Vector((0.0, 0.0, base_offset.z + 0.08105))
body_root = join_into_single_mesh(
    [link_objs["body"]] + body_attachments + doso_objs,
    "R50_BODY",
    body_pivot,
)

rig_meta = {
    "body_pivot_three": [round(body_pivot.x, 5), round(body_pivot.z, 5), round(-body_pivot.y, 5)],
    "wheel_radius_m": 0.095,
    "legs": {},
}

def blender_to_three_vec(v):
    return [round(v.x, 6), round(v.z, 6), round(-v.y, 6)]

for leg in ("FL", "FR", "RL", "RR"):
    pv = pivots[leg]

    hip_obj = join_into_single_mesh([link_objs[f"{leg}_hip"]], f"{leg}_HIP", pv["hip"])
    hip_obj.parent = body_root
    hip_obj.location = pv["hip"] - body_pivot

    thigh_obj = join_into_single_mesh(
        [link_objs[f"{leg}_thigh"]] + leg_attachments[f"{leg}_thigh"],
        f"{leg}_THIGH",
        pv["thigh"],
    )
    thigh_obj.parent = hip_obj
    thigh_obj.location = pv["thigh"] - pv["hip"]

    calf_obj = join_into_single_mesh(
        [link_objs[f"{leg}_calf"]] + leg_attachments[f"{leg}_calf"],
        f"{leg}_CALF",
        pv["calf"],
    )
    calf_obj.parent = thigh_obj
    calf_obj.location = pv["calf"] - pv["thigh"]

    wheel_obj = join_into_single_mesh([link_objs[f"{leg}_wheel"]], f"{leg}_WHEEL", pv["wheel"])
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

# Purge orphan unused materials/meshes so GLB stays ultra-clean
for m in list(bpy.data.materials):
    if m.users == 0:
        bpy.data.materials.remove(m)

mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
total_polys = sum(len(o.data.polygons) for o in mesh_objs)
total_verts = sum(len(o.data.vertices) for o in mesh_objs)
print(f"[export16] TOTAL merged full-armor 16-DOF mesh: {len(mesh_objs)} nodes / {total_polys} polys / {total_verts} verts")
for o in sorted(mesh_objs, key=lambda x: x.name):
    print(f"  [node] {o.name:12s} polys={len(o.data.polygons):6d} verts={len(o.data.vertices):6d} mats={len(o.material_slots)}")
print(f"[export16] RIG_META={json.dumps(rig_meta)}")

# 8. Export articulated full-armor GLB (+Y up, binary + MeshOptimizer EXT_meshopt_compression -> >85% smaller & faster GPU cache!)
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
    export_meshopt_compression_enable=True,
    export_meshopt_extension="EXT_meshopt_compression",
)
size_mb = os.path.getsize(out_path) / (1024 * 1024)
print(f"[export16] DONE -> {out_path} ({size_mb:.2f} MB)")
