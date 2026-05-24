import { Buffer } from 'buffer';
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Accelerometer } from 'expo-sensors';
import { Renderer, TextureLoader } from 'expo-three';
import { PNG } from 'pngjs/browser';
import * as THREE from 'three';

import type { DetectedOutline } from '@/lib/outlineDetection';

type PlushMeshViewerProps = {
  onPlushesPrepared?: () => void;
  plushes: {
    id: string;
    imageUri: string;
    outline: DetectedOutline;
  }[];
  physicsEnabled?: boolean;
};

type SceneState = {
  animationFrame: number | null;
  camera: THREE.PerspectiveCamera | null;
  mesh: THREE.Group | null;
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  viewportWorldHeight: number;
  viewportWorldWidth: number;
};

type PlushRuntime = {
  depthZ: number;
  id: string;
  mesh: THREE.Group;
  physics: PhysicsState;
  softness: PlushSoftnessState;
};

type PhysicsState = {
  angularVelocity: THREE.Vector3;
  dragAnchor: THREE.Vector3;
  dragging: boolean;
  grabOffset: THREE.Vector3;
  grabLocalOffset: THREE.Vector3;
  halfHeight: number;
  halfWidth: number;
  lastFrameTime: number | null;
  position: THREE.Vector3;
  radius: number;
  velocity: THREE.Vector3;
};

type PlushSoftnessState = {
  bend: THREE.Vector2;
  bendVelocity: THREE.Vector2;
  dentAmount: number;
  dentCenter: THREE.Vector2;
  dentNormal: THREE.Vector2;
  dentVelocity: number;
  scale: THREE.Vector3;
  scaleVelocity: THREE.Vector3;
  wobbleAngle: number;
  wobbleVelocity: number;
};

type PlushImpact = {
  normal: THREE.Vector3;
  strength: number;
};

type PlushBendMaterial = THREE.MeshBasicMaterial & {
  userData: THREE.MeshBasicMaterial['userData'] & {
    plushBendStrengthUniform?: { value: number };
    plushBendUniform?: { value: THREE.Vector2 };
    plushDentAmountUniform?: { value: number };
    plushDentCenterUniform?: { value: THREE.Vector2 };
    plushDentNormalUniform?: { value: THREE.Vector2 };
  };
};

type PlushHitMask = {
  cells: boolean[][];
  centerCol: number;
  centerRow: number;
  collisionCells: boolean[][];
  collisionPoints: THREE.Vector3[];
  collisionSampleSpacing: number;
  cols: number;
  rows: number;
  scaledHeight: number;
  scaledWidth: number;
};

type MaskGrid = {
  png: PNG;
  cols: number;
  rows: number;
  cells: boolean[][];
  collisionCells: boolean[][];
  distances: number[][];
  aspectRatio: number;
  visibleBounds: VisibleBounds;
};

type VisibleBounds = {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
};

const ALPHA_THRESHOLD = 24;
const COLLISION_ALPHA_THRESHOLD = 96;
const MAX_GRID_SIZE = 132;
const PLUSH_WIDTH = 3.1;
const PLUSH_TARGET_SIZE = 1.1;
const PUFF_AMOUNT = 0.2;
const EDGE_VOLUME_AMOUNT = 0.075;
const FLAT_EDGE_BAND = 0.055;
const SIDE_THICKNESS = 0;
const DEFAULT_ROTATION = { x: -0.1, y: -0.25, z: 0 };
const PHYSICS_GRAVITY = 12.5;
const DEVICE_GRAVITY_SMOOTHING = 0.72;
const DEVICE_GRAVITY_UPDATE_MS = 16;
const DEVICE_GRAVITY_WAKEUP_IMPULSE = 0.42;
const DEVICE_SHAKE_THRESHOLD = 1.05;
const DEVICE_SHAKE_IMPULSE = 2.2;
const DEVICE_SHAKE_TUMBLE = 2.8;
const DEVICE_SHAKE_COOLDOWN_MS = 120;
const PHYSICS_BOUNCE = 0.18;
const PHYSICS_LINEAR_DAMPING = 0.992;
const PHYSICS_ANGULAR_DAMPING = 0.999;
const PHYSICS_FLOOR_ANGULAR_DAMPING = 0.82;
const PHYSICS_FLOOR_FRICTION = 0.84;
const PHYSICS_REST_VELOCITY = 0.08;
const PHYSICS_SLEEP_VELOCITY = 0.16;
const PHYSICS_SLEEP_ANGULAR_VELOCITY = 0.18;
const PHYSICS_FLOOR_REST_DAMPING = 0.78;
const PHYSICS_FLOOR_REST_ANGULAR_DAMPING = 0.68;
const PHYSICS_DRAG_ROTATION = 0.68;
const PHYSICS_RELEASE_TORQUE = 0.54;
const PHYSICS_THROW_TUMBLE = 0.95;
const PHYSICS_MAX_ANGULAR_SPEED = 7;
const PHYSICS_HANG_TORQUE = 18;
const PHYSICS_HANG_DAMPING = 0.975;
const PHYSICS_FLOOR_TOPPLE_TORQUE = 4.8;
const PHYSICS_AIR_GRAVITY_TUMBLE = 0.34;
const PHYSICS_PLUSH_COLLISION_BOUNCE = 0.24;
const PHYSICS_PLUSH_COLLISION_PUSH = 0.42;
const PHYSICS_PLUSH_COLLISION_RADIUS_SCALE = 0.86;
const PHYSICS_PLUSH_RESTING_CONTACT_SPEED = 0.45;
const PHYSICS_PLUSH_CONTACT_DAMPING = 0.52;
const PHYSICS_PLUSH_RESTING_OVERLAP_ALLOWANCE = 1;
const PHYSICS_PLUSH_MAX_MASK_PUSH = 0.022;
const PHYSICS_PLUSH_RESTING_POSITION_CORRECTION = 0.7;
const PLUSH_DEPTH_SPACING = 0.045;
const PLUSH_MAX_DEPTH = 0.14;
const MAX_COLLISION_SAMPLE_POINTS = 520;
const PHYSICS_SCREEN_COLLISION_CELL_SIZE = 0.035;

const plushSoftnessTuning = {
  impactSquashAmount: 0.08,
  squashDuration: 0.12,
  returnSpringStrength: 95,
  wobbleAmount: 0.055,
  maxSquash: 0.12,
  impactStretchAmount: 0.32,
  impactThreshold: 0.12,
  impactStrengthForMaxSquash: 3.2,
  scaleDamping: 16,
  wobbleSpringStrength: 58,
  wobbleDamping: 8.5,
  bodyFlexAmount: 0,
  maxBend: 0.05,
  bendSpringStrength: 42,
  bendDamping: 7.5,
  velocityBendAmount: 0.032,
  spinBendAmount: 0.018,
  impactDentAmount: 0.08,
  maxDent: 0.1,
  dentRadius: 0.82,
  dentSpringStrength: 110,
  dentDamping: 13,
};

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

