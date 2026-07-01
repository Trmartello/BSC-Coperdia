'use client';

import React, { useEffect, useMemo, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  MarkerType,
  NodeProps,
  Handle,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TreeNode } from '../../types';
import { formatValue } from '../../lib/utils';

// ── Custom dark card node ─────────────────────────────────────────────────────

function IndicatorNode({ data }: NodeProps) {
  const { indicator, realized, goal, estimate, onClick } = data;
  const effective = estimate ?? realized;
  const dev = goal && effective ? (((effective - goal) / Math.abs(goal)) * 100).toFixed(1) : null;
  const isGood = dev !== null
    ? (indicator.direction === 'LOWER_IS_BETTER' ? parseFloat(dev) <= 0 : parseFloat(dev) >= 0)
    : null;

  return (
    <div
      onClick={() => onClick?.(indicator.id)}
      className="bg-[#1a1f2e] border border-white/10 rounded-2xl w-[240px] cursor-pointer hover:border-purple-500/40 transition-colors shadow-lg"
    >
      <Handle type="target" position={Position.Left} style={{ background: '#6366f1', border: 'none' }} />

      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${indicator.direction === 'LOWER_IS_BETTER' ? 'bg-blue-500' : 'bg-green-500'}`} />
          <p className="text-white/80 text-sm font-semibold leading-snug">{indicator.name}</p>
        </div>
        <p className="text-white/30 text-[10px] font-mono pl-4">{indicator.code}</p>
      </div>

      <div className="grid grid-cols-3 px-4 pb-2 gap-1">
        {[
          { label: 'Realizado', val: formatValue(realized, indicator.unit, indicator.decimalPlaces ?? 2) },
          { label: 'Meta', val: formatValue(goal, indicator.unit, indicator.decimalPlaces ?? 2) },
          { label: 'Estimativa', val: formatValue(effective, indicator.unit, indicator.decimalPlaces ?? 2) },
        ].map((col) => (
          <div key={col.label}>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">{col.label}</p>
            <p className="text-sm font-bold text-white/85">{col.val}</p>
          </div>
        ))}
      </div>

      {dev !== null && (
        <div className="px-4 pb-2">
          <span className={`text-[10px] font-medium ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
            {isGood ? '▲' : '▼'} {dev}% vs meta
          </span>
        </div>
      )}

      <Handle type="source" position={Position.Right} style={{ background: '#6366f1', border: 'none' }} />
    </div>
  );
}

const nodeTypes = { indicatorNode: IndicatorNode };

// ── Layout engine ─────────────────────────────────────────────────────────────

interface FlatResult { nodes: Node[]; edges: Edge[] }

function layoutTree(
  treeNodes: TreeNode[],
  values: Map<string, { realized: number | null; goal: number | null; estimate: number | null }>,
  onClick: (id: string) => void,
): FlatResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const XGAP = 300;
  const YGAP = 200;
  const visited = new Set<string>();

  function place(node: TreeNode, col: number, row: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const v = values.get(node.id) ?? { realized: null, goal: null, estimate: null };

    nodes.push({
      id: node.id,
      type: 'indicatorNode',
      position: { x: col * XGAP, y: row * YGAP },
      data: { indicator: node, ...v, onClick },
    });

    node.children?.forEach((child, i) => {
      edges.push({
        id: `e-${node.id}-${child.id}`,
        source: child.id,
        target: node.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '6 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
      });
      place(child, col - 1, row + i);
    });
  }

  treeNodes.forEach((root, i) => place(root, treeNodes.length - 1, i * 2));

  return { nodes, edges };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  tree: TreeNode[];
  values?: Map<string, { realized: number | null; goal: number | null; estimate: number | null }>;
  onNodeClick?: (id: string) => void;
}

export function IndicatorTree({ tree, values = new Map(), onNodeClick }: Props) {
  const onClick = useCallback((id: string) => onNodeClick?.(id), [onNodeClick]);

  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => layoutTree(tree, values, onClick),
    [tree, values, onClick],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  useEffect(() => {
    const { nodes: n, edges: e } = layoutTree(tree, values, onClick);
    setNodes(n);
    setEdges(e);
  }, [tree, values, onClick, setNodes, setEdges]);

  return (
    <div className="w-full h-[600px] rounded-2xl overflow-hidden border border-white/5 bg-[#0d0f17]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        attributionPosition="bottom-right"
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e2230" gap={24} size={1} />
        <Controls
          style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
          showInteractive={false}
        />
        <MiniMap
          style={{ background: '#0d0f17', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}
          nodeColor="#1a1f2e"
          maskColor="rgba(13,15,23,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
