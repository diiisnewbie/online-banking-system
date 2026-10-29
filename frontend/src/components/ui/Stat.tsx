import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'default' | 'emerald' | 'amber' | 'rose' | 'indigo';
  className?: string;
}

const valueColors = {
  default: 'text-white',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  indigo: 'text-indigo-400',
};

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  subValue,
  icon,
  variant = 'default',
  className = '',
}) => {
  return (
    <div className={`p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span className="font-medium">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className={`text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums ${valueColors[variant]}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
          {subValue}
        </div>
      )}
    </div>
  );
};