const addGpuBendToMaterial = (material: THREE.MeshBasicMaterial, halfWidth: number, halfHeight: number) => {
  const bendUniform = { value: new THREE.Vector2() };
  const bendStrengthUniform = { value: 0 };
  const dentAmountUniform = { value: 0 };
  const dentCenterUniform = { value: new THREE.Vector2(0, -1) };
  const dentNormalUniform = { value: new THREE.Vector2(0, 1) };
  const halfSizeUniform = { value: new THREE.Vector2(Math.max(halfWidth, 0.001), Math.max(halfHeight, 0.001)) };
  const bendMaterial = material as PlushBendMaterial;

  bendMaterial.userData.plushBendUniform = bendUniform;
  bendMaterial.userData.plushBendStrengthUniform = bendStrengthUniform;
  bendMaterial.userData.plushDentAmountUniform = dentAmountUniform;
  bendMaterial.userData.plushDentCenterUniform = dentCenterUniform;
  bendMaterial.userData.plushDentNormalUniform = dentNormalUniform;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.plushBend = bendUniform;
    shader.uniforms.plushBendStrength = bendStrengthUniform;
    shader.uniforms.plushDentAmount = dentAmountUniform;
    shader.uniforms.plushDentCenter = dentCenterUniform;
    shader.uniforms.plushDentNormal = dentNormalUniform;
    shader.uniforms.plushHalfSize = halfSizeUniform;
    shader.vertexShader = `
      uniform vec2 plushBend;
      uniform float plushBendStrength;
      uniform float plushDentAmount;
      uniform vec2 plushDentCenter;
      uniform vec2 plushDentNormal;
      uniform vec2 plushHalfSize;
    ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec2 plushNormalizedPosition = clamp(transformed.xy / plushHalfSize, vec2(-1.0), vec2(1.0));
      float plushEdgeGive = max(abs(plushNormalizedPosition.x), abs(plushNormalizedPosition.y));
      float plushCenterHold = 0.35 + plushEdgeGive * 0.65;
      transformed.x += plushBend.x * plushNormalizedPosition.y * abs(plushNormalizedPosition.y) * plushCenterHold;
      transformed.y += plushBend.y * plushNormalizedPosition.x * abs(plushNormalizedPosition.x) * plushCenterHold;
      transformed.z *= 1.0 - plushBendStrength * 0.45;
      float plushDentDistance = distance(plushNormalizedPosition, plushDentCenter);
      float plushDentFalloff = smoothstep(${plushSoftnessTuning.dentRadius.toFixed(2)}, 0.0, plushDentDistance);
      transformed.xy += plushDentNormal * plushDentAmount * plushDentFalloff * plushHalfSize;
      transformed.z *= 1.0 - plushDentAmount * plushDentFalloff * 0.75;
      `
    );
  };
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

const sampleCellAlpha = (png: PNG, row: number, col: number, rows: number, cols: number) => {
  let alphaTotal = 0;
  let sampleCount = 0;

  for (let ySample = 0; ySample < 3; ySample += 1) {
    for (let xSample = 0; xSample < 3; xSample += 1) {
      const sourceX = Math.floor(((col + (xSample + 0.5) / 3) / cols) * png.width);
      const sourceY = Math.floor(((row + (ySample + 0.5) / 3) / rows) * png.height);
      alphaTotal += getAlphaAt(png, sourceX, sourceY);
      sampleCount += 1;
    }
  }

  return alphaTotal / sampleCount;
};

const findVisibleBounds = (cells: boolean[][]): VisibleBounds => {
  let minCol = cells[0].length;
  let maxCol = 0;
  let minRow = cells.length;
  let maxRow = 0;

  for (let row = 0; row < cells.length; row += 1) {
    for (let col = 0; col < cells[0].length; col += 1) {
      if (!cells[row][col]) {
        continue;
      }

      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col + 1);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row + 1);
    }
  }

  if (minCol > maxCol || minRow > maxRow) {
    return { minCol: 0, maxCol: cells[0].length, minRow: 0, maxRow: cells.length };
  }

  return { minCol, maxCol, minRow, maxRow };
};

const createMaskGrid = (imageUri: string): MaskGrid => {
  const png = PNG.sync.read(Buffer.from(getBase64FromDataUri(imageUri), 'base64'));
  const aspectRatio = png.width / png.height;
  const cols = aspectRatio >= 1 ? MAX_GRID_SIZE : Math.max(18, Math.round(MAX_GRID_SIZE * aspectRatio));
  const rows = aspectRatio >= 1 ? Math.max(18, Math.round(MAX_GRID_SIZE / aspectRatio)) : MAX_GRID_SIZE;
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const collisionCells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const alpha = sampleCellAlpha(png, row, col, rows, cols);
      cells[row][col] = alpha > ALPHA_THRESHOLD;
      collisionCells[row][col] = alpha > COLLISION_ALPHA_THRESHOLD;
    }
  }

  const distances = computeCellDistances(cells);
  const visibleBounds = findVisibleBounds(cells);

  return { png, cols, rows, cells, collisionCells, distances, aspectRatio, visibleBounds };
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

const createGridMetrics = (grid: MaskGrid) => {
  const width = PLUSH_WIDTH;
  const height = PLUSH_WIDTH / grid.aspectRatio;
  const { minCol, maxCol, minRow, maxRow } = grid.visibleBounds;
  const centerCol = (minCol + maxCol) / 2;
  const centerRow = (minRow + maxRow) / 2;
  const visibleWidth = ((maxCol - minCol) / grid.cols) * width;
  const visibleHeight = ((maxRow - minRow) / grid.rows) * height;
  const scale = PLUSH_TARGET_SIZE / Math.max(visibleWidth, visibleHeight, 0.001);

  return {
    centerCol,
    centerRow,
    scale,
    scaledHeight: height * scale,
    scaledVisibleHeight: visibleHeight * scale,
    scaledVisibleWidth: visibleWidth * scale,
    scaledWidth: width * scale,
  };
};

const createGridProjector = (grid: MaskGrid) => {
  const { centerCol, centerRow, scaledHeight, scaledWidth } = createGridMetrics(grid);

  return (row: number, col: number, z = 0) =>
    new THREE.Vector3(
      ((col - centerCol) / grid.cols) * scaledWidth,
      ((centerRow - row) / grid.rows) * scaledHeight,
      z
    );
};

const createSurfaceGeometry = (grid: MaskGrid, direction: 1 | -1) => {
  const maxDistance = Math.max(1, ...grid.distances.flat());
  const projectPoint = createGridProjector(grid);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= grid.rows; row += 1) {
    for (let col = 0; col <= grid.cols; col += 1) {
      const distance = getVertexDistance(grid, row, col);
      const normalizedDistance = Math.max(0, (distance - 1) / Math.max(1, maxDistance - 1));
      const volumeDistance = Math.max(0, (normalizedDistance - FLAT_EDGE_BAND) / (1 - FLAT_EDGE_BAND));
      const smoothPuff = volumeDistance * volumeDistance * (3 - 2 * volumeDistance);
      const edgeVolume = EDGE_VOLUME_AMOUNT * (1 - Math.exp(-volumeDistance * 18));
      const puff = edgeVolume + (PUFF_AMOUNT - EDGE_VOLUME_AMOUNT) * smoothPuff;
      const z = direction * (SIDE_THICKNESS + puff);
      const point = projectPoint(row, col, z);

      positions.push(point.x, point.y, point.z);
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
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const pointFor = createGridProjector(grid);

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

const createCollisionSamples = (grid: MaskGrid) => {
  const pointFor = createGridProjector(grid);
  const solidCells: { row: number; col: number }[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (grid.collisionCells[row][col]) {
        solidCells.push({ row, col });
      }
    }
  }

  const step = Math.max(1, Math.ceil(solidCells.length / MAX_COLLISION_SAMPLE_POINTS));
  const points: THREE.Vector3[] = [];

  for (let index = 0; index < solidCells.length; index += step) {
    const cell = solidCells[index];
    points.push(pointFor(cell.row + 0.5, cell.col + 0.5, 0));
  }

  return {
    points,
    spacing: Math.max(1, step),
  };
};

const createPlushMesh = (imageUri: string) => {
  const group = new THREE.Group();
  const visualGroup = new THREE.Group();
  const texture = createTexture(imageUri);
  const grid = createMaskGrid(imageUri);
  const gridMetrics = createGridMetrics(grid);
  const collisionSamples = createCollisionSamples(grid);
  const photoMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.08,
    side: THREE.DoubleSide,
  });
  const sideMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });

  const frontMesh = new THREE.Mesh(createSurfaceGeometry(grid, 1), photoMaterial);
  const backMesh = new THREE.Mesh(createSurfaceGeometry(grid, -1), photoMaterial);
  const sideMesh = new THREE.Mesh(createSideGeometry(grid), sideMaterial);

  addGpuBendToMaterial(photoMaterial, gridMetrics.scaledVisibleWidth / 2, gridMetrics.scaledVisibleHeight / 2);
  addGpuBendToMaterial(sideMaterial, gridMetrics.scaledVisibleWidth / 2, gridMetrics.scaledVisibleHeight / 2);

  visualGroup.add(sideMesh, frontMesh, backMesh);
  group.add(visualGroup);
  group.rotation.set(DEFAULT_ROTATION.x, DEFAULT_ROTATION.y, DEFAULT_ROTATION.z);
  group.userData.visualGroup = visualGroup;
  group.userData.physicsRadius = Math.max(gridMetrics.scaledVisibleWidth, gridMetrics.scaledVisibleHeight) / 2;
  group.userData.physicsHalfWidth = gridMetrics.scaledVisibleWidth / 2;
  group.userData.physicsHalfHeight = gridMetrics.scaledVisibleHeight / 2;
  group.userData.hitMask = {
    cells: grid.cells,
    centerCol: gridMetrics.centerCol,
    centerRow: gridMetrics.centerRow,
    collisionCells: grid.collisionCells,
    collisionPoints: collisionSamples.points,
    collisionSampleSpacing: collisionSamples.spacing,
    cols: grid.cols,
    rows: grid.rows,
    scaledHeight: gridMetrics.scaledHeight,
    scaledWidth: gridMetrics.scaledWidth,
  } satisfies PlushHitMask;

  return group;
};

