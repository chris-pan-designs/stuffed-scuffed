import * as React from "react";
import * as THREE from "three";

type PersistentPlushiesWebGLProps = {
  background?: string;
  catSrc?: string;
  kermySrc?: string;
  meSrc?: string;
};

type MaskGrid = {
  aspectRatio: number;
  cells: boolean[][];
  cols: number;
  collisionCells: boolean[][];
  distances: number[][];
  imageData: ImageData;
  rows: number;
  visibleBounds: VisibleBounds;
};

type VisibleBounds = {
  maxCol: number;
  maxRow: number;
  minCol: number;
  minRow: number;
};

type PlushRuntime = {
  depthZ: number;
  mesh: THREE.Group;
  physics: PhysicsState;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  softness: PlushSoftnessState;
};

type PhysicsState = {
  angularVelocity: THREE.Vector3;
  halfHeight: number;
  halfWidth: number;
  lastFrameTime: number | null;
  position: THREE.Vector3;
  radius: number;
  velocity: THREE.Vector3;
};

type PlushSoftnessState = {
  scale: THREE.Vector3;
  scaleVelocity: THREE.Vector3;
  wobbleAngle: number;
  wobbleVelocity: number;
};

type PlushImpact = {
  normal: THREE.Vector3;
  strength: number;
};

const DEFAULT_PLUSHIES = {
  cat: new URL("./assets/scared-cat.png", import.meta.url).toString(),
  kermy: new URL("./assets/kermy.png", import.meta.url).toString(),
  me: new URL("./assets/me-af.png", import.meta.url).toString(),
};

const ALPHA_THRESHOLD = 24;
const COLLISION_ALPHA_THRESHOLD = 96;
const DEFAULT_ROTATION = { x: -0.1, y: -0.25, z: 0 };
const DEVICE_SHAKE_IMPULSE = 2.2;
const DEVICE_SHAKE_TUMBLE = 2.8;
const EDGE_VOLUME_AMOUNT = 0.08;
const FLAT_EDGE_BAND = 0.055;
const MAX_GRID_SIZE = 112;
const PHYSICS_ANGULAR_DAMPING = 0.999;
const PHYSICS_AIR_GRAVITY_ROLL = 0.3;
const PHYSICS_AIR_GRAVITY_TUMBLE = 0.62;
const PHYSICS_BOUNCE = 0.38;
const PHYSICS_FLOOR_ANGULAR_DAMPING = 0.9;
const PHYSICS_FLOOR_FRICTION = 0.92;
const PHYSICS_FLOOR_REST_ANGULAR_DAMPING = 0.84;
const PHYSICS_FLOOR_REST_DAMPING = 0.9;
const PHYSICS_GRAVITY = 12.5;
const PHYSICS_LINEAR_DAMPING = 0.992;
const PHYSICS_MAX_ANGULAR_SPEED = 8.5;
const PHYSICS_PLUSH_COLLISION_BOUNCE = 0.34;
const PHYSICS_PLUSH_COLLISION_PUSH = 0.42;
const PHYSICS_PLUSH_COLLISION_RADIUS_SCALE = 0.86;
const PHYSICS_PLUSH_CONTACT_DAMPING = 0.52;
const PHYSICS_PLUSH_RESTING_CONTACT_SPEED = 0.22;
const PHYSICS_REST_VELOCITY = 0.035;
const PHYSICS_SLEEP_ANGULAR_VELOCITY = 0.06;
const PHYSICS_SLEEP_VELOCITY = 0.045;
const PLUSH_DEPTH_SPACING = 0.045;
const PLUSH_MAX_DEPTH = 0.14;
const PLUSH_TARGET_SIZE = 1.4;
const PLUSH_WIDTH = 3.1;
const PUFF_AMOUNT = 0.215;
const SHADOW_BASE_OPACITY = 0.14;
const SHADOW_FLOOR_INSET = 0.08;
const SHADOW_MAX_LIFT = 4.2;
const SHADOW_MIN_OPACITY = 0.025;
const SIDE_SILHOUETTE_SMOOTHING = 0.32;
const SIDE_THICKNESS = 0;

