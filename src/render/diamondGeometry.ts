import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from "three";

// Each stone is drawn in its own frame. The frame is the principal axes of its vertices,
// scaled to the stone's bounding sphere. The normal capture and the diamond shader both
// use it, so they agree. This is a port of the engine's DiamondPlugin (al and nl).

export interface StoneOffsets {
  center: Vector3;
  offsetMatrix: Matrix4;
  offsetMatrixInv: Matrix4;
  centerOffset: Vector3;
  radius: number;
}

// Above this many vertices / 3 the engine uses the normal-sum frame instead.
const LARGE_MESH_TRIANGLES = 500;

export function computeStoneOffsets(geometry: BufferGeometry): StoneOffsets {
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new Vector3());
  const offsetMatrix = offsetFrame(geometry);
  const offsetMatrixInv = offsetMatrix.clone().invert();
  const centerOffset = center.clone().applyMatrix4(offsetMatrixInv);
  return { center, offsetMatrix, offsetMatrixInv, centerOffset, radius: 1 };
}

function offsetFrame(geometry: BufferGeometry): Matrix4 {
  const position = geometry.getAttribute("position") as BufferAttribute;
  if (position.count / 3 > LARGE_MESH_TRIANGLES) return normalSumFrame(geometry);

  const corners = triangleCorners(geometry);
  const mass = massProperties(position, corners);
  if (mass.volume < 0) flipNormals(geometry);

  const [h0, h1, h2] = principalAxes(position);
  // Keep the second and third axes pointing the same way as the stone's centre of mass.
  const toMass = mass.com.clone().sub(mass.centre).normalize();
  if (toMass.dot(h2) < 0) {
    h1.negate();
    h2.negate();
  }

  geometry.computeBoundingSphere();
  const r = geometry.boundingSphere!.radius;
  return new Matrix4().makeBasis(h0, h1, h2).multiply(new Matrix4().makeScale(r, r, r));
}

// The triangle corners in order, three per triangle, honouring the index when there is one.
function triangleCorners(geometry: BufferGeometry): Vector3[] {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const index = geometry.index;
  const corners: Vector3[] = [];
  const count = index ? index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = index ? index.getX(i + k) : i + k;
      corners.push(new Vector3(position.getX(v), position.getY(v), position.getZ(v)));
    }
  }
  return corners;
}

function massProperties(position: BufferAttribute, corners: Vector3[]) {
  const centre = new Vector3();
  for (let i = 0; i < position.count; i++) {
    centre.add(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
  }
  centre.multiplyScalar(1 / position.count);

  const com = new Vector3();
  let area = 0;
  let volume = 0;
  for (let i = 0; i < corners.length; i += 3) {
    const [a, b, c] = [corners[i], corners[i + 1], corners[i + 2]];
    const triangleArea = 0.5 * b.clone().sub(a).cross(c.clone().sub(a)).length();
    com.add(a.clone().add(b).add(c).multiplyScalar(triangleArea / 3));
    area += triangleArea;
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  com.multiplyScalar(1 / area);
  return { centre, com, volume };
}

function flipNormals(geometry: BufferGeometry) {
  const normal = geometry.getAttribute("normal") as BufferAttribute;
  for (let i = 0; i < normal.count; i++) {
    normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  }
  normal.needsUpdate = true;
}

// Principal axes of the vertex cloud, largest variance first. The engine negates each
// axis after its SVD, and this does the same.
function principalAxes(position: BufferAttribute): [Vector3, Vector3, Vector3] {
  const points: number[][] = [];
  for (let i = 0; i < position.count; i++) points.push([position.getX(i), position.getY(i), position.getZ(i)]);

  const mean = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) mean[k] += p[k] / points.length;

  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of points) {
    const d = [p[0] - mean[0], p[1] - mean[1], p[2] - mean[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r][c] += (d[r] * d[c]) / points.length;
  }

  const { values, vectors } = eigenSymmetric(cov);
  const order = [0, 1, 2].sort((a, b) => values[b] - values[a]);
  return order.map((i) => new Vector3(-vectors[0][i], -vectors[1][i], -vectors[2][i])) as [Vector3, Vector3, Vector3];
}

// Jacobi rotations for a symmetric 3x3 matrix. `vectors` holds the eigenvectors as columns.
function eigenSymmetric(input: number[][]) {
  const a = input.map((row) => row.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-30) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

// Large meshes: the frame comes from the averaged face normals, as in the engine's nl.
function normalSumFrame(geometry: BufferGeometry): Matrix4 {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const index = geometry.index;
  const vertex = (i: number) => new Vector3(position.getX(i), position.getY(i), position.getZ(i));

  const average = new Vector3();
  const count = index ? index.count : position.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const [a, b, c] = index
      ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      : [i, i + 1, i + 2];
    const n = vertex(c).sub(vertex(a)).cross(vertex(b).sub(vertex(a))).normalize();
    average.add(n);
  }
  average.normalize();

  // First edge that is not parallel to the average normal.
  let edge = new Vector3();
  for (let e = 0; ; e++) {
    const r = index ? index.getX(e) : e;
    const s = index ? index.getX(e + 1) : e + 1;
    edge = vertex(r).sub(vertex(s)).normalize();
    if (Math.abs(average.dot(edge) - 1) > 0.001 && edge.length() > 0.5) break;
    if (e > count) throw new Error("No usable edge for the stone frame");
  }

  const b2 = edge.clone().cross(average).normalize(); // engine: i = n x t
  const b0 = average.clone().cross(b2).normalize(); // engine: n = t x i
  geometry.computeBoundingSphere();
  const r = geometry.boundingSphere!.radius;
  return new Matrix4().makeBasis(b0, average, b2).multiply(new Matrix4().makeScale(r, r, r));
}
