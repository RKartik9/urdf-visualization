"use client";

import RobotFlow from "../../components/RobotFlow";

export default function NodesPage() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Nodes</h1>
      <div className="glass-panel p-4 mb-4">
        <p className="text-sm text-(--text-secondary)">
          Drag, connect, and arrange robot action nodes. Each node represents a
          high-level robot action (move to pose, move translate, move to joint,
          open/close gripper).
        </p>
      </div>

      <RobotFlow />
    </div>
  );
}
