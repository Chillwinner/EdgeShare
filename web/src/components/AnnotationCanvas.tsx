import { useEffect, useRef, useState } from 'react';
import type { AnnotationStroke } from '../types';

interface AnnotationCanvasProps {
  sharerId: string;
  mode: 'off' | 'pen' | 'laser';
  strokes: AnnotationStroke[];
  onEmitStroke: (stroke: Omit<AnnotationStroke, 'id' | 'senderId' | 'senderName' | 'createdAt'>) => void;
}

export function AnnotationCanvas({ sharerId, mode, strokes, onEmitStroke }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const currentPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const [localPreview, setLocalPreview] = useState<Array<{ x: number; y: number }>>([]);

  // Animation loop to draw fading strokes & laser pointers
  useEffect(() => {
    let raf = 0;
    const render = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const now = Date.now();

          const drawList = strokes.filter((s) => s.sharerId === sharerId && now - s.createdAt < 3800);
          for (const s of drawList) {
            const age = now - s.createdAt;
            const alpha = Math.max(0, 1 - age / 3800);
            if (s.points.length === 0) continue;

            ctx.save();
            ctx.globalAlpha = alpha;
            if (s.kind === 'laser') {
              const pt = s.points[s.points.length - 1];
              const px = pt.x * canvas.width;
              const py = pt.y * canvas.height;
              ctx.beginPath();
              ctx.arc(px, py, 8, 0, Math.PI * 2);
              ctx.fillStyle = '#fb7185';
              ctx.shadowColor = '#f43f5e';
              ctx.shadowBlur = 16;
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.strokeStyle = s.color || '#fb923c';
              ctx.lineWidth = 3.5;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.moveTo(s.points[0].x * canvas.width, s.points[0].y * canvas.height);
              for (let i = 1; i < s.points.length; i++) {
                ctx.lineTo(s.points[i].x * canvas.width, s.points[i].y * canvas.height);
              }
              ctx.stroke();
            }
            ctx.restore();
          }

          if (localPreview.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = '#fb923c';
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(localPreview[0].x * canvas.width, localPreview[0].y * canvas.height);
            for (let i = 1; i < localPreview.length; i++) {
              ctx.lineTo(localPreview[i].x * canvas.width, localPreview[i].y * canvas.height);
            }
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [strokes, sharerId, localPreview]);

  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1),
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'off') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pt = toNorm(e);
    currentPointsRef.current = [pt];
    if (mode === 'laser') {
      onEmitStroke({ sharerId, kind: 'laser', color: '#fb7185', points: [pt] });
    } else {
      setLocalPreview([pt]);
    }
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || mode === 'off') return;
    const pt = toNorm(e);
    if (mode === 'laser') {
      onEmitStroke({ sharerId, kind: 'laser', color: '#fb7185', points: [pt] });
    } else {
      currentPointsRef.current.push(pt);
      setLocalPreview([...currentPointsRef.current]);
    }
  };

  const handleUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (mode === 'pen' && currentPointsRef.current.length > 0) {
      onEmitStroke({
        sharerId,
        kind: 'stroke',
        color: '#fb923c',
        points: currentPointsRef.current,
      });
    }
    currentPointsRef.current = [];
    setLocalPreview([]);
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      className={`absolute inset-0 w-full h-full z-10 ${
        mode === 'off' ? 'pointer-events-none' : mode === 'laser' ? 'cursor-crosshair' : 'cursor-cell'
      }`}
    />
  );
}