const getWorldPoint = (
  state: SceneState,
  layout: { width: number; height: number },
  locationX: number,
  locationY: number
) =>
  new THREE.Vector3(
    layout.width > 0 ? (locationX / layout.width - 0.5) * state.viewportWorldWidth : 0,
    layout.height > 0 ? (0.5 - locationY / layout.height) * state.viewportWorldHeight : 0,
    0
  );

const getAccelerometerGravity = (x: number, y: number) => {
  const gravity = new THREE.Vector3(x, y, 0);

  if (gravity.lengthSq() < 0.0001) {
    return new THREE.Vector3(0, -PHYSICS_GRAVITY, 0);
  }

  return gravity.normalize().multiplyScalar(PHYSICS_GRAVITY);
};

const applyShakeImpulse = (runtimes: PlushRuntime[], shake: THREE.Vector3) => {
  const shakeStrength = shake.length();

  if (shakeStrength < DEVICE_SHAKE_THRESHOLD) {
    return;
  }

  const shakeDirection = shake.clone().normalize();
  const impulseStrength = Math.min(1.8, shakeStrength) * DEVICE_SHAKE_IMPULSE;

  runtimes.forEach((runtime, index) => {
    if (runtime.physics.dragging) {
      return;
    }

    const alternatingKick = index % 2 === 0 ? 1 : -1;
    runtime.physics.velocity.x += shakeDirection.x * impulseStrength;
    runtime.physics.velocity.y += shakeDirection.y * impulseStrength;
    runtime.physics.angularVelocity.z +=
      alternatingKick * DEVICE_SHAKE_TUMBLE * Math.min(1.6, shakeStrength);
    clampAngularVelocity(runtime.physics.angularVelocity);
  });
};

const getRotatedHalfExtents = (physics: PhysicsState, rotationZ: number) => {
  const cos = Math.abs(Math.cos(rotationZ));
  const sin = Math.abs(Math.sin(rotationZ));

  return {
    x: physics.halfWidth * cos + physics.halfHeight * sin,
    y: physics.halfWidth * sin + physics.halfHeight * cos,
  };
};

const getProjectedHalfExtents = (mesh: THREE.Group, physics: PhysicsState) => {
  const hitMask = mesh.userData.hitMask as PlushHitMask | undefined;

  if (!hitMask || hitMask.collisionPoints.length === 0) {
    return getRotatedHalfExtents(physics, mesh.rotation.z);
  }

  let maxX = 0;
  let maxY = 0;

  for (const point of hitMask.collisionPoints) {
    const projectedPoint = point.clone().applyQuaternion(mesh.quaternion);
    maxX = Math.max(maxX, Math.abs(projectedPoint.x));
    maxY = Math.max(maxY, Math.abs(projectedPoint.y));
  }

  return {
    x: Math.max(maxX, 0.001),
    y: Math.max(maxY, 0.001),
  };
};

const getVisualDepthForIndex = (index: number, totalCount: number) =>
  THREE.MathUtils.clamp((index - (totalCount - 1) / 2) * PLUSH_DEPTH_SPACING, -PLUSH_MAX_DEPTH, PLUSH_MAX_DEPTH);

const createPhysicsState = (): PhysicsState => ({
  angularVelocity: new THREE.Vector3(),
  dragAnchor: new THREE.Vector3(),
  dragging: false,
  grabOffset: new THREE.Vector3(),
  grabLocalOffset: new THREE.Vector3(),
  halfHeight: PLUSH_TARGET_SIZE / 2,
  halfWidth: PLUSH_TARGET_SIZE / 2,
  lastFrameTime: null,
  position: new THREE.Vector3(),
  radius: PLUSH_TARGET_SIZE / 2,
  velocity: new THREE.Vector3(),
});

const createSoftnessState = (): PlushSoftnessState => ({
  bend: new THREE.Vector2(),
  bendVelocity: new THREE.Vector2(),
  dentAmount: 0,
  dentCenter: new THREE.Vector2(0, -1),
  dentNormal: new THREE.Vector2(0, 1),
  dentVelocity: 0,
  scale: new THREE.Vector3(1, 1, 1),
  scaleVelocity: new THREE.Vector3(),
  wobbleAngle: 0,
  wobbleVelocity: 0,
});

const clampPlushToBounds = (mesh: THREE.Group, physics: PhysicsState, state: SceneState) => {
  const halfExtents = getProjectedHalfExtents(mesh, physics);
  const maxX = Math.max(0, state.viewportWorldWidth / 2 - halfExtents.x);
  const maxY = Math.max(0, state.viewportWorldHeight / 2 - halfExtents.y);
  let isTouchingFloor = false;
  const impacts: PlushImpact[] = [];

  if (physics.position.x < -maxX) {
    const impactStrength = Math.abs(physics.velocity.x);
    physics.position.x = -maxX;
    physics.velocity.x = Math.abs(physics.velocity.x) * PHYSICS_BOUNCE;
    physics.angularVelocity.z += Math.abs(physics.velocity.y) * 0.08;

    if (impactStrength >= plushSoftnessTuning.impactThreshold) {
      impacts.push({ normal: new THREE.Vector3(1, 0, 0), strength: impactStrength });
    }
  } else if (physics.position.x > maxX) {
    const impactStrength = Math.abs(physics.velocity.x);
    physics.position.x = maxX;
    physics.velocity.x = -Math.abs(physics.velocity.x) * PHYSICS_BOUNCE;
    physics.angularVelocity.z -= Math.abs(physics.velocity.y) * 0.08;

    if (impactStrength >= plushSoftnessTuning.impactThreshold) {
      impacts.push({ normal: new THREE.Vector3(-1, 0, 0), strength: impactStrength });
    }
  }

  if (physics.position.y < -maxY) {
    const impactStrength = Math.abs(physics.velocity.y);
    physics.position.y = -maxY;
    physics.velocity.y = Math.abs(physics.velocity.y) * PHYSICS_BOUNCE;
    physics.velocity.x *= PHYSICS_FLOOR_FRICTION;
    physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_ANGULAR_DAMPING);
    isTouchingFloor = true;

    if (impactStrength >= plushSoftnessTuning.impactThreshold) {
      impacts.push({ normal: new THREE.Vector3(0, 1, 0), strength: impactStrength });
    }
  } else if (physics.position.y > maxY) {
    const impactStrength = Math.abs(physics.velocity.y);
    physics.position.y = maxY;
    physics.velocity.y = -Math.abs(physics.velocity.y) * PHYSICS_BOUNCE;
    physics.angularVelocity.z -= physics.velocity.x * 0.08;

    if (impactStrength >= plushSoftnessTuning.impactThreshold) {
      impacts.push({ normal: new THREE.Vector3(0, -1, 0), strength: impactStrength });
    }
  }

  return { impacts, isTouchingFloor };
};

