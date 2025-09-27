import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TranscriptRecord } from '@shared/types';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function HistoryApp(): JSX.Element {
  const [records, setRecords] = useState<TranscriptRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const fetchPage = async (targetPage = page, targetSearch = searchTerm) => {
    setLoading(true);
    try {
      const response = await window.electronAPI.listTranscripts({
        page: targetPage,
        pageSize,
        search: targetSearch || undefined
      });
      setRecords(response.data);
      setTotal(response.total);
    } catch (error) {
      console.error('No se pudo obtener el historial', error);
      setStatusMessage('Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounced = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounced);
  }, [searchInput]);

  useEffect(() => {
    fetchPage(1, searchTerm).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, searchTerm]);

  useEffect(() => {
    fetchPage().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onHistoryRefresh(() => {
      fetchPage().catch(console.error);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = (text: string) => {
    window.electronAPI.copyToClipboard(text);
    setStatusMessage('Transcripción copiada al portapapeles');
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleExport = async () => {
    const result = await window.electronAPI.exportTranscripts();
    if (result.success) {
      setStatusMessage('CSV exportado correctamente');
    } else if (result.message) {
      setStatusMessage(result.message);
    }
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleChangePage = (direction: 'next' | 'prev') => {
    setPage((current) => {
      if (direction === 'prev') {
        return Math.max(1, current - 1);
      }
      return Math.min(totalPages, current + 1);
    });
  };

  return (
    <div className="table-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="section-title">Historial</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Buscar..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            style={{ width: 200 }}
          />
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} / página
              </option>
            ))}
          </select>
          <button onClick={handleExport}>Exportar CSV</button>
        </div>
      </div>

      {statusMessage ? (
        <div style={{ marginBottom: 12, color: '#f5f5f5', opacity: 0.7 }}>{statusMessage}</div>
      ) : null}

      <table>
        <thead>
          <tr>
            <th style={{ width: '12%' }}>Fecha</th>
            <th>Texto</th>
            <th style={{ width: '10%' }}>Idioma</th>
            <th style={{ width: '12%' }}>Duración</th>
            <th style={{ width: '16%' }}>Dispositivo</th>
            <th style={{ width: '10%' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={6}>Cargando…</td>
            </tr>
          ) : records.length ? (
            records.map((record) => (
              <tr key={record.id}>
                <td>{new Date(record.createdAt).toLocaleString()}</td>
                <td>{record.text}</td>
                <td>{record.lang}</td>
                <td>{(record.durationMs / 1000).toFixed(1)}s</td>
                <td>{record.device || 'N/D'}</td>
                <td>
                  <button onClick={() => handleCopy(record.text)}>Copiar</button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>No hay registros</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          Página {page} de {totalPages} · {total} registros
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleChangePage('prev')} disabled={page === 1}>
            Anterior
          </button>
          <button onClick={() => handleChangePage('next')} disabled={page === totalPages}>
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HistoryApp />
  </React.StrictMode>
);
