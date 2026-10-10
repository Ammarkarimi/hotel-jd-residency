import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { labelTexture, skylineTexture } from './textures.js';

const ROOM_W = 6.4;
const ROOM_D = 5.2;
const ROOM_H = 3;

function Label({ position, children }) {
  const text = String(children);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true));
  }, []);
  const { tex, aspect } = useMemo(() => labelTexture(text), [text, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  const height = 0.26;
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function Shell() {
  const sky = useMemo(() => skylineTexture(), []);
  useEffect(() => () => sky.dispose(), [sky]);
  return (
    <group>
      {/* Floor: warm wood */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color="#6b4a33" roughness={0.55} />
      </mesh>
      {/* Plank lines */}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-ROOM_W / 2 + (i + 1) * (ROOM_W / 12), 0.002, 0]}>
          <planeGeometry args={[0.012, ROOM_D]} />
          <meshBasicMaterial color="#4a3222" />
        </mesh>
      ))}
      {/* Back wall */}
      <mesh position={[0, ROOM_H / 2, -ROOM_D / 2]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshStandardMaterial color="#e6d9c6" roughness={0.9} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-ROOM_W / 2, ROOM_H / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[ROOM_D, ROOM_H]} />
        <meshStandardMaterial color="#d9cab3" roughness={0.9} />
      </mesh>
      {/* Right wall with a window */}
      <group position={[ROOM_W / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, ROOM_H / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM_D, ROOM_H]} />
          <meshStandardMaterial color="#d9cab3" roughness={0.9} />
        </mesh>
        <mesh position={[0.2, 1.65, 0.01]}>
          <planeGeometry args={[2.6, 1.6]} />
          <meshBasicMaterial map={sky} toneMapped={false} />
        </mesh>
        {/* Frame */}
        {[
          [0.2, 2.47, 2.75, 0.08],
          [0.2, 0.83, 2.75, 0.08],
          [-1.13, 1.65, 0.08, 1.7],
          [1.53, 1.65, 0.08, 1.7],
          [0.2, 1.65, 0.05, 1.6],
        ].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.04]}>
            <boxGeometry args={[w, h, 0.06]} />
            <meshStandardMaterial color="#2a2230" roughness={0.4} metalness={0.4} />
          </mesh>
        ))}
        {/* Sheer curtain */}
        <mesh position={[1.75, 1.6, 0.12]}>
          <boxGeometry args={[0.5, 2.3, 0.04]} />
          <meshStandardMaterial color="#f4ece0" roughness={1} transparent opacity={0.85} />
        </mesh>
      </group>
      {/* Skirting */}
      <mesh position={[0, 0.05, -ROOM_D / 2 + 0.01]}>
        <boxGeometry args={[ROOM_W, 0.1, 0.02]} />
        <meshStandardMaterial color="#3b2a20" />
      </mesh>
    </group>
  );
}

function Lamp({ position, accent }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.27, 0]} castShadow>
        <boxGeometry args={[0.55, 0.54, 0.45]} />
        <meshStandardMaterial color="#3a2a22" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.03, 0.06, 0.3, 12]} />
        <meshStandardMaterial color="#b88a3a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.13, 0.2, 0.24, 24, 1, true]} />
        <meshStandardMaterial color="#fff1d6" emissive="#ffcf8a" emissiveIntensity={1.4} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 0.95, 0.1]} intensity={2.2} distance={3.5} color="#ffbf73" />
      <mesh position={[0, 0.55, 0.23]}>
        <boxGeometry args={[0.3, 0.02, 0.01]} />
        <meshBasicMaterial color={accent} />
      </mesh>
    </group>
  );
}

function Bed({ accent, position = [0, 0, -1.25], width = 2.2, single = false }) {
  const duvet = useMemo(() => new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.15), [accent]);
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.4, 2.3]} />
        <meshStandardMaterial color="#2c2129" roughness={0.6} />
      </mesh>
      <RoundedBox args={[width - 0.1, 0.24, 2.2]} radius={0.06} position={[0, 0.52, 0]} castShadow>
        <meshStandardMaterial color="#fbf8f2" roughness={0.9} />
      </RoundedBox>
      <RoundedBox args={[width - 0.02, 0.12, 1.45]} radius={0.05} position={[0, 0.66, 0.4]} castShadow>
        <meshStandardMaterial color={duvet} roughness={0.85} />
      </RoundedBox>
      {/* Bed runner */}
      <mesh position={[0, 0.73, 0.75]}>
        <boxGeometry args={[width, 0.02, 0.35]} />
        <meshStandardMaterial color="#1c1622" roughness={0.7} />
      </mesh>
      {(single ? [0] : [-width / 4, width / 4]).map((x) => (
        <RoundedBox key={x} args={[single ? 0.7 : width / 2 - 0.2, 0.18, 0.42]} radius={0.08} position={[x, 0.74, -0.78]} castShadow>
          <meshStandardMaterial color="#ffffff" roughness={0.95} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Headboard({ accent }) {
  return (
    <group position={[0, 0, -ROOM_D / 2]}>
      <RoundedBox args={[3, 1.35, 0.14]} radius={0.05} position={[0, 1.05, 0.08]} castShadow>
        <meshStandardMaterial color="#3a2f3b" roughness={0.8} />
      </RoundedBox>
      {[-1, -0.33, 0.33, 1].map((x) => (
        <mesh key={x} position={[x, 1.05, 0.16]}>
          <boxGeometry args={[0.015, 1.25, 0.01]} />
          <meshStandardMaterial color="#2a2130" />
        </mesh>
      ))}
      {/* LED cove in the room's accent colour */}
      <mesh position={[0, 1.78, 0.05]}>
        <boxGeometry args={[3.4, 0.04, 0.04]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.85, 0.4]} intensity={1.6} distance={3} color={accent} />
      {/* Artwork */}
      <mesh position={[0, 2.35, 0.02]}>
        <planeGeometry args={[1.6, 0.5]} />
        <meshStandardMaterial color={accent} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 2.35, 0.025]}>
        <ringGeometry args={[0.12, 0.16, 32]} />
        <meshBasicMaterial color="#fff6df" />
      </mesh>
    </group>
  );
}

