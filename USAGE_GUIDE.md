# RobotViz Usage Guide

## Quick Start: Testing with EC64

The EC64 robot folder is already included in this project. Here's how to test the folder upload feature:

### Option 1: Use the Preset

1. Run `npm run dev`
2. Open http://localhost:3000
3. In the "Robot Model" panel, select "EC64" from the dropdown
4. The robot will load with all its meshes and joints

### Option 2: Upload the Folder

1. Navigate to `public/ec64` in your file system
2. Drag the entire `ec64` folder onto the upload area in RobotViz
3. The system will:
   - Find `ec64.urdf` in the `urdf/` subfolder
   - Parse the robot structure
   - Load all meshes (STL and DAE files) from `meshes/`
   - Build the 3D model with correct joint hierarchy

## Creating Your Own Robot Package

To visualize your own robot:

### 1. Organize Your Files

```
my-robot/
├── urdf/
│   └── my-robot.urdf
└── meshes/
    ├── base_link.STL
    ├── link1.STL
    ├── link2.dae
    └── ...
```

### 2. URDF Requirements

Your URDF should include:

```xml
<robot name="my_robot">
  <link name="base_link">
    <visual>
      <origin xyz="0 0 0" rpy="0 0 0"/>
      <geometry>
        <mesh filename="../meshes/base_link.STL"/>
      </geometry>
    </visual>
  </link>

  <joint name="joint1" type="revolute">
    <origin xyz="0 0 0.1" rpy="0 0 0"/>
    <parent link="base_link"/>
    <child link="link1"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="100" velocity="1.0"/>
  </joint>

  <!-- More links and joints... -->
</robot>
```

### 3. Upload to RobotViz

**Method A: Drag and Drop**

- Drag the entire robot folder onto the upload area
- All files will be processed automatically

**Method B: File Selection**

- Click the upload area
- Select ALL files (hold Ctrl/Cmd to multi-select)
- Include the URDF and all mesh files

## Advanced Features

### Visual Origins

The system supports visual origin offsets defined in URDF:

```xml
<visual>
  <origin xyz="0 0 -0.1" rpy="-1.57 0 -1.57"/>
  <geometry>
    <mesh filename="../meshes/link2.dae"/>
  </geometry>
</visual>
```

These offsets are automatically applied to position meshes correctly relative to joint frames.

### Mixed Mesh Formats

You can mix STL and DAE files in the same robot:

```
meshes/
├── base_link.STL      # Binary STL
├── link1.STL          # ASCII STL
├── link2.dae          # Collada with textures
└── link3.STL
```

Both formats are automatically detected and loaded correctly.

### Joint Control

After loading:

1. Use sliders in the "Joint Controls" panel
2. Joint limits from URDF are automatically applied
3. Real-time 3D visualization updates as you move sliders

### ROS Integration

To connect to a real robot:

1. Install and run `rosbridge_server`:

   ```bash
   roslaunch rosbridge_server rosbridge_websocket.launch
   ```

2. In RobotViz:
   - Enter WebSocket URL: `ws://localhost:9090`
   - Click "Connect"
   - Robot visualization will mirror actual robot state from `/joint_states`

## Troubleshooting

### Robot not loading?

- ✅ Check console for errors (F12 in browser)
- ✅ Ensure URDF file has `.urdf` extension
- ✅ Verify mesh filenames in URDF match actual files
- ✅ Check mesh files are not corrupted

### Meshes appear disconnected?

- ✅ Verify visual origins in URDF are correct
- ✅ Check parent/child link relationships in joints
- ✅ Ensure joint origins match your CAD model

### DAE files not loading?

- ✅ Ensure DAE files are valid Collada format
- ✅ Check console for parsing errors
- ✅ Try exporting DAE from your CAD software with default settings

## Example: EC64 URDF Structure

The EC64 robot demonstrates:

- ✅ 6 revolute joints
- ✅ Mixed STL and DAE meshes (link2 is DAE)
- ✅ Visual origin offsets (link2 has rotation/translation)
- ✅ Complex joint hierarchy
- ✅ Non-zero joint origins

Study `public/ec64/urdf/ec64.urdf` as a reference for your own robots.
