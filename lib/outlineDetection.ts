import { Buffer } from 'buffer';
import { PNG } from 'pngjs/browser';

export type OutlinePoint = {
  x: number;
  y: number;
};

export type DetectedOutline = {
  points: OutlinePoint[];
  path: string;
  imageWidth: number;
  imageHeight: number;
};

type GridPoint = {
  x: number;
  y: number;
};

const ALPHA_THRESHOLD = 24;
const MAX_TRACE_SIZE = 220;
const MAX_PATH_POINTS = 260;
const SIMPLIFY_TOLERANCE = 2.2;

const DIRECTIONS: GridPoint[] = [
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
];

const getBase64FromDataUri = (dataUri: string) => {
  const marker = 'base64,';
  const markerIndex = dataUri.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('Expected a base64 PNG data URI for outline detection.');
  }

  return dataUri.slice(markerIndex + marker.length);
};

const getPixelIndex = (png: PNG, x: number, y: number) => (png.width * y + x) << 2;

const isAlphaVisible = (png: PNG, x: number, y: number) => png.data[getPixelIndex(png, x, y) + 3] > ALPHA_THRESHOLD;

const createMask = (png: PNG) => {
  const scale = Math.min(1, MAX_TRACE_SIZE / Math.max(png.width, png.height));
  const width = Math.max(1, Math.ceil(png.width * scale));
  const height = Math.max(1, Math.ceil(png.height * scale));
  const mask = Array.from({ length: height }, () => Array.from({ length: width }, () => false));

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (isAlphaVisible(png, x, y)) {
        const gridX = Math.min(width - 1, Math.floor(x * scale));
        const gridY = Math.min(height - 1, Math.floor(y * scale));
        mask[gridY][gridX] = true;
      }
    }
  }

  return { mask, width, height, scale };
};

const getVisible = (mask: boolean[][], point: GridPoint) =>
  point.y >= 0 &&
  point.y < mask.length &&
  point.x >= 0 &&
  point.x < mask[0].length &&
  mask[point.y][point.x];

const isBoundary = (mask: boolean[][], point: GridPoint) => {
  if (!getVisible(mask, point)) {
    return false;
  }

  return DIRECTIONS.some((direction) => !getVisible(mask, { x: point.x + direction.x, y: point.y + direction.y }));
};

const keyForPoint = (point: GridPoint) => `
${point.x},${point.y}`;

const findLargestComponent = (mask: boolean[][]) => {
  const visited = new Set<string>();
  let largestComponent: GridPoint[] = [];

  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[0].length; x += 1) {
      const start = { x, y };
      const startKey = keyForPoint(start);

      if (!getVisible(mask, start) || visited.has(startKey)) {
        continue;
      }

      const component: GridPoint[] = [];
      const stack = [start];
      visited.add(startKey);

      while (stack.length > 0) {
        const point = stack.pop();

        if (!point) {
          continue;
        }

        component.push(point);

        for (const direction of DIRECTIONS) {
          const neighbor = { x: point.x + direction.x, y: point.y + direction.y };
          const neighborKey = keyForPoint(neighbor);

          if (getVisible(mask, neighbor) && !visited.has(neighborKey)) {
            visited.add(neighborKey);
            stack.push(neighbor);
          }
        }
      }

      if (component.length > largestComponent.length) {
        largestComponent = component;
      }
    }
  }

  const componentKeys = new Set(largestComponent.map(keyForPoint));

  return mask.map((row, y) => row.map((_, x) => componentKeys.has(keyForPoint({ x, y }))));
};

const findStartBoundaryPoint = (mask: boolean[][]) => {
  for (let y = 0; y < mask.length; y += 1) {
    for (let x = 0; x < mask[0].length; x += 1) {
      const point = { x, y };

      if (isBoundary(mask, point)) {
        return point;
      }
    }
  }

  return null;
};

