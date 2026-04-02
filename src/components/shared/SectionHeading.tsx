import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  light?: boolean;
  className?: string;
}

export function SectionHeading({ title, subtitle, light, className }: SectionHeadingProps) {
  return (
    <div className={cn("text-center", className)}>
      <h2
        className={cn(
          "font-heading text-3xl md:text-4xl font-bold",
          light ? "text-white" : "text-navy-900"
        )}
      >
        {title}
      </h2>
      <div className="w-16 h-1 bg-gold-500 mx-auto mt-4 rounded-full" />
      {subtitle && (
        <p
          className={cn(
            "mt-4 max-w-2xl mx-auto text-lg",
            light ? "text-gray-300" : "text-gray-600"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
