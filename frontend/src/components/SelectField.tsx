import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

// Native popovers escape panel overflow and stay inside a modal's focus scope.
export default function SelectField({ label, value, options, onChange, disabled }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [active, setActive] = useState(selected);
  const typed = useRef({ text: '', at: 0 });

  const position = () => {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    if (!rect.width) {
      popup.current.hidePopover();
      return;
    }
    const below = window.innerHeight - rect.bottom - 14;
    const above = rect.top - 14;
    const upwards = below < 224 && above > below;
    const height = Math.min(224, Math.max(44, upwards ? above : below));
    Object.assign(popup.current.style, {
      width: `${rect.width}px`,
      left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`,
      top: upwards ? 'auto' : `${rect.bottom + 6}px`,
      bottom: upwards ? `${window.innerHeight - rect.top + 6}px` : 'auto',
      maxHeight: `${height}px`,
    });
  };
  const close = () => popup.current?.hidePopover();
  const show = () => {
    position();
    setActive(selected);
    popup.current?.showPopover();
    setOpen(true);
  };
  const choose = (index: number) => {
    if (options[index]) onChange(options[index].value);
    close();
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(position);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);
  useEffect(() => {
    if (open) popup.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  return (
    <div className="select-field">
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            close();
            return;
          }
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
          }
          if (['Enter', ' '].includes(event.key)) {
            event.preventDefault();
            if (open) choose(active);
            else show();
          } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            if (!open) show();
            setActive((index) =>
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        (open ? index : selected) + (event.key === 'ArrowDown' ? 1 : -1),
                      ),
                    ),
            );
          } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const text =
              (Date.now() - typed.current.at < 700 ? typed.current.text : '') + event.key;
            typed.current = { text, at: Date.now() };
            const index = options.findIndex((option) =>
              option.label.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()),
            );
            if (!open) show();
            if (index >= 0) setActive(index);
          }
        }}
      >
        <span>{options.find((option) => option.value === value)?.label ?? value}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div
        ref={popup}
        id={id}
        className="select-popup"
        popover="auto"
        role="listbox"
        aria-label={label}
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${id}-${index}`}
            role="option"
            aria-selected={option.value === value}
            className={`select-option ${index === active ? 'is-active' : ''}`}
            onPointerMove={() => setActive(index)}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <span className="select-option-check">
              {option.value === value && <Check size={16} />}
            </span>
            <span>{option.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