const applyAngularVelocity = (mesh: THREE.Group, angularVelocity: THREE.Vector3, deltaSeconds: number) => {
  const angularSpeed = angularVelocity.length();

  if (angularSpeed <= 0.0001) {
    return;
  }

  const rotationDelta = new THREE.Quaternion().setFromAxisAngle(
    angularVelocity.clone().normalize(),
    angularSpeed * deltaSeconds
  );
  mesh.quaternion.premultiply(rotationDelta);
  mesh.quaternion.normalize();
};

const clampAngularVelocity = (angularVelocity: THREE.Vector3) => {
  if (angularVelocity.lengthSq() > PHYSICS_MAX_ANGULAR_SPEED * PHYSICS_MAX_ANGULAR_SPEED) {
    angularVelocity.setLength(PHYSICS_MAX_ANGULAR_SPEED);
  }
};

const dampRestingFloorMotion = (physics: PhysicsState) => {
  physics.velocity.x *= PHYSICS_FLOOR_REST_DAMPING;
  physics.velocity.y = Math.max(0, physics.velocity.y);
  physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_REST_ANGULAR_DAMPING);

  if (
    Math.abs(physics.velocity.x) < PHYSICS_SLEEP_VELOCITY &&
    Math.abs(physics.velocity.y) < PHYSICS_SLEEP_VELOCITY &&
    physics.angularVelocity.length() < PHYSICS_SLEEP_ANGULAR_VELOCITY
  ) {
    physics.velocity.set(0, 0, 0);
    physics.angularVelocity.set(0, 0, 0);
  }
};

const getPlushVisualGroup = (mesh: THREE.Group) => mesh.userData.visualGroup as THREE.Group | undefined;

const resetPlushSoftness = (mesh: THREE.Group | null, softness: PlushSoftnessState) => {
  softness.bend.set(0, 0);
  softness.bendVelocity.set(0, 0);
  softness.dentAmount = 0;
  softness.dentCenter.set(0, -1);
  softness.dentNormal.set(0, 1);
  softness.dentVelocity = 0;
  softness.scale.set(1, 1, 1);
  softness.scaleVelocity.set(0, 0, 0);
  softness.wobbleAngle = 0;
  softness.wobbleVelocity = 0;

  const visualGroup = mesh ? getPlushVisualGroup(mesh) : undefined;

  visualGroup?.scale.set(1, 1, 1);
  visualGroup?.rotation.set(0, 0, 0);

  if (mesh) {
    updateGpuBend(mesh, softness);
  }
};

const updateGpuBend = (mesh: THREE.Group, softness: PlushSoftnessState) => {
  const visualGroup = getPlushVisualGroup(mesh);

  if (!visualGroup) {
    return;
  }

  const bendStrength = Math.min(1, softness.bend.length() / plushSoftnessTuning.maxBend);

  visualGroup.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];

    materials.forEach((material) => {
      const bendMaterial = material as PlushBendMaterial;
      bendMaterial.userData.plushBendUniform?.value.copy(softness.bend);
      bendMaterial.userData.plushDentCenterUniform?.value.copy(softness.dentCenter);
      bendMaterial.userData.plushDentNormalUniform?.value.copy(softness.dentNormal);

      if (bendMaterial.userData.plushBendStrengthUniform) {
        bendMaterial.userData.plushBendStrengthUniform.value = bendStrength;
      }

      if (bendMaterial.userData.plushDentAmountUniform) {
        bendMaterial.userData.plushDentAmountUniform.value = softness.dentAmount;
      }
    });
  });
};

const registerPlushImpact = (mesh: THREE.Group, softness: PlushSoftnessState, impact: PlushImpact) => {
  const normalizedStrength = Math.min(1, impact.strength / plushSoftnessTuning.impactStrengthForMaxSquash);
  const squash = Math.min(
    plushSoftnessTuning.maxSquash,
    normalizedStrength * plushSoftnessTuning.impactSquashAmount
  );

  if (squash <= 0) {
    return;
  }

  const localNormal = impact.normal.clone().applyQuaternion(mesh.quaternion.clone().invert()).normalize();
  const axisWeights = new THREE.Vector3(Math.abs(localNormal.x), Math.abs(localNormal.y), Math.abs(localNormal.z));
  const totalWeight = axisWeights.x + axisWeights.y + axisWeights.z || 1;
  axisWeights.multiplyScalar(1 / totalWeight);

  const stretch = squash * plushSoftnessTuning.impactStretchAmount;
  const impactScale = new THREE.Vector3(
    1 - squash * axisWeights.x + stretch * (1 - axisWeights.x) * 0.5,
    1 - squash * axisWeights.y + stretch * (1 - axisWeights.y) * 0.5,
    1 - squash * axisWeights.z + stretch * (1 - axisWeights.z) * 0.35
  );

  impactScale.set(
    THREE.MathUtils.clamp(impactScale.x, 1 - plushSoftnessTuning.maxSquash, 1 + plushSoftnessTuning.maxSquash),
    THREE.MathUtils.clamp(impactScale.y, 1 - plushSoftnessTuning.maxSquash, 1 + plushSoftnessTuning.maxSquash),
    THREE.MathUtils.clamp(impactScale.z, 1 - plushSoftnessTuning.maxSquash, 1 + plushSoftnessTuning.maxSquash * 0.75)
  );

  softness.scale.lerp(impactScale, 0.82);
  softness.scaleVelocity.addScaledVector(
    new THREE.Vector3(1, 1, 1).sub(impactScale),
    1 / plushSoftnessTuning.squashDuration
  );

  const dentNormal = new THREE.Vector2(localNormal.x, localNormal.y);

  if (dentNormal.lengthSq() > 0.0001) {
    dentNormal.normalize();
    softness.dentNormal.copy(dentNormal);
    softness.dentCenter.copy(dentNormal).multiplyScalar(-1);
    softness.dentAmount = Math.min(
      plushSoftnessTuning.maxDent,
      normalizedStrength * plushSoftnessTuning.impactDentAmount
    );
    softness.dentVelocity += softness.dentAmount * 12;
  }

  const wobbleDirection = Math.sign(localNormal.x || localNormal.y || 1);
  softness.wobbleVelocity += wobbleDirection * normalizedStrength * plushSoftnessTuning.wobbleAmount * 22;
};

