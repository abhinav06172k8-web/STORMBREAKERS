import { type ReactNode, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles, Stars } from "@react-three/drei";
import * as THREE from "three";

type VisualMode = "cinematic" | "balanced" | "performance";

function ParallaxGroup({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const target = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const move = (event: PointerEvent) => {
      target.current.x = (event.clientX / window.innerWidth - 0.5) * 0.14;
      target.current.y = (event.clientY / window.innerHeight - 0.5) * 0.1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, target.current.x, 1.2, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, target.current.y, 1.2, delta);
  });
  return <group ref={group}>{children}</group>;
}

function BrandEmblem() {
  const shape = new THREE.Shape();
  shape.moveTo(-.68, .92); shape.lineTo(.68, .92); shape.lineTo(.68, .59); shape.lineTo(-.27, .59);
  shape.lineTo(-.27, .16); shape.lineTo(.47, .16); shape.lineTo(.47, -.17); shape.lineTo(-.27, -.17);
  shape.lineTo(-.27, -.59); shape.lineTo(.68, -.59); shape.lineTo(.68, -.92); shape.lineTo(-.68, -.92); shape.closePath();
  return <mesh position={[3.45, 2.5, -1.5]} rotation={[.04, -.18, -.04]} scale={.72}>
    <extrudeGeometry args={[shape, { depth: .2, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .045, bevelThickness: .04, curveSegments: 2 }]} />
    <meshPhysicalMaterial color="#93eaff" emissive="#257dce" emissiveIntensity={1.25} metalness={.74} roughness={.19} clearcoat={1} clearcoatRoughness={.1} transparent opacity={.9} />
  </mesh>;
}

function SpaceObjects({ mode, home }: { mode: VisualMode; home: boolean }) {
  const planet = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (planet.current) planet.current.rotation.y += delta * 0.035;
  });
  return <>
    <ambientLight intensity={0.45} />
    <pointLight position={[0, 2, 3]} intensity={2.4} color="#55dcff" distance={15} />
    <pointLight position={[-5, -1, -3]} intensity={1.5} color="#8d56ff" distance={13} />
    <Stars radius={82} depth={42} count={mode === "cinematic" ? 520 : 240} factor={1.55} saturation={0.12} fade speed={0.08} />
    <Sparkles count={mode === "cinematic" ? 28 : 12} scale={[19, 10, 10]} size={1.1} speed={0.08} color="#87dfff" opacity={0.28} />
    <ParallaxGroup>
      {home && <BrandEmblem />}
      {home && <Float speed={0.28} rotationIntensity={0.06} floatIntensity={0.1}>
        <mesh ref={planet} position={[7.1, 4.1, -9]} scale={.48}>
          <sphereGeometry args={[1, 48, 48]} />
          <meshPhysicalMaterial color="#222169" emissive="#241a77" emissiveIntensity={0.32} roughness={0.34} metalness={0.34} clearcoat={0.9} />
        </mesh>
        <mesh position={[7.1, 4.1, -9]} rotation={[0.35, 0.12, -0.32]}>
          <torusGeometry args={[0.66, 0.012, 6, 72]} />
          <meshBasicMaterial color="#50dfff" transparent opacity={0.38} />
        </mesh>
      </Float>}
      <Float speed={0.3} rotationIntensity={0.1} floatIntensity={0.12}>
        <mesh position={[-5.8, -2.9, -8]} rotation={[0.24, 0.35, 0.1]} scale={0.36}>
          <octahedronGeometry args={[1, 0]} />
          <meshPhysicalMaterial color="#4a477a" emissive="#382b8c" emissiveIntensity={0.2} metalness={0.52} roughness={0.35} transparent opacity={0.3} />
        </mesh>
      </Float>
    </ParallaxGroup>
  </>;
}

export default function ImmersiveWorld({ mode, home = false }: { mode: VisualMode; home?: boolean }) {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  if (mode === "performance") return <div className="space-world space-world-static" aria-hidden="true" />;
  return <div className={`space-world space-world-${mode}`} aria-hidden="true">
    <Canvas frameloop={visible ? "always" : "never"} dpr={mode === "cinematic" ? [1, 1.45] : [1, 1.1]} camera={{ position: [0, 0, 10], fov: 54 }} gl={{ alpha: true, antialias: mode === "cinematic", powerPreference: "low-power" }}>
      <SpaceObjects mode={mode} home={home} />
    </Canvas>
  </div>;
}