const directionIndexFromTo = (from: GridPoint, to: GridPoint) =>
  DIRECTIONS.findIndex((direction) => from.x + direction.x === to.x && from.y + direction.y === to.y);

const samePoint = (a: GridPoint, b: GridPoint) => a.x === b.x && a.y === b.y;

const traceBoundary = (mask: boolean[][]) => {
  const start = findStartBoundaryPoint(mask);

  if (!start) {
    return [];
  }

  const boundary = [start];
  let current = start;
  let previous = { x: start.x - 1, y: start.y };
  const maxSteps = mask.length * mask[0].length * 4;

  for (let step = 0; step < maxSteps; step += 1) {
    const previousDirectionIndex = directionIndexFromTo(current, previous);
    const searchStart = previousDirectionIndex === -1 ? 0 : (previousDirectionIndex + 1) % DIRECTIONS.length;
    let next: GridPoint | null = null;
    let nextPrevious = previous;

    for (let offset = 0; offset < DIRECTIONS.length; offset += 1) {
      const directionIndex = (searchStart + offset) % DIRECTIONS.length;
      const direction = DIRECTIONS[directionIndex];
      const candidate = { x: current.x + direction.x, y: current.y + direction.y };

      if (getVisible(mask, candidate)) {
        next = candidate;
        const previousDirection = DIRECTIONS[(directionIndex + DIRECTIONS.length - 1) % DIRECTIONS.length];
        nextPrevious = { x: current.x + previousDirection.x, y: current.y + previousDirection.y };
        break;
      }
    }

    if (!next) {
      break;
    }

    current = next;
    previous = nextPrevious;

    if (samePoint(current, start) && boundary.length > 2) {
      break;
    }

    boundary.push(current);
  }

  return boundary;
};

const pointToSegmentDistance = (point: OutlinePoint, start: OutlinePoint, end: OutlinePoint) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projectedX = start.x + t * dx;
  const projectedY = start.y + t * dy;

  return Math.hypot(point.x - projectedX, point.y - projectedY);
};

const simplifyDouglasPeucker = (points: OutlinePoint[], tolerance: number): OutlinePoint[] => {
  if (points.length <= 2) {
    return points;
  }

  let farthestDistance = 0;
  let farthestIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointToSegmentDistance(points[index], start, end);

    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }

  if (farthestDistance <= tolerance) {
    return [start, end];
  }

  const left = simplifyDouglasPeucker(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplifyDouglasPeucker(points.slice(farthestIndex), tolerance);

  return [...left.slice(0, -1), ...right];
};

const limitPoints = (points: OutlinePoint[]) => {
  const step = Math.max(1, Math.ceil(points.length / MAX_PATH_POINTS));
  return points.filter((_, index) => index % step === 0);
};

const createClosedPath = (points: OutlinePoint[]) => {
  if (points.length === 0) {
    return '';
  }

  const [firstPoint, ...remainingPoints] = points;
  const commands = [
    `M ${firstPoint.x.toFixed(1)} ${firstPoint.y.toFixed(1)}`,
    ...remainingPoints.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`),
    'Z',
  ];

  return commands.join(' ');
};

export function detectOutlineFromPngDataUri(dataUri: string): DetectedOutline {
  const png = PNG.sync.read(Buffer.from(getBase64FromDataUri(dataUri), 'base64'));
  const { mask, scale } = createMask(png);
  const largestComponentMask = findLargestComponent(mask);
  const tracedGridPoints = traceBoundary(largestComponentMask);
  const tracedPoints = tracedGridPoints.map((point) => ({
    x: (point.x + 0.5) / scale,
    y: (point.y + 0.5) / scale,
  }));
  const simplifiedPoints = limitPoints(simplifyDouglasPeucker(tracedPoints, SIMPLIFY_TOLERANCE));

  return {
    points: simplifiedPoints,
    path: createClosedPath(simplifiedPoints),
    imageWidth: png.width,
    imageHeight: png.height,
  };
}
