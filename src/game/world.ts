import * as THREE from 'three';
import { WORLD_WALLS, ZONES, type MapId } from '../shared/world';
import type { ZoneBuild } from './zones/common';

type ZoneModule = { buildZone: () => ZoneBuild };
const loaders: Record<MapId, () => Promise<ZoneModule>> = {
  campus: () => import('./zones/campus'),
  garden: () => import('./zones/garden'),
  museum: () => import('./zones/museum'),
};

/** Distance-driven detail streaming. Only the nearby arena's artwork is imported. */
export class World {
  private scene: THREE.Scene;
  private shell = new THREE.Group();
  private loaded = new Map<MapId, ZoneBuild>();
  private loading = new Map<MapId, Promise<void>>();
  private proxies = new Map<MapId, THREE.Group>();
  private currentZone = ZONES[0].name;
  private disposed = false;
  private sunlight: THREE.DirectionalLight;
  private skyLight: THREE.HemisphereLight;
  private lastX = 0;
  private lastZ = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.shell.name = 'always-loaded-landscape';
    scene.add(this.shell);
    scene.background = new THREE.Color(0xc5d9d8);
    scene.fog = new THREE.Fog(0xc5d9d8, 42, 145);
    this.skyLight = new THREE.HemisphereLight(0xf5f2d5, 0x698983, 2.05);
    scene.add(this.skyLight);
    this.sunlight = new THREE.DirectionalLight(0xffe5b9, 3.1);
    this.sunlight.position.set(-22, 38, 19);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    const shadow = this.sunlight.shadow.camera;
    shadow.left = shadow.bottom = -39;
    shadow.right = shadow.top = 39;
    shadow.near = 1;
    shadow.far = 125;
    this.sunlight.shadow.bias = -0.00035;
    this.sunlight.shadow.normalBias = 0.07;
    this.sunlight.shadow.radius = 3;
    scene.add(this.sunlight, this.sunlight.target);

    const grass = new THREE.MeshStandardMaterial({ color: 0x91a975, roughness: 1 });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(550, 550), grass);
    base.rotation.x = -Math.PI / 2;
    base.position.set(24, -0.075, -20);
    base.receiveShadow = true;
    this.shell.add(base);
    const mountainColors = [0xabc0af, 0x97b4a4, 0xb5c8b7];
    for (let i = 0; i < 15; i++) {
      const angle = i / 15 * Math.PI * 2;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: mountainColors[i % 3], roughness: 1, flatShading: true }));
      hill.position.set(24 + Math.cos(angle) * (115 + i % 3 * 13), -4, -20 + Math.sin(angle) * (117 + i % 2 * 15));
      hill.scale.set(32 + i % 4 * 9, 19 + i % 5 * 6, 27 + i % 3 * 9);
      this.shell.add(hill);
    }

    // Tiny placeholders preserve skyline and navigation silhouettes while the
    // detailed zone module is fetched, assembled and uploaded to the GPU.
    for (const zone of ZONES) {
      const proxy = new THREE.Group();
      proxy.name = `${zone.id}-low-detail-shell`;
      const material = new THREE.MeshStandardMaterial({ color: zone.id === 'garden' ? 0x9c906b : zone.id === 'museum' ? 0x8f8270 : 0xe5d8b8, roughness: 1 });
      for (const wall of WORLD_WALLS.filter(w => w.zone === zone.id)) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(wall.w, wall.h, wall.d), material);
        block.position.set(wall.x, wall.h / 2, wall.z);
        block.castShadow = block.receiveShadow = true;
        proxy.add(block);
      }
      this.proxies.set(zone.id, proxy);
      this.shell.add(proxy);
    }
  }

  get status(): { loaded: number; total: number; zone: string } {
    return { loaded: this.loaded.size, total: ZONES.length, zone: this.currentZone };
  }

  async update(x: number, z: number): Promise<void> {
    if (this.disposed) return;
    this.lastX = x;
    this.lastZ = z;
    const ordered = ZONES.map(zone => ({ ...zone, distance: Math.hypot(zone.x - x, zone.z - z) })).sort((a, b) => a.distance - b.distance);
    this.currentZone = ordered[0].name;
    const pending: Promise<void>[] = [];
    for (const zone of ordered) {
      if (zone.distance < 43 || zone.id === ordered[0].id) {
        if (!this.loaded.has(zone.id) && !this.loading.has(zone.id)) {
          const request = loaders[zone.id]().then(module => {
            if (this.disposed) return;
            const built = module.buildZone();
            this.loaded.set(zone.id, built);
            this.scene.add(built.group);
            this.proxies.get(zone.id)!.visible = false;
          }).finally(() => this.loading.delete(zone.id));
          this.loading.set(zone.id, request);
        }
        const inFlight = this.loading.get(zone.id);
        if (inFlight) pending.push(inFlight);
      } else if (zone.distance > 78 && this.loaded.has(zone.id)) {
        this.loaded.get(zone.id)!.dispose();
        this.loaded.delete(zone.id);
        this.proxies.get(zone.id)!.visible = true;
      }
    }
    await Promise.all(pending);
  }

  tick(time: number) {
    for (const built of this.loaded.values()) built.tick?.(time);
    // Keep the shadow atlas focused on the player as arenas stream around them.
    this.sunlight.position.set(this.lastX - 22, 38, this.lastZ + 19);
    this.sunlight.target.position.set(this.lastX, 0, this.lastZ);
  }

  dispose() {
    this.disposed = true;
    this.loaded.forEach(zone => zone.dispose());
    this.loaded.clear();
    const materials = new Set<THREE.Material>();
    this.shell.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    materials.forEach(material => material.dispose());
    this.shell.removeFromParent();
    this.sunlight.shadow.map?.dispose();
    this.sunlight.removeFromParent();
    this.sunlight.target.removeFromParent();
    this.skyLight.removeFromParent();
  }
}
