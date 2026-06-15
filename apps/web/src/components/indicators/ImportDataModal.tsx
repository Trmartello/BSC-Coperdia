'use client';

import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { indicatorsApi } from '../../lib/api';
import { toast } from 'sonner';

interface ImportResult {
  realizedCount: number;
  goalsCount: number;
  estimatesCount: number;
  total: number;
  periods: string[];
  skipped: { aba: string; codigo: string; motivo: string }[];
  // legacy CSV response shape
  importedCount?: number;
  inconsistencies?: {
    calculado: string; calculadoNome: string;
    faltando: string; faltandoNome: string; periodo: string;
  }[];
}

export function ImportDataModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleDownloadTemplate() {
    try {
      const res = await indicatorsApi.downloadTemplate();
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_carga_bsc.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao baixar o modelo');
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    setResult(null);
    try {
      const res = await indicatorsApi.importData(file);
      setResult(res.data);
      const total = res.data.total ?? res.data.importedCount ?? 0;
      toast.success(`${total} valores carregados com sucesso`);
      qc.invalidateQueries({ queryKey: ['indicators'] });
      qc.invalidateQueries({ queryKey: ['indicator-periods'] });
      qc.invalidateQueries({ queryKey: ['settings-indicators'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao importar a planilha');
    } finally {
      setUploading(false);
    }
  }

  const total = result ? (result.total ?? result.importedCount ?? 0) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[88vh] bg-[#161b27] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-400" />
            <h2 className="text-white font-semibold">Carga de dados</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Instruções */}
          <div className="flex gap-3 bg-purple-600/8 border border-purple-500/20 rounded-xl p-4">
            <Info size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-white/55 leading-relaxed space-y-1">
              <p>Baixe o modelo Excel, preencha as abas desejadas e faça o upload.</p>
              <p className="text-white/35 text-xs">
                <strong className="text-white/50">Realizados</strong> — valores de entrada (indicadores calculados são derivados automaticamente).
                {' '}<strong className="text-white/50">Metas</strong> e <strong className="text-white/50">Estimativas</strong> — disponíveis para todos os indicadores.
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { n: '1', label: 'Baixar modelo', desc: 'Arquivo Excel com todos os indicadores pré-preenchidos' },
              { n: '2', label: 'Preencher', desc: 'Informe o período e os valores nas abas desejadas' },
              { n: '3', label: 'Importar', desc: 'Faça upload da planilha preenchida' },
            ].map((s) => (
              <div key={s.n} className="bg-white/3 border border-white/8 rounded-xl p-3">
                <div className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-300 text-xs font-bold flex items-center justify-center mx-auto mb-2">{s.n}</div>
                <p className="text-xs text-white/70 font-medium mb-1">{s.label}</p>
                <p className="text-[10px] text-white/35 leading-tight">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 transition-colors"
            >
              <Download size={15} className="text-emerald-400" />
              Baixar modelo (.xlsx)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={15} />
              {uploading ? 'Importando...' : 'Importar planilha'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                <CheckCircle2 size={16} />
                <span>
                  {total} valor(es) carregado(s)
                  {result.periods?.length > 0 && ` · período(s): ${result.periods.join(', ')}`}
                </span>
              </div>

              {/* Breakdown */}
              {(result.realizedCount !== undefined) && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Realizados', count: result.realizedCount, color: 'text-blue-400' },
                    { label: 'Metas', count: result.goalsCount, color: 'text-amber-400' },
                    { label: 'Estimativas', count: result.estimatesCount, color: 'text-purple-400' },
                  ].map((b) => (
                    <div key={b.label} className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
                      <p className={`text-xl font-bold ${b.color}`}>{b.count}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{b.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Legacy inconsistencies */}
              {result.inconsistencies && result.inconsistencies.length > 0 && (
                <div className="border border-amber-500/30 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
                    <AlertTriangle size={14} />
                    Inconsistências ({result.inconsistencies.length})
                  </div>
                  <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
                    {result.inconsistencies.map((inc, i) => (
                      <div key={i} className="px-4 py-2.5 text-xs">
                        <p className="text-white/70">
                          <span className="font-mono text-amber-300">{inc.calculado}</span> ({inc.calculadoNome})
                          {' '}não pôde ser calculado em <span className="text-white/80">{inc.periodo}</span>
                        </p>
                        <p className="text-white/40 mt-0.5">
                          Falta o insumo <span className="font-mono text-white/60">{inc.faltando}</span> — {inc.faltandoNome}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skipped */}
              {result.skipped?.length > 0 && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-white/5 text-white/40 text-xs font-semibold uppercase tracking-wider">
                    Linhas ignoradas ({result.skipped.length})
                  </div>
                  <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="px-4 py-2 text-xs flex items-center gap-3">
                        {s.aba && <span className="text-[10px] text-purple-400/70 flex-shrink-0">[{s.aba}]</span>}
                        <span className="font-mono text-white/50 w-16 flex-shrink-0">{s.codigo || '—'}</span>
                        <span className="text-white/40">{s.motivo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
