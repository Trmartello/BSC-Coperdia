'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  addEdge, Connection, MarkerType, Position,
  NodeProps, Handle, Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, Save, Plus, TrendingUp, TrendingDown, Pencil } from 'lucide-react';
import { mapsApi, indicatorsApi } from '../../../../lib/api';
import { IndicatorMap, MapEntry } from '../../../../types/maps';
import { cn, formatValue } from '../../../../lib/utils';
import { IndicatorDetailPanel } from '../../../../components/indicators/IndicatorDetailPanel';
import { IndicatorFormPanel } from '../../../../components/indicators/IndicatorFormPanel';
import { toast } from 'sonner';

// ─── Indicator Node ───────────────────────────────────────────────────────────

function MapIndicatorNode({ data, selected }: NodeProps) {
  const { indicator, realized, goal, estimate } = data;
  const effective = estimate ?? realized;
  const dev = goal && effective != null && goal !== 0
    ? ((effective - goal) / Math.abs(goal)) * 100 : null;
  const isGood = dev === null ? null
    : (indicator.direction === 'LOWER_IS_BETTER' ? dev <= 0 : dev >= 0);

  return (
    <div className={cn(
      'bg-[#1a1f2e] border rounded-2xl w-[220px] shadow-xl transition-all cursor-pointer',
      selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-white/10 hover:border-white/25',
    )}>
      <Handle type="target" position={Position.Left}
        style={{ background: '#6366f1', border: 'none', width: 10, height: 10 }} />

      <div className="px-3 pt-3 pb-2">
        <p className="text-[9px] font-mono text-white/30 uppercase tracking-wider">{indicator.code}</p>
        <p className="text-sm font-semibold text-white/85 leading-snug">{indicator.name}</p>
        <p className="text-[10px] text-white/30 mt-0.5">{indicator.category}</p>
      </div>

      <div className="grid grid-cols-3 px-3 pb-2 gap-1">
        {[
          { label: 'Real.', val: formatValue(realized, indicator.unit) },
          { label: 'Meta', val: formatValue(goal, indicator.unit) },
          { label: 'Est.', val: formatValue(effective, indicator.unit) },
        ].map((col) => (
          <div key={col.label} className="text-center">
            <p className="text-[8px] text-white/25 uppercase">{col.label}</p>
            <p className="text-xs font-bold text-white/80">{col.val}</p>
          </div>
        ))}
      </div>

      {dev !== null && (
        <div className={cn('px-3 pb-1.5 text-[10px] font-medium flex items-center gap-1',
          isGood ? 'text-emerald-400' : 'text-red-400')}>
          {isGood ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(dev).toFixed(1)}% vs meta
        </div>
      )}

      <div className="px-3 pb-2.5 flex items-center gap-1.5">
        <div className={cn('w-2 h-2 rounded-sm',
          indicator.direction === 'LOWER_IS_BETTER' ? 'bg-blue-500' : 'bg-emerald-500')} />
        <p className="text-[9px] text-white/25">
          {indicator.direction === 'LOWER_IS_BETTER' ? 'Quanto menor melhor' : 'Quanto maior melhor'}
        </p>
      </div>

      <Handle type="source" position={Position.Right}
        style={{ background: '#6366f1', border: 'none', width: 10, height: 10 }} />
    </div>
  );
}

const nodeTypes = { mapIndicator: MapIndicatorNode };

// ─── Build nodes/edges ────────────────────────────────────────────────────────

