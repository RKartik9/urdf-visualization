"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  ContactShadows,
  Float,
  Stars,
} from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";
import { ColladaLoader } from "three-stdlib";
import URDFLoader, { URDFRobot } from "urdf-loader";

interface RobotLoaderProps {
  jointPositions?: number[];
  robotName?: string;
  // Mapping of normalized relative paths -> object URLs for uploaded files
  uploadedFiles?: Record<string, string> | null;
  // Selected URDF path (normalized, leading slash) when using uploaded files
  urdfPath?: string | null;
}

function RobotLoader({
  jointPositions = [0, 0, 0, 0, 0, 0],
  robotName = "ec63",
  uploadedFiles = null,
  urdfPath = null,
}: RobotLoaderProps) {
  // Simplified, robust loader that prefers uploaded object URLs for URDF and meshes.
  const { scene } = useThree();
  const robotRef = useRef<URDFRobot | null>(null);

  useEffect(() => {
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);

    // Helper to find uploaded file URL with normalization
    const findUploadedUrl = (path: string | null): string | null => {
      if (!path || !uploadedFiles) return null;
      const normalized = path.replace(/\\/g, "/").replace(/\/\/+/g, "/");
      if (uploadedFiles[normalized]) return uploadedFiles[normalized];
      if (uploadedFiles[normalized.replace(/^\//, "")])
        return uploadedFiles[normalized.replace(/^\//, "")];
      if (uploadedFiles[normalized.toLowerCase()])
        return uploadedFiles[normalized.toLowerCase()];
      if (uploadedFiles[normalized.replace(/^\//, "").toLowerCase()])
        return uploadedFiles[normalized.replace(/^\//, "").toLowerCase()];
      return null;
    };

    // Determine the URDF URL (either uploaded object URL or built-in path)
    const urdfUrl =
      findUploadedUrl(urdfPath) || `/${robotName}/urdf/${robotName}.urdf`;

    // Working directory used to resolve relative mesh paths
    const urdfBase = urdfPath
      ? urdfPath.replace(/[^/]*$/, "")
      : `/${robotName}/urdf/`;

    (loader as any).workingPath = urdfBase;

    // Build a normalised lookup for uploaded files
    const fileLookup: Record<string, string> = {};
    if (uploadedFiles) {
      for (const k of Object.keys(uploadedFiles)) {
        const norm = k.replace(/\\\\/g, "/").replace(/\/\/+/g, "/");
        fileLookup[norm] = uploadedFiles[k];
        fileLookup[norm.replace(/^\//, "")] = uploadedFiles[k];
        fileLookup[norm.toLowerCase()] = uploadedFiles[k];
        fileLookup[norm.replace(/^\//, "").toLowerCase()] = uploadedFiles[k];
      }
    }

    // URL modifier used by URDF/three loaders — prefer uploaded object URLs
    manager.setURLModifier((urlStr: string) => {
      try {
        // If no uploaded files, fall back to default normalization
        if (!uploadedFiles) {
          // Handle package:// and relative paths
          if (urlStr.startsWith("package://")) {
            const withoutScheme = urlStr.slice("package://".length);
            return `/${withoutScheme}`;
          }
          if (/^\.\.?\//.test(urlStr)) {
            const resolved = new URL(
              urlStr.replace(/\/+/g, "/"),
              window.location.origin + urdfBase + "dummy.urdf",
            ).pathname;
            return resolved;
          }
          if (urlStr.startsWith(window.location.origin))
            return urlStr.slice(window.location.origin.length);
          return urlStr;
        }

        const normalize = (s: string) =>
          s.replace(/\\\\/g, "/").replace(/\/\/+/g, "/");

        // candidates to try (original, stripped origin, package mapping, resolved relative)
        const candidates: string[] = [];

        // package://example/meshes/foo.stl -> /example/meshes/foo.stl and example/meshes/foo.stl
        if (urlStr.startsWith("package://")) {
          const without = urlStr.slice("package://".length);
          candidates.push("/" + without);
          candidates.push(without);
        }

        // strip origin if present
        let cleaned = urlStr;
        if (cleaned.startsWith(window.location.origin))
          cleaned = cleaned.slice(window.location.origin.length);

        candidates.push(cleaned);
        candidates.push(cleaned.replace(/^\//, ""));

        if (/^\.\.?\//.test(cleaned)) {
          const resolvedRel = new URL(
            cleaned.replace(/\/+/g, "/"),
            window.location.origin + urdfBase + "dummy.urdf",
          ).pathname;
          candidates.push(resolvedRel);
          candidates.push(resolvedRel.replace(/^\//, ""));
        }

        // try all candidates and lowercase variants
        for (const c of candidates) {
          const n = normalize(c);
          if (fileLookup[n]) {
            console.info(
              "[URLModifier] mapped:",
              urlStr,
              "→",
              fileLookup[n],
              "(candidate:",
              n,
              ")",
            );
            return fileLookup[n];
          }
          if (fileLookup[n.toLowerCase()]) {
            console.info(
              "[URLModifier] mapped:",
              urlStr,
              "→",
              fileLookup[n.toLowerCase()],
              "(candidate:",
              n.toLowerCase(),
              ")",
            );
            return fileLookup[n.toLowerCase()];
          }
          if (fileLookup["/" + n]) {
            console.info(
              "[URLModifier] mapped:",
              urlStr,
              "→",
              fileLookup["/" + n],
              "(candidate:/",
              n,
              ")",
            );
            return fileLookup["/" + n];
          }
        }

        // fallback: handle relative and package like original
        if (urlStr.startsWith("package://")) {
          const withoutScheme = urlStr.slice("package://".length);
          return `/${withoutScheme}`;
        }
        if (/^\.\.?\//.test(urlStr)) {
          return new URL(
            urlStr,
            window.location.origin + urdfBase + "dummy.urdf",
          ).pathname;
        }
        if (urlStr.startsWith(window.location.origin))
          return urlStr.slice(window.location.origin.length);
        return urlStr;
      } catch (e) {
        console.warn("[URLModifier] error", e);
        return urlStr;
      }
    });

    // load meshes through loader's loadMeshCb so URDF loader waits for them
    const meshPromises: Promise<void>[] = [];
    (loader as any).loadMeshCb = function (
      meshPath: string,
      _mgr: THREE.LoadingManager,
      done: (obj: THREE.Object3D) => void,
    ) {
      const useManager = _mgr || manager;
      const ext = meshPath.split(".").pop()?.toLowerCase() ?? "";
      console.info("[loadMeshCb] requested:", meshPath, "ext:", ext);

      const p = new Promise<void>((resolve) => {
        if (ext === "dae" || ext === "collada") {
          try {
            new ColladaLoader(useManager).load(
              meshPath,
              (collada) => {
                const whiteMat = new THREE.MeshStandardMaterial({
                  color: 0xffffff,
                  metalness: 0.1,
                  roughness: 0.6,
                });
                collada.scene.traverse((node: any) => {
                  if (node.isMesh) {
                    node.material = Array.isArray(node.material)
                      ? node.material.map(() => whiteMat.clone())
                      : whiteMat.clone();
                  }
                });
                done(collada.scene);
                resolve();
              },
              undefined,
              (err) => {
                console.error("[loadMeshCb] DAE failed:", meshPath, err);
                resolve();
              },
            );
          } catch (e) {
            console.error("[loadMeshCb] DAE loader exception:", e);
            resolve();
          }
        } else {
          try {
            new STLLoader(useManager).load(
              meshPath,
              (geometry) => {
                done(
                  new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()),
                );
                resolve();
              },
              undefined,
              (err) => {
                console.error("[loadMeshCb] STL failed:", meshPath, err);
                resolve();
              },
            );
          } catch (e) {
            console.error("[loadMeshCb] STL loader exception:", e);
            resolve();
          }
        }
      });
      meshPromises.push(p);
    };

    // finally load the URDF (object URL or app path)
    loader.load(urdfUrl, async (robot) => {
      robotRef.current = robot;
      robot.scale.set(1, 1, 1);
      robot.rotation.set(-Math.PI / 2, 0, 0);

      // wait for meshes
      await Promise.all(meshPromises);

      if (!robotRef.current) return;
      robot.traverse((node: any) => {
        if (node.isMesh) {
          const mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.6,
          });
          node.material = Array.isArray(node.material)
            ? node.material.map(() => mat.clone())
            : mat;
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      try {
        const ex = scene.getObjectByName("robotviz_root");
        if (ex) scene.remove(ex);
      } catch {}
      const container = new THREE.Group();
      container.name = "robotviz_root";
      container.add(robot);
      scene.add(container);
    });

    return () => {
      try {
        const ex = scene.getObjectByName("robotviz_root");
        if (ex) scene.remove(ex);
      } catch {}
      robotRef.current = null;
    };
  }, [uploadedFiles, urdfPath, robotName, scene]);

  useFrame(() => {
    if (!robotRef.current) return;
    const names = ["joint1", "joint2", "joint3", "joint4", "joint5", "joint6"];
    names.forEach((name, i) => {
      const joint = robotRef.current!.joints[name];
      if (joint && typeof joint.setJointValue === "function")
        joint.setJointValue(jointPositions[i]);
    });
  });

  return null;
}

function Scene({
  robotName,
  jointPositions,
  loading,
  uploadedFiles,
  urdfPath,
}: {
  robotName: string;
  jointPositions: number[];
  loading: boolean;
  uploadedFiles?: Record<string, string> | null;
  urdfPath?: string | null;
}) {
  return (
    <>
      <color attach="background" args={["#0a0a0f"]} />
      <fog attach="fog" args={["#0a0a0f", 5, 20]} />
      <ambientLight intensity={0.4} />
      <spotLight
        position={[5, 10, 5]}
        angle={0.3}
        penumbra={1}
        intensity={1}
        castShadow
      />
      <Stars
        radius={50}
        depth={50}
        count={2000}
        factor={4}
        saturation={0}
        fade
        speed={1}
      />
      {!loading && (
        <Float speed={1} rotationIntensity={0.1} floatIntensity={0.3}>
          <RobotLoader
            key={urdfPath || robotName}
            jointPositions={jointPositions}
            robotName={robotName}
            uploadedFiles={uploadedFiles}
            urdfPath={urdfPath}
          />
        </Float>
      )}
      <Grid
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a1a2e"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#00f5ff"
        fadeDistance={15}
        infiniteGrid
      />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.5}
        scale={10}
        blur={2}
        far={4}
      />
      <OrbitControls
        enablePan={false}
        minDistance={1}
        maxDistance={8}
        autoRotate
        autoRotateSpeed={0.5}
      />
    </>
  );
}

const PRESET_ROBOTS = ["ec64", "ec612", "cs66", "ec63"];

function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`}
      />
      <span className="text-xs text-zinc-400">
        {connected ? "Connected" : "Disconnected"}
      </span>
    </div>
  );
}

function JointSlider({
  name,
  value,
  onChange,
  index,
  min = -Math.PI,
  max = Math.PI,
}: {
  name: string;
  value: number;
  onChange: (index: number, value: number) => void;
  index: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="glass-panel p-3 space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium text-cyan-400">{name}</span>
        <span className="text-xs text-zinc-500">{value.toFixed(2)} rad</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(index, parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function StatsPanel({ fps, joints }: { fps: number; joints: number }) {
  return (
    <div className="glass-panel p-4 space-y-3">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        System Stats
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-600">FPS</p>
          <p className="text-lg font-bold text-cyan-400">{fps}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-600">Joints</p>
          <p className="text-lg font-bold text-purple-400">{joints}</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [rosConnected, setRosConnected] = useState(false);
  const [rosUrl, setRosUrl] = useState("ws://localhost:9090");
  const [robotName, setRobotName] = useState("ec63");
  const [jointPositions, setJointPositions] = useState<number[]>([
    0, 0, 0, 0, 0, 0,
  ]);
  const [fps, setFps] = useState(60);
  const [loading, setLoading] = useState(true);
  const rosRef = useRef<any>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Record<
    string,
    string
  > | null>(null);
  const [uploadedUrdfs, setUploadedUrdfs] = useState<string[]>([]);
  const [selectedUploadedUrdf, setSelectedUploadedUrdf] = useState<
    string | null
  >(null);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      setFps(Math.round((frameCount * 1000) / (now - lastTime)));
      frameCount = 0;
      lastTime = now;
    }, 1000);
    const loop = () => {
      frameCount++;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(timer);
  }, [robotName]);

  const connectROS = () => {
    try {
      rosRef.current = new (window as any).ROSLIB.Ros({ url: rosUrl });
      rosRef.current.on("connection", () => {
        setRosConnected(true);
        const listener = new (window as any).ROSLIB.Topic({
          ros: rosRef.current,
          name: "/joint_states",
          messageType: "sensor_msgs/JointState",
        });
        listener.subscribe((msg: any) => {
          if (msg.name && msg.position) {
            const jointNames = [
              "joint1",
              "joint2",
              "joint3",
              "joint4",
              "joint5",
              "joint6",
            ];
            const newPositions = jointNames.map((joint) => {
              const idx = msg.name.indexOf(joint);
              return idx >= 0 ? msg.position[idx] : 0;
            });
            setJointPositions(newPositions);
          }
        });
      });
      rosRef.current.on("error", () => setRosConnected(false));
      rosRef.current.on("close", () => setRosConnected(false));
    } catch (e) {
      console.error("ROS connection error:", e);
    }
  };

  const handleJointChange = (index: number, value: number) => {
    setJointPositions((prev) => {
      const newPositions = [...prev];
      newPositions[index] = value;
      return newPositions;
    });
  };

  const handleRobotChange = (newRobotName: string) => {
    // switching presets clears any uploaded project
    setUploadedFiles(null);
    setUploadedUrdfs([]);
    setSelectedUploadedUrdf(null);
    setRobotName(newRobotName);
    setJointPositions([0, 0, 0, 0, 0, 0]);
    setLoading(true);
  };

  const handleFolderUpload = (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    console.log("[Upload] Raw files count:", files.length);
    if (files.length > 0) {
      const first = files[0] as any;
      console.log(
        "[Upload] First file:",
        first.name,
        first.webkitRelativePath || first.name,
      );
    }
    if (files.length === 0) return;
    processFiles(files);
  };

  // Read DataTransferItemList entries (drag/drop) and recursively gather File objects
  const readFilesFromDataTransferItems = async (
    items: DataTransferItemList,
  ) => {
    const files: any[] = [];

    const readEntry = (entry: any, path = "") =>
      new Promise<void>((resolve) => {
        if (entry.isFile) {
          entry.file((file: File) => {
            // do NOT attempt to set read-only webkitRelativePath on File
            // push a wrapper { file, webkitRelativePath }
            files.push({
              file,
              webkitRelativePath: (path + file.name).replace(/\\/g, "/"),
            });
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const readAll = () => {
            reader.readEntries(async (entries: any[]) => {
              if (!entries.length) return resolve();
              await Promise.all(
                entries.map((en) => readEntry(en, path + entry.name + "/")),
              );
              resolve();
            });
          };
          readAll();
        } else {
          resolve();
        }
      });

    const promises: Promise<void>[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) promises.push(readEntry(entry));
      else {
        // fallback to file if no entry API
        const file = item.getAsFile && item.getAsFile();
        if (file) files.push(file);
      }
    }
    await Promise.all(promises);
    return files;
  };

  const processFiles = (files: any[], folderName?: string) => {
    if (uploadedFiles)
      Object.values(uploadedFiles).forEach((u) => URL.revokeObjectURL(u));
    const map: Record<string, string> = {};
    const urdfs: string[] = [];

    files.forEach((f: any) => {
      // accept either raw File or wrapper { file, webkitRelativePath }
      const fileObj: File = f && f.file ? f.file : f;
      let rel =
        (f && (f.webkitRelativePath || f.path)) ||
        (fileObj as any).webkitRelativePath ||
        fileObj.name;
      if (!rel || rel === folderName) {
        rel = (folderName || "uploaded") + "/" + fileObj.name;
      }
      rel = rel.replace(/\\/g, "/");

      const key = "/" + rel;
      const url = URL.createObjectURL(fileObj);
      map[key] = url;
      map[key.replace(/^\//, "")] = url;
      map[key.toLowerCase()] = url;
      map[key.replace(/^\//, "").toLowerCase()] = url;

      const lowerRel = rel.toLowerCase();
      if (lowerRel.endsWith(".urdf") || lowerRel.endsWith(".xacro")) {
        urdfs.push(key);
      }
    });

    console.log("[Upload] Found URDFs:", urdfs);
    console.log("[Upload] File count:", Object.keys(map).length);

    setUploadedFiles(map);
    setUploadedUrdfs(urdfs);

    let selectedUrdf: string | null = null;
    if (urdfs.length > 0) {
      selectedUrdf = urdfs[0];
    }
    console.log("[Upload] Selected URDF:", selectedUrdf);
    setSelectedUploadedUrdf(selectedUrdf);

    if (selectedUrdf) {
      const parts = selectedUrdf.split("/").filter(Boolean);
      if (parts.length > 0) setRobotName(parts[0]);
    }

    setLoading(true);
    setTimeout(() => setLoading(false), 800);
  };

  const handleDrop = (e: any) => {
    e.preventDefault();
    (async () => {
      let files: File[] = [];
      try {
        if (
          e.dataTransfer &&
          e.dataTransfer.items &&
          e.dataTransfer.items.length
        ) {
          files = await readFilesFromDataTransferItems(e.dataTransfer.items);
        }
      } catch (err) {
        console.warn("[handleDrop] read entries failed, falling back", err);
      }
      if (!files.length)
        files = Array.from(e.dataTransfer?.files || []) as File[];
      if (files.length === 0) return;
      const firstFile = files[0] as any;
      const path =
        (firstFile && (firstFile.webkitRelativePath || firstFile.path)) ||
        (firstFile &&
          firstFile.file &&
          (firstFile.webkitRelativePath ||
            firstFile.file.webkitRelativePath)) ||
        (firstFile && firstFile.file && firstFile.file.name) ||
        firstFile.name;
      const folderName = (path || "").split("/")[0];
      processFiles(files, folderName);
    })();
  };

  const handleDragOver = (e: any) => {
    e.preventDefault();
  };

  const clearUploads = () => {
    if (uploadedFiles)
      Object.values(uploadedFiles).forEach((u) => URL.revokeObjectURL(u));
    setUploadedFiles(null);
    setUploadedUrdfs([]);
    setSelectedUploadedUrdf(null);
  };

  return (
    <div className="min-h-screen mesh-gradient">
      <div className="fixed top-0 left-0 right-0 z-50 glass-panel border-t-0 border-x-0 rounded-none">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-400 to-purple-500 flex items-center justify-center">
              <span className="text-xl">🦾</span>
            </div>
            <div>
              <h1 className="text-lg font-bold bg-linear-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                RobotViz
              </h1>
              <p className="text-[10px] text-zinc-500">
                {robotName.toUpperCase()} Robot Visualization
              </p>
            </div>
          </div>
          <ConnectionStatus connected={rosConnected} />
        </div>
      </div>

      <div className="pt-24 pb-8 px-6 max-w-screen-2xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div
              className="glass-panel glow-cyan overflow-hidden relative"
              style={{ height: "70vh" }}
            >
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-cyan-400 text-sm">
                      Loading {robotName.toUpperCase()}...
                    </p>
                  </div>
                </div>
              )}
              <Canvas shadows camera={{ position: [3, 2, 3], fov: 50 }}>
                <Suspense fallback={null}>
                  <Scene
                    robotName={robotName}
                    jointPositions={jointPositions}
                    loading={loading}
                    uploadedFiles={uploadedFiles}
                    urdfPath={selectedUploadedUrdf}
                  />
                </Suspense>
              </Canvas>
              <div className="absolute bottom-4 left-4 glass-panel px-4 py-2">
                <p className="text-xs text-zinc-500">
                  Drag to rotate • Scroll to zoom
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel p-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                Robot Model
              </h3>
              <div className="space-y-3">
                <select
                  value={robotName}
                  onChange={(e) => handleRobotChange(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-cyan-400 focus:outline-none"
                >
                  {PRESET_ROBOTS.map((robot) => (
                    <option key={robot} value={robot}>
                      {robot.toUpperCase()}
                    </option>
                  ))}
                </select>

                <div
                  className="space-y-2 mt-3"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <label className="text-xs text-zinc-500 flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    Upload Folder (URDF + meshes)
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      {...({
                        webkitdirectory: true,
                        directory: true,
                        multiple: true,
                      } as any)}
                      onChange={handleFolderUpload}
                      className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 cursor-pointer file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-cyan-500/20 file:text-cyan-400 hover:file:bg-cyan-500/30"
                      style={{ paddingLeft: "2.5rem" }}
                    />
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-[10px] text-zinc-600">
                    Select a folder containing .urdf file and mesh files
                  </p>

                  {uploadedUrdfs.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-400">
                        Select URDF
                      </label>
                      <select
                        value={selectedUploadedUrdf ?? ""}
                        onChange={(e) => {
                          setSelectedUploadedUrdf(e.target.value || null);
                          setLoading(true);
                          setTimeout(() => setLoading(false), 800);
                        }}
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300"
                      >
                        {uploadedUrdfs.map((u) => (
                          <option key={u} value={u}>
                            {u.replace(/^\//, "")}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setLoading(true);
                            setTimeout(() => setLoading(false), 800);
                          }}
                          className="flex-1 py-2 rounded-lg text-sm bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                        >
                          Load Uploaded
                        </button>
                        <button
                          onClick={clearUploads}
                          className="py-2 px-3 rounded-lg text-sm bg-red-600/10 text-red-400 border border-red-600/20"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="glass-panel p-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                ROS Connection
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={rosUrl}
                  onChange={(e) => setRosUrl(e.target.value)}
                  placeholder="ws://localhost:9090"
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  onClick={connectROS}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                    rosConnected
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30"
                  }`}
                >
                  {rosConnected ? "Connected" : "Connect"}
                </button>
              </div>
            </div>

            <StatsPanel fps={fps} joints={6} />

            <div className="glass-panel p-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                Joint Controls
              </h3>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {[
                  "joint1",
                  "joint2",
                  "joint3",
                  "joint4",
                  "joint5",
                  "joint6",
                ].map((name, index) => (
                  <JointSlider
                    key={name}
                    name={name}
                    value={jointPositions[index] || 0}
                    index={index}
                    onChange={handleJointChange}
                    min={name === "joint3" ? -2.79 : -Math.PI}
                    max={name === "joint3" ? 2.79 : Math.PI}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
