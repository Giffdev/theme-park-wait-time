'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface SearchableSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  id?: string;
}

/**
 * Searchable combobox with type-to-filter, keyboard navigation,
 * alphabetized options, and consistent indigo-accent styling.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Search or select…',
  disabled = false,
  label,
  id,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  const filtered = options
    .filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));

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

  // Scroll highlighted into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const selectOption = useCallback(
    (optionId: string) => {
      onChange(optionId);
      setIsOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [onChange],
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
          selectOption(filtered[highlightedIndex].id);
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

  const listboxId = id ? `${id}-listbox` : 'searchable-select-listbox';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        {selectedOption && !isOpen && !query && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-primary-900 pointer-events-none">
            {selectedOption.label}
            {selectedOption.sublabel && (
              <span className="ml-1 text-xs text-primary-400">{selectedOption.sublabel}</span>
            )}
          </span>
        )}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen && filtered[highlightedIndex]
              ? `${listboxId}-option-${filtered[highlightedIndex].id}`
              : undefined
          }
          aria-autocomplete="list"
          aria-label={label || placeholder}
          placeholder={isOpen || !selectedOption ? placeholder : ''}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => { if (!disabled) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-lg border border-primary-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-primary-900 placeholder:text-primary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed ${
            selectedOption && !isOpen && !query ? 'text-transparent caret-transparent' : ''
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
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
          aria-label={label || 'Options'}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-primary-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-primary-400">No results found</li>
          ) : (
            filtered.map((option, index) => (
              <li
                key={option.id}
                id={`${listboxId}-option-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(option.id);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm ${
                  index === highlightedIndex
                    ? 'bg-primary-50 text-primary-900'
                    : 'text-primary-700'
                } ${option.id === value ? 'font-semibold' : ''}`}
              >
                <span>{option.label}</span>
                {option.sublabel && (
                  <span className="text-xs text-primary-400">{option.sublabel}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
