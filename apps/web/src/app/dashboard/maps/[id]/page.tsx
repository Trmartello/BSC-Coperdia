'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Node, Edge, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState,
  addEdge, Connection, MarkerType, Position,
  NodeProps, Handle, Panel, NodeChange, applyNodeChanges,
  ConnectionMode, EdgeProps, BaseEdge, EdgeLabelRenderer,
  getSmoothStepPath, reconnectEdge,
} from 'reactflow';
import { getHelperLines, HelperLines } from '../../../../components/maps/helperLines';
import 'reactflow/dist/style.css';
import { ArrowLeft, Plus, Pencil, Trash2, X, ChevronsRight, ChevronsLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { mapsApi, indicatorsApi, settingsApi } from '../../../../lib/api';
import { useScenarioStore } from '../../../../store/scenario.store';
import { IndicatorMap, MapEntry } from '../../../../types/maps';
import { cn } from '../../../../lib/utils';
import { IndicatorCard } from '../../../../components/indicators/IndicatorCard';
import { IndicatorDetailPanel } from '../../../../components/indicators/IndicatorDetailPanel';
import { IndicatorDetailModal } from '../../../../components/indicators/IndicatorDetailModal';
import { IndicatorFormPanel } from '../../../../components/indicators/IndicatorFormPanel';
import { toast } from 'sonner';

// ─── Indicator Node — usa o card padrão do sistema (IndicatorCard) ─────────────

// alças nos 4 lados; em ConnectionMode.Loose cada uma é origem e destino,
// permitindo conectar por qualquer lado do card.
const HANDLE_STYLE = {
  background: '#6366f1', border: '2px solid #0d0f17', width: 11, height: 11,
  opacity: 0, transition: 'opacity 0.15s',
} as const;
const HANDLES = ([
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const);

function MapIndicatorNode({ data, selected }: NodeProps) {
  const {
    indicator, realized, goal, estimate, period, showEstimate = true,
    actionCount, attachmentCount, commentCount,
    onInfo, onRemove, onOpenActionPlan, onUpdated,
    level = 1, onExpandLevel,
    hasDeepNeighbors = false, nextLevelVisible = false,
  } = data;

  return (
    <div className={cn('group relative rounded-2xl transition-shadow [&:hover_.rf-handle]:!opacity-100',
      selected ? 'ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/20' : '')}>
      {HANDLES.map(([hid, pos]) => (
        <Handle key={hid} id={hid} type="source" position={pos} className="rf-handle" style={HANDLE_STYLE} />
      ))}

      {/* Botão aparece só se o card tiver vizinhos em nível mais profundo.
          Recolhido → sempre visível (chama atenção p/ expandir).
          Expandido → só ao passar o mouse sobre o card. */}
      {onExpandLevel && hasDeepNeighbors && (
        <button
          onClick={(e) => { e.stopPropagation(); onExpandLevel(level); }}
          className={cn(
            'nodrag absolute -bottom-3 -right-3 z-10 w-6 h-6 rounded-full bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-400/30 flex items-center justify-center shadow-lg transition-opacity',
            nextLevelVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-100',
          )}
          title={nextLevelVisible ? 'Recolher próximo nível' : 'Expandir próximo nível'}
        >
          {nextLevelVisible
            ? <ChevronsLeft size={11} className="text-white" />
            : <ChevronsRight size={11} className="text-white" />}
        </button>
      )}

      <IndicatorCard
        data={{
          indicator, realized, goal, estimate, period,
          actionCount, attachmentCount, commentCount,
        }}
        showEstimate={showEstimate}
        onOpenInfo={() => onInfo?.(indicator.id)}
        onDelete={() => onRemove?.(indicator.id, indicator.name)}
        onOpenActionPlan={() => onOpenActionPlan?.(indicator.id)}
        onUpdated={onUpdated}
      />
    </div>
  );
}

const nodeTypes = { mapIndicator: MapIndicatorNode };

// ─── Editable Edge (clique para selecionar + remover; arraste a ponta p/ reconectar) ─

function EditableEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  markerEnd, style, data, selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  const edgeStyle: React.CSSProperties = {
    ...style,
    stroke: selected ? '#818cf8' : (style?.stroke ?? '#6366f1'),
    strokeWidth: selected ? 2.5 : (style?.strokeWidth ?? 1.5),
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={cn(
            'nodrag nopan transition-opacity',
            selected ? 'opacity-100' : 'opacity-0 hover:opacity-100',
          )}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              data?.onRemoveEdge?.(id, data?.parentId, data?.childId);
            }}
            title="Remover conexão"
            className="w-5 h-5 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center shadow-lg border border-white/30"
          >
            <X size={11} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { editable: EditableEdge };

// ─── Build nodes/edges ────────────────────────────────────────────────────────

function buildNodesAndEdges(
  entries: MapEntry[],
  savedFlow?: any,
  handlers?: {
    onInfo: (id: string) => void;
    onRemove: (id: string, name: string) => void;
    onRemoveEdge: (edgeId: string, parentId: string, childId: string) => void;
    onOpenActionPlan: (id: string) => void;
    onExpandLevel: (level: number) => void;
    onUpdated: () => void;
  },
  showEstimate = true,
  period?: string,
  pendingLevels?: Map<string, number>,
) {
  const nodes: Node[] = entries.map((entry, i) => {
    const savedNode = savedFlow?.nodes?.find((n: any) => n.id === entry.indicatorId);
    const ind: any = entry.indicator;
    const realized = ind.realizedValues?.[0]?.value ? parseFloat(ind.realizedValues[0].value) : null;
    const goal = ind.goals?.[0]?.value ? parseFloat(ind.goals[0].value) : null;
    const estimate = ind.forecastValues?.[0]?.value ? parseFloat(ind.forecastValues[0].value) : null;

    // Contadores do rodapé (ações = itens de ação; anexos; comentários)
    const plans: any[] = ind.actionPlans ?? [];
    const actionCount = plans.reduce(
      (s, p) => s + (p.initiatives?.reduce((t: number, i: any) => t + (i._count?.actions ?? 0), 0) ?? 0),
      0,
    );
    // Anexos vivem dentro dos comentários; conta comentários com arquivo e comentários com texto.
    const allComments: any[] = plans.flatMap((p) => p.comments ?? []);
    const attachmentCount = allComments.filter((c) => c.attachmentUrl).length;
    const commentCount = allComments.filter((c) => c.content && String(c.content).trim()).length;
    const level = savedNode?.data?.level ?? pendingLevels?.get(entry.indicatorId) ?? 1;

    return {
      id: entry.indicatorId,
      type: 'mapIndicator',
      position: savedNode?.position ?? { x: (i % 3) * 300, y: Math.floor(i / 3) * 280 },
      data: {
        indicator: ind, realized, goal, estimate, period, showEstimate,
        level,
        actionCount, attachmentCount, commentCount,
        onInfo: handlers?.onInfo, onRemove: handlers?.onRemove,
        onExpandLevel: handlers?.onExpandLevel,
        onOpenActionPlan: handlers?.onOpenActionPlan, onUpdated: handlers?.onUpdated,
      },
    };
  });

  // Mapa das alças salvas por par origem→destino. `manual` indica que o
  // usuário fixou manualmente a rota dessa conexão (tem prioridade máxima).
  const savedHandles = new Map<string, { sourceHandle?: string; targetHandle?: string; manual: boolean }>();
  for (const se of savedFlow?.edges ?? []) {
    if (se.source && se.target) {
      savedHandles.set(`${se.source}->${se.target}`, {
        sourceHandle: se.sourceHandle ?? undefined,
        targetHandle: se.targetHandle ?? undefined,
        manual: se.data?.manualRoute ?? false,
      });
    }
  }

  const edges: Edge[] = [];
  const allIds = new Set(entries.map((e) => e.indicatorId));
  for (const entry of entries) {
    for (const rel of entry.indicator.children ?? []) {
      if (rel.child?.id && allIds.has(rel.child.id)) {
        const source = rel.child.id;
        const target = entry.indicatorId;
        const saved = savedHandles.get(`${source}->${target}`);
        edges.push({
          id: `e-${source}-${target}`,
          source,
          target,
          // alças padrão (direita→esquerda) quando ainda não houver layout salvo
          sourceHandle: saved?.sourceHandle ?? 'right',
          targetHandle: saved?.targetHandle ?? 'left',
          type: 'editable',
          animated: false,
          style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
          data: { parentId: target, childId: source, manualRoute: saved?.manual ?? false, onRemoveEdge: handlers?.onRemoveEdge },
        });
      }
    }
  }

  return { nodes, edges };
}

// ─── Add Indicator Panel ──────────────────────────────────────────────────────

// levels: níveis já em uso no mapa (dinâmico). Garante ao menos [1].
function LevelPicker({ value, onChange, levels = [1, 2, 3, 4, 5] }: {
  value: number;
  onChange: (l: number) => void;
  levels?: number[];
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function commit(v: number) {
    if (!Number.isNaN(v) && v >= 1) { onChange(v); setOpen(false); setCustom(''); }
  }

  // Garante que o nível atual sempre apareça nas opções
  const opts = Array.from(new Set([...levels, value])).sort((a, b) => a - b);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((s) => !s); }}
        className="nodrag w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white transition-colors"
        title="Editar nível"
      >
        {value}
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 bg-[#1a1f2e] border border-white/15 rounded-xl shadow-2xl p-2 flex flex-col gap-1 min-w-[110px]">
          <p className="text-[9px] uppercase tracking-widest text-white/30 px-1 pb-0.5">Nível de abertura</p>
          <div className="flex gap-1 flex-wrap">
            {opts.map((l) => (
              <button
                key={l}
                onClick={() => commit(l)}
                className={cn(
                  'w-7 h-7 rounded-lg text-xs font-bold transition-colors',
                  value === l ? 'bg-indigo-600 text-white' : 'bg-white/8 text-white/60 hover:bg-white/15',
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1 mt-0.5">
            <input
              type="number"
              min={1}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(parseInt(custom)); }}
              placeholder="outro"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 w-16"
            />
            <button
              onClick={() => commit(parseInt(custom))}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white font-medium"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IndicatorRow({ ind, onMap, level, onAdd, onEdit, onRemove, onLevelChange, usedLevels }: {
  ind: any;
  onMap?: boolean;
  level?: number;
  onAdd?: (level: number) => void;
  onEdit: () => void;
  onRemove?: () => void;
  onLevelChange?: (l: number) => void;
  usedLevels?: number[];
}) {
  const maxUsed = usedLevels && usedLevels.length > 0 ? Math.max(...usedLevels) : 0;
  const defaultLevel = maxUsed + 1;
  const [selectedLevel, setSelectedLevel] = useState(defaultLevel);
  const [showAddLevel, setShowAddLevel] = useState(false);
  const presets = usedLevels && usedLevels.length > 0 ? [...usedLevels, defaultLevel] : [1];

  if (!onMap && onAdd) {
    // Card disponível: botão + abre mini-picker de nível antes de adicionar
    return (
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
        <span className="text-[10px] font-mono text-white/30 w-14 flex-shrink-0">{ind.code}</span>
        <span className="text-sm text-white/70 truncate flex-1">{ind.name}</span>
        <button onClick={onEdit} title="Editar cadastro" className="text-white/30 hover:text-white/80 flex-shrink-0">
          <Pencil size={12} />
        </button>
        {showAddLevel ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            {Array.from(new Set(presets)).sort((a, b) => a - b).map((l) => (
              <button
                key={l}
                onClick={() => setSelectedLevel(l)}
                className={cn(
                  'w-6 h-6 rounded text-[10px] font-bold transition-colors',
                  selectedLevel === l ? 'bg-indigo-600 text-white' : 'bg-white/8 text-white/60 hover:bg-indigo-600/60 hover:text-white',
                )}
              >
                {l}
              </button>
            ))}
            <button
              onClick={() => { onAdd(selectedLevel); setShowAddLevel(false); }}
              className="px-2 h-6 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] text-white font-medium transition-colors"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setSelectedLevel(defaultLevel); setShowAddLevel(true); }}
            title={`Adicionar ao mapa (nível sugerido ${defaultLevel})`}
            className="text-white/30 hover:text-emerald-400 flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
    );
  }

  // Card no mapa: mostra badge de nível clicável + botão de remover do mapa
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
      <span className="text-[10px] font-mono text-white/30 w-14 flex-shrink-0">{ind.code}</span>
      <span className="text-sm text-white/70 truncate flex-1">{ind.name}</span>
      {onRemove && (
        <button onClick={onRemove} title="Remover do mapa" className="text-white/30 hover:text-red-400 flex-shrink-0">
          <Trash2 size={12} />
        </button>
      )}
      <button onClick={onEdit} title="Editar cadastro" className="text-white/30 hover:text-white/80 flex-shrink-0">
        <Pencil size={12} />
      </button>
      {onLevelChange && (
        <LevelPicker value={level ?? 1} onChange={onLevelChange} />
      )}
    </div>
  );
}

function ManageIndicatorsPanel({ existingIds, nodeLevels, onAdd, onLevelChange, onCreateNew, onEdit, onRemove, onClose }: {
  existingIds: Set<string>;
  nodeLevels: Map<string, number>;
  onAdd: (id: string, level: number) => void;
  onLevelChange: (id: string, level: number) => void;
  onCreateNew: () => void;
  onEdit: (id: string) => void;
  onRemove: (id: string, name: string) => void;
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

  // Níveis já em uso no mapa (para oferecer as mesmas opções no picker)
  const usedLevels = Array.from(new Set(nodeLevels.values())).sort((a, b) => a - b);
  const pickerLevels = usedLevels.length > 0 ? usedLevels : [1, 2, 3, 4, 5];

  return (
    <>
      {/* Backdrop — clique fora fecha a gaveta */}
      <div className="fixed inset-0 top-12 z-30 bg-black/30" onClick={onClose} />

      {/* Gaveta lateral direita — altura total abaixo da topbar */}
      <div className="fixed top-12 right-0 bottom-0 z-40 w-[380px] bg-[#1a1f2e] border-l border-white/10 shadow-2xl flex flex-col">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Gerenciar Indicadores</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 text-base leading-none">✕</button>
        </div>
        <div className="p-4 border-b border-white/5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar indicador..."
          autoFocus
          className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none"
        />
        <button
          onClick={onCreateNew}
          className="w-full mt-2 flex items-center justify-center gap-2 bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs py-2 rounded-lg hover:bg-purple-600/30"
        >
          <Plus size={13} /> Criar novo indicador
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {onMapList.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[9px] uppercase tracking-widest text-white/30">
              No mapa ({onMapList.length})
            </p>
            {onMapList.map((ind) => (
              <IndicatorRow
                key={ind.id}
                ind={ind}
                onMap
                level={nodeLevels.get(ind.id) ?? 1}
                onEdit={() => onEdit(ind.id)}
                onRemove={() => onRemove(ind.id, ind.name)}
                onLevelChange={(l) => onLevelChange(ind.id, l)}
                usedLevels={pickerLevels}
              />
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
            onAdd={(l) => onAdd(ind.id, l)}
            onEdit={() => onEdit(ind.id)}
            usedLevels={pickerLevels}
          />
        ))}
        {available.length === 0 && onMapList.length === 0 && (
          <p className="text-center text-xs text-white/30 py-6">Nenhum indicador encontrado.</p>
        )}
        </div>
      </div>
    </>
  );
}

// ─── Main Map Editor ──────────────────────────────────────────────────────────

export default function MapEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { activePeriod, accumulate } = useScenarioStore();
  const qc = useQueryClient();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedIndicatorId, setSelectedIndicatorId] = useState<string | null>(null);
  const [infoIndicatorId, setInfoIndicatorId] = useState<string | null>(null);
  const [indicatorForm, setIndicatorForm] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });

  const { data: map, isLoading } = useQuery<IndicatorMap>({
    queryKey: ['map', id, activePeriod, accumulate],
    queryFn: () => mapsApi.get(id, activePeriod, accumulate).then((r) => r.data),
  });

  const { data: flags } = useQuery({
    queryKey: ['settings-flags'],
    queryFn: () => settingsApi.getFlags().then((r) => r.data),
  });
  const showEstimate = flags?.showEstimate ?? true;

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [visibleUpToLevel, setVisibleUpToLevel] = useState(99);
  const pendingLevelsRef = React.useRef<Map<string, number>>(new Map());

  // Linhas-guia de alinhamento exibidas durante o arraste de um card
  const [helperLineH, setHelperLineH] = useState<number | undefined>();
  const [helperLineV, setHelperLineV] = useState<number | undefined>();

  // Marca que houve um ajuste manual (mover card / reconectar) pendente de
  // persistência. O auto-save só dispara quando esta flag estiver ligada,
  // evitando salvar a montagem inicial vinda do servidor.
  const dirtyRef = useRef(false);

  // Intercepta o arraste: calcula o alinhamento mais próximo, "gruda" o card
  // nele e desenha as linhas-guia. Demais mudanças seguem o fluxo padrão.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setHelperLineH(undefined);
      setHelperLineV(undefined);

      const drag = changes[0];
      if (
        changes.length === 1 &&
        drag.type === 'position' &&
        drag.dragging &&
        drag.position
      ) {
        const lines = getHelperLines(drag, nodes);
        drag.position.x = lines.snapPosition.x ?? drag.position.x;
        drag.position.y = lines.snapPosition.y ?? drag.position.y;
        setHelperLineH(lines.horizontal);
        setHelperLineV(lines.vertical);
      }

      // Reposicionar um card é um ajuste manual → marca para auto-save
      if (changes.some((c) => c.type === 'position')) dirtyRef.current = true;

      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [nodes, setNodes],
  );

  const handleExpandLevel = useCallback((level: number) => {
    setVisibleUpToLevel((prev) => (prev > level ? level : level + 1));
  }, []);

  const maxDefinedLevel = React.useMemo(
    () => Math.max(1, ...nodes.map((n) => n.data?.level ?? 1)),
    [nodes],
  );

  const displayNodes = React.useMemo(() => {
    const nodeLevel = new Map(nodes.map((n) => [n.id, n.data?.level ?? 1]));

    // Adjacência bidirecional: para cada nó, quais nós estão conectados
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, []);
      if (!adj.has(e.target)) adj.set(e.target, []);
      adj.get(e.source)!.push(e.target);
      adj.get(e.target)!.push(e.source);
    }

    return nodes.map((n) => {
      const level = nodeLevel.get(n.id) ?? 1;
      const neighbors = adj.get(n.id) ?? [];
      // Tem vizinhos em nível mais profundo?
      const hasDeepNeighbors = neighbors.some((nid) => (nodeLevel.get(nid) ?? 1) > level);
      // O nível seguinte já está visível?
      const nextLevelVisible = visibleUpToLevel > level;

      return {
        ...n,
        hidden: level > visibleUpToLevel,
        data: { ...n.data, hasDeepNeighbors, nextLevelVisible },
      };
    });
  }, [nodes, edges, visibleUpToLevel]);

  const displayEdges = React.useMemo(() => {
    const nodeLevel = new Map(nodes.map((n) => [n.id, n.data?.level ?? 1]));

    // Geometria atual de cada nó (centro + dimensões) para roteamento flutuante
    const geom = new Map<string, { cx: number; cy: number; w: number; h: number; x: number; y: number }>();
    for (const n of nodes) {
      const w = n.width ?? 260;
      const h = n.height ?? 150;
      geom.set(n.id, { cx: n.position.x + w / 2, cy: n.position.y + h / 2, w, h, x: n.position.x, y: n.position.y });
    }

    // Escolhe os lados (handles) que se "enfrentam", minimizando o comprimento
    // da linha: o lado de saída aponta para o nó de destino e vice-versa.
    const pickHandles = (sourceId: string, targetId: string) => {
      const s = geom.get(sourceId);
      const t = geom.get(targetId);
      if (!s || !t) return undefined;
      const dx = t.cx - s.cx;
      const dy = t.cy - s.cy;
      // Normaliza a diferença pelo tamanho do nó para que o eixo dominante
      // considere a forma do card (cards largos preferem ligações laterais).
      const ax = Math.abs(dx) / ((s.w + t.w) / 2);
      const ay = Math.abs(dy) / ((s.h + t.h) / 2);
      if (ax >= ay) {
        return dx >= 0
          ? { sourceHandle: 'right', targetHandle: 'left' }
          : { sourceHandle: 'left', targetHandle: 'right' };
      }
      return dy >= 0
        ? { sourceHandle: 'bottom', targetHandle: 'top' }
        : { sourceHandle: 'top', targetHandle: 'bottom' };
    };

    return edges.map((e) => {
      // Rota manual fixada pelo usuário tem prioridade máxima: mantém as alças
      // salvas e NÃO sofre roteamento automático. Demais conexões "flutuam".
      const manual = (e.data as any)?.manualRoute;
      const handles = manual ? undefined : pickHandles(e.source, e.target);
      return {
        ...e,
        ...(handles ?? {}),
        hidden: (nodeLevel.get(e.source) ?? 1) > visibleUpToLevel
               || (nodeLevel.get(e.target) ?? 1) > visibleUpToLevel,
      };
    });
  }, [edges, nodes, visibleUpToLevel]);

  const handleRemoveIndicator = useCallback(async (indId: string, name: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Remover "${name}" deste mapa?`)) return;
    try {
      await mapsApi.removeIndicator(id, indId);
      setSelectedIndicatorId((prev) => (prev === indId ? null : prev));
      qc.invalidateQueries({ queryKey: ['map', id] });
      toast.success('Indicador removido do mapa');
    } catch {
      toast.error('Erro ao remover indicador');
    }
  }, [id, qc]);

  // Remove a conexão (relação de impacto) entre dois indicadores
  const handleRemoveEdge = useCallback(async (edgeId: string, parentId: string, childId: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    try {
      await indicatorsApi.removeRelation(parentId, childId);
      toast.success('Conexão removida');
    } catch {
      toast.error('Erro ao remover conexão');
    } finally {
      qc.invalidateQueries({ queryKey: ['map', id] });
    }
  }, [id, qc, setEdges]);

  useEffect(() => {
    if (!map?.entries) return;
    const { nodes: n, edges: e } = buildNodesAndEdges(map.entries, map.flowData, {
      onInfo: (indId) => setInfoIndicatorId(indId),
      onRemove: handleRemoveIndicator,
      onRemoveEdge: handleRemoveEdge,
      onExpandLevel: handleExpandLevel,
      onOpenActionPlan: (indId) => setSelectedIndicatorId((prev) => (prev === indId ? null : indId)),
      onUpdated: () => qc.invalidateQueries({ queryKey: ['map', id] }),
    }, showEstimate, activePeriod, pendingLevelsRef.current);
    setNodes(n);
    setEdges(e);
  }, [map, showEstimate, activePeriod, handleExpandLevel]);

  // Criar conexão: source = causa (filho), target = recebe impacto (pai)
  const onConnect = useCallback(
    async (params: Connection) => {
      if (!params.source || !params.target) return;
      const parentId = params.target;
      const childId = params.source;
      setEdges((eds) =>
        addEdge({
          ...params, type: 'smoothstep', animated: false,
          style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '5 3' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
          data: { parentId, childId },
        }, eds),
      );
      try {
        await indicatorsApi.addRelation(parentId, childId);
        toast.success('Conexão criada');
      } catch (e: any) {
        toast.error(e?.response?.data?.message || 'Erro ao criar conexão');
      } finally {
        qc.invalidateQueries({ queryKey: ['map', id] });
      }
    },
    [setEdges, qc, id],
  );

  // ── Reconexão: arraste a ponta de uma conexão para outro card ──────────────
  const edgeReconnectOk = useRef(true);
  const onReconnectStart = useCallback(() => { edgeReconnectOk.current = false; }, []);

  const onReconnect = useCallback(
    async (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectOk.current = true;
      if (!newConnection.source || !newConnection.target) return;
      const oldParent = (oldEdge.data as any)?.parentId ?? oldEdge.target;
      const oldChild = (oldEdge.data as any)?.childId ?? oldEdge.source;
      const newParent = newConnection.target;
      const newChild = newConnection.source;

      // Mesmo par de nós: o usuário apenas mudou o LADO (handle) da conexão.
      // Isso é uma rota manual → fixa as alças escolhidas e marca como manual
      // (prioridade máxima, deixa de sofrer roteamento automático). Sem chamada
      // à API, pois a relação entre indicadores não mudou.
      if (oldParent === newParent && oldChild === newChild) {
        setEdges((els) =>
          els.map((e) =>
            e.id === oldEdge.id
              ? {
                  ...e,
                  sourceHandle: newConnection.sourceHandle ?? e.sourceHandle,
                  targetHandle: newConnection.targetHandle ?? e.targetHandle,
                  data: { ...(e.data as any), manualRoute: true },
                }
              : e,
          ),
        );
        dirtyRef.current = true;
        return;
      }

      setEdges((els) =>
        reconnectEdge(oldEdge, newConnection, els).map((e) =>
          e.id === oldEdge.id || (e.source === newChild && e.target === newParent)
            ? { ...e, data: { ...(e.data as any), parentId: newParent, childId: newChild, manualRoute: true } }
            : e,
        ),
      );
      dirtyRef.current = true;
      try {
        await indicatorsApi.removeRelation(oldParent, oldChild);
        await indicatorsApi.addRelation(newParent, newChild);
        toast.success('Conexão atualizada');
      } catch (e: any) {
        toast.error(e?.response?.data?.message || 'Erro ao reconectar');
      } finally {
        qc.invalidateQueries({ queryKey: ['map', id] });
      }
    },
    [setEdges, qc, id],
  );

  // Se soltar a ponta no vazio, remove a conexão
  const onReconnectEnd = useCallback(
    (_: unknown, edge: Edge) => {
      if (!edgeReconnectOk.current) {
        const parentId = (edge.data as any)?.parentId ?? edge.target;
        const childId = (edge.data as any)?.childId ?? edge.source;
        handleRemoveEdge(edge.id, parentId, childId);
      }
      edgeReconnectOk.current = true;
    },
    [handleRemoveEdge],
  );

  // Remover conexão (selecione a seta e tecle Delete)
  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      for (const edge of deleted) {
        const parentId = (edge.data as any)?.parentId ?? edge.target;
        const childId = (edge.data as any)?.childId ?? edge.source;
        try {
          await indicatorsApi.removeRelation(parentId, childId);
        } catch {
          toast.error('Erro ao remover conexão');
        }
      }
      if (deleted.length) toast.success('Conexão removida');
      qc.invalidateQueries({ queryKey: ['map', id] });
    },
    [qc, id],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedIndicatorId((prev) => prev === node.id ? null : node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedIndicatorId(null);
  }, []);

  // ── Auto-save: persiste a configuração assim que o usuário faz um ajuste
  // manual (mover card ou redefinir rota). Debounce p/ agrupar o arraste; só
  // salva quando há alteração manual pendente (dirtyRef), de modo que a
  // montagem inicial vinda do servidor nunca dispara escrita.
  useEffect(() => {
    if (!dirtyRef.current || nodes.length === 0) return;
    const t = setTimeout(() => {
      dirtyRef.current = false;
      mapsApi.saveLayout(id, { nodes, edges }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, id]);

  const addIndMutation = useMutation({
    mutationFn: ({ indicatorId }: { indicatorId: string; level: number }) =>
      mapsApi.addIndicator(id, indicatorId),
    onSuccess: (_, vars) => {
      pendingLevelsRef.current.set(vars.indicatorId, vars.level);
      qc.invalidateQueries({ queryKey: ['map', id] });
      toast.success('Indicador adicionado ao mapa');
      setShowAddPanel(false);
    },
  });

  // Map of indicatorId → current level (for the panel level picker)
  const nodeLevels = React.useMemo(
    () => new Map(nodes.map((n) => [n.id, n.data?.level ?? 1])),
    [nodes],
  );

  // Update level of an existing node on the map (stored in node data; persisted on Save)
  const handleNodeLevelChange = useCallback((indicatorId: string, level: number) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === indicatorId ? { ...n, data: { ...n.data, level } } : n,
      ),
    );
  }, [setNodes]);

  if (isLoading) return <div className="h-full bg-[#0d0f17] animate-pulse rounded-2xl" />;

  const existingIds = new Set(map?.entries?.map((e) => e.indicatorId) ?? []);


  return (
    <div className="flex flex-col h-[calc(100vh-48px-24px)]">
      {/* ── Topbar ── */}
      <div className="flex items-center gap-3 mb-2">
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
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-white/50">
          <span className="font-medium text-white/30">Legenda:</span>
          <span className="flex items-center gap-1.5">
            <ArrowDown size={13} strokeWidth={3} className="text-blue-500 flex-shrink-0" />
            Quanto Menor Melhor
          </span>
          <span className="flex items-center gap-1.5">
            <ArrowUp size={13} strokeWidth={3} className="text-green-500 flex-shrink-0" />
            Quanto Maior Melhor
          </span>
        </div>
        <div className="flex-1" />

        {/* Level expand / collapse controls */}
        <div className="flex items-center gap-1 border border-white/10 rounded-xl overflow-hidden text-xs">
          <button
            onClick={() => {
              const selLevel = selectedIndicatorId
                ? (nodes.find((n) => n.id === selectedIndicatorId)?.data?.level ?? 1) : 1;
              setVisibleUpToLevel(selLevel);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            title="Recolher níveis"
          >
            <ChevronsLeft size={13} /> Recolher
          </button>
          <div className="w-px h-5 bg-white/10" />
          <button
            onClick={() => {
              const selLevel = selectedIndicatorId
                ? (nodes.find((n) => n.id === selectedIndicatorId)?.data?.level ?? maxDefinedLevel)
                : maxDefinedLevel;
              setVisibleUpToLevel(visibleUpToLevel >= maxDefinedLevel ? selLevel : maxDefinedLevel);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            title="Expandir níveis"
          >
            <ChevronsRight size={13} /> Expandir
          </button>
          <div className="px-2 py-1.5 bg-indigo-600/20 text-indigo-300 font-semibold text-[10px]">
            {visibleUpToLevel >= maxDefinedLevel ? 'Todos' : `Níveis 1–${visibleUpToLevel}`}
          </div>
        </div>

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
              nodeLevels={nodeLevels}
              onAdd={(indId, level) => addIndMutation.mutate({ indicatorId: indId, level })}
              onLevelChange={handleNodeLevelChange}
              onCreateNew={() => {
                setShowAddPanel(false);
                setIndicatorForm({ open: true, editId: null });
              }}
              onEdit={(indId) => {
                setShowAddPanel(false);
                setIndicatorForm({ open: true, editId: indId });
              }}
              onRemove={handleRemoveIndicator}
              onClose={() => setShowAddPanel(false)}
            />
          )}
        </div>
      </div>

      {/* ── Canvas + Detail Panel ── */}
      <div className="flex flex-1 gap-4 overflow-hidden">
        <div className="flex-1 rounded-2xl overflow-hidden border border-white/5 bg-[#0d0f17]">
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onEdgesDelete={onEdgesDelete}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            deleteKeyCode="Delete"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.5}
              color="rgba(255,255,255,0.14)"
            />
            <HelperLines horizontal={helperLineH} vertical={helperLineV} />
            <Controls
              style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
              showInteractive={false}
            />
            <MiniMap
              pannable
              zoomable
              style={{ width: 120, height: 80, background: '#0d0f17', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, opacity: 0.85 }}
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
            period={activePeriod}
            onClose={() => setSelectedIndicatorId(null)}
          />
        )}
      </div>

      {/* Modal de informações (fórmula + pontos de monitoria) */}
      {infoIndicatorId && (
        <IndicatorDetailModal
          indicatorId={infoIndicatorId}
          onClose={() => setInfoIndicatorId(null)}
          onOpenActionPlan={() => {
            const id = infoIndicatorId;
            setInfoIndicatorId(null);
            setSelectedIndicatorId(id);
          }}
          onUpdated={() => qc.invalidateQueries({ queryKey: ['map', id] })}
        />
      )}

      {/* Formulário de criar/editar indicador (barra lateral direita) */}
      {indicatorForm.open && (
        <IndicatorFormPanel
          mapId={id}
          editIndicatorId={indicatorForm.editId}
          onClose={() => setIndicatorForm({ open: false, editId: null })}
          onSaved={(savedId, level) => {
            if (savedId && level && !indicatorForm.editId) {
              pendingLevelsRef.current.set(savedId, level);
            }
            setIndicatorForm({ open: false, editId: null });
            qc.invalidateQueries({ queryKey: ['map', id] });
          }}
        />
      )}
    </div>
  );
}
