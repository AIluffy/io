import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import type { PropsWithChildren } from 'react';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import type { GLTF } from 'three-stdlib';

export type IoHero3DProps = {
  modelUrl: string;
  className?: string;
};

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const matchMedia = globalThis.matchMedia?.bind(globalThis);
    if (!matchMedia) return;

    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    onChange();

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

type ModelProps = {
  url: string;
  animated: boolean;
};

function Model({ url, animated }: ModelProps) {
  const gltf = useGLTF(url) as GLTF;
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!animated) return;
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.rotation.y = t * 0.35;
    group.current.rotation.x = Math.sin(t * 0.4) * 0.08;
    group.current.position.y = Math.sin(t * 0.7) * 0.08;
  });

  return (
    <group ref={group}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function Scene({
  modelUrl,
  reducedMotion,
}: {
  modelUrl: string;
  reducedMotion: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 2.5, 4]} intensity={1.4} />
      <directionalLight position={[-3, -2, -4]} intensity={0.6} />

      <group scale={1} rotation={[0.25, 0, 0]}>
        <Suspense fallback={null}>
          <Model url={modelUrl} animated={!reducedMotion} />
        </Suspense>
      </group>

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableRotate={!reducedMotion}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.6}
      />
    </>
  );
}

function Root({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}

export function IoHero3D({ modelUrl, className }: IoHero3DProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [webglOk, setWebglOk] = useState(false);

  useEffect(() => {
    setWebglOk(supportsWebGL());
  }, []);

  useEffect(() => {
    try {
      useGLTF.preload(modelUrl);
    } catch {
      return;
    }
  }, [modelUrl]);

  if (!webglOk) return null;

  return (
    <Root className={className}>
      <Canvas
        camera={{ fov: 45, position: [0, 0.2, 3.4] }}
        dpr={[1, 2]}
        frameloop={reducedMotion ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <Scene modelUrl={modelUrl} reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </Root>
  );
}
