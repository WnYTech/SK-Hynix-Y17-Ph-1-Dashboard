import { useCallback, useEffect, useRef, useState } from 'react';
import { Columns2, LayoutGrid, PanelTop, Plus, Rows2, X } from 'lucide-react';
import type { Conditions, DownloadJob, Layout, Metadata, Program, SourceStatus } from '../types';
import { initialConditions } from '../lib/conditions';
import Workspace from './Workspace';

interface Viewer {
  id: string;
  name: string;
  initial: Conditions;
}
export interface LoadRequest {
  id: string;
  conditions: Conditions;
}
interface Props {
  program: Program;
  metadata: Metadata | null;
  status: SourceStatus;
  loadRequest: LoadRequest | null;
  onSave: (conditions: Conditions) => void;
  onLoad: () => void;
  onExport: (job: DownloadJob) => void;
  onMessage: (message: string) => void;
}

export default function ProgramWorkspace({
  program,
  metadata,
  status,
  loadRequest,
  onSave,
  onLoad,
  onExport,
  onMessage,
}: Props) {
  const [viewers, setViewers] = useState<Viewer[]>(() => [
    { id: 'main', name: '조회창 01', initial: initialConditions(program) },
  ]);
  const [active, setActive] = useState('main');
  const [layout, setLayout] = useState<Layout>('tabs');
  const nextViewer = useRef(2);
  const handledRequest = useRef<string | null>(null);
  const addViewer = useCallback(
    (conditions?: Conditions) => {
      if (viewers.length >= 4) {
        onMessage(
          '프로그램별 최대 4개의 조회창을 열 수 있습니다. 조회창을 닫은 후 다시 불러와 주세요.',
        );
        return;
      }
      const id = crypto.randomUUID();
      const name = `조회창 ${String(nextViewer.current++).padStart(2, '0')}`;
      setViewers((previous) => [
        ...previous,
        { id, name, initial: conditions ?? initialConditions(program, false) },
      ]);
      setActive(id);
    },
    [viewers.length, program, onMessage],
  );
  useEffect(() => {
    if (
      !loadRequest ||
      loadRequest.conditions.program !== program ||
      handledRequest.current === loadRequest.id
    )
      return;
    handledRequest.current = loadRequest.id;
    addViewer(loadRequest.conditions);
  }, [loadRequest, program, addViewer]);
  const closeViewer = (id: string) => {
    const next = viewers.filter((viewer) => viewer.id !== id);
    setViewers(next);
    if (active === id) setActive(next[0].id);
  };
  return (
    <>
      <div className="viewer-toolbar">
        <div className="viewer-tabs" role="tablist" aria-label="조회창 목록">
          {viewers.map((viewer) => (
            <div className={`viewer-tab ${active === viewer.id ? 'active' : ''}`} key={viewer.id}>
              <button
                role="tab"
                aria-selected={active === viewer.id}
                onClick={() => setActive(viewer.id)}
              >
                <PanelTop size={15} />
                {viewer.name}
              </button>
              {viewers.length > 1 && (
                <button
                  className="close-tab"
                  aria-label={`${viewer.name} 닫기`}
                  onClick={() => closeViewer(viewer.id)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
          <button
            className="add-viewer"
            aria-label="조회창 추가"
            title="조회창 추가"
            disabled={viewers.length >= 4}
            onClick={() => addViewer()}
          >
            <Plus size={17} />
          </button>
        </div>
        <div className="layout-controls" aria-label="창 배치">
          <span>보기</span>
          {(
            [
              { value: 'tabs', label: '탭으로 보기', icon: LayoutGrid },
              { value: 'horizontal', label: '수평으로 나란히 보기', icon: Columns2 },
              { value: 'vertical', label: '수직으로 쌓아 보기', icon: Rows2 },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              title={label}
              aria-label={label}
              aria-pressed={layout === value}
              className={layout === value ? 'active' : ''}
              onClick={() => setLayout(value)}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>
      <div className={`viewers-layout layout-${layout}`}>
        {viewers.map((viewer) => (
          <div
            key={viewer.id}
            className="viewer-container"
            style={{
              display: layout === 'tabs' && active !== viewer.id ? 'none' : undefined,
            }}
          >
            {layout !== 'tabs' && <div className="tiled-viewer-name">{viewer.name}</div>}
            <Workspace
              program={program}
              initial={viewer.initial}
              metadata={metadata}
              status={status}
              onSave={onSave}
              onLoad={onLoad}
              onExport={onExport}
              onMessage={onMessage}
            />
          </div>
        ))}
      </div>
    </>
  );
}
