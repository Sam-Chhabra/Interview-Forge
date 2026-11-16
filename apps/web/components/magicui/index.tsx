'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, useInView, useMotionTemplate, useMotionValue, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

export function DotPattern({
  width = 20,
  height = 20,
  cx = 1,
  cy = 1,
  cr = 1,
  className,
}: {
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full fill-neutral-400/35 dark:fill-neutral-500/25',
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}

export function GridPattern({
  width = 40,
  height = 40,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full stroke-zinc-200/70 dark:stroke-zinc-800/60',
        className,
      )}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <path d={`M ${width} 0 L 0 0 0 ${height}`} fill="none" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}

export function BorderBeam({
  className,
  size = 120,
  duration = 8,
  delay = 0,
  colorFrom = '#10b981',
  colorTo = '#3b82f6',
}: {
  className?: string;
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [mask-clip:padding-box,border-box] [mask-composite:intersect] [mask-image:linear-gradient(transparent,transparent),linear-gradient(#000,#000)]">
      <motion.div
        className={cn('absolute aspect-square rounded-full opacity-75 blur-[1px]', className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={{
          repeat: Infinity,
          ease: 'linear',
          duration,
          delay,
        }}
      />
    </div>
  );
}

export function MagicCard({
  children,
  className,
  gradientSize = 240,
  gradientColor = 'rgba(16, 185, 129, 0.09)',
}: {
  children: React.ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
}) {
  const mouseX = useMotionValue(-gradientSize);
  const mouseY = useMotionValue(-gradientSize);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  }

  function handleMouseLeave() {
    mouseX.set(-gradientSize);
    mouseY.set(-gradientSize);
  }

  const background = useMotionTemplate`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 80%)`;

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/70 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-foreground/25 hover:shadow-lg',
        className,
      )}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export function NumberTicker({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '0px' });
  const motionVal = useMotionValue(0);
  const springVal = useSpring(motionVal, { damping: 32, stiffness: 140 });
  const [display, setDisplay] = useState(() => value.toFixed(decimals));

  useEffect(() => {
    if (isInView) {
      motionVal.set(value);
    }
  }, [isInView, value, motionVal]);

  useEffect(() => {
    const unsub = springVal.on('change', (latest) => {
      setDisplay(Number(latest).toFixed(decimals));
    });
    return () => unsub();
  }, [springVal, decimals]);

  return (
    <span ref={ref} className={cn('tabular-nums tracking-tight', className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

export function BlurFade({
  children,
  className,
  delay = 0,
  duration = 0.45,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function AnimatedShinyBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3.5 py-1 text-xs font-medium text-foreground/90 shadow-2xs backdrop-blur-xs',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      {children}
    </div>
  );
}

export function MetricBar({
  value,
  max = 1,
  highlight = false,
  color = 'emerald',
  showPercent = false,
  decimals = 3,
}: {
  value: number;
  max?: number;
  highlight?: boolean;
  color?: 'emerald' | 'blue' | 'amber' | 'rose' | 'zinc';
  showPercent?: boolean;
  decimals?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barColors = {
    emerald: highlight ? 'bg-emerald-500' : 'bg-emerald-500/75',
    blue: highlight ? 'bg-blue-500' : 'bg-blue-500/75',
    amber: 'bg-amber-500/80',
    rose: 'bg-rose-500/80',
    zinc: 'bg-zinc-500/70',
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[115px]">
      <span
        className={cn(
          'w-12 font-mono text-xs tabular-nums',
          highlight ? 'font-bold text-foreground' : 'text-foreground/85',
        )}
      >
        {showPercent ? `${(value * 100).toFixed(1)}%` : value.toFixed(decimals)}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={cn('h-full rounded-full', barColors[color])}
        />
      </div>
    </div>
  );
}
