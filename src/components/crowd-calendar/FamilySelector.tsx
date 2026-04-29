'use client';

import { PARK_FAMILIES, type ParkFamily } from '@/lib/constants';

interface FamilySelectorProps {
  selectedFamilyId: string;
  onFamilyChange: (familyId: string) => void;
}

export function FamilySelector({ selectedFamilyId, onFamilyChange }: FamilySelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PARK_FAMILIES.map((family) => (
        <button
          key={family.id}
          onClick={() => onFamilyChange(family.id)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
            selectedFamilyId === family.id
              ? 'bg-primary-700 text-white shadow-md'
              : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
          }`}
        >
          <span>{family.name}</span>
          <span className="ml-1.5 text-xs opacity-70">({family.parks.length} parks)</span>
        </button>
      ))}
    </div>
  );
}
