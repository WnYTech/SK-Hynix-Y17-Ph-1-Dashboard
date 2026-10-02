import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FileSearch,
  FolderOpen,
  Layers3,
  PanelTop,
  RefreshCw,
  Search,
  Settings2,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Conditions,
  DownloadJob,
  Metadata,
  Page,
  Program,
  SavedCondition,
  SourceStatus,
} from './types';
import { api } from './lib/api';
import { formatDate, initialConditions } from './lib/conditions';
import { readSaved, writeSaved } from './lib/storage';
import ProgramWorkspace, { type LoadRequest } from './components/ProgramWorkspace';
import { isProgram, programFromLocation, programKeys, programs } from './lib/programs';
import Dialog from './components/Dialog';

const labels: Record<Page, string> = {
  acell: programs.acell.title,
  arc: programs.arc.title,
  downloads: '다운로드',
  saved: '저장된 검색조건',
  connection: '연결 상태',
};
const statuses: Record<SourceStatus, string> = {
  checking: '연결 확인 중',
  unconfigured: '데이터 연결 대기',
  connected: '데이터 소스 연결됨',
  offline: 'API 연결 안 됨',
};

export default function App() {
  const [page, setPage] = useState<Page>(programFromLocation);
  const [lastProgram, setLastProgram] = useState<Program>(programFromLocation);
  const [loadRequest, setLoadRequest] = useState<LoadRequest | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [status, setStatus] = useState<SourceStatus>('checking');
  const [saved, setSaved] = useState<SavedCondition[]>(readSaved);
  const [saveConditions, setSaveConditions] = useState<Conditions | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [downloads, setDownloads] = useState<DownloadJob[]>([]);
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState(false);
  const navigate = (next: Page) => {
    setPage(next);
    if (isProgram(next)) {
      setLastProgram(next);
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}#program=${next}`,
      );
    }
  };
  useEffect(() => {
    document.title = `${labels[page]} · Y17`;
  }, [page]);
  useEffect(() => {
    const openLocation = () => {
      const program = programFromLocation();
      setPage(program);
      setLastProgram(program);
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (['g', 'key', 'system', 'start', 'end'].some((key) => params.has(key))) {
        setLoadRequest({ id: crypto.randomUUID(), conditions: initialConditions(program) });
      }
    };
    window.addEventListener('hashchange', openLocation);
    return () => window.removeEventListener('hashchange', openLocation);
  }, []);

  const refresh = async () => {
    setStatus('checking');
    try {
      const response = await api.metadata();
      setMetadata(response);
      setStatus(response.source_status);
    } catch {
      setMetadata(null);
      setStatus('offline');
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const save = () => {
    if (!saveConditions || !saveName.trim()) {
      setSaveError('검색조건 이름을 입력해 주세요.');
      return;
    }
    const next = [
      ...saved,
      {
        id: crypto.randomUUID(),
        name: saveName.trim(),
        savedAt: new Date().toISOString(),
        conditions: saveConditions,
      },
    ];
    try {
      writeSaved(next);
      setSaved(next);
      setSaveConditions(null);
      setNotice('검색조건을 이 브라우저에 저장했습니다.');
    } catch (err) {
      setSaveError((err as Error).message);
    }
  };
  const removeSaved = (id: string) => {
    const next = saved.filter((item) => item.id !== id);
    try {
      writeSaved(next);
      setSaved(next);
      setNotice('저장된 검색조건을 삭제했습니다.');
    } catch (err) {
      setNotice((err as Error).message);
    }
  };
  const refreshDownloads = async () => {
    setRefreshingJobs(true);
    try {
      const next = await Promise.all(
        downloads.map(async (job) =>
          ['queued', 'running'].includes(job.status)
            ? { ...job, ...(await api.exportStatus(job.id)) }
            : job,
        ),
      );
      setDownloads(next);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setRefreshingJobs(false);
    }
  };
  return (
    <div className="app-shell log-design">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate(lastProgram);
          }}
        >
          <span className="brand-icon">
            <Terminal size={22} />
          </span>
          <span>
            Y17<span className="brand-dot">.</span>
            <small>LOG WORKSPACE</small>
          </span>
        </a>
        <div className="project-card">
          <span className="project-avatar">
            <Layers3 size={19} />
          </span>
          <div>
            <strong>SK hynix</strong>
            <span>Y17 · Phase 1</span>
          </div>
          <span className="project-dot" />
        </div>
        <span className="nav-section-label">WORKSPACE</span>
        <nav>
          {(
            [
              { key: 'acell', icon: Activity },
              { key: 'arc', icon: FileSearch },
              { key: 'downloads', icon: ArrowDownToLine },
              { key: 'saved', icon: Bookmark },
            ] as const
          ).map(({ key, icon: Icon }) => (
            <button
              key={key}
              aria-label={labels[key]}
              className={`nav-item ${page === key ? 'active' : ''}`}
              onClick={() => navigate(key)}
              title={labels[key]}
              aria-current={page === key ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{labels[key]}</span>
              {(key === 'acell' || key === 'arc') && (
                <span className="nav-compact">{key === 'acell' ? 'Acell' : 'ARC'}</span>
              )}
              {key === 'saved' && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
              <ChevronRight
                size={14}
                className="nav-chevron"
                aria-hidden="true"
                style={{ visibility: page === key ? 'visible' : 'hidden' }}
              />
            </button>
          ))}
        </nav>
        <span className="nav-section-label second-label">MANAGEMENT</span>
        <button
          aria-label="연결 상태"
          className={`nav-item ${page === 'connection' ? 'active' : ''}`}
          onClick={() => navigate('connection')}
        >
          <Settings2 size={18} />
          <span>연결 상태</span>
        </button>
        <div className="sidebar-bottom">
          <div className="environment-card">
            <span className="environment-title">
              <span className="status-dot" />
              개발 워크스페이스
            </span>
            <p>
              연관 시스템의 로그를
              <br />
              한곳에서 탐색하세요.
            </p>
            <span className="version-label">
              FRAMEWORK <span>v0.1.0</span>
            </span>
          </div>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
            사용 가이드
            <ExternalLink size={13} />
          </button>
          <div className="sidebar-signature">
            <span className="wny-mark">W</span>
            <span>
              WnYTech<small>Engineering workspace</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Y17 Ph-1</span>
            <ChevronRight size={13} />
            <strong>{labels[page]}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection-indicator ${status}`}>
              <i />
              {metadata?.source_kind === 'dummy' && status === 'connected'
                ? '더미 데이터 연결됨'
                : statuses[status]}
            </span>
            <span className="topbar-divider" />
            <span className="locale" title="영문 UI는 후속 범위 협의 예정">
              한국어 <span>KO</span>
            </span>
            <span className="user-avatar" title="로컬 개발 환경 · SSO 미연결">
              Y17
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {isProgram(page) ? 'EXPLORE YOUR LOGS' : 'YOUR WORKSPACE'}
              </div>
              <h1>
                {labels[page]}
                {isProgram(page) && <span className="phase-badge">Y17 · Ph-1</span>}
              </h1>
              <p>
                {isProgram(page)
                  ? programs[page].description
                  : page === 'downloads'
                    ? '기간별 로그 다운로드 작업과 파일을 확인하세요.'
                    : page === 'saved'
                      ? '자주 사용하는 검색조건을 저장하고 다시 사용하세요.'
                      : 'API 서버와 로그 데이터 소스의 연결 상태를 확인하세요.'}
              </p>
            </div>
            {isProgram(page) && (
              <button
                className="button secondary new-window"
                onClick={() =>
                  window.open(
                    `${window.location.pathname}#program=${page}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                <ExternalLink size={15} />새 창 열기
              </button>
            )}
          </div>
          {isProgram(page) && status !== 'connected' && (
            <div className={`connection-banner ${status === 'offline' ? 'offline' : ''}`}>
              <span className="banner-icon">
                <Database size={18} />
              </span>
              <div>
                <strong>
                  {status === 'offline'
                    ? 'API 서버에 연결할 수 없습니다'
                    : status === 'checking'
                      ? '연결 상태를 확인하고 있습니다'
                      : '로그 데이터 소스를 연결해 주세요'}
                </strong>
                <span>
                  {status === 'offline'
                    ? '서버 실행 상태를 확인하고 다시 연결해 주세요.'
                    : '검색 화면이 준비되었습니다. 데이터 연결 후 로그 조회와 다운로드를 시작할 수 있습니다.'}
                </span>
              </div>
              <button onClick={() => navigate('connection')}>
                연결 상태 확인
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          {programKeys.map((program) => (
            <div
              key={program}
              className="program-workspace"
              data-program={program}
              style={{ display: page === program ? undefined : 'none' }}
            >
              <ProgramWorkspace
                program={program}
                metadata={metadata}
                status={status}
                loadRequest={loadRequest}
                onSave={(conditions) => {
                  setSaveConditions(conditions);
                  setSaveName('');
                  setSaveError('');
                }}
                onLoad={() => navigate('saved')}
                onExport={(job) => setDownloads((previous) => [...previous, job])}
                onMessage={setNotice}
              />
            </div>
          ))}
          {page === 'saved' && (
            <section className="panel management-panel">
              <div className="panel-heading">
                <div className="heading-label">
                  <Bookmark size={16} />
                  <h2>내 검색조건</h2>
                  <span className="count-badge">{saved.length}</span>
                </div>
                <span className="muted-text">이 브라우저에 저장됩니다</span>
              </div>
              {saved.length ? (
                <div className="saved-list">
                  {saved.map((item) => (
                    <article className="saved-item" key={item.id}>
                      <span className="saved-icon">
                        <FolderOpen size={21} />
                      </span>
                      <div>
                        <h3>{item.name}</h3>
                        <p>
                          {programs[item.conditions.program].title} ·{' '}
                          {formatDate(item.savedAt).slice(0, 16)}
                        </p>
                      </div>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setLoadRequest({ id: crypto.randomUUID(), conditions: item.conditions });
                          navigate(item.conditions.program);
                        }}
                      >
                        불러오기
                        <ArrowRight size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`${item.name} 삭제`}
                        onClick={() => removeSaved(item.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="management-empty">
                  <Bookmark size={34} strokeWidth={1.2} />
                  <h3>저장된 검색조건이 없습니다</h3>
                  <p>로그 탐색에서 조건을 설정한 후 ‘조건 저장’을 눌러 주세요.</p>
                  <button className="button secondary" onClick={() => navigate(lastProgram)}>
                    로그 탐색으로 이동
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </section>
          )}
          {page === 'downloads' && (
            <section className="panel management-panel">
              <div className="panel-heading">
                <div className="heading-label">
                  <ArrowDownToLine size={16} />
                  <h2>다운로드 작업</h2>
                  <span className="count-badge">{downloads.length}</span>
                </div>
                <button
                  className="text-button"
                  disabled={!downloads.length || refreshingJobs}
                  onClick={() => void refreshDownloads()}
                >
                  <RefreshCw size={14} />
                  새로고침
                </button>
              </div>
              {downloads.length ? (
                <div className="saved-list">
                  {downloads.map((job) => (
                    <article className="saved-item" key={job.id}>
                      <ArrowDownToLine size={21} />
                      <div>
                        <h3>
                          {programs[job.program].title} · {job.format.toUpperCase()} · {job.id}
                        </h3>
                        <p>
                          {job.status} · {job.processed_rows.toLocaleString()}행 ·{' '}
                          {formatDate(job.createdAt)}
                        </p>
                        {job.error && <p className="inline-error">{job.error}</p>}
                      </div>
                      {job.status === 'completed' &&
                        job.download_url &&
                        /^\/api\/exports\/[^/]+\/file$/.test(job.download_url) && (
                          <a className="button secondary" href={job.download_url} download>
                            파일 다운로드
                          </a>
                        )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="management-empty">
                  <ArrowDownToLine size={36} strokeWidth={1.2} />
                  <h3>아직 다운로드한 로그가 없습니다</h3>
                  <p>로그 탐색에서 기간과 검색조건을 지정해 다운로드를 요청하세요.</p>
                  <span className="empty-source">
                    <i />
                    {metadata?.source_kind === 'dummy' && status === 'connected'
                      ? '더미 데이터 연결됨'
                      : statuses[status]}
                  </span>
                </div>
              )}
            </section>
          )}
          {page === 'connection' && (
            <div className="connection-grid">
              <section className="panel connection-card">
                <div className="connection-card-icon">
                  <Activity size={23} />
                </div>
                <h2>API 서버</h2>
                <span
                  className={`connection-indicator ${status === 'offline' ? 'offline' : status === 'checking' ? 'checking' : 'connected'}`}
                >
                  <i />
                  {status === 'offline'
                    ? '연결 안 됨'
                    : status === 'checking'
                      ? '확인 중'
                      : '연결됨'}
                </span>
                <dl>
                  <dt>API 경로</dt>
                  <dd>/api</dd>
                  <dt>버전</dt>
                  <dd>v0.1.0</dd>
                </dl>
                <div className="button-group">
                  <button className="button secondary" onClick={() => void refresh()}>
                    <RefreshCw size={14} />
                    연결 확인
                  </button>
                  <a className="text-button" href="/api/docs" target="_blank" rel="noreferrer">
                    API 문서
                    <ExternalLink size={13} />
                  </a>
                </div>
              </section>
              <section className="panel connection-card">
                <div className="connection-card-icon">
                  <Database size={23} />
                </div>
                <h2>로그 데이터 소스</h2>
                <span className={`connection-indicator ${status}`}>
                  <i />
                  {metadata?.source_kind === 'dummy' && status === 'connected'
                    ? '더미 데이터 연결됨'
                    : statuses[status]}
                </span>
                <dl>
                  <dt>연결된 시스템</dt>
                  <dd>{metadata?.systems.length ?? '—'}</dd>
                  <dt>조회 가능 기간</dt>
                  <dd>최근 7일</dd>
                  <dt>표시 시간대</dt>
                  <dd>Asia/Seoul (KST)</dd>
                </dl>
                <p className="muted-text">
                  {metadata?.source_kind === 'dummy'
                    ? `개발용 더미 로그 ${metadata.total_records.toLocaleString()}건이 연결되어 있습니다. 실제 운영 로그는 포함하지 않습니다.`
                    : '연결 대상과 필드 매핑이 확정되면 데이터 소스를 연동합니다.'}
                </p>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-dot" />
              Y17 Log Workspace
            </span>
            <span>
              시간대 KST (UTC+09:00)<span className="footer-separator">·</span>v0.1.0
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{notice}</span>
          <button className="icon-button" aria-label="알림 닫기" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {saveConditions && (
        <Dialog title="검색조건 저장" onClose={() => setSaveConditions(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="dialog-body">
              <p className="dialog-description">검색조건과 기간 설정을 이 브라우저에 저장합니다.</p>
              <label className="field">
                <span>검색조건 이름</span>
                <input
                  autoFocus
                  maxLength={80}
                  placeholder="검색조건 이름 입력"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                />
              </label>
              <p className="field-hint">
                상대 기간은 불러온 후 검색하는 시점을 기준으로 적용됩니다.
              </p>
              {saveError && (
                <p role="alert" className="inline-error">
                  {saveError}
                </p>
              )}
            </div>
            <div className="dialog-footer">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSaveConditions(null)}
              >
                취소
              </button>
              <button type="submit" className="button primary">
                저장
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {help && (
        <Dialog title="로그 조회 사용 가이드" onClose={() => setHelp(false)}>
          <div className="dialog-body help-body">
            <div>
              <Search size={20} />
              <section>
                <h3>기간과 검색조건을 지정하세요</h3>
                <p>
                  최근 7일 이내의 로그를 조회합니다. 결과의 Datetime 값을 시간 입력란에 붙여 넣을 수
                  있습니다. 시간대는 KST입니다.
                </p>
              </section>
            </div>
            <div>
              <Layers3 size={20} />
              <section>
                <h3>여러 시스템의 흐름을 확인하세요</h3>
                <p>
                  System 전체 조회 시 Acell은 G 트랜잭션 ID, ARC LMS는 트랜잭션 키가 필요합니다.
                  개별 시스템을 선택하면 ID 없이 조회할 수 있습니다.
                </p>
              </section>
            </div>
            <div>
              <PanelTop size={20} />
              <section>
                <h3>로그를 비교하세요</h3>
                <p>
                  왼쪽 메뉴에서 프로그램을 전환해도 검색조건은 유지됩니다. 프로그램마다 + 버튼으로
                  최대 4개의 조회창을 열고 나란히 배치할 수 있습니다. 화면 내 검색은 해당 창의 현재
                  페이지에서 작동합니다.
                </p>
              </section>
            </div>
            <div>
              <ArrowDownToLine size={20} />
              <section>
                <h3>현재 데이터와 지원 범위</h3>
                <p>
                  {metadata?.source_kind === 'dummy'
                    ? '현재는 더미 로그로 검색과 연관검색을 사용할 수 있습니다. 전체 기간 다운로드와 실제 운영 로그는 후속 연동 항목입니다.'
                    : '데이터 소스 연결 후 조회할 수 있습니다. 전체 기간 다운로드는 작업 실행기 연동이 필요합니다.'}{' '}
                  SSO와 영문 화면은 후속 협의 항목입니다.
                </p>
              </section>
            </div>
          </div>
          <div className="dialog-footer">
            <button className="button primary" onClick={() => setHelp(false)}>
              확인
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
