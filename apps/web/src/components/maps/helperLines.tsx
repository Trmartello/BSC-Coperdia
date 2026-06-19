'use client';

import React, { useEffect, useRef } from 'react';
import { type Node, type NodeChange, type ReactFlowState, useStore } from 'reactflow';
import { shallow } from 'zustand/shallow';

// Resultado do cálculo: posição "grudada" no alinhamento mais próximo + as
// coordenadas (no espaço do fluxo) onde desenhar as linhas-guia.
type HelperLinesResult = {
  horizontal?: number;
  vertical?: number;
  snapPosition: { x?: number; y?: number };
};

// Distância (em px do espaço do fluxo) dentro da qual o alinhamento é detectado.
const SNAP_DISTANCE = 6;

// Dado o card sendo arrastado (change.position) e os demais nós, encontra o
// alinhamento mais próximo nas bordas (esquerda/direita/topo/base) e devolve
// a posição "grudada" mais as linhas-guia a desenhar.
export function getHelperLines(
  change: NodeChange,
  nodes: Node[],
  distance = SNAP_DISTANCE,
): HelperLinesResult {
  const defaultResult: HelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: { x: undefined, y: undefined },
  };

  if (change.type !== 'position' || !change.position) return defaultResult;
  const nodeA = nodes.find((n) => n.id === change.id);
  if (!nodeA) return defaultResult;

  const aW = nodeA.width ?? 0;
  const aH = nodeA.height ?? 0;
  const a = {
    left: change.position.x,
    right: change.position.x + aW,
    top: change.position.y,
    bottom: change.position.y + aH,
    width: aW,
    height: aH,
  };

  let vDist = distance; // menor distância vertical encontrada (eixo X)
  let hDist = distance; // menor distância horizontal encontrada (eixo Y)

  return nodes
    .filter((n) => n.id !== nodeA.id && !n.hidden)
    .reduce<HelperLinesResult>((result, nodeB) => {
      const bW = nodeB.width ?? 0;
      const bH = nodeB.height ?? 0;
      const b = {
        left: nodeB.position.x,
        right: nodeB.position.x + bW,
        top: nodeB.position.y,
        bottom: nodeB.position.y + bH,
      };

      // ── Alinhamentos verticais (linhas | que ajudam no eixo X) ──
      // esquerda ↔ esquerda
      const dLL = Math.abs(a.left - b.left);
      if (dLL < vDist) { result.snapPosition.x = b.left; result.vertical = b.left; vDist = dLL; }
      // direita ↔ direita
      const dRR = Math.abs(a.right - b.right);
      if (dRR < vDist) { result.snapPosition.x = b.right - a.width; result.vertical = b.right; vDist = dRR; }
      // esquerda ↔ direita
      const dLR = Math.abs(a.left - b.right);
      if (dLR < vDist) { result.snapPosition.x = b.right; result.vertical = b.right; vDist = dLR; }
      // direita ↔ esquerda
      const dRL = Math.abs(a.right - b.left);
      if (dRL < vDist) { result.snapPosition.x = b.left - a.width; result.vertical = b.left; vDist = dRL; }

      // ── Alinhamentos horizontais (linhas — que ajudam no eixo Y) ──
      // topo ↔ topo
      const dTT = Math.abs(a.top - b.top);
      if (dTT < hDist) { result.snapPosition.y = b.top; result.horizontal = b.top; hDist = dTT; }
      // base ↔ base
      const dBB = Math.abs(a.bottom - b.bottom);
      if (dBB < hDist) { result.snapPosition.y = b.bottom - a.height; result.horizontal = b.bottom; hDist = dBB; }
      // topo ↔ base
      const dTB = Math.abs(a.top - b.bottom);
      if (dTB < hDist) { result.snapPosition.y = b.bottom; result.horizontal = b.bottom; hDist = dTB; }
      // base ↔ topo
      const dBT = Math.abs(a.bottom - b.top);
      if (dBT < hDist) { result.snapPosition.y = b.top - a.height; result.horizontal = b.top; hDist = dBT; }

      return result;
    }, defaultResult);
}

// ── Overlay que desenha as linhas-guia sobre o canvas do ReactFlow ──
const storeSelector = (s: ReactFlowState) => ({
  width: s.width,
  height: s.height,
  transform: s.transform,
});

export function HelperLines({
  horizontal,
  vertical,
}: {
  horizontal?: number;
  vertical?: number;
}) {
  const { width, height, transform } = useStore(storeSelector, shallow);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpi = window.devicePixelRatio || 1;
    canvas.width = width * dpi;
    canvas.height = height * dpi;
    ctx.scale(dpi, dpi);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#a855f7'; // roxo, em linha com o tema
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // transform = [translateX, translateY, zoom]
    if (typeof vertical === 'number') {
      const x = vertical * transform[2] + transform[0];
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    if (typeof horizontal === 'number') {
      const y = horizontal * transform[2] + transform[1];
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }, [width, height, transform, horizontal, vertical]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 z-10 pointer-events-none"
      style={{ width, height }}
    />
  );
}
