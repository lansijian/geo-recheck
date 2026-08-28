import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Html, Line, Sky, useTexture } from "@react-three/drei";
import { Group, MathUtils, PCFShadowMap, PlaneGeometry, Vector3 } from "three";
import type { FieldStep, ShowcaseCase } from "./showcaseData";

type CaptureKind = "context" | "closeup";

const CAPTURE_STEPS = new Set(["capture_context", "capture_closeup"]);
const PHONE_STEPS = new Set(["raise_phone", "capture_context", "capture_closeup"]);
const WALK_STEPS = new Set(["walking", "approach_crack"]);

function Terrain() {
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(30, 24, 36, 28);
    const positions = plane.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const distanceFromSite = Math.max(0, Math.abs(x) - 5) + Math.max(0, Math.abs(y) - 6);
      positions.setZ(index, Math.sin(x * 0.48) * 0.22 + Math.cos(y * 0.36) * 0.18 + distanceFromSite * 0.08);
    }
    plane.computeVertexNormals();
    return plane;
  }, []);
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow><meshStandardMaterial color="#78906f" roughness={1} /></mesh>;
}

function House({ activeCase, showRoi }: { activeCase: ShowcaseCase; showRoi: boolean }) {
  const currentTexture = useTexture(activeCase.assets.current_close);
  const pulseRef = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!pulseRef.current) return;
    const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.08;
    pulseRef.current.scale.setScalar(scale);
  });
  return (
    <group position={[0, 0, -2]}>
      <mesh position={[0, 2.05, 0]} castShadow receiveShadow><boxGeometry args={[6.4, 4.2, 4.2]} /><meshStandardMaterial color="#d9d1bd" roughness={.92} /></mesh>
      <mesh position={[0, 4.35, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[4.8, 1.5, 4]} /><meshStandardMaterial color="#684b3d" roughness={.85} /></mesh>
      {[[-2.1, 2.65], [0, 2.65], [2.1, 2.65]].map(([x, y]) => <mesh key={`${x}-${y}`} position={[x, y, 2.11]}><boxGeometry args={[.9, .95, .06]} /><meshStandardMaterial color="#6d8988" metalness={.1} roughness={.45} /></mesh>)}
      <mesh position={[-2.25, .95, 2.12]}><boxGeometry args={[1.05, 1.85, .08]} /><meshStandardMaterial color="#715441" /></mesh>
      <mesh position={[1.45, 1.55, 2.13]}><planeGeometry args={[2.35, 1.42]} /><meshBasicMaterial map={currentTexture} toneMapped={false} /></mesh>
      <group ref={pulseRef} visible={showRoi} position={[1.92, 1.25, 2.18]}>
        <mesh><ringGeometry args={[.32, .4, 36]} /><meshBasicMaterial color="#f2b84b" transparent opacity={.9} /></mesh>
      </group>
      <mesh position={[0, 2.05, 2.15]}><boxGeometry args={[6.2, .08, .08]} /><meshStandardMaterial color="#887d68" /></mesh>
    </group>
  );
}

function SiteStructures() {
  return (
    <>
      <mesh position={[-4.4, .65, -.6]} castShadow receiveShadow><boxGeometry args={[1.0, 1.5, 7.5]} /><meshStandardMaterial color="#777c70" roughness={1} /></mesh>
      <group position={[0, 0, 2.25]}>
        <mesh position={[-2.4, .03, 0]}><boxGeometry args={[4.8, .14, .7]} /><meshStandardMaterial color="#66736d" /></mesh>
        <mesh position={[2.4, .03, 0]}><boxGeometry args={[4.8, .14, .7]} /><meshStandardMaterial color="#66736d" /></mesh>
        <mesh position={[0, -.03, 0]}><boxGeometry args={[9.6, .08, .3]} /><meshStandardMaterial color="#334d4b" /></mesh>
      </group>
      <Line points={[[-5.2, .04, 4.8], [-3.6, .05, 3.9], [-1.3, .05, 2.5], [.8, .05, 1.25]]} color="#e7c56e" lineWidth={3} dashed dashScale={2} dashSize={.25} gapSize={.18} />
    </>
  );
}

