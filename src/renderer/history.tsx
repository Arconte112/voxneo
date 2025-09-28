import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { TranscriptRecord } from '@shared/types';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const OVERVIEW_PAGE_SIZE = 100;

type ActiveView = 'dashboard' | 'history';

type OverviewState = {
  loading: boolean;
  error: string | null;
  totalRecords: number;
  totalDurationMs: number;
  averageDurationMs: number;
  perLanguage: Array<{ label: string; count: number }>;
  perDevice: Array<{ label: string; count: number }>;
  firstRecordAt: string | null;
  lastRecordAt: string | null;
};

const initialOverview: OverviewState = {
  loading: true,
  error: null,
  totalRecords: 0,
  totalDurationMs: 0,
  averageDurationMs: 0,
  perLanguage: [],
  perDevice: [],
  firstRecordAt: null,
  lastRecordAt: null
};

const numberFormatter = new Intl.NumberFormat('es-ES');

const formatDuration = (ms: number) => {
  if (!ms) return '0s';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString();
};

function DashboardApp(): JSX.Element {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [records, setRecords] = useState<TranscriptRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewState>(initialOverview);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    document.body.classList.add('dashboard-shell');
    return () => {
      document.body.classList.remove('dashboard-shell');
    };
  }, []);

  const fetchPage = useCallback(
    async (targetPage: number, targetSearch: string) => {
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
    },
    [pageSize]
  );

  const loadOverview = useCallback(async () => {
    setOverview((current) => ({ ...current, loading: true, error: null }));
    try {
      const languageCounts = new Map<string, number>();
      const deviceCounts = new Map<string, number>();
      let totalRecords = 0;
      let totalDuration = 0;
      let firstRecordAt: string | null = null;
      let lastRecordAt: string | null = null;

      let pageIndex = 1;
      let processed = 0;

      while (true) {
        const { data, total: aggregatedTotal } = await window.electronAPI.listTranscripts({
          page: pageIndex,
          pageSize: OVERVIEW_PAGE_SIZE
        });

        if (pageIndex === 1) {
          totalRecords = aggregatedTotal;
        }

        if (!data.length) {
          break;
        }

        data.forEach((record) => {
          processed += 1;
          totalDuration += record.durationMs;
          languageCounts.set(record.lang, (languageCounts.get(record.lang) ?? 0) + 1);
          const deviceLabel = record.device ?? 'Sin dispositivo';
          deviceCounts.set(deviceLabel, (deviceCounts.get(deviceLabel) ?? 0) + 1);

          if (!firstRecordAt || record.createdAt < firstRecordAt) {
            firstRecordAt = record.createdAt;
          }
          if (!lastRecordAt || record.createdAt > lastRecordAt) {
            lastRecordAt = record.createdAt;
          }
        });

        if (processed >= totalRecords || data.length < OVERVIEW_PAGE_SIZE) {
          break;
        }

        pageIndex += 1;
      }

      setOverview({
        loading: false,
        error: null,
        totalRecords,
        totalDurationMs: totalDuration,
        averageDurationMs: totalRecords ? totalDuration / totalRecords : 0,
        perLanguage: Array.from(languageCounts.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
        perDevice: Array.from(deviceCounts.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
        firstRecordAt,
        lastRecordAt
      });
    } catch (error) {
      console.error('No se pudo calcular el resumen', error);
      setOverview((current) => ({
        ...current,
        loading: false,
        error: 'Error al cargar las estadísticas'
      }));
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 280);

    return () => clearTimeout(debounce);
  }, [searchInput]);

  useEffect(() => {
    fetchPage(page, searchTerm).catch(console.error);
  }, [page, searchTerm, fetchPage]);

  useEffect(() => {
    loadOverview().catch(console.error);

    const unsubscribe = window.electronAPI.onHistoryRefresh(() => {
      fetchPage(page, searchTerm).catch(console.error);
      loadOverview().catch(console.error);
    });

    return () => unsubscribe();
  }, [fetchPage, loadOverview, page, searchTerm]);

  const handleCopy = (text: string) => {
    window.electronAPI.copyToClipboard(text);
    setStatusMessage('Transcripción copiada al portapapeles');
    setTimeout(() => setStatusMessage(null), 2400);
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

  const handleMinimize = () => {
    window.electronAPI.minimizeDashboard();
  };

  const handleChangePage = (direction: 'next' | 'prev') => {
    setPage((current) => {
      if (direction === 'prev') {
        return Math.max(1, current - 1);
      }
      return Math.min(totalPages, current + 1);
    });
  };

  const dashboardSummary = useMemo(() => {
    if (overview.loading) {
      return [
        { label: 'Transcripciones', value: '—' },
        { label: 'Tiempo total', value: '—' },
        { label: 'Duración promedio', value: '—' },
        { label: 'Última sesión', value: '—' }
      ];
    }

    return [
      {
        label: 'Transcripciones',
        value: numberFormatter.format(overview.totalRecords)
      },
      {
        label: 'Tiempo total',
        value: formatDuration(overview.totalDurationMs)
      },
      {
        label: 'Duración promedio',
        value: formatDuration(overview.averageDurationMs)
      },
      {
        label: 'Última sesión',
        value: formatDateTime(overview.lastRecordAt)
      }
    ];
  }, [overview]);

  return (
    <div className="workspace">
      <button
        type="button"
        className="workspace__minimize"
        onClick={handleMinimize}
        aria-label="Minimizar dashboard"
      >
        -
      </button>
      <header className="workspace__header">
        <div>
          <span className="workspace__eyebrow">Centro de transcripciones</span>
          <h1 className="workspace__title">Dashboard</h1>
          <p className="workspace__subtitle">
            Visualiza tus estadísticas de uso y explora cada captura desde el historial.
          </p>
        </div>
        <div className="workspace__actions">
          <div className="workspace__tabs">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={activeView === 'dashboard' ? 'workspace__tab is-active' : 'workspace__tab'}
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveView('history')}
              className={activeView === 'history' ? 'workspace__tab is-active' : 'workspace__tab'}
            >
              Historial
            </button>
          </div>
          <button type="button" className="workspace__export" onClick={handleExport}>
            Exportar CSV
          </button>
        </div>
      </header>

      <main className="workspace__body">
        {activeView === 'dashboard' ? (
          <section className="dashboard">
            {overview.error ? (
              <div className="dashboard__empty">{overview.error}</div>
            ) : (
              <>
                <div className="dashboard__summary">
                  {dashboardSummary.map((item) => (
                    <article key={item.label} className="summary-card">
                      <span className="summary-card__label">{item.label}</span>
                      <span className="summary-card__value">{item.value}</span>
                    </article>
                  ))}
                </div>

                <div className="dashboard__panels">
                  <article className="panel">
                    <header className="panel__header">
                      <h2>Idiomas más utilizados</h2>
                      <span>
                        {overview.totalRecords ? `${overview.perLanguage.length} idiomas` : '—'}
                      </span>
                    </header>
                    {overview.loading ? (
                      <p className="panel__placeholder">Calculando…</p>
                    ) : overview.perLanguage.length ? (
                      <ul className="panel__list">
                        {overview.perLanguage.slice(0, 5).map((lang) => (
                          <li key={lang.label}>
                            <span>{lang.label.toUpperCase()}</span>
                            <span>{numberFormatter.format(lang.count)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="panel__placeholder">Aún no hay registros.</p>
                    )}
                  </article>

                  <article className="panel">
                    <header className="panel__header">
                      <h2>Dispositivos más activos</h2>
                      <span>
                        {overview.totalRecords ? `${overview.perDevice.length} dispositivos` : '—'}
                      </span>
                    </header>
                    {overview.loading ? (
                      <p className="panel__placeholder">Calculando…</p>
                    ) : overview.perDevice.length ? (
                      <ul className="panel__list">
                        {overview.perDevice.slice(0, 5).map((device) => (
                          <li key={device.label}>
                            <span>{device.label}</span>
                            <span>{numberFormatter.format(device.count)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="panel__placeholder">Aún no hay registros.</p>
                    )}
                  </article>

                  <article className="panel">
                    <header className="panel__header">
                      <h2>Actividad acumulada</h2>
                      <span>{overview.totalRecords ? 'Resumen' : '—'}</span>
                    </header>
                    {overview.loading ? (
                      <p className="panel__placeholder">Calculando…</p>
                    ) : overview.totalRecords ? (
                      <ul className="panel__facts">
                        <li>
                          <span>Primera transcripción</span>
                          <span>{formatDateTime(overview.firstRecordAt)}</span>
                        </li>
                        <li>
                          <span>Última transcripción</span>
                          <span>{formatDateTime(overview.lastRecordAt)}</span>
                        </li>
                        <li>
                          <span>Tiempo total</span>
                          <span>{formatDuration(overview.totalDurationMs)}</span>
                        </li>
                      </ul>
                    ) : (
                      <p className="panel__placeholder">
                        Registra tu primera transcripción para ver datos.
                      </p>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="history">
            <div className="history__controls">
              <div className="history__search">
                <label>
                  <span>Buscar</span>
                  <input
                    placeholder="Busca por texto, idioma o dispositivo…"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                  />
                </label>
                <label>
                  <span>Resultados por página</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="history__meta">
                <span>
                  Página {page} de {totalPages}
                </span>
                <span>{total ? `${numberFormatter.format(total)} registros` : 'Sin registros'}</span>
              </div>
            </div>

            <div className="history__table">
              <div className="history__table-inner">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '16%' }}>Fecha</th>
                      <th>Texto</th>
                      <th style={{ width: '12%' }}>Idioma</th>
                      <th style={{ width: '12%' }}>Duración</th>
                      <th style={{ width: '18%' }}>Dispositivo</th>
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
                          <td>{formatDateTime(record.createdAt)}</td>
                          <td>{record.text}</td>
                          <td>{record.lang.toUpperCase()}</td>
                          <td>{formatDuration(record.durationMs)}</td>
                          <td>{record.device || 'Sin especificar'}</td>
                          <td>
                            <button className="ghost-button" onClick={() => handleCopy(record.text)}>
                              Copiar
                            </button>
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
              </div>
            </div>

            <div className="history__pagination">
              <button onClick={() => handleChangePage('prev')} disabled={page === 1}>
                Anterior
              </button>
              <button onClick={() => handleChangePage('next')} disabled={page === totalPages}>
                Siguiente
              </button>
            </div>
          </section>
        )}
      </main>

      {statusMessage ? <div className="workspace__toast">{statusMessage}</div> : null}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>
);
