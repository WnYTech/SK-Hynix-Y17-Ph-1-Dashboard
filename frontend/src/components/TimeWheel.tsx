import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const ROW_HEIGHT = 30;
const wrap = (value: number, max: number) => ((value % (max + 1)) + max + 1) % (max + 1);

export default function TimeWheel({
  label,
  value,
  max,
  digits,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  digits: number;
  onChange: (value: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const normalized = Math.max(0, Math.min(max, Number(value) || 0));
  const current = useRef(normalized);
  const callback = useRef(onChange);
  callback.current = onChange;
  const movement = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ start: number; last: number; moved: boolean } | null>(null);
  const [offset, setOffset] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const display = (number: number) => String(number).padStart(digits, '0');

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const select = (next: number) => {
    current.current = wrap(next, max);
    callback.current(display(current.current));
  };
  const move = (delta: number) => {
    clearTimer();
    setSnapping(false);
    movement.current += delta;
    const steps = Math.trunc(movement.current / ROW_HEIGHT);
    if (steps) {
      movement.current -= steps * ROW_HEIGHT;
      select(current.current + steps);
    }
    setOffset(movement.current);
  };
  const settle = () => {
    clearTimer();
    if (Math.abs(movement.current) >= ROW_HEIGHT / 2)
      select(current.current + Math.sign(movement.current));
    movement.current = 0;
    setSnapping(true);
    setOffset(0);
  };
  useLayoutEffect(() => {
    // Typing or choosing another date must cancel an unfinished wheel gesture.
    if (current.current !== normalized) {
      clearTimer();
      current.current = normalized;
      movement.current = 0;
      setOffset(0);
    }
  }, [normalized]);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const pixels =
        event.deltaY *
        (event.deltaMode === 1 ? ROW_HEIGHT : event.deltaMode === 2 ? ROW_HEIGHT * 3 : 1);
      move(pixels);
      timer.current = setTimeout(settle, 120);
    };
    // React wheel listeners are passive; use a scoped native listener so this
    // wheel never scrolls the calendar or underlying page while selecting time.
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      clearTimer();
    };
  }, [max, digits]);

  return (
    <div
      ref={element}
      className={`time-wheel${snapping ? ' is-snapping' : ''}`}
      role="spinbutton"
      tabIndex={0}
      aria-label={`${label} 스크롤 선택`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={normalized}
      aria-valuetext={display(normalized)}
      title="휠·위아래 드래그·방향키로 선택 · 끝에서 처음으로 이어집니다"
      onKeyDown={(event) => {
        const steps: Record<string, number> = {
          ArrowUp: -1,
          ArrowDown: 1,
          PageUp: -5,
          PageDown: 5,
        };
        if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        clearTimer();
        movement.current = 0;
        setOffset(0);
        select(
          event.key === 'Home' ? 0 : event.key === 'End' ? max : current.current + steps[event.key],
        );
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        clearTimer();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { start: event.clientY, last: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const active = drag.current;
        if (!active.moved && Math.abs(event.clientY - active.start) < 5) return;
        active.moved = true;
        move(active.last - event.clientY);
        active.last = event.clientY;
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        if (!drag.current.moved) {
          const rect = event.currentTarget.getBoundingClientRect();
          const delta = Math.max(
            -1,
            Math.min(1, Math.floor((event.clientY - rect.top) / ROW_HEIGHT) - 1),
          );
          select(current.current + delta);
          movement.current = 0;
        }
        drag.current = null;
        settle();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        settle();
      }}
      onLostPointerCapture={() => {
        if (drag.current) {
          drag.current = null;
          settle();
        }
      }}
      onBlur={settle}
    >
      <div
        className="time-wheel-values"
        aria-hidden="true"
        style={{ transform: `translateY(${-ROW_HEIGHT - offset}px)` }}
      >
        {[-2, -1, 0, 1, 2].map((delta) => (
          <span key={delta} className={delta === 0 ? 'wheel-selected' : ''}>
            {display(wrap(normalized + delta, max))}
          </span>
        ))}
      </div>
    </div>
  );
}
