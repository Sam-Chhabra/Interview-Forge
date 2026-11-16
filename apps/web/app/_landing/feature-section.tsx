import Image from 'next/image';
import { cn } from '@/lib/utils';
import { MagicCard } from '@/components/magicui';

type FeatureSectionProps = {
  eyebrow: string;
  headline: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  imagePosition: 'left' | 'right';
};

export function FeatureSection({
  eyebrow,
  headline,
  description,
  imageSrc,
  imageAlt,
  imagePosition,
}: FeatureSectionProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28 border-t border-border/60">
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 items-center',
          imagePosition === 'left' && 'md:[&>*:first-child]:order-2',
        )}
      >
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-3">
            {eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 leading-tight">
            {headline}
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
        <MagicCard
          className="overflow-hidden border-border/70 bg-card/60 p-2 shadow-2xl"
          gradientColor="rgba(255,255,255,0.06)"
        >
          <div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          </div>
          <Image
            src={imageSrc}
            alt={imageAlt}
            width={800}
            height={600}
            className="rounded-lg w-full h-auto border border-border/50 dark:invert dark:hue-rotate-180 dark:contrast-95"
          />
        </MagicCard>
      </div>
    </section>
  );
}
