import { CalendarDays } from 'lucide-react';
import { formatDate, parseDate } from '../lib/conditions';

export default function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  let calendarValue = '';
  try {
    calendarValue = formatDate(parseDate(value)).replace(' ', 'T');
  } catch {
    /* Keep incomplete pasted/typed text until the user finishes. */
  }
  return (
    <div className="datetime-field">
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="YYYY-MM-DD HH:mm:ss"
        spellCheck={false}
      />
      <span className="direct-calendar" title={`${label} 달력에서 바로 선택 · KST`}>
        <CalendarDays size={18} aria-hidden="true" />
        <input
          aria-label={`${label} 달력 입력`}
          type="datetime-local"
          step="0.001"
          min={formatDate(new Date(Date.now() - 7 * 86400000 + 1000)).replace(' ', 'T')}
          max={formatDate(new Date()).replace(' ', 'T')}
          value={calendarValue}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker();
            } catch {
              /* Native keyboard entry remains available. */
            }
          }}
          onChange={(event) => {
            if (event.target.value) onChange(formatDate(parseDate(event.target.value)));
          }}
        />
      </span>
    </div>
  );
}
