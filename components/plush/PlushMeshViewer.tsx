import { Buffer } from 'buffer';
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, TextureLoader } from 'expo-three';
import { PNG } from 'pngjs/browser';
import * as THREE from 'three';

import type { DetectedOutline } from '@/lib/outlineDetection';

type PlushMeshViewerProps = {
  imageUri: string;
  outline: DetectedOutline;
  physicsEnabled?: boolean;
};

type SceneState = {
  animationFrame: number | null;
  camera: THREE.PerspectiveCamera | null;
  mesh: THREE.Group | null;
  renderer: THREE.WebGLRenderer | null;
  viewportWorldHeight: number;
  viewportWorldWidth: number;
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

type PlushHitMask = {
  cells: boolean[][];
  centerCol: number;
  centerRow: number;
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
const MAX_GRID_SIZE = 132;
const PLUSH_WIDTH = 3.1;
const PLUSH_TARGET_SIZE = 1.35;
const PUFF_AMOUNT = 0.2;
const EDGE_VOLUME_AMOUNT = 0.075;
const FLAT_EDGE_BAND = 0.055;
const SIDE_THICKNESS = 0;
const DEFAULT_ROTATION = { x: -0.1, y: -0.25, z: 0 };
const PHYSICS_GRAVITY = 5.8;
const PHYSICS_BOUNCE = 0.18;
const PHYSICS_LINEAR_DAMPING = 0.992;
const PHYSICS_ANGULAR_DAMPING = 0.999;
const PHYSICS_FLOOR_ANGULAR_DAMPING = 0.82;
const PHYSICS_FLOOR_FRICTION = 0.84;
const PHYSICS_REST_VELOCITY = 0.08;
const PHYSICS_DRAG_ROTATION = 0.68;
const PHYSICS_RELEASE_TORQUE = 0.54;
const PHYSICS_THROW_TUMBLE = 0.95;
const PHYSICS_MAX_ANGULAR_SPEED = 7;
const PHYSICS_HANG_TORQUE = 18;
const PHYSICS_HANG_DAMPING = 0.975;
const PHYSICS_FLOOR_TOPPLE_TORQUE = 4.8;

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

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells[row][col] = sampleCellAlpha(png, row, col, rows, cols) > ALPHA_THRESHOLD;
    }
  }

  const distances = computeCellDistances(cells);
  const visibleBounds = findVisibleBounds(cells);

  return { png, cols, rows, cells, distances, aspectRatio, visibleBounds };
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

