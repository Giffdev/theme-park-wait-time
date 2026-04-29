'use client';

interface AttractionFilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: 'default' | 'coral' | 'blue' | 'green' | 'purple' | 'amber';
}

const colorMap = {
  default: {
    active: 'bg-primary-800 text-white border-primary-800',
    inactive: 'bg-white text-primary-600 border-primary-200 hover:border-primary-400 hover:bg-primary-50',
  },
  coral: {
    active: 'bg-coral-500 text-white border-coral-500',
    inactive: 'bg-white text-coral-600 border-coral-200 hover:border-coral-400 hover:bg-coral-50',
  },
  blue: {
    active: 'bg-blue-600 text-white border-blue-600',
    inactive: 'bg-white text-blue-600 border-blue-200 hover:border-blue-400 hover:bg-blue-50',
  },
  green: {
    active: 'bg-green-600 text-white border-green-600',
    inactive: 'bg-white text-green-600 border-green-200 hover:border-green-400 hover:bg-green-50',
  },
  purple: {
    active: 'bg-purple-600 text-white border-purple-600',
    inactive: 'bg-white text-purple-600 border-purple-200 hover:border-purple-400 hover:bg-purple-50',
  },
  amber: {
    active: 'bg-amber-500 text-white border-amber-500',
    inactive: 'bg-white text-amber-600 border-amber-200 hover:border-amber-400 hover:bg-amber-50',
  },
};

export default function AttractionFilterChip({
  label,
  active,
  onClick,
  color = 'default',
}: AttractionFilterChipProps) {
  const styles = colorMap[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
        active ? styles.active : styles.inactive
      }`}
    >
      {label}
    </button>
  );
}
