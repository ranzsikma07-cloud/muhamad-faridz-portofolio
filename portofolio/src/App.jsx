import { useState, useEffect, useRef } from "react";
import "./index.css";
import PillNav from "./PillNav";
import StarBorder from "./StarBorder";
import Magnet from "./Magnet";
import GlareHover from "./GlareHover";
import ClickSpark from "./ClickSpark";
import WaveformPlayer from "./WaveformPlayer";
import HalftoneReveal from "./HalftoneReveal";
import LogoLoop from "./LogoLoop";

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
  // Huruf dikelompokkan per kata supaya kata tidak terpotong di tengah saat pindah baris
  let start = 0;
  return (
    <h1 aria-label={text}>
      {text.split(" ").flatMap((word, w) => {
        const s0 = start;
        start += word.length;
        return [
          w > 0 ? " " : null,
          <span key={w} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
            {[...word].map((ch, i) => <span key={i} className="bt" style={{ animationDelay: (s0 + i) * 50 + "ms" }}>{ch}</span>)}
          </span>,
        ];
      })}
    </h1>
  );
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
  bio: "Saya Faridz, pengembang web yang tertarik pada antarmuka yang hidup dan rapi. Saya sudah membuat beberapa project nyata, mulai dari platform trading forex dan crypto, marketplace kendaraan, sampai website jasa dengan sistem login Firebase. Di luar web, saya mengembangkan game Roblox dan terus belajar lewat kelas Dicoding di bidang web, JavaScript, React, dan pengembangan mobile.",
  photo: "/foto.jpg",
  email: "faridmarwan521@gmail.com",
  github: "https://github.com/ranzsikma07-cloud", // ganti dengan link GitHub kamu
  linkedin: "https://www.linkedin.com/in/muhamad-faridz-marwan-5a3320450", // ganti dengan link LinkedIn kamu
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

