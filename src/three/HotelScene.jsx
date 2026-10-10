import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, Sparkles, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { cityWindowTexture, signTexture } from './textures.js';

const FLOORS = 8;
const FLOOR_H = 0.9;
const W = 4.2;
const D = 3.2;
const TOWER_H = FLOORS * FLOOR_H;
const BASE_Y = 1.1; // the lobby podium sits under the tower

const isSmall = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- Tower ---------------- */

function Windows() {
  const ref = useRef();
  const lit = useMemo(() => new THREE.Color(1.45, 0.95, 0.45), []);
  const pink = useMemo(() => new THREE.Color(1.4, 0.45, 0.8), []);
  const off = useMemo(() => new THREE.Color(0.05, 0.04, 0.08), []);

  const slots = useMemo(() => {
    const out = [];
    const cols = { front: 5, side: 4 };
    for (let f = 0; f < FLOORS; f++) {
      const y = BASE_Y + f * FLOOR_H + FLOOR_H / 2;
      for (let i = 0; i < cols.front; i++) {
        const x = -W / 2 + (W / cols.front) * (i + 0.5);
        out.push({ p: [x, y, D / 2 + 0.011], r: 0 });
        out.push({ p: [x, y, -D / 2 - 0.011], r: Math.PI });
      }
      for (let i = 0; i < cols.side; i++) {
        const z = -D / 2 + (D / cols.side) * (i + 0.5);
        out.push({ p: [W / 2 + 0.011, y, z], r: Math.PI / 2 });
        out.push({ p: [-W / 2 - 0.011, y, z], r: -Math.PI / 2 });
      }
    }
    return out.map((s) => ({ ...s, on: Math.random() > 0.35, pink: Math.random() > 0.92 }));
  }, []);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    slots.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.r);
      m.compose(new THREE.Vector3(...s.p), q, new THREE.Vector3(1, 1, 1));
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, s.on ? (s.pink ? pink : lit) : off);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [slots, lit, pink, off]);

  // Guests switching their lights on and off.
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (reducedMotion()) return;
    clock.current += dt;
    if (clock.current < 0.35) return;
    clock.current = 0;
    const i = Math.floor(Math.random() * slots.length);
    slots[i].on = !slots[i].on;
    ref.current.setColorAt(i, slots[i].on ? (slots[i].pink ? pink : lit) : off);
    ref.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, slots.length]}>
      <planeGeometry args={[0.36, 0.56]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Sign({ text, position, rotation = [0, 0, 0], width = 4, color }) {
  // Redraw once the display font has loaded so the sign uses it.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);
  const tex = useMemo(() => signTexture(text, color), [text, color, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, width * (192 / 1024)]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} color={[1.6, 1.6, 1.6]} />
    </mesh>
  );
}

function Halo() {
  const a = useRef();
  const b = useRef();
  useFrame((_, dt) => {
    if (reducedMotion()) return;
    a.current.rotation.z += dt * 0.35;
    b.current.rotation.z -= dt * 0.22;
  });
  const top = BASE_Y + TOWER_H + 1.5;
  return (
    <group position={[0, top, 0]}>
      <mesh ref={a} rotation={[Math.PI / 2.3, 0, 0]}>
        <torusGeometry args={[3.4, 0.03, 12, 160]} />
        <meshBasicMaterial color={[3, 2, 0.8]} toneMapped={false} />
      </mesh>
      <mesh ref={b} rotation={[Math.PI / 1.8, 0.4, 0]}>
        <torusGeometry args={[4.1, 0.02, 12, 160]} />
        <meshBasicMaterial color={[2.6, 0.7, 1.4]} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={[4, 3, 1.5]} toneMapped={false} />
      </mesh>
      <pointLight color="#ffcf7a" intensity={8} distance={12} />
    </group>
  );
}

