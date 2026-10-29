import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'flat' | 'interactive' | 'highlight';
  glow?: 'none' | 'indigo' | 'emerald' | 'rose';
  children: React.ReactNode;
}

const variantStyles = {
  default:
    'bg-slate-900/80 border border-slate-800/80 backdrop-blur-md shadow-xl rounded-2xl',
  flat: 'bg-slate-850/60 border border-slate-800 rounded-xl',
  interactive:
    'bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 backdrop-blur-md shadow-xl rounded-2xl transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5',
  highlight:
    'bg-gradient-to-b from-indigo-950/40 to-slate-900/90 border border-indigo-500/30 backdrop-blur-md shadow-xl rounded-2xl',
};

const glowStyles = {
  none: '',
  indigo: 'shadow-indigo-500/10 hover:shadow-indigo-500/20',
  emerald: 'shadow-emerald-500/10 hover:shadow-emerald-500/20',
  rose: 'shadow-rose-500/10 hover:shadow-rose-500/20',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  glow = 'none',
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`${variantStyles[variant]} ${glowStyles[glow]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

