import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, TextureLoader } from 'expo-three';
import earcut from 'earcut';
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
const PUFF_AMOUNT = 0.28;
const EDGE_THICKNESS = 0.04;
const MAX_OUTLINE_POINTS = 44;
const BLOB_SMOOTHING_PASSES = 8;
const BLOB_INFLATE = 1.08;

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

const smoothBlobPoints = (points: OutlinePoint[]) => {
  let smoothedPoints = points;

  for (let pass = 0; pass < BLOB_SMOOTHING_PASSES; pass += 1) {
    smoothedPoints = smoothedPoints.map((point, index) => {
      const previous = smoothedPoints[(index - 1 + smoothedPoints.length) % smoothedPoints.length];
      const next = smoothedPoints[(index + 1) % smoothedPoints.length];

      return {
        x: previous.x * 0.25 + point.x * 0.5 + next.x * 0.25,
        y: previous.y * 0.25 + point.y * 0.5 + next.y * 0.25,
      };
    });
  }

  const center = findCenter(smoothedPoints);

  return smoothedPoints.map((point) => ({
    x: center.x + (point.x - center.x) * BLOB_INFLATE,
    y: center.y + (point.y - center.y) * BLOB_INFLATE,
  }));
};

const normalizeOutlinePoints = (outline: DetectedOutline) => {
  const sourceMaxDimension = Math.max(outline.imageWidth, outline.imageHeight);
  const centerX = outline.imageWidth / 2;
  const centerY = outline.imageHeight / 2;

  const normalizedPoints = limitOutlinePoints(outline.points).map((point) => ({
    x: ((point.x - centerX) / sourceMaxDimension) * PLUSH_WIDTH,
    y: -((point.y - centerY) / sourceMaxDimension) * PLUSH_WIDTH,
  }));

  return smoothBlobPoints(normalizedPoints);
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

const getPuffForPoint = (point: OutlinePoint, center: OutlinePoint) => {
  const distance = Math.hypot(point.x - center.x, point.y - center.y);
  const normalizedDistance = Math.min(1, distance / (PLUSH_WIDTH * 0.48));

  return PUFF_AMOUNT * Math.max(0, 1 - normalizedDistance * normalizedDistance);
};

const createFaceGeometry = ({
  points,
  outline,
  direction,
}: {
  points: OutlinePoint[];
  outline: DetectedOutline;
  direction: 1 | -1;
}) => {
  const center = findCenter(points);
  const vertices = points.flatMap((point) => [point.x, point.y]);
  const triangleIndices = earcut(vertices);
  const positions: number[] = [];
  const uvs: number[] = [];
  const sourceMaxDimension = Math.max(outline.imageWidth, outline.imageHeight);

  points.forEach((point) => {
    const z = direction * (EDGE_THICKNESS + getPuffForPoint(point, center));
    const sourceX = outline.imageWidth / 2 + (point.x / PLUSH_WIDTH) * sourceMaxDimension;
    const sourceY = outline.imageHeight / 2 - (point.y / PLUSH_WIDTH) * sourceMaxDimension;

    positions.push(point.x, point.y, z);
    uvs.push(sourceX / outline.imageWidth, sourceY / outline.imageHeight);
  });

  const indices = direction === 1 ? triangleIndices : [...triangleIndices].reverse();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const createEdgeGeometry = (points: OutlinePoint[]) => {
  const positions: number[] = [];
  const indices: number[] = [];

  points.forEach((point) => {
    positions.push(point.x, point.y, EDGE_THICKNESS, point.x, point.y, -EDGE_THICKNESS);
  });

  points.forEach((_, index) => {
    const nextIndex = (index + 1) % points.length;
    const frontCurrent = index * 2;
    const backCurrent = frontCurrent + 1;
    const frontNext = nextIndex * 2;
    const backNext = frontNext + 1;

    indices.push(frontCurrent, backCurrent, frontNext, backCurrent, backNext, frontNext);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const createPlushMesh = (imageUri: string, outline: DetectedOutline) => {
  const group = new THREE.Group();
  const texture = createTexture(imageUri);
  const points = normalizeOutlinePoints(outline);
  const photoMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
  });

  const frontMesh = new THREE.Mesh(createFaceGeometry({ points, outline, direction: 1 }), photoMaterial);
  const backMesh = new THREE.Mesh(createFaceGeometry({ points, outline, direction: -1 }), photoMaterial);
  const edgeMesh = new THREE.Mesh(
    createEdgeGeometry(points),
    new THREE.MeshBasicMaterial({
      color: '#262321',
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
    })
  );

  group.add(edgeMesh, frontMesh, backMesh);
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
