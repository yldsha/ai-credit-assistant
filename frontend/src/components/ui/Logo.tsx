export function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 120" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 10 L10 90 H35 L42 70 H58 L65 90 H90 L50 10 Z M50 35 L57 55 H43 L50 35 Z" fill="#EF3124" />
      <rect x="10" y="100" width="80" height="12" rx="2" fill="#EF3124" />
    </svg>
  );
}