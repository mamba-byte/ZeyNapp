// Model istatistikleri: vertex, üçgen, kenar, materyal, doku, kemik sayıları
import * as THREE from 'three';
import { materialsOf } from './shading.js';

export function computeStats(root, animations = []) {
  const s = {
    meshes: 0, triangles: 0, gpuVertices: 0, materials: 0, textures: 0, bones: 0, morphTargets: 0,
    animations: animations.length, nodes: 0, skinned: 0, points: 0, lines: 0, instanced: 0,
    hasUV: 0, hasVertexColors: 0, fileLights: root.userData.fileLights || 0,
  };
  const mats = new Set();
  const texs = new Set();
  const bones = new Set();
  root.traverse(o => {
    if (o.userData.isOverlay) return;
    s.nodes++;
    if (o.isBone) bones.add(o);
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    const g = o.geometry;
    const pos = g?.attributes.position;
    if (!pos) return;
    const inst = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh) s.instanced++;
    s.gpuVertices += pos.count * inst;
    if (o.isMesh) {
      s.meshes++;
      s.triangles += Math.floor((g.index ? g.index.count : pos.count) / 3) * inst;
      if (g.attributes.uv) s.hasUV++;
      if (g.attributes.color && !g.userData.syntheticColor) s.hasVertexColors++;
    } else if (o.isPoints) s.points++;
    else s.lines++;
    if (o.isSkinnedMesh) {
      s.skinned++;
      o.skeleton?.bones.forEach(b => bones.add(b));
    }
    s.morphTargets += g.morphAttributes.position?.length || 0;
    for (const m of materialsOf(o.userData.origMaterial || o.material)) {
      mats.add(m);
      const stash = m.userData.__stash || {};
      for (const v of [...Object.values(m), ...Object.values(stash)]) if (v && v.isTexture) texs.add(v);
    }
  });
  s.materials = mats.size;
  s.textures = texs.size;
  s.bones = bones.size;
  return s;
}

/**
 * Benzersiz (kaynaklanmış) vertex ve kenar sayısını hesaplar. Büyük modellerde arayüzü
 * dondurmamak için parçalar halinde çalışır.
 */
export async function computeTopology(root, isCancelled = () => false) {
  let vertices = 0;
  let edges = 0;
  const CHUNK = 150_000;
  const meshes = [];
  root.traverse(o => { if (o.isMesh && !o.userData.isOverlay && o.geometry?.attributes.position) meshes.push(o); });
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const inst = mesh.isInstancedMesh ? mesh.count : 1;
    if (!g.boundingBox) g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3()).length() || 1;
    const q = 1 / (size * 1e-6);
    const ids = new Int32Array(pos.count);
    const map = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
      let id = map.get(key);
      if (id === undefined) { id = map.size; map.set(key, id); }
      ids[i] = id;
      if (i % CHUNK === CHUNK - 1) {
        await new Promise(r => setTimeout(r, 0));
        if (isCancelled()) return null;
      }
    }
    vertices += map.size * inst;
    const index = g.index;
    const triCount = Math.floor((index ? index.count : pos.count) / 3);
    const edgeSet = new Set();
    const M = 0x4000000;
    for (let t = 0; t < triCount; t++) {
      const a = ids[index ? index.getX(t * 3) : t * 3];
      const b = ids[index ? index.getX(t * 3 + 1) : t * 3 + 1];
      const c = ids[index ? index.getX(t * 3 + 2) : t * 3 + 2];
      edgeSet.add(a < b ? a * M + b : b * M + a);
      edgeSet.add(b < c ? b * M + c : c * M + b);
      edgeSet.add(c < a ? c * M + a : a * M + c);
      if (t % CHUNK === CHUNK - 1) {
        await new Promise(r => setTimeout(r, 0));
        if (isCancelled()) return null;
      }
    }
    edges += edgeSet.size * inst;
  }
  return { vertices, edges };
}

/** Bir nesnenin alt ağacındaki üçgen sayısı (sahne ağacındaki etiketler için). */
export function triangleCount(o) {
  const g = o.geometry;
  if (!o.isMesh || !g?.attributes.position) return 0;
  return Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
}
