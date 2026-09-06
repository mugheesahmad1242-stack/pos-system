"use client"

import { Search, X } from "lucide-react"
import { useState } from "react"

export function SearchBar({ onSearch }: { onSearch?: (query: string) => void }) {
  const [value, setValue] = useState("")

  const handleChange = (val: string) => {
    setValue(val)
    onSearch?.(val)
  }

  const handleClear = () => {
    setValue("")
    onSearch?.("")
  }

  return (
    <div className="pos-panel flex items-center gap-2 px-3 py-2 w-80 relative focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-[var(--pos-brand)] focus-within:outline-none focus-within:ring-offset-background">
      <Search className="h-4 w-4 text-foreground/70" aria-hidden />
      <input
        aria-label="Search"
        placeholder="Search"
        value={value}
        className="bg-transparent outline-none text-sm w-full pr-6 placeholder:text-foreground/50"
        onChange={(e) => handleChange(e.target.value)}
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-3 p-0.5 hover:bg-muted rounded-full transition-colors cursor-pointer"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5 text-foreground/70" />
        </button>
      )}
    </div>
  )
}
