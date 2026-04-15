"use client"

import { useState, KeyboardEvent } from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

const TAG_COLORS = [
  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "bg-green-500/20 text-green-300 border-green-500/30",
  "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "bg-orange-500/20 text-orange-300 border-orange-500/30",
]

function getTagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export function TagInput({ tags, onChange, placeholder = "Add tag..." }: TagInputProps) {
  const [input, setInput] = useState("")

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault()
      const newTags = input.split(",").map((t) => t.trim()).filter((t) => t && !tags.includes(t))
      if (newTags.length) onChange([...tags, ...newTags])
      setInput("")
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {tags.map((tag) => (
        <span key={tag} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${getTagColor(tag)}`}>
          {tag}
          <button onClick={() => removeTag(tag)} className="hover:opacity-70">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] h-7 text-xs border-none shadow-none focus-visible:ring-0 p-0"
      />
    </div>
  )
}

export function TagDisplay({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag} className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] border ${getTagColor(tag)}`}>
          {tag}
        </span>
      ))}
    </div>
  )
}
