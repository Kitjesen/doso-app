"""
Blender 5.2 Photorealistic Forest Asset Baker & Master Scene Builder for DOSO App.

Uses 100% CC0 Poly Haven photogrammetry scans (fir trees, ferns, grass, mossy rocks,
lichen boulder, fallen log, tree stump, pine roots, pine-needle ground, mossy floor,
weathered bridge planks, mossy timber, and misty_pines 360° HDRI) to:
  1. Render a real photorealistic RGBA conifer bough texture via Cycles from the
     high-poly photoscanned fir_sapling_medium 3D needles.
  2. Optimize & pack all scanned hero forest props + PBR material carriers into
     assets/models/forest-kit-photoreal.glb (~4-6 MB, 60fps mobile WebGL ready).
  3. Generate graded 360° sky dome JPG + lightweight 256x128 RGBE .hdr IBL probe
     from the real misty_pines photograph.
  4. Save an editable Blender 5.2 master scene + Unreal Engine 5.8 FBX export in
     forest-studio/ (plus a Cycles hero reference render).
"""

import math
import os
import random
from pathlib import Path

import bpy
import mathutils

ROOT_DIR = Path(r"d:\DOSO\app-workspace\doso-app")
CACHE_DIR = ROOT_DIR / ".cache" / "forest-assets"
PACKED_TEX_DIR = CACHE_DIR / "packed_tex"
PACKED_TEX_DIR.mkdir(parents=True, exist_ok=True)

OUT_MODELS_DIR = ROOT_DIR / "assets" / "models"
OUT_MODELS_DIR.mkdir(parents=True, exist_ok=True)
OUT_KIT_GLB = OUT_MODELS_DIR / "forest-kit-photoreal.glb"
OUT_SKY_JPG = OUT_MODELS_DIR / "forest-sky-misty-pines.jpg"
OUT_IBL_HDR = OUT_MODELS_DIR / "forest-ibl-misty-pines.hdr"

STUDIO_DIR = ROOT_DIR / "forest-studio"
STUDIO_DIR.mkdir(parents=True, exist_ok=True)
OUT_MASTER_BLEND = STUDIO_DIR / "doso_forest_photoreal.blend"
OUT_UE5_FBX = STUDIO_DIR / "doso_forest_ue5.fbx"
OUT_CYCLES_PREVIEW = STUDIO_DIR / "cycles_forest_preview.jpg"

ROBOT_GLB = ROOT_DIR / "assets" / "models" / "thunder-r50-standby.glb"


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def prepare_hdri_and_sky():
    """Produce a HUD-friendly color-graded 2048x1024 real forest sky JPG and a lean 256x128 .hdr IBL."""
    hdr_src = CACHE_DIR / "hdris" / "misty_pines" / "misty_pines_1k.hdr"
    sky_src = CACHE_DIR / "hdris" / "misty_pines" / "misty_pines_tonemapped.jpg"

    # 1. Lean 256x128 floating-point RGBE HDR for genuine real-time forest IBL reflections on R50 titanium
    if hdr_src.exists():
        img = bpy.data.images.load(str(hdr_src), check_existing=False)
        img.scale(256, 128)
        scene = bpy.context.scene
        scene.render.image_settings.file_format = "HDR"
        img.save_render(str(OUT_IBL_HDR))
        bpy.data.images.remove(img)
        print(f"[forest-build] saved IBL HDR: {OUT_IBL_HDR} ({OUT_IBL_HDR.stat().st_size // 1024} KB)")

    # 2. Graded 2048x1024 real misty_pines equirectangular backdrop (softened upper sky for crisp white HUD text!)
    if sky_src.exists():
        img = bpy.data.images.load(str(sky_src), check_existing=False)
        img.scale(2048, 1024)
        w, h = img.size[0], img.size[1]
        pixels = list(img.pixels[:])
        # Subtle atmospheric dusk-mist grade: gently tame bright overcast white upper sky (~0.95 -> ~0.48)
        # while enriching misty pine teal-emerald depth so transparent white HUD reads with crystal contrast!
        for y in range(h):
            v = y / max(1, h - 1)  # 0 = bottom, 1 = top in Blender image buffer
            # Upper sky soft vignette damping (v > 0.48)
            sky_damp = 1.0 - max(0.0, min(1.0, (v - 0.46) / 0.44)) * 0.46
            row_off = y * w * 4
            for x in range(w):
                idx = row_off + x * 4
                r = pixels[idx] * sky_damp * 0.88
                g = pixels[idx + 1] * sky_damp * 0.94
                b = pixels[idx + 2] * sky_damp * 0.93
                # Gentle moody forest filmlook contrast
                pixels[idx] = max(0.0, min(1.0, (r ** 1.08) * 0.92))
                pixels[idx + 1] = max(0.0, min(1.0, (g ** 1.05) * 0.96))
                pixels[idx + 2] = max(0.0, min(1.0, (b ** 1.06) * 0.95))
        img.pixels[:] = pixels
        scene = bpy.context.scene
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 86
        img.filepath_raw = str(OUT_SKY_JPG)
        img.file_format = "JPEG"
        img.save()
        bpy.data.images.remove(img)
        print(f"[forest-build] saved graded sky JPG: {OUT_SKY_JPG} ({OUT_SKY_JPG.stat().st_size // 1024} KB)")


