"use client"

// Recursive JSON-Schema form renderer.
//
// Type-narrows on the McpJsonSchema shape from `@/lib/mcp/types` (a hand-rolled
// subset — we don't use json-schema-typed because the package isn't in deps).
//
// Supports:
//   - string  (text input; format=textarea ⇒ multiline)
//   - number / integer  (numeric input with min/max)
//   - boolean (Switch)
//   - enum    (Select dropdown)
//   - array of primitives (string|number|boolean|enum) with + Add item
//   - object  (recursive nested form)
//
// Depth cap: 3 levels of nesting. Beyond that, render a raw JSON textarea
// fallback so we don't blow up on pathological schemas.
//
// Required fields get a red asterisk. Field-level descriptions render as a
// muted helper line. The whole tree reads/writes through a single `value`
// object owned by the parent — no internal form state.

import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import type { McpJsonSchema } from "@/lib/mcp/types"

const MAX_DEPTH = 3

export interface JsonSchemaFormProps {
  schema: McpJsonSchema | undefined
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  /** Internal — used by the recursive renderer; consumers leave at default. */
  depth?: number
  /** Internal — display name for nested objects. */
  rootLabel?: string
}

export function JsonSchemaForm({
  schema,
  value,
  onChange,
  depth = 0,
}: JsonSchemaFormProps) {
  // No schema → no fields. Render a hint instead of an empty form so the user
  // knows the tool takes no arguments.
  if (!schema || (schema.type !== "object" && !schema.properties)) {
    if (schema && schema.type !== "object") {
      // Non-object root (rare for tools, but allowed) — render as a single
      // unnamed value field bound to value["value"].
      return (
        <div className="space-y-2">
          <SchemaField
            name="value"
            schema={schema}
            required
            value={value.value}
            onChange={(v) => onChange({ ...value, value: v })}
            depth={depth}
          />
        </div>
      )
    }
    return (
      <p className="rounded-md border border-dashed border-mem-border bg-mem-surface-2 p-3 text-[12px] text-mem-text-muted">
        This tool takes no arguments. Click <span className="font-medium text-mem-text-secondary">Run</span> to call it.
      </p>
    )
  }

  const props = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const propEntries = Object.entries(props)

  if (propEntries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-mem-border bg-mem-surface-2 p-3 text-[12px] text-mem-text-muted">
        This tool takes no arguments. Click <span className="font-medium text-mem-text-secondary">Run</span> to call it.
      </p>
    )
  }

  return (
    <div className="space-y-3.5">
      {propEntries.map(([name, child]) => (
        <SchemaField
          key={name}
          name={name}
          schema={child}
          required={required.has(name)}
          value={value[name]}
          onChange={(v) => {
            const next = { ...value }
            if (v === undefined) delete next[name]
            else next[name] = v
            onChange(next)
          }}
          depth={depth}
        />
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Single field                                 */
/* -------------------------------------------------------------------------- */

interface SchemaFieldProps {
  name: string
  schema: McpJsonSchema
  required: boolean
  value: unknown
  onChange: (next: unknown) => void
  depth: number
}

function SchemaField({
  name,
  schema,
  required,
  value,
  onChange,
  depth,
}: SchemaFieldProps) {
  // Depth cap → fall back to raw JSON textarea.
  if (depth >= MAX_DEPTH && (schema.type === "object" || schema.type === "array")) {
    return (
      <RawJsonField
        name={name}
        schema={schema}
        required={required}
        value={value}
        onChange={onChange}
      />
    )
  }

  // Enum (string | number)
  if (schema.enum && schema.enum.length > 0) {
    return (
      <FieldShell name={name} schema={schema} required={required}>
        <Select
          value={value !== undefined && value !== null ? String(value) : undefined}
          onValueChange={(v) => {
            // Cast back to original primitive type if the enum is numeric.
            const numericEnum = schema.enum?.every((e) => typeof e === "number")
            onChange(numericEnum ? Number(v) : v)
          }}
        >
          <SelectTrigger
            id={`mcp-field-${name}`}
            className="h-9 bg-mem-surface-2 text-[13px]"
          >
            <SelectValue placeholder={schema.description ?? "Pick a value"} />
          </SelectTrigger>
          <SelectContent>
            {schema.enum.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)} className="text-[13px]">
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    )
  }

  // Boolean
  if (schema.type === "boolean") {
    return (
      <FieldShell name={name} schema={schema} required={required} inline>
        <Switch
          id={`mcp-field-${name}`}
          checked={value === true}
          onCheckedChange={(c) => onChange(c)}
          aria-label={name}
        />
      </FieldShell>
    )
  }

  // Number / integer
  if (schema.type === "number" || schema.type === "integer") {
    const numVal = typeof value === "number" ? value : value === undefined ? "" : Number(value)
    return (
      <FieldShell name={name} schema={schema} required={required}>
        <Input
          id={`mcp-field-${name}`}
          type="number"
          inputMode="numeric"
          min={schema.minimum}
          max={schema.maximum}
          step={schema.type === "integer" ? 1 : "any"}
          value={Number.isFinite(numVal) ? String(numVal) : ""}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === "") return onChange(undefined)
            const parsed = schema.type === "integer" ? Number.parseInt(raw, 10) : Number.parseFloat(raw)
            onChange(Number.isFinite(parsed) ? parsed : undefined)
          }}
          className="h-9 bg-mem-surface-2 text-[13px]"
          placeholder={schema.description ?? ""}
        />
      </FieldShell>
    )
  }

  // Array (primitives only)
  if (schema.type === "array") {
    return (
      <ArrayField
        name={name}
        schema={schema}
        required={required}
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
        depth={depth}
      />
    )
  }

  // Object (recursive)
  if (schema.type === "object" || schema.properties) {
    return (
      <NestedObjectField
        name={name}
        schema={schema}
        required={required}
        value={(value && typeof value === "object" && !Array.isArray(value))
          ? (value as Record<string, unknown>)
          : {}}
        onChange={(v) => onChange(v)}
        depth={depth}
      />
    )
  }

  // Default: string. SQL/long-text gets multiline based on description hint or
  // explicit format.
  const isMultiline = schema.format === "textarea"
    || (typeof schema.description === "string"
        && /\n|sql|markdown|json|prompt|body/i.test(schema.description))
    || /\b(sql|query|body|markdown|prompt|content)\b/i.test(name)

  const stringVal = typeof value === "string" ? value : value === undefined ? "" : String(value)

  return (
    <FieldShell name={name} schema={schema} required={required}>
      {isMultiline ? (
        <Textarea
          id={`mcp-field-${name}`}
          value={stringVal}
          onChange={(e) => onChange(e.target.value || undefined)}
          rows={4}
          className="bg-mem-surface-2 font-mono text-[12px]"
          placeholder={schema.description ?? ""}
        />
      ) : (
        <Input
          id={`mcp-field-${name}`}
          type={schema.format === "password" ? "password" : "text"}
          value={stringVal}
          onChange={(e) => onChange(e.target.value || undefined)}
          minLength={schema.minLength}
          maxLength={schema.maxLength}
          pattern={schema.pattern}
          className="h-9 bg-mem-surface-2 text-[13px]"
          placeholder={schema.description ?? ""}
        />
      )}
    </FieldShell>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Field shell                                  */
/* -------------------------------------------------------------------------- */

function FieldShell({
  name,
  schema,
  required,
  children,
  inline,
}: {
  name: string
  schema: McpJsonSchema
  required: boolean
  children: React.ReactNode
  inline?: boolean
}) {
  if (inline) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-mem-border bg-mem-surface-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <FieldLabel name={name} required={required} />
          {schema.description && (
            <p className="mt-0.5 text-[11px] text-mem-text-muted">{schema.description}</p>
          )}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <FieldLabel name={name} required={required} htmlFor={`mcp-field-${name}`} />
      {children}
      {schema.description && (
        <p className="text-[11px] text-mem-text-muted">{schema.description}</p>
      )}
    </div>
  )
}

function FieldLabel({
  name,
  required,
  htmlFor,
}: {
  name: string
  required: boolean
  htmlFor?: string
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="flex items-center gap-1 font-mono text-[11px] text-mem-text-secondary"
    >
      <span className="truncate">{name}</span>
      {required && (
        <span aria-label="required" className="text-red-400">
          *
        </span>
      )}
    </Label>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Nested object                                */
/* -------------------------------------------------------------------------- */

interface NestedObjectFieldProps {
  name: string
  schema: McpJsonSchema
  required: boolean
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown> | undefined) => void
  depth: number
}

function NestedObjectField({
  name,
  schema,
  required,
  value,
  onChange,
  depth,
}: NestedObjectFieldProps) {
  return (
    <fieldset className="rounded-md border border-mem-border bg-mem-surface-1 p-3">
      <legend className="-ml-1 px-1">
        <FieldLabel name={name} required={required} />
      </legend>
      {schema.description && (
        <p className="mb-2 text-[11px] text-mem-text-muted">{schema.description}</p>
      )}
      <JsonSchemaForm
        schema={schema}
        value={value}
        onChange={(next) => {
          if (Object.keys(next).length === 0 && !required) onChange(undefined)
          else onChange(next)
        }}
        depth={depth + 1}
      />
    </fieldset>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Array                                      */
/* -------------------------------------------------------------------------- */

interface ArrayFieldProps {
  name: string
  schema: McpJsonSchema
  required: boolean
  value: unknown[]
  onChange: (next: unknown[] | undefined) => void
  depth: number
}

function ArrayField({
  name,
  schema,
  required,
  value,
  onChange,
  depth,
}: ArrayFieldProps) {
  const items = schema.items ?? { type: "string" }
  const isPrimitive = items.type === "string"
    || items.type === "number"
    || items.type === "integer"
    || items.type === "boolean"
    || (items.enum && items.enum.length > 0)

  // Non-primitive arrays → JSON textarea fallback (per spec: arrays of primitives only).
  if (!isPrimitive) {
    return (
      <RawJsonField
        name={name}
        schema={schema}
        required={required}
        value={value}
        onChange={(v) => onChange(Array.isArray(v) ? v : undefined)}
      />
    )
  }

  const handleSet = (idx: number, v: unknown) => {
    const next = value.slice()
    next[idx] = v
    onChange(next)
  }

  const handleRemove = (idx: number) => {
    const next = value.slice()
    next.splice(idx, 1)
    onChange(next.length === 0 && !required ? undefined : next)
  }

  const handleAdd = () => {
    const blank: unknown =
      items.type === "boolean" ? false
      : items.type === "number" || items.type === "integer" ? 0
      : ""
    onChange([...value, blank])
  }

  return (
    <div className="space-y-1.5">
      <FieldLabel name={name} required={required} />
      {schema.description && (
        <p className="text-[11px] text-mem-text-muted">{schema.description}</p>
      )}
      <div className="space-y-1.5">
        {value.length === 0 && (
          <p className="rounded-md border border-dashed border-mem-border bg-mem-surface-2 p-2 text-[11px] text-mem-text-muted">
            No items yet.
          </p>
        )}
        {value.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="flex-1">
              <SchemaField
                name={`${name}[${idx}]`}
                schema={items}
                required={false}
                value={item}
                onChange={(v) => handleSet(idx, v)}
                depth={depth + 1}
              />
            </div>
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              aria-label={`Remove ${name} item ${idx + 1}`}
              className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-mem-text-muted transition-colors hover:bg-white/[0.04] hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        className="h-7 gap-1 text-[11px]"
      >
        <Plus className="h-3 w-3" />
        Add item
      </Button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                          Raw JSON fallback (depth > 3)                      */
/* -------------------------------------------------------------------------- */

interface RawJsonFieldProps {
  name: string
  schema: McpJsonSchema
  required: boolean
  value: unknown
  onChange: (next: unknown) => void
}

function RawJsonField({ name, schema, required, value, onChange }: RawJsonFieldProps) {
  const initial = React.useMemo(() => {
    if (value === undefined) return ""
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ""
    }
  }, [value])

  const [text, setText] = React.useState(initial)
  const [parseError, setParseError] = React.useState<string | null>(null)

  // Sync from outside if the form is reset.
  React.useEffect(() => {
    setText(initial)
    setParseError(null)
  }, [initial])

  return (
    <FieldShell name={name} schema={schema} required={required}>
      <Textarea
        id={`mcp-field-${name}`}
        value={text}
        rows={4}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          if (next.trim() === "") {
            setParseError(null)
            onChange(undefined)
            return
          }
          try {
            const parsed = JSON.parse(next) as unknown
            setParseError(null)
            onChange(parsed)
          } catch (err) {
            setParseError(err instanceof Error ? err.message : "Invalid JSON")
          }
        }}
        placeholder={schema.description ?? "JSON value"}
        className={cn(
          "bg-mem-surface-2 font-mono text-[12px]",
          parseError && "border-red-400/40"
        )}
      />
      {parseError && (
        <p className="text-[11px] text-red-300">{parseError}</p>
      )}
    </FieldShell>
  )
}
