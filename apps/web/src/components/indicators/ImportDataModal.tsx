'use client';

import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { indicatorsApi } from '../../lib/api';
import { toast } from 'sonner';

interface ImportResult {
  importedCount: number;
  periods: string[];
  skipped: { codigo: string; motivo: string }[];
  inconsistencies: {
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
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'modelo_carga_indicadores.csv';
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
      toast.success(`${res.data.importedCount} valores carregados`);
      qc.invalidateQueries({ queryKey: ['indicators'] });
      qc.invalidateQueries({ queryKey: ['settings-indicators'] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao importar a planilha');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-[#161b27] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-emerald-400" />
            <h2 className="text-white font-semibold">Carga de dados (planilha)</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Instruções */}
          <div className="text-sm text-white/50 leading-relaxed">
            Baixe o modelo, preencha a coluna <span className="text-white/80 font-medium">valor</span> e reenvie.
            Apenas indicadores de <span className="text-white/80 font-medium">entrada</span> (sem fórmula) são carregados —
            os calculados são derivados automaticamente das fórmulas.
          </div>

          {/* Ações */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white/70 transition-colors"
            >
              <Download size={15} /> Baixar modelo
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm text-white font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={15} /> {uploading ? 'Importando...' : 'Importar planilha'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {/* Resultado */}
          {result && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                <CheckCircle2 size={16} />
                <span>
                  {result.importedCount} valor(es) carregado(s)
                  {result.periods.length > 0 && ` · período(s): ${result.periods.join(', ')}`}
                </span>
              </div>

              {/* Inconsistências */}
              {result.inconsistencies.length > 0 ? (
                <div className="border border-amber-500/30 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-300 text-xs font-semibold uppercase tracking-wider">
                    <AlertTriangle size={14} />
                    Relatório de inconsistências ({result.inconsistencies.length})
                  </div>
                  <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
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
              ) : result.importedCount > 0 ? (
                <div className="flex items-center gap-2 text-xs text-white/40 px-1">
                  <CheckCircle2 size={14} className="text-emerald-400/70" />
                  Nenhuma inconsistência — todos os insumos das fórmulas possuem valor.
                </div>
              ) : null}

              {/* Ignorados */}
              {result.skipped.length > 0 && (
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-white/5 text-white/40 text-xs font-semibold uppercase tracking-wider">
                    Linhas ignoradas ({result.skipped.length})
                  </div>
                  <div className="divide-y divide-white/5 max-h-40 overflow-y-auto">
                    {result.skipped.map((s, i) => (
                      <div key={i} className="px-4 py-2 text-xs flex items-center gap-2">
                        <span className="font-mono text-white/50 w-20 flex-shrink-0">{s.codigo || '—'}</span>
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
