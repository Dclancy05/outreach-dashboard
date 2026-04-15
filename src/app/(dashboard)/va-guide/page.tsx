"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Instagram,
  Facebook,
  Globe,
  Key,
  Shield,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Step {
  id: string
  title: string
  description: string
  details: string[]
  links?: { label: string; url: string }[]
  important?: string
}

const sections: { title: string; icon: typeof Instagram; color: string; steps: Step[] }[] = [
  {
    title: "1. Convert Instagram to Business Account",
    icon: Instagram,
    color: "text-pink-400",
    steps: [
      {
        id: "ig-1",
        title: "Open Instagram Settings",
        description: "Go to the Instagram app → Profile → Settings (☰) → Account type and tools",
        details: [
          "Open the Instagram app on the phone",
          "Go to the profile page (bottom right icon)",
          "Tap the hamburger menu (☰) in the top right",
          "Tap 'Settings and privacy'",
          "Scroll down to 'Account type and tools'",
        ],
      },
      {
        id: "ig-2",
        title: "Switch to Professional Account",
        description: "Select 'Switch to professional account' and choose Business",
        details: [
          "Tap 'Switch to professional account'",
          "Choose 'Business' (NOT Creator)",
          "Select the category that matches the persona (e.g. 'Marketing Agency', 'Education', 'Entrepreneur')",
          "You can choose not to display the category on the profile",
          "Skip adding contact info for now",
        ],
        important: "MUST be Business account, not Creator. Creator accounts have limited API access.",
      },
      {
        id: "ig-3",
        title: "Complete Profile",
        description: "Add profile photo, bio, and make sure the account looks legit",
        details: [
          "Add a profile photo that matches the persona",
          "Write a bio that matches the persona's niche and tone",
          "Add a website link if available",
          "Make sure the account is PUBLIC (not private)",
        ],
      },
    ],
  },
  {
    title: "2. Create & Link Facebook Page",
    icon: Facebook,
    color: "text-blue-400",
    steps: [
      {
        id: "fb-1",
        title: "Create a Facebook Page",
        description: "Create a new Facebook Page that will be linked to this Instagram account",
        details: [
          "Go to facebook.com/pages/create",
          "Choose 'Business or Brand'",
          "Name the page to match the Instagram persona",
          "Add a category (same as Instagram)",
          "Add profile and cover photos",
          "Fill in basic info (About section, website, etc.)",
        ],
        links: [
          { label: "Create Facebook Page", url: "https://www.facebook.com/pages/create" },
        ],
      },
      {
        id: "fb-2",
        title: "Link Facebook Page to Instagram",
        description: "Connect the Instagram Business account to this Facebook Page",
        details: [
          "Go to the Facebook Page you just created",
          "Click 'Settings' (gear icon) in the left sidebar",
          "Click 'Linked Accounts' or 'Instagram'",
          "Click 'Connect Account'",
          "Log in with the Instagram credentials",
          "Authorize the connection",
          "Verify it shows 'Connected' with the correct Instagram username",
        ],
        important: "Each Instagram Business account must be connected to exactly ONE Facebook Page.",
      },
    ],
  },
  {
    title: "3. Connect to Meta Developer App",
    icon: Globe,
    color: "text-cyan-400",
    steps: [
      {
        id: "meta-1",
        title: "Access Meta Developer Dashboard",
        description: "Go to the Meta Developer portal and access our app",
        details: [
          "Go to developers.facebook.com",
          "Log in with the MAIN Facebook account (the one that owns the developer app)",
          "Go to 'My Apps' and select our app",
          "Navigate to 'Instagram' → 'Instagram Accounts'",
        ],
        links: [
          { label: "Meta Developer Portal", url: "https://developers.facebook.com" },
        ],
        important: "You need admin access to the Meta Developer App. Ask Dylan for the credentials if needed.",
      },
      {
        id: "meta-2",
        title: "Add Instagram Account to App",
        description: "Add the Instagram Business account to our Meta Developer App",
        details: [
          "In the Meta Developer App dashboard, go to 'Instagram' settings",
          "Click 'Add Instagram Account'",
          "The Facebook Page connected to this Instagram should appear",
          "Select it and authorize access",
          "Make sure all permissions are granted (instagram_basic, instagram_content_publish, instagram_manage_insights, pages_read_engagement)",
        ],
      },
      {
        id: "meta-3",
        title: "Generate Access Token",
        description: "Generate and save the long-lived access token for this account",
        details: [
          "Go to Graph API Explorer: developers.facebook.com/tools/explorer",
          "Select our app from the dropdown",
          "Click 'Generate Access Token'",
          "Grant all requested permissions",
          "Copy the SHORT-LIVED token",
          "Exchange for LONG-LIVED token using the endpoint below",
        ],
        links: [
          { label: "Graph API Explorer", url: "https://developers.facebook.com/tools/explorer" },
        ],
      },
      {
        id: "meta-4",
        title: "Get Long-Lived Token & IDs",
        description: "Exchange the short-lived token for a 60-day token and get the IG User ID",
        details: [
          "Exchange short token for long token:",
          "GET /oauth/access_token?grant_type=fb_exchange_token&client_id={APP_ID}&client_secret={APP_SECRET}&fb_exchange_token={SHORT_TOKEN}",
          "",
          "Get the Facebook Page ID:",
          "GET /me/accounts?access_token={LONG_TOKEN}",
          "",
          "Get the Instagram User ID:",
          "GET /{PAGE_ID}?fields=instagram_business_account&access_token={LONG_TOKEN}",
          "",
          "Save these three values in the dashboard:",
          "1. Long-lived access token (ig_access_token)",
          "2. Facebook Page ID (fb_page_id)",
          "3. Instagram User ID (ig_user_id)",
        ],
        important: "Long-lived tokens expire after 60 days. Set a reminder to refresh them!",
      },
    ],
  },
  {
    title: "4. Save Credentials in Dashboard",
    icon: Key,
    color: "text-yellow-400",
    steps: [
      {
        id: "save-1",
        title: "Update Account in Dashboard",
        description: "Save the access token and IDs in the IG Accounts page",
        details: [
          "Go to the 'IG Accounts' page in the dashboard",
          "Find the account you just set up",
          "Click Edit and fill in:",
          "  • ig_access_token: the long-lived token",
          "  • ig_user_id: the Instagram Business account ID",
          "  • fb_page_id: the linked Facebook Page ID",
          "Click Save",
          "Test by trying to publish a test post from the Publisher page",
        ],
      },
    ],
  },
]

