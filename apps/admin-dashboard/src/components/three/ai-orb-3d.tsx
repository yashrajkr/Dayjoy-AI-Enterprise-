"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

interface AiOrb3DProps {
  size?: number;
  className?: string;
}

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  uniform float uTime;

  void main() {
    vPos = position;
    vNormal = normal;
    vec3 pos = position;
    float displacement =
      sin(pos.x * 3.0 + uTime) * 0.035 +
      sin(pos.y * 4.0 + uTime * 1.3) * 0.035 +
      sin(pos.z * 5.0 + uTime * 0.7) * 0.035;
    pos += normal * displacement;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;

  void main() {
    float mixA = smoothstep(-1.3, 1.3, vPos.x + sin(uTime * 0.3) * 0.4);
    float mixB = smoothstep(-1.3, 1.3, vPos.y + cos(uTime * 0.25) * 0.4);
    vec3 color = mix(uColorA, uColorB, mixA);
    color = mix(color, uColorC, mixB * 0.6);

    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.2);
    color += fresnel * 0.6;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * AiOrb3D — the platform's signature element, rendered as an actual WebGL
 * mesh: a shader-displaced icosahedron "core" inside a slowly counter-
 * rotating wireframe "shell," lit with an indigo point light, tilting toward
 * the pointer. This is real 3D geometry + shaders, not a CSS gradient.
 *
 * Deliberately used only at hero scale (Login). A full WebGL context per
 * instance is expensive — rendering this at 20px in the Topbar would cost
 * far more than it visually returns, so small UI echoes stay CSS (see
 * ai-orb.tsx). Three.js "only where valuable," per the design brief.
 */
export function AiOrb3D({ size = 320, className }: AiOrb3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = mount.clientWidth || size;
    const height = mount.clientHeight || size;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Core — shader-displaced icosahedron, the "thinking" surface
    const coreGeometry = new THREE.IcosahedronGeometry(1.3, 6);
    const uniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color("#4C8DFF") }, // azure
      uColorB: { value: new THREE.Color("#7C6AF2") }, // indigo
      uColorC: { value: new THREE.Color("#2DD4E8") }, // cyan
    };
    const coreMaterial = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    // Outer shell — wireframe hologram layer for depth
    const shellGeometry = new THREE.IcosahedronGeometry(1.75, 1);
    const shellMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#2DD4E8"),
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    scene.add(shell);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const pointLight = new THREE.PointLight(0x7c6af2, 2.2, 12);
    pointLight.position.set(2, 2, 3);
    scene.add(pointLight);

    let mouseX = 0;
    let mouseY = 0;
    const handlePointer = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener("pointermove", handlePointer);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;

      if (!reducedMotion) {
        core.rotation.y = t * 0.15;
        core.rotation.x = Math.sin(t * 0.2) * 0.12;
        shell.rotation.y = -t * 0.08;
        shell.rotation.x = Math.cos(t * 0.15) * 0.1;
        core.scale.setScalar(1 + Math.sin(t * 0.9) * 0.03);

        scene.rotation.y += (mouseX * 0.3 - scene.rotation.y) * 0.04;
        scene.rotation.x += (-mouseY * 0.2 - scene.rotation.x) * 0.04;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", handlePointer);
      resizeObserver.disconnect();
      coreGeometry.dispose();
      coreMaterial.dispose();
      shellGeometry.dispose();
      shellMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [size]);

  return (
    <div
      ref={mountRef}
      className={cn("relative", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
