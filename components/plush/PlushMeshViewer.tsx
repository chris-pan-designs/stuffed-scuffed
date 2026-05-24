import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, TextureLoader } from 'expo-three';
import * as THREE from 'three';

import type { DetectedOutline } from '@/lib/outlineDetection';

type PlushMeshViewerProps = {
  imageUri: string;
  outline: DetectedOutline;
};

type SceneState = {
  animationFrame: number | null;
  mesh: THREE.Group | null;
  renderer: THREE.WebGLRenderer | null;
};

const SURFACE_SEGMENTS = 92;
const PLUSH_WIDTH = 3.1;
const PLUSH_THICKNESS = 0.035;
const PUFF_AMOUNT = 0.09;

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

const puffPlaneGeometry = (geometry: THREE.PlaneGeometry, direction: 1 | -1) => {
  const position = geometry.getAttribute('position');

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const normalizedX = Math.abs(x) / (PLUSH_WIDTH / 2);
    const normalizedY = Math.abs(y) / (PLUSH_WIDTH / 2);
    const distance = Math.min(1, Math.hypot(normalizedX * 0.82, normalizedY * 0.82));
    const centerPuff = Math.max(0, 1 - distance * distance);
    const z = direction * (PLUSH_THICKNESS / 2 + PUFF_AMOUNT * centerPuff);

    position.setZ(index, z);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
};

const createPuffedPhotoSurface = ({
  texture,
  aspectRatio,
  direction,
}: {
  texture: THREE.Texture;
  aspectRatio: number;
  direction: 1 | -1;
}) => {
  const width = PLUSH_WIDTH;
  const height = PLUSH_WIDTH / aspectRatio;
  const geometry = new THREE.PlaneGeometry(width, height, SURFACE_SEGMENTS, SURFACE_SEGMENTS);
  puffPlaneGeometry(geometry, direction);

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
  const aspectRatio = outline.imageWidth / outline.imageHeight;

  const frontMesh = createPuffedPhotoSurface({ texture, aspectRatio, direction: 1 });
  const backMesh = createPuffedPhotoSurface({ texture, aspectRatio, direction: -1 });

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