function Tower({ name }) {
  const group = useRef();
  useFrame((state) => {
    // Lean very slightly toward the pointer.
    const t = state.pointer.x * 0.12;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, t, 2, 1 / 60);
  });
  const slabs = Array.from({ length: FLOORS + 1 }, (_, i) => BASE_Y + i * FLOOR_H);

  return (
    <group ref={group}>
      {/* Lobby podium */}
      <mesh position={[0, BASE_Y / 2, 0.3]} castShadow>
        <boxGeometry args={[W + 1.6, BASE_Y, D + 1.4]} />
        <meshStandardMaterial color="#120f1c" metalness={0.5} roughness={0.35} />
      </mesh>
      {/* Glass lobby front */}
      <mesh position={[0, BASE_Y / 2 - 0.05, D / 2 + 1.01]}>
        <planeGeometry args={[W + 0.6, BASE_Y - 0.3]} />
        <meshBasicMaterial color={[0.34, 0.21, 0.1]} toneMapped={false} />
      </mesh>
      {/* Entrance canopy */}
      <mesh position={[0, BASE_Y + 0.02, D / 2 + 1.6]}>
        <boxGeometry args={[3, 0.08, 1.4]} />
        <meshStandardMaterial color="#1b1726" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, BASE_Y - 0.03, D / 2 + 2.3]}>
        <boxGeometry args={[3, 0.03, 0.03]} />
        <meshBasicMaterial color={[3, 2, 0.8]} toneMapped={false} />
      </mesh>
      <Sign text={name} position={[0, BASE_Y + 0.28, D / 2 + 2.28]} width={3} />

      {/* Tower body */}
      <mesh position={[0, BASE_Y + TOWER_H / 2, 0]} castShadow>
        <boxGeometry args={[W, TOWER_H, D]} />
        <meshStandardMaterial color="#0e0c16" metalness={0.7} roughness={0.3} />
      </mesh>
      {slabs.map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[W + 0.14, 0.05, D + 0.14]} />
          <meshBasicMaterial color={[0.9, 0.6, 0.25]} toneMapped={false} />
        </mesh>
      ))}
      {/* Vertical light fins on the corners */}
      {[
        [W / 2 + 0.04, D / 2 + 0.04],
        [-W / 2 - 0.04, D / 2 + 0.04],
        [W / 2 + 0.04, -D / 2 - 0.04],
        [-W / 2 - 0.04, -D / 2 - 0.04],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, BASE_Y + TOWER_H / 2, z]}>
          <boxGeometry args={[0.05, TOWER_H, 0.05]} />
          <meshBasicMaterial color={[2.4, 0.7, 1.3]} toneMapped={false} />
        </mesh>
      ))}
      <Windows />

      {/* Roof + rooftop sign */}
      <mesh position={[0, BASE_Y + TOWER_H + 0.15, 0]}>
        <boxGeometry args={[W - 0.6, 0.3, D - 0.6]} />
        <meshStandardMaterial color="#151221" metalness={0.6} roughness={0.4} />
      </mesh>
      <Sign text="JD RESIDENCY" position={[0, BASE_Y + TOWER_H + 0.75, D / 2 - 0.3]} width={4.4} />
      <Sign
        text="JD RESIDENCY"
        position={[0, BASE_Y + TOWER_H + 0.75, -D / 2 + 0.3]}
        rotation={[0, Math.PI, 0]}
        width={4.4}
        color="#ff8fb4"
      />
      <Halo />
    </group>
  );
}

/* ---------------- City ---------------- */

function City({ count }) {
  const ref = useRef();
  const tex = useMemo(() => cityWindowTexture(), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 30;
      const h = 2 + Math.random() * (r > 30 ? 16 : 9);
      const w = 1.5 + Math.random() * 2.5;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      m.compose(new THREE.Vector3(Math.cos(angle) * r, h / 2, Math.sin(angle) * r), q, new THREE.Vector3(w, h, w));
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    return () => tex.dispose();
  }, [count, tex]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry />
      <meshStandardMaterial color="#0b0a12" emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.1} roughness={0.8} />
    </instancedMesh>
  );
}