function Worker({ step, activeCase }: { step: FieldStep; activeCase: ShowcaseCase }) {
  const group = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const target = useMemo(() => new Vector3(), []);
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const positions = activeCase.field_scene;
    const destination = step.id === "task" ? positions.worker_entry : step.id === "approach_crack" || ["capture_closeup", "geometry", "ai_review", "result", "human_confirm", "record"].includes(step.id) ? positions.worker_close_stop : positions.worker_context_stop;
    target.set(...destination);
    group.current.position.lerp(target, 1 - Math.exp(-delta * (WALK_STEPS.has(step.id) ? .75 : 2.4)));
    group.current.rotation.y = MathUtils.damp(group.current.rotation.y, step.id === "walking" ? -.35 : step.id === "approach_crack" ? -.15 : 0, 3, delta);
    const walking = WALK_STEPS.has(step.id);
    // The worker faces the wall along -Z. Positive X rotation brings the hands and
    // phone forward; the previous negative angle put them behind the torso. Keep
    // the pelvis level and use opposing limb swings instead of bouncing the body.
    group.current.position.y = destination[1];
    const stride = walking ? Math.sin(clock.elapsedTime * 6) : 0;
    const leftArmAngle = PHONE_STEPS.has(step.id) ? 1.12 : stride * .42;
    const rightArmAngle = PHONE_STEPS.has(step.id) ? 1.12 : -stride * .42;
    if (leftArm.current) leftArm.current.rotation.x = MathUtils.damp(leftArm.current.rotation.x, leftArmAngle, 6, delta);
    if (rightArm.current) rightArm.current.rotation.x = MathUtils.damp(rightArm.current.rotation.x, rightArmAngle, 6, delta);
    if (leftLeg.current) leftLeg.current.rotation.x = MathUtils.damp(leftLeg.current.rotation.x, -stride * .34, 7, delta);
    if (rightLeg.current) rightLeg.current.rotation.x = MathUtils.damp(rightLeg.current.rotation.x, stride * .34, 7, delta);
  });
  return (
    <group ref={group} position={activeCase.field_scene.worker_entry}>
      <mesh position={[0, 1.68, 0]} castShadow><sphereGeometry args={[.2, 18, 14]} /><meshStandardMaterial color="#d7a57b" /></mesh>
      <mesh position={[0, 1.05, 0]} castShadow><capsuleGeometry args={[.27, .75, 6, 12]} /><meshStandardMaterial color="#e39b23" /></mesh>
      <group ref={leftArm} position={[-.32, 1.28, 0]}><mesh position={[0, -.35, 0]} castShadow><capsuleGeometry args={[.08, .55, 4, 8]} /><meshStandardMaterial color="#d7a57b" /></mesh></group>
      <group ref={rightArm} position={[(.32), 1.28, 0]}><mesh position={[0, -.35, 0]} castShadow><capsuleGeometry args={[.08, .55, 4, 8]} /><meshStandardMaterial color="#d7a57b" /></mesh><mesh position={[0, -.7, -.08]}><boxGeometry args={[.22, .38, .05]} /><meshStandardMaterial color="#17231f" /></mesh></group>
      <group ref={leftLeg} position={[-.14, .63, 0]}><mesh position={[0, -.28, 0]} castShadow><capsuleGeometry args={[.09, .55, 4, 8]} /><meshStandardMaterial color="#263a35" /></mesh></group>
      <group ref={rightLeg} position={[(.14), .63, 0]}><mesh position={[0, -.28, 0]} castShadow><capsuleGeometry args={[.09, .55, 4, 8]} /><meshStandardMaterial color="#263a35" /></mesh></group>
    </group>
  );
}

function CameraRig({ step }: { step: FieldStep }) {
  const { camera } = useThree();
  const targetPosition = useMemo(() => new Vector3(), []);
  const lookTarget = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const close = ["capture_closeup", "geometry", "ai_review", "result", "human_confirm", "record"].includes(step.id);
    const context = ["raise_phone", "capture_context"].includes(step.id);
    if (close) { targetPosition.set(2.8, 2.15, 3.05); lookTarget.set(1.45, 1.55, .05); }
    else if (context) { targetPosition.set(5.8, 4.25, 8.2); lookTarget.set(0, 1.8, -1.0); }
    else if (step.id === "walking") { targetPosition.set(7.7, 5.6, 11.4); lookTarget.set(-1.2, 1.1, 1.1); }
    else { targetPosition.set(8.6, 6.2, 12.8); lookTarget.set(0, 1.6, -1.0); }
    camera.position.lerp(targetPosition, 1 - Math.exp(-delta * 1.5));
    camera.lookAt(lookTarget);
  });
  return null;
}

