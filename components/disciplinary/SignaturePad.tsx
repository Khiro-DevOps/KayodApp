"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenTool, Type } from "lucide-react";

export interface SignaturePadProps {
  /** Pre-filled full name for the Type Signature mode (e.g. HR Admin or Employee name) */
  defaultName?: string;
  /** Optional field label above the signature pad */
  label?: string;
  /** Explicit legal disclaimer shown beneath the signature canvas */
  disclaimer?: string;
  /** Emits a transparent PNG data URL when signed, or null when cleared/empty */
  onChange: (dataUrl: string | null) => void;
  /** Compact height for dense HR modals */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

type SignatureMode = "draw" | "type";

const INK_COLOR = "#1C1A4E";

/**
 * Renders a typed full-name signature onto an offscreen transparent PNG canvas
 * so both Draw and Type modes produce a uniform PNG data URL for pdf-lib embedding.
 */
function renderTypedSignatureToPng(name: string, width = 560, height = 140): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 2, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // Fit font size dynamically to canvas width
  let fontSize = 42;
  const maxTextWidth = width - 32;
  const fontFamily = '"Brush Script MT", "Segoe Script", "Apple Chancery", Georgia, serif';

  ctx.font = `italic 600 ${fontSize}px ${fontFamily}`;
  while (ctx.measureText(trimmed).width > maxTextWidth && fontSize > 18) {
    fontSize -= 2;
    ctx.font = `italic 600 ${fontSize}px ${fontFamily}`;
  }

  ctx.fillStyle = INK_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(trimmed, width / 2, height / 2);

  return canvas.toDataURL("image/png");
}

export default function SignaturePad({
  defaultName = "",
  label = "Digital Signature",
  disclaimer,
  onChange,
  compact = false,
  disabled = false,
  className = "",
}: SignaturePadProps) {
  const [mode, setMode] = useState<SignatureMode>("draw");
  const [typedName, setTypedName] = useState(defaultName);
  const [hasDrawn, setHasDrawn] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const strokesRef = useRef<Array<Array<{ x: number; y: number }>>>([]);

  const canvasHeight = compact ? 116 : 144;

  // Keep typedName synced if defaultName updates before user edits
  useEffect(() => {
    if (defaultName && !typedName) {
      setTypedName(defaultName);
    }
  }, [defaultName, typedName]);

  const redrawStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const logicalWidth = canvas.width / dpr;
    const logicalHeight = canvas.height / dpr;

    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    ctx.strokeStyle = INK_COLOR;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      if (stroke.length === 1) {
        ctx.lineTo(stroke[0].x + 0.1, stroke[0].y + 0.1);
      } else {
        for (let i = 1; i < stroke.length; i += 1) {
          ctx.lineTo(stroke[i].x, stroke[i].y);
        }
      }
      ctx.stroke();
    }
  }, []);

  // ResizeObserver keeps canvas crisp on desktop and 375px+ mobile viewports
  useEffect(() => {
    if (mode !== "draw") return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.floor(rect.width * dpr);
      const targetH = Math.floor(canvasHeight * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        redrawStrokes();
      }
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [mode, canvasHeight, redrawStrokes]);

  // Emit PNG dataUrl whenever mode or typedName changes
  useEffect(() => {
    if (mode === "type") {
      onChange(renderTypedSignatureToPng(typedName));
    } else {
      if (!hasDrawn || !canvasRef.current) {
        onChange(null);
      } else {
        onChange(canvasRef.current.toDataURL("image/png"));
      }
    }
  }, [mode, typedName, hasDrawn, onChange]);

  const getLocalCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getLocalCoords(e);
    isDrawingRef.current = true;
    lastPointRef.current = pt;
    strokesRef.current.push([pt]);

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = INK_COLOR;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(pt.x + 0.1, pt.y + 0.1);
      ctx.stroke();
    }
    if (!hasDrawn) setHasDrawn(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    e.preventDefault();
    const pt = getLocalCoords(e);
    const prev = lastPointRef.current;
    const ctx = canvasRef.current?.getContext("2d");

    if (ctx && prev) {
      ctx.strokeStyle = INK_COLOR;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }

    const currentStroke = strokesRef.current[strokesRef.current.length - 1];
    if (currentStroke) currentStroke.push(pt);
    lastPointRef.current = pt;
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (canvasRef.current && strokesRef.current.length > 0) {
      setHasDrawn(true);
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    if (disabled) return;
    if (mode === "draw") {
      strokesRef.current = [];
      setHasDrawn(false);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      }
      onChange(null);
    } else {
      setTypedName("");
      onChange(null);
    }
  };

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Header Row: Label + Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
          {label}
        </span>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("draw")}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              mode === "draw"
                ? "bg-white text-[#1C1A4E] shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <PenTool className="h-3.5 w-3.5" />
            Draw
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMode("type")}
            className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              mode === "type"
                ? "bg-white text-[#1C1A4E] shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Type className="h-3.5 w-3.5" />
            Type
          </button>
        </div>
      </div>

      {/* Canvas / Type Surface */}
      {mode === "draw" ? (
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            style={{ height: `${canvasHeight}px` }}
            className={`block w-full touch-none select-none ${
              disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"
            }`}
          />

          {/* Baseline guide */}
          <div className="pointer-events-none absolute inset-x-5 bottom-6 border-b border-dashed border-slate-200" />

          {!hasDrawn && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">
              Sign here with mouse or finger
            </span>
          )}

          {hasDrawn && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2 top-2 inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-xs transition hover:border-slate-300 hover:text-slate-900"
            >
              <Eraser className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={typedName}
              disabled={disabled}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Type your full name"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1C1A4E] focus:bg-white focus:outline-none"
            />
            {typedName && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Eraser className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          <div
            style={{ height: `${compact ? 72 : 88}px` }}
            className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4"
          >
            {typedName.trim().length >= 2 ? (
              <span
                style={{
                  fontFamily:
                    '"Brush Script MT", "Segoe Script", "Apple Chancery", Georgia, serif',
                }}
                className="truncate text-2xl font-semibold italic text-[#1C1A4E] sm:text-3xl"
              >
                {typedName.trim()}
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                Electronic signature preview
              </span>
            )}
          </div>
        </div>
      )}

      {disclaimer && (
        <p className="rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          {disclaimer}
        </p>
      )}
    </div>
  );
}
