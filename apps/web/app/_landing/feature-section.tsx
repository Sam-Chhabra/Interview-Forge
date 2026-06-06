import Image from 'next/image';
import { cn } from '@/lib/utils';

type FeatureSectionProps = {
  eyebrow: string;
  headline: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  imagePosition: 'left' | 'right';
};

export function FeatureSection({
  eyebrow, headline, description, imageSrc, imageAlt, imagePosition,
}: FeatureSectionProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32 border-t">
      <div className={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-20 items-center",
        imagePosition === 'left' && "md:[&>*:first-child]:order-2"
      )}>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            {eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4 leading-tight">
            {headline}
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
        <div className="relative rounded-xl border bg-muted/30 p-2 shadow-sm overflow-hidden">
          <Image
            src={imageSrc}
            alt={imageAlt}
            width={800}
            height={600}
            className="rounded-lg w-full h-auto"
          />
        </div>
      </div>
    </section>
  );
}