function buildNodesAndEdges(entries: MapEntry[], savedFlow?: any) {
  const nodes: Node[] = entries.map((entry, i) => {
    const savedNode = savedFlow?.nodes?.find((n: any) => n.id === entry.indicatorId);
    const ind = entry.indicator;
    const realized = ind.realizedValues?.[0]?.value ? parseFloat(ind.realizedValues[0].value) : null;
    const goal = ind.goals?.[0]?.value ? parseFloat(ind.goals[0].value) : null;
    const estimate = ind.forecastValues?.[0]?.value ? parseFloat(ind.forecastValues[0].value) : null;

    return {
      id: entry.indicatorId,
      type: 'mapIndicator',
      position: savedNode?.position ?? { x: (i % 3) * 280, y: Math.floor(i / 3) * 220 },
      data: { indicator: ind, realized, goal, estimate },
    };
  });

  const edges: Edge[] = [];
  const allIds = new Set(entries.map((e) => e.indicatorId));
  for (const entry of entries) {
    for (const rel of entry.indicator.children ?? []) {
      if (rel.child?.id && allIds.has(rel.child.id)) {
        edges.push({
          id: `e-${rel.child.id}-${entry.indicatorId}`,
          source: rel.child.id,
          target: entry.indicatorId,
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        });
      }
    }
  }

  return { nodes, edges };
}

// ─── Add Indicator Panel ──────────────────────────────────────────────────────

