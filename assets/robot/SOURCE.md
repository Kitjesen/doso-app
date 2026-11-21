# Thunder V4 top-view outline

`thunder-v4-top-line.png` is a bundled, single-colour transparent outline of the local Thunder V4 mesh assembly. It is a static identification diagram, not telemetry or a current robot pose. It does not include the later robostl V078/R06 head-shell candidates.

- Model repository: `D:/inovxio/robotmodel/thunder_assets`, HEAD `fd13bf226e389a3e7b2e90a3beb459944faa98da` at generation.
- Kinematic source: `thunder_v4/urdf/thunder_v4.urdf`, SHA256 `b4839d91799726d9486a0ad2f3eb7b11e31698b2d3c6cdd368cb41b0a4f4767c`.
- Render scene: `thunder_v4/mjcf/thunder_v4_mujoco.xml`, SHA256 `85359a0bc1d0847072b4654371ca03e01bdf92df51e6984c1ca71c296e922093`, using its referenced STL meshes and `v4_nominal_stand` keyframe.
- Projection: orthographic from +Z, screen up = robot +X (front), screen left = robot +Y (left); camera azimuth 0, elevation -90, distance 1.8, lookat (0,0,0.3). Camera vectors were checked numerically.
- Generation: MuJoCo 3.5.0 rendered visible visual-geometry IDs at 1200×1600. OpenCV extracted only visible part contours; tiny contours below 55 px area / 35 px perimeter were omitted, contour approximation epsilon 0.9 px, antialiased line width 4 px. Output was cropped with a 20 px margin and resized to 673×1200 with Lanczos. No mesh triangles or invented details were drawn.
- PNG: RGBA, ink RGB (82,101,117), transparent background. Consumers can tint the alpha mask for theme colours. SHA256 `7651538a9c59c4a69d6e8cd61c0bb1a0f2833cd4ec87c4b0611a8f567ec580cb`.

The outline deliberately simplifies surface detail and should only identify the model and leg positions. Model source README states that licence and redistribution terms have not yet been defined; this local derivative does not add a redistribution licence.
