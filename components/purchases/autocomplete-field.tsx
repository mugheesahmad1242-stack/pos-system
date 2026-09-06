"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Loader2, Plus } from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { cn } from "@/lib/utils"

export interface AutocompleteOption {
  id: string
  name: string
}

interface AutocompleteFieldProps {
  id?: string
  label?: string
  placeholder?: string
  value: AutocompleteOption | null
  onChange: (option: AutocompleteOption | null) => void
  searchFn: (query: string) => Promise<AutocompleteOption[]>
  createFn: (name: string) => Promise<AutocompleteOption | null>
  disabled?: boolean
}

// Generic "type to search, pick an existing match, or +Add a new one" field.
// Selecting an option always reuses that exact record; typing alone never
// counts as a selection, so a purchase can't be saved against a
// hand-typed name that was never actually resolved to a product/supplier
// row (that's what prevents silent duplicates / spelling drift).
export function AutocompleteField({
  id,
  label,
  placeholder,
  value,
  onChange,
  searchFn,
  createFn,
  disabled,
}: AutocompleteFieldProps) {
  const [text, setText] = useState(value?.name || "")
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<AutocompleteOption[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const debouncedText = useDebouncedValue(text, 250)

  // Keep the input text in sync when the selection is changed/reset from
  // outside (e.g. form reset after a successful submit).
  useEffect(() => {
    setText(value?.name || "")
  }, [value?.id])

  const trimmed = text.trim()
  const isCurrentSelection = !!value && value.name === trimmed

  useEffect(() => {
    let cancelled = false
    const term = debouncedText.trim()

    if (!term || (value && value.name === term)) {
      setOptions([])
      return
    }

    setLoading(true)
    searchFn(term)
      .then((results) => {
        if (!cancelled) setOptions(results)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedText])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const exactMatch = options.find((o) => o.name.toLowerCase() === trimmed.toLowerCase())
  const showAddOption = trimmed.length > 0 && !exactMatch && !loading && !isCurrentSelection

  type Row = { type: "option"; option: AutocompleteOption } | { type: "add" }
  const rows: Row[] = [
    ...options.map((option): Row => ({ type: "option", option })),
    ...(showAddOption ? ([{ type: "add" }] as Row[]) : []),
  ]

  const showDropdown = open && trimmed.length > 0 && !isCurrentSelection

  function selectOption(option: AutocompleteOption) {
    onChange(option)
    setText(option.name)
    setOpen(false)
  }

  async function handleAdd() {
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const created = await createFn(trimmed)
      if (created) {
        selectOption(created)
      }
    } finally {
      setCreating(false)
    }
  }

  function handleSelectRow(row: Row) {
    if (row.type === "option") selectOption(row.option)
    else void handleAdd()
  }

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type="text"
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setHighlighted(0)
            if (value) onChange(null)
          }}
          onKeyDown={(e) => {
            if (!showDropdown || rows.length === 0) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setHighlighted((h) => Math.min(h + 1, rows.length - 1))
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setHighlighted((h) => Math.max(h - 1, 0))
            } else if (e.key === "Enter") {
              e.preventDefault()
              const row = rows[highlighted]
              if (row) handleSelectRow(row)
            } else if (e.key === "Escape") {
              setOpen(false)
            }
          }}
          className="w-full bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-2.5 pr-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-pos-brand transition disabled:opacity-60"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {loading || creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : value ? (
            <Check className="w-4 h-4 text-[var(--pos-brand)]" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-xl border border-[var(--pos-stroke)] bg-[var(--pos-panel)] shadow-xl">
          {rows.length === 0 && !loading && (
            <div className="px-4 py-3 text-xs text-muted-foreground">No matches</div>
          )}
          {rows.map((row, index) => (
            <button
              key={row.type === "option" ? row.option.id : "__add__"}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectRow(row)}
              className={cn(
                "w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition",
                index === highlighted ? "bg-[var(--pos-brand)]/10 text-foreground" : "text-foreground/80 hover:bg-foreground/5",
              )}
            >
              {row.type === "option" ? (
                <span>{row.option.name}</span>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-[var(--pos-brand)] shrink-0" />
                  <span>Add &quot;{trimmed}&quot;</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
