import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";
import * as THREE from "three";

import {
  MAP_LAYOUT,
  WORLD_DEPTH,
  lonLatToWorld,
  type MapSelection,
} from "@/components/map/mapData";

const TILT = 0.16;
const MIN_DISTANCE = 6.5;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Frame = { target: THREE.Vector3; distance: number };

export function MapCamera({
  selection,
  reducedMotion,
  zoom,
  focusZoom = 1,
}: {
  selection: MapSelection | null;
  reducedMotion: boolean;
  zoom: { direction: -1 | 1; token: number } | null;
  focusZoom?: number;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useRef<import("three-stdlib").MapControls | null>(null);
  const animation = useRef<{
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    start: number;
    duration: number;
  } | null>(null);


  const fitDistance = (viewWidth: number, viewHeight: number) => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distanceForHeight = viewHeight / 2 / Math.tan(vFov / 2);
    const distanceForWidth = viewWidth / 2 / (Math.tan(vFov / 2) * Math.max(camera.aspect, 0.2));
    return Math.max(distanceForHeight, distanceForWidth);
  };

  const fillDistance = (viewWidth: number, viewHeight: number) => {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distanceForHeight = viewHeight / 2 / Math.tan(vFov / 2);
    const distanceForWidth = viewWidth / 2 / (Math.tan(vFov / 2) * Math.max(camera.aspect, 0.2));
    return Math.min(distanceForHeight, distanceForWidth);
  };

  const framing = (): Frame => {
    if (!selection) {
      return {
        target: new THREE.Vector3(0, 0, 0),
        // Fill the viewport as a background plate. The viewport may crop a
        // small amount at the edges so there is no empty band around the map.
        // Extra 10% bleed compensates for the relief and oblique view, so the
        // rendered plate reaches past the viewport edges instead of leaving a
        // hairline of background at the top or bottom.
        distance: fillDistance(MAP_LAYOUT.worldWidth, WORLD_DEPTH) * 0.9,
      };
    }

    const bbox = selection.bbox;
    if (!bbox) {
      const point = lonLatToWorld(selection.lon, selection.lat);
      return {
        target: new THREE.Vector3(point.x, 0, point.z),
        distance: fitDistance(22, 22) / Math.max(1, focusZoom),
      };
    }

    const [minLon, minLat, maxLon, maxLat] = bbox;
    const center = lonLatToWorld((minLon + maxLon) / 2, (minLat + maxLat) / 2);
    const northWest = lonLatToWorld(minLon, maxLat);
    const southEast = lonLatToWorld(maxLon, minLat);
    const width = Math.abs(southEast.x - northWest.x);
    const depth = Math.abs(southEast.z - northWest.z);
    const span = Math.max(width, depth * 1.2) * 1.65;

    return {
      target: new THREE.Vector3(center.x, 0, center.z),
      distance: (fitDistance(span, span * 0.94) * 1.02) / Math.max(1, focusZoom),
    };
  };

  const positionFor = (target: THREE.Vector3, distance: number) =>
    new THREE.Vector3(
      target.x,
      target.y + Math.cos(TILT) * distance,
      target.z + Math.sin(TILT) * distance,
    );

  const apply = (frame: Frame) => {
    const control = controls.current;
    camera.position.copy(positionFor(frame.target, frame.distance));
    camera.lookAt(frame.target);
    camera.updateProjectionMatrix();
    if (control) {
      control.target.copy(frame.target);
      control.update();
    }
  };

  useEffect(() => {
    const frame = framing();
    const control = controls.current;
    const distance = clamp(frame.distance, MIN_DISTANCE, 200);
    frame.distance = distance;

    const toPosition = positionFor(frame.target, frame.distance);
    if (reducedMotion) {
      animation.current = null;
      apply(frame);
      invalidate();
      return;
    }

    if (control) control.enabled = false;
    animation.current = {
      fromTarget: control ? control.target.clone() : new THREE.Vector3(),
      toTarget: frame.target,
      fromPosition: camera.position.clone(),
      toPosition,
      start: performance.now(),
      duration: 900,
    };
    invalidate();

    let raf = 0;
    const pump = () => {
      if (!animation.current) return;
      invalidate();
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.id, selection?.kind, camera, invalidate, reducedMotion, size.width, size.height, focusZoom]);

  useEffect(() => {
    if (!zoom) return;
    const control = controls.current;
    if (!control) return;

    const current = camera.position.distanceTo(control.target);
    const next = clamp(
      current * (zoom.direction > 0 ? 0.72 : 1.38),
      MIN_DISTANCE,
      200,
    );
    const target = control.target.clone();
    control.enabled = false;
    animation.current = {
      fromTarget: target,
      toTarget: target,
      fromPosition: camera.position.clone(),
      toPosition: positionFor(target, next),
      start: performance.now(),
      duration: reducedMotion ? 0 : 380,
    };
    invalidate();

    let raf = 0;
    const pump = () => {
      if (!animation.current) return;
      invalidate();
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom?.token, camera, invalidate, reducedMotion]);

  useFrame(() => {
    const control = controls.current;
    const active = animation.current;

    if (active) {
      const t = active.duration > 0
        ? clamp((performance.now() - active.start) / active.duration, 0, 1)
        : 1;
      const eased = easeInOutCubic(t);
      const target = active.fromTarget.clone().lerp(active.toTarget, eased);
      const position = active.fromPosition.clone().lerp(active.toPosition, eased);
      camera.position.copy(position);
      camera.lookAt(target);
      if (control) {
        control.target.copy(target);
        control.update();
      }
      if (t >= 1) {
        animation.current = null;
        if (control) {
          control.enabled = true;
          control.update();
        }
      }
      return;
    }

    if (!control) return;
    // Keep the camera over the plate and the horizon level.
    control.target.y = 0;
    control.target.x = clamp(
      control.target.x,
      -MAP_LAYOUT.worldWidth / 2 + 1,
      MAP_LAYOUT.worldWidth / 2 - 1,
    );
    control.target.z = clamp(
      control.target.z,
      -WORLD_DEPTH / 2 + 1,
      WORLD_DEPTH / 2 - 1,
    );
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableRotate={false}
      enableDamping
      dampingFactor={0.085}
      panSpeed={0.9}
      zoomSpeed={0.9}
      minDistance={MIN_DISTANCE}
      maxDistance={200}
      onStart={() => {
        if (animation.current) {
          animation.current = null;
          if (controls.current) controls.current.enabled = true;
        }
      }}
    />
  );
}
