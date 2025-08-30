'use client';

import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';

type Props = {
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  isRTL?: boolean;
};

// Inline SVG (uses currentColor)
function VsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M16 4L6 20" vectorEffect="non-scaling-stroke" />
      <path d="M3 4L7 12L11 4" vectorEffect="non-scaling-stroke" />
      <path d="M19 13.5V13C19 12.4477 18.5523 12 18 12H15C14.4477 12 14 12.4477 14 13V15C14 15.5523 14.4477 16 15 16H18C18.5523 16 19 16.4477 19 17V19C19 19.5523 18.5523 20 18 20H15C14.4477 20 14 19.5523 14 19V18.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function CompareChip({
  selected,
  disabled = false,
  onToggle,
  isRTL,
}: Props) {
  const { t } = useLanguage();
  const { colors } = useTheme();

  const isRtl = !!isRTL;
  const willAdd = !selected;

  const labelCompare = String(t('menu.compare') ?? 'Compare');
  const labelComparing = String(t('menu.comparing') ?? 'Comparing');
  const labelLimit = String(t('menu.compareLimit') ?? `You can compare up to 2 items`);

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled && willAdd) return;
    onToggle();
  };

  const ariaLabel = (disabled && willAdd) ? labelLimit : (selected ? labelComparing : labelCompare);

  return (
    <div className={['absolute top-2 z-10', isRtl ? 'left-2' : 'right-2'].join(' ')}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        aria-label={ariaLabel}
        disabled={disabled && willAdd}
        className={[
          'inline-flex items-center rounded-full border shadow-sm',
          'px-2.5 py-1 min-h-[28px] text-[11px] font-medium gap-1.5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-400',
        ].join(' ')}
        style={{
            background: selected
            ? `${colors.accent}`
            : 'white',
          borderColor: selected ? 'transparent' : '#d1d5db',
          color: selected ? '#ffffff' : 'black',
          cursor: disabled && willAdd ? 'not-allowed' : 'pointer',
          opacity: disabled && willAdd ? 0.6 : 1,
        }}
      >
        {/* Icon (inherits color from button via currentColor) */}
        <VsIcon className="block shrink-0 h-5 w-5" />      </button>
    </div>
  );
}