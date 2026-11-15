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
        <MagicCard className="p-2.5 shadow-xl bg-muted/20">
          <Image
            src={imageSrc}
            alt={imageAlt}
            width={800}
            height={600}
            className="rounded-lg w-full h-auto border border-border/50"
          />
        </MagicCard>
      </div>
    </section>
  );
}
