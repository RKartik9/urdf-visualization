"use client";

import React from "react";
import { Handle, Position, NodeProps } from "reactflow";

type Field = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: string[];
};

export default function ActionNode({ id, data }: NodeProps) {
  const fields: Field[] = data?.fields || [];

  const updateField = (key: string, value: any) => {
    if (!data?.onChange) return;
    data.onChange(id, {
      ...data,
      values: { ...(data.values || {}), [key]: value },
    });
  };

  return (
    <div className="bg-white rounded-md shadow-md text-black w-72 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white">
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor" 
        >
          <path
            d="M3 12h18"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="font-semibold text-sm">{data?.label || "Action"}</div>
      </div>

      <div className="p-3 bg-white">
        {fields.map((f, i) => (
          <div key={f.key} className="flex items-center gap-3 mb-3">
            <div className="text-sm w-28 text-gray-700">{f.label}</div>
            {f.type === "number" ? (
              <input
                className="flex-1 px-3 py-2 rounded border border-gray-200 text-sm"
                type="number"
                value={(data?.values || {})[f.key] ?? ""}
                onChange={(e) => updateField(f.key, Number(e.target.value))}
              />
            ) : f.type === "select" ? (
              <select
                className="flex-1 px-3 py-2 rounded border border-gray-200 text-sm"
                value={(data?.values || {})[f.key] ?? ""}
                onChange={(e) => updateField(f.key, e.target.value)}
              >
                <option value="">Select</option>
                {f.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="flex-1 px-3 py-2 rounded border border-gray-200 text-sm"
                type="text"
                value={(data?.values || {})[f.key] ?? ""}
                onChange={(e) => updateField(f.key, e.target.value)}
              />
            )}

            {/* small handle per field on left */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${id}-in-${i}`}
              style={{
                top: 32 + i * 36,
                background: "#111827",
                zIndex: 10,
                pointerEvents: "all",
              }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={`${id}-out-${i}`}
              style={{
                top: 32 + i * 36,
                background: "#111827",
                zIndex: 10,
                pointerEvents: "all",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
