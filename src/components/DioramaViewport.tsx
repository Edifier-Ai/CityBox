import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AtmosphereTheme } from '../engine/atmosphere';
import { buildDioramaScene, type BuiltDiorama } from '../engine/geometryBuilder';
import type { CameraPreset, DioramaSceneData } from '../types/city';

export interface DioramaViewportHandle {
  flyToPreset: (preset: CameraPreset) => void;
  focusTarget: (target: [number, number, number], zoom?: number) => void;
  stepZoom: (factor: number) => void;
  resetNorth: () => void;
  captureSnapshot: () => string | null;
}

interface DioramaViewportProps {
  sceneData: DioramaSceneData;
  theme: AtmosphereTheme;
  playing: boolean;
  autoOrbit: boolean;
  onZoomChange: (zoomPercent: number) => void;
  onAzimuthChange: (deg: number) => void;
  onUserInteract?: () => void;
}

const BASE_FRUSTUM_HALF = 250;

export const DioramaViewport = forwardRef<DioramaViewportHandle, DioramaViewportProps>(
  function DioramaViewport(
    {
      sceneData,
      theme,
      playing,
      autoOrbit,
      onZoomChange,
      onAzimuthChange,
      onUserInteract,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
    const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
    const builtRef = useRef<BuiltDiorama | null>(null);

    const themeRef = useRef(theme);
    const playingRef = useRef(playing);
    const autoOrbitRef = useRef(autoOrbit);
    themeRef.current = theme;
    playingRef.current = playing;
    autoOrbitRef.current = autoOrbit;

    // Camera flight interpolation state
    const tweenRef = useRef<{
      active: boolean;
      startTime: number;
      duration: number;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      fromTarget: THREE.Vector3;
      toTarget: THREE.Vector3;
      fromZoom: number;
      toZoom: number;
    } | null>(null);

    const startFlight = (
      targetArr: [number, number, number],
      azimuthDeg: number,
      polarDeg: number,
      zoom: number,
      duration = 680
    ) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const az = (azimuthDeg * Math.PI) / 180;
      const pol = (polarDeg * Math.PI) / 180;
      const dist = 420;
      const toTarget = new THREE.Vector3(...targetArr);
      const offset = new THREE.Vector3(
        dist * Math.sin(pol) * Math.sin(az),
        dist * Math.cos(pol),
        dist * Math.sin(pol) * Math.cos(az)
      );
      const toPos = toTarget.clone().add(offset);

      tweenRef.current = {
        active: true,
        startTime: performance.now(),
        duration,
        fromPos: camera.position.clone(),
        toPos,
        fromTarget: controls.target.clone(),
        toTarget,
        fromZoom: camera.zoom,
        toZoom: zoom,
      };
    };

    useImperativeHandle(ref, () => ({
      flyToPreset(preset) {
        startFlight(preset.target, preset.azimuthDeg, preset.polarDeg, preset.zoom);
      },
      focusTarget(target, zoom = 3.25) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const azDeg = (spherical.theta * 180) / Math.PI;
        const polDeg = (spherical.phi * 180) / Math.PI;
        startFlight(target, azDeg, polDeg, zoom, 620);
      },
      stepZoom(factor) {
        const camera = cameraRef.current;
        if (!camera) return;
        tweenRef.current = null;
        const nextZoom = Math.max(0.7, Math.min(8.0, camera.zoom * factor));
        camera.zoom = nextZoom;
        camera.updateProjectionMatrix();
        onZoomChange(Math.round(nextZoom * 145));
      },
      resetNorth() {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) return;
        const offset = camera.position.clone().sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        const polDeg = (spherical.phi * 180) / Math.PI;
        startFlight(
          [controls.target.x, controls.target.y, controls.target.z],
          38,
          polDeg,
          camera.zoom,
          520
        );
      },
      captureSnapshot() {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return null;
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
      },
    }));

    // Initialize Three.js WebGL scene once
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 1000;
      const height = container.clientHeight || 700;
      const aspect = width / height;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        stencil: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(themeRef.current.paperBg);
      sceneRef.current = scene;

      const camera = new THREE.OrthographicCamera(
        -BASE_FRUSTUM_HALF * aspect,
        BASE_FRUSTUM_HALF * aspect,
        BASE_FRUSTUM_HALF,
        -BASE_FRUSTUM_HALF,
        -900,
        1800
      );
      cameraRef.current = camera;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = true;
      controls.minZoom = 0.7;
      controls.maxZoom = 8.0;
      controls.minPolarAngle = 0.25;
      controls.maxPolarAngle = Math.PI / 2 - 0.14;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      controlsRef.current = controls;

      const hemiLight = new THREE.HemisphereLight(
        themeRef.current.hemiSkyColor,
        themeRef.current.hemiGroundColor,
        themeRef.current.hemiIntensity
      );
      scene.add(hemiLight);
      hemiLightRef.current = hemiLight;

      const sunLight = new THREE.DirectionalLight(
        themeRef.current.sunColor,
        themeRef.current.sunIntensity
      );
      sunLight.position.set(...themeRef.current.sunPosition);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.bias = -0.0008;
      sunLight.shadow.normalBias = 0.04;
      sunLight.shadow.camera.left = -220;
      sunLight.shadow.camera.right = 220;
      sunLight.shadow.camera.top = 220;
      sunLight.shadow.camera.bottom = -220;
      sunLight.shadow.camera.near = 10;
      sunLight.shadow.camera.far = 750;
      sunLight.shadow.camera.updateProjectionMatrix();
      scene.add(sunLight);
      sunLightRef.current = sunLight;

      const handleControlStart = () => {
        tweenRef.current = null;
        onUserInteract?.();
      };
      controls.addEventListener('start', handleControlStart);

      const handleResize = () => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth || 1000;
        const h = container.clientHeight || 700;
        const asp = w / h;
        camera.left = -BASE_FRUSTUM_HALF * asp;
        camera.right = BASE_FRUSTUM_HALF * asp;
        camera.top = BASE_FRUSTUM_HALF;
        camera.bottom = -BASE_FRUSTUM_HALF;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      const ro = new ResizeObserver(handleResize);
      ro.observe(container);

      let lastZoomReported = -1;
      let lastAzReported = -999;
      let animId = 0;
      let prevTime = performance.now();
      let elapsedSim = 0;

      const animate = (now: number) => {
        animId = requestAnimationFrame(animate);
        const dt = Math.min((now - prevTime) / 1000, 0.1);
        prevTime = now;

        if (playingRef.current) {
          elapsedSim += dt;
        }

        // Camera smooth flight
        const tw = tweenRef.current;
        if (tw && tw.active) {
          const rawT = Math.min(1, (now - tw.startTime) / tw.duration);
          const ease = 1 - Math.pow(1 - rawT, 3);
          camera.position.lerpVectors(tw.fromPos, tw.toPos, ease);
          controls.target.lerpVectors(tw.fromTarget, tw.toTarget, ease);
          camera.zoom = tw.fromZoom + (tw.toZoom - tw.fromZoom) * ease;
          camera.updateProjectionMatrix();
          if (rawT >= 1) tw.active = false;
        } else if (autoOrbitRef.current && playingRef.current) {
          // Gentle scenic showcase orbit when in tour mode
          const offset = camera.position.clone().sub(controls.target);
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.045);
          camera.position.copy(controls.target).add(offset);
        }

        controls.update();

        // Update living diorama animations
        if (builtRef.current) {
          builtRef.current.updateFrame(dt, elapsedSim, themeRef.current, playingRef.current);
        }

        renderer.render(scene, camera);

        // Throttled UI HUD telemetry
        const zoomPct = Math.round(camera.zoom * 145);
        if (Math.abs(zoomPct - lastZoomReported) >= 1) {
          lastZoomReported = zoomPct;
          onZoomChange(zoomPct);
        }

        const dir = camera.position.clone().sub(controls.target);
        const azDeg = Math.round((Math.atan2(dir.x, dir.z) * 180) / Math.PI);
        if (Math.abs(azDeg - lastAzReported) >= 2) {
          lastAzReported = azDeg;
          onAzimuthChange(azDeg);
        }
      };

      animId = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(animId);
        ro.disconnect();
        controls.removeEventListener('start', handleControlStart);
        controls.dispose();
        if (builtRef.current) {
          builtRef.current.dispose();
          builtRef.current = null;
        }
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    // Rebuild 3D geometry whenever sceneData changes
    useEffect(() => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!scene || !camera || !controls) return;

      if (builtRef.current) {
        scene.remove(builtRef.current.root);
        builtRef.current.dispose();
        builtRef.current = null;
      }

      const built = buildDioramaScene(sceneData, themeRef.current);
      scene.add(built.root);
      builtRef.current = built;

      const sun = sunLightRef.current;
      if (sun) {
        const s = Math.max(130, sceneData.halfSize * 1.35);
        sun.shadow.camera.left = -s;
        sun.shadow.camera.right = s;
        sun.shadow.camera.top = s;
        sun.shadow.camera.bottom = -s;
        sun.shadow.camera.near = 10;
        sun.shadow.camera.far = 750;
        sun.shadow.camera.updateProjectionMatrix();
      }

      const initialPreset = sceneData.cameraPresets[0] ?? {
        id: 'default',
        label: '巡游',
        target: [0, 4, 0] as [number, number, number],
        azimuthDeg: 38,
        polarDeg: 58,
        zoom: 2.35,
      };
      // Set camera directly on first build of a new city
      const az = (initialPreset.azimuthDeg * Math.PI) / 180;
      const pol = (initialPreset.polarDeg * Math.PI) / 180;
      const dist = 420;
      const tgt = new THREE.Vector3(...initialPreset.target);
      controls.target.copy(tgt);
      camera.position.set(
        tgt.x + dist * Math.sin(pol) * Math.sin(az),
        tgt.y + dist * Math.cos(pol),
        tgt.z + dist * Math.sin(pol) * Math.cos(az)
      );
      camera.zoom = initialPreset.zoom;
      camera.updateProjectionMatrix();
      controls.update();
      onZoomChange(Math.round(camera.zoom * 145));
    }, [sceneData]);

    // Update lighting & material uniforms when theme changes
    useEffect(() => {
      const scene = sceneRef.current;
      const hemi = hemiLightRef.current;
      const sun = sunLightRef.current;
      if (scene) {
        scene.background = new THREE.Color(theme.paperBg);
      }
      if (hemi) {
        hemi.color.set(theme.hemiSkyColor);
        hemi.groundColor.set(theme.hemiGroundColor);
        hemi.intensity = theme.hemiIntensity;
      }
      if (sun) {
        sun.color.set(theme.sunColor);
        sun.intensity = theme.sunIntensity;
        sun.position.set(...theme.sunPosition);
      }
      if (builtRef.current) {
        builtRef.current.updateTheme(theme);
      }
    }, [theme]);

    return (
      <div
        ref={containerRef}
        className="pc-viewport-wrap"
        style={{ cursor: 'grab', userSelect: 'none' }}
      >
        <div className="pc-paper-vignette" />
      </div>
    );
  }
);
