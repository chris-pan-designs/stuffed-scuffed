import { Buffer } from 'buffer';
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, TextureLoader } from 'expo-three';
import { PNG } from 'pngjs/browser';
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

type MaskGrid = {
  png: PNG;
  cols: number;
  rows: number;
  cells: boolean[][];
  distances: number[][];
  aspectRatio: number;
};

const ALPHA_THRESHOLD = 24;
const MAX_GRID_SIZE = 88;
const PLUSH_WIDTH = 3.1;
const PUFF_AMOUNT = 0.34;
const SIDE_THICKNESS = 0;

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

const getBase64FromDataUri = (dataUri: string) => {
  const marker = 'base64,';
  const markerIndex = dataUri.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('Expected a base64 PNG data URI for plush mesh generation.');
  }

  return dataUri.slice(markerIndex + marker.length);
};

const getAlphaAt = (png: PNG, x: number, y: number) => {
  const clampedX = Math.max(0, Math.min(png.width - 1, x));
  const clampedY = Math.max(0, Math.min(png.height - 1, y));
  const pixelIndex = (png.width * clampedY + clampedX) << 2;

  return png.data[pixelIndex + 3];
};

const createMaskGrid = (imageUri: string): MaskGrid => {
  const png = PNG.sync.read(Buffer.from(getBase64FromDataUri(imageUri), 'base64'));
  const aspectRatio = png.width / png.height;
  const cols = aspectRatio >= 1 ? MAX_GRID_SIZE : Math.max(18, Math.round(MAX_GRID_SIZE * aspectRatio));
  const rows = aspectRatio >= 1 ? Math.max(18, Math.round(MAX_GRID_SIZE / aspectRatio)) : MAX_GRID_SIZE;
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const sourceX = Math.floor(((col + 0.5) / cols) * png.width);
      const sourceY = Math.floor(((row + 0.5) / rows) * png.height);
      cells[row][col] = getAlphaAt(png, sourceX, sourceY) > ALPHA_THRESHOLD;
    }
  }

  const distances = computeCellDistances(cells);

  return { png, cols, rows, cells, distances, aspectRatio };
};

const isInside = (cells: boolean[][], row: number, col: number) =>
  row >= 0 && row < cells.length && col >= 0 && col < cells[0].length && cells[row][col];

const isBoundaryCell = (cells: boolean[][], row: number, col: number) => {
  if (!isInside(cells, row, col)) {
    return false;
  }

  return (
    !isInside(cells, row - 1, col) ||
    !isInside(cells, row + 1, col) ||
    !isInside(cells, row, col - 1) ||
    !isInside(cells, row, col + 1)
  );
};

const computeCellDistances = (cells: boolean[][]) => {
  const rows = cells.length;
  const cols = cells[0].length;
  const distances = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  const queue: { row: number; col: number }[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (isBoundaryCell(cells, row, col)) {
        distances[row][col] = 1;
        queue.push({ row, col });
      }
    }
  }

  let cursor = 0;
  const neighbors = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;

    for (const neighbor of neighbors) {
      const nextRow = current.row + neighbor.row;
      const nextCol = current.col + neighbor.col;

      if (isInside(cells, nextRow, nextCol) && distances[nextRow][nextCol] === 0) {
        distances[nextRow][nextCol] = distances[current.row][current.col] + 1;
        queue.push({ row: nextRow, col: nextCol });
      }
    }
  }

  return distances;
};

