import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { formatDate, parseDate } from '../lib/conditions';
import Dialog from './Dialog';

export default function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const show = () => {
    try {
      setDraft(formatDate(parseDate(value)).replace(' ', 'T'));
    } catch {
      setDraft(formatDate(new Date()).replace(' ', 'T'));
    }
    setError('');
    setOpen(true);
  };
  const apply = () => {
    try {
      const date = parseDate(draft);
      if (+date < Date.now() - 7 * 86400000 || +date > Date.now() + 5000)
        throw new Error('최근 7일 이내의 시간을 선택해 주세요.');
      onChange(formatDate(date));
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="datetime-field">
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="YYYY-MM-DD HH:mm:ss"
        spellCheck={false}
      />
      <button
        type="button"
        className="icon-button"
        aria-label={`${label} 달력 열기`}
        title={`${label} 달력 열기`}
        onClick={show}
      >
        <CalendarDays size={18} />
      </button>
      {open && (
        <Dialog title={`${label} 선택`} onClose={() => setOpen(false)}>
          <div className="dialog-body">
            <p className="dialog-description">
              한국 시간(KST)을 기준으로 날짜와 시간을 선택하세요.
            </p>
            <label className="field">
              <span>{label}</span>
              <input
                className="calendar-datetime"
                aria-label={`${label} 달력 입력`}
                type="datetime-local"
                step="0.001"
                min={formatDate(new Date(Date.now() - 7 * 86400000 + 1000)).replace(' ', 'T')}
                max={formatDate(new Date()).replace(' ', 'T')}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <button type="button" className="button secondary" onClick={() => setOpen(false)}>
              취소
            </button>
            <button type="button" className="button primary" onClick={apply}>
              기간에 적용
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
