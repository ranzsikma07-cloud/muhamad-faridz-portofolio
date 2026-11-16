import { useState, useEffect, useRef } from "react";
import "./index.css";
import PillNav from "./PillNav";
import StarBorder from "./StarBorder";
import Magnet from "./Magnet";
import GlareHover from "./GlareHover";
import ClickSpark from "./ClickSpark";
import WaveformPlayer from "./WaveformPlayer";

// Hook: state yang tersimpan otomatis di browser (localStorage)
function useStored(key, initial) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch (e) { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }, [key, val]);
  return [val, setVal];
}

function Reveal({ children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { e.target.classList.add("show"); o.disconnect(); } }, { threshold: 0.15 });
    o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  return <div ref={ref} className={"reveal " + className}>{children}</div>;
}

// Kartu yang miring mengikuti mouse
function Tilt({ children, className = "" }) {
  const ref = useRef(null);
  const move = (e) => {
    const b = ref.current.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5, y = (e.clientY - b.top) / b.height - 0.5;
    ref.current.style.transform = `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
    ref.current.style.setProperty("--mx", e.clientX - b.left + "px"); ref.current.style.setProperty("--my", e.clientY - b.top + "px");
  };
  const leave = () => (ref.current.style.transform = "");
  return <div ref={ref} className={"card " + className} onMouseMove={move} onMouseLeave={leave}>{children}</div>;
}

// Teks muncul huruf per huruf dengan efek blur (ala BlurText)
function BlurText({ text }) {
  return <h1 aria-label={text}>{[...text].map((ch, i) => <span key={i} className="bt" style={{ animationDelay: i * 50 + "ms" }}>{ch === " " ? "\u00a0" : ch}</span>)}</h1>;
}

// Komponen FluxLines asli dari React Bits (MIT, David Haz), disatukan ke satu file

const MAX_COLORS = 8;
const INTRO_SECONDS = 1.8;
const FLOW = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FIELD = `
float hash(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float smin(float a, float b, float k) {
  float r = exp2(-a / k) + exp2(-b / k);
  return -k * log2(r);
}

float sinlerp(float a, float b, float w) {
  return mix(a, b, (sin(w * 3.14159265 - 3.14159265 / 2.0) + 1.0) / 2.0);
}

float vn(vec2 p, float s, float seed) {
  vec2 cellp = floor(p / s);
  vec2 relp = mod(p, s);
  float g1 = hash(vec3(cellp, seed));
  float g2 = hash(vec3(cellp.x + 1.0, cellp.y, seed));
  float g3 = hash(vec3(cellp.x + 1.0, cellp.y + 1.0, seed));
  float g4 = hash(vec3(cellp.x, cellp.y + 1.0, seed));
  float bx = sinlerp(g1, g2, relp.x / s);
  float tx = sinlerp(g4, g3, relp.x / s);
  return sinlerp(bx, tx, relp.y / s);
}

float dbn(vec2 p, float s, float seed) {
  float o = s / 2.0;
  float n0 = vn(p, s, seed);
  float n1 = vn(p + vec2(o, o), s, seed + 0.1);
  float n2 = vn(p + vec2(-o, o), s, seed + 0.2);
  float n3 = vn(p + vec2(o, -o), s, seed + 0.3);
  float n4 = vn(p + vec2(-o, -o), s, seed + 0.4);
  return (2.0 * n0 + 1.5 * n1 + 1.25 * n2 + 1.125 * n3 + n4) / 7.0;
}
`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uFlow;
uniform float uSpeed;
uniform float uScale;
uniform float uTurbulence;
uniform float uFluidity;
uniform float uRimWidth;
uniform float uSharpness;
uniform float uShimmer;
uniform float uGlow;
uniform float uLine;
uniform float uMaxHalf;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform vec4 uMagnet;
uniform vec4 uSwirl;
uniform float uReveal;
uniform float uLight;
uniform float uOpaque;
uniform vec3 uBackground;
uniform float uOpacity;
out vec4 outColor;
${FIELD}

vec3 palette(float h) {
  float x = clamp(h, 0.0, 1.0) * float(uColorCount - 1);
  int i = int(floor(x));
  int j = min(i + 1, uColorCount - 1);
  return mix(uColors[i], uColors[j], smoothstep(0.0, 1.0, x - float(i)));
}

void main() {
  float ref = 700.0 / max(uScale, 0.05);
  vec2 frag = gl_FragCoord.xy;
  vec2 toMagnet = (frag - uMagnet.xy) / uResolution.y;
  float pull = uMagnet.z * exp(-dot(toMagnet, toMagnet) / (uMagnet.w * uMagnet.w));
  if (pull > 0.001) {
    float angle = pull * 0.55;
    float c = cos(angle);
    float s = sin(angle);
    frag = uMagnet.xy + mat2(c, s, -s, c) * (frag - uMagnet.xy);
  }
  if (uSwirl.w > 0.0) {
    vec2 d = frag - uSwirl.xy;
    float reach = uSwirl.z;
    float angle = uSwirl.w * exp(-dot(d, d) / (reach * reach));
    float c = cos(angle);
    float s = sin(angle);
    frag = uSwirl.xy + mat2(c, s, -s, c) * d;
  }
  vec2 p = frag / uResolution.y * ref;

  float spd = 200.0 * uSpeed;
  float t = uTime;
  vec2 dir = uFlow;
  vec2 perp = vec2(-dir.y, dir.x);
  float distort1 = vn(p + perp * (t * spd), 60.0, 10.0) * 50.0 * uTurbulence;
  float distort2 = vn(p - perp * (t * spd), 120.0, 15.0) * 100.0 * uTurbulence;
  float peaks = dbn(p + distort1 + dir * (t * spd * 0.5), 40.0, 1.0);
  float peaks2 = dbn(p + distort2 - dir * (t * spd * 0.5), 40.0, 0.0);
  float field = smin(peaks, peaks2, max(uFluidity, 0.001));

  float slope = length(vec2(dFdx(field), dFdy(field)));
  float gap = abs(field - 0.4);
  float pixels = gap / max(slope, 1e-6);
  float halfBand = max(uRimWidth, 0.001) * 0.5;
  float across = max(gap / halfBand, pixels / uMaxHalf);
  float band = 5.0 * uRimWidth * (1.0 - across);
  float reveal = smoothstep(0.2, 0.85, pull);
  float shimmer = vn(p + dir * (t * spd * 0.5), 60.0, 12.0) * uShimmer * (1.0 - reveal * 0.75);
  float lit = clamp(band - shimmer, 0.0, 1.0);
  float glow = pow(lit, uSharpness) * uGlow * (1.0 + reveal * 0.25);
  float core = uLine > 0.0 ? smoothstep(uLine + 0.75, uLine - 0.75, pixels) * max(smoothstep(0.08, 0.6, glow), reveal) : 0.0;
  float shine = clamp(glow, 0.0, 1.0);
  float energy = max(shine * shine, core * 0.85) * uReveal;

  float h = clamp(0.5 + (peaks - peaks2) * 0.8, 0.0, 1.0);
  vec3 tint = palette(h);

  if (uLight > 0.5) {
    float chroma = max(tint.r, max(tint.g, tint.b)) - min(tint.r, min(tint.g, tint.b));
    vec3 ink = mix(vec3(0.07, 0.07, 0.08), tint * 0.55, clamp(chroma * 1.6, 0.0, 1.0));
    float cover = energy * uOpacity;
    outColor = uOpaque > 0.5 ? vec4(mix(uBackground, ink, cover), 1.0) : vec4(ink * cover, cover);
    return;
  }

  vec3 light = tint * energy * uOpacity;
  outColor = uOpaque > 0.5 ? vec4(uBackground + light, 1.0) : vec4(light, max(light.r, max(light.g, light.b)));
}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = gl => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};

const FluxLines = ({
  colors = ['#ffffff', '#ffffff', '#ffffff'],
  speed = 0.5,
  scale = 1.6,
  turbulence = 1,
  fluidity = 0.1,
  rimWidth = 0.2,
  sharpness = 2.5,
  shimmer = 1.5,
  glow = 2,
  lineWidth = 1,
  flowDirection = 'down',
  opacity = 1,
  mouseInteraction = true,
  mouseStrength = 1,
  mouseRadius = 0.35,
  mouseDampening = 0.15,
  clickSwirl = true,
  intro = true,
  lightMode = false,
  transparent = true,
  backgroundColor,
  paused = false,
  dpr,
  mixBlendMode,
  className = '',
  style,
  ...rest
}) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const wakeRef = useRef(null);
  const settings = {
    colors: Array.isArray(colors) && colors.length ? colors.slice(0, MAX_COLORS) : ['#ffffff'],
    speed,
    scale: Math.max(0.05, scale),
    turbulence,
    fluidity: Math.max(0.001, fluidity),
    rimWidth: Math.max(0.001, rimWidth),
    sharpness: Math.max(0.1, sharpness),
    shimmer: Math.max(0, shimmer),
    glow: Math.max(0, glow),
    lineWidth: Math.max(0, lineWidth),
    flow: FLOW[flowDirection] ?? FLOW.down,
    opacity: clamp(opacity, 0, 1),
    mouseInteraction,
    mouseStrength: Math.max(0, mouseStrength),
    mouseRadius: Math.max(0.01, mouseRadius),
    mouseDampening: Math.max(0, mouseDampening),
    clickSwirl,
    intro,
    lightMode,
    transparent,
    backgroundColor,
    paused,
    dpr
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!container || !canvas || !gl) return undefined;

    const program = link(gl);
    if (!program) return undefined;
    const u = program.uniforms;

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const cache = new Map();
    const parse = (value, fallback) => {
      if (!value) return fallback;
      const key = String(value);
      if (cache.has(key)) return cache.get(key);
      let rgb = fallback;
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#000000';
        probe.fillStyle = key;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        rgb = [r / 255, g / 255, b / 255];
      }
      cache.set(key, rgb);
      return rgb;
    };
    const palette = new Float32Array(MAX_COLORS * 3);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const pointer = { x: 0, y: 0, inside: false };
    const magnet = { x: 0, y: 0, active: 0 };
    const swirl = { x: 0, y: 0, age: 10 };
    let time = 0;
    let reveal = settingsRef.current.intro && !reduce ? 0 : 1;
    let raf = 0;
    let last = 0;
    let visible = true;

    const render = () => {
      const s = settingsRef.current;
      const ratio = canvas.width / Math.max(1, container.clientWidth);
      s.colors.forEach((value, index) => palette.set(parse(value, [1, 1, 1]), index * 3));
      const intro = Math.min(1, reveal);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program.program);
      gl.bindVertexArray(vao);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, time);
      gl.uniform2f(u.uFlow, s.flow[0], s.flow[1]);
      gl.uniform1f(u.uSpeed, s.speed);
      gl.uniform1f(u.uScale, s.scale);
      gl.uniform1f(u.uTurbulence, s.turbulence);
      gl.uniform1f(u.uFluidity, s.fluidity);
      gl.uniform1f(u.uRimWidth, s.rimWidth);
      gl.uniform1f(u.uSharpness, s.sharpness);
      gl.uniform1f(u.uShimmer, s.shimmer);
      gl.uniform1f(u.uGlow, s.glow);
      gl.uniform1f(u.uLine, s.lineWidth * ratio * 0.5);
      gl.uniform1f(u.uMaxHalf, 28 * ratio);
      gl.uniform3fv(u.uColors, palette);
      gl.uniform1i(u.uColorCount, s.colors.length);
      gl.uniform4f(u.uMagnet, magnet.x, magnet.y, magnet.active * s.mouseStrength, s.mouseRadius);
      const age = swirl.age;
      const twist = 1.9 * Math.min(1, age / 0.23) * Math.exp(-Math.max(0, age - 0.23) * 1.1);
      gl.uniform4f(u.uSwirl, swirl.x, swirl.y, canvas.height * 0.22 * (1 + age * 0.5), age < 6 ? twist : 0);
      gl.uniform1f(u.uReveal, intro * intro * (3 - 2 * intro));
      gl.uniform1f(u.uLight, s.lightMode ? 1 : 0);
      gl.uniform1f(u.uOpaque, s.transparent ? 0 : 1);
      gl.uniform3fv(u.uBackground, parse(s.backgroundColor, s.lightMode ? [1, 1, 1] : [0.0706, 0.0588, 0.0902]));
      gl.uniform1f(u.uOpacity, s.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = now => {
      raf = 0;
      if (!visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
      last = now;
      const motion = s.paused || reduce ? 0 : 1;
      time += dt * motion;
      swirl.age += dt;
      if (s.intro && !reduce && reveal < 1) reveal = Math.min(1, reveal + dt / INTRO_SECONDS);
      else if (!s.intro || reduce) reveal = 1;

      const engaged = s.mouseInteraction && pointer.inside;
      const follow = s.mouseDampening > 0 ? 1 - Math.exp(-dt / s.mouseDampening) : 1;
      if (engaged) {
        magnet.x += (pointer.x - magnet.x) * follow;
        magnet.y += (pointer.y - magnet.y) * follow;
      }
      const target = engaged ? 1 : 0;
      magnet.active += (target - magnet.active) * (1 - Math.exp(-dt / 0.3));
      if (Math.abs(target - magnet.active) < 0.001) magnet.active = target;

      render();
      const busy = motion > 0 || magnet.active !== target || reveal < 1 || swirl.age < 6;
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const resize = () => {
      const s = settingsRef.current;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const ratio = Math.min(s.dpr || window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      render();
      wake();
    };

    const locate = event => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const ratio = canvas.width / Math.max(1, rect.width);
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x * ratio;
      pointer.y = (rect.height - y) * ratio;
    };

    const onPointerMove = event => {
      const wasInside = pointer.inside;
      locate(event);
      if (pointer.inside && !wasInside && magnet.active < 0.05) {
        magnet.x = pointer.x;
        magnet.y = pointer.y;
      }
      wake();
    };

    const onPointerDown = event => {
      onPointerMove(event);
      if (!pointer.inside || !settingsRef.current.clickSwirl || reduce) return;
      swirl.x = pointer.x;
      swirl.y = pointer.y;
      swirl.age = 0;
      wake();
    };

    const onPointerUp = event => {
      if (event.pointerType !== 'mouse') pointer.inside = false;
    };

    const onPointerLeave = () => {
      pointer.inside = false;
    };

    const onVisibility = () => {
      last = 0;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(container);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    let lastDpr = settingsRef.current.dpr;
    wakeRef.current = () => {
      const s = settingsRef.current;
      if (s.dpr !== lastDpr) {
        lastDpr = s.dpr;
        resize();
        return;
      }
      if (!raf) render();
      wake();
    };

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(program.program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      if (!canvas.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  useEffect(() => {
    wakeRef.current?.();
  });

  return (
    <div
      ref={containerRef}
      className={`flux-lines-container${className ? ` ${className}` : ''}`}
      style={mixBlendMode ? { ...style, mixBlendMode } : style}
      {...rest}
    >
      <canvas ref={canvasRef} className="flux-lines-canvas" aria-hidden="true" />
    </div>
  );
};


function Typing({ words }) {
  const [i, setI] = useState(0), [n, setN] = useState(0), [del, setDel] = useState(false);
  useEffect(() => {
    const w = words[i];
    const t = setTimeout(() => {
      if (!del && n < w.length) setN(n + 1);
      else if (!del) setDel(true);
      else if (n > 0) setN(n - 1);
      else { setDel(false); setI((i + 1) % words.length); }
    }, !del && n === w.length ? 1300 : del ? 40 : 90);
    return () => clearTimeout(t);
  }, [n, del, i]);
  return <span className="grad">{words[i].slice(0, n)}<span className="cursor">&nbsp;</span></span>;
}

// ============================================================
//  EDIT DATA KAMU DI SINI SAJA
//  Foto & gambar taruh di folder  public/  lalu tulis path-nya
//  (contoh: file public/foto.jpg  ->  "/foto.jpg")
// ============================================================
const PROFILE = {
  name: "Muhamad Faridz Marwan",
  role: "Web Developer & Game Developer",
  bio: "Saya Muhamad Faridz Marwan, pengembang web yang tertarik pada antarmuka yang hidup dan rapi. Saya sudah membuat beberapa project nyata, mulai dari platform trading forex dan crypto, marketplace kendaraan, sampai website jasa dengan sistem login Firebase. Di luar web, saya mengembangkan game Roblox dan terus belajar lewat kelas Dicoding di bidang web, JavaScript, React, dan pengembangan mobile.",
  photo: "/foto.jpg",
  email: "faridmarwan521@gmail.com",
  github: "https://github.com/ranzsikma07-cloud", // ganti dengan link GitHub kamu
  linkedin: "https://www.linkedin.com/in/muhamad-faridz-marwan-5a3320450 ", // ganti dengan link LinkedIn kamu
  x: "https://x.com/Reyaja01", // ganti dengan link X kamu
  discord: "https://discord.com/users/ranzsikma", // link profil/invite Discord, atau cukup username (contoh: "namakamu")
};

const PROJECTS = [
  { id: 1, title: "Vantage Markets", desc: "Platform trading Forex dan Crypto dalam satu dashboard: chart, order book, panel order dengan leverage dan TP/SL, kalkulator risiko, kalender ekonomi, dompet, dan riwayat transaksi. Login memakai Firebase Authentication. Dibuat dengan HTML, CSS, JavaScript, dan Firebase..", link: "https://markets-forexx.vercel.app", img: "/projects/project1.jpg" },
  { id: 2, title: "ZIXON, Marketplace Kendaraan Premium", desc: "Website jual beli mobil dan motor premium dengan katalog yang bisa difilter dan diurutkan, perbandingan hingga 3 unit, detail kendaraan (spesifikasi, riwayat servis, inspeksi 150 titik, virtual tour), simulasi kredit, dan formulir tukar tambah. Dibuat dengan HTML, CSS, dan JavaScript.", link: "https://jual-mobil-tukar-tambah.vercel.app/", img: "/projects/project2.jpg" },
  { id: 3, title: "ZIXON Studio", desc: "Website jasa pembuatan website dan animasi dengan desain hitam-putih yang modern. Ada katalog paket, formulir pesan jasa yang tersambung ke WhatsApp, autentikasi pengguna dengan Firebase (email/kata sandi dan Google), halaman profil, dan galeri portofolio. Dibuat dengan HTML, CSS, JavaScript, dan Firebase.", link: "https://website-jasa-two.vercel.app/", img: "/projects/project3.jpg" },
];

// Game Roblox buatan kamu. Gambar thumbnail taruh di public/games/ (rasio 16:9 paling pas)
const GAMES = [
  { id: 1, title: "SAKURA RNG", desc: "Jelajahi Pulau Sakura bergaya anime! Tekan dadu GRATIS untuk mendapatkan karakter dari Common sampai MYTHIC, lalu bertarung melawan monster di 4 zona: Desa Sakura, Gunung Berapi, Puncak Salju, dan Kota Neon.", link: "https://www.roblox.com/games/126884597801768", img: "/games/rng.jpg" },
];

const NAV = [
  { label: "Home", href: "#home" },
  { label: "Project", href: "#projects" },
  { label: "Game", href: "#games" },
  { label: "Sertifikat", href: "#certs" },
  { label: "Kontak", href: "#contact" },
];

const CERTS = [
  // Isi "link" dengan link verifikasi Dicoding (contoh: "https://www.dicoding.com/certificates/KODE") bila ingin ada tombol Verifikasi
  { id: 1, title: "Belajar Dasar Pengembangan Aplikasi Mobile", desc: "Dicoding Indonesia · 03 Agustus 2026", link: "", img: "/sertifikat/mobile.jpg" },
  { id: 2, title: "Belajar Membuat Aplikasi Web dengan React", desc: "Dicoding Indonesia · 01 Agustus 2026", link: "", img: "/sertifikat/react.jpg" },
  { id: 3, title: "Prompt Engineering untuk Software Developer", desc: "Dicoding Indonesia · 26 Juli 2026", link: "", img: "/sertifikat/prompt-engineering.jpg" },
  { id: 4, title: "Belajar Dasar Pemrograman JavaScript", desc: "Dicoding Indonesia · 25 Juli 2026", link: "", img: "/sertifikat/javascript.jpg" },
  { id: 5, title: "Belajar Dasar Pemrograman Web", desc: "Dicoding Indonesia · 24 Juli 2026", link: "", img: "/sertifikat/web.jpg" },
];
// ============================================================

// Logo brand (Simple Icons, lisensi CC0)
const ICONS = {"x": "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z", "discord": "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z", "linkedin": "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z", "github": "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"};

function Icon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

function Social({ name, label, href }) {
  const [copied, setCopied] = useState(false);
  if (!href) return null;
  const isLink = /^https?:\/\//i.test(href);
  if (!isLink) {
    // bukan link (mis. username Discord): klik untuk menyalin
    return (
      <button type="button" className="btn ico" onClick={() => { try { navigator.clipboard.writeText(href); } catch (e) {} setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        <Icon name={name} />{copied ? "Disalin!" : label}
      </button>
    );
  }
  return <a className="btn ico" href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><Icon name={name} />{label}</a>;
}

function Img({ src, alt, fallback }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <>{fallback}</>;
  return <img src={src} alt={alt} onError={() => setBad(true)} />;
}

function Gallery({ id, title, accent, items, zoom, cta = "Kunjungi ↗" }) {
  const [view, setView] = useState(null);
  const n = items.length;
  useEffect(() => {
    if (view === null) return;
    const key = (e) => {
      if (e.key === "Escape") setView(null);
      if (e.key === "ArrowRight") setView((v) => (v + 1) % n);
      if (e.key === "ArrowLeft") setView((v) => (v - 1 + n) % n);
    };
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = ""; };
  }, [view, n]);
  const cur = view !== null ? items[view] : null;

  return (
    <section id={id}>
      <Reveal>
        <h2>{title} <span>{accent}</span></h2>
      </Reveal>
      <div className="grid">
        {items.map((it, i) => (
          <Reveal key={it.id}>
            <Tilt className={"item" + (zoom ? " cert" : "")}>
              {zoom ? (
                <button type="button" className="thumb" onClick={() => setView(i)} aria-label={"Perbesar " + it.title}>
                  <Img src={it.img} alt={it.title} fallback="Gambar belum tersedia" />
                </button>
              ) : (
                <a className="thumb" href={it.link || undefined} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", cursor: it.link ? "pointer" : "default" }}>
                  <Img src={it.img} alt={it.title} fallback="Gambar belum tersedia" />
                </a>
              )}
              <div className="body">
                <h4>{it.title}</h4>
                <p className="muted">{it.desc}</p>
                <div className="row">
                  {zoom && <button type="button" className="btn" onClick={() => setView(i)}>Perbesar</button>}
                  {it.link && <a className="btn" href={it.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>{zoom ? "Verifikasi ↗" : cta}</a>}
                </div>
              </div>
            </Tilt>
          </Reveal>
        ))}
      </div>
      {cur && (
        <div className="lb" onClick={() => setView(null)} role="dialog" aria-modal="true">
          <button type="button" className="lb-x" onClick={() => setView(null)} aria-label="Tutup">✕</button>
          {n > 1 && <button type="button" className="lb-nav lb-prev" onClick={(e) => { e.stopPropagation(); setView((view - 1 + n) % n); }} aria-label="Sebelumnya">‹</button>}
          <figure onClick={(e) => e.stopPropagation()}>
            <img key={cur.id} src={cur.img} alt={cur.title} />
            <figcaption>{cur.title} · {cur.desc}</figcaption>
          </figure>
          {n > 1 && <button type="button" className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); setView((view + 1) % n); }} aria-label="Berikutnya">›</button>}
        </div>
      )}
    </section>
  );
}

function App() {
  const [theme, setTheme] = useStored("theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  const p = PROFILE;
  const accent = theme === "dark" ? "#ee7b52" : "#c8472b";
  const initials = p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [active, setActive] = useState("#home");
  useEffect(() => {
    const els = ["home", "projects", "games", "certs", "contact"].map((i) => document.getElementById(i)).filter(Boolean);
    const o = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive("#" + e.target.id); }), { rootMargin: "-40% 0px -55% 0px" });
    els.forEach((el) => o.observe(el));
    return () => o.disconnect();
  }, []);

  return (
    <ClickSpark sparkColor={accent} sparkCount={10} sparkSize={12} sparkRadius={28} duration={550}>
      <div className="bg">
        <FluxLines colors={theme === "dark" ? ["#ee7b52", "#c9953a", "#c8472b"] : ["#111111", "#111111", "#111111"]} lightMode={theme !== "dark"} speed={0.4} opacity={0.8} />
      </div>
      <header className="topbar">
        <div className="topbar-nav">
          <PillNav
            logo={<span className="mark-text">{initials}</span>}
            logoAlt="Beranda"
            logoHref="#home"
            items={NAV}
            activeHref={active}
            theme={theme}
            highlightColor={theme === "dark" ? "#ee7b52" : "#c8472b"}
          />
        </div>
        <button className="btn theme-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Ganti tema">{theme === "dark" ? "☀" : "☾"}</button>
      </header>
      <main>
        <section className="hero" id="home">
          <Reveal>
            <p className="muted" style={{ margin: 0 }}>Halo, saya</p>
            <BlurText text={p.name} />
            <h2 style={{ marginBottom: 12 }}><Typing words={[p.role, "Front-End Developer", "React Enthusiast"]} /></h2>
            <p className="muted">{p.bio}</p>
            <div className="row hero-actions">
              <Magnet padding={90} magnetStrength={4}>
                <StarBorder
                  as="a"
                  href="#projects"
                  theme={theme}
                  radius={999}
                  duration={5}
                  color={theme === "dark" ? "#fff1dc" : "#ffd98a"}
                  backgroundColor={accent}
                  textColor="#ffffff"
                  style={{ fontSize: ".9rem", textDecoration: "none" }}
                >
                  Lihat Project
                </StarBorder>
              </Magnet>
              <Magnet padding={90} magnetStrength={4}>
                <GlareHover
                  borderRadius="999px"
                  borderColor="var(--border)"
                  glareColor={theme === "dark" ? "#ffffff" : "#d9a441"}
                  glareOpacity={theme === "dark" ? 0.35 : 0.55}
                  blendMode={theme === "dark" ? "screen" : "multiply"}
                >
                  <a className="btn big" href="#contact" style={{ textDecoration: "none", display: "inline-block" }}>Hubungi Saya</a>
                </GlareHover>
              </Magnet>
            </div>
          </Reveal>
          <Reveal>
            <Tilt className="photo">
              <div className="frame" style={{ cursor: "default" }}>
                <Img src={p.photo} alt={p.name} fallback={<div className="ph">Foto belum tersedia</div>} />
              </div>
              <h3>{p.name}</h3>
              <span className="muted">{p.role}</span>
              <WaveformPlayer src="/audio/shut-it-down.mp3" title="Shut It Down" artist="Drake" cover="/audio/cover.jpg" />
            </Tilt>
          </Reveal>
        </section>

        <Gallery id="projects" title="Project" accent="Website" items={PROJECTS} />
        <Gallery id="games" title="Project" accent="Game Roblox" items={GAMES} cta="Main di Roblox ↗" />
        <Gallery id="certs" title="Sertifikat" accent="Saya" items={CERTS} zoom />

        <section id="contact">
          <Reveal>
            <Tilt className="add">
              <h2 style={{ margin: 0 }}>Hubungi <span>Saya</span></h2>
              <p className="muted" style={{ margin: 0 }}>Tertarik bekerja sama? Hubungi saya lewat:</p>
              <div className="row">
                <a className="btn primary ico" href={"mailto:" + p.email} style={{ textDecoration: "none" }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" style={{ fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
                  {p.email}
                </a>
                <Social name="x" label="X" href={p.x} />
                <Social name="discord" label="Discord" href={p.discord} />
                <Social name="linkedin" label="LinkedIn" href={p.linkedin} />
                <Social name="github" label="GitHub" href={p.github} />
              </div>
            </Tilt>
          </Reveal>
        </section>
      </main>
      <footer>© {new Date().getFullYear()} {p.name}. Dibuat dengan ♥️</footer>
    </ClickSpark>
  );
}
export default App;