const applyPlushSoftnessFrame = (
  mesh: THREE.Group,
  physics: PhysicsState,
  softness: PlushSoftnessState,
  deltaSeconds: number
) => {
  const visualGroup = getPlushVisualGroup(mesh);

  if (!visualGroup) {
    return;
  }

  const identityScale = new THREE.Vector3(1, 1, 1);
  const springForce = identityScale.sub(softness.scale).multiplyScalar(plushSoftnessTuning.returnSpringStrength);
  softness.scaleVelocity.addScaledVector(springForce, deltaSeconds);
  softness.scaleVelocity.multiplyScalar(Math.exp(-plushSoftnessTuning.scaleDamping * deltaSeconds));
  softness.scale.addScaledVector(softness.scaleVelocity, deltaSeconds);

  softness.scale.set(
    THREE.MathUtils.clamp(softness.scale.x, 1 - plushSoftnessTuning.maxSquash, 1 + plushSoftnessTuning.maxSquash),
    THREE.MathUtils.clamp(softness.scale.y, 1 - plushSoftnessTuning.maxSquash, 1 + plushSoftnessTuning.maxSquash),
    THREE.MathUtils.clamp(softness.scale.z, 1 - plushSoftnessTuning.maxSquash, 1 + plushSoftnessTuning.maxSquash)
  );

  const wobbleForce = -softness.wobbleAngle * plushSoftnessTuning.wobbleSpringStrength;
  softness.wobbleVelocity += wobbleForce * deltaSeconds;
  softness.wobbleVelocity *= Math.exp(-plushSoftnessTuning.wobbleDamping * deltaSeconds);
  softness.wobbleAngle += softness.wobbleVelocity * deltaSeconds;

  const dentForce = -softness.dentAmount * plushSoftnessTuning.dentSpringStrength;
  softness.dentVelocity += dentForce * deltaSeconds;
  softness.dentVelocity *= Math.exp(-plushSoftnessTuning.dentDamping * deltaSeconds);
  softness.dentAmount += softness.dentVelocity * deltaSeconds;

  if (softness.dentAmount < 0.001 && Math.abs(softness.dentVelocity) < 0.001) {
    softness.dentAmount = 0;
    softness.dentVelocity = 0;
  }

  softness.dentAmount = THREE.MathUtils.clamp(softness.dentAmount, 0, plushSoftnessTuning.maxDent);

  const localVelocity = physics.velocity.clone().applyQuaternion(mesh.quaternion.clone().invert());
  const targetBend = new THREE.Vector2(
    THREE.MathUtils.clamp(
      (-localVelocity.x * plushSoftnessTuning.velocityBendAmount +
        physics.angularVelocity.z * plushSoftnessTuning.spinBendAmount) *
        plushSoftnessTuning.bodyFlexAmount,
      -plushSoftnessTuning.maxBend,
      plushSoftnessTuning.maxBend
    ),
    THREE.MathUtils.clamp(
      -localVelocity.y * plushSoftnessTuning.velocityBendAmount * plushSoftnessTuning.bodyFlexAmount,
      -plushSoftnessTuning.maxBend,
      plushSoftnessTuning.maxBend
    )
  );
  const bendForce = targetBend.sub(softness.bend).multiplyScalar(plushSoftnessTuning.bendSpringStrength);
  softness.bendVelocity.addScaledVector(bendForce, deltaSeconds);
  softness.bendVelocity.multiplyScalar(Math.exp(-plushSoftnessTuning.bendDamping * deltaSeconds));
  softness.bend.addScaledVector(softness.bendVelocity, deltaSeconds);

  if (softness.bend.length() > plushSoftnessTuning.maxBend) {
    softness.bend.setLength(plushSoftnessTuning.maxBend);
  }

  visualGroup.scale.copy(softness.scale);
  visualGroup.rotation.z = THREE.MathUtils.clamp(
    softness.wobbleAngle,
    -plushSoftnessTuning.wobbleAmount,
    plushSoftnessTuning.wobbleAmount
  );
  updateGpuBend(mesh, softness);
};

const applyPhysicsFrame = (
  mesh: THREE.Group,
  physics: PhysicsState,
  softness: PlushSoftnessState,
  state: SceneState,
  gravity: THREE.Vector3,
  frameTime: number
) => {
  if (physics.lastFrameTime === null) {
    physics.lastFrameTime = frameTime;
    return;
  }

  const deltaSeconds = Math.min(0.033, (frameTime - physics.lastFrameTime) / 1000);
  physics.lastFrameTime = frameTime;

  if (physics.dragging) {
    const previousPosition = physics.position.clone();

    physics.angularVelocity.x = 0;
    physics.angularVelocity.y = 0;

    const grabWorldOffset = physics.grabLocalOffset.clone().applyQuaternion(mesh.quaternion);
    const gravityTorqueZ = -(grabWorldOffset.x * gravity.y - grabWorldOffset.y * gravity.x);

    physics.angularVelocity.z += gravityTorqueZ * PHYSICS_HANG_TORQUE * deltaSeconds;
    clampAngularVelocity(physics.angularVelocity);
    physics.angularVelocity.multiplyScalar(PHYSICS_HANG_DAMPING);
    applyAngularVelocity(mesh, new THREE.Vector3(0, 0, physics.angularVelocity.z), deltaSeconds);

    const nextGrabWorldOffset = physics.grabLocalOffset.clone().applyQuaternion(mesh.quaternion);
    physics.position.copy(physics.dragAnchor).sub(nextGrabWorldOffset);
    physics.position.z = physics.position.z || mesh.position.z;
    physics.velocity.subVectors(physics.position, previousPosition).multiplyScalar(1 / Math.max(deltaSeconds, 0.001));
    physics.velocity.z = 0;
  } else {
    physics.velocity.addScaledVector(gravity, deltaSeconds);
    const gravityTumbleZ = physics.velocity.x * gravity.y - physics.velocity.y * gravity.x;
    physics.angularVelocity.z += gravityTumbleZ * PHYSICS_AIR_GRAVITY_TUMBLE * deltaSeconds;
    clampAngularVelocity(physics.angularVelocity);

    physics.position.addScaledVector(physics.velocity, deltaSeconds);
    physics.velocity.multiplyScalar(PHYSICS_LINEAR_DAMPING);

    applyAngularVelocity(mesh, physics.angularVelocity, deltaSeconds);
    physics.angularVelocity.multiplyScalar(PHYSICS_ANGULAR_DAMPING);

    const { impacts, isTouchingFloor } = clampPlushToBounds(mesh, physics, state);

    impacts.forEach((impact) => registerPlushImpact(mesh, softness, impact));

    if (impacts.length > 0 && physics.velocity.length() < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
      physics.velocity.multiplyScalar(PHYSICS_FLOOR_REST_DAMPING);
      physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_REST_ANGULAR_DAMPING);
    }

    if (isTouchingFloor) {
      const tallness = Math.max(0, (physics.halfHeight - physics.halfWidth) / Math.max(physics.halfHeight, 0.001));
      const uprightness = Math.abs(Math.cos(mesh.rotation.z));
      const toppleDirection = Math.sign(physics.angularVelocity.z || physics.velocity.x || Math.sin(mesh.rotation.z) || 1);

      physics.angularVelocity.z +=
        toppleDirection * tallness * uprightness * PHYSICS_FLOOR_TOPPLE_TORQUE * deltaSeconds;
      physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_ANGULAR_DAMPING);

      if (physics.velocity.length() < PHYSICS_REST_VELOCITY && uprightness < 0.28) {
        physics.velocity.set(0, 0, 0);
        physics.angularVelocity.set(0, 0, 0);
      }

      if (physics.velocity.length() < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
        dampRestingFloorMotion(physics);
      }
    }
  }

  applyPlushSoftnessFrame(mesh, physics, softness, deltaSeconds);
  physics.velocity.z = 0;
  mesh.position.copy(physics.position);
};

type MaskOverlap = {
  count: number;
  normal: THREE.Vector2;
};

type ProjectedCollisionPoint = {
  x: number;
  y: number;
};

const getScreenWorldPoint = (runtime: PlushRuntime, localPoint: THREE.Vector3) =>
  localPoint
    .clone()
    .applyQuaternion(runtime.mesh.quaternion)
    .add(runtime.physics.position);

const getProjectedCollisionPoints = (runtime: PlushRuntime) => {
  const hitMask = runtime.mesh.userData.hitMask as PlushHitMask | undefined;

  if (!hitMask) {
    return [];
  }

  return hitMask.collisionPoints.map((samplePoint) => {
    const worldPoint = getScreenWorldPoint(runtime, samplePoint);
    return { x: worldPoint.x, y: worldPoint.y };
  });
};