function TV({ label }) {
  return (
    <group position={[-ROOM_W / 2 + 0.06, 1.6, 0.4]} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <boxGeometry args={[1.5, 0.86, 0.05]} />
        <meshStandardMaterial color="#0b0b0f" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.42, 0.78]} />
        <meshBasicMaterial color="#1b2a4a" />
      </mesh>
      {label && <Label position={[0, 0.62, 0.15]}>{label}</Label>}
    </group>
  );
}

function Desk() {
  return (
    <group position={[-ROOM_W / 2 + 0.45, 0, 1.3]}>
      <mesh position={[0, 0.74, 0]} castShadow>
        <boxGeometry args={[0.8, 0.05, 1.3]} />
        <meshStandardMaterial color="#6e4f37" roughness={0.5} />
      </mesh>
      {[
        [-0.35, -0.6],
        [0.35, -0.6],
        [-0.35, 0.6],
        [0.35, 0.6],
      ].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.36, z]}>
          <boxGeometry args={[0.04, 0.72, 0.04]} />
          <meshStandardMaterial color="#1e1a20" metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.6, 0.45, 0]} castShadow>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
        <meshStandardMaterial color="#2c2430" />
      </mesh>
      <mesh position={[0.8, 0.75, 0]}>
        <boxGeometry args={[0.05, 0.55, 0.45]} />
        <meshStandardMaterial color="#2c2430" />
      </mesh>
    </group>
  );
}

function Armchair({ accent }) {
  return (
    <group position={[ROOM_W / 2 - 0.9, 0, 1.2]} rotation={[0, -0.7, 0]}>
      <RoundedBox args={[0.9, 0.4, 0.85]} radius={0.08} position={[0, 0.3, 0]} castShadow>
        <meshStandardMaterial color={accent} roughness={0.8} />
      </RoundedBox>
      <RoundedBox args={[0.9, 0.6, 0.18]} radius={0.08} position={[0, 0.7, -0.35]} castShadow>
        <meshStandardMaterial color={accent} roughness={0.8} />
      </RoundedBox>
      {[-0.42, 0.42].map((x) => (
        <RoundedBox key={x} args={[0.14, 0.32, 0.8]} radius={0.05} position={[x, 0.6, 0]}>
          <meshStandardMaterial color={accent} roughness={0.8} />
        </RoundedBox>
      ))}
    </group>
  );
}

function Rug({ accent }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -0.2]} receiveShadow>
      <planeGeometry args={[3.6, 3]} />
      <meshStandardMaterial color={accent} roughness={1} transparent opacity={0.35} />
    </mesh>
  );
}

function Furniture({ type }) {
  const accent = type.accent || '#e8b04b';
  const family = type.max_guests >= 4;
  const lounge = type.max_guests === 3;
  const hasTv = (type.amenities || []).some((a) => /tv/i.test(a));
  const bedX = family ? -0.7 : 0;
  return (
    <group>
      <Headboard accent={accent} />
      <Bed accent={accent} position={[bedX, 0, -1.25]} />
      <Label position={[bedX, 1.15, -0.4]}>{type.beds || 'Bed'}</Label>
      <Lamp position={[bedX - 1.55, 0, -ROOM_D / 2 + 0.35]} accent={accent} />
      {!family && <Lamp position={[1.55, 0, -ROOM_D / 2 + 0.35]} accent={accent} />}
      {family && <Bed accent={accent} position={[2.1, 0, -1.25]} width={1.1} single />}
      <Rug accent={accent} />
      <TV label={hasTv ? 'Smart TV' : null} />
      {lounge ? <Armchair accent={accent} /> : <Desk />}
    </group>
  );
}

function SlowSway({ controls }) {
  const idle = useRef(0);
  useFrame((state, dt) => {
    const c = controls.current;
    if (!c) return;
    idle.current += dt;
    if (idle.current > 3 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      c.setAzimuthalAngle(Math.sin(state.clock.elapsedTime * 0.25) * 0.45);
    }
  });
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const reset = () => (idle.current = -4);
    c.addEventListener('start', reset);
    return () => c.removeEventListener('start', reset);
  }, [controls]);
  return null;
}

export default function RoomScene({ type, active = true }) {
  const controls = useRef();
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 1.75]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 3.4, 7.6], fov: 42 }}
    >
      <color attach="background" args={['#0d0b14']} />
      <ambientLight intensity={0.45} color="#fff1e0" />
      <spotLight position={[2, 6, 4]} angle={0.7} penumbra={0.8} intensity={60} castShadow shadow-mapSize={[1024, 1024]} color="#fff2df" />
      <hemisphereLight args={['#ffe9cf', '#2a1d2e', 0.5]} />
      <Shell />
      <Furniture type={type} />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={8} blur={2.4} far={2} />
      <OrbitControls
        ref={controls}
        target={[0, 0.9, -0.4]}
        enablePan={false}
        minDistance={4.5}
        maxDistance={10}
        minPolarAngle={0.55}
        maxPolarAngle={1.42}
        minAzimuthAngle={-0.95}
        maxAzimuthAngle={0.95}
        enableDamping
      />
      <SlowSway controls={controls} />
    </Canvas>
  );
}
