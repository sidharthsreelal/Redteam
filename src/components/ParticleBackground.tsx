'use client';

import { useEffect, useRef } from 'react';

// App accent palette
const ACCENTS = [
  '#3B82F6', // signal blue
  '#EF4444', // red
  '#F97316', // orange
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#F59E0B', // amber
  '#0EA5E9', // sky
  '#14B8A6', // teal
];

// Thematic labels from the app's framework vocabulary
const LABELS = [
  "DEVIL'S ADVOCATE",
  'STEEL MAN',
  'PRE-MORTEM',
  'SECOND-ORDER',
  'BLIND SPOT',
  'BASE RATE',
  'SYNTHESIS',
  'RED TEAM',
  'THREAT VECTOR',
  'PATTERN',
  'FRAMEWORK',
  'ASSUMPTION',
  'SIGNAL',
  'RISK',
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  label?: string;
  fontSize: number;
  life: number;
  maxLife: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = () => {
      const hasLabel = Math.random() < 0.18;
      const color    = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
      const maxLife  = 280 + Math.random() * 320;
      particles.push({
        x:       Math.random() * canvas.width,
        y:       canvas.height + 20,
        vx:      (Math.random() - 0.5) * 0.4,
        vy:      -(0.35 + Math.random() * 0.75),
        size:    hasLabel ? 0 : 1 + Math.random() * 2.5,
        color,
        opacity: 0,
        label:   hasLabel ? LABELS[Math.floor(Math.random() * LABELS.length)] : undefined,
        fontSize: 8 + Math.random() * 3,
        life:    0,
        maxLife,
      });
    };

    // Seed a few particles immediately so the canvas isn't empty on first render
    for (let i = 0; i < 30; i++) {
      spawn();
      const p = particles[particles.length - 1];
      // Scatter them vertically so they don't all start at the bottom
      p.y = Math.random() * canvas.height;
      p.life = Math.floor(Math.random() * p.maxLife * 0.7);
    }

    let frame = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      frame++;
      if (frame % 7 === 0 && particles.length < 90) spawn();

      // Connection lines between nearby particles (drawn first, behind dots)
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a    = particles[i];
          const b    = particles[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < 110) {
            const alpha = (1 - dist / 110) * 0.12 * Math.min(a.opacity, b.opacity);
            ctx.globalAlpha  = alpha;
            ctx.strokeStyle  = a.color;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx + Math.sin(p.life * 0.018 + i * 0.7) * 0.35;
        p.y += p.vy;

        // Gentle fade-in / fade-out envelope
        const progress = p.life / p.maxLife;
        p.opacity =
          progress < 0.12
            ? progress / 0.12
            : progress > 0.78
            ? (1 - progress) / 0.22
            : 1;

        if (p.life >= p.maxLife || p.y < -30) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.opacity * 0.65;

        if (p.label) {
          ctx.font        = `${p.fontSize}px "GeistMono", "Courier New", monospace`;
          ctx.fillStyle   = p.color;
          ctx.letterSpacing = '0.12em';
          ctx.fillText(p.label, p.x, p.y);

          // tiny accent dot before the label
          ctx.beginPath();
          ctx.arc(p.x - 10, p.y - p.fontSize * 0.35, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Glow pulse
          const pulse = 0.6 + 0.4 * Math.sin(p.life * 0.06 + i);
          ctx.shadowBlur  = 6 * pulse;
          ctx.shadowColor = p.color;

          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();

          ctx.shadowBlur = 0;
        }
      }

      ctx.globalAlpha = 1;
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
