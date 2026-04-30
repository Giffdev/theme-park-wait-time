'use client';

import AttractionFilterChip from './AttractionFilterChip';
import type { AttractionType } from '@/types/attraction';

/** Entity types from the API */
export type EntityType = 'ATTRACTION' | 'SHOW' | 'RESTAURANT';

export interface FilterState {
  entityTypes: Set<EntityType>;
  attractionTypes: Set<AttractionType>;
}

/** Tier 1: broad entity categories */
const ENTITY_TYPE_CHIPS: { value: EntityType; label: string; color: 'coral' | 'blue' | 'green' | 'amber' }[] = [
  { value: 'ATTRACTION', label: 'All Rides', color: 'coral' },
  { value: 'SHOW', label: 'Shows', color: 'blue' },
  { value: 'RESTAURANT', label: 'Dining', color: 'green' },
];

/** Tier 2: attraction sub-types (only when ATTRACTION is selected) */
const ATTRACTION_TYPE_CHIPS: { value: AttractionType; label: string; color: 'purple' | 'coral' | 'blue' | 'green' | 'amber' }[] = [
  { value: 'thrill', label: 'Thrill', color: 'coral' },
  { value: 'family', label: 'Family', color: 'blue' },
  { value: 'experience', label: 'Experience', color: 'green' },
  { value: 'character-meet', label: 'Character Meet', color: 'purple' },
  { value: 'parade', label: 'Parade', color: 'amber' },
];

interface AttractionFilterChipsProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableTypes?: Set<AttractionType>;
}

export default function AttractionFilterChips({ filters, onChange, availableTypes }: AttractionFilterChipsProps) {
  const isAllSelected = filters.entityTypes.size === 0;
  const showTier2 = filters.entityTypes.has('ATTRACTION') || isAllSelected;

  const handleAllClick = () => {
    onChange({ entityTypes: new Set(), attractionTypes: new Set() });
  };

  const toggleEntityType = (type: EntityType) => {
    const next = new Set(filters.entityTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    // If ATTRACTION is deselected, clear tier 2 filters
    const nextAttractionTypes = next.has('ATTRACTION') || next.size === 0
      ? filters.attractionTypes
      : new Set<AttractionType>();
    onChange({ entityTypes: next, attractionTypes: nextAttractionTypes });
  };

  const toggleAttractionType = (type: AttractionType) => {
    const next = new Set(filters.attractionTypes);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    onChange({ ...filters, attractionTypes: next });
  };

  return (
    <div className="mb-6 space-y-2">
      {/* Tier 1: Entity type chips */}
      <div className="flex flex-wrap gap-2">
        <AttractionFilterChip
          label="All"
          active={isAllSelected}
          onClick={handleAllClick}
          color="default"
        />
        {ENTITY_TYPE_CHIPS.map((chip) => (
          <AttractionFilterChip
            key={chip.value}
            label={chip.label}
            active={filters.entityTypes.has(chip.value)}
            onClick={() => toggleEntityType(chip.value)}
            color={chip.color}
          />
        ))}
      </div>

      {/* Tier 2: Attraction sub-type chips (shown when rides are visible) */}
      {showTier2 && (
        <div className="flex flex-wrap gap-2">
          <span className="shrink-0 self-center text-[10px] font-medium uppercase tracking-wider text-primary-400">
            Type
          </span>
          {(availableTypes
            ? ATTRACTION_TYPE_CHIPS.filter(chip => availableTypes.has(chip.value))
            : ATTRACTION_TYPE_CHIPS
          ).map((chip) => (
            <AttractionFilterChip
              key={chip.value}
              label={chip.label}
              active={filters.attractionTypes.has(chip.value)}
              onClick={() => toggleAttractionType(chip.value)}
              color={chip.color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