export default function VAGuidePage() {
  const [completed, setCompleted] = useState<Set<string>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("va-guide-completed")
        return saved ? new Set(JSON.parse(saved)) : new Set()
      } catch { return new Set() }
    }
    return new Set()
  })

  const [copied, setCopied] = useState<string | null>(null)

  const toggleStep = (id: string) => {
    setCompleted(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (typeof window !== "undefined") {
        localStorage.setItem("va-guide-completed", JSON.stringify([...next]))
      }
      return next
    })
  }

  const totalSteps = sections.reduce((sum, s) => sum + s.steps.length, 0)
  const completedCount = completed.size
  const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-orange-300" />
          VA Setup Guide
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Step-by-step guide to connect Instagram Business accounts to the Meta API for auto-posting.
        </p>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Setup Progress</span>
            <span className="text-sm text-muted-foreground">{completedCount}/{totalSteps} steps</span>
          </div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <section.icon className={`h-5 w-5 ${section.color}`} />
              {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.steps.map((step, i) => {
              const isDone = completed.has(step.id)
              return (
                <div
                  key={step.id}
                  className={`rounded-lg border p-4 transition-colors ${isDone ? "bg-green-500/5 border-green-500/20" : "border-border/50"}`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="mt-0.5 shrink-0"
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-green-400" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                      )}
                    </button>
                    <div className="flex-1">
                      <h3 className={`font-semibold text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        Step {i + 1}: {step.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">{step.description}</p>

                      <ul className="mt-3 space-y-1.5">
                        {step.details.map((detail, di) => (
                          <li key={di} className="flex items-start gap-2 text-sm">
                            {detail ? (
                              <>
                                <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/50" />
                                <span className={detail.startsWith("GET ") || detail.startsWith("  •") ? "font-mono text-xs bg-secondary/50 px-1.5 py-0.5 rounded" : ""}>
                                  {detail}
                                </span>
                                {detail.startsWith("GET ") && (
                                  <button
                                    onClick={() => copyText(detail, `${step.id}-${di}`)}
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                  >
                                    {copied === `${step.id}-${di}` ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                              </>
                            ) : (
                              <div className="h-2" />
                            )}
                          </li>
                        ))}
                      </ul>

                      {step.links && (
                        <div className="flex gap-2 mt-3">
                          {step.links.map(link => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" /> {link.label}
                            </a>
                          ))}
                        </div>
                      )}

                      {step.important && (
                        <div className="mt-3 flex items-start gap-2 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-md p-2.5">
                          <Shield className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                          <span className="text-yellow-200/80">{step.important}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      {/* Environment Variables Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-yellow-400" />
            Environment Variables Needed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-2 bg-secondary/30 rounded p-2">
              <span className="text-blue-400">META_APP_ID</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-muted-foreground italic">Your Meta Developer App ID</span>
            </div>
            <div className="flex items-center gap-2 bg-secondary/30 rounded p-2">
              <span className="text-blue-400">META_APP_SECRET</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-muted-foreground italic">Your Meta Developer App Secret</span>
            </div>
            <div className="flex items-center gap-2 bg-secondary/30 rounded p-2">
              <span className="text-blue-400">KLING_API_KEY</span>
              <span className="text-muted-foreground">=</span>
              <span className="text-muted-foreground italic">Kling AI API key for media generation</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Add these to your <code className="bg-secondary/50 px-1 rounded">.env.local</code> file.
            Per-account tokens (ig_access_token, ig_user_id, fb_page_id) are stored in the database.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
