import { useEffect, useRef, useState } from "react";
import "./WaveformPlayer.css";

const BARS = 56;

const fmt = (t) => {
  if (!isFinite(t)) return "0:00";
  return Math.floor(t / 60) + ":" + String(Math.floor(t % 60)).padStart(2, "0");
};

// Bentuk gelombang sementara sampai file audio selesai dibaca
const fakePeaks = () => Array.from({ length: BARS }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.53)));

export default function WaveformPlayer({ src, title = "Lagu", artist = "", cover }) {
  const audioRef = useRef(null);
  const dragging = useRef(false);
  const [peaks, setPeaks] = useState(fakePeaks);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [error, setError] = useState(false);

  // Baca file audio -> hitung tinggi tiap batang gelombang
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error("not found");
        const buf = await res.arrayBuffer();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const data = await ctx.decodeAudioData(buf);
        ctx.close();
        const ch = data.getChannelData(0);
        const size = Math.floor(ch.length / BARS);
        const step = Math.max(1, Math.floor(size / 200));
        const out = [];
        for (let i = 0; i < BARS; i++) {
          let sum = 0, n = 0;
          for (let j = 0; j < size; j += step) { sum += Math.abs(ch[i * size + j]); n++; }
          out.push(sum / n);
        }
        const max = Math.max(...out) || 1;
        if (!dead) setPeaks(out.map((v) => Math.max(0.12, v / max)));
      } catch (e) {
        if (!dead) setError(true);
      }
    })();
    return () => { dead = true; };
  }, [src]);

  // Perbarui posisi dengan halus saat lagu berjalan
  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => {
      if (!dragging.current && audioRef.current) setTime(audioRef.current.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => setError(true));
    else a.pause();
  };

  const seekTo = (e) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    a.currentTime = ratio * dur;
    setTime(a.currentTime);
  };

  const onKey = (e) => {
    const a = audioRef.current;
    if (!a) return;
    if (e.key === "ArrowRight") a.currentTime = Math.min(dur, a.currentTime + 5);
    if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
    if (e.key === " ") { e.preventDefault(); toggle(); }
    setTime(a.currentTime);
  };

  const progress = dur ? time / dur : 0;

  return (
    <div className="wp">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0); }}
        onError={() => setError(true)}
      />
      <div className="wp-head">
        {cover && <img className="wp-cover" src={cover} alt={title} />}
        <div className="wp-info">
          <div className="wp-title">{title}</div>
          {artist && <div className="wp-artist">{artist}</div>}
        </div>
        <button type="button" className="wp-play" onClick={toggle} aria-label={playing ? "Jeda" : "Putar"}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={playing ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M8 5v14l11-7z"} /></svg>
        </button>
      </div>
      <div
        className="wp-wave"
        role="slider"
        tabIndex={0}
        aria-label="Posisi lagu"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(time)}
        onKeyDown={onKey}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekTo(e); }}
        onPointerMove={(e) => { if (dragging.current) seekTo(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        {peaks.map((p, i) => (
          <span key={i} className={"wp-bar" + (i / BARS < progress ? " on" : "")} style={{ height: 10 + p * 90 + "%" }} />
        ))}
        <span className="wp-dot" /><span className="wp-dot" /><span className="wp-dot" />
      </div>
      <div className="wp-times"><span>{fmt(time)}</span><span>{fmt(dur)}</span></div>
      {error && <div className="wp-err">File lagu belum ditemukan di {src}</div>}
    </div>
  );
}
