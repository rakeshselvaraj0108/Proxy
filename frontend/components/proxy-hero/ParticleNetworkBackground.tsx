"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";

type ParticleNetworkBackgroundProps = {
  reducedMotion: boolean;
  lowPower: boolean;
};

type Particle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
};

function usePointerTarget() {
  const target = useRef(new THREE.Vector2());

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      target.current.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      );
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    return () => window.removeEventListener("pointermove", handleMove);
  }, []);

  return target;
}

function noise(value: number) {
  return Math.sin(value * 0.73) * 0.5 + Math.cos(value * 1.31) * 0.35 + Math.sin(value * 2.17) * 0.15;
}

function NetworkMesh({ reducedMotion, lowPower }: ParticleNetworkBackgroundProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const frameCounter = useRef(0);
  const pointerTarget = usePointerTarget();

  const particleCount = lowPower ? 64 : reducedMotion ? 96 : 240;
  const maxConnections = lowPower ? 110 : 240;

  const particles = useMemo<Particle[]>(() => {
    const items: Particle[] = [];
    for (let index = 0; index < particleCount; index += 1) {
      const base = index * 0.73;
      items.push({
        position: new THREE.Vector3(
          (noise(base) * 0.5 + Math.random() * 0.5) * 16 - 8,
          (noise(base + 2) * 0.5 + Math.random() * 0.5) * 10 - 5,
          (noise(base + 4) * 0.5 + Math.random() * 0.5) * 12 - 6,
        ),
        velocity: new THREE.Vector3(
          noise(base + 6) * 0.0025,
          noise(base + 8) * 0.0025,
          noise(base + 10) * 0.0025,
        ),
        color: new THREE.Color(index % 3 === 0 ? "#D4AF37" : index % 2 === 0 ? "#5B8DEF" : "#A8A9AE"),
      });
    }
    return items;
  }, [particleCount]);

  const { viewport } = useThree();

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();
    frameCounter.current += 1;
    const pointerX = pointerTarget.current.x * 0.6;
    const pointerY = pointerTarget.current.y * 0.45;

    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * (reducedMotion ? 0.006 : 0.014);
      pointsRef.current.rotation.x = THREE.MathUtils.lerp(pointsRef.current.rotation.x, pointerY * 0.08, 0.02);
      pointsRef.current.position.x = THREE.MathUtils.lerp(pointsRef.current.position.x, pointerX * 0.35, 0.03);
      pointsRef.current.position.y = THREE.MathUtils.lerp(pointsRef.current.position.y, pointerY * 0.22, 0.03);
    }

    if (linesRef.current) {
      linesRef.current.rotation.y = pointsRef.current?.rotation.y ?? 0;
      linesRef.current.position.x = pointsRef.current?.position.x ?? 0;
      linesRef.current.position.y = pointsRef.current?.position.y ?? 0;
    }

    particles.forEach((particle, index) => {
      const drift = reducedMotion ? 0.15 : 1;
      const pulse = Math.sin(elapsed * 0.5 + index * 0.17) * 0.0006 * drift;
      particle.position.x += (particle.velocity.x + pulse) * delta * 60;
      particle.position.y += (particle.velocity.y - pulse) * delta * 60;
      particle.position.z += (particle.velocity.z + pulse * 0.5) * delta * 60;

      if (particle.position.x > 10) particle.position.x = -10;
      if (particle.position.x < -10) particle.position.x = 10;
      if (particle.position.y > 6) particle.position.y = -6;
      if (particle.position.y < -6) particle.position.y = 6;
      if (particle.position.z > 8) particle.position.z = -8;
      if (particle.position.z < -8) particle.position.z = 8;
    });

    if (pointsRef.current?.geometry) {
      const geometry = pointsRef.current.geometry as THREE.BufferGeometry;
      const positions = new Float32Array(particles.length * 3);
      const colors = new Float32Array(particles.length * 3);
      particles.forEach((particle, index) => {
        positions.set([particle.position.x, particle.position.y, particle.position.z], index * 3);
        colors.set([particle.color.r, particle.color.g, particle.color.b], index * 3);
      });
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    if (!linesRef.current?.geometry || lowPower || frameCounter.current % (reducedMotion ? 12 : 4) !== 0) return;

    const linePairs: number[] = [];
    const lineColors: number[] = [];
    const threshold = reducedMotion ? 4.2 : 4.8;
    const cap = Math.min(maxConnections, particles.length * 2);

    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const distance = particles[i].position.distanceTo(particles[j].position);
        if (distance < threshold && linePairs.length < cap * 6) {
          const fade = 1 - distance / threshold;
          linePairs.push(
            particles[i].position.x,
            particles[i].position.y,
            particles[i].position.z,
            particles[j].position.x,
            particles[j].position.y,
            particles[j].position.z,
          );
          lineColors.push(
            particles[i].color.r * fade,
            particles[i].color.g * fade,
            particles[i].color.b * fade,
            particles[j].color.r * fade,
            particles[j].color.g * fade,
            particles[j].color.b * fade,
          );
        }
      }
    }

    const geometry = linesRef.current.geometry as THREE.BufferGeometry;
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePairs), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(lineColors), 3));
  });

  const uniforms = useMemo(
    () => ({
      uSize: { value: viewport.width > 10 ? 2.7 : 1.8 },
    }),
    [viewport.width],
  );

  return (
    <group>
      <points ref={pointsRef}>
        <bufferGeometry />
        <shaderMaterial
          transparent
          depthWrite={false}
          vertexColors
          blending={THREE.AdditiveBlending}
          uniforms={uniforms}
          vertexShader={`
            uniform float uSize;
            varying vec3 vColor;
            void main() {
              vColor = color;
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = uSize * (220.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `}
          fragmentShader={`
            varying vec3 vColor;
            void main() {
              vec2 uv = gl_PointCoord.xy - 0.5;
              float d = length(uv);
              float glow = smoothstep(0.5, 0.0, d);
              float core = smoothstep(0.2, 0.0, d);
              vec3 tint = mix(vColor, vec3(0.95, 0.88, 0.62), 0.45);
              gl_FragColor = vec4(tint, glow * 0.22 + core * 0.12);
            }
          `}
        />
      </points>

      {!lowPower && (
        <lineSegments ref={linesRef}>
          <bufferGeometry />
          <lineBasicMaterial transparent depthWrite={false} vertexColors linewidth={1} opacity={reducedMotion ? 0.14 : 0.22} />
        </lineSegments>
      )}
    </group>
  );
}

function Scene(props: ParticleNetworkBackgroundProps) {
  const reducedMotion = props.reducedMotion;

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 12]} fov={42} />
      <ambientLight intensity={0.7} />
      <NetworkMesh {...props} />
      <fog attach="fog" args={["#08090B", 18, 40]} />
      {!reducedMotion && <directionalLight position={[4, 6, 10]} intensity={0.35} color="#D4AF37" />}
    </>
  );
}

export function ParticleNetworkBackground(props: ParticleNetworkBackgroundProps) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <Canvas dpr={[1, props.lowPower ? 1.2 : 1.5]} gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}>
        <Scene {...props} />
      </Canvas>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(216,196,151,0.08),rgba(8,9,11,0.2)_32%,rgba(8,9,11,0.88)_70%,rgba(8,9,11,0.98)_100%)]" />
    </div>
  );
}