/** Headlights and tail lights circling the block. */
function Traffic({ count = 26 }) {
  const ref = useRef();
  const cars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        lane: i % 2,
        offset: Math.random() * Math.PI * 2,
        speed: 0.12 + Math.random() * 0.08,
      })),
    [count],
  );
  const white = useMemo(() => new THREE.Color(3, 3, 2.6), []);
  const red = useMemo(() => new THREE.Color(3, 0.25, 0.3), []);
  useEffect(() => {
    cars.forEach((c, i) => ref.current.setColorAt(i, c.lane ? red : white));
    ref.current.instanceColor.needsUpdate = true;
  }, [cars, red, white]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  useFrame((state) => {
    const t = reducedMotion() ? 0 : state.clock.elapsedTime;
    cars.forEach((c, i) => {
      const dir = c.lane ? -1 : 1;
      const r = c.lane ? 9.4 : 8.6;
      const a = c.offset + dir * t * c.speed;
      pos.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      q.setFromAxisAngle(up, -a);
      m.compose(pos, q, scale);
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.08, 0.06, 0.5]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Ground({ reflective }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[220, 220]} />
        {reflective ? (
          <MeshReflectorMaterial
            blur={[300, 80]}
            resolution={512}
            mixBlur={1}
            mixStrength={28}
            roughness={0.9}
            depthScale={1.1}
            minDepthThreshold={0.4}
            maxDepthThreshold={1.4}
            color="#07060c"
            metalness={0.6}
            mirror={0.6}
          />
        ) : (
          <meshStandardMaterial color="#07060c" metalness={0.6} roughness={0.5} />
        )}
      </mesh>
      {/* Road ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[8.1, 9.9, 96]} />
        <meshStandardMaterial color="#0c0b13" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[8.99, 9.01, 128]} />
        <meshBasicMaterial color={[0.8, 0.6, 0.3]} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------------- Camera driven by page scroll ---------------- */

function CameraRig({ scrollRef }) {
  const look = useMemo(() => new THREE.Vector3(0, 3, 0), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const p = scrollRef.current;
    const small = state.size.width < 760;
    const angle = 0.35 + p * Math.PI * 1.4;
    const radius = (small ? 21 : 17) + p * 4;
    const height = 2.4 + p * 8 + state.pointer.y * 0.6;
    target.set(Math.sin(angle) * radius + state.pointer.x * 0.8, height, Math.cos(angle) * radius);
    // On wide screens aim left of the tower so it sits on the right, clear of the text.
    const side = small ? 0 : Math.min(5.5, state.size.width / 280);
    lookTarget.set(-Math.cos(angle) * side, (small ? 1.2 : 3.8) + p * 2, Math.sin(angle) * side);
    const k = 1 - Math.exp(-dt * 3);
    state.camera.position.lerp(target, k);
    look.lerp(lookTarget, k);
    state.camera.lookAt(look);
  });
  return null;
}

export default function HotelScene({ name = 'HOTEL JD RESIDENCY' }) {
  const scrollRef = useRef(0);
  const small = useMemo(isSmall, []);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollRef.current = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <Canvas
      dpr={small ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [6, 3, 15], fov: small ? 55 : 45, near: 0.1, far: 200 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#08070d']} />
      <fog attach="fog" args={['#08070d', 18, 70]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[-8, 12, 6]} intensity={0.6} color="#9f8cff" />
      <pointLight position={[0, 1.2, 6]} intensity={14} distance={10} color="#ffb766" />

      <Tower name={name.toUpperCase()} />
      <City count={small ? 60 : 130} />
      <Traffic count={small ? 16 : 28} />
      <Ground reflective={!small} />
      <Stars radius={90} depth={40} count={small ? 1500 : 3500} factor={3} saturation={0} fade speed={0.6} />
      <Sparkles count={small ? 40 : 90} scale={[14, 12, 14]} position={[0, 6, 0]} size={3} speed={0.3} color="#ffcf7a" />

      <CameraRig scrollRef={scrollRef} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={1} intensity={1.1} radius={0.7} />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
