import React from 'react';

export type BadgeVariant =
  | 'success' // Active / Hoạt động
  | 'info' // Đã đáo hạn / Thông tin
  | 'neutral' // Đã tất toán / Mặc định
  | 'warning' // Nợ lãi / Đang chờ / Grace
  | 'danger' // Paused / Lỗi / Phạt
  | 'accent'; // Token ID / Plan ID / Nhấn mạnh

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  dot?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30',
  info: 'bg-sky-950/70 text-sky-400 border-sky-500/30',
  neutral: 'bg-slate-800/80 text-slate-300 border-slate-700/60',
  warning: 'bg-amber-950/70 text-amber-300 border-amber-500/30',
  danger: 'bg-rose-950/70 text-rose-300 border-rose-500/30',
  accent: 'bg-indigo-950/70 text-indigo-300 border-indigo-500/30',
};

const dotStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400',
  info: 'bg-sky-400',
  neutral: 'bg-slate-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  accent: 'bg-indigo-400',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center space-x-1.5 rounded-full font-medium border tabular-nums ${variantStyles[variant]} ${sizeClass} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]} animate-pulse`} />}
      <span>{children}</span>
    </span>
  );
};

