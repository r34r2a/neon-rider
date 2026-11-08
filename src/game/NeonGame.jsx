import * as THREE from 'three';
import NeonAudio from './audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LANE_W = 3.15;
const SPAWN_Z = -110;
const BIKE_Z = 1.2;

export default class NeonGame {
  constructor(canvas, onUpdate) {
    this.canvas = canvas;
    this.onUpdate = onUpdate;
    this.state = 'menu';
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.hits = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = 0;
    this.nitro = 100;
    this.playerX = 0;
    this.targetX = 0;
    this.lanes = [-LANE_W, 0, LANE_W];
    this.objects = [];
    this.lastSpawn = -999;
    this.invuln = 0;
    this.boosting = false;
    this.flash = 0;
    this.pickupFlash = 0;
    this.recentObstacleLanes = [];
    this.bikeNeonMats = [];
    this.wheelRotators = [];
    this.audio = new NeonAudio();
    this._shared = {};

    this.init();
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
    window.addEventListener('resize', this.resize);
  }

  setSound(on) {
    this.audio.setEnabled(on);
  }

  unlockAudio() {
    this.audio.ensure();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080918);
    this.scene.fog = new THREE.FogExp2(0x080918, 0.012);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
    this.camera.position.set(0, 5.2, 11);
    this.camera.lookAt(0, 1, -5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene.add(new THREE.HemisphereLight(0x8b9bff, 0x1b092b, 2.1));
    const key = new THREE.DirectionalLight(0xc4d5ff, 3.3);
    key.position.set(-5, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    const mag = new THREE.PointLight(0xe72cff, 32, 36);
    mag.position.set(0, 5, -13);
    this.scene.add(mag);

    const cyan = new THREE.PointLight(0x00eaff, 22, 30);
    cyan.position.set(0, 3, 5);
    this.scene.add(cyan);

    this.buildSharedMats();
    this.buildTrack();
    this.buildBike();
    this.buildLightTrail();
    this.buildCity();
    this.buildStars();
    this.buildFeedback();
  }

  mat(color, emissive = 0, intensity = 0, sharedKey) {
    const m = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.62,
      roughness: 0.32,
      emissive,
      emissiveIntensity: intensity,
    });
    if (sharedKey) {
      m.userData.shared = true;
      this._shared[sharedKey] = m;
    }
    return m;
  }

  buildSharedMats() {
    this.pickupMat = this.mat(0xffc847, 0xffa400, 3.4, 'pickup');
    this.pickupRingMat = this.mat(0xffb020, 0xff9000, 2.6, 'pickupRing');
    this.pickupGeo = new THREE.OctahedronGeometry(0.48, 1);
    this.pickupRingGeo = new THREE.TorusGeometry(0.62, 0.032, 8, 24);

    // Traffic Materials
    this.trafficObsidian = this.mat(0x0d101d, 0, 0, 'tfObsidian');
    this.trafficNavy = this.mat(0x121730, 0, 0, 'tfNavy');
    this.trafficCrimson = this.mat(0x2a1020, 0, 0, 'tfCrimson');
    this.trafficGlass = this.mat(0x060812, 0x00c8ff, 0.5, 'tfGlass');
    this.trafficChrome = this.mat(0x8a99b5, 0, 0, 'tfChrome');

    // Traffic Lighting Materials
    this.taillightMat = this.mat(0xff1844, 0xff052c, 4.4, 'tfTaillight');
    this.headlightMat = this.mat(0xb8f4ff, 0x00e5ff, 4.0, 'tfHeadlight');
    this.amberHazardMat = this.mat(0xff9900, 0xff7700, 3.6, 'tfAmber');
    this.underglowMat = this.mat(0x9a1cff, 0x9b18ff, 3.2, 'tfUnderglow');
    this.speederTailMat = this.mat(0xff22bb, 0xff10aa, 4.2, 'tfSpeederTail');

    // Traffic Geometries
    this.sedanBodyGeo = new THREE.BoxGeometry(1.68, 0.45, 3.4);
    this.sedanCabinGeo = new THREE.BoxGeometry(1.36, 0.38, 1.8);
    this.sedanTaillightGeo = new THREE.BoxGeometry(1.58, 0.12, 0.08);
    this.sedanHeadlightGeo = new THREE.BoxGeometry(0.36, 0.1, 0.08);
    this.sedanUnderglowGeo = new THREE.BoxGeometry(1.35, 0.03, 2.6);
    this.hoverPadGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);

    this.haulerCabGeo = new THREE.BoxGeometry(2.05, 1.15, 1.6);
    this.haulerTrailerGeo = new THREE.BoxGeometry(2.0, 1.48, 3.8);
    this.haulerHazardGeo = new THREE.BoxGeometry(1.9, 0.15, 0.08);
    this.haulerBeaconGeo = new THREE.BoxGeometry(0.22, 0.1, 0.1);

    this.runnerBodyGeo = new THREE.BoxGeometry(0.74, 0.46, 2.2);
    this.runnerRingGeo = new THREE.TorusGeometry(0.24, 0.05, 8, 20);
    this.runnerVisorGeo = new THREE.BoxGeometry(0.42, 0.12, 0.2);
  }

  buildTrack() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 240), this.mat(0x252a3c, 0x10172b, 0.65));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.08, -95);
    road.receiveShadow = true;
    this.scene.add(road);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(250, 300), this.mat(0x070914));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.22, -100);
    this.scene.add(ground);

    this.trackBits = [];
    for (let z = -210; z < 18; z += 10) {
      for (const x of [-6.47, 6.47]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 9.7), this.mat(0x65306d, 0xff32e1, 3.4));
        rail.position.set(x, 0.17, z);
        this.scene.add(rail);
      }
      for (const x of [-2.1, 2.1]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 5.8), this.mat(0x12627c, 0x00d9ff, 2.7));
        line.position.set(x, 0.005, z);
        this.scene.add(line);
        this.trackBits.push(line);
      }
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 1.65), this.mat(0x19728b, 0x00e5ff, 3.1));
      dash.position.set(0, 0.012, z);
      this.scene.add(dash);
      this.trackBits.push(dash);
    }
  }

  /**
   * Tron Light Cycle: Low-slung aerodynamic chassis, hubless neon rims with glowing treads,
   * aggressive tuck cyber rider, and dynamic boost color-shifting.
   */
  buildBike() {
    this.bike = new THREE.Group();
    this.scene.add(this.bike);
    this.bike.position.set(0, 0, BIKE_Z);

    this.bikeNeonMats = [];
    this.wheelRotators = [];

    const obsidian = this.mat(0x0a0c16, 0, 0, 'tronObsidian');
    obsidian.metalness = 0.92;
    obsidian.roughness = 0.22;

    const carbon = this.mat(0x151829, 0, 0, 'tronCarbon');
    carbon.metalness = 0.75;
    carbon.roughness = 0.35;

    const darkTire = this.mat(0x07080f, 0, 0, 'tronTire');
    darkTire.roughness = 0.85;

    const neonCyan = new THREE.MeshStandardMaterial({
      color: 0x00d4ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 4.2,
      roughness: 0.15,
      metalness: 0.1,
    });
    this.bikeNeonMats.push(neonCyan);

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 3.8,
      roughness: 0.1,
    });
    this.bikeNeonMats.push(visorMat);

    // Main streamlined chassis
    const bodyMain = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.42, 2.2), obsidian);
    bodyMain.position.set(0, 0.68, 0);
    bodyMain.castShadow = true;
    this.bike.add(bodyMain);

    // Arched upper aerodynamic spine
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.85, 16), obsidian);
    spine.rotation.x = Math.PI / 2;
    spine.position.set(0, 0.82, -0.05);
    spine.castShadow = true;
    this.bike.add(spine);

    // Undercarriage channel
    const underTray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.9), carbon);
    underTray.position.set(0, 0.32, 0);
    this.bike.add(underTray);

    // Front aerodynamic cowl
    const frontNose = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.38, 0.85), obsidian);
    frontNose.rotation.x = 0.22;
    frontNose.position.set(0, 0.72, -0.92);
    frontNose.castShadow = true;
    this.bike.add(frontNose);

    // Front neon intake lightbar
    const frontLightbar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.07, 0.08), neonCyan);
    frontLightbar.position.set(0, 0.62, -1.36);
    this.bike.add(frontLightbar);

    // Rear aerodynamic tail wing & diffusers
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.95), obsidian);
    tailWing.rotation.x = -0.18;
    tailWing.position.set(0, 0.76, 0.85);
    tailWing.castShadow = true;
    this.bike.add(tailWing);

    for (const sx of [-0.24, 0.24]) {
      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.55), neonCyan);
      diffuser.position.set(sx, 0.66, 1.15);
      this.bike.add(diffuser);
    }

    // Side aerodynamic blades with glowing accent strips
    for (const sx of [-0.31, 0.31]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 1.7), carbon);
      blade.position.set(sx, 0.58, 0);
      this.bike.add(blade);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.72), neonCyan);
      strip.position.set(sx * 1.08, 0.72, 0);
      this.bike.add(strip);
    }

    // Hubless Glowing Wheels (Front and Rear)
    for (const wz of [-0.98, 0.98]) {
      // Outer tire
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 12, 32), darkTire);
      tire.rotation.y = Math.PI / 2;
      tire.position.set(0, 0.42, wz);
      tire.castShadow = true;
      this.bike.add(tire);

      // Hollow inner neon ring aperture
      const innerAperture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.31, 0.31, 0.18, 24, 1, true),
        neonCyan
      );
      innerAperture.rotation.z = Math.PI / 2;
      innerAperture.position.set(0, 0.42, wz);
      this.bike.add(innerAperture);

      // Spinning neon rim bands
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(0, 0.42, wz);
      for (const sx of [-0.085, 0.085]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.024, 8, 32), neonCyan);
        rim.rotation.y = Math.PI / 2;
        rim.position.x = sx;
        wheelGroup.add(rim);
      }
      this.bike.add(wheelGroup);
      this.wheelRotators.push(wheelGroup);

      // Wheel shroud side plates
      for (const sx of [-0.26, 0.26]) {
        const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.42), obsidian);
        shroud.position.set(sx, 0.46, wz);
        this.bike.add(shroud);
      }
    }

    // Integrated Tucked Cyber Rider
    this.rider = new THREE.Group();
    this.bike.add(this.rider);

    // Prone racing tuck body
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.54, 4, 8), this.mat(0x0e1122));
    torso.rotation.x = -0.62;
    torso.position.set(0, 1.04, 0.18);
    torso.castShadow = true;
    this.rider.add(torso);

    // Neon spinal conduit
    const spineNeon = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.6), neonCyan);
    spineNeon.rotation.x = -0.62;
    spineNeon.position.set(0, 1.15, 0.16);
    this.rider.add(spineNeon);

    // Aerodynamic cyber helmet
    this.helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), this.mat(0x1c1e34));
    this.helmet.scale.set(0.85, 0.95, 1.25);
    this.helmet.position.set(0, 1.45, -0.28);
    this.rider.add(this.helmet);

    // Wraparound glowing visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.14), visorMat);
    visor.position.set(0, 1.45, -0.46);
    this.rider.add(visor);

    // Arms reaching forward to controls
    for (const sx of [-0.25, 0.25]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.52, 6), this.mat(0x121528));
      arm.rotation.x = 0.45;
      arm.rotation.z = sx > 0 ? 0.22 : -0.22;
      arm.position.set(sx, 1.08, -0.22);
      this.rider.add(arm);
    }

    // Bike Lights
    this.bikeGlow = new THREE.PointLight(0x00e5ff, 5.5, 9);
    this.bikeGlow.position.set(0, 0.5, -1.2);
    this.bike.add(this.bikeGlow);

    this.bikeRearGlow = new THREE.PointLight(0x00e5ff, 4.0, 7);
    this.bikeRearGlow.position.set(0, 0.5, 1.3);
    this.bike.add(this.bikeRearGlow);
  }

  /**
   * Tron Light Trail: Dynamic vertical neon jet ribbon trailing from the rear wheel.
   */
  buildLightTrail() {
    this.trailSegments = 36;
    const count = this.trailSegments;
    const vertexCount = count * 2;
    const positions = new Float32Array(vertexCount * 3);
    const indices = [];

    for (let i = 0; i < count - 1; i++) {
      const b0 = i * 2;
      const t0 = i * 2 + 1;
      const b1 = (i + 1) * 2;
      const t1 = (i + 1) * 2 + 1;
      indices.push(b0, t0, b1);
      indices.push(t0, t1, b1);
    }

    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trailGeo.setIndex(indices);

    this.trailMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.trailMesh = new THREE.Mesh(this.trailGeo, this.trailMat);
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);

    this.trailHistory = [];
  }

  resetLightTrail() {
    this.trailHistory = [];
    if (!this.trailGeo) return;
    const pos = this.trailGeo.attributes.position.array;
    pos.fill(0);
    this.trailGeo.attributes.position.needsUpdate = true;
  }

  updateLightTrail(dt, boost) {
    if (!this.trailMesh) return;
    this.trailMesh.visible = this.state === 'running' && this.bike.visible;

    // Shift existing trail points backward along Z with ground speed
    const dz = this.speed * dt;
    for (let i = 0; i < this.trailHistory.length; i++) {
      this.trailHistory[i].z += dz;
    }

    // Anchor to rear wheel location
    const rearX = this.bike.position.x;
    const rearZ = this.bike.position.z + 1.05;
    this.trailHistory.unshift({ x: rearX, z: rearZ });

    while (this.trailHistory.length > this.trailSegments) {
      this.trailHistory.pop();
    }

    const pos = this.trailGeo.attributes.position.array;
    const trailH = boost ? 0.95 : 0.72;
    const count = this.trailSegments;

    for (let i = 0; i < count; i++) {
      const pt = this.trailHistory[i] || (this.trailHistory.length > 0 ? this.trailHistory[this.trailHistory.length - 1] : { x: rearX, z: rearZ });
      const idx = i * 6;
      pos[idx + 0] = pt.x;
      pos[idx + 1] = 0.05;
      pos[idx + 2] = pt.z;

      pos[idx + 3] = pt.x;
      pos[idx + 4] = trailH;
      pos[idx + 5] = pt.z;
    }
    this.trailGeo.attributes.position.needsUpdate = true;

    if (boost) {
      this.trailMat.color.setHex(0xffaa20);
      this.trailMat.opacity = 0.88;
    } else {
      this.trailMat.color.setHex(0x00e5ff);
      this.trailMat.opacity = 0.62;
    }
  }

  // --- TRAFFIC VEHICLE BUILDERS ---

  createCyberSedan() {
    const mesh = new THREE.Group();
    const chassis = new THREE.Mesh(this.sedanBodyGeo, Math.random() < 0.5 ? this.trafficNavy : this.trafficCrimson);
    chassis.position.y = 0.42;
    chassis.castShadow = true;
    mesh.add(chassis);

    const cabin = new THREE.Mesh(this.sedanCabinGeo, this.trafficGlass);
    cabin.position.set(0, 0.76, -0.15);
    cabin.castShadow = true;
    mesh.add(cabin);

    const taillight = new THREE.Mesh(this.sedanTaillightGeo, this.taillightMat);
    taillight.position.set(0, 0.48, 1.71);
    mesh.add(taillight);

    for (const sx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(this.sedanHeadlightGeo, this.headlightMat);
      hl.position.set(sx, 0.38, -1.71);
      mesh.add(hl);
    }

    const underglow = new THREE.Mesh(this.sedanUnderglowGeo, this.underglowMat);
    underglow.position.set(0, 0.12, 0);
    mesh.add(underglow);

    for (const x of [-0.74, 0.74]) {
      for (const z of [-1.15, 1.15]) {
        const pad = new THREE.Mesh(this.hoverPadGeo, this.trafficChrome);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(x, 0.28, z);
        mesh.add(pad);
      }
    }

    return {
      mesh,
      hitX: 1.05,
      hitZ: 1.85,
      vehicleSpeed: 30 + Math.random() * 8,
    };
  }

  createHeavyHauler() {
    const mesh = new THREE.Group();
    const cab = new THREE.Mesh(this.haulerCabGeo, this.trafficObsidian);
    cab.position.set(0, 0.9, -1.85);
    cab.castShadow = true;
    mesh.add(cab);

    const trailer = new THREE.Mesh(this.haulerTrailerGeo, this.trafficNavy);
    trailer.position.set(0, 1.08, 0.72);
    trailer.castShadow = true;
    mesh.add(trailer);

    const barLower = new THREE.Mesh(this.haulerHazardGeo, this.taillightMat);
    barLower.position.set(0, 0.65, 2.63);
    mesh.add(barLower);

    const barUpper = new THREE.Mesh(this.haulerHazardGeo, this.amberHazardMat);
    barUpper.position.set(0, 1.7, 2.63);
    mesh.add(barUpper);

    const beacon = new THREE.Mesh(this.haulerBeaconGeo, this.amberHazardMat);
    beacon.position.set(0, 1.54, -2.1);
    mesh.add(beacon);

    for (const sx of [-0.75, 0.75]) {
      const hl = new THREE.Mesh(this.sedanHeadlightGeo, this.headlightMat);
      hl.position.set(sx, 0.55, -2.66);
      mesh.add(hl);
    }

    return {
      mesh,
      hitX: 1.25,
      hitZ: 2.75,
      vehicleSpeed: 20 + Math.random() * 6,
    };
  }

  createSpeedRunner() {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(this.runnerBodyGeo, this.trafficObsidian);
    body.position.y = 0.52;
    body.castShadow = true;
    mesh.add(body);

    const canopy = new THREE.Mesh(this.runnerVisorGeo, this.trafficGlass);
    canopy.position.set(0, 0.74, -0.3);
    mesh.add(canopy);

    const jet = new THREE.Mesh(this.runnerRingGeo, this.speederTailMat);
    jet.position.set(0, 0.52, 1.12);
    mesh.add(jet);

    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.1), this.headlightMat);
    hl.position.set(0, 0.48, -1.12);
    mesh.add(hl);

    return {
      mesh,
      hitX: 0.85,
      hitZ: 1.25,
      vehicleSpeed: 46 + Math.random() * 8,
    };
  }

  createPickup() {
    const mesh = new THREE.Group();
    const crystal = new THREE.Mesh(this.pickupGeo, this.pickupMat);
    mesh.add(crystal);

    const ring = new THREE.Mesh(this.pickupRingGeo, this.pickupRingMat);
    ring.rotation.x = Math.PI / 4;
    mesh.add(ring);

    return mesh;
  }

  buildCity() {
    this.city = [];
    const rand = (n) => {
      const x = Math.sin(n * 127.1 + 91.7) * 43758.5453;
      return x - Math.floor(x);
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i < 36; i++) {
        const z = -220 + i * 7.2;
        const h = 5 + rand(i + side * 71) * 20;
        const w = 3 + rand(i * 3 + side * 21) * 4;
        const x = side * (10 + w / 2 + rand(i * 8) * 7);
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 5 + rand(i + 40) * 4),
          this.mat(i % 4 === 0 ? 0x19152c : 0x0d1326)
        );
        b.position.y = h / 2;
        b.castShadow = true;
        g.add(b);
        for (let row = 1; row < h / 1.5; row++) {
          for (let col = 0; col < Math.floor(w / 0.8); col++) {
            if (rand(i * 193 + row * 13 + col * 7) > 0.52) {
              const win = new THREE.Mesh(
                new THREE.PlaneGeometry(0.22, 0.48),
                this.mat(0x8a39d8, i % 3 ? 0x1768a9 : 0xe02bc2, 1.4)
              );
              win.position.set(-w / 2 + 0.55 + col * 0.76, row * 1.45, 2.51);
              g.add(win);
            }
          }
        }
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(0.075, h, 0.08),
          this.mat(0xb32bfa, 0xbb18ff, 3)
        );
        strip.position.set(side === 1 ? -w / 2 : w / 2, h / 2, 2.56);
        g.add(strip);
        this.scene.add(g);
        this.city.push(g);
      }
    }
    for (let i = 0; i < 20; i++) {
      const h = 12 + ((i * 17) % 24);
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, h, 8), this.mat(0x10142a));
      b.position.set((i - 10) * 12, h / 2, -190 - (i % 4) * 13);
      this.scene.add(b);
    }
  }

  buildStars() {
    const geo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 1200; i++) {
      pts.push((Math.random() - 0.5) * 180, 10 + Math.random() * 70, -60 - Math.random() * 180);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x869bff, size: 0.16, transparent: true, opacity: 0.75 })
    );
    this.scene.add(this.stars);
  }

  buildFeedback() {
    this.hitRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff2a7a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.hitRing.rotation.x = -Math.PI / 2;
    this.hitRing.position.y = 0.08;
    this.hitRing.visible = false;
    this.bike.add(this.hitRing);

    this.pickupBurst = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.7, 24),
      new THREE.MeshBasicMaterial({
        color: 0xffc847,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.pickupBurst.rotation.x = -Math.PI / 2;
    this.pickupBurst.position.y = 0.1;
    this.pickupBurst.visible = false;
    this.bike.add(this.pickupBurst);
  }

  resize = () => {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  clearRunObjects() {
    for (const o of this.objects) this.scene.remove(o.mesh);
    this.objects.length = 0;
    this.recentObstacleLanes.length = 0;
  }

  resetRunState() {
    this.distance = 0;
    this.score = 0;
    this.speed = 0;
    this.nitro = 100;
    this.playerX = 0;
    this.targetX = 0;
    this.elapsed = 0;
    this.hits = 0;
    this.invuln = 0;
    this.boosting = false;
    this.lastSpawn = -999;
    this.flash = 0;
    this.pickupFlash = 0;
    this.recentObstacleLanes = [];

    this.bike.position.set(0, 0, BIKE_Z);
    this.bike.rotation.set(0, 0, 0);
    this.bike.visible = true;
    this.rider.rotation.z = 0;

    this.camera.position.set(0, 5.2, 11);
    this.camera.lookAt(0, 1, -5);

    this.hitRing.visible = false;
    this.hitRing.material.opacity = 0;
    this.pickupBurst.visible = false;
    this.pickupBurst.material.opacity = 0;

    this.bikeGlow.intensity = 5.2;
    this.bikeGlow.color.setHex(0x00e5ff);
    if (this.bikeRearGlow) {
      this.bikeRearGlow.intensity = 4.0;
      this.bikeRearGlow.color.setHex(0x00e5ff);
    }
    for (const m of this.bikeNeonMats || []) {
      m.emissive.setHex(0x00e5ff);
      m.color.setHex(0x00d4ff);
      m.emissiveIntensity = 4.2;
    }

    this.resetLightTrail();
    this.clearRunObjects();
    this.clock.getDelta();
  }

  start() {
    this.unlockAudio();
    this.resetRunState();
    this.state = 'running';
    this.audio.play('start');
    this.onUpdate({
      mode: 'running',
      distance: 0,
      score: 0,
      speed: 0,
      nitro: 100,
      boosting: false,
      hits: 0,
    });
  }

  pause() {
    if (this.state === 'running') {
      this.boosting = false;
      this.state = 'paused';
      this.onUpdate({ mode: 'paused' });
    }
  }

  resume() {
    if (this.state === 'paused') {
      this.state = 'running';
      this.clock.getDelta();
      this.onUpdate({ mode: 'running' });
    }
  }

  setLane(dir) {
    if (this.state !== 'running') return;
    this.targetX = clamp(this.targetX + dir * LANE_W, -LANE_W, LANE_W);
  }

  boost(on) {
    const next = !!on;
    if (next && !this.boosting && this.state === 'running' && this.nitro > 2) {
      this.audio.play('boost');
    }
    this.boosting = next;
  }

  /** Prefer open lanes; never seal all three lanes across nearby spawns. */
  pickLane(isPickup) {
    const blockedNear = new Set();
    for (const o of this.objects) {
      if (o.pickup) continue;
      if (o.mesh.position.z > SPAWN_Z + 28) continue;
      blockedNear.add(o.lane);
    }
    const recent = this.recentObstacleLanes.slice(-2);
    let candidates = this.lanes.filter((lane) => !blockedNear.has(lane));
    if (!isPickup && candidates.length <= 1 && blockedNear.size >= 2) {
      candidates = this.lanes.filter((lane) => !blockedNear.has(lane));
      if (!candidates.length) return null;
    }
    if (!isPickup && candidates.length > 1) {
      const filtered = candidates.filter((lane) => !recent.includes(lane));
      if (filtered.length) candidates = filtered;
    }
    if (!candidates.length) candidates = this.lanes.slice();
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  spawn() {
    const wantPickup = Math.random() < 0.24;
    let isPickup = wantPickup;
    let lane = this.pickLane(isPickup);
    if (lane == null) {
      isPickup = true;
      lane = this.pickLane(true);
      if (lane == null) return;
    }

    let mesh, hitX, hitZ, vehicleSpeed;
    if (isPickup) {
      mesh = this.createPickup();
      mesh.position.set(lane, 1.0, SPAWN_Z);
      hitX = 1.05;
      hitZ = 1.35;
      vehicleSpeed = 0;
    } else {
      const roll = Math.random();
      let v;
      if (roll < 0.52) {
        v = this.createCyberSedan();
      } else if (roll < 0.8) {
        v = this.createHeavyHauler();
      } else {
        v = this.createSpeedRunner();
      }
      mesh = v.mesh;
      hitX = v.hitX;
      hitZ = v.hitZ;
      vehicleSpeed = v.vehicleSpeed;
      mesh.position.set(lane, 0, SPAWN_Z);
      this.recentObstacleLanes.push(lane);
      if (this.recentObstacleLanes.length > 6) this.recentObstacleLanes.shift();
    }

    mesh.userData.pickup = isPickup;
    this.scene.add(mesh);
    this.objects.push({
      mesh,
      pickup: isPickup,
      lane,
      hitX,
      hitZ,
      vehicleSpeed,
      baseY: mesh.position.y,
      seed: Math.random() * 10,
      passedAudio: false,
    });
  }

  removeObject(i) {
    const o = this.objects[i];
    this.scene.remove(o.mesh);
    this.objects.splice(i, 1);
  }

  triggerHit() {
    this.flash = 0.55;
    this.hitRing.visible = true;
    this.hitRing.scale.set(1, 1, 1);
    this.hitRing.material.opacity = 0.85;
    this.audio.play('crash');
  }

  triggerPickup() {
    this.pickupFlash = 0.4;
    this.pickupBurst.visible = true;
    this.pickupBurst.scale.set(1, 1, 1);
    this.pickupBurst.material.opacity = 0.9;
    this.audio.play('pickup');
  }

  animate() {
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.04);
    if (this.state === 'running') this.update(dt);
    else if (this.flash > 0 || this.pickupFlash > 0) this.updateFeedback(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateFeedback(dt) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt);
      const t = this.flash / 0.55;
      this.hitRing.visible = t > 0.02;
      this.hitRing.material.opacity = t * 0.85;
      this.hitRing.scale.setScalar(1 + (1 - t) * 1.8);
    }
    if (this.pickupFlash > 0) {
      this.pickupFlash = Math.max(0, this.pickupFlash - dt);
      const t = this.pickupFlash / 0.4;
      this.pickupBurst.visible = t > 0.02;
      this.pickupBurst.material.opacity = t * 0.9;
      this.pickupBurst.scale.setScalar(1 + (1 - t) * 2.2);
    }
  }

  update(dt) {
    this.elapsed += dt;
    const base = 48 + Math.min(68, this.distance * 0.032);
    const boost = this.boosting && this.nitro > 0;
    if (boost) this.nitro = Math.max(0, this.nitro - dt * 26);
    else this.nitro = Math.min(100, this.nitro + dt * 9);

    this.speed = base * (boost ? 1.55 : 1);
    this.distance += (this.speed * dt) / 3.6;
    this.score += this.speed * dt * 0.38;
    this.invuln = Math.max(0, this.invuln - dt);
    this.updateFeedback(dt);

    this.playerX = THREE.MathUtils.damp(this.playerX, this.targetX, 9, dt);
    this.bike.position.x = this.playerX;
    this.bike.rotation.z = THREE.MathUtils.damp(
      this.bike.rotation.z,
      (this.targetX - this.playerX) * -0.13,
      7,
      dt
    );
    this.rider.rotation.z = this.bike.rotation.z * 0.45;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.playerX * 0.34, 2.2, dt);
    this.camera.position.y = 5.2 + Math.sin(this.elapsed * 12) * 0.035 * (this.speed / 100);
    this.camera.lookAt(this.playerX * 0.22, 1.1, -5);

    // Dynamic Tron Bike Lighting & Color Shift on Boost
    if (boost) {
      this.bikeGlow.intensity = 9.5;
      this.bikeGlow.color.setHex(0xffc847);
      if (this.bikeRearGlow) {
        this.bikeRearGlow.intensity = 8.0;
        this.bikeRearGlow.color.setHex(0xff9500);
      }
      for (const m of this.bikeNeonMats) {
        m.emissive.setHex(0xffb020);
        m.color.setHex(0xffd040);
        m.emissiveIntensity = 6.0;
      }
    } else {
      this.bikeGlow.intensity = 5.2;
      this.bikeGlow.color.setHex(0x00e5ff);
      if (this.bikeRearGlow) {
        this.bikeRearGlow.intensity = 4.0;
        this.bikeRearGlow.color.setHex(0x00e5ff);
      }
      for (const m of this.bikeNeonMats) {
        m.emissive.setHex(0x00e5ff);
        m.color.setHex(0x00d4ff);
        m.emissiveIntensity = 4.2;
      }
    }

    // Spin neon hubless wheel rims
    for (const w of this.wheelRotators) {
      w.rotation.x -= this.speed * dt * 0.35;
    }

    // Update Tron Light Trail
    this.updateLightTrail(dt, boost);

    // Track road strip movement
    for (const b of this.trackBits) {
      b.position.z += this.speed * dt;
      if (b.position.z > 15) b.position.z -= 220;
    }

    // Traffic spawn interval
    const interval = Math.max(0.65, 1.3 - this.distance * 0.0006);
    if (this.elapsed - this.lastSpawn > interval) {
      this.spawn();
      this.lastSpawn = this.elapsed;
    }

    // Traffic & Object loop
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      const relSpeed = o.pickup ? this.speed : Math.max(16, this.speed - o.vehicleSpeed);
      o.mesh.position.z += relSpeed * dt;

      if (o.pickup) {
        o.mesh.rotation.y += dt * 2.5;
        o.mesh.position.y = 1.0 + Math.sin(this.elapsed * 4 + o.seed) * 0.12;
      } else {
        o.mesh.position.y = o.baseY + Math.sin(this.elapsed * 5.5 + o.seed) * 0.02;
        // Doppler near-pass audio whoosh when overtaking close
        if (!o.passedAudio && o.mesh.position.z > BIKE_Z - 1.0 && o.mesh.position.z < BIKE_Z + 3.0) {
          const dx = Math.abs(o.mesh.position.x - this.playerX);
          if (dx < LANE_W * 1.25) {
            this.audio.play('pass');
            o.passedAudio = true;
          }
        }
      }

      const dz = Math.abs(o.mesh.position.z - BIKE_Z);
      const dx = Math.abs(o.mesh.position.x - this.playerX);
      if (dz < o.hitZ && dx < o.hitX) {
        if (o.pickup) {
          this.score += 250;
          this.nitro = Math.min(100, this.nitro + 28);
          this.triggerPickup();
          this.removeObject(i);
          continue;
        } else if (this.invuln <= 0) {
          this.speed = Math.max(24, this.speed * 0.58);
          this.invuln = 1.35;
          this.hits++;
          this.score = Math.max(0, this.score - 100);
          this.triggerHit();
          if (this.hits >= 3) {
            this.state = 'over';
            this.boosting = false;
            this.bike.visible = true;
            this.audio.play('over');
            this.onUpdate({
              mode: 'over',
              distance: this.distance,
              score: Math.floor(this.score),
              hits: this.hits,
            });
            return;
          }
        }
      }

      if (o.mesh.position.z > 16) this.removeObject(i);
    }

    // City skyline
    for (const g of this.city) {
      g.position.z += this.speed * dt * 0.72;
      if (g.position.z > 25) g.position.z -= 260;
    }

    if (this.invuln > 0) this.bike.visible = Math.floor(this.invuln * 14) % 2 === 0;
    else this.bike.visible = true;

    this.onUpdate({
      mode: 'running',
      distance: this.distance,
      score: Math.floor(this.score),
      speed: Math.floor(this.speed),
      nitro: this.nitro,
      boosting: boost,
      hits: this.hits,
    });
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.clearRunObjects();

    this.trailGeo?.dispose();
    this.trailMat?.dispose();

    this.pickupGeo?.dispose();
    this.pickupRingGeo?.dispose();
    this.sedanBodyGeo?.dispose();
    this.sedanCabinGeo?.dispose();
    this.sedanTaillightGeo?.dispose();
    this.sedanHeadlightGeo?.dispose();
    this.sedanUnderglowGeo?.dispose();
    this.hoverPadGeo?.dispose();
    this.haulerCabGeo?.dispose();
    this.haulerTrailerGeo?.dispose();
    this.haulerHazardGeo?.dispose();
    this.haulerBeaconGeo?.dispose();
    this.runnerBodyGeo?.dispose();
    this.runnerRingGeo?.dispose();
    this.runnerVisorGeo?.dispose();

    for (const m of this.bikeNeonMats || []) m.dispose();
    for (const m of Object.values(this._shared)) m.dispose();
    this._shared = {};

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        const mats = obj.material;
        if (!mats) return;
        const list = Array.isArray(mats) ? mats : [mats];
        for (const m of list) {
          if (m?.userData?.shared) continue;
          m?.dispose?.();
        }
      });
    }
    this.renderer?.dispose();
    this.audio?.dispose();
    this.scene = null;
    this.renderer = null;
  }
}
