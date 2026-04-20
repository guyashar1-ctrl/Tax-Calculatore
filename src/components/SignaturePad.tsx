import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string; // base64 dataURL or empty
  onChange: (dataUrl: string) => void;
  height?: number;
}

/** Pad חתימה פשוט מבוסס canvas — תומך עכבר ומגע. */
export default function SignaturePad({ value, onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(!value);

  // Init / restore signature on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Hi-DPI scaling
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
      img.src = value;
      setEmpty(false);
    } else {
      setEmpty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = getPoint(e);
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPoint.current) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
  }

  function handleUp() {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const dataUrl = canvasRef.current?.toDataURL('image/png') || '';
    setEmpty(false);
    onChange(dataUrl);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmpty(true);
    onChange('');
  }

  return (
    <div>
      <div
        style={{
          border: '2px dashed var(--gray-300)',
          borderRadius: 'var(--radius)',
          background: 'white',
          position: 'relative',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: '100%', display: 'block', cursor: 'crosshair', borderRadius: 'var(--radius)' }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          onPointerCancel={handleUp}
        />
        {empty && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gray-400)',
              fontSize: '.875rem',
              pointerEvents: 'none',
            }}
          >
            ✍️ חתום כאן
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.5rem' }}>
        <small style={{ color: 'var(--gray-500)' }}>חתום בעזרת העכבר או האצבע</small>
        <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>נקה חתימה</button>
      </div>
    </div>
  );
}