const getCollisionCellKey = (x: number, y: number) =>
  `${Math.floor(x / PHYSICS_SCREEN_COLLISION_CELL_SIZE)},${Math.floor(y / PHYSICS_SCREEN_COLLISION_CELL_SIZE)}`;

const createProjectedPointGrid = (points: ProjectedCollisionPoint[]) => {
  const grid = new Map<string, ProjectedCollisionPoint[]>();

  points.forEach((point) => {
    const key = getCollisionCellKey(point.x, point.y);
    const cellPoints = grid.get(key);

    if (cellPoints) {
      cellPoints.push(point);
    } else {
      grid.set(key, [point]);
    }
  });

  return grid;
};

const hasNearbyProjectedPoint = (
  point: ProjectedCollisionPoint,
  targetGrid: Map<string, ProjectedCollisionPoint[]>
) => {
  const cellX = Math.floor(point.x / PHYSICS_SCREEN_COLLISION_CELL_SIZE);
  const cellY = Math.floor(point.y / PHYSICS_SCREEN_COLLISION_CELL_SIZE);
  const maxDistanceSq = PHYSICS_SCREEN_COLLISION_CELL_SIZE * PHYSICS_SCREEN_COLLISION_CELL_SIZE;

  for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      const cellPoints = targetGrid.get(`${cellX + xOffset},${cellY + yOffset}`);

      if (!cellPoints) {
        continue;
      }

      for (const targetPoint of cellPoints) {
        const dx = point.x - targetPoint.x;
        const dy = point.y - targetPoint.y;

        if (dx * dx + dy * dy <= maxDistanceSq) {
          return true;
        }
      }
    }
  }

  return false;
};

const getMaskOverlap = (
  source: PlushRuntime,
  target: PlushRuntime,
  sourcePoints: ProjectedCollisionPoint[],
  targetGrid: Map<string, ProjectedCollisionPoint[]>
): MaskOverlap => {
  const sourceHitMask = source.mesh.userData.hitMask as PlushHitMask | undefined;

  if (!sourceHitMask) {
    return { count: 0, normal: new THREE.Vector2() };
  }

  let overlapCount = 0;
  const overlapCenter = new THREE.Vector2();

  for (const point of sourcePoints) {
    if (hasNearbyProjectedPoint(point, targetGrid)) {
      overlapCount += 1;
      overlapCenter.x += point.x;
      overlapCenter.y += point.y;
    }
  }

  if (overlapCount === 0) {
    return { count: 0, normal: new THREE.Vector2() };
  }

  overlapCenter.multiplyScalar(1 / overlapCount);

  return {
    count: overlapCount * sourceHitMask.collisionSampleSpacing,
    normal: new THREE.Vector2(overlapCenter.x - target.physics.position.x, overlapCenter.y - target.physics.position.y),
  };
};

const resolvePlushCollision = (a: PlushRuntime, b: PlushRuntime) => {
  const delta = new THREE.Vector2(
    b.physics.position.x - a.physics.position.x,
    b.physics.position.y - a.physics.position.y
  );
  const distance = Math.max(delta.length(), 0.0001);
  const radiusA = a.physics.radius * PHYSICS_PLUSH_COLLISION_RADIUS_SCALE;
  const radiusB = b.physics.radius * PHYSICS_PLUSH_COLLISION_RADIUS_SCALE;
  const minDistance = radiusA + radiusB;

  if (distance >= minDistance * 1.12) {
    return;
  }

  const aPoints = getProjectedCollisionPoints(a);
  const bPoints = getProjectedCollisionPoints(b);
  const aGrid = createProjectedPointGrid(aPoints);
  const bGrid = createProjectedPointGrid(bPoints);
  const aIntoB = getMaskOverlap(a, b, aPoints, bGrid);
  const bIntoA = getMaskOverlap(b, a, bPoints, aGrid);
  const overlapCount = aIntoB.count + bIntoA.count;

  if (overlapCount === 0) {
    return;
  }

  const overlapNormal = bIntoA.normal.clone().sub(aIntoB.normal);
  const normal = overlapNormal.lengthSq() > 0.0001 ? overlapNormal.normalize() : delta.multiplyScalar(1 / distance);
  const relativeVelocity = new THREE.Vector2(
    b.physics.velocity.x - a.physics.velocity.x,
    b.physics.velocity.y - a.physics.velocity.y
  );
  const separatingSpeed = relativeVelocity.dot(normal);
  const contactSpeed = Math.abs(separatingSpeed);
  const maskOverlap = Math.max(0, overlapCount - PHYSICS_PLUSH_RESTING_OVERLAP_ALLOWANCE);
  const overlap = Math.min(PHYSICS_PLUSH_MAX_MASK_PUSH, maskOverlap * 0.0012);
  const correction = normal.clone().multiplyScalar(overlap * PHYSICS_PLUSH_COLLISION_PUSH);

  a.physics.position.z = a.depthZ;
  b.physics.position.z = b.depthZ;

  if (separatingSpeed > 0) {
    return;
  }

  if (contactSpeed < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
    const restingCorrection = correction.clone().multiplyScalar(PHYSICS_PLUSH_RESTING_POSITION_CORRECTION);

    if (overlap > 0) {
      if (!a.physics.dragging) {
        a.physics.position.x -= restingCorrection.x * 0.5;
        a.physics.position.y -= restingCorrection.y * 0.5;
      }

      if (!b.physics.dragging) {
        b.physics.position.x += restingCorrection.x * 0.5;
        b.physics.position.y += restingCorrection.y * 0.5;
      }
    }

    if (!a.physics.dragging) {
      a.physics.velocity.x += normal.x * separatingSpeed * 0.5;
      a.physics.velocity.y += normal.y * separatingSpeed * 0.5;
    }

    if (!b.physics.dragging) {
      b.physics.velocity.x -= normal.x * separatingSpeed * 0.5;
      b.physics.velocity.y -= normal.y * separatingSpeed * 0.5;
    }

    if (!a.physics.dragging) {
      a.physics.velocity.multiplyScalar(PHYSICS_PLUSH_CONTACT_DAMPING);
      a.physics.angularVelocity.multiplyScalar(PHYSICS_PLUSH_CONTACT_DAMPING);
    }

    if (!b.physics.dragging) {
      b.physics.velocity.multiplyScalar(PHYSICS_PLUSH_CONTACT_DAMPING);
      b.physics.angularVelocity.multiplyScalar(PHYSICS_PLUSH_CONTACT_DAMPING);
    }

    return;
  }

  if (overlap > 0) {
    if (!a.physics.dragging) {
      a.physics.position.x -= correction.x * 0.5;
      a.physics.position.y -= correction.y * 0.5;
    }

    if (!b.physics.dragging) {
      b.physics.position.x += correction.x * 0.5;
      b.physics.position.y += correction.y * 0.5;
    }
  }

  const impulseStrength = -(1 + PHYSICS_PLUSH_COLLISION_BOUNCE) * separatingSpeed * 0.5;
  const impulse = normal.clone().multiplyScalar(impulseStrength);

  if (!a.physics.dragging) {
    a.physics.velocity.x -= impulse.x;
    a.physics.velocity.y -= impulse.y;
    a.physics.angularVelocity.z -= impulse.y * 0.08;
  }

  if (!b.physics.dragging) {
    b.physics.velocity.x += impulse.x;
    b.physics.velocity.y += impulse.y;
    b.physics.angularVelocity.z += impulse.y * 0.08;
  }

  a.physics.velocity.z = 0;
  b.physics.velocity.z = 0;

  const impactStrength = contactSpeed;

  if (impactStrength >= plushSoftnessTuning.impactThreshold) {
    registerPlushImpact(a.mesh, a.softness, {
      normal: new THREE.Vector3(-normal.x, -normal.y, 0),
      strength: impactStrength,
    });
    registerPlushImpact(b.mesh, b.softness, {
      normal: new THREE.Vector3(normal.x, normal.y, 0),
      strength: impactStrength,
    });
  }
};