const createPlushMesh = (imageUri: string) => {
  const group = new THREE.Group();
  const texture = createTexture(imageUri);
  const grid = createMaskGrid(imageUri);
  const gridMetrics = createGridMetrics(grid);
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
  group.rotation.set(DEFAULT_ROTATION.x, DEFAULT_ROTATION.y, DEFAULT_ROTATION.z);
  group.userData.physicsRadius = Math.max(gridMetrics.scaledVisibleWidth, gridMetrics.scaledVisibleHeight) / 2;
  group.userData.physicsHalfWidth = gridMetrics.scaledVisibleWidth / 2;
  group.userData.physicsHalfHeight = gridMetrics.scaledVisibleHeight / 2;
  group.userData.hitMask = {
    cells: grid.cells,
    centerCol: gridMetrics.centerCol,
    centerRow: gridMetrics.centerRow,
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

const getRotatedHalfExtents = (physics: PhysicsState, rotationZ: number) => {
  const cos = Math.abs(Math.cos(rotationZ));
  const sin = Math.abs(Math.sin(rotationZ));

  return {
    x: physics.halfWidth * cos + physics.halfHeight * sin,
    y: physics.halfWidth * sin + physics.halfHeight * cos,
  };
};

const clampPlushToBounds = (physics: PhysicsState, state: SceneState, rotationZ = 0) => {
  const halfExtents = getRotatedHalfExtents(physics, rotationZ);
  const maxX = Math.max(0, state.viewportWorldWidth / 2 - halfExtents.x);
  const maxY = Math.max(0, state.viewportWorldHeight / 2 - halfExtents.y);
  let isTouchingFloor = false;

  if (physics.position.x < -maxX) {
    physics.position.x = -maxX;
    physics.velocity.x = Math.abs(physics.velocity.x) * PHYSICS_BOUNCE;
    physics.angularVelocity.z += Math.abs(physics.velocity.y) * 0.08;
  } else if (physics.position.x > maxX) {
    physics.position.x = maxX;
    physics.velocity.x = -Math.abs(physics.velocity.x) * PHYSICS_BOUNCE;
    physics.angularVelocity.z -= Math.abs(physics.velocity.y) * 0.08;
  }

  if (physics.position.y < -maxY) {
    physics.position.y = -maxY;
    physics.velocity.y = Math.abs(physics.velocity.y) * PHYSICS_BOUNCE;
    physics.velocity.x *= PHYSICS_FLOOR_FRICTION;
    physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_ANGULAR_DAMPING);
    isTouchingFloor = true;
  } else if (physics.position.y > maxY) {
    physics.position.y = maxY;
    physics.velocity.y = -Math.abs(physics.velocity.y) * PHYSICS_BOUNCE;
    physics.angularVelocity.z -= physics.velocity.x * 0.08;
  }

  return isTouchingFloor;
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

const applyPhysicsFrame = (mesh: THREE.Group, physics: PhysicsState, state: SceneState, frameTime: number) => {
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
    const gravityTorqueZ = grabWorldOffset.x * PHYSICS_GRAVITY;

    physics.angularVelocity.z += gravityTorqueZ * PHYSICS_HANG_TORQUE * deltaSeconds;
    clampAngularVelocity(physics.angularVelocity);
    physics.angularVelocity.multiplyScalar(PHYSICS_HANG_DAMPING);
    applyAngularVelocity(mesh, new THREE.Vector3(0, 0, physics.angularVelocity.z), deltaSeconds);

    const nextGrabWorldOffset = physics.grabLocalOffset.clone().applyQuaternion(mesh.quaternion);
    physics.position.copy(physics.dragAnchor).sub(nextGrabWorldOffset);
    physics.velocity.subVectors(physics.position, previousPosition).multiplyScalar(1 / Math.max(deltaSeconds, 0.001));
  } else {
    physics.velocity.y -= PHYSICS_GRAVITY * deltaSeconds;
    physics.position.addScaledVector(physics.velocity, deltaSeconds);
    physics.velocity.multiplyScalar(PHYSICS_LINEAR_DAMPING);

    applyAngularVelocity(mesh, physics.angularVelocity, deltaSeconds);
    physics.angularVelocity.multiplyScalar(PHYSICS_ANGULAR_DAMPING);

    const isTouchingFloor = clampPlushToBounds(physics, state, mesh.rotation.z);

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
    }
  }

  mesh.position.copy(physics.position);
};

const isTouchOnPlush = (
  state: SceneState,
  physics: PhysicsState,
  layout: { width: number; height: number },
  event: GestureResponderEvent
) => {
  const mesh = state.mesh;
  const hitMask = mesh?.userData.hitMask as PlushHitMask | undefined;

  if (!mesh || !hitMask) {
    return false;
  }

  const touchPoint = getWorldPoint(state, layout, event.nativeEvent.locationX, event.nativeEvent.locationY);
  const localPoint = touchPoint
    .sub(physics.position)
    .applyQuaternion(mesh.quaternion.clone().invert());
  const gridCol = Math.floor((localPoint.x / hitMask.scaledWidth) * hitMask.cols + hitMask.centerCol);
  const gridRow = Math.floor(hitMask.centerRow - (localPoint.y / hitMask.scaledHeight) * hitMask.rows);

  for (let row = gridRow - 1; row <= gridRow + 1; row += 1) {
    for (let col = gridCol - 1; col <= gridCol + 1; col += 1) {
      if (row >= 0 && row < hitMask.rows && col >= 0 && col < hitMask.cols && hitMask.cells[row][col]) {
        return true;
      }
    }
  }

  return false;
};

