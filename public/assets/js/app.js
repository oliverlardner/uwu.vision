import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js';
import { EXRLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/EXRLoader.js';

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Sticky header shadow + scroll-reveal
const header = document.querySelector('.site-header');
if (header) {
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

// Theme toggle (light / auto / dark) with localStorage + system sync
(function setupThemeToggle() {
  const root = document.documentElement;
  const buttons = document.querySelectorAll('[data-set-theme]');
  if (!buttons.length) return;
  const STORAGE = 'uwu-theme';

  const getStored = () => {
    try {
      const v = localStorage.getItem(STORAGE);
      return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
    } catch (_) { return 'auto'; }
  };
  const setStored = (v) => {
    try { localStorage.setItem(STORAGE, v); } catch (_) {}
  };

  const apply = (theme) => {
    root.setAttribute('data-theme', theme);
    buttons.forEach((b) => {
      const isActive = b.dataset.setTheme === theme;
      b.setAttribute('aria-checked', String(isActive));
    });
  };

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.setTheme;
      setStored(v);
      apply(v);
    });
  });

  apply(getStored());
})();

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 60, 240)}ms`;
    io.observe(el);
  });
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
}

const canvas = document.getElementById('hero-canvas');
if (!canvas) throw new Error('Missing #hero-canvas');

let renderer, scene, camera, controls, logo, animationId;
let originalMaxAxis = null;
let envDark = null, envLight = null;
let pmremGen = null;
// Pointer smoothing offsets
let pointerOffsetX = 0, pointerOffsetY = 0;
let pointerTargetX = 0, pointerTargetY = 0;
// Scroll tilt
let scrollTiltX = 0;
const DPR = Math.min(window.devicePixelRatio || 1, 2);
// Sinusoidal base rotation parameters
const yawAmplitude = 0.25;     // radians (~14°)
const pitchAmplitude = 0.12;   // radians (~7°)
const yawSpeed = 0.4;          // rad/s
const pitchSpeed = 0.5;        // rad/s
const phaseOffset = Math.PI / 2; // out-of-phase

function init() {
  scene = new THREE.Scene();

  const fov = 45;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 2000);
  camera.position.set(0.8, 0.5, 2.2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(DPR);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Environment: build dark + light gradient cubemaps, swap on theme
  pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileEquirectangularShader();
  envDark  = buildGradientEnv(pmremGen, 'dark');
  envLight = buildGradientEnv(pmremGen, 'light');
  applyEnvForTheme();
  // Try to load provided EXR — only used to upgrade the dark cubemap
  loadEnvironmentEXR(pmremGen);

  // React to theme changes from the toggle + OS preference (auto mode)
  const themeObserver = new MutationObserver(applyEnvForTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    if (mq.addEventListener) mq.addEventListener('change', applyEnvForTheme);
    else if (mq.addListener) mq.addListener(applyEnvForTheme); // legacy
  }

  // Lights for reflexes — neutral white for B&W tone
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 3, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-3, 1, -2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35);
  rim.position.set(0, -2, 2);
  scene.add(rim);


  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.2;
  controls.maxDistance = 3.5;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.4;
  controls.target.set(0, 0.1, 0);
  controls.update();
  controls.addEventListener('change', updateResponsiveScale);

  loadLogo();
  onResize();
  window.addEventListener('resize', onResize);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('scroll', onScrollParallax, { passive: true });
  animate();
}

// ---------- Environment cubemaps ----------
// Build an equirectangular gradient canvas → PMREM env map.
// "dark"  : moody studio with deep mids — flatters the chrome on a dark page.
// "light" : softbox-style whitebox with a subtle horizon band so the chrome
//           still reads as a defined object instead of a white blob.
function buildGradientEnv(pmrem, variant) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');

  // Vertical gradient (equirectangular V axis = sphere latitude) gives
  // a horizon-style reflection, which reads as "studio" on the chrome.
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  if (variant === 'light') {
    g.addColorStop(0.00, '#ffffff');
    g.addColorStop(0.42, '#d8d8d8');
    g.addColorStop(0.55, '#6e6e6e'); // darker horizon band for definition
    g.addColorStop(0.70, '#cfcfcf');
    g.addColorStop(1.00, '#f5f5f5');
  } else {
    g.addColorStop(0.00, '#0a0a0a');
    g.addColorStop(0.45, '#2a2a2a');
    g.addColorStop(0.55, '#4a4a4a');
    g.addColorStop(1.00, '#101010');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  // Soft overhead key highlight — a wide bright spot near the top pole.
  const hx = c.width * 0.5;
  const hy = c.height * (variant === 'light' ? 0.18 : 0.22);
  const hr = c.width * 0.35;
  const highlight = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
  if (variant === 'light') {
    highlight.addColorStop(0, 'rgba(255,255,255,0.9)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    highlight.addColorStop(0, 'rgba(255,255,255,0.18)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  return env;
}

function getEffectiveTheme() {
  const t = document.documentElement.getAttribute('data-theme') || 'auto';
  if (t === 'light' || t === 'dark') return t;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
    ? 'light'
    : 'dark';
}

function applyEnvForTheme() {
  if (!scene) return;
  const theme = getEffectiveTheme();
  const next = theme === 'light' ? envLight : envDark;
  if (next && scene.environment !== next) scene.environment = next;
  // Rebalance reflection strength so chrome reads on both backgrounds
  if (logo) {
    const intensity = theme === 'light' ? 0.9 : 1.2;
    logo.traverse((child) => {
      if (child.isMesh && child.material && 'envMapIntensity' in child.material) {
        child.material.envMapIntensity = intensity;
      }
    });
  }
}

function loadEnvironmentEXR(pmrem) {
  const exrLoader = new EXRLoader();
  exrLoader.load('/assets/img/studio.exr', (texture) => {
    // EXR is HDR in linear space; PMREM produces a filtered env map.
    // We only upgrade the dark cubemap — the EXR is a dark studio capture.
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmrem.fromEquirectangular(texture).texture;
    const previousDark = envDark;
    envDark = envMap;
    if (previousDark && previousDark.dispose) previousDark.dispose();
    applyEnvForTheme();
    texture.dispose();
  }, undefined, (err) => {
    console.warn('EXR environment failed to load, using gradient fallback', err);
  });
}

function loadLogo() {
  const loader = new FBXLoader();
  loader.load('/3D_Logo4.fbx', (object) => {
    logo = object;
    logo.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = new THREE.MeshPhysicalMaterial({
          color: 0xcccccc,
          metalness: 1.0,
          roughness: 0.12,
          envMapIntensity: 1.2,
          reflectivity: 1.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
        });
      }
    });

    const box = new THREE.Box3().setFromObject(logo);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size); box.getCenter(center);
    originalMaxAxis = Math.max(size.x, size.y, size.z);
    // Center model at origin, then nudge up slightly
    logo.position.sub(center);
    logo.position.y = -10;
    logo.position.x = -35;
    logo.position.z = -100;

    scene.add(logo);
    updateResponsiveScale();
    applyEnvForTheme();
  }, undefined, (err) => {
    console.error('Failed to load FBX', err);
  });
}

function onResize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateResponsiveScale();
}

let pointerX = 0, pointerY = 0;
function onPointerMove(e) {
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = (e.clientY / window.innerHeight) * 2 - 1;
  pointerX = x; pointerY = y;
  pointerTargetX = x; pointerTargetY = y;
}

function onScrollParallax() {
  const t = Math.min(1, window.scrollY / window.innerHeight);
  // Store a tilt value; applied during compose step in animate()
  scrollTiltX = THREE.MathUtils.lerp(scrollTiltX, -0.2 - t * 0.3, 0.1);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  if (logo) {
    // Base sinusoidal oscillation (yaw left/right, pitch out-of-phase)
    const now = performance.now() * 0.001; // seconds
    const baseY = yawAmplitude * Math.sin(now * yawSpeed);
    const baseX = pitchAmplitude * Math.sin(now * pitchSpeed + phaseOffset);
    const baseZ = 0;
    // Smooth pointer offsets
    const targetRx = pointerTargetY * 0.22;
    const targetRy = pointerTargetX * 0.32;
    pointerOffsetX += (targetRx - pointerOffsetX) * 0.08;
    pointerOffsetY += (targetRy - pointerOffsetY) * 0.08;

    logo.rotation.set(baseX + scrollTiltX + pointerOffsetX, Math.PI + baseY + pointerOffsetY, baseZ);
  }
  controls.update();
  renderer.render(scene, camera);
}

init();

function updateResponsiveScale() {
  if (!logo || !originalMaxAxis) return;
  const distance = camera.position.distanceTo(controls.target);
  const visibleHeight = 200 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const desiredFraction = window.innerWidth < 900 ? 0.2 : 0.45; // portion of viewport height
  const targetWorldSize = visibleHeight * desiredFraction;
  const s = targetWorldSize / originalMaxAxis;
  logo.scale.setScalar(s);
}