const resolvePlushCollisions = (runtimes: PlushRuntime[]) => {
  for (let firstIndex = 0; firstIndex < runtimes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < runtimes.length; secondIndex += 1) {
      resolvePlushCollision(runtimes[firstIndex], runtimes[secondIndex]);
    }
  }
};

const settleRestingPlushes = (runtimes: PlushRuntime[], state: SceneState) => {
  runtimes.forEach((runtime) => {
    const halfExtents = getProjectedHalfExtents(runtime.mesh, runtime.physics);
    const floorY = -(state.viewportWorldHeight / 2 - halfExtents.y);
    const isOnFloor = runtime.physics.position.y <= floorY + 0.012;

    if (!runtime.physics.dragging && isOnFloor && runtime.physics.velocity.length() < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
      dampRestingFloorMotion(runtime.physics);
    }
  });
};

const createPlushRuntime = (
  plush: PlushMeshViewerProps['plushes'][number],
  state: SceneState,
  index: number,
  totalCount: number,
  physicsEnabled: boolean
) => {
  const mesh = createPlushMesh(plush.imageUri);
  const physics = createPhysicsState();
  const softness = createSoftnessState();
  const depthZ = getVisualDepthForIndex(index, totalCount);

  state.scene?.add(mesh);

  physics.radius = mesh.userData.physicsRadius ?? PLUSH_TARGET_SIZE / 2;
  physics.halfWidth = mesh.userData.physicsHalfWidth ?? PLUSH_TARGET_SIZE / 2;
  physics.halfHeight = mesh.userData.physicsHalfHeight ?? PLUSH_TARGET_SIZE / 2;
  resetPlushSoftness(mesh, softness);

  const startHalfExtents = getProjectedHalfExtents(mesh, physics);
  const startX = (index - (totalCount - 1) / 2) * PLUSH_TARGET_SIZE * 0.74;
  const startY = Math.max(0, state.viewportWorldHeight / 2 - startHalfExtents.y);
  physics.position.set(startX, physicsEnabled ? startY : 0, depthZ);
  physics.velocity.set(0, physicsEnabled ? -0.35 : 0, 0);
  mesh.position.copy(physics.position);

  return { depthZ, id: plush.id, mesh, physics, softness };
};

const isTouchOnPlush = (
  state: SceneState,
  runtimes: PlushRuntime[],
  layout: { width: number; height: number },
  event: GestureResponderEvent
) => {
  const touchPoint = getWorldPoint(state, layout, event.nativeEvent.locationX, event.nativeEvent.locationY);
  const touchableRuntimes = [...runtimes].sort((a, b) => b.depthZ - a.depthZ);

  for (const runtime of touchableRuntimes) {
    const mesh = runtime.mesh;
    const physics = runtime.physics;
    const hitMask = mesh?.userData.hitMask as PlushHitMask | undefined;

    if (!mesh || !hitMask) {
      continue;
    }

    const runtimeTouchPoint = touchPoint.clone();
    runtimeTouchPoint.z = runtime.depthZ;

    const localPoint = runtimeTouchPoint
      .sub(physics.position)
      .applyQuaternion(mesh.quaternion.clone().invert());

    const gridCol = Math.floor((localPoint.x / hitMask.scaledWidth) * hitMask.cols + hitMask.centerCol);
    const gridRow = Math.floor(hitMask.centerRow - (localPoint.y / hitMask.scaledHeight) * hitMask.rows);

    for (let row = gridRow - 2; row <= gridRow + 2; row += 1) {
      for (let col = gridCol - 2; col <= gridCol + 2; col += 1) {
        if (row >= 0 && row < hitMask.rows && col >= 0 && col < hitMask.cols && hitMask.cells[row][col]) {
          return runtime;
        }
      }
    }
  }

  return null;
};