def bake_real_fir_bough_card() -> Path:
    """Render a photorealistic RGBA fir bough sprig card directly from the real scanned fir_sapling_medium in Cycles!"""
    out_png = PACKED_TEX_DIR / "fir_bough_photoreal_rgba.png"
    if out_png.exists() and out_png.stat().st_size > 20_000:
        print(f"[forest-build] reusing baked bough card: {out_png} ({out_png.stat().st_size // 1024} KB)")
        return out_png

    reset_scene()
    sapling_gltf = CACHE_DIR / "models" / "fir_sapling_medium" / "fir_sapling_medium.gltf"
    bpy.ops.import_scene.gltf(filepath=str(sapling_gltf))

    # Keep only the cleanest single sapling mesh (NurbsPath.005)
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    target = next((o for o in mesh_objs if "005" in o.name), mesh_objs[0])
    for o in list(bpy.context.scene.objects):
        if o != target:
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Compute bounds & frame the lush top-half crown from a side-elevated orthographic angle so it looks like a full radiating conifer bough fan!
    bbox = [target.matrix_world @ mathutils.Vector(c) for c in target.bound_box]
    min_z = min(v.z for v in bbox)
    max_z = max(v.z for v in bbox)
    mid_z = min_z + (max_z - min_z) * 0.56
    height = max_z - min_z
    span = max(max(v.x for v in bbox) - min(v.x for v in bbox), max(v.y for v in bbox) - min(v.y for v in bbox))

    # Add real misty_pines HDRI world lighting + subtle warm key sun
    world = bpy.data.worlds.new("BakeWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(CACHE_DIR / "hdris" / "misty_pines" / "misty_pines_1k.hdr"))
    out_w = nt.nodes.new("ShaderNodeOutputWorld")
    bg.inputs["Strength"].default_value = 1.45
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out_w.inputs["Surface"])

    # Trim lower bare stem so the rendered card is a rich dense triangular fir bough frond (stem at bottom center, lush tip at top!)
    mesh = target.data
    cut_z = min_z + height * 0.28
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for v in mesh.vertices:
        if v.co.z < cut_z:
            v.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    cam_data = bpy.data.cameras.new("BakeCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(span, height * 0.72) * 1.06
    cam_obj = bpy.data.objects.new("BakeCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (0.0, -4.0, mid_z + height * 0.08)
    cam_obj.rotation_euler = (math.radians(82), 0.0, 0.0)
    bpy.context.scene.camera = cam_obj

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.render.filepath = str(out_png)
    bpy.ops.render.render(write_still=True)

    print(f"[forest-build] baked photoreal Cycles fir bough card: {out_png} ({out_png.stat().st_size // 1024} KB)")
    return out_png


def resize_and_save_image(src_path: Path, out_name: str, max_res: int, keep_alpha: bool = False, quality: int = 84) -> Path:
    ext = "png" if keep_alpha else "jpg"
    dst = PACKED_TEX_DIR / f"{out_name}_{max_res}.{ext}"
    if dst.exists() and dst.stat().st_size > 1000:
        return dst
    img = bpy.data.images.load(str(src_path), check_existing=False)
    w, h = img.size[0], img.size[1]
    if w > max_res or h > max_res:
        scale = max_res / max(w, h)
        img.scale(max(16, int(w * scale)), max(16, int(h * scale)))
    img.filepath_raw = str(dst)
    img.file_format = "PNG" if keep_alpha else "JPEG"
    scene = bpy.context.scene
    scene.render.image_settings.quality = quality
    img.save()
    bpy.data.images.remove(img)
    return dst


def make_pbr_material(
    name: str,
    diff_path: Path,
    nor_path: Path | None = None,
    arm_path: Path | None = None,
    max_res: int = 512,
    alpha_clip: bool = False,
    roughness_fallback: float = 0.85,
    base_tint: tuple[float, float, float] | None = None,
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness_fallback
    bsdf.inputs["Metallic"].default_value = 0.0
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    # Base Color (optionally resized JPEG/PNG)
    diff_file = resize_and_save_image(diff_path, f"{name}_diff", max_res, keep_alpha=alpha_clip)
    tex_diff = nt.nodes.new("ShaderNodeTexImage")
    tex_diff.image = bpy.data.images.load(str(diff_file), check_existing=True)
    tex_diff.image.colorspace_settings.name = "sRGB"

    if base_tint is not None:
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = (base_tint[0], base_tint[1], base_tint[2], 1.0)
        nt.links.new(tex_diff.outputs["Color"], mix.inputs["A"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    else:
        nt.links.new(tex_diff.outputs["Color"], bsdf.inputs["Base Color"])

    if alpha_clip:
        nt.links.new(tex_diff.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.blend_method = "CLIP" if hasattr(mat, "blend_method") else "HASHED"
        if hasattr(mat, "alpha_threshold"):
            mat.alpha_threshold = 0.38
        mat.use_backface_culling = False

    if nor_path and nor_path.exists():
        nor_file = resize_and_save_image(nor_path, f"{name}_nor", max_res, keep_alpha=False, quality=88)
        tex_nor = nt.nodes.new("ShaderNodeTexImage")
        tex_nor.image = bpy.data.images.load(str(nor_file), check_existing=True)
        tex_nor.image.colorspace_settings.name = "Non-Color"
        nor_map = nt.nodes.new("ShaderNodeNormalMap")
        nor_map.inputs["Strength"].default_value = 1.0
        nt.links.new(tex_nor.outputs["Color"], nor_map.inputs["Color"])
        nt.links.new(nor_map.outputs["Normal"], bsdf.inputs["Normal"])

    if arm_path and arm_path.exists():
        arm_file = resize_and_save_image(arm_path, f"{name}_arm", max_res, keep_alpha=False, quality=82)
        tex_arm = nt.nodes.new("ShaderNodeTexImage")
        tex_arm.image = bpy.data.images.load(str(arm_file), check_existing=True)
        tex_arm.image.colorspace_settings.name = "Non-Color"
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tex_arm.outputs["Color"], sep.inputs["Color"])
        # Poly Haven ARM packing: R=AO, G=Roughness, B=Metallic (glTF ORM standard!)
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])

    return mat


def optimize_mesh_obj(obj, target_tris: int, center_bottom: bool = True, max_tex_res: int = 512):
    """Cleanly decimate a photoscanned mesh while preserving UVs and compressing its PBR textures."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if center_bottom:
        bbox = [obj.matrix_world @ mathutils.Vector(c) for c in obj.bound_box]
        cx = 0.5 * (min(v.x for v in bbox) + max(v.x for v in bbox))
        cy = 0.5 * (min(v.y for v in bbox) + max(v.y for v in bbox))
        min_z = min(v.z for v in bbox)
        for v in obj.data.vertices:
            v.co.x -= cx
            v.co.y -= cy
            v.co.z -= min_z
        obj.data.update()

    # Weld duplicate photogrammetry boundary verts before collapse decimation (prevents stuck high-poly boulders!)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Count triangles
    cur_tris = sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)
    if cur_tris > target_tris * 1.15:
        ratio = max(0.012, min(1.0, target_tris / float(cur_tris)))
        mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Downscale all textures attached to this object's materials so GLB stays ultra-lean!
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image and node.image.filepath:
                src = Path(bpy.path.abspath(node.image.filepath))
                if not src.exists():
                    continue
                is_alpha = any(
                    l.to_socket.name == "Alpha"
                    for l in mat.node_tree.links
                    if l.from_node == node
                )
                is_noncolor = node.image.colorspace_settings.name == "Non-Color"
                key = f"{mat.name}_{src.stem}"
                resized = resize_and_save_image(src, key, max_tex_res, keep_alpha=is_alpha, quality=86 if is_noncolor else 84)
                new_img = bpy.data.images.load(str(resized), check_existing=True)
                new_img.colorspace_settings.name = "Non-Color" if is_noncolor else "sRGB"
                node.image = new_img

    final_tris = sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)
    print(f"  [opt] {obj.name:20s}: {cur_tris:7,d} -> {final_tris:5,d} tris")


def import_scanned_prop(
    asset_name: str,
    target_names: list[tuple[str, int, int]],  # (out_name, mesh_index, target_tris)
    max_tex_res: int = 512,
    force_alpha_clip: bool = False,
) -> list[bpy.types.Object]:
    gltf_path = CACHE_DIR / "models" / asset_name / f"{asset_name}.gltf"
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(gltf_path))
    imported = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in imported if o.type == "MESH"]
    meshes.sort(key=lambda o: len(o.data.polygons), reverse=True)

    kept = []
    used = set()
    for out_name, idx, target_tris in target_names:
        if idx >= len(meshes):
            continue
        obj = meshes[idx]
        used.add(obj)
        obj.parent = None
        obj.name = out_name
        obj.data.name = f"{out_name}_mesh"
        optimize_mesh_obj(obj, target_tris=target_tris, center_bottom=True, max_tex_res=max_tex_res)
        if force_alpha_clip:
            for slot in obj.material_slots:
                if slot.material:
                    slot.material.use_backface_culling = False
                    if hasattr(slot.material, "blend_method"):
                        slot.material.blend_method = "CLIP"
                    if hasattr(slot.material, "alpha_threshold"):
                        slot.material.alpha_threshold = 0.42
        kept.append(obj)

    for o in imported:
        if o not in used:
            bpy.data.objects.remove(o, do_unlink=True)
    return kept


def build_photoreal_conifer_tree(
    name: str,
    height_m: float,
    trunk_base_r: float,
    crown_start_frac: float,
    crown_radius: float,
    seed: int,
    bark_mat,
    bough_mat,
) -> bpy.types.Object:
    """
    Build a hyper-realistic game-ready Nordic Fir/Pine tree in Blender:
      - Organic tapered, subtly curved & root-flared bark trunk + gnarled woody bough limbs
        textured with real Poly Haven photoscanned pine_bark Diffuse + Normal + ARM.
      - Layered radiating curved 3D conifer foliage bough fronds textured with our REAL
        Cycles-rendered photoscanned fir_bough_photoreal_rgba.png!
    """
    rng = random.Random(seed)
    parts: list[bpy.types.Object] = []

    # 1. Sculpted organic trunk with root flare, subtle sway & clean cylindrical UVs
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=1.0, depth=1.0, end_fill_type="NGON", location=(0, 0, 0.5))
    trunk = bpy.context.active_object
    trunk.name = f"{name}_trunk"
    # Subdivide trunk vertically by rebuilding cleanly via bmesh
    import bmesh
    bm = bmesh.new()
    rings = 14
    segs = 11
    ring_verts = []
    lean_x = (rng.random() - 0.5) * 0.14
    lean_y = (rng.random() - 0.5) * 0.14
    for r_i in range(rings + 1):
        t = r_i / rings
        z = t * height_m
        # Natural conifer taper + gnarly buttress root flare near ground
        rad = trunk_base_r * ((1.0 - t * 0.88) ** 1.05)
        flare = (1.0 - t / 0.14) ** 2 * 0.55 if t < 0.14 else 0.0
        cx = lean_x * math.sin(t * math.pi * 0.9) + math.sin(t * 5.2 + seed) * 0.035
        cy = lean_y * math.sin(t * math.pi * 0.9) + math.cos(t * 4.4 + seed) * 0.035
        verts = []
        for s_i in range(segs):
            ang = (s_i / segs) * math.pi * 2.0
            root_bump = 1.0 + flare * (0.65 + 0.45 * math.sin(ang * 5.0 + seed))
            x = cx + math.cos(ang) * rad * root_bump
            y = cy + math.sin(ang) * rad * root_bump
            verts.append(bm.verts.new((x, y, z)))
        ring_verts.append(verts)

    uv_layer = bm.loops.layers.uv.new("UVMap")
    for r_i in range(rings):
        v0 = r_i / rings * (height_m * 0.45)
        v1 = (r_i + 1) / rings * (height_m * 0.45)
        for s_i in range(segs):
            s_next = (s_i + 1) % segs
            f = bm.faces.new((
                ring_verts[r_i][s_i],
                ring_verts[r_i][s_next],
                ring_verts[r_i + 1][s_next],
                ring_verts[r_i + 1][s_i],
            ))
            f.smooth = True
            u0 = s_i / segs * 1.4
            u1 = (s_i + 1) / segs * 1.4
            f.loops[0][uv_layer].uv = (u0, v0)
            f.loops[1][uv_layer].uv = (u1, v0)
            f.loops[2][uv_layer].uv = (u1, v1)
            f.loops[3][uv_layer].uv = (u0, v1)

    bm.to_mesh(trunk.data)
    bm.free()
    trunk.data.materials.clear()
    trunk.data.materials.append(bark_mat)
    parts.append(trunk)

    # 2. Layered curved 3D foliage bough cards using REAL Cycles-baked scanned fir needle card!
    bm_f = bmesh.new()
    uv_f = bm_f.loops.layers.uv.new("UVMap")

    whorls = 11 if height_m > 7.0 else 7
    crown_z0 = height_m * crown_start_frac
    crown_h = height_m * (1.03 - crown_start_frac)

    def add_curved_bough(origin, yaw, length, width, droop, roll_twist):
        # 2x3 curved arched bough card (gentle convex canopy arch + upturned tip — zero flat paper look!)
        cos_y = math.cos(yaw)
        sin_y = math.sin(yaw)
        grid = []
        for j in range(4):
            v = j / 3.0
            dist = v * length
            # Droop out then slightly turn up at outer needle tip
            dz = -droop * math.sin(v * math.pi * 0.78) + (v ** 2.4) * (droop * 0.28)
            row = []
            for i in range(3):
                u = i / 2.0
                lat = (u - 0.5) * width * (0.42 + 0.68 * math.sin(v * math.pi * 0.85))
                # Subtle V-cup / canopy camber across width
                camber = -abs(u - 0.5) * width * 0.14
                # Apply roll twist around branch axis
                lat_r = lat * math.cos(roll_twist) - camber * math.sin(roll_twist)
                cam_r = lat * math.sin(roll_twist) + camber * math.cos(roll_twist)
                wx = origin[0] + cos_y * dist - sin_y * lat_r
                wy = origin[1] + sin_y * dist + cos_y * lat_r
                wz = origin[2] + dz + cam_r
                row.append((bm_f.verts.new((wx, wy, wz)), u, v))
            grid.append(row)

        for j in range(3):
            for i in range(2):
                v00, u00, tv00 = grid[j][i]
                v10, u10, tv10 = grid[j][i + 1]
                v11, u11, tv11 = grid[j + 1][i + 1]
                v01, u01, tv01 = grid[j + 1][i]
                face = bm_f.faces.new((v00, v10, v11, v01))
                face.smooth = True
                face.loops[0][uv_f].uv = (u00, tv00)
                face.loops[1][uv_f].uv = (u10, tv10)
                face.loops[2][uv_f].uv = (u11, tv11)
                face.loops[3][uv_f].uv = (u01, tv01)

    for w_i in range(whorls):
        frac = w_i / max(1, whorls - 1)
        z = crown_z0 + frac * crown_h * 0.94
        # Natural pine silhouette envelope (wide sweeping lower-mid boughs tapering sharply to pointed spire)
        env = ((1.0 - frac * 0.84) ** 0.92) * (0.78 + 0.28 * math.sin(frac * math.pi * 0.85))
        branches_in_whorl = max(3, int(round(6.5 - frac * 3.0)))
        base_yaw = w_i * 2.39996 + rng.random() * 0.45  # Golden angle phyllotaxis!

        for b_i in range(branches_in_whorl):
            yaw = base_yaw + (b_i / branches_in_whorl) * math.pi * 2.0 + (rng.random() - 0.5) * 0.35
            b_len = crown_radius * env * (0.85 + rng.random() * 0.32)
            b_wid = b_len * (0.78 + rng.random() * 0.24)
            droop = b_len * (0.28 * (1.0 - frac * 0.65))
            roll = (rng.random() - 0.5) * 0.55
            orig = (
                math.cos(yaw) * trunk_base_r * (1.0 - frac * 0.7) * 0.4,
                math.sin(yaw) * trunk_base_r * (1.0 - frac * 0.7) * 0.4,
                z + (rng.random() - 0.5) * 0.22,
            )
            add_curved_bough(orig, yaw, b_len, b_wid, droop, roll)
            # Add a subtle cross-angled twin card on lower/mid boughs for rich 3D volume from low camera!
            if frac < 0.75:
                add_curved_bough(
                    (orig[0], orig[1], orig[2] - 0.06),
                    yaw + 0.16,
                    b_len * 0.92,
                    b_wid * 0.88,
                    droop * 1.18,
                    roll + (0.62 if b_i % 2 == 0 else -0.62),
                )

    # Crown apex leader tuft
    for k in range(3):
        ay = k * (math.pi * 2.0 / 3.0) + rng.random() * 0.4
        add_curved_bough((0, 0, height_m * 0.91), ay, crown_radius * 0.26, crown_radius * 0.24, -0.35, 0.35)

    foliage_mesh = bpy.data.meshes.new(f"{name}_foliage_mesh")
    bm_f.to_mesh(foliage_mesh)
    bm_f.free()
    foliage_obj = bpy.data.objects.new(f"{name}_foliage", foliage_mesh)
    bpy.context.collection.objects.link(foliage_obj)
    foliage_obj.data.materials.append(bough_mat)
    parts.append(foliage_obj)

    # Join trunk + foliage into a single clean 2-material tree object!
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = trunk
    bpy.ops.object.join()
    trunk.name = name
    trunk.data.name = f"{name}_mesh"
    tris = sum(max(1, len(p.vertices) - 2) for p in trunk.data.polygons)
    print(f"  [tree] {name:20s}: {tris:5,d} tris (height={height_m:.1f}m)")
    return trunk


def create_material_carrier(name: str, mat) -> bpy.types.Object:
    """Tiny hidden quad inside GLB carrying high-res scanned PBR Diffuse/Normal/ARM maps for terrain & bridge."""
    bpy.ops.mesh.primitive_plane_add(size=0.02, location=(0, 0, -5.0))
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = f"{name}_mesh"
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def build_kit_glb(bough_png: Path):
    reset_scene()
    print("[forest-build] === Building photorealistic forest kit GLB ===")

    # Shared real scanned PBR materials
    pine_bark_dir = CACHE_DIR / "textures" / "pine_bark"
    bark_mat = make_pbr_material(
        "MAT_PINE_BARK",
        pine_bark_dir / "pine_bark_diff_1k.jpg",
        pine_bark_dir / "pine_bark_nor_gl_1k.jpg",
        pine_bark_dir / "pine_bark_arm_1k.jpg",
        max_res=512,
        base_tint=(0.76, 0.72, 0.68),
    )
    bough_mat = make_pbr_material(
        "MAT_FIR_BOUGH",
        bough_png,
        max_res=512,
        alpha_clip=True,
        roughness_fallback=0.82,
        base_tint=(0.90, 0.96, 0.88),
    )

    ground_pine_dir = CACHE_DIR / "textures" / "forrest_ground_03"
    mat_terrain_pine = make_pbr_material(
        "MAT_TERRAIN_PINE",
        ground_pine_dir / "forrest_ground_03_diff_1k.jpg",
        ground_pine_dir / "forrest_ground_03_nor_gl_1k.jpg",
        ground_pine_dir / "forrest_ground_03_arm_1k.jpg",
        max_res=1024,
    )

    ground_moss_dir = CACHE_DIR / "textures" / "forest_leaves_02"
    mat_terrain_moss = make_pbr_material(
        "MAT_TERRAIN_MOSS",
        ground_moss_dir / "forest_leaves_02_diff_1k.jpg",
        ground_moss_dir / "forest_leaves_02_nor_gl_1k.jpg",
        ground_moss_dir / "forest_leaves_02_arm_1k.jpg",
        max_res=1024,
    )

    planks_dir = CACHE_DIR / "textures" / "weathered_planks"
    mat_bridge_planks = make_pbr_material(
        "MAT_BRIDGE_PLANKS",
        planks_dir / "weathered_planks_diff_1k.jpg",
        planks_dir / "weathered_planks_nor_gl_1k.jpg",
        planks_dir / "weathered_planks_arm_1k.jpg",
        max_res=1024,
    )

    moss_wood_dir = CACHE_DIR / "textures" / "moss_wood"
    mat_bridge_timber = make_pbr_material(
        "MAT_BRIDGE_TIMBER",
        moss_wood_dir / "moss_wood_diff_1k.jpg",
        moss_wood_dir / "moss_wood_nor_gl_1k.jpg",
        moss_wood_dir / "moss_wood_arm_1k.jpg",
        max_res=512,
    )

    # 1. Material carrier quads (for real-time terrain & cedar bridge in Three.js)
    create_material_carrier("CARRIER_TERRAIN_PINE", mat_terrain_pine)
    create_material_carrier("CARRIER_TERRAIN_MOSS", mat_terrain_moss)
    create_material_carrier("CARRIER_BRIDGE_PLANKS", mat_bridge_planks)
    create_material_carrier("CARRIER_BRIDGE_TIMBER", mat_bridge_timber)

    # 2. Photoreal Conifer Trees (real scanned bark PBR + Cycles-rendered real fir needle boughs!)
    build_photoreal_conifer_tree("KIT_TREE_TALL_A", 9.6, 0.25, 0.24, 2.35, 101, bark_mat, bough_mat)
    build_photoreal_conifer_tree("KIT_TREE_TALL_B", 11.0, 0.29, 0.28, 2.65, 207, bark_mat, bough_mat)
    build_photoreal_conifer_tree("KIT_SAPLING_01", 3.1, 0.09, 0.16, 1.15, 309, bark_mat, bough_mat)

    # 3. Real Poly Haven Photoscanned Forest Props (decimated cleanly, crisp PBR Diffuse+Normal+ARM!)
    import_scanned_prop("boulder_01", [("KIT_BOULDER_01", 0, 1600)], max_tex_res=768)
    import_scanned_prop(
        "rock_moss_set_01",
        [("KIT_ROCK_MOSS_01", 0, 1100), ("KIT_ROCK_MOSS_02", 1, 950)],
        max_tex_res=768,
    )
    import_scanned_prop(
        "rock_moss_set_02",
        [("KIT_ROCK_MOSS_03", 0, 1100), ("KIT_ROCK_MOSS_04", 1, 900)],
        max_tex_res=768,
    )
    import_scanned_prop("tree_stump_01", [("KIT_STUMP_01", 0, 1400)], max_tex_res=512)
    import_scanned_prop("dead_tree_trunk", [("KIT_FALLEN_LOG", 0, 1500)], max_tex_res=512)
    import_scanned_prop("pine_roots", [("KIT_PINE_ROOTS", 0, 1500)], max_tex_res=512)
    import_scanned_prop(
        "fern_02",
        [("KIT_FERN_01", 0, 1600), ("KIT_FERN_02", 1, 1500)],
        max_tex_res=512,
        force_alpha_clip=True,
    )
    import_scanned_prop(
        "grass_medium_01",
        [("KIT_GRASS_01", 0, 1000), ("KIT_GRASS_02", 1, 950)],
        max_tex_res=512,
        force_alpha_clip=True,
    )

    # Export ultra-clean real-time kit GLB (JPEG for opaque textures, PNG only when alpha exists!)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_KIT_GLB),
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_image_quality=84,
        export_normals=True,
        export_tangents=False,
    )
    print(f"[forest-build] exported real-time kit GLB: {OUT_KIT_GLB} ({OUT_KIT_GLB.stat().st_size / (1024*1024):.2f} MB)")


def assemble_master_blender_and_ue5_scene():
    """
    Assemble a complete editable Blender 5.2 master scene + Unreal Engine 5.8 FBX export
    containing the DOSO THUNDER R50 robot + full photorealistic clearing, bridge, rocks,
    stumps, fallen logs, ferns, pine trees & misty_pines 1K HDRI lighting, and render a
    Cycles hero reference preview!
    """
    reset_scene()
    print("[forest-build] === Assembling Blender 5.2 + UE 5.8 Master Forest Scene ===")

    # 1. Import our optimized photoreal kit as instanced library templates
    bpy.ops.import_scene.gltf(filepath=str(OUT_KIT_GLB))
    kit_map = {o.name: o for o in bpy.context.scene.objects if o.type == "MESH"}

    def get_mat(carrier_name):
        obj = kit_map.get(carrier_name)
        return obj.data.materials[0] if (obj and obj.data.materials) else None

    mat_terrain = get_mat("CARRIER_TERRAIN_MOSS") or get_mat("CARRIER_TERRAIN_PINE")
    mat_planks = get_mat("CARRIER_BRIDGE_PLANKS")
    mat_timber = get_mat("CARRIER_BRIDGE_TIMBER")

    # Hide kit template origins cleanly under ground (or unlink templates after instancing!)
    templates = list(kit_map.values())

    def place_instance(kit_name: str, loc, rot_z=0.0, scale=1.0, rot_x=0.0, rot_y=0.0):
        src = kit_map.get(kit_name)
        if not src:
            return None
        inst = bpy.data.objects.new(f"{kit_name}_inst", src.data)
        bpy.context.collection.objects.link(inst)
        inst.location = loc
        inst.rotation_euler = (rot_x, rot_y, rot_z)
        if isinstance(scale, tuple):
            inst.scale = scale
        else:
            inst.scale = (scale, scale, scale)
        return inst

    # 2. Build matching sculpted clearing terrain mesh (Blender Z-up; Three.js (x,y,z) <-> Blender (x, -z, y))
    import bmesh
    bm = bmesh.new()
    segs = 64
    size = 32.0
    grid = []
    for iy in range(segs + 1):
        row = []
        by = (iy / segs - 0.5) * size
        wz = -by
        for ix in range(segs + 1):
            bx = (ix / segs - 0.5) * size
            wx = bx
            r = math.hypot(wx, wz)
            cm = max(0.0, min(1.0, (r - 2.1) / 2.5))
            cm = cm * cm * (3 - 2 * cm)
            h = (0.24 * math.sin(wx * 0.24 + 0.7) * math.cos(wz * 0.22 - 0.4)
                 + 0.14 * math.sin(wx * 0.39 - wz * 0.32 + 1.4)) * cm
            bowl = max(0.0, min(1.0, (r - 8.4) / 10.5))
            bowl = bowl * bowl * (3 - 2 * bowl)
            h += bowl * 1.6
            row.append(bm.verts.new((bx, by, h)))
        grid.append(row)

    uv_l = bm.loops.layers.uv.new("UVMap")
    for iy in range(segs):
        for ix in range(segs):
            f = bm.faces.new((grid[iy][ix], grid[iy][ix + 1], grid[iy + 1][ix + 1], grid[iy + 1][ix]))
            f.smooth = True
            for loop in f.loops:
                loop[uv_l].uv = (loop.vert.co.x * 0.48, loop.vert.co.y * 0.48)
    t_mesh = bpy.data.meshes.new("ForestTerrain")
    bm.to_mesh(t_mesh)
    bm.free()
    t_obj = bpy.data.objects.new("ForestTerrain", t_mesh)
    bpy.context.collection.objects.link(t_obj)
    if mat_terrain:
        t_obj.data.materials.append(mat_terrain)

    # 3. Place hero pines, saplings, mossy boulders, stump, fallen log, ferns & grass around clearing
    rng = random.Random(2026)
    hero_trees = [
        ("KIT_TREE_TALL_A", (-5.2, -2.5, -0.05), 0.4, 1.05),
        ("KIT_TREE_TALL_B", (-6.4, -5.6, 0.05), 1.8, 1.12),
        ("KIT_TREE_TALL_A", (-2.6, -6.4, 0.05), 2.9, 1.08),
        ("KIT_TREE_TALL_B", (1.2, -6.0, 0.05), 0.9, 1.02),
        ("KIT_TREE_TALL_A", (-7.1, 0.8, 0.05), 4.1, 1.10),
        ("KIT_TREE_TALL_B", (4.2, -5.4, 0.05), 5.2, 1.06),
        ("KIT_SAPLING_01", (-3.8, -1.8, -0.02), 1.1, 0.95),
        ("KIT_SAPLING_01", (2.6, -4.4, -0.02), 2.6, 0.85),
    ]
    for name, loc, rz, sc in hero_trees:
        place_instance(name, loc, rot_z=rz, scale=sc)

    for i in range(28):
        ang = rng.random() * math.pi * 2.0
        rad = 6.2 + rng.random() * 7.8
        bx, by = math.cos(ang) * rad, math.sin(ang) * rad
        if math.hypot(bx - 1.7, by - 1.4) < 3.0:
            continue
        place_instance("KIT_TREE_TALL_A" if i % 2 == 0 else "KIT_TREE_TALL_B", (bx, by, 0.1), rot_z=rng.random() * 6.28, scale=0.88 + rng.random() * 0.42)

    # Hero mossy rocks, stump, fallen log & ferns framing the robot clearing
    place_instance("KIT_BOULDER_01", (-3.1, -2.1, -0.06), rot_z=0.6, scale=0.45)
    place_instance("KIT_ROCK_MOSS_01", (-2.4, -3.4, -0.04), rot_z=1.5, scale=0.85)
    place_instance("KIT_ROCK_MOSS_02", (0.8, -3.6, -0.04), rot_z=2.1, scale=0.95)
    place_instance("KIT_ROCK_MOSS_03", (-4.1, -0.8, -0.04), rot_z=0.3, scale=0.90)
    place_instance("KIT_STUMP_01", (-1.8, -4.2, -0.04), rot_z=1.1, scale=0.90)
    place_instance("KIT_FALLEN_LOG", (1.9, -4.8, -0.05), rot_z=0.75, scale=0.75)
    place_instance("KIT_PINE_ROOTS", (-4.6, -2.8, -0.04), rot_z=2.4, scale=0.85)

    for i in range(42):
        ang = rng.random() * math.pi * 2.0
        rad = 2.0 + rng.random() * 6.5
        bx, by = math.cos(ang) * rad, math.sin(ang) * rad
        if math.hypot(bx - 1.7, by - 1.4) < 2.2:
            continue
        kit = "KIT_FERN_01" if i % 3 == 0 else ("KIT_FERN_02" if i % 3 == 1 else "KIT_GRASS_01")
        place_instance(kit, (bx, by, -0.02), rot_z=rng.random() * 6.28, scale=0.75 + rng.random() * 0.65)

    # Remove unplaced kit templates
    for t in templates:
        bpy.data.objects.remove(t, do_unlink=True)

    # 4. Import our real DOSO THUNDER R50 robot at origin!
    if ROBOT_GLB.exists():
        bpy.ops.import_scene.gltf(filepath=str(ROBOT_GLB))

    # 5. Real misty_pines 1K HDRI World + soft morning sunlight
    world = bpy.data.worlds.new("MistyPinesWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, 0.65)
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(CACHE_DIR / "hdris" / "misty_pines" / "misty_pines_1k.hdr"))
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.85
    out_w = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out_w.inputs["Surface"])

    sun_data = bpy.data.lights.new(name="ForestSun", type="SUN")
    sun_data.energy = 2.8
    sun_data.color = (1.0, 0.88, 0.72)
    sun_data.angle = math.radians(3.5)
    sun_obj = bpy.data.objects.new(name="ForestSun", object_data=sun_data)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(52), math.radians(14), math.radians(-130))

    # Hero 3/4 camera matching app framing
    cam_data = bpy.data.cameras.new("HeroCam")
    cam_data.lens = 38.0
    cam_obj = bpy.data.objects.new("HeroCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (1.75, 1.42, 0.66)
    direction = mathutils.Vector((0.0, 0.0, 0.38)) - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam_obj

    # 6. Pack textures & save editable Blender 5.2 master .blend + UE 5.8 FBX!
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_MASTER_BLEND))
    print(f"[forest-build] saved Blender 5.2 master scene: {OUT_MASTER_BLEND} ({OUT_MASTER_BLEND.stat().st_size / (1024*1024):.2f} MB)")

    bpy.ops.export_scene.fbx(
        filepath=str(OUT_UE5_FBX),
        use_selection=False,
        apply_scale_options="FBX_SCALE_ALL",
        path_mode="COPY",
        embed_textures=True,
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
    )
    print(f"[forest-build] exported UE 5.8 FBX scene: {OUT_UE5_FBX} ({OUT_UE5_FBX.stat().st_size / (1024*1024):.2f} MB)")

    # 7. Render crisp 960x540 Cycles photoreal reference preview (skip if already rendered)
    if not OUT_CYCLES_PREVIEW.exists():
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 32
        scene.cycles.use_denoising = True
        scene.render.resolution_x = 960
        scene.render.resolution_y = 540
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 90
        scene.view_settings.view_transform = "AgX"
        scene.render.filepath = str(OUT_CYCLES_PREVIEW)
        bpy.ops.render.render(write_still=True)
        print(f"[forest-build] rendered Cycles hero reference: {OUT_CYCLES_PREVIEW}")


if __name__ == "__main__":
    prepare_hdri_and_sky()
    bough_png = bake_real_fir_bough_card()
    build_kit_glb(bough_png)
    assemble_master_blender_and_ue5_scene()
    print("[forest-build] ALL DONE!")
