"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  Save, Smartphone, Tablet, Monitor,
  Loader2, X, Maximize2, Minimize2, Palette,
} from "lucide-react"

interface PageBuilderProps {
  pageId?: string
  initialData?: { grapejs_data?: any; grapejs_html?: string; grapejs_css?: string; title?: string; url_path?: string }
  onSave?: (data: { grapejs_data: any; grapejs_html: string; grapejs_css: string }) => void
  onClose?: () => void
}

export default function PageBuilder({ pageId, initialData, onSave, onClose }: PageBuilderProps) {
  const editorRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop")
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || editorRef.current) return

    // Load GrapeJS CSS first
    const linkEl = document.createElement("link")
    linkEl.rel = "stylesheet"
    linkEl.href = "https://unpkg.com/grapesjs@0.21.13/dist/css/grapes.min.css"
    document.head.appendChild(linkEl)

    // Also add some custom overrides for dark theme compatibility
    const styleEl = document.createElement("style")
    styleEl.textContent = `
      .gjs-one-bg { background-color: #1a1a2e !important; }
      .gjs-two-color { color: #e2e8f0 !important; }
      .gjs-three-bg { background-color: #16213e !important; }
      .gjs-four-color, .gjs-four-color-h:hover { color: #818cf8 !important; }
      .gjs-pn-panel { background-color: #1a1a2e !important; border-color: #2d2d44 !important; }
      .gjs-block { background-color: #16213e !important; border: 1px solid #2d2d44 !important; color: #e2e8f0 !important; border-radius: 8px !important; min-height: 60px !important; }
      .gjs-block:hover { border-color: #818cf8 !important; }
      .gjs-block__media { color: #818cf8 !important; }
      .gjs-blocks-cs { background-color: #1a1a2e !important; }
      .gjs-category-title { background-color: #16213e !important; border-color: #2d2d44 !important; color: #e2e8f0 !important; }
      .gjs-sm-sector-title { background-color: #16213e !important; color: #e2e8f0 !important; }
      .gjs-clm-tags { background-color: #1a1a2e !important; }
      .gjs-field { background-color: #16213e !important; border-color: #2d2d44 !important; color: #e2e8f0 !important; }
      .gjs-field input, .gjs-field select, .gjs-field textarea { color: #e2e8f0 !important; }
      .gjs-toolbar { background-color: #818cf8 !important; border-radius: 6px !important; }
      .gjs-resizer-h { border-color: #818cf8 !important; }
      .gjs-cv-canvas { background-color: #0f0f1a !important; }
      .gjs-frame-wrapper { border-radius: 8px; overflow: hidden; }
      .gjs-pn-views-container { width: 260px !important; }
      .gjs-pn-views { border-color: #2d2d44 !important; }
      .gjs-pn-btn { color: #94a3b8 !important; border-radius: 6px !important; }
      .gjs-pn-btn.gjs-pn-active { color: #818cf8 !important; background-color: rgba(129, 140, 248, 0.1) !important; }
      .gjs-layer-name { color: #e2e8f0 !important; }
      .gjs-layers { background-color: #1a1a2e !important; }
      .gjs-selected { outline: 2px solid #818cf8 !important; outline-offset: -2px !important; }
      .gjs-sm-property { color: #e2e8f0 !important; }
      .gjs-radio-item label { color: #e2e8f0 !important; }
    `
    document.head.appendChild(styleEl)

    const loadEditor = async () => {
      try {
        const grapesjs = (await import("grapesjs")).default

        const editor = grapesjs.init({
          container: containerRef.current!,
          height: "100%",
          width: "auto",
          fromElement: false,
          storageManager: false,
          // Show default panels (blocks, layers, styles, traits)
          panels: { defaults: [
            {
              id: "panel-devices",
              el: ".panel__devices",
              buttons: [
                { id: "device-desktop", label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>', command: "set-device-desktop", active: true, togglable: false },
                { id: "device-tablet", label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>', command: "set-device-tablet", togglable: false },
                { id: "device-mobile", label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>', command: "set-device-mobile", togglable: false },
              ]
            },
          ]},
          deviceManager: {
            devices: [
              { name: "Desktop", width: "" },
              { name: "Tablet", width: "768px", widthMedia: "992px" },
              { name: "Mobile", width: "375px", widthMedia: "480px" },
            ],
          },
          styleManager: {
            sectors: [
              { name: "General", open: true, properties: ["display", "float", "position", "top", "right", "left", "bottom"] },
              { name: "Dimension", open: false, properties: ["width", "min-width", "max-width", "height", "min-height", "max-height", "margin", "padding"] },
              { name: "Typography", open: false, properties: ["font-family", "font-size", "font-weight", "letter-spacing", "color", "line-height", "text-align", "text-decoration", "text-shadow"] },
              { name: "Decorations", open: false, properties: ["background-color", "border-radius", "border", "box-shadow", "background", "opacity"] },
              { name: "Animations", open: false, properties: ["transition", "transform"] },
            ],
          },
          selectorManager: { componentFirst: true },
          blockManager: {
            blocks: [
              // Layout
              { id: "section", label: "Section", category: "Layout", content: '<section class="py-16 px-6"><div class="max-w-6xl mx-auto"><p>Drop content here</p></div></section>', media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/></svg>' },
              { id: "columns-2", label: "2 Columns", category: "Layout", content: '<div class="grid" style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:16px"><div style="padding:16px;background:#f8f9fa;border-radius:8px;min-height:100px">Column 1</div><div style="padding:16px;background:#f8f9fa;border-radius:8px;min-height:100px">Column 2</div></div>', media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="9" height="16" rx="1"/><rect x="13" y="4" width="9" height="16" rx="1"/></svg>' },
              { id: "columns-3", label: "3 Columns", category: "Layout", content: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;padding:16px"><div style="padding:16px;background:#f8f9fa;border-radius:8px;min-height:100px">Column 1</div><div style="padding:16px;background:#f8f9fa;border-radius:8px;min-height:100px">Column 2</div><div style="padding:16px;background:#f8f9fa;border-radius:8px;min-height:100px">Column 3</div></div>', media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="6" height="16" rx="1"/><rect x="9" y="4" width="6" height="16" rx="1"/><rect x="17" y="4" width="6" height="16" rx="1"/></svg>' },
              // Content
              { id: "heading", label: "Heading", category: "Content", content: '<h2 style="font-size:2.5rem;font-weight:bold;color:#111827;margin:0">Your Heading Here</h2>', media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h16M4 6h8"/></svg>' },
              { id: "text", label: "Text Block", category: "Content", content: '<p style="font-size:1.125rem;color:#4b5563;line-height:1.75">Write your content here. Click to edit this text block.</p>', media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h16M4 17h10"/></svg>' },
              { id: "image", label: "Image", category: "Content", content: { type: "image", style: { width: "100%", "border-radius": "12px" }, attributes: { src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=400&fit=crop" } }, media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' },
              { id: "button", label: "Button", category: "Content", content: '<a href="#" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:white;font-weight:600;border-radius:12px;text-decoration:none;font-size:1rem">Get Started</a>', media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="8" width="18" height="8" rx="4"/></svg>' },
              { id: "divider", label: "Divider", category: "Content", content: '<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb"/>' },
              { id: "spacer", label: "Spacer", category: "Content", content: '<div style="height:48px"></div>' },
              // Marketing
              { id: "hero", label: "Hero Section", category: "Marketing", content: '<section style="padding:96px 24px;background:linear-gradient(135deg,#eef2ff,#ffffff)"><div style="max-width:48rem;margin:0 auto;text-align:center"><h1 style="font-size:3rem;font-weight:bold;color:#111827;margin:0 0 24px">Grow Your Business With Us</h1><p style="font-size:1.25rem;color:#6b7280;margin:0 0 32px;max-width:32rem;margin-left:auto;margin-right:auto">We help local businesses get more customers through proven digital marketing strategies.</p><a href="#" style="display:inline-block;padding:16px 32px;background:#4f46e5;color:white;font-weight:600;border-radius:12px;text-decoration:none;font-size:1.125rem">Book a Free Call</a></div></section>' },
              { id: "testimonial", label: "Testimonial", category: "Marketing", content: '<div style="padding:32px;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);border:1px solid #f3f4f6"><div style="color:#f59e0b;font-size:1.25rem;margin-bottom:16px">★★★★★</div><p style="color:#374151;font-size:1.125rem;margin:0 0 16px;line-height:1.75">"This completely transformed our business. We went from struggling to being fully booked."</p><div style="display:flex;align-items:center;gap:12px"><div style="width:48px;height:48px;border-radius:50%;background:#eef2ff;display:flex;align-items:center;justify-content:center;color:#4f46e5;font-weight:bold">JD</div><div><p style="font-weight:600;color:#111827;margin:0">John Doe</p><p style="color:#6b7280;font-size:0.875rem;margin:0">Owner, Local Restaurant</p></div></div></div>' },
              { id: "cta", label: "CTA Section", category: "Marketing", content: '<section style="padding:64px 24px;background:#4f46e5;border-radius:16px;text-align:center"><h2 style="font-size:1.875rem;font-weight:bold;color:white;margin:0 0 16px">Ready to Grow Your Business?</h2><p style="color:rgba(255,255,255,0.8);font-size:1.125rem;margin:0 0 32px">Book a free consultation and see how we can help.</p><a href="#" style="display:inline-block;padding:16px 32px;background:white;color:#4f46e5;font-weight:600;border-radius:12px;text-decoration:none;font-size:1.125rem">Schedule a Call →</a></section>' },
              { id: "pricing", label: "Pricing Card", category: "Marketing", content: '<div style="padding:32px;background:white;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);border:2px solid #4f46e5;text-align:center;max-width:24rem"><p style="font-size:0.875rem;font-weight:600;color:#4f46e5;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">Most Popular</p><h3 style="font-size:1.5rem;font-weight:bold;color:#111827;margin:0 0 8px">Growth Plan</h3><p style="color:#6b7280;margin:0 0 24px">Everything you need to scale</p><div style="text-align:left;margin:0 0 32px"><p style="color:#374151;margin:4px 0">✓ Website Design</p><p style="color:#374151;margin:4px 0">✓ SEO Optimization</p><p style="color:#374151;margin:4px 0">✓ Review Campaign</p><p style="color:#374151;margin:4px 0">✓ Social Media</p></div><a href="#" style="display:block;padding:12px;background:#4f46e5;color:white;font-weight:600;border-radius:12px;text-decoration:none">Get Started</a></div>' },
              { id: "faq", label: "FAQ Section", category: "Marketing", content: '<section style="padding:64px 24px"><h2 style="font-size:1.875rem;font-weight:bold;text-align:center;color:#111827;margin:0 0 48px">Frequently Asked Questions</h2><div style="max-width:48rem;margin:0 auto"><details style="padding:16px;background:#f9fafb;border-radius:12px;margin:8px 0"><summary style="font-weight:600;color:#111827;cursor:pointer">What services do you offer?</summary><p style="margin:12px 0 0;color:#6b7280">We offer website design, SEO, review campaigns, reactivation sprints, and social media management.</p></details><details style="padding:16px;background:#f9fafb;border-radius:12px;margin:8px 0"><summary style="font-weight:600;color:#111827;cursor:pointer">How long until I see results?</summary><p style="margin:12px 0 0;color:#6b7280">Most clients see results within 30 days. SEO takes 3-6 months for significant ranking changes.</p></details><details style="padding:16px;background:#f9fafb;border-radius:12px;margin:8px 0"><summary style="font-weight:600;color:#111827;cursor:pointer">Do you work outside NYC?</summary><p style="margin:12px 0 0;color:#6b7280">Currently we focus on NYC businesses, but expanding soon.</p></details></div></section>' },
              { id: "stats", label: "Stats Section", category: "Marketing", content: '<section style="padding:64px 24px;background:#f9fafb;border-radius:16px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:32px;max-width:48rem;margin:0 auto;text-align:center"><div><p style="font-size:2.5rem;font-weight:bold;color:#4f46e5;margin:0">500+</p><p style="color:#6b7280;margin:4px 0 0">Businesses Helped</p></div><div><p style="font-size:2.5rem;font-weight:bold;color:#4f46e5;margin:0">10x</p><p style="color:#6b7280;margin:4px 0 0">Average ROI</p></div><div><p style="font-size:2.5rem;font-weight:bold;color:#4f46e5;margin:0">30</p><p style="color:#6b7280;margin:4px 0 0">Day Results</p></div><div><p style="font-size:2.5rem;font-weight:bold;color:#4f46e5;margin:0">4.9★</p><p style="color:#6b7280;margin:4px 0 0">Client Rating</p></div></div></section>' },
              { id: "email-capture", label: "Email Capture", category: "Marketing", content: '<section style="padding:48px 24px;background:#111827;border-radius:16px;text-align:center"><h3 style="font-size:1.5rem;font-weight:bold;color:white;margin:0 0 12px">Get a Free Marketing Audit</h3><p style="color:#9ca3af;margin:0 0 24px">Enter your email and we\'ll send you a custom report.</p><div style="display:flex;gap:8px;max-width:28rem;margin:0 auto"><input type="email" placeholder="your@email.com" style="flex:1;padding:12px 16px;border-radius:12px;background:#1f2937;border:1px solid #374151;color:white;outline:none;font-size:1rem"/><button style="padding:12px 24px;background:#4f46e5;color:white;font-weight:600;border-radius:12px;border:none;cursor:pointer;font-size:1rem">Get Report</button></div></section>' },
              { id: "services", label: "Services Grid", category: "Marketing", content: '<section style="padding:64px 24px"><h2 style="font-size:1.875rem;font-weight:bold;text-align:center;color:#111827;margin:0 0 48px">What We Do</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:60rem;margin:0 auto"><div style="padding:24px;background:white;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #f3f4f6"><div style="width:48px;height:48px;background:#eef2ff;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:16px">🌐</div><h3 style="font-size:1.125rem;font-weight:600;color:#111827;margin:0 0 8px">Website Design</h3><p style="color:#6b7280;font-size:0.875rem;margin:0">Modern websites that convert visitors into customers.</p></div><div style="padding:24px;background:white;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #f3f4f6"><div style="width:48px;height:48px;background:#ecfdf5;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:16px">⭐</div><h3 style="font-size:1.125rem;font-weight:600;color:#111827;margin:0 0 8px">Review Campaigns</h3><p style="color:#6b7280;font-size:0.875rem;margin:0">Get more 5-star reviews and build trust.</p></div><div style="padding:24px;background:white;border-radius:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #f3f4f6"><div style="width:48px;height:48px;background:#fff7ed;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;margin-bottom:16px">🔄</div><h3 style="font-size:1.125rem;font-weight:600;color:#111827;margin:0 0 8px">Reactivation</h3><p style="color:#6b7280;font-size:0.875rem;margin:0">Bring back lost customers with targeted campaigns.</p></div></div></section>' },
            ],
          },
          canvas: {
            styles: [
              "https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css",
            ],
          },
        })

        // Add default commands
        editor.Commands.add("set-device-desktop", { run: (e: any) => e.setDevice("Desktop") })
        editor.Commands.add("set-device-tablet", { run: (e: any) => e.setDevice("Tablet") })
        editor.Commands.add("set-device-mobile", { run: (e: any) => e.setDevice("Mobile") })

        // Open blocks panel by default
        editor.Panels.addPanel({
          id: "panel-switcher",
          el: ".panel__switcher",
          buttons: [
            { id: "show-blocks", active: true, label: "Blocks", command: "open-blocks", togglable: false },
            { id: "show-style", label: "Styles", command: "open-sm", togglable: false },
            { id: "show-layers", label: "Layers", command: "open-layers", togglable: false },
          ],
        })

        // Load initial data
        if (initialData?.grapejs_data) {
          editor.loadProjectData(initialData.grapejs_data)
        } else if (initialData?.grapejs_html) {
          editor.setComponents(initialData.grapejs_html)
          if (initialData.grapejs_css) editor.setStyle(initialData.grapejs_css)
        } else {
          // Default starter content
          editor.setComponents(`
            <section style="padding:96px 24px;background:linear-gradient(135deg,#eef2ff,#ffffff)">
              <div style="max-width:48rem;margin:0 auto;text-align:center">
                <h1 style="font-size:3rem;font-weight:bold;color:#111827;margin:0 0 24px">Welcome to Your Page</h1>
                <p style="font-size:1.25rem;color:#6b7280;margin:0 0 32px">Start building by dragging blocks from the right panel.</p>
              </div>
            </section>
          `)
        }

        // Open blocks by default
        const bm = editor.BlockManager
        if (bm) {
          setTimeout(() => {
            editor.runCommand("open-blocks")
          }, 100)
        }

        editorRef.current = editor
        setLoading(false)
      } catch (err) {
        console.error("GrapeJS load error:", err)
        setError(err instanceof Error ? err.message : "Failed to load editor")
        setLoading(false)
      }
    }

    // Small delay to ensure DOM is ready
    setTimeout(loadEditor, 200)

    return () => {
      if (editorRef.current) {
        try { editorRef.current.destroy() } catch {}
        editorRef.current = null
      }
      // Clean up CSS
      linkEl.remove()
      styleEl.remove()
    }
  }, [initialData])

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    setSaving(true)
    try {
      const editor = editorRef.current
      const data = {
        grapejs_data: editor.getProjectData(),
        grapejs_html: editor.getHtml(),
        grapejs_css: editor.getCss(),
      }
      onSave?.(data)
      toast.success("Page saved!")
    } catch (err) {
      toast.error("Failed to save")
    }
    setSaving(false)
  }, [onSave])

  const handleDeviceChange = (d: "desktop" | "tablet" | "mobile") => {
    setDevice(d)
    if (!editorRef.current) return
    const map = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" }
    editorRef.current.setDevice(map[d])
  }

  return (
    <div className={`flex flex-col ${fullscreen ? "fixed inset-0 z-50 bg-background" : "h-full min-h-[500px]"}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a2e] border-b border-[#2d2d44] shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs border-indigo-500/30 text-indigo-400">
            <Palette className="h-3 w-3 mr-1" /> Visual Editor
          </Badge>
          {initialData?.title && (
            <span className="text-sm font-medium text-gray-300">{initialData.title}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Device toggles */}
          <div className="flex items-center gap-0.5 p-1 rounded-lg bg-[#16213e]">
            {([
              { d: "desktop" as const, icon: Monitor, label: "Desktop" },
              { d: "tablet" as const, icon: Tablet, label: "Tablet" },
              { d: "mobile" as const, icon: Smartphone, label: "Mobile" },
            ]).map(({ d, icon: Icon, label }) => (
              <button
                key={d}
                onClick={() => handleDeviceChange(d)}
                className={`p-1.5 rounded-md transition-colors ${device === d ? "bg-indigo-500/20 text-indigo-400" : "text-gray-400 hover:text-gray-200"}`}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="panel__devices hidden" />
          <div className="panel__switcher hidden" />

          <Button variant="ghost" size="sm" onClick={() => setFullscreen(!fullscreen)} className="h-8 w-8 p-0 text-gray-400 hover:text-white">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>

          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-gray-400 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative" style={{ minHeight: 0 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0f0f1a] z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm text-gray-400">Loading visual editor...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0f0f1a] z-10">
            <div className="flex flex-col items-center gap-3 text-center px-8">
              <div className="h-12 w-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-sm text-red-400">Failed to load editor</p>
              <p className="text-xs text-gray-500">{error}</p>
              <Button onClick={() => window.location.reload()} variant="outline" size="sm" className="rounded-lg mt-2">
                Reload Page
              </Button>
            </div>
          </div>
        )}
        <div ref={containerRef} className="h-full w-full" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      </div>
    </div>
  )
}
