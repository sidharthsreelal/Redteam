'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/theme';

interface Dot {
  x: number;   // current x
  y: number;   // current y
  hx: number;  // home x
  hy: number;  // home y
  vx: number;  // velocity x
  vy: number;  // velocity y
}

const GAP = 22;    // grid spacing (px)
const BASE_R = 1.5;   // base dot draw radius
const REPEL_R = 200;   // cursor influence radius (expanded for massive area effect)
const REPEL_F = 1.3;   // repulsion force multiplier (lowered for ultra-lazy reaction)
const SPRING = 0.007; // spring-back strength (extremely low for very soft/slow return)
const DAMP = 0.85;  // velocity damping (lowered slightly so they don't drift endlessly at high speeds)

export default function GravityField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mouse = { x: -9999, y: -9999 };
    let lastMoveTime = Date.now();
    let dots: Dot[] = [];
    let animId: number;

    // --- Dot colours tuned to the app palette ---
    // Dark mode  → accent red at rest, vivid when displaced
    // Light mode → darker red
    const restColor = theme === 'dark' ? 'rgba(239,68,68,0.22)' : 'rgba(220,38,38,0.16)';
    const liveColor = theme === 'dark' ? 'rgba(239,68,68,0.85)' : 'rgba(220,38,38,0.70)';
    const glowColor = theme === 'dark' ? '#EF4444' : '#DC2626';

    const build = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      dots = [];
      for (let hx = GAP / 2; hx < canvas.width; hx += GAP) {
        for (let hy = GAP / 2; hy < canvas.height; hy += GAP) {
          dots.push({ x: hx, y: hy, hx, hy, vx: 0, vy: 0 });
        }
      }
    };

    build();
    window.addEventListener('resize', build);

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      lastMoveTime = Date.now();
    };
    const onMouseLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);

    const draw = () => {
      animId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isIdle = (Date.now() - lastMoveTime) > 100;

      for (const d of dots) {
        // Repulsion force from cursor
        const dx = d.x - mouse.x;
        const dy = d.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (!isIdle && dist < REPEL_R && dist > 0) {
          const strength = Math.pow(1 - dist / REPEL_R, 2); // quadratic falloff
          d.vx += (dx / dist) * strength * REPEL_F;
          d.vy += (dy / dist) * strength * REPEL_F;
        }

        // Spring toward home position
        d.vx += (d.hx - d.x) * SPRING;
        d.vy += (d.hy - d.y) * SPRING;

        // Dampen
        d.vx *= DAMP;
        d.vy *= DAMP;

        // Integrate
        d.x += d.vx;
        d.y += d.vy;

        // Displacement from home → controls visual intensity
        const ddx = d.x - d.hx;
        const ddy = d.y - d.hy;
        const displacement = Math.sqrt(ddx * ddx + ddy * ddy);
        const dispT = Math.min(displacement / 30, 1); // 0 = at rest, 1 = fully displaced

        // Dot radius scales with displacement
        const r = BASE_R + dispT * 1.8;

        // Glow on displaced dots
        if (dispT > 0.15) {
          ctx.shadowBlur = 6 + dispT * 10;
          ctx.shadowColor = glowColor;
        } else {
          ctx.shadowBlur = 0;
        }

        // Colour interpolation: rest → live
        ctx.fillStyle = dispT > 0.1 ? liveColor : restColor;

        ctx.beginPath();
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', build);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
