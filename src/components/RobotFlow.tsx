"use client";

import React, {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Connection,
  ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import ActionNode from "./nodes/ActionNode";

// small helper to create unique ids
let idCounter = 100;
const getId = () => `${++idCounter}`;

const initialNodes: Node[] = [
  { id: "1", position: { x: 0, y: 0 }, data: { label: "Start", fields: [] } },
];

const initialEdges: Edge[] = [];

type NodeDef = {
  type: string;
  label: string;
  fields: {
    key: string;
    label: string;
    type?: "text" | "number" | "select";
    options?: string[];
  }[];
};

const NODE_DEFS: NodeDef[] = [
  {
    type: "move_to_pose",
    label: "Move To Pose",
    fields: [
      { key: "poseName", label: "Pose Name", type: "text" },
      {
        key: "robot",
        label: "Robot",
        type: "select",
        options: ["ec63", "ec64", "ec612", "cs66"],
      },
      { key: "toolVel", label: "Tool Velocity", type: "number" },
      { key: "toolAcc", label: "Tool Acc", type: "number" },
    ],
  },
  {
    type: "move_translate",
    label: "Move Translate",
    fields: [
      { key: "x", label: "X (m)", type: "number" },
      { key: "y", label: "Y (m)", type: "number" },
      { key: "z", label: "Z (m)", type: "number" },
    ],
  },
  {
    type: "open_gripper",
    label: "Open Gripper",
    fields: [{ key: "gripper_name", label: "Gripper", type: "text" }],
  },
  {
    type: "close_gripper",
    label: "Close Gripper",
    fields: [{ key: "gripper_name", label: "Gripper", type: "text" }],
  },
  {
    type: "set_speed",
    label: "Set Speed",
    fields: [{ key: "speed", label: "Speed", type: "number" }],
  },
  {
    type: "wait",
    label: "Wait",
    fields: [{ key: "duration", label: "Duration (s)", type: "number" }],
  },
  {
    type: "if_condition",
    label: "If Condition",
    fields: [{ key: "condition", label: "Condition", type: "text" }],
  },
  {
    type: "read_sensor",
    label: "Read Sensor",
    fields: [{ key: "sensor", label: "Sensor", type: "text" }],
  },
  {
    type: "set_output",
    label: "Set Digital Output",
    fields: [
      { key: "pin", label: "Pin", type: "text" },
      { key: "value", label: "Value", type: "select", options: ["0", "1"] },
    ],
  },
  { type: "home", label: "Home", fields: [] },
  { type: "calibrate", label: "Calibrate", fields: [] },
  {
    type: "execute_program",
    label: "Execute Program",
    fields: [{ key: "program", label: "Program Name", type: "text" }],
  },
  { type: "parallel_start", label: "Parallel Start", fields: [] },
  { type: "parallel_end", label: "Parallel End", fields: [] },
  {
    type: "custom_action",
    label: "Custom Action",
    fields: [{ key: "desc", label: "Description", type: "text" }],
  },
  {
    type: "move_to_joint",
    label: " Move To Joint",
    fields: [
      { key: "jointName", label: "Joint Name", type: "text" },
      {
        key: "robot",
        label: "Robot",
        type: "select",
        options: ["ec63", "ec64", "ec612", "cs66"],
      },
      { key: "toolVel", label: "Tool Velocity", type: "number" },
      { key: "toolAcc", label: "Tool Acc", type: "number" },
    ],
  },
];

export default function RobotFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // history for undo/redo
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([
    { nodes: initialNodes, edges: initialEdges },
  ]);
  const historyIndexRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const nodeTypes = useMemo(() => ({ action: ActionNode }), []);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // marquee selection state
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [compiledJson, setCompiledJson] = useState<string | null>(null);
  const selectingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  // toasts
  type Toast = {
    id: number;
    message: string;
    variant?: "success" | "error" | "info";
  };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);
  const showToast = (
    message: string,
    variant: Toast["variant"] = "info",
    ttl = 3000,
  ) => {
    const id = ++toastCounter.current;
    setToasts((t) => t.concat({ id, message, variant }));
    window.setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      ttl,
    );
  };

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    [setEdges],
  );

  const addNode = (def: NodeDef) => {
    const nid = getId();
    const newNode: Node = {
      id: nid,
      type: "action",
      position: {
        x: 200 + (nodes.length % 6) * 140,
        y: 50 + Math.floor(nodes.length / 6) * 120,
      },
      data: {
        label: def.label,
        nodeType: def.type,
        fields: def.fields,
        values: {},
        onChange: (id: string, updatedData: any) => {
          setNodes((nds) =>
            nds.map((n) => (n.id === id ? { ...n, data: updatedData } : n)),
          );
        },
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  // compile graph into ordered JSON (topological sort)
  const compileGraph = () => {
    // build adjacency and indegree
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const adj = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const n of nodes) {
      adj.set(n.id, []);
      indeg.set(n.id, 0);
    }
    for (const e of edges) {
      const s = String(e.source);
      const t = String(e.target);
      if (!adj.has(s)) adj.set(s, []);
      adj.get(s)!.push(t);
      indeg.set(t, (indeg.get(t) || 0) + 1);
    }

    // Kahn's algorithm
    const q: string[] = [];
    for (const [id, d] of indeg.entries()) if ((d || 0) === 0) q.push(id);
    const order: string[] = [];
    while (q.length) {
      const id = q.shift()!;
      order.push(id);
      const nbrs = adj.get(id) || [];
      for (const nb of nbrs) {
        indeg.set(nb, (indeg.get(nb) || 0) - 1);
        if ((indeg.get(nb) || 0) === 0) q.push(nb);
      }
    }

    if (order.length !== nodes.length) {
      // cycle detected or disconnected components; abort with user alert
      showToast(
        "Compile failed: graph has cycles or unresolved dependencies. Please fix connections before compiling.",
        "error",
      );
      return;
    }

    const compiled = order.map((id) => {
      const n = nodeMap.get(id)!;
      return {
        id: n.id,
        label: (n.data as any)?.label,
        type: (n.data as any)?.nodeType || (n.data as any)?.label,
        values: (n.data as any)?.values || {},
        position: n.position,
      };
    });

    // show compiled JSON in a preview modal instead of auto-downloading
    setCompiledJson(JSON.stringify({ compiled }, null, 2));
  };

  // push snapshots to history when nodes/edges change
  useEffect(() => {
    try {
      const cur = historyRef.current[historyIndexRef.current];
      const nodesStr = JSON.stringify(nodes);
      const edgesStr = JSON.stringify(edges);
      if (
        !cur ||
        JSON.stringify(cur.nodes) !== nodesStr ||
        JSON.stringify(cur.edges) !== edgesStr
      ) {
        // drop forward history
        historyRef.current = historyRef.current.slice(
          0,
          historyIndexRef.current + 1,
        );
        historyRef.current.push({
          nodes: JSON.parse(nodesStr),
          edges: JSON.parse(edgesStr),
        });
        historyIndexRef.current = historyRef.current.length - 1;
        // cap
        if (historyRef.current.length > 100) historyRef.current.shift();
      }
    } catch (e) {
      // ignore serialization errors
    }
  }, [nodes, edges]);

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(snap.nodes.map((n) => ({ ...n })));
    setEdges(snap.edges.map((e) => ({ ...e })));
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const snap = historyRef.current[historyIndexRef.current];
    setNodes(snap.nodes.map((n) => ({ ...n })));
    setEdges(snap.edges.map((e) => ({ ...e })));
  };

  const deleteSelected = () => {
    const selectedNodeIds = new Set(
      nodes.filter((n) => (n.selected as boolean) === true).map((n) => n.id),
    );
    if (selectedNodeIds.size === 0) {
      // also support deleting selected edges
      const remainingEdges = edges.filter((e) => !(e.selected as boolean));
      setEdges(remainingEdges);
      return;
    }
    const remainingNodes = nodes.filter((n) => !selectedNodeIds.has(n.id));
    const remainingEdges = edges.filter(
      (e) =>
        !selectedNodeIds.has(e.source as string) &&
        !selectedNodeIds.has(e.target as string),
    );
    setNodes(remainingNodes);
    setEdges(remainingEdges);
  };

  const selectAll = () => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setEdges((eds) => eds.map((e) => ({ ...e, selected: true })));
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
  };

  const exportJSON = () => {
    const data = { nodes, edges };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "robot_flow.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToLocal = () => {
    try {
      const payload = { nodes, edges };
      localStorage.setItem("robot_flow_saved", JSON.stringify(payload));
      // small feedback
      showToast(
        "Saved flow to localStorage (key: robot_flow_saved)",
        "success",
      );
    } catch (e) {
      console.error("Save failed", e);
      showToast("Save failed: " + String(e), "error");
    }
  };

  const loadFromLocal = () => {
    try {
      const raw = localStorage.getItem("robot_flow_saved");
      if (!raw) {
        showToast(
          "No saved flow found in localStorage (key: robot_flow_saved)",
          "info",
        );
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        setNodes(parsed.nodes as Node[]);
        setEdges(parsed.edges as Edge[]);
        historyRef.current = [{ nodes: parsed.nodes, edges: parsed.edges }];
        historyIndexRef.current = 0;
        showToast("Loaded flow from localStorage", "success");
      } else {
        showToast("Saved data is invalid", "error");
      }
    } catch (e) {
      console.error("Load failed", e);
      showToast("Load failed: " + String(e), "error");
    }
  };

  const importJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          setNodes(parsed.nodes as Node[]);
          setEdges(parsed.edges as Edge[]);
          // reset history
          historyRef.current = [{ nodes: parsed.nodes, edges: parsed.edges }];
          historyIndexRef.current = 0;
        }
      } catch (e) {
        console.error("Import failed", e);
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAll();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodes, edges]);

  // Marquee / rectangle selection handlers
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onDown = (e: MouseEvent) => {
      // only start for left button and when not clicking on a node or handle
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest &&
        (target.closest(".react-flow__node") ||
          target.closest(".react-flow__handle"))
      )
        return;
      selectingRef.current = true;
      startRef.current = { x: e.clientX, y: e.clientY };
      setMarquee({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
    };

    const onMove = (e: MouseEvent) => {
      if (!selectingRef.current || !startRef.current) return;
      const sx = startRef.current.x;
      const sy = startRef.current.y;
      const x = Math.min(sx, e.clientX);
      const y = Math.min(sy, e.clientY);
      const w = Math.abs(e.clientX - sx);
      const h = Math.abs(e.clientY - sy);
      setMarquee({ x, y, w, h });
    };

    const onUp = (e: MouseEvent) => {
      if (!selectingRef.current || !startRef.current) {
        selectingRef.current = false;
        setMarquee(null);
        return;
      }

      const rect = marquee;
      selectingRef.current = false;
      startRef.current = null;
      setMarquee(null);

      if (!rect) return;

      // find nodes whose DOM elements intersect the marquee
      const selectedIds = new Set<string>();
      for (const n of nodes) {
        try {
          const el = root.querySelector(
            `.react-flow__node[data-id=\"${n.id}\"]`,
          ) as HTMLElement | null;
          if (!el) continue;
          const b = el.getBoundingClientRect();
          const intersects = !(
            b.right < rect.x ||
            b.left > rect.x + rect.w ||
            b.bottom < rect.y ||
            b.top > rect.y + rect.h
          );
          if (intersects) selectedIds.add(n.id);
        } catch (e) {
          continue;
        }
      }

      if (selectedIds.size > 0) {
        setNodes((nds) =>
          nds.map((n) => ({ ...n, selected: selectedIds.has(n.id) })),
        );
      }
    };

    // attach listeners to window to capture outside moves
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [nodes]);

  return (
    <div className="h-[70vh] w-full rounded-md overflow-hidden glass-panel flex">
      <div className="w-56 p-3 border-r border-white/5 overflow-auto">
        <div className="text-sm font-semibold mb-2">Actions</div>
        <div className="flex flex-col gap-2">
          {NODE_DEFS.map((d) => (
            <button
              key={d.type}
              onClick={() => addNode(d)}
              className="text-left px-3 py-2 rounded bg-white/5 hover:bg-white/10"
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-zinc-400">
          Click an item to spawn it into the canvas.
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-2">
        <div className="p-2 flex items-center gap-2 border-b border-white/5">
          <button
            onClick={undo}
            className="px-3 py-1 rounded bg-white/5 hover:bg-white/10"
          >
            Undo
          </button>
          <button
            onClick={redo}
            className="px-3 py-1 rounded bg-white/5 hover:bg-white/10"
          >
            Redo
          </button>

          <button
            onClick={selectAll}
            className="px-3 py-1 rounded bg-white/5 hover:bg-white/10"
          >
            Select All
          </button>

          <button
            onClick={saveToLocal}
            className="px-3 py-1 rounded bg-white/5 hover:bg-white/10"
          >
            Save
          </button>

          <button
            onClick={compileGraph}
            className="px-3 py-1 rounded bg-emerald-600 text-white"
          >
            Compile
          </button>
        </div>

        <div className="flex-1 relative" ref={containerRef}>
          {marquee && (
            <div
              className="pointer-events-none z-50"
              style={{
                position: "fixed",
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
                border: "1px dashed rgba(255,255,255,0.6)",
                background: "rgba(255,255,255,0.03)",
                mixBlendMode: "normal",
              }}
            />
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            onInit={(rfi) => (rfRef.current = rfi)}
          >
            <Background gap={16} color="#111827" />
            <MiniMap zoomable pannable nodeStrokeColor={(n) => "#111827"} />
            <Controls />
          </ReactFlow>
        </div>

        <input
          ref={(el) => {
            fileInputRef.current = el;
          }}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJSON(f);
            e.currentTarget.value = "";
          }}
        />
        {compiledJson && (
          <div className="fixed inset-0 z-60 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setCompiledJson(null)}
            />
            <div className="relative z-70 w-[80%] max-w-3xl bg-(--bg-secondary) rounded-md p-4 glass-panel">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Compiled JSON Preview</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const blob = new Blob([compiledJson], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "compiled_robot_flow.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1 rounded bg-white/5 hover:bg-white/10"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => setCompiledJson(null)}
                    className="px-3 py-1 rounded bg-red-600 text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
              <pre className="h-80 overflow-auto text-sm bg-transparent p-2 border border-white/5 rounded">
                {compiledJson}
              </pre>
            </div>
          </div>
        )}
        {/* Toasts */}
        <div className="fixed right-4 top-4 z-60 flex flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-3 py-2 rounded shadow-md text-sm max-w-xs wrap-break-word ${
                t.variant === "success"
                  ? "bg-emerald-600 text-white"
                  : t.variant === "error"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-800 text-white"
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