function Gallery({ id, title, accent, items, zoom, cta = "Kunjungi ↗", extra }) {
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
      {extra}
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

// Fotomu tampil dulu -> kilau menyapu -> berganti ke gambar revealSrc (efek Halftone Reveal)
// -> kilau lagi -> kembali ke fotomu -> dan seterusnya (berulang). Di HP tetap fotomu.
const SHINE_MS = 2000; // lama satu kilau sampai selesai (sudah termasuk jeda awal 0,3 detik)
const PHOTO_HOLD = 4000; // fotomu ditampilkan selama ini (ms) sebelum kilau berikutnya
const ALT_HOLD = 8000; // gambar halftone ditampilkan selama ini (ms)

function PhotoReveal({ src, revealSrc, alt, theme, fallback }) {
  const [showAlt, setShowAlt] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shine, setShine] = useState(1); // kilau pertama langsung jalan saat halaman dibuka
  const hover = useRef(false);
  // Layar sentuh (HP): lingkaran yang membuka gambar asli bergerak sendiri, dan mengikuti jari saat disentuh
  const [touch] = useState(() => !window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  useEffect(() => {
    const ok = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok || !src) return;
    let alive = true, timer;
    const wait = (ms) => new Promise((r) => { timer = setTimeout(r, ms); });
    (async () => {
      let altNow = false, first = true;
      while (alive) {
        if (!first) setShine((k) => k + 1); // mulai kilau baru
        first = false;
        await wait(SHINE_MS + 100); // tunggu kilau selesai
        if (!alive) return;
        altNow = !altNow;
        if (!altNow) hover.current = false;
        setShowAlt(altNow);
        if (altNow) setMounted(true);
        await wait(altNow ? ALT_HOLD : PHOTO_HOLD);
        while (alive && hover.current) await wait(300); // jangan ganti selagi kursor main di foto
      }
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [src]);

  const dark = theme === "dark";
  return (
    <>
      <Img src={src} alt={alt} fallback={fallback} />
      {mounted && (
        <div
          className={"ht-layer" + (showAlt ? " on" : "")}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") hover.current = true; }}
          onPointerLeave={() => { hover.current = false; }}
        >
          <HalftoneReveal
            src={revealSrc || src}
            cellSize={5}
            inkColor={dark ? "#ece8e1" : "#2a1f18"}
            paperColor={dark ? "#1d1b18" : "#fffdf9"}
            accentColor={dark ? "#ee7b52" : "#c8472b"}
            revealRadius={110}
            linger={1.2}
            wander={touch}
          />
        </div>
      )}
      <span key={shine} className="shine-sweep" />
    </>
  );
}

// Logo teknologi untuk LogoLoop (Simple Icons, lisensi CC0)
const TECH_ICONS = {"html5": "M1.5 0h21l-1.91 21.563L11.977 24l-8.564-2.438L1.5 0zm7.031 9.75l-.232-2.718 10.059.003.23-2.622L5.412 4.41l.698 8.01h9.126l-.326 3.426-2.91.804-2.955-.81-.188-2.11H6.248l.33 4.171L12 19.351l5.379-1.443.744-8.157H8.531z", "css3": "M1.5 0h21l-1.91 21.563L11.977 24l-8.565-2.438L1.5 0zm17.09 4.413L5.41 4.41l.213 2.622 10.125.002-.255 2.716h-6.64l.24 2.573h6.182l-.366 3.523-2.91.804-2.956-.81-.188-2.11h-2.61l.29 3.855L12 19.288l5.373-1.53L18.59 4.414z", "javascript": "M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z", "react": "M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z", "lua": "M.38 10.377l-.272-.037c-.048.344-.082.695-.101 1.041l.275.016c.018-.34.051-.682.098-1.02zM4.136 3.289l-.184-.205c-.258.232-.509.48-.746.734l.202.188c.231-.248.476-.49.728-.717zM5.769 2.059l-.146-.235c-.296.186-.586.385-.863.594l.166.219c.27-.203.554-.399.843-.578zM1.824 18.369c.185.297.384.586.593.863l.22-.164c-.205-.271-.399-.555-.58-.844l-.233.145zM1.127 16.402l-.255.104c.129.318.274.635.431.943l.005.01.245-.125-.005-.01c-.153-.301-.295-.611-.421-.922zM.298 9.309l.269.063c.076-.332.168-.664.272-.986l-.261-.087c-.108.332-.202.672-.28 1.01zM.274 12.42l-.275.01c.012.348.04.699.083 1.043l.273-.033c-.042-.336-.069-.68-.081-1.02zM.256 14.506c.073.34.162.682.264 1.014l.263-.08c-.1-.326-.187-.658-.258-.99l-.269.056zM11.573.275L11.563 0c-.348.012-.699.039-1.044.082l.034.273c.338-.041.68-.068 1.02-.08zM23.221 8.566c.1.326.186.66.256.992l.27-.059c-.072-.34-.16-.682-.262-1.014l-.264.081zM17.621 1.389c-.309-.164-.627-.314-.947-.449l-.107.252c.314.133.625.281.926.439l.128-.242zM15.693.572c-.332-.105-.67-.199-1.01-.277l-.063.268c.332.076.664.168.988.273l.085-.264zM6.674 1.545c.298-.15.606-.291.916-.418L7.486.873c-.317.127-.632.272-.937.428l-.015.008.125.244.015-.008zM23.727 11.588l.275-.01a11.797 11.797 0 0 0-.082-1.045l-.273.033c.041.338.068.682.08 1.022zM13.654.105c-.346-.047-.696-.08-1.043-.098l-.014.273c.339.018.683.051 1.019.098l.038-.273zM9.544.527l-.058-.27c-.34.072-.681.16-1.014.264l.081.262c.325-.099.659-.185.991-.256zM1.921 5.469l.231.15c.185-.285.384-.566.592-.834l-.217-.17c-.213.276-.417.563-.606.854zM.943 7.318l.253.107c.132-.313.28-.625.439-.924l-.243-.128c-.163.307-.314.625-.449.945zM18.223 21.943l.145.234c.295-.186.586-.385.863-.594l-.164-.219c-.272.204-.557.4-.844.579zM21.248 19.219l.217.17c.215-.273.418-.561.607-.854l-.23-.148c-.186.285-.385.564-.594.832zM19.855 20.715l.184.203c.258-.23.51-.479.746-.732l-.201-.188c-.23.248-.477.488-.729.717zM22.359 17.504l.244.129c.162-.307.314-.625.449-.945l-.254-.107a11.27 11.27 0 0 1-.439.923zM23.617 13.629l.273.039c.049-.346.082-.695.102-1.043l-.275-.014c-.018.338-.051.682-.1 1.018zM23.156 15.621l.264.086c.107-.332.201-.67.279-1.01l-.268-.063c-.077.333-.169.665-.275.987zM22.453 6.672c.154.303.297.617.424.932l.256-.104c-.131-.322-.277-.643-.436-.953l-.244.125zM8.296 23.418c.331.107.67.201 1.009.279l.062-.268c-.331-.076-.663-.168-.986-.273l-.085.262zM10.335 23.889c.345.049.696.082 1.043.102l.014-.275c-.339-.018-.682-.051-1.019-.098l-.038.271zM17.326 22.449c-.303.154-.613.297-.926.424l.104.256c.318-.131.639-.275.947-.434l.004-.002-.123-.246-.006.002zM4.613 21.467c.274.213.562.418.854.605l.149-.23c-.285-.184-.565-.385-.833-.592l-.17.217zM12.417 23.725l.009.275c.348-.014.699-.041 1.045-.084l-.035-.271c-.336.041-.68.068-1.019.08zM6.37 22.604c.307.162.625.314.946.449l.107-.254c-.313-.133-.624-.279-.924-.439l-.129.244zM3.083 20.041c.233.258.48.51.734.746l.188-.201c-.249-.23-.49-.477-.717-.729l-.205.184zM14.445 23.475l.059.27c.34-.074.68-.162 1.014-.266l-.082-.262c-.325.099-.659.185-.991.258zM21.18.129A2.689 2.689 0 1 0 21.18 5.507 2.689 2.689 0 1 0 21.18.129zM15.324 15.447c0 .471.314.66.852.66.67 0 1.297-.396 1.297-1.016v-.645c-.23.107-.379.141-1.107.24-.735.109-1.042.306-1.042.761zM12 2.818c-5.07 0-9.18 4.109-9.18 9.18 0 5.068 4.11 9.18 9.18 9.18 5.07 0 9.18-4.111 9.18-9.18 0-5.07-4.11-9.18-9.18-9.18zm-2.487 13.77H5.771v-6.023h.769v5.346h2.974v.677zm4.13 0h-.619v-.67c-.405.57-.811.793-1.446.793-.843 0-1.38-.463-1.38-1.182v-3.271h.686v3c0 .52.347.85.893.85.719 0 1.181-.578 1.181-1.461v-2.389h.686v4.33zm-.53-8.393c0-1.484 1.205-2.689 2.689-2.689s2.688 1.205 2.688 2.689-1.203 2.688-2.688 2.688-2.689-1.203-2.689-2.688zm5.567 7.856v.52c-.223.059-.33.074-.471.074-.34 0-.637-.238-.711-.57-.381.406-.918.637-1.471.637-.877 0-1.422-.463-1.422-1.248 0-.527.256-.916.76-1.123.266-.107.414-.141 1.389-.264.545-.066.719-.191.719-.48v-.182c0-.412-.348-.645-.967-.645-.645 0-.957.24-1.016.77h-.693c.041-1 .686-1.404 1.734-1.404 1.066 0 1.627.412 1.627 1.182v2.412c0 .215.133.338.373.338.041-.002.074-.002.149-.017z", "roblox": "M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z", "firebase": "M19.455 8.369c-.538-.748-1.778-2.285-3.681-4.569-.826-.991-1.535-1.832-1.884-2.245a146 146 0 0 0-.488-.576l-.207-.245-.113-.133-.022-.032-.01-.005L12.57 0l-.609.488c-1.555 1.246-2.828 2.851-3.681 4.64-.523 1.064-.864 2.105-1.043 3.176-.047.241-.088.489-.121.738-.209-.017-.421-.028-.632-.033-.018-.001-.035-.002-.059-.003a7.46 7.46 0 0 0-2.28.274l-.317.089-.163.286c-.765 1.342-1.198 2.869-1.252 4.416-.07 2.01.477 3.954 1.583 5.625 1.082 1.633 2.61 2.882 4.42 3.611l.236.095.071.025.003-.001a9.59 9.59 0 0 0 2.941.568q.171.006.342.006c1.273 0 2.513-.249 3.69-.742l.008.004.313-.145a9.63 9.63 0 0 0 3.927-3.335c1.01-1.49 1.577-3.234 1.641-5.042.075-2.161-.643-4.304-2.133-6.371m-7.083 6.695c.328 1.244.264 2.44-.191 3.558-1.135-1.12-1.967-2.352-2.475-3.665-.543-1.404-.87-2.74-.974-3.975.48.157.922.366 1.315.622 1.132.737 1.914 1.902 2.325 3.461zm.207 6.022c.482.368.99.712 1.513 1.028-.771.21-1.565.302-2.369.273a8 8 0 0 1-.373-.022c.458-.394.869-.823 1.228-1.279zm1.347-6.431c-.516-1.957-1.527-3.437-3.002-4.398-.647-.421-1.385-.741-2.194-.95.011-.134.026-.268.043-.4.014-.113.03-.216.046-.313.133-.689.332-1.37.589-2.025.099-.25.206-.499.321-.74l.004-.008c.177-.358.376-.719.61-1.105l.092-.152-.003-.001c.544-.851 1.197-1.627 1.942-2.311l.288.341c.672.796 1.304 1.548 1.878 2.237 1.291 1.549 2.966 3.583 3.612 4.48 1.277 1.771 1.893 3.579 1.83 5.375-.049 1.395-.461 2.755-1.195 3.933-.694 1.116-1.661 2.05-2.8 2.708-.636-.318-1.559-.839-2.539-1.599.79-1.575.952-3.28.479-5.072zm-2.575 5.397c-.725.939-1.587 1.55-2.09 1.856-.081-.029-.163-.06-.243-.093l-.065-.026c-1.49-.616-2.747-1.656-3.635-3.01-.907-1.384-1.356-2.993-1.298-4.653.041-1.19.338-2.327.882-3.379.316-.07.638-.114.96-.131l.084-.002c.162-.003.324-.003.478 0 .227.011.454.035.677.07.073 1.513.445 3.145 1.105 4.852.637 1.644 1.694 3.162 3.144 4.515z", "vite": "m8.286 10.578.512-8.657a.306.306 0 0 1 .247-.282L17.377.006a.306.306 0 0 1 .353.385l-1.558 5.403a.306.306 0 0 0 .352.385l2.388-.46a.306.306 0 0 1 .332.438l-6.79 13.55-.123.19a.294.294 0 0 1-.252.14c-.177 0-.35-.152-.305-.369l1.095-5.301a.306.306 0 0 0-.388-.355l-1.433.435a.306.306 0 0 1-.389-.354l.69-3.375a.306.306 0 0 0-.37-.36l-2.32.536a.306.306 0 0 1-.374-.316zm14.976-7.926L17.284 3.74l-.544 1.887 2.077-.4a.8.8 0 0 1 .84.369.8.8 0 0 1 .034.783L12.9 19.93l-.013.025-.015.023-.122.19a.801.801 0 0 1-.672.37.826.826 0 0 1-.634-.302.8.8 0 0 1-.16-.67l1.029-4.981-1.12.34a.81.81 0 0 1-.86-.262.802.802 0 0 1-.165-.67l.63-3.08-2.027.468a.808.808 0 0 1-.768-.233.81.81 0 0 1-.217-.6l.389-6.57-7.44-1.33a.612.612 0 0 0-.64.906L11.58 23.691a.612.612 0 0 0 1.066-.004l11.26-20.135a.612.612 0 0 0-.644-.9z", "github": "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12", "vercel": "M24 22.525H0l12-21.05 12 21.05z", "git": "M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.379-.07 1.889.441.516.515.658 1.258.438 1.9l2.658 2.66c.645-.223 1.387-.078 1.9.435.721.72.721 1.884 0 2.604-.719.719-1.881.719-2.6 0-.539-.541-.674-1.337-.404-1.996L12.86 8.955v6.525c.176.086.342.203.488.348.713.721.713 1.883 0 2.6-.719.721-1.889.721-2.609 0-.719-.719-.719-1.879 0-2.598.182-.18.387-.316.605-.406V8.835c-.217-.091-.424-.222-.6-.401-.545-.545-.676-1.342-.396-2.009L7.636 3.7.45 10.881c-.6.605-.6 1.584 0 2.189l10.48 10.477c.604.604 1.582.604 2.186 0l10.43-10.43c.605-.603.605-1.582 0-2.187"};

function TechIcon({ name }) {
  return <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d={TECH_ICONS[name]} /></svg>;
}

// Baris 1: bahasa & framework. Baris 2: tools & platform. Tambah atau hapus sesuka kamu.
const STACK_A = [
  { node: <TechIcon name="html5" />, title: "HTML", hoverColor: "#e34f26" },
  { node: <TechIcon name="css3" />, title: "CSS", hoverColor: "#1572b6" },
  { node: <TechIcon name="javascript" />, title: "JavaScript", hoverColor: "#f0c808" },
  { node: <TechIcon name="react" />, title: "React", hoverColor: "#61dafb" },
  { node: <TechIcon name="lua" />, title: "Lua", hoverColor: "#6b6fd6" },
  { node: <TechIcon name="roblox" />, title: "Roblox Studio" },
];
const STACK_B = [
  { node: <TechIcon name="firebase" />, title: "Firebase", hoverColor: "#dd2c00" },
  { node: <TechIcon name="vite" />, title: "Vite", hoverColor: "#646cff" },
  { node: <TechIcon name="github" />, title: "GitHub" },
  { node: <TechIcon name="vercel" />, title: "Vercel" },
  { node: <TechIcon name="git" />, title: "Git", hoverColor: "#f05032" },
];

function App() {
  const [theme, setTheme] = useStored("theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  const p = PROFILE;
  const accent = theme === "dark" ? "#ee7b52" : "#c8472b";
  const initials = p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const [active, setActive] = useState("#home");
  useEffect(() => {
    // Tandai menu aktif sesuai posisi scroll. Di dasar halaman, Kontak yang aktif.
    const ids = ["home", "projects", "games", "certs", "contact"];
    const update = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) return setActive("#contact");
      let cur = "home";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.4) cur = id;
      }
      setActive("#" + cur);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
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
            <h2 style={{ marginBottom: 12 }}><Typing words={[p.role, "Full-Stack Web Developer"]} /></h2>
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
                <PhotoReveal src={p.photo} revealSrc="/gojo.jpg" alt={p.name} theme={theme} fallback={<div className="ph">Foto belum tersedia</div>} />
              </div>
              <h3>{p.name}</h3>
              <span className="muted">{p.role}</span>
              <WaveformPlayer src="/audio/shut-it-down.mp3" title="Shut It Down" artist="Drake" cover="/audio/cover.jpg" />
            </Tilt>
          </Reveal>
        </section>

        <section id="stack">
          <Reveal>
            <h2>Tools <span>yang Saya Pakai</span></h2>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 28 }}>
            <LogoLoop logos={STACK_A} speed={70} direction="left" logoHeight={44} gap={64} hoverSpeed={0} scaleOnHover labels="hover" ariaLabel="Bahasa dan framework" style={{ color: "var(--muted)", minWidth: 0 }} />
            <LogoLoop logos={STACK_B} speed={70} direction="right" logoHeight={44} gap={64} hoverSpeed={0} scaleOnHover labels="hover" ariaLabel="Tools dan platform" style={{ color: "var(--muted)", minWidth: 0 }} />
          </div>
        </section>

        <Gallery id="projects" title="Project" accent="Website" items={PROJECTS} />
        <Gallery id="games" title="Project" accent="Game Roblox" items={GAMES} cta="Main di Roblox ↗" />
        <Gallery
          id="certs"
          title="Sertifikat"
          accent="Saya"
          items={CERTS}
          zoom
          extra={
            <div style={{ marginBottom: 24 }}>
              <LogoLoop
                logos={CERTS.map((c) => ({ node: <span className="cert-chip">✓ {c.title}</span>, title: c.title }))}
                speed={40}
                direction="left"
                logoHeight={28}
                gap={14}
                hoverSpeed={0}
                ariaLabel="Kursus yang sudah diselesaikan"
                style={{ minWidth: 0 }}
              />
            </div>
          }
        />

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
    </ClickSpark>
  );
}
export default App;