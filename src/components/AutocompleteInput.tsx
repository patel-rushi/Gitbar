import { useState, useRef, useEffect, useCallback } from 'react'

interface AutocompleteInputProps {
  value: string[]
  onChange: (items: string[]) => void
  fetchSuggestions: (query: string) => Promise<string[]>
  placeholder?: string
  allowCustom?: boolean
}

export function AutocompleteInput({
  value,
  onChange,
  fetchSuggestions,
  placeholder = 'Type to search…',
  allowCustom = true
}: AutocompleteInputProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const filtered = suggestions.filter(s => !value.includes(s))

  const doFetch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const results = await fetchSuggestions(q)
        setSuggestions(results)
      } catch {
        setSuggestions([])
      }
      setLoading(false)
    }, 300)
  }, [fetchSuggestions])

  useEffect(() => {
    if (query.length > 0) {
      doFetch(query)
      setOpen(true)
    } else {
      doFetch('')
      setOpen(false)
    }
    setHighlightIdx(-1)
  }, [query, doFetch])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addItem = (item: string) => {
    const trimmed = item.trim()
    if (!trimmed || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const removeItem = (item: string) => {
    onChange(value.filter(v => v !== item))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && filtered[highlightIdx]) {
        addItem(filtered[highlightIdx])
      } else if (allowCustom && query.trim()) {
        addItem(query)
      }
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      removeItem(value[value.length - 1])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="autocomplete-container" ref={containerRef}>
      <div className="autocomplete-input-area" onClick={() => inputRef.current?.focus()}>
        {value.map(item => (
          <span key={item} className="autocomplete-chip">
            {item}
            <button className="autocomplete-chip-remove" onClick={e => { e.stopPropagation(); removeItem(item) }}>✕</button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="autocomplete-text-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (query || suggestions.length) setOpen(true); doFetch(query) }}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
        />
        {loading && <span className="autocomplete-spinner" />}
      </div>
      {open && filtered.length > 0 && (
        <div className="autocomplete-dropdown">
          {filtered.slice(0, 8).map((item, idx) => (
            <div
              key={item}
              className={`autocomplete-option${idx === highlightIdx ? ' highlighted' : ''}`}
              onMouseEnter={() => setHighlightIdx(idx)}
              onClick={() => addItem(item)}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