const getVertexDistance = (grid: MaskGrid, gridRow: number, gridCol: number) => {
  const values: number[] = [];
  let touchesTransparentSpace = false;

  for (let rowOffset = -1; rowOffset <= 0; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 0; colOffset += 1) {
      const row = gridRow + rowOffset;
      const col = gridCol + colOffset;

      if (isInside(grid.cells, row, col)) {
        values.push(grid.distances[row][col]);
      } else {
        touchesTransparentSpace = true;
      }
    }
  }

  if (values.length === 0) {
    return 0;
  }

  if (touchesTransparentSpace) {
    return 1;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const createSurfaceGeometry = (grid: MaskGrid, direction: 1 | -1) => {
  const width = PLUSH_WIDTH;
  const height = PLUSH_WIDTH / grid.aspectRatio;
  const maxDistance = Math.max(1, ...grid.distances.flat());
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= grid.rows; row += 1) {
    for (let col = 0; col <= grid.cols; col += 1) {
      const x = (col / grid.cols - 0.5) * width;
      const y = (0.5 - row / grid.rows) * height;
      const distance = getVertexDistance(grid, row, col);
      const normalizedDistance = Math.max(0, (distance - 1) / Math.max(1, maxDistance - 1));
      const puff = PUFF_AMOUNT * Math.sin(normalizedDistance * Math.PI * 0.5);
      const z = direction * (SIDE_THICKNESS + puff);

      positions.push(x, y, z);
      uvs.push(col / grid.cols, 1 - row / grid.rows);
    }
  }

  const vertexIndex = (row: number, col: number) => row * (grid.cols + 1) + col;

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (!grid.cells[row][col]) {
        continue;
      }

      const topLeft = vertexIndex(row, col);
      const topRight = vertexIndex(row, col + 1);
      const bottomLeft = vertexIndex(row + 1, col);
      const bottomRight = vertexIndex(row + 1, col + 1);

      if (direction === 1) {
        indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
      } else {
        indices.push(topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const getColorAt = (png: PNG, x: number, y: number) => {
  const clampedX = Math.max(0, Math.min(png.width - 1, x));
  const clampedY = Math.max(0, Math.min(png.height - 1, y));
  const pixelIndex = (png.width * clampedY + clampedX) << 2;

  return new THREE.Color(
    png.data[pixelIndex] / 255,
    png.data[pixelIndex + 1] / 255,
    png.data[pixelIndex + 2] / 255
  );
};

const colorForGridPoint = (grid: MaskGrid, row: number, col: number) => {
  const sourceX = Math.floor((col / grid.cols) * grid.png.width);
  const sourceY = Math.floor((row / grid.rows) * grid.png.height);

  return getColorAt(grid.png, sourceX, sourceY);
};

const addSideQuad = (
  positions: number[],
  colors: number[],
  indices: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
  colorA: THREE.Color,
  colorB: THREE.Color
) => {
  const start = positions.length / 3;
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  colors.push(
    colorA.r, colorA.g, colorA.b,
    colorB.r, colorB.g, colorB.b,
    colorA.r, colorA.g, colorA.b,
    colorB.r, colorB.g, colorB.b
  );
  indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
};

const createSideGeometry = (grid: MaskGrid) => {
  const width = PLUSH_WIDTH;
  const height = PLUSH_WIDTH / grid.aspectRatio;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const pointFor = (row: number, col: number, z: number) =>
    new THREE.Vector3((col / grid.cols - 0.5) * width, (0.5 - row / grid.rows) * height, z);

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (!grid.cells[row][col]) {
        continue;
      }

      if (!isInside(grid.cells, row - 1, col)) {
        addSideQuad(
          positions,
          colors,
          indices,
          pointFor(row, col, SIDE_THICKNESS),
          pointFor(row, col + 1, SIDE_THICKNESS),
          pointFor(row, col, -SIDE_THICKNESS),
          pointFor(row, col + 1, -SIDE_THICKNESS),
          colorForGridPoint(grid, row, col),
          colorForGridPoint(grid, row, col + 1)
        );
      }

      if (!isInside(grid.cells, row + 1, col)) {
        addSideQuad(
          positions,
          colors,
          indices,
          pointFor(row + 1, col + 1, SIDE_THICKNESS),
          pointFor(row + 1, col, SIDE_THICKNESS),
          pointFor(row + 1, col + 1, -SIDE_THICKNESS),
          pointFor(row + 1, col, -SIDE_THICKNESS),
          colorForGridPoint(grid, row + 1, col + 1),
          colorForGridPoint(grid, row + 1, col)
        );
      }

      if (!isInside(grid.cells, row, col - 1)) {
        addSideQuad(
          positions,
          colors,
          indices,
          pointFor(row + 1, col, SIDE_THICKNESS),
          pointFor(row, col, SIDE_THICKNESS),
          pointFor(row + 1, col, -SIDE_THICKNESS),
          pointFor(row, col, -SIDE_THICKNESS),
          colorForGridPoint(grid, row + 1, col),
          colorForGridPoint(grid, row, col)
        );
      }

      if (!isInside(grid.cells, row, col + 1)) {
        addSideQuad(
          positions,
          colors,
          indices,
          pointFor(row, col + 1, SIDE_THICKNESS),
          pointFor(row + 1, col + 1, SIDE_THICKNESS),
          pointFor(row, col + 1, -SIDE_THICKNESS),
          pointFor(row + 1, col + 1, -SIDE_THICKNESS),
          colorForGridPoint(grid, row, col + 1),
          colorForGridPoint(grid, row + 1, col + 1)
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const createPlushMesh = (imageUri: string) => {
  const group = new THREE.Group();
  const texture = createTexture(imageUri);
  const grid = createMaskGrid(imageUri);
  const photoMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
  });

  const frontMesh = new THREE.Mesh(createSurfaceGeometry(grid, 1), photoMaterial);
  const backMesh = new THREE.Mesh(createSurfaceGeometry(grid, -1), photoMaterial);
  const sideMesh = new THREE.Mesh(
    createSideGeometry(grid),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
  );

  group.add(sideMesh, frontMesh, backMesh);
  group.rotation.x = -0.1;
  group.rotation.y = -0.25;

  return group;
};

export function PlushMeshViewer({ imageUri }: PlushMeshViewerProps) {
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

    const mesh = createPlushMesh(imageUri);
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
