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

const EDGE_THICKNESS = 0.035;
const FACE_BULGE = 0.34;
const NORMALIZED_SIZE = 3.2;
const SMOOTHING_PASSES = 2;

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

const normalizeOutlinePoints = (outline: DetectedOutline) => {
  const maxDimension = Math.max(outline.imageWidth, outline.imageHeight);
  const centerX = outline.imageWidth / 2;
  const centerY = outline.imageHeight / 2;

  return outline.points.map((point) => ({
    x: ((point.x - centerX) / maxDimension) * NORMALIZED_SIZE,
    y: -((point.y - centerY) / maxDimension) * NORMALIZED_SIZE,
  }));
};

const smoothClosedPoints = (points: OutlinePoint[]) => {
  let smoothedPoints = points;

  for (let pass = 0; pass < SMOOTHING_PASSES; pass += 1) {
    const nextPoints: OutlinePoint[] = [];

    smoothedPoints.forEach((point, index) => {
      const nextPoint = smoothedPoints[(index + 1) % smoothedPoints.length];
      nextPoints.push({
        x: point.x * 0.75 + nextPoint.x * 0.25,
        y: point.y * 0.75 + nextPoint.y * 0.25,
      });
      nextPoints.push({
        x: point.x * 0.25 + nextPoint.x * 0.75,
        y: point.y * 0.25 + nextPoint.y * 0.75,
      });
    });

    smoothedPoints = nextPoints;
  }

  return smoothedPoints;
};

const createShape = (points: OutlinePoint[]) => {
  const shape = new THREE.Shape();
  const smoothedPoints = smoothClosedPoints(points);

  smoothedPoints.forEach((point, index) => {
    if (index === 0) {
      shape.moveTo(point.x, point.y);
      return;
    }

    shape.lineTo(point.x, point.y);
  });

  shape.closePath();
  return shape;
};

const applyImageUvs = (
  geometry: THREE.BufferGeometry,
  outline: DetectedOutline,
  normalizedMaxDimension: number
) => {
  const position = geometry.getAttribute('position');
  const uvs: number[] = [];
  const centerX = outline.imageWidth / 2;
  const centerY = outline.imageHeight / 2;
  const sourceMaxDimension = Math.max(outline.imageWidth, outline.imageHeight);

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const sourceX = centerX + (x / normalizedMaxDimension) * sourceMaxDimension;
    const sourceY = centerY - (y / normalizedMaxDimension) * sourceMaxDimension;

    uvs.push(sourceX / outline.imageWidth, sourceY / outline.imageHeight);
  }

  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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

const createBoundaryLookup = (points: OutlinePoint[]) => {
  const center = findCenter(points);
  const buckets = new Map<number, number>();

  points.forEach((point) => {
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const bucket = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 720);
    const radius = Math.hypot(point.x - center.x, point.y - center.y);
    buckets.set(bucket, Math.max(buckets.get(bucket) ?? 0, radius));
  });

  return { center, buckets };
};

const getEdgeFalloff = (
  x: number,
  y: number,
  boundary: ReturnType<typeof createBoundaryLookup>
) => {
  const angle = Math.atan2(y - boundary.center.y, x - boundary.center.x);
  const bucket = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 720);
  const boundaryRadius = boundary.buckets.get(bucket) ?? NORMALIZED_SIZE * 0.5;
  const radius = Math.hypot(x - boundary.center.x, y - boundary.center.y);
  const normalizedRadius = Math.min(1, radius / Math.max(boundaryRadius, 0.001));

  return Math.pow(Math.max(0, 1 - normalizedRadius), 0.55);
};

const puffFaceGeometry = (
  geometry: THREE.BufferGeometry,
  direction: 1 | -1,
  boundary: ReturnType<typeof createBoundaryLookup>
) => {
  const position = geometry.getAttribute('position');

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const falloff = getEdgeFalloff(x, y, boundary);
    const z = direction * (EDGE_THICKNESS + FACE_BULGE * falloff);

    position.setZ(index, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
};

const createFaceMesh = ({
  shape,
  outline,
  texture,
  direction,
  boundary,
}: {
  shape: THREE.Shape;
  outline: DetectedOutline;
  texture: THREE.Texture;
  direction: 1 | -1;
  boundary: ReturnType<typeof createBoundaryLookup>;
}) => {
  const geometry = new THREE.ShapeGeometry(shape, 16);
  applyImageUvs(geometry, outline, NORMALIZED_SIZE);
  puffFaceGeometry(geometry, direction, boundary);

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    alphaTest: 0.02,
  });

  return new THREE.Mesh(geometry, material);
};

const createPlushMesh = (imageUri: string, outline: DetectedOutline) => {
  const group = new THREE.Group();
  const normalizedPoints = normalizeOutlinePoints(outline);
  const shape = createShape(normalizedPoints);
  const texture = createTexture(imageUri);

  const boundary = createBoundaryLookup(normalizedPoints);

  const seamGeometry = new THREE.BufferGeometry();
  const seamPositions: number[] = [];
  const seamIndices: number[] = [];

  normalizedPoints.forEach((point) => {
    seamPositions.push(point.x, point.y, EDGE_THICKNESS, point.x, point.y, -EDGE_THICKNESS);
  });

  normalizedPoints.forEach((_, index) => {
    const nextIndex = (index + 1) % normalizedPoints.length;
    const topCurrent = index * 2;
    const bottomCurrent = topCurrent + 1;
    const topNext = nextIndex * 2;
    const bottomNext = topNext + 1;

    seamIndices.push(topCurrent, bottomCurrent, topNext, bottomCurrent, bottomNext, topNext);
  });

  seamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3));
  seamGeometry.setIndex(seamIndices);
  seamGeometry.computeVertexNormals();

  const seamMaterial = new THREE.MeshStandardMaterial({
    color: '#ddd8d1',
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const seamMesh = new THREE.Mesh(seamGeometry, seamMaterial);

  const frontMesh = createFaceMesh({
    shape,
    outline,
    texture,
    direction: 1,
    boundary,
  });
  const backMesh = createFaceMesh({
    shape,
    outline,
    texture,
    direction: -1,
    boundary,
  });

  group.add(seamMesh, frontMesh, backMesh);
  group.rotation.x = -0.12;
  group.rotation.y = -0.28;

  return group;
};

export function PlushMeshViewer({ imageUri, outline }: PlushMeshViewerProps) {
  const stateRef = useRef<SceneState>({ animationFrame: null, mesh: null, renderer: null });
  const rotationRef = useRef({ x: -0.12, y: -0.28 });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          rotationRef.current = {
            x: -0.12 + gesture.dy * 0.01,
            y: -0.28 + gesture.dx * 0.01,
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.4);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(2.5, 3.4, 5);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
    fillLight.position.set(-3, -2, 4);

    scene.add(ambientLight, keyLight, fillLight);

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
