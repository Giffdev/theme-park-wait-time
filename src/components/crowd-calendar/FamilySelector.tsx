'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PARK_FAMILIES, type ParkFamily } from '@/lib/constants';

interface FamilySelectorProps {
  selectedFamilyId: string;
  onFamilyChange: (familyId: string) => void;
}

export function FamilySelector({ selectedFamilyId, onFamilyChange }: FamilySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedFamily = PARK_FAMILIES.find((f) => f.id === selectedFamilyId);

  const filtered = PARK_FAMILIES.filter((family) =>
    family.name.toLowerCase().includes(query.toLowerCase()),
  );

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const selectFamily = useCallback(
    (familyId: string) => {
      onFamilyChange(familyId);
      setIsOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [onFamilyChange],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && filtered[highlightedIndex]) {
          selectFamily(filtered[highlightedIndex].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
        break;
      case 'Home':
        if (isOpen) {
          e.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case 'End':
        if (isOpen) {
          e.preventDefault();
          setHighlightedIndex(filtered.length - 1);
        }
        break;
    }
  }

  const listboxId = 'family-selector-listbox';

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        {/* Show selected family name as a floating label when not searching */}
        {selectedFamily && !isOpen && !query && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-primary-900 pointer-events-none">
            {selectedFamily.name}
          </span>
        )}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen && filtered[highlightedIndex]
              ? `family-option-${filtered[highlightedIndex].id}`
              : undefined
          }
          aria-autocomplete="list"
          aria-label="Select park family"
          placeholder={isOpen || !selectedFamily ? 'Search or select a park family…' : ''}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-lg border border-primary-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-primary-900 placeholder:text-primary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 ${
            selectedFamily && !isOpen && !query ? 'text-transparent caret-transparent' : ''
          }`}
        />
        {/* Chevron indicator */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => {
            setIsOpen(!isOpen);
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-primary-400"
        >
          <svg
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Park families"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-primary-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-primary-400">No families found</li>
          ) : (
            filtered.map((family, index) => (
              <li
                key={family.id}
                id={`family-option-${family.id}`}
                role="option"
                aria-selected={family.id === selectedFamilyId}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectFamily(family.id);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm ${
                  index === highlightedIndex
                    ? 'bg-primary-50 text-primary-900'
                    : 'text-primary-700'
                } ${family.id === selectedFamilyId ? 'font-semibold' : ''}`}
              >
                <span>{family.name}</span>
                <span className="text-xs text-primary-400">
                  {family.parks.length} parks
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
