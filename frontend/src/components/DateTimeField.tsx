import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { formatDate, parseDate } from '../lib/conditions';

type Parts = { date: string; hour: string; minute: string; second: string; nano: string };
const pad = (value: string | number, width = 2) => String(value).padStart(width, '0');
function partsFrom(value: string): Parts {
  let date: Date;
  try {
    date = parseDate(value);
  } catch {
    date = new Date();
  }
  const formatted = formatDate(date);
  const fraction =
    value.trim().match(/\.(\d{1,9})(?:Z|[+-]\d{2}:\d{2})?$/)?.[1] ?? formatted.slice(20);
  return {
    date: formatted.slice(0, 10),
    hour: formatted.slice(11, 13),
    minute: formatted.slice(14, 16),
    second: formatted.slice(17, 19),
    nano: fraction.padEnd(9, '0'),
  };
}
const compose = (p: Parts) =>
  `${p.date} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(p.nano, 9)}`;

export default function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState(() => partsFrom(value));
  const [month, setMonth] = useState(parts.date.slice(0, 7));
  const today = formatDate(new Date()).slice(0, 10);
  const earliest = formatDate(new Date(Date.now() - 7 * 86400000)).slice(0, 10);
  const [year, monthNumber] = month.split('-').map(Number);
  const leading = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const invalid = +parts.hour > 23 || +parts.minute > 59 || +parts.second > 59;

  const position = () => {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    if (!rect.width) {
      popup.current.hidePopover();
      return;
    }
    const width = Math.min(370, window.innerWidth - 24);
    popup.current.style.width = `${width}px`;
    popup.current.style.maxHeight = `${window.innerHeight - 24}px`;
    const height = Math.min(popup.current.scrollHeight + 2, window.innerHeight - 24);
    const below = window.innerHeight - rect.bottom - 12;
    const top =
      below >= height
        ? rect.bottom + 8
        : Math.max(12, Math.min(rect.top - height - 8, window.innerHeight - height - 12));
    Object.assign(popup.current.style, {
      width: `${width}px`,
      left: `${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px`,
      top: `${top}px`,
      maxHeight: `${window.innerHeight - 24}px`,
    });
  };
  const close = () => {
    popup.current?.hidePopover();
    trigger.current?.focus();
  };
  const show = () => {
    const next = partsFrom(value);
    setParts(next);
    setMonth(next.date.slice(0, 7));
    popup.current?.showPopover();
    position();
  };
  const update = (next: Parts) => {
    setParts(next);
    onChange(compose(next));
  };
  useEffect(() => {
    if (!open) return;
    position();
    const observer = new ResizeObserver(position);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open, month]);

  return (
    <div className="datetime-field">
      <label className="datetime-label" htmlFor={`${id}-text`}>
        {label} <span>24시간제</span>
      </label>
      <div className="datetime-entry">
        <input
          id={`${id}-text`}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="YYYY-MM-DD HH:mm:ss.nnnnnnnnn"
          spellCheck={false}
        />
        <button
          ref={trigger}
          type="button"
          className="direct-calendar"
          aria-label={`${label} 달력 열기`}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={id}
          title={`${label} · 날짜와 시·분·초·나노초 선택`}
          onClick={() => (open ? close() : show())}
        >
          <CalendarDays size={18} />
        </button>
      </div>
      <div
        ref={popup}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={`${label} 선택`}
        className="datetime-popup"
        onToggle={(event) => setOpen(event.newState === 'open')}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="datetime-popup-heading">
          <strong>{label}</strong>
          <span>KST · 24시간제</span>
          <button
            type="button"
            className="icon-button"
            aria-label={`${label} 달력 닫기`}
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>
        <div className="calendar-month">
          <button
            type="button"
            className="icon-button"
            aria-label="이전 달"
            disabled={month <= earliest.slice(0, 7)}
            onClick={() =>
              setMonth(new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <strong aria-live="polite">
            {year}년 {monthNumber}월
          </strong>
          <button
            type="button"
            className="icon-button"
            aria-label="다음 달"
            disabled={month >= today.slice(0, 7)}
            onClick={() =>
              setMonth(new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7))
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="calendar-days" role="group" aria-label="날짜 선택">
          {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
            <span className="calendar-weekday" key={day}>
              {day}
            </span>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <span key={`blank-${index}`} aria-hidden="true" />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const date = `${month}-${pad(index + 1)}`;
            return (
              <button
                key={date}
                type="button"
                aria-label={`${year}년 ${monthNumber}월 ${index + 1}일`}
                aria-pressed={date === parts.date}
                aria-current={date === today ? 'date' : undefined}
                disabled={date < earliest || date > today}
                onClick={() => update({ ...parts, date })}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <div className="calendar-time" role="group" aria-label="시·분·초·나노초 입력">
          {(
            [
              ['hour', '시', '00–23', 2, 23],
              ['minute', '분', '00–59', 2, 59],
              ['second', '초', '00–59', 2, 59],
              ['nano', '나노초 (ns)', '9자리', 9, 999999999],
            ] as const
          ).map(([key, title, hint, digits, max]) => (
            <label key={key} className={key === 'nano' ? 'nano-field' : ''}>
              <span>{title}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${label} ${title}`}
                aria-invalid={+parts[key] > max}
                value={parts[key]}
                maxLength={digits}
                onFocus={(event) => event.target.select()}
                onChange={(event) => {
                  if (/^\d*$/.test(event.target.value))
                    update({ ...parts, [key]: event.target.value });
                }}
                onBlur={() => setParts((p) => ({ ...p, [key]: pad(p[key], digits) }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <small>{hint}</small>
            </label>
          ))}
        </div>
        {invalid && (
          <p className="inline-error" role="alert">
            시는 00~23, 분과 초는 00~59로 입력해 주세요.
          </p>
        )}
        <div className="calendar-preview">
          <span>선택한 날짜·시간</span>
          <output>{compose(parts)}</output>
        </div>
        <p className="calendar-hint">
          소수점 아래 9자리가 나노초입니다.
          <br />
          1초 = 1,000,000,000ns · 입력 즉시 반영
        </p>
        <div className="calendar-footer">
          <span>최근 7일 이내</span>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              const next = partsFrom(formatDate(new Date()));
              update(next);
              setMonth(next.date.slice(0, 7));
            }}
          >
            현재 시각
          </button>
        </div>
      </div>
    </div>
  );
}
