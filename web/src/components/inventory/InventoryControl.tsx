import React, { useState, useRef, useEffect } from 'react';
import { useDrop } from 'react-dnd';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectItemAmount, setItemAmount, selectLeftInventory } from '../../store/inventory';
import { DragSource } from '../../typings';
import { onUse } from '../../dnd/onUse';
import { onGive } from '../../dnd/onGive';
import { fetchNui } from '../../utils/fetchNui';
import { Locale } from '../../store/locale';
import UsefulControls from './UsefulControls';

const formatAmount = (n: number) => (n > 0 ? n.toLocaleString('en-US') : '0');
const digitsOnly = (s: string) => s.replace(/\D/g, '');
const countDigitsBefore = (s: string, index: number) => digitsOnly(s.substring(0, index)).length;

const InventoryControl: React.FC = () => {
  const itemAmount = useAppSelector(selectItemAmount);
  const leftInventory = useAppSelector(selectLeftInventory);
  const dispatch = useAppDispatch();

  /* Largest stack the player is carrying. It is the only honest ceiling this
   * component has: the amount is not tied to one slot, and onDrop/onBuy clamp
   * it to the source stack anyway - `amount === 0 || amount > count` both take
   * the whole stack. So a full bar means "every transfer takes the lot". */
  const maxCount = React.useMemo(
    () => leftInventory.items.reduce((max, item) => (item?.count && item.count > max ? item.count : max), 0),
    [leftInventory.items]
  );

  // 0 means "all", so it fills the bar rather than emptying it
  const fillRatio = maxCount === 0 ? 0 : itemAmount === 0 ? 1 : Math.min(1, itemAmount / maxCount);

  const [infoVisible, setInfoVisible] = useState(false);
  const [value, setValue] = useState(formatAmount(itemAmount));
  const inputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<number | null>(null);

  const [, use] = useDrop<DragSource, void, any>(() => ({
    accept: 'SLOT',
    drop: (source) => {
      source.inventory === 'player' && onUse(source.item);
    },
  }));

  const [, give] = useDrop<DragSource, void, any>(() => ({
    accept: 'SLOT',
    drop: (source) => {
      source.inventory === 'player' && onGive(source.item);
    },
  }));

  const commitValue = (raw: string, cursorIndex: number) => {
    const digitsBefore = countDigitsBefore(raw, cursorIndex);
    const num = parseInt(digitsOnly(raw), 10) || 0;

    setValue(formatAmount(num));
    dispatch(setItemAmount(num));
    cursorRef.current = digitsBefore;
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    commitValue(event.target.value, event.target.selectionStart ?? 0);

  const applyAmount = (num: number) => {
    setValue(formatAmount(num));
    dispatch(setItemAmount(num));
  };

  /** Nudge the amount without retyping it. Clamped at zero. */
  const step = (delta: number) => applyAmount(Math.max(0, (parseInt(digitsOnly(value), 10) || 0) + delta));

  const trackRef = useRef<HTMLDivElement>(null);
  // Only a drag that STARTED on the track may scrub. Checking "is a button
  // held" is not enough: dragging an item across the screen passes over this
  // element with the button down and would otherwise rewrite the amount.
  const scrubbingRef = useRef(false);

  /** Drag the fill bar to scrub the amount across the largest stack held.
   *  Lands on 1..maxCount rather than 0..maxCount: 0 is the "all" sentinel, and
   *  putting "everything" at the far LEFT of a slider would read as nonsense.
   *  Type 0 to get the sentinel back. */
  const scrubTo = (clientX: number) => {
    const el = trackRef.current;
    if (!el || maxCount === 0) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    applyAmount(Math.max(1, Math.round(ratio * maxCount)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const el = event.currentTarget;
    const pos = el.selectionStart ?? 0;

    if (pos !== el.selectionEnd) return;

    if (event.key === 'Backspace' && el.value[pos - 1] === ',') {
      event.preventDefault();
      commitValue(el.value.slice(0, pos - 2) + el.value.slice(pos), pos - 2);
    } else if (event.key === 'Delete' && el.value[pos] === ',') {
      event.preventDefault();
      commitValue(el.value.slice(0, pos) + el.value.slice(pos + 2), pos);
    }
  };

  useEffect(() => {
    if (!inputRef.current || cursorRef.current === null) return;
    let newPos = 0;
    let count = 0;

    for (let i = 0; i < value.length && count < cursorRef.current; i++) {
      if (/\d/.test(value[i])) count++;
      newPos++;
    }

    inputRef.current.setSelectionRange(newPos, newPos);
    cursorRef.current = null;
  }, [value]);

  return (
    <>
      <UsefulControls infoVisible={infoVisible} setInfoVisible={setInfoVisible} />
      <div className="inventory-control">
        <div className="inventory-control-wrapper">
          <div className="inventory-control-stepper">
            <div className="inventory-control-stepper-row">
              <button
                className="inventory-control-step inventory-control-step-down"
                type="button"
                tabIndex={-1}
                aria-label="decrease"
                onClick={() => step(-1)}
              />
              <input
                className="inventory-control-input"
                type="text"
                ref={inputRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                min={0}
              />
              <button
                className="inventory-control-step inventory-control-step-up"
                type="button"
                tabIndex={-1}
                aria-label="increase"
                onClick={() => step(1)}
              />
            </div>
            <div
              className="inventory-control-progress"
              ref={trackRef}
              role="slider"
              aria-label="amount"
              aria-valuemin={0}
              aria-valuemax={maxCount}
              aria-valuenow={itemAmount}
              data-full={fillRatio >= 1 || undefined}
              data-disabled={maxCount === 0 || undefined}
              onPointerDown={(event) => {
                if (maxCount === 0 || event.button !== 0) return;
                scrubbingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                scrubTo(event.clientX);
              }}
              onPointerMove={(event) => {
                // pointer capture keeps events coming once the cursor leaves
                // the track, but only for a drag we started
                if (scrubbingRef.current && event.buttons & 1) scrubTo(event.clientX);
              }}
              onPointerUp={() => {
                scrubbingRef.current = false;
              }}
              onPointerCancel={() => {
                scrubbingRef.current = false;
              }}
              onLostPointerCapture={() => {
                scrubbingRef.current = false;
              }}
            >
              <div
                className="inventory-control-progress-fill"
                style={{ transform: `scaleX(${fillRatio})` }}
              />
            </div>
          </div>
          <button
            className="inventory-control-button inventory-control-use"
            ref={(el) => {
              use(el);
            }}
          >
            {Locale.ui_use || 'Use'}
          </button>
          <button
            className="inventory-control-button inventory-control-give"
            ref={(el) => {
              give(el);
            }}
          >
            {Locale.ui_give || 'Give'}
          </button>
          <button className="inventory-control-button inventory-control-close" onClick={() => fetchNui('exit')}>
            {Locale.ui_close || 'Close'}
          </button>
        </div>
      </div>

      <button className="useful-controls-button" onClick={() => setInfoVisible(true)}>
        <svg xmlns="http://www.w3.org/2000/svg" height="2em" viewBox="0 0 524 524">
          <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336h24V272H216c-13.3 0-24-10.7-24-24s10.7-24 24-24h48c13.3 0 24 10.7 24 24v88h8c13.3 0 24 10.7 24 24s-10.7 24-24 24H216c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z" />
        </svg>
      </button>
    </>
  );
};

export default InventoryControl;