const plushSoftnessTuning = {
  impactSquashAmount: 0.16,
  impactStretchAmount: 0.46,
  impactStrengthForMaxSquash: 2.2,
  impactThreshold: 0.06,
  maxSquash: 0.24,
  returnSpringStrength: 95,
  scaleDamping: 13,
  squashDuration: 0.16,
  wobbleAmount: 0.085,
  wobbleDamping: 8.5,
  wobbleSpringStrength: 58,
};

const isInside = (cells: boolean[][], row: number, col: number) =>
  row >= 0 && row < cells.length && col >= 0 && col < cells[0].length && cells[row][col];

const getAlphaAt = (imageData: ImageData, x: number, y: number) => {
  const clampedX = Math.max(0, Math.min(imageData.width - 1, x));
  const clampedY = Math.max(0, Math.min(imageData.height - 1, y));
  const pixelIndex = (imageData.width * clampedY + clampedX) << 2;

  return imageData.data[pixelIndex + 3];
};

const getColorAt = (imageData: ImageData, x: number, y: number) => {
  const clampedX = Math.max(0, Math.min(imageData.width - 1, x));
  const clampedY = Math.max(0, Math.min(imageData.height - 1, y));
  const pixelIndex = (imageData.width * clampedY + clampedX) << 2;

  return new THREE.Color(
    imageData.data[pixelIndex] / 255,
    imageData.data[pixelIndex + 1] / 255,
    imageData.data[pixelIndex + 2] / 255
  );
};

const sampleCellAlpha = (imageData: ImageData, row: number, col: number, rows: number, cols: number) => {
  let alphaTotal = 0;
  let sampleCount = 0;

  for (let ySample = 0; ySample < 3; ySample += 1) {
    for (let xSample = 0; xSample < 3; xSample += 1) {
      const sourceX = Math.floor(((col + (xSample + 0.5) / 3) / cols) * imageData.width);
      const sourceY = Math.floor(((row + (ySample + 0.5) / 3) / rows) * imageData.height);
      alphaTotal += getAlphaAt(imageData, sourceX, sourceY);
      sampleCount += 1;
    }
  }

  return alphaTotal / sampleCount;
};

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
  const queue: { col: number; row: number }[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (isBoundaryCell(cells, row, col)) {
        distances[row][col] = 1;
        queue.push({ col, row });
      }
    }
  }

  const neighbors = [
    { col: 0, row: -1 },
    { col: 0, row: 1 },
    { col: -1, row: 0 },
    { col: 1, row: 0 },
  ];
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;

    for (const neighbor of neighbors) {
      const nextRow = current.row + neighbor.row;
      const nextCol = current.col + neighbor.col;

      if (isInside(cells, nextRow, nextCol) && distances[nextRow][nextCol] === 0) {
        distances[nextRow][nextCol] = distances[current.row][current.col] + 1;
        queue.push({ col: nextCol, row: nextRow });
      }
    }
  }

  return distances;
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
    return { maxCol: cells[0].length, maxRow: cells.length, minCol: 0, minRow: 0 };
  }

  return { maxCol, maxRow, minCol, minRow };
};

const createMaskGrid = (image: HTMLImageElement): MaskGrid => {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Could not read plush image pixels.");
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const aspectRatio = imageData.width / imageData.height;
  const cols = aspectRatio >= 1 ? MAX_GRID_SIZE : Math.max(18, Math.round(MAX_GRID_SIZE * aspectRatio));
  const rows = aspectRatio >= 1 ? Math.max(18, Math.round(MAX_GRID_SIZE / aspectRatio)) : MAX_GRID_SIZE;
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const collisionCells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const alpha = sampleCellAlpha(imageData, row, col, rows, cols);
      cells[row][col] = alpha > ALPHA_THRESHOLD;
      collisionCells[row][col] = alpha > COLLISION_ALPHA_THRESHOLD;
    }
  }

  return {
    aspectRatio,
    cells,
    collisionCells,
    cols,
    distances: computeCellDistances(cells),
    imageData,
    rows,
    visibleBounds: findVisibleBounds(cells),
  };
};