function SceneCapture({ step, onCapture, onFlash }: { step: FieldStep; onCapture: (kind: CaptureKind, dataUrl: string) => void; onFlash: () => void }) {
  const { gl } = useThree();
  const captured = useRef<string>("");
  useEffect(() => {
    if (!CAPTURE_STEPS.has(step.id) || captured.current === step.id) return;
    captured.current = step.id;
    const timer = window.setTimeout(() => {
      onFlash();
      onCapture(step.id === "capture_context" ? "context" : "closeup", gl.domElement.toDataURL("image/png"));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [gl, onCapture, onFlash, step.id]);
  return null;
}

function FieldWorld({ activeCase, step, onCapture, onFlash }: { activeCase: ShowcaseCase; step: FieldStep; onCapture: (kind: CaptureKind, dataUrl: string) => void; onFlash: () => void }) {
  const showRoi = activeCase.field_scene.controlled_roi && ["result", "human_confirm"].includes(step.id);
  return (
    <>
      <color attach="background" args={["#b9ccc0"]} />
      <fog attach="fog" args={["#b9ccc0", 16, 34]} />
      <ambientLight intensity={1.1} />
      <directionalLight castShadow position={[7, 12, 8]} intensity={2.2} shadow-mapSize={[1024, 1024]} />
      <Sky sunPosition={[5, 8, 3]} turbidity={7} rayleigh={1.2} />
      <Terrain /><House activeCase={activeCase} showRoi={showRoi} /><SiteStructures /><Worker step={step} activeCase={activeCase} />
      <ContactShadows position={[0, -.12, 0]} opacity={.35} scale={20} blur={2.5} far={8} />
      <Html position={[1.45, 2.35, .2]} center distanceFactor={8}><div className="three-point-label"><b>CRACK-W01</b><span>墙面复测点</span></div></Html>
      <CameraRig step={step} /><SceneCapture step={step} onCapture={onCapture} onFlash={onFlash} />
    </>
  );
}

export default function ShowcaseScene({ activeCase, step, onCapture }: { activeCase: ShowcaseCase; step: FieldStep; onCapture: (kind: CaptureKind, dataUrl: string) => void }) {
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const triggerFlash = useCallback(() => {
    setFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 260);
  }, []);
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);
  const workerTarget = step.id === "task" ? activeCase.field_scene.worker_entry : step.id === "approach_crack" || ["capture_closeup", "geometry", "ai_review", "result", "human_confirm", "record"].includes(step.id) ? activeCase.field_scene.worker_close_stop : activeCase.field_scene.worker_context_stop;
  return (
    <section className="showcase-scene" aria-label="基层巡查三维现场" data-testid="showcase-scene" data-worker-position={workerTarget.join(",")} data-camera-mode={["capture_closeup", "geometry", "ai_review", "result", "human_confirm", "record"].includes(step.id) ? "close" : "wide"}>
      <header><div><span>CANONICAL FIELD SCENE</span><strong>{step.sceneTitle}</strong></div><small>Three.js 实时空间 · 程序化低多边形现场</small></header>
      <div className="three-stage">
        <Canvas data-testid="field-canvas" shadows={{ type: PCFShadowMap }} dpr={[1, 1.5]} camera={{ position: [8.6, 6.2, 12.8], fov: 42 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <Suspense fallback={null}><FieldWorld activeCase={activeCase} step={step} onCapture={onCapture} onFlash={triggerFlash} /></Suspense>
        </Canvas>
        <div className={`three-shutter ${flash ? "active" : ""}`} />
        {PHONE_STEPS.has(step.id) ? <div className="scene-viewfinder" aria-hidden="true"><i /><i /><i /><i /><span>{step.id === "capture_closeup" ? "近景 · CRACK-W01" : "现场全景"}</span></div> : null}
        <div className="scene-hud"><span>MP-03</span><b>{step.label}</b><small>房屋 · 挡墙 · 排水沟 · 裂缝点</small></div>
        {activeCase.field_scene.controlled_roi && ["result", "human_confirm"].includes(step.id) ? <div className="roi-disclosure">受控演示变化区域 · 非模型定位框</div> : null}
      </div>
      <footer className="scene-role-strip"><span><b>量</b> OpenCV 几何</span><span><b>看</b> StepFun 回放</span><span><b>确认</b> 监测员</span><span><b>留痕</b> SQLite</span></footer>
    </section>
  );
}