function IndicatorRow({ ind, onMap, onAdd, onEdit }: {
  ind: any; onMap?: boolean; onAdd?: () => void; onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
      <span className="text-[10px] font-mono text-white/30 w-14 flex-shrink-0">{ind.code}</span>
      <span className="text-sm text-white/70 truncate flex-1">{ind.name}</span>
      <button onClick={onEdit} title="Editar cadastro" className="text-white/30 hover:text-white/80">
        <Pencil size={12} />
      </button>
      {!onMap && onAdd && (
        <button onClick={onAdd} title="Adicionar ao mapa" className="text-white/30 hover:text-emerald-400">
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

function ManageIndicatorsPanel({ existingIds, onAdd, onCreateNew, onEdit, onClose }: {
  existingIds: Set<string>;
  onAdd: (id: string) => void;
  onCreateNew: () => void;
  onEdit: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const { data: allInds = [] } = useQuery({
    queryKey: ['indicators'],
    queryFn: () => indicatorsApi.list().then((r) => r.data),
  });

  const q = search.toLowerCase();
  const match = (ind: any) =>
    ind.name.toLowerCase().includes(q) || ind.code.toLowerCase().includes(q);
  const list = allInds as any[];
  const onMapList = list.filter((i) => existingIds.has(i.id) && match(i));
  const available = list.filter((i) => !existingIds.has(i.id) && match(i));

  return (
    <div className="absolute top-14 right-4 z-10 w-80 bg-[#1a1f2e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-white/5 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Gerenciar Indicadores</p>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 text-xs">✕</button>
      </div>
      <div className="p-3 border-b border-white/5 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar indicador..."
          autoFocus
          className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none"
        />
        <button
          onClick={onCreateNew}
          className="w-full flex items-center justify-center gap-2 bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs py-2 rounded-lg hover:bg-purple-600/30"
        >
          <Plus size={13} /> Criar novo indicador
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {onMapList.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-white/30">
              No mapa ({onMapList.length})
            </p>
            {onMapList.map((ind) => (
              <IndicatorRow key={ind.id} ind={ind} onMap onEdit={() => onEdit(ind.id)} />
            ))}
          </>
        )}
        <p className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-white/30">
          Disponíveis ({available.length})
        </p>
        {available.slice(0, 40).map((ind) => (
          <IndicatorRow
            key={ind.id}
            ind={ind}
            onAdd={() => onAdd(ind.id)}
            onEdit={() => onEdit(ind.id)}
          />
        ))}
        {available.length === 0 && onMapList.length === 0 && (
          <p className="text-center text-xs text-white/30 py-6">Nenhum indicador encontrado.</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Map Editor ──────────────────────────────────────────────────────────

export default function MapEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });

  const { data: map, isLoading } = useQuery<IndicatorMap>({
    queryKey: ['map', id],
    queryFn: () => mapsApi.get(id).then((r) => r.data),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!map?.entries) return;
    const { nodes: n, edges: e } = buildNodesAndEdges(map.entries, map.flowData);
    setNodes(n);
    setEdges(e);
  }, [map]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({
          ...params, type: 'smoothstep', animated: false,
          style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        }, eds),
      ),
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedIndicatorId((prev) => prev === node.id ? null : node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedIndicatorId(null);
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => mapsApi.saveLayout(id, { nodes, edges }).then((r) => r.data),
    onSuccess: () => toast.success('Layout salvo'),
  });

  const addIndMutation = useMutation({
    mutationFn: (indicatorId: string) => mapsApi.addIndicator(id, indicatorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['map', id] });
      toast.success('Indicador adicionado ao mapa');
      setShowAddPanel(false);
    },
  });

  if (isLoading) return <div className="h-full bg-[#0d0f17] animate-pulse rounded-2xl" />;

  const existingIds = new Set(map?.entries?.map((e) => e.indicatorId) ?? []);

  // Detect current period from first available realized value
  const currentPeriod = (() => {
    for (const entry of map?.entries ?? []) {
      if (entry.indicator?.realizedValues?.[0]?.period) {
        return entry.indicator.realizedValues[0].period;
      }
    }
    return new Date().toISOString().slice(0, 10);
  })();

  return (
    <div className="flex flex-col h-[calc(100vh-56px-48px)]">
      {/* ── Topbar ── */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.push('/dashboard/maps')}
          className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft size={14} />
          Mapas
        </button>
        <span className="text-white/20">/</span>
        <h1 className="text-white font-semibold">{map?.name}</h1>
        {map?.category && (
          <span className="text-[10px] px-2.5 py-1 rounded-full border border-white/10 text-white/40">
            {map.category.name}
          </span>
        )}
        {selectedIndicatorId && (
          <span className="text-[10px] text-white/30 italic">
            · clique no canvas para fechar o painel
          </span>
        )}
        <div className="flex-1" />
        <div className="relative">
          <button
            onClick={() => setShowAddPanel((s) => !s)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/60 hover:text-white/80 transition-colors"
          >
            <Plus size={13} />
            Gerenciar indicadores
          </button>
          {showAddPanel && (
            <ManageIndicatorsPanel
              existingIds={existingIds}
              onAdd={(indId) => addIndMutation.mutate(indId)}
              onCreateNew={() => {
                setShowAddPanel(false);
                setIndicatorForm({ open: true, editId: null });
              }}
              onEdit={(indId) => {
                setShowAddPanel(false);
                setIndicatorForm({ open: true, editId: indId });
              }}
              onClose={() => setShowAddPanel(false)}
            />
          )}
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50 transition-colors"
        >
          <Save size={13} />
          {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* ── Canvas + Detail Panel ── */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex-1 rounded-2xl overflow-hidden border border-white/5 bg-[#0d0f17]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode="Delete"
          >
            <Background color="#1a1f2e" gap={24} size={1} />
            <Controls
              style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
              showInteractive={false}
            />
            <MiniMap
              style={{ background: '#0d0f17', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}
              nodeColor="#1e2538"
              maskColor="rgba(13,15,23,0.7)"
            />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="mt-20 text-center text-white/20 pointer-events-none">
                  <p className="text-sm">Nenhum indicador neste mapa.</p>
                  <p className="text-xs mt-1">Use "Adicionar indicador" para começar.</p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Indicator Detail Panel — aparece ao clicar em um nó */}
        {selectedIndicatorId && (
          <IndicatorDetailPanel
            indicatorId={selectedIndicatorId}
            period={currentPeriod}
            onClose={() => setSelectedIndicatorId(null)}
          />
        )}
      </div>

      {/* Formulário de criar/editar indicador (barra lateral direita) */}
      {indicatorForm.open && (
        <IndicatorFormPanel
          mapId={id}
          editIndicatorId={indicatorForm.editId}
          onClose={() => setIndicatorForm({ open: false, editId: null })}
          onSaved={() => {
            setIndicatorForm({ open: false, editId: null });
            qc.invalidateQueries({ queryKey: ['map', id] });
          }}
        />
      )}
    </div>
  );
}