export function PlushMeshViewer({ onPlushesPrepared, plushes, physicsEnabled = false }: PlushMeshViewerProps) {
  const stateRef = useRef<SceneState>({
    animationFrame: null,
    camera: null,
    mesh: null,
    renderer: null,
    scene: null,
    viewportWorldHeight: 1,
    viewportWorldWidth: 1,
  });
  const layoutRef = useRef({ width: 1, height: 1 });
  const runtimesRef = useRef<PlushRuntime[]>([]);
  const activeRuntimeRef = useRef<PlushRuntime | null>(null);
  const gravityRef = useRef(new THREE.Vector3(0, -PHYSICS_GRAVITY, 0));
  const previousGravityRef = useRef(new THREE.Vector3(0, -PHYSICS_GRAVITY, 0));
  const previousAccelerationRef = useRef(new THREE.Vector3());
  const lastShakeTimeRef = useRef(0);
  const physicsEnabledRef = useRef(physicsEnabled);
  const rotationRef = useRef(DEFAULT_ROTATION);
  const gestureStartRotationRef = useRef(DEFAULT_ROTATION);

  useEffect(() => {
    physicsEnabledRef.current = physicsEnabled;
  }, [physicsEnabled]);

  useEffect(() => {
    let isMounted = true;
    let subscription: { remove: () => void } | null = null;

    const subscribeToGravity = async () => {
      const isAvailable = await Accelerometer.isAvailableAsync();

      if (!isMounted || !isAvailable) {
        return;
      }

      Accelerometer.setUpdateInterval(DEVICE_GRAVITY_UPDATE_MS);
      subscription = Accelerometer.addListener(({ x, y, z }) => {
        const acceleration = new THREE.Vector3(x, y, z);
        const shake = acceleration.clone().sub(previousAccelerationRef.current);
        const now = Date.now();

        if (now - lastShakeTimeRef.current > DEVICE_SHAKE_COOLDOWN_MS && shake.length() > DEVICE_SHAKE_THRESHOLD) {
          applyShakeImpulse(runtimesRef.current, shake);
          lastShakeTimeRef.current = now;
        }

        previousAccelerationRef.current.copy(acceleration);

        const targetGravity = getAccelerometerGravity(x, y);
        const previousDirection = previousGravityRef.current.clone().normalize();
        const nextDirection = targetGravity.clone().normalize();
        const directionChange = previousDirection.distanceTo(nextDirection);

        gravityRef.current.lerp(targetGravity, DEVICE_GRAVITY_SMOOTHING);
        previousGravityRef.current.copy(gravityRef.current);

        if (directionChange > 0.28) {
          runtimesRef.current.forEach((runtime) => {
            if (!runtime.physics.dragging && runtime.physics.velocity.length() < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
              runtime.physics.velocity.addScaledVector(nextDirection, DEVICE_GRAVITY_WAKEUP_IMPULSE * directionChange);
            }
          });
        }
      });
    };

    subscribeToGravity();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, []);

  const handleLayout = (event: LayoutChangeEvent) => {
    layoutRef.current = event.nativeEvent.layout;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          Boolean(isTouchOnPlush(stateRef.current, runtimesRef.current, layoutRef.current, event)),
        onMoveShouldSetPanResponder: (event) =>
          Boolean(isTouchOnPlush(stateRef.current, runtimesRef.current, layoutRef.current, event)),
        onPanResponderGrant: (event: GestureResponderEvent) => {
          const runtime = isTouchOnPlush(stateRef.current, runtimesRef.current, layoutRef.current, event);

          activeRuntimeRef.current = runtime;

          if (physicsEnabled && runtime) {
            const physics = runtime.physics;
            const mesh = runtime.mesh;
            const touchPoint = getWorldPoint(
              stateRef.current,
              layoutRef.current,
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            touchPoint.z = runtime.depthZ;

            physics.dragging = true;
            physics.dragAnchor.copy(touchPoint);
            physics.grabOffset.subVectors(touchPoint, physics.position);
            physics.grabLocalOffset
              .copy(physics.grabOffset)
              .applyQuaternion(mesh.quaternion.clone().invert());
            physics.velocity.set(0, 0, 0);
            physics.angularVelocity.x = 0;
            physics.angularVelocity.y = 0;
            return;
          }

          gestureStartRotationRef.current = rotationRef.current;
        },
        onPanResponderMove: (event, gesture) => {
          const activeRuntime = activeRuntimeRef.current;

          if (physicsEnabled && activeRuntime) {
            const physics = activeRuntime.physics;
            const mesh = activeRuntime.mesh;
            const touchPoint = getWorldPoint(
              stateRef.current,
              layoutRef.current,
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            touchPoint.z = activeRuntime.depthZ;
            const previousPosition = physics.position.clone();
            const anchorVelocity = touchPoint.clone().sub(physics.dragAnchor).multiplyScalar(60);

            physics.dragAnchor.copy(touchPoint);
            physics.position
              .copy(touchPoint)
              .sub(physics.grabLocalOffset.clone().applyQuaternion(mesh.quaternion));
            physics.position.z = activeRuntime.depthZ;
            physics.velocity.subVectors(physics.position, previousPosition).multiplyScalar(60);
            physics.velocity.z = 0;

            const grabWorldOffset = physics.grabLocalOffset.clone().applyQuaternion(mesh.quaternion);
            const dragTorqueZ = grabWorldOffset.x * anchorVelocity.y - grabWorldOffset.y * anchorVelocity.x;

            physics.angularVelocity.x = 0;
            physics.angularVelocity.y = 0;
            physics.angularVelocity.z += dragTorqueZ * PHYSICS_DRAG_ROTATION;
            clampAngularVelocity(physics.angularVelocity);

            mesh.position.copy(physics.position);
            return;
          }

          rotationRef.current = {
            x: gestureStartRotationRef.current.x + gesture.dy * 0.01,
            y: gestureStartRotationRef.current.y + gesture.dx * 0.01,
            z: rotationRef.current.z,
          };

          if (stateRef.current.mesh) {
            stateRef.current.mesh.rotation.x = rotationRef.current.x;
            stateRef.current.mesh.rotation.y = rotationRef.current.y;
          }
        },
        onPanResponderRelease: (_, gesture) => {
          const activeRuntime = activeRuntimeRef.current;

          if (!physicsEnabled || !activeRuntime) {
            activeRuntimeRef.current = null;
            return;
          }

          const physics = activeRuntime.physics;
          const state = stateRef.current;
          const releaseVelocity = new THREE.Vector3(
            gesture.vx * state.viewportWorldWidth * 0.34,
            -gesture.vy * state.viewportWorldHeight * 0.34,
            0
          );
          const grabWorldOffset = physics.grabLocalOffset
            .clone()
            .applyQuaternion(activeRuntime.mesh.quaternion);
          const torque = grabWorldOffset.cross(releaseVelocity);
          const tumble = new THREE.Vector3(
            -releaseVelocity.y,
            releaseVelocity.x,
            releaseVelocity.x * 0.45 - releaseVelocity.y * 0.35
          );

          physics.dragging = false;
          physics.velocity.lerp(releaseVelocity, 0.6);
          physics.angularVelocity.multiplyScalar(0.9);
          physics.angularVelocity.addScaledVector(torque, PHYSICS_RELEASE_TORQUE);
          physics.angularVelocity.addScaledVector(tumble, PHYSICS_THROW_TUMBLE);
          clampAngularVelocity(physics.angularVelocity);
          activeRuntimeRef.current = null;
        },
        onPanResponderTerminate: () => {
          if (activeRuntimeRef.current) {
            activeRuntimeRef.current.physics.dragging = false;
            activeRuntimeRef.current = null;
          }
        },
      }),
    [physicsEnabled]
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

  useEffect(() => {
    runtimesRef.current.forEach((runtime, index) => {
      const startHalfExtents = getProjectedHalfExtents(runtime.mesh, runtime.physics);
      const startX = (index - (runtimesRef.current.length - 1) / 2) * PLUSH_TARGET_SIZE * 0.74;
      const startY = Math.max(0, stateRef.current.viewportWorldHeight / 2 - startHalfExtents.y);
      runtime.physics.dragging = false;
      runtime.physics.lastFrameTime = null;
      runtime.physics.velocity.set(0, physicsEnabled ? -0.35 : 0, 0);
      runtime.physics.angularVelocity.set(0, 0, 0);
      runtime.depthZ = getVisualDepthForIndex(index, runtimesRef.current.length);
      runtime.physics.position.set(startX, physicsEnabled ? startY : 0, runtime.depthZ);
      runtime.mesh.position.copy(runtime.physics.position);
      resetPlushSoftness(runtime.mesh, runtime.softness);

    if (!physicsEnabled) {
        runtime.mesh.rotation.set(DEFAULT_ROTATION.x, DEFAULT_ROTATION.y, DEFAULT_ROTATION.z);
      rotationRef.current = DEFAULT_ROTATION;
    }
    });
  }, [physicsEnabled]);

  useEffect(() => {
    if (!stateRef.current.scene) {
      return;
    }

    const existingIds = new Set(runtimesRef.current.map((runtime) => runtime.id));
    const newPlushes = plushes.filter((plush) => !existingIds.has(plush.id));
    const baseRuntimeCount = runtimesRef.current.length;

    newPlushes.forEach((plush, index) => {
      runtimesRef.current.push(
        createPlushRuntime(
          plush,
          stateRef.current,
          baseRuntimeCount + index,
          plushes.length,
          physicsEnabledRef.current
        )
      );
    });

    runtimesRef.current.forEach((runtime, index) => {
      runtime.depthZ = getVisualDepthForIndex(index, runtimesRef.current.length);
      runtime.physics.position.z = runtime.depthZ;
      runtime.mesh.position.z = runtime.depthZ;
    });

    if (newPlushes.length > 0) {
      onPlushesPrepared?.();
    }
  }, [onPlushesPrepared, plushes]);

  const handleContextCreate = (gl: ExpoWebGLRenderingContext) => {
    const renderer = new Renderer({ gl, alpha: true, antialias: true }) as unknown as THREE.WebGLRenderer;
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0xffffff, 0);

    const scene = new THREE.Scene();
    stateRef.current.scene = scene;
    const camera = new THREE.PerspectiveCamera(
      42,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 5.8);
    stateRef.current.camera = camera;
    stateRef.current.viewportWorldHeight =
      2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    stateRef.current.viewportWorldWidth = stateRef.current.viewportWorldHeight * camera.aspect;

    stateRef.current.renderer = renderer;
    runtimesRef.current = plushes.map((plush, index) =>
      createPlushRuntime(plush, stateRef.current, index, plushes.length, physicsEnabled)
    );
    onPlushesPrepared?.();

    const render = (frameTime: number) => {
      stateRef.current.animationFrame = requestAnimationFrame(render);
      if (physicsEnabledRef.current) {
        runtimesRef.current.forEach((runtime) => {
          applyPhysicsFrame(
            runtime.mesh,
            runtime.physics,
            runtime.softness,
            stateRef.current,
            gravityRef.current,
            frameTime
          );
          runtime.physics.position.z = runtime.depthZ;
          runtime.physics.velocity.z = 0;
        });
        resolvePlushCollisions(runtimesRef.current);
        settleRestingPlushes(runtimesRef.current, stateRef.current);
        runtimesRef.current.forEach((runtime) => {
          runtime.physics.position.z = runtime.depthZ;
          runtime.mesh.position.copy(runtime.physics.position);
        });
      }
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    render(0);
  };

  return (
    <View style={styles.viewer} onLayout={handleLayout} {...panResponder.panHandlers}>
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