const createGridMetrics = (grid: MaskGrid) => {
  const width = PLUSH_WIDTH;
  const height = PLUSH_WIDTH / grid.aspectRatio;
  const { maxCol, maxRow, minCol, minRow } = grid.visibleBounds;
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
      const point = projectPoint(row, col, direction * (SIDE_THICKNESS + puff));

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
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const colorForGridPoint = (grid: MaskGrid, row: number, col: number) => {
  const sourceX = Math.floor((col / grid.cols) * grid.imageData.width);
  const sourceY = Math.floor((row / grid.rows) * grid.imageData.height);

  return getColorAt(grid.imageData, sourceX, sourceY);
};

const getSmoothedBoundaryPoint = (
  cells: boolean[][],
  pointFor: (row: number, col: number, z?: number) => THREE.Vector3,
  row: number,
  col: number,
  z: number
) => {
  const point = pointFor(row, col, z);
  const neighbors: THREE.Vector3[] = [];

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue;
      }

      const neighborRow = row + rowOffset;
      const neighborCol = col + colOffset;

      if (
        isInside(cells, neighborRow - 1, neighborCol - 1) ||
        isInside(cells, neighborRow - 1, neighborCol) ||
        isInside(cells, neighborRow, neighborCol - 1) ||
        isInside(cells, neighborRow, neighborCol)
      ) {
        neighbors.push(pointFor(neighborRow, neighborCol, z));
      }
    }
  }

  if (neighbors.length < 2) {
    return point;
  }

  const average = neighbors
    .reduce((sum, neighbor) => sum.add(neighbor), new THREE.Vector3())
    .multiplyScalar(1 / neighbors.length);

  return point.lerp(average, SIDE_SILHOUETTE_SMOOTHING);
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
  const sidePointFor = (row: number, col: number, z: number) =>
    getSmoothedBoundaryPoint(grid.cells, pointFor, row, col, z);

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
          sidePointFor(row, col, SIDE_THICKNESS),
          sidePointFor(row, col + 1, SIDE_THICKNESS),
          sidePointFor(row, col, -SIDE_THICKNESS),
          sidePointFor(row, col + 1, -SIDE_THICKNESS),
          colorForGridPoint(grid, row, col),
          colorForGridPoint(grid, row, col + 1)
        );
      }

      if (!isInside(grid.cells, row + 1, col)) {
        addSideQuad(
          positions,
          colors,
          indices,
          sidePointFor(row + 1, col + 1, SIDE_THICKNESS),
          sidePointFor(row + 1, col, SIDE_THICKNESS),
          sidePointFor(row + 1, col + 1, -SIDE_THICKNESS),
          sidePointFor(row + 1, col, -SIDE_THICKNESS),
          colorForGridPoint(grid, row + 1, col + 1),
          colorForGridPoint(grid, row + 1, col)
        );
      }

      if (!isInside(grid.cells, row, col - 1)) {
        addSideQuad(
          positions,
          colors,
          indices,
          sidePointFor(row + 1, col, SIDE_THICKNESS),
          sidePointFor(row, col, SIDE_THICKNESS),
          sidePointFor(row + 1, col, -SIDE_THICKNESS),
          sidePointFor(row, col, -SIDE_THICKNESS),
          colorForGridPoint(grid, row + 1, col),
          colorForGridPoint(grid, row, col)
        );
      }

      if (!isInside(grid.cells, row, col + 1)) {
        addSideQuad(
          positions,
          colors,
          indices,
          sidePointFor(row, col + 1, SIDE_THICKNESS),
          sidePointFor(row + 1, col + 1, SIDE_THICKNESS),
          sidePointFor(row, col + 1, -SIDE_THICKNESS),
          sidePointFor(row + 1, col + 1, -SIDE_THICKNESS),
          colorForGridPoint(grid, row, col + 1),
          colorForGridPoint(grid, row + 1, col + 1)
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

const createPlushMesh = (image: HTMLImageElement) => {
  const group = new THREE.Group();
  const visualGroup = new THREE.Group();
  const texture = new THREE.Texture(image);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const grid = createMaskGrid(image);
  const gridMetrics = createGridMetrics(grid);
  const photoMaterial = new THREE.MeshBasicMaterial({
    alphaTest: 0.08,
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const sideMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true });

  visualGroup.add(
    new THREE.Mesh(createSideGeometry(grid), sideMaterial),
    new THREE.Mesh(createSurfaceGeometry(grid, 1), photoMaterial),
    new THREE.Mesh(createSurfaceGeometry(grid, -1), photoMaterial)
  );
  group.add(visualGroup);
  group.rotation.set(DEFAULT_ROTATION.x, DEFAULT_ROTATION.y, DEFAULT_ROTATION.z);
  group.userData.visualGroup = visualGroup;
  group.userData.physicsRadius = Math.max(gridMetrics.scaledVisibleWidth, gridMetrics.scaledVisibleHeight) / 2;
  group.userData.physicsHalfWidth = gridMetrics.scaledVisibleWidth / 2;
  group.userData.physicsHalfHeight = gridMetrics.scaledVisibleHeight / 2;

  return group;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load plush image: ${src}`));
    image.src = src;
  });

const createPhysicsState = (): PhysicsState => ({
  angularVelocity: new THREE.Vector3(),
  halfHeight: PLUSH_TARGET_SIZE / 2,
  halfWidth: PLUSH_TARGET_SIZE / 2,
  lastFrameTime: null,
  position: new THREE.Vector3(),
  radius: PLUSH_TARGET_SIZE / 2,
  velocity: new THREE.Vector3(),
});

const createSoftnessState = (): PlushSoftnessState => ({
  scale: new THREE.Vector3(1, 1, 1),
  scaleVelocity: new THREE.Vector3(),
  wobbleAngle: 0,
  wobbleVelocity: 0,
});

const getPlushVisualGroup = (mesh: THREE.Group) => mesh.userData.visualGroup as THREE.Group | undefined;

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

const getProjectedHalfExtents = (mesh: THREE.Group, physics: PhysicsState) => {
  const cos = Math.abs(Math.cos(mesh.rotation.z));
  const sin = Math.abs(Math.sin(mesh.rotation.z));

  return {
    x: physics.halfWidth * cos + physics.halfHeight * sin,
    y: physics.halfWidth * sin + physics.halfHeight * cos,
  };
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
  softness.wobbleVelocity += Math.sign(localNormal.x || localNormal.y || 1) * normalizedStrength * plushSoftnessTuning.wobbleAmount * 22;
};

const applyPlushSoftnessFrame = (
  mesh: THREE.Group,
  softness: PlushSoftnessState,
  deltaSeconds: number
) => {
  const visualGroup = getPlushVisualGroup(mesh);

  if (!visualGroup) {
    return;
  }

  const springForce = new THREE.Vector3(1, 1, 1).sub(softness.scale).multiplyScalar(plushSoftnessTuning.returnSpringStrength);
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

  visualGroup.scale.copy(softness.scale);
  visualGroup.rotation.z = THREE.MathUtils.clamp(
    softness.wobbleAngle,
    -plushSoftnessTuning.wobbleAmount,
    plushSoftnessTuning.wobbleAmount
  );
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

const clampPlushToBounds = (runtime: PlushRuntime, viewportWorldWidth: number, viewportWorldHeight: number) => {
  const { mesh, physics } = runtime;
  const halfExtents = getProjectedHalfExtents(mesh, physics);
  const maxX = Math.max(0, viewportWorldWidth / 2 - halfExtents.x);
  const maxY = Math.max(0, viewportWorldHeight / 2 - halfExtents.y);
  const impacts: PlushImpact[] = [];
  let isTouchingFloor = false;

  if (physics.position.x < -maxX) {
    const impactStrength = Math.abs(physics.velocity.x);
    physics.position.x = -maxX;
    physics.velocity.x = Math.abs(physics.velocity.x) * PHYSICS_BOUNCE;
    physics.angularVelocity.z += Math.abs(physics.velocity.y) * 0.08;
    impacts.push({ normal: new THREE.Vector3(1, 0, 0), strength: impactStrength });
  } else if (physics.position.x > maxX) {
    const impactStrength = Math.abs(physics.velocity.x);
    physics.position.x = maxX;
    physics.velocity.x = -Math.abs(physics.velocity.x) * PHYSICS_BOUNCE;
    physics.angularVelocity.z -= Math.abs(physics.velocity.y) * 0.08;
    impacts.push({ normal: new THREE.Vector3(-1, 0, 0), strength: impactStrength });
  }

  if (physics.position.y < -maxY) {
    const impactStrength = Math.abs(physics.velocity.y);
    physics.position.y = -maxY;
    physics.velocity.y = Math.abs(physics.velocity.y) * PHYSICS_BOUNCE;
    physics.velocity.x *= PHYSICS_FLOOR_FRICTION;
    physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_ANGULAR_DAMPING);
    isTouchingFloor = true;
    impacts.push({ normal: new THREE.Vector3(0, 1, 0), strength: impactStrength });
  } else if (physics.position.y > maxY) {
    const impactStrength = Math.abs(physics.velocity.y);
    physics.position.y = maxY;
    physics.velocity.y = -Math.abs(physics.velocity.y) * PHYSICS_BOUNCE;
    physics.angularVelocity.z -= physics.velocity.x * 0.08;
    impacts.push({ normal: new THREE.Vector3(0, -1, 0), strength: impactStrength });
  }

  return { impacts, isTouchingFloor };
};

const applyPhysicsFrame = (
  runtime: PlushRuntime,
  viewportWorldWidth: number,
  viewportWorldHeight: number,
  frameTime: number
) => {
  const { mesh, physics, softness } = runtime;

  if (physics.lastFrameTime === null) {
    physics.lastFrameTime = frameTime;
    return;
  }

  const deltaSeconds = Math.min(0.033, (frameTime - physics.lastFrameTime) / 1000);
  physics.lastFrameTime = frameTime;
  physics.velocity.y -= PHYSICS_GRAVITY * deltaSeconds;

  const fallSpeed = Math.min(1.8, physics.velocity.length() / PHYSICS_GRAVITY);
  physics.angularVelocity.x += -PHYSICS_GRAVITY * PHYSICS_AIR_GRAVITY_ROLL * fallSpeed * deltaSeconds;
  physics.angularVelocity.z += physics.velocity.x * -PHYSICS_GRAVITY * PHYSICS_AIR_GRAVITY_TUMBLE * deltaSeconds;
  clampAngularVelocity(physics.angularVelocity);

  physics.position.addScaledVector(physics.velocity, deltaSeconds);
  physics.velocity.multiplyScalar(PHYSICS_LINEAR_DAMPING);
  applyAngularVelocity(mesh, physics.angularVelocity, deltaSeconds);
  physics.angularVelocity.multiplyScalar(PHYSICS_ANGULAR_DAMPING);

  const { impacts, isTouchingFloor } = clampPlushToBounds(runtime, viewportWorldWidth, viewportWorldHeight);
  impacts.forEach((impact) => registerPlushImpact(mesh, softness, impact));

  if (impacts.length > 0 && physics.velocity.length() < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
    physics.velocity.multiplyScalar(PHYSICS_FLOOR_REST_DAMPING);
    physics.angularVelocity.multiplyScalar(PHYSICS_FLOOR_REST_ANGULAR_DAMPING);
  }

  if (isTouchingFloor && physics.velocity.length() < PHYSICS_PLUSH_RESTING_CONTACT_SPEED) {
    dampRestingFloorMotion(physics);
  }

  applyPlushSoftnessFrame(mesh, softness, deltaSeconds);
  physics.velocity.z = 0;
  mesh.position.copy(physics.position);
};

const resolvePlushCollision = (a: PlushRuntime, b: PlushRuntime) => {
  const delta = new THREE.Vector2(
    b.physics.position.x - a.physics.position.x,
    b.physics.position.y - a.physics.position.y
  );
  const distance = Math.max(0.001, delta.length());
  const radiusA = a.physics.radius * PHYSICS_PLUSH_COLLISION_RADIUS_SCALE;
  const radiusB = b.physics.radius * PHYSICS_PLUSH_COLLISION_RADIUS_SCALE;
  const overlap = radiusA + radiusB - distance;

  if (overlap <= 0) {
    return;
  }

  const normal = delta.multiplyScalar(1 / distance);
  const correction = normal.clone().multiplyScalar(overlap * PHYSICS_PLUSH_COLLISION_PUSH);
  a.physics.position.x -= correction.x * 0.5;
  a.physics.position.y -= correction.y * 0.5;
  b.physics.position.x += correction.x * 0.5;
  b.physics.position.y += correction.y * 0.5;

  const relativeVelocity = new THREE.Vector2(
    b.physics.velocity.x - a.physics.velocity.x,
    b.physics.velocity.y - a.physics.velocity.y
  );
  const separatingSpeed = relativeVelocity.dot(normal);

  if (separatingSpeed < 0) {
    const impulseStrength = -(1 + PHYSICS_PLUSH_COLLISION_BOUNCE) * separatingSpeed * 0.5;
    const impulse = normal.clone().multiplyScalar(impulseStrength);
    a.physics.velocity.x -= impulse.x;
    a.physics.velocity.y -= impulse.y;
    b.physics.velocity.x += impulse.x;
    b.physics.velocity.y += impulse.y;
    a.physics.angularVelocity.z -= impulse.y * 0.08;
    b.physics.angularVelocity.z += impulse.y * 0.08;
  } else {
    a.physics.velocity.multiplyScalar(PHYSICS_PLUSH_CONTACT_DAMPING);
    b.physics.velocity.multiplyScalar(PHYSICS_PLUSH_CONTACT_DAMPING);
  }

  registerPlushImpact(a.mesh, a.softness, {
    normal: new THREE.Vector3(-normal.x, -normal.y, 0),
    strength: Math.abs(separatingSpeed),
  });
  registerPlushImpact(b.mesh, b.softness, {
    normal: new THREE.Vector3(normal.x, normal.y, 0),
    strength: Math.abs(separatingSpeed),
  });
};

const updatePlushShadow = (runtime: PlushRuntime, viewportWorldHeight: number) => {
  const floorY = -viewportWorldHeight / 2 + SHADOW_FLOOR_INSET;
  const lift = Math.max(0, runtime.physics.position.y - floorY);
  const normalizedLift = Math.min(1, lift / SHADOW_MAX_LIFT);
  const width = Math.max(runtime.physics.halfWidth * (1.12 + normalizedLift * 1.1), 0.16);
  const height = Math.max(runtime.physics.halfHeight * (0.16 + normalizedLift * 0.12), 0.055);

  runtime.shadow.position.set(runtime.physics.position.x, floorY, runtime.depthZ - 0.035);
  runtime.shadow.scale.set(width, height, 1);
  runtime.shadow.material.opacity =
    SHADOW_MIN_OPACITY + (SHADOW_BASE_OPACITY - SHADOW_MIN_OPACITY) * (1 - normalizedLift);
};

const applyShakeImpulse = (runtimes: PlushRuntime[], shake: THREE.Vector3) => {
  const shakeStrength = shake.length();
  const shakeDirection = shake.clone().normalize();
  const impulseStrength = Math.min(1.8, shakeStrength) * DEVICE_SHAKE_IMPULSE;

  runtimes.forEach((runtime, index) => {
    const alternatingKick = index % 2 === 0 ? 1 : -1;
    runtime.physics.velocity.x += shakeDirection.x * impulseStrength;
    runtime.physics.velocity.y += Math.abs(shakeDirection.y) * impulseStrength;
    runtime.physics.angularVelocity.z += alternatingKick * DEVICE_SHAKE_TUMBLE * Math.min(1.6, shakeStrength);
    clampAngularVelocity(runtime.physics.angularVelocity);
  });
};

const createShadow = () =>
  new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x4b332d,
      depthWrite: false,
      opacity: SHADOW_BASE_OPACITY,
      transparent: true,
    })
  );

export default function PersistentPlushiesWebGL({
  background = "#FCF1E9",
  catSrc = DEFAULT_PLUSHIES.cat,
  kermySrc = DEFAULT_PLUSHIES.kermy,
  meSrc = DEFAULT_PLUSHIES.me,
}: PersistentPlushiesWebGLProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const isHoveringRef = React.useRef(false);
  const lastPulseAtRef = React.useRef(0);

  React.useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let disposed = false;
    let viewportWorldHeight = 5;
    let viewportWorldWidth = 5;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.z = 8;

    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(new THREE.Color(background), 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    container.appendChild(renderer.domElement);

    const runtimes: PlushRuntime[] = [];
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const aspect = width / height;
      viewportWorldHeight = 4.2;
      viewportWorldWidth = viewportWorldHeight * aspect;

      camera.left = -viewportWorldWidth / 2;
      camera.right = viewportWorldWidth / 2;
      camera.top = viewportWorldHeight / 2;
      camera.bottom = -viewportWorldHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener("resize", resize);

    Promise.all([loadImage(kermySrc), loadImage(meSrc), loadImage(catSrc)])
      .then((images) => {
        if (disposed) {
          return;
        }

        images.forEach((image, index) => {
          const mesh = createPlushMesh(image);
          const shadow = createShadow();
          const physics = createPhysicsState();
          const depthZ = Math.min(PLUSH_MAX_DEPTH, index * PLUSH_DEPTH_SPACING);
          const startX = (index - 1) * 0.74;
          const startY = viewportWorldHeight / 2 - 0.55 - index * 0.18;

          physics.radius = mesh.userData.physicsRadius ?? PLUSH_TARGET_SIZE / 2;
          physics.halfWidth = mesh.userData.physicsHalfWidth ?? PLUSH_TARGET_SIZE / 2;
          physics.halfHeight = mesh.userData.physicsHalfHeight ?? PLUSH_TARGET_SIZE / 2;
          physics.position.set(startX, startY, depthZ);
          physics.velocity.set(0, -0.35, 0);
          mesh.position.copy(physics.position);
          scene.add(shadow, mesh);
          runtimes.push({ depthZ, mesh, physics, shadow, softness: createSoftnessState() });
        });

        applyShakeImpulse(runtimes, new THREE.Vector3(1.25, 0.75, 0));
      })
      .catch((error) => console.error(error));

    const render = (frameTime: number) => {
      if (isHoveringRef.current && frameTime - lastPulseAtRef.current > 720 && runtimes.length > 0) {
        lastPulseAtRef.current = frameTime;
        applyShakeImpulse(runtimes, new THREE.Vector3(1.25, 0.75, 0));
      }

      for (let index = 0; index < runtimes.length; index += 1) {
        applyPhysicsFrame(runtimes[index], viewportWorldWidth, viewportWorldHeight, frameTime);
      }

      for (let a = 0; a < runtimes.length; a += 1) {
        for (let b = a + 1; b < runtimes.length; b += 1) {
          resolvePlushCollision(runtimes[a], runtimes[b]);
        }
      }

      runtimes.forEach((runtime) => {
        runtime.physics.position.z = runtime.depthZ;
        runtime.mesh.position.copy(runtime.physics.position);
        updatePlushShadow(runtime, viewportWorldHeight);
      });

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      runtimes.forEach(({ mesh, shadow }) => {
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material) => {
              if (material instanceof THREE.MeshBasicMaterial && material.map) {
                material.map.dispose();
              }

              material.dispose();
            });
          }
        });
        shadow.geometry.dispose();
        shadow.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [background, catSrc, kermySrc, meSrc]);

  return (
    <div
      ref={containerRef}
      style={{ background, height: "100%", minHeight: 260, overflow: "hidden", width: "100%" }}
      onPointerEnter={() => {
        isHoveringRef.current = true;
        lastPulseAtRef.current = 0;
      }}
      onPointerLeave={() => {
        isHoveringRef.current = false;
      }}
    />
  );
}
