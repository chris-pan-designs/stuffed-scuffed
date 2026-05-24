import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, TextureLoader } from 'expo-three';
import * as THREE from 'three';

import type { DetectedOutline, OutlinePoint } from '@/lib/outlineDetection';

type PlushMeshViewerProps = {
  imageUri: string;
  outline: DetectedOutline;
};

type SceneState = {
  animationFrame: number | null;
  mesh: THREE.Group | null;
  renderer: THREE.WebGLRenderer | null;
};

const PLUSH_WIDTH = 3.1;
const PUFF_AMOUNT = 0.3;
const RING_COUNT = 18;
const MAX_OUTLINE_POINTS = 180;

const createTexture = (imageUri: string) => {
  const texture = new TextureLoader().load(imageUri);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  return texture;
};

const limitOutlinePoints = (points: OutlinePoint[]) => {
  const step = Math.max(1, Math.ceil(points.length / MAX_OUTLINE_POINTS));
  return points.filter((_, index) => index % step === 0);
};

const normalizeOutlinePoints = (outline: DetectedOutline) => {
  const sourceMaxDimension = Math.max(outline.imageWidth, outline.imageHeight);
  const centerX = outline.imageWidth / 2;
  const centerY = outline.imageHeight / 2;

  return limitOutlinePoints(outline.points).map((point) => ({
    x: ((point.x - centerX) / sourceMaxDimension) * PLUSH_WIDTH,
    y: -((point.y - centerY) / sourceMaxDimension) * PLUSH_WIDTH,
  }));
};

const findCenter = (points: OutlinePoint[]) => {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
};

const createPhotoPillowFace = ({
  points,
  outline,
  texture,
  direction,
}: {
  points: OutlinePoint[];
  outline: DetectedOutline;
  texture: THREE.Texture;
  direction: 1 | -1;
}) => {
  const center = findCenter(points);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sourceMaxDimension = Math.max(outline.imageWidth, outline.imageHeight);

  for (let ring = 0; ring <= RING_COUNT; ring += 1) {
    const t = ring / RING_COUNT;
    const puff = PUFF_AMOUNT * (1 - t * t);

    points.forEach((edgePoint) => {
      const x = center.x + (edgePoint.x - center.x) * t;
      const y = center.y + (edgePoint.y - center.y) * t;
      const z = direction * puff;
      const sourceX = outline.imageWidth / 2 + (x / PLUSH_WIDTH) * sourceMaxDimension;
      const sourceY = outline.imageHeight / 2 - (y / PLUSH_WIDTH) * sourceMaxDimension;

      positions.push(x, y, z);
      uvs.push(sourceX / outline.imageWidth, sourceY / outline.imageHeight);
    });
  }

  const pointsPerRing = points.length;

  for (let ring = 0; ring < RING_COUNT; ring += 1) {
    for (let index = 0; index < pointsPerRing; index += 1) {
      const nextIndex = (index + 1) % pointsPerRing;
      const current = ring * pointsPerRing + index;
      const next = ring * pointsPerRing + nextIndex;
      const outerCurrent = (ring + 1) * pointsPerRing + index;
      const outerNext = (ring + 1) * pointsPerRing + nextIndex;

      if (direction === 1) {
        indices.push(current, outerCurrent, next, next, outerCurrent, outerNext);
      } else {
        indices.push(current, next, outerCurrent, next, outerNext, outerCurrent);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
};

const createPlushMesh = (imageUri: string, outline: DetectedOutline) => {
  const group = new THREE.Group();
  const texture = createTexture(imageUri);
  const points = normalizeOutlinePoints(outline);

  const frontMesh = createPhotoPillowFace({ points, outline, texture, direction: 1 });
  const backMesh = createPhotoPillowFace({ points, outline, texture, direction: -1 });

  group.add(frontMesh, backMesh);
  group.rotation.x = -0.1;
  group.rotation.y = -0.25;

  return group;
};

export function PlushMeshViewer({ imageUri, outline }: PlushMeshViewerProps) {
  const stateRef = useRef<SceneState>({ animationFrame: null, mesh: null, renderer: null });
  const rotationRef = useRef({ x: -0.1, y: -0.25 });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          rotationRef.current = {
            x: -0.1 + gesture.dy * 0.01,
            y: -0.25 + gesture.dx * 0.01,
          };

          if (stateRef.current.mesh) {
            stateRef.current.mesh.rotation.x = rotationRef.current.x;
            stateRef.current.mesh.rotation.y = rotationRef.current.y;
          }
        },
      }),
    []
  );

  useEffect(() => {
    const sceneState = stateRef.current;

    return () => {
      if (sceneState.animationFrame !== null) {
        cancelAnimationFrame(sceneState.animationFrame);
      }

      sceneState.renderer?.dispose();
    };
  }, []);

  const handleContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({ gl, alpha: true, antialias: true }) as unknown as THREE.WebGLRenderer;
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0xffffff, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 5.8);

    const mesh = createPlushMesh(imageUri, outline);
    scene.add(mesh);

    stateRef.current.renderer = renderer;
    stateRef.current.mesh = mesh;

    const render = () => {
      stateRef.current.animationFrame = requestAnimationFrame(render);
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    render();
  };

  return (
    <View style={styles.viewer} {...panResponder.panHandlers}>
      <GLView style={styles.glView} onContextCreate={handleContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
    width: '100%',
  },
  glView: {
    flex: 1,
  },
});
