# RobotViz

A web-based 3D robot visualization tool. Visualize robot arms from URDF files with STL and DAE mesh support.

## How to Use

### Running the App

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Loading a Robot

1. **Default**: EC63 robot arm loads automatically on startup
2. **Custom Robot**: Drag and drop multiple files (URDF + meshes) or click to select all files at once
3. The app parses the URDF automatically and loads mesh files

### File Requirements

Upload folder must contain:
- One `.urdf` file describing robot structure
- Mesh files (`.STL` or `.dae`) referenced in the URDF

Mesh file names must match the link names in the URDF (e.g., `base_link.STL`, `link1.STL`).

### Joint Control

- Use sliders to manually control each joint
- Values are in radians
- Joint limits from URDF are applied automatically

### ROS Connection

1. Enter WebSocket URL (default: `ws://localhost:9090`)
2. Click Connect
3. Robot joints update from `/joint_states` topic