export function PlushMeshViewer({ imageUri, physicsEnabled = false }: PlushMeshViewerProps) {
  const stateRef = useRef<SceneState>({
    animationFrame: null,
    camera: null,
    mesh: null,
    renderer: null,
    viewportWorldHeight: 1,
    viewportWorldWidth: 1,
  });
  const layoutRef = useRef({ width: 1, height: 1 });
  const physicsRef = useRef<PhysicsState>({
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
  const physicsEnabledRef = useRef(physicsEnabled);
  const rotationRef = useRef(DEFAULT_ROTATION);
  const gestureStartRotationRef = useRef(DEFAULT_ROTATION);

  useEffect(() => {
    physicsEnabledRef.current = physicsEnabled;
  }, [physicsEnabled]);

  const handleLayout = (event: LayoutChangeEvent) => {
    layoutRef.current = event.nativeEvent.layout;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          isTouchOnPlush(stateRef.current, physicsRef.current, layoutRef.current, event),
        onMoveShouldSetPanResponder: (event) =>
          isTouchOnPlush(stateRef.current, physicsRef.current, layoutRef.current, event),
        onPanResponderGrant: (event: GestureResponderEvent) => {
          if (physicsEnabled && stateRef.current.mesh) {
            const physics = physicsRef.current;
            const mesh = stateRef.current.mesh;
            const touchPoint = getWorldPoint(
              stateRef.current,
              layoutRef.current,
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );

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
          if (physicsEnabled && stateRef.current.mesh) {
            const physics = physicsRef.current;
            const touchPoint = getWorldPoint(
              stateRef.current,
              layoutRef.current,
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            const previousPosition = physics.position.clone();
            const anchorVelocity = touchPoint.clone().sub(physics.dragAnchor).multiplyScalar(60);

            physics.dragAnchor.copy(touchPoint);
            physics.position
              .copy(touchPoint)
              .sub(physics.grabLocalOffset.clone().applyQuaternion(stateRef.current.mesh.quaternion));
            physics.velocity.subVectors(physics.position, previousPosition).multiplyScalar(60);

            const grabWorldOffset = physics.grabLocalOffset.clone().applyQuaternion(stateRef.current.mesh.quaternion);
            const dragTorqueZ = grabWorldOffset.x * anchorVelocity.y - grabWorldOffset.y * anchorVelocity.x;

            physics.angularVelocity.x = 0;
            physics.angularVelocity.y = 0;
            physics.angularVelocity.z += dragTorqueZ * PHYSICS_DRAG_ROTATION;
            clampAngularVelocity(physics.angularVelocity);

            stateRef.current.mesh.position.copy(physics.position);
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
          if (!physicsEnabled) {
            return;
          }

          const physics = physicsRef.current;
          const state = stateRef.current;
          const releaseVelocity = new THREE.Vector3(
            gesture.vx * state.viewportWorldWidth * 0.34,
            -gesture.vy * state.viewportWorldHeight * 0.34,
            0
          );
          const grabWorldOffset = physics.grabLocalOffset
            .clone()
            .applyQuaternion(stateRef.current.mesh?.quaternion ?? new THREE.Quaternion());
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
        },
        onPanResponderTerminate: () => {
          physicsRef.current.dragging = false;
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
    const mesh = stateRef.current.mesh;

    if (!mesh) {
      return;
    }

    const physics = physicsRef.current;
    const startHalfExtents = getRotatedHalfExtents(physics, mesh.rotation.z);
    const startY = Math.max(0, stateRef.current.viewportWorldHeight / 2 - startHalfExtents.y);
    physics.dragging = false;
    physics.lastFrameTime = null;
    physics.velocity.set(0, physicsEnabled ? -0.35 : 0, 0);
    physics.angularVelocity.set(0, 0, 0);
    physics.position.set(0, physicsEnabled ? startY : 0, 0);
    mesh.position.copy(physics.position);

    if (!physicsEnabled) {
      mesh.rotation.set(DEFAULT_ROTATION.x, DEFAULT_ROTATION.y, DEFAULT_ROTATION.z);
      rotationRef.current = DEFAULT_ROTATION;
    }
  }, [physicsEnabled]);

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
    stateRef.current.camera = camera;
    stateRef.current.viewportWorldHeight =
      2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    stateRef.current.viewportWorldWidth = stateRef.current.viewportWorldHeight * camera.aspect;

    const mesh = createPlushMesh(imageUri);
    scene.add(mesh);

    stateRef.current.renderer = renderer;
    stateRef.current.mesh = mesh;
    physicsRef.current.radius = mesh.userData.physicsRadius ?? PLUSH_TARGET_SIZE / 2;
    physicsRef.current.halfWidth = mesh.userData.physicsHalfWidth ?? PLUSH_TARGET_SIZE / 2;
    physicsRef.current.halfHeight = mesh.userData.physicsHalfHeight ?? PLUSH_TARGET_SIZE / 2;

    if (physicsEnabled) {
      const startHalfExtents = getRotatedHalfExtents(physicsRef.current, mesh.rotation.z);
      const startY = Math.max(0, stateRef.current.viewportWorldHeight / 2 - startHalfExtents.y);
      physicsRef.current.position.set(0, startY, 0);
      physicsRef.current.velocity.set(0, -0.35, 0);
      mesh.position.copy(physicsRef.current.position);
    }

    const render = (frameTime: number) => {
      stateRef.current.animationFrame = requestAnimationFrame(render);
      if (physicsEnabledRef.current) {
        applyPhysicsFrame(mesh, physicsRef.current, stateRef.current, frameTime);
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
