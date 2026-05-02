"use client"

import { useState, useEffect, useRef, useCallback, Fragment } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Wand2, Play, Square, Trash2, X, CheckCircle, AlertTriangle,
  Video, Monitor, Pause, Download, Send, BarChart3, Rocket,
  ChevronDown, ChevronUp, Tag, Plus, Clock, Circle, ExternalLink,
  RefreshCw, Zap, RotateCcw, HelpCircle, ChevronRight, PartyPopper,
  LayoutGrid, Wrench, Eye, Activity, PlayCircle, Edit2, TrendingUp,
  Pencil, Server, Layers, MoreHorizontal,
  MessageCircle as RedditFallbackIcon, Mail as EmailIcon, Smartphone as SmsIcon,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ReplayAutomationDialog } from "@/components/replay-automation-dialog"
import { RetryQueueWidget } from "@/components/retry-queue-widget"
import { NudgeBanners } from "@/components/nudge-banners"
import PlatformLoginModal from "@/components/platform-login-modal"
import { SparklineChart } from "@/components/automations/sparkline-chart"
import { VariableAutocomplete } from "@/components/automations/variable-autocomplete"
import { DryRunResultModal, type DryRunResultPayload } from "@/components/automations/dry-run-result-modal"
import { ReplayViewerModal } from "@/components/automations/replay-viewer-modal"
import type { DailySparklinePoint } from "@/lib/api/automations"
import { useBusinessId } from "@/lib/use-business"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

/* ─── Platform Icons ─── */
function IGIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <defs><linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor="#feda75"/><stop offset="25%" stopColor="#fa7e1e"/>
        <stop offset="50%" stopColor="#d62976"/><stop offset="75%" stopColor="#962fbf"/>
        <stop offset="100%" stopColor="#4f5bd5"/>
      </linearGradient></defs>
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="url(#ig-g)" strokeWidth="2"/>
      <circle cx="12" cy="12" r="5" stroke="url(#ig-g)" strokeWidth="2"/>
      <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-g)"/>
    </svg>
  )
}
function FBIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1877F2"/>
      <path d="M15.5 8H14c-1.1 0-2 .9-2 2v2h3l-.5 3H12v7h-3v-7H7v-3h2v-2.5C9 7.6 10.6 6 12.5 6H15.5v2z" fill="white"/>
    </svg>
  )
}
function LIIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="2" fill="#0A66C2"/>
      <path d="M7 10v7M7 7v.01M10 17v-4c0-1.1.9-2 2-2s2 .9 2 2v4M14 10v7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function TikTokIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000"/>
      <path d="M16.5 6.5c-.7-.5-1.2-1.3-1.3-2.2h-2.4v10.4c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3 1-2.3 2.3-2.3c.2 0 .5 0 .7.1V10c-.2 0-.5-.1-.7-.1-2.6 0-4.7 2.1-4.7 4.7s2.1 4.7 4.7 4.7 4.7-2.1 4.7-4.7V9.8c.9.7 2 1 3.1 1V8.4c-1 0-1.9-.4-2.8-1.1" fill="#25F4EE"/>
      <path d="M16.5 6.5c-.7-.5-1.2-1.3-1.3-2.2h-2.4v10.4c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3 1-2.3 2.3-2.3c.2 0 .5 0 .7.1V10c-.2 0-.5-.1-.7-.1-2.6 0-4.7 2.1-4.7 4.7s2.1 4.7 4.7 4.7 4.7-2.1 4.7-4.7V9.8c.9.7 2 1 3.1 1V8.4c-1 0-1.9-.4-2.8-1.1" fill="#FE2C55" opacity="0.7"/>
    </svg>
  )
}
function YouTubeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="4" width="20" height="16" rx="4" fill="#FF0000"/>
      <path d="M10 8.5v7l6-3.5-6-3.5z" fill="white"/>
    </svg>
  )
}
function XIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#000"/>
      <path d="M7 7l10 10M17 7L7 17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
function SnapchatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#FFFC00"/>
      <path d="M12 5.5c-3 0-4.5 2-4.5 4.2v2.3c-.4.2-1 .4-1.5.4-.3 0-.5.2-.5.5 0 .4.3.7 1.2 1.1.5.2.9.4 1.1.7-.2 1.1-1.5 1.8-2.4 2.2-.3.1-.4.3-.4.5 0 .4.7.6 1.4.7.2.7.7.9 1 .9.3 0 .7-.1 1.2-.1.6 0 1 .1 1.6.5.6.4 1.2.7 2.3.7s1.7-.3 2.3-.7c.6-.4 1-.5 1.6-.5.5 0 .9.1 1.2.1.3 0 .8-.2 1-.9.7-.1 1.4-.3 1.4-.7 0-.2-.1-.4-.4-.5-.9-.4-2.2-1.1-2.4-2.2.2-.3.6-.5 1.1-.7.9-.4 1.2-.7 1.2-1.1 0-.3-.2-.5-.5-.5-.5 0-1.1-.2-1.5-.4V9.7c0-2.2-1.5-4.2-4.5-4.2z" fill="#000"/>
    </svg>
  )
}
function PinterestIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#E60023"/>
      <path d="M12.2 6.8c-2.5 0-4.5 1.6-4.5 4 0 1.1.4 2.2 1.3 2.5.1.1.3 0 .3-.1l.1-.5c0-.1 0-.2-.1-.3-.2-.3-.4-.7-.4-1.3 0-1.7 1.3-3.2 3.3-3.2 1.8 0 2.8 1.1 2.8 2.6 0 2-.9 3.7-2.2 3.7-.7 0-1.3-.6-1.1-1.4.2-.9.7-1.9.7-2.6 0-.6-.3-1.1-1-1.1-.8 0-1.4.8-1.4 1.9 0 .7.2 1.1.2 1.1L9.4 16c-.3 1.1-.1 2.5-.1 2.6 0 .1.1.1.2.1 0 0 .6-.8 1.1-1.9.1-.3.7-2.8.7-2.8.3.7 1.3 1.3 2.3 1.3 3 0 5.1-2.8 5.1-6.4 0-2.8-2.3-4.9-5.5-4.9z" fill="white"/>
    </svg>
  )
}

// Reddit/Email/SMS use lucide fallbacks (RedditFallbackIcon, EmailIcon, SmsIcon
// — imported with the rest of lucide at the top). Replace with custom SVGs
// if/when designed; no other change needed.
const platformIcons: Record<string, React.FC<{ className?: string }>> = {
  ig: IGIcon, fb: FBIcon, li: LIIcon, tiktok: TikTokIcon, youtube: YouTubeIcon,
  x: XIcon, snapchat: SnapchatIcon, pinterest: PinterestIcon,
  reddit: RedditFallbackIcon, email: EmailIcon, sms: SmsIcon,
}
const platformLabels: Record<string, string> = {
  ig: "Instagram", fb: "Facebook", li: "LinkedIn", tiktok: "TikTok", youtube: "YouTube",
  x: "X", snapchat: "Snapchat", pinterest: "Pinterest",
  reddit: "Reddit", email: "Email", sms: "SMS",
}
const platformColors: Record<string, string> = {
  ig: "from-pink-500/20 to-purple-500/20 border-pink-500/30",
  fb: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
  li: "from-sky-500/20 to-blue-500/20 border-sky-500/30",
  tiktok: "from-muted/30 to-muted/40 border-border/50",
  youtube: "from-red-500/20 to-red-600/20 border-red-500/30",
  x: "from-zinc-500/20 to-zinc-600/20 border-zinc-500/30",
  snapchat: "from-yellow-400/20 to-yellow-500/20 border-yellow-500/30",
  pinterest: "from-rose-500/20 to-red-500/20 border-rose-500/30",
  reddit: "from-orange-500/20 to-red-500/20 border-orange-500/30",
  email: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  sms: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
}

/* ─── Recording Guides ─── */
interface GuideStep {
  title: string
  description: string
  tip?: string
}

const RECORDING_GUIDES: Record<string, { steps: GuideStep[]; exampleSearch: string; exampleTip: string }> = {
  ig_dm: {
    exampleSearch: "starbucks",
    exampleTip: "Try searching 'starbucks' in Instagram",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin", tip: "Recording captures your mouse clicks and keystrokes" },
      { title: "Open Instagram", description: "In the browser, go to instagram.com", tip: "You should already be logged in" },
      { title: "Go to any profile", description: "Search for any business and click their profile" },
      { title: "Click Message", description: "Hit the 'Message' button on their profile" },
      { title: "Type a test message", description: "Type anything — 'hello' works fine" },
      { title: "Send it", description: "Press Enter or click Send" },
      { title: "Stop Recording", description: "Come back and hit the stop button!", tip: "George will learn from what you just did" },
    ]
  },
  ig_follow: {
    exampleSearch: "starbucks",
    exampleTip: "Try searching 'starbucks' in Instagram",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin", tip: "Recording captures your mouse clicks and keystrokes" },
      { title: "Open Instagram", description: "In the browser, go to instagram.com", tip: "You should already be logged in" },
      { title: "Search for someone", description: "Use the search bar to find any account" },
      { title: "Go to their profile", description: "Click on their name to open their profile page" },
      { title: "Click Follow", description: "Hit the 'Follow' button on their profile" },
      { title: "Stop Recording", description: "Come back and hit the stop button!", tip: "George will learn the follow flow" },
    ]
  },
  ig_unfollow: {
    exampleSearch: "starbucks",
    exampleTip: "Try someone you already follow",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin", tip: "Recording captures your mouse clicks and keystrokes" },
      { title: "Open Instagram", description: "In the browser, go to instagram.com" },
      { title: "Go to a profile you follow", description: "Search for someone you're already following" },
      { title: "Click Following", description: "Hit the 'Following' button on their profile" },
      { title: "Click Unfollow", description: "Confirm the unfollow in the popup" },
      { title: "Stop Recording", description: "Come back and hit the stop button!", tip: "George will learn the unfollow flow" },
    ]
  },
  fb_dm: {
    exampleSearch: "Starbucks",
    exampleTip: "Try searching 'Starbucks' on Facebook",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin", tip: "Recording captures your mouse clicks and keystrokes" },
      { title: "Open Facebook", description: "In the browser, go to facebook.com", tip: "You should already be logged in" },
      { title: "Find a page or person", description: "Search for any business page or person" },
      { title: "Click Message", description: "Hit the 'Message' or 'Send Message' button" },
      { title: "Type a test message", description: "Type anything — 'hello' works fine" },
      { title: "Send it", description: "Press Enter or click the send button" },
      { title: "Stop Recording", description: "Come back and hit the stop button!", tip: "George will learn from what you just did" },
    ]
  },
  fb_follow: {
    exampleSearch: "Starbucks",
    exampleTip: "Try searching 'Starbucks' on Facebook",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open Facebook", description: "In the browser, go to facebook.com" },
      { title: "Find a page", description: "Search for any business page" },
      { title: "Click Follow or Like", description: "Hit the 'Follow' or 'Like' button on the page" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  fb_unfollow: {
    exampleSearch: "Starbucks",
    exampleTip: "Try a page you already follow",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open Facebook", description: "In the browser, go to facebook.com" },
      { title: "Go to a page you follow", description: "Search for a page you're already following" },
      { title: "Click Following", description: "Hit the 'Following' button" },
      { title: "Click Unfollow", description: "Select 'Unfollow' from the menu" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  li_dm: {
    exampleSearch: "Satya Nadella",
    exampleTip: "Try searching 'Satya Nadella' on LinkedIn",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin", tip: "Recording captures your mouse clicks and keystrokes" },
      { title: "Open LinkedIn", description: "In the browser, go to linkedin.com", tip: "You should already be logged in" },
      { title: "Go to a profile", description: "Search for anyone and click their profile" },
      { title: "Click Message", description: "Hit the 'Message' button on their profile" },
      { title: "Type a test message", description: "Type anything — 'hello' works fine" },
      { title: "Send it", description: "Press Enter or click Send" },
      { title: "Stop Recording", description: "Come back and hit the stop button!", tip: "George will learn from what you just did" },
    ]
  },
  li_connect: {
    exampleSearch: "Satya Nadella",
    exampleTip: "Try searching 'Satya Nadella' on LinkedIn",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open LinkedIn", description: "In the browser, go to linkedin.com" },
      { title: "Go to a profile", description: "Search for anyone and click their profile" },
      { title: "Click Connect", description: "Hit the 'Connect' button on their profile" },
      { title: "Add a note", description: "Click 'Add a note' and type a short message" },
      { title: "Send it", description: "Click 'Send' to send the connection request" },
      { title: "Stop Recording", description: "Come back and hit the stop button!", tip: "George will learn the connect+note flow" },
    ]
  },
  li_follow: {
    exampleSearch: "Satya Nadella",
    exampleTip: "Try searching 'Satya Nadella' on LinkedIn",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open LinkedIn", description: "In the browser, go to linkedin.com" },
      { title: "Go to a profile", description: "Search for anyone and click their profile" },
      { title: "Click Follow", description: "Hit the 'Follow' button on their profile", tip: "If you don't see Follow, click '... More' first" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  li_unfollow: {
    exampleSearch: "Satya Nadella",
    exampleTip: "Try someone you already follow",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open LinkedIn", description: "In the browser, go to linkedin.com" },
      { title: "Go to a profile you follow", description: "Search for someone you're already following" },
      { title: "Click Following/Unfollow", description: "Click the 'Following' button, then 'Unfollow'", tip: "The button might say '... More' — check there too" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  tiktok_dm: {
    exampleSearch: "starbucks",
    exampleTip: "Try searching 'starbucks' on TikTok",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open TikTok", description: "In the browser, go to tiktok.com", tip: "You should already be logged in" },
      { title: "Go to someone's profile", description: "Search for anyone and click their profile" },
      { title: "Click the message icon", description: "Look for the paper plane or message icon" },
      { title: "Type a test message", description: "Type anything — 'hello' works fine" },
      { title: "Send it", description: "Press Enter or click Send" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  tiktok_follow: {
    exampleSearch: "starbucks",
    exampleTip: "Try searching 'starbucks' on TikTok",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open TikTok", description: "In the browser, go to tiktok.com" },
      { title: "Go to someone's profile", description: "Search for anyone and click their profile" },
      { title: "Click Follow", description: "Hit the 'Follow' button" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  youtube_dm: {
    exampleSearch: "MrBeast",
    exampleTip: "Try searching 'MrBeast' on YouTube",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open YouTube", description: "In the browser, go to youtube.com" },
      { title: "Go to a channel", description: "Search for any channel and click on it" },
      { title: "Find the message option", description: "Look for a way to message the creator", tip: "Not all channels have messaging enabled" },
      { title: "Type a test message", description: "Type anything — 'hello' works fine" },
      { title: "Send it", description: "Click Send" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
  youtube_subscribe: {
    exampleSearch: "MrBeast",
    exampleTip: "Try searching 'MrBeast' on YouTube",
    steps: [
      { title: "Click Start Recording", description: "Hit the big red button below to begin" },
      { title: "Open YouTube", description: "In the browser, go to youtube.com" },
      { title: "Go to a channel", description: "Search for any channel and click on it" },
      { title: "Click Subscribe", description: "Hit the big red 'Subscribe' button" },
      { title: "Stop Recording", description: "Come back and hit the stop button!" },
    ]
  },
}

/* ─── Automation Definitions ─── */
/**
 * Catalog tile for one built-in automation (e.g. Instagram DM). The catalog no
 * longer carries hard-coded `active: true` / `tested: "Mar 30"` flags — those
 * were a 2026-03 placeholder and showed "Active" even when the DB had zero
 * rows. The live state now comes from `isAutoActive`, which cross-checks the
 * `automations` table at runtime. If a DB row keyed by `slug` exists with
 * `status='active'` and ≥1 step, the tile renders as Active; otherwise
 * "Needs Recording".
 *
 * - `slug` is the canonical `{platform}_{action}` identifier we use as the
 *   primary key in the `automations` DB table for catalog tiles.
 * - `tag` mirrors the DB `tag` column ("outreach_action" vs "lead_enrichment")
 *   so Your Automations can style enrichment tiles differently.
 */
interface AutomationDef {
  platform: string
  action: string
  actionKey: string
  slug: string
  active: false            // catalog default — always false; live state comes from DB
  tested: null             // catalog default — null, we never claim a test date we can't prove
  needsRecording: boolean  // most platforms need a recorded automation; Email/SMS use API calls so they don't
  desc: string
  note?: string
  tag?: "outreach_action" | "lead_enrichment" | "utility"
}

const ALL_AUTOMATIONS: AutomationDef[] = [
  // ─── Outreach actions ───
  { platform: "ig", action: "DM", actionKey: "dm", slug: "ig_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send direct messages on Instagram" },
  { platform: "ig", action: "Follow", actionKey: "follow", slug: "ig_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow users on Instagram" },
  { platform: "ig", action: "Unfollow", actionKey: "unfollow", slug: "ig_unfollow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Unfollow users on Instagram" },
  { platform: "fb", action: "DM", actionKey: "dm", slug: "fb_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send messages on Facebook" },
  { platform: "fb", action: "Follow", actionKey: "follow", slug: "fb_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow pages on Facebook" },
  { platform: "fb", action: "Unfollow", actionKey: "unfollow", slug: "fb_unfollow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Unfollow pages on Facebook" },
  { platform: "li", action: "Connect+Note", actionKey: "connect", slug: "li_connect", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send connection requests with notes" },
  { platform: "li", action: "DM", actionKey: "dm", slug: "li_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send LinkedIn messages" },
  { platform: "li", action: "Follow", actionKey: "follow", slug: "li_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow profiles on LinkedIn" },
  { platform: "li", action: "Unfollow", actionKey: "unfollow", slug: "li_unfollow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Unfollow profiles on LinkedIn" },
  { platform: "tiktok", action: "DM", actionKey: "dm", slug: "tiktok_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send TikTok direct messages" },
  { platform: "tiktok", action: "Follow", actionKey: "follow", slug: "tiktok_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow users on TikTok" },
  { platform: "youtube", action: "DM", actionKey: "dm", slug: "youtube_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send YouTube messages" },
  { platform: "youtube", action: "Subscribe", actionKey: "subscribe", slug: "youtube_subscribe", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Subscribe to YouTube channels" },

  // ─── Lead enrichment (IG) — scrape fields from a public profile ───
  { platform: "ig", action: "Scrape Follower Count", actionKey: "scrape_follower_count", slug: "ig_scrape_follower_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the follower count from an IG profile" },
  { platform: "ig", action: "Scrape Following Count", actionKey: "scrape_following_count", slug: "ig_scrape_following_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull how many accounts the profile follows" },
  { platform: "ig", action: "Scrape Post Count", actionKey: "scrape_post_count", slug: "ig_scrape_post_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull total posts on the profile" },
  { platform: "ig", action: "Scrape Bio", actionKey: "scrape_bio", slug: "ig_scrape_bio", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the IG bio text" },
  { platform: "ig", action: "Scrape Category", actionKey: "scrape_category", slug: "ig_scrape_category", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the business category label" },

  // ─── Lead enrichment (FB) ───
  { platform: "fb", action: "Scrape Follower Count", actionKey: "scrape_follower_count", slug: "fb_scrape_follower_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the follower count from a FB page" },
  { platform: "fb", action: "Scrape Following Count", actionKey: "scrape_following_count", slug: "fb_scrape_following_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull how many pages/people the profile follows" },
  { platform: "fb", action: "Scrape Post Count", actionKey: "scrape_post_count", slug: "fb_scrape_post_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull total posts on the page" },
  { platform: "fb", action: "Scrape Bio", actionKey: "scrape_bio", slug: "fb_scrape_bio", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the page About/bio text" },
  { platform: "fb", action: "Scrape Category", actionKey: "scrape_category", slug: "fb_scrape_category", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the page category label" },

  // ─── Lead enrichment (LinkedIn) ───
  { platform: "li", action: "Scrape Follower Count", actionKey: "scrape_follower_count", slug: "li_scrape_follower_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the follower count from a LI profile/company" },
  { platform: "li", action: "Scrape Following Count", actionKey: "scrape_following_count", slug: "li_scrape_following_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull how many entities the profile follows" },
  { platform: "li", action: "Scrape Post Count", actionKey: "scrape_post_count", slug: "li_scrape_post_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull total posts by the profile/company" },
  { platform: "li", action: "Scrape Bio", actionKey: "scrape_bio", slug: "li_scrape_bio", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the About/headline text" },
  { platform: "li", action: "Scrape Category", actionKey: "scrape_category", slug: "li_scrape_category", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the company industry or profile headline tag" },

  // ─── Reddit (outreach + enrichment) ───
  { platform: "reddit", action: "DM", actionKey: "dm", slug: "reddit_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send a direct chat message on Reddit" },
  { platform: "reddit", action: "Follow", actionKey: "follow", slug: "reddit_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow a redditor's profile" },
  { platform: "reddit", action: "Comment", actionKey: "comment", slug: "reddit_comment", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Reply to a Reddit post or comment" },
  { platform: "reddit", action: "Post", actionKey: "post", slug: "reddit_post", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Submit a new post to a subreddit" },
  { platform: "reddit", action: "Scrape Karma", actionKey: "scrape_karma", slug: "reddit_scrape_karma", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull post + comment karma from a profile" },
  { platform: "reddit", action: "Scrape Bio", actionKey: "scrape_bio", slug: "reddit_scrape_bio", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the redditor's About text" },

  // ─── X / Twitter (outreach + enrichment) ───
  { platform: "x", action: "DM", actionKey: "dm", slug: "x_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send a direct message on X" },
  { platform: "x", action: "Follow", actionKey: "follow", slug: "x_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow an account on X" },
  { platform: "x", action: "Unfollow", actionKey: "unfollow", slug: "x_unfollow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Unfollow an account on X" },
  { platform: "x", action: "Reply", actionKey: "reply", slug: "x_reply", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Reply to an X post" },
  { platform: "x", action: "Scrape Follower Count", actionKey: "scrape_follower_count", slug: "x_scrape_follower_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the follower count from an X profile" },
  { platform: "x", action: "Scrape Bio", actionKey: "scrape_bio", slug: "x_scrape_bio", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the X profile bio text" },

  // ─── Snapchat (outreach only — no public enrichment surface) ───
  { platform: "snapchat", action: "DM", actionKey: "dm", slug: "snapchat_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send a chat on Snapchat web" },
  { platform: "snapchat", action: "Follow", actionKey: "follow", slug: "snapchat_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Add friend / follow on Snapchat" },

  // ─── Pinterest (outreach + enrichment) ───
  { platform: "pinterest", action: "DM", actionKey: "dm", slug: "pinterest_dm", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Send a Pinterest direct message" },
  { platform: "pinterest", action: "Follow", actionKey: "follow", slug: "pinterest_follow", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Follow a Pinterest account" },
  { platform: "pinterest", action: "Save Pin", actionKey: "save_pin", slug: "pinterest_save_pin", active: false, tested: null, needsRecording: true, tag: "outreach_action", desc: "Save a pin to a board (engagement signal)" },
  { platform: "pinterest", action: "Scrape Follower Count", actionKey: "scrape_follower_count", slug: "pinterest_scrape_follower_count", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the follower count from a Pinterest profile" },
  { platform: "pinterest", action: "Scrape Bio", actionKey: "scrape_bio", slug: "pinterest_scrape_bio", active: false, tested: null, needsRecording: true, tag: "lead_enrichment", desc: "Pull the profile bio text" },

  // ─── Email (Instantly-backed; uses API directly — no recording) ───
  { platform: "email", action: "Send via Instantly", actionKey: "send_instantly", slug: "email_send_instantly", active: false, tested: null, needsRecording: false, tag: "outreach_action", desc: "Send an email through Instantly's API", note: "Uses /api/email/instantly/send. Configure API key under /agency/accounts → Email." },
  { platform: "email", action: "Validate Address", actionKey: "validate", slug: "email_validate", active: false, tested: null, needsRecording: false, tag: "utility", desc: "Validate an email exists and looks deliverable", note: "Uses Instantly's /accounts validation endpoint." },

  // ─── SMS (GHL-backed; uses GHL API directly — no recording) ───
  { platform: "sms", action: "Send via GHL", actionKey: "send_ghl", slug: "sms_send_ghl", active: false, tested: null, needsRecording: false, tag: "outreach_action", desc: "Send an SMS through GoHighLevel's API", note: "Uses /api/email/ghl/sms. Configure GHL credentials under /agency/accounts → SMS." },
  { platform: "sms", action: "Validate Number", actionKey: "validate", slug: "sms_validate", active: false, tested: null, needsRecording: false, tag: "utility", desc: "Validate a phone number is reachable", note: "Uses Twilio Lookup via GHL." },
]

const PLATFORMS_ORDER = ["ig", "fb", "li", "tiktok", "youtube", "x", "reddit", "snapchat", "pinterest", "email", "sms"]

/** Map short platform keys (ig/fb/li/etc) to the DB platform strings the
 *  /api/automations route stores. Keep this in sync with migration 005. */
const PLATFORM_DB_KEY: Record<string, string> = {
  ig: "instagram", fb: "facebook", li: "linkedin",
  tiktok: "tiktok", youtube: "youtube", x: "twitter",
  snapchat: "snapchat", pinterest: "pinterest",
}
const PLATFORM_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORM_DB_KEY).map(([k, v]) => [v, k])
)

const AUTOMATION_TAGS = [
  { value: "outreach_action", label: "Outreach Action", hint: "Sends a DM, follows, connects, etc." },
  { value: "lead_enrichment", label: "Lead Enrichment", hint: "Scrapes profile data for a lead." },
  { value: "utility", label: "Utility", hint: "Housekeeping tasks (logout, refresh, etc.)" },
] as const

const VNC_URL = process.env.NEXT_PUBLIC_VNC_URL || "https://srv1197943.taild42583.ts.net/vnc.html"
// noVNC password query param is plaintext — RFB truncates to 8 chars at the
// server. Dashboard is behind admin-PIN + Tailscale funnel, but embedding a
// hardcoded fallback would leak the password to anyone who inspects the
// client bundle — so the password is env-only. If NEXT_PUBLIC_VNC_PASSWORD
// is not set, we render the iframe without a password and show a friendly
// in-app message instead (see VncEmbedNotice below).
const VNC_PASSWORD = process.env.NEXT_PUBLIC_VNC_PASSWORD || ""
const VNC_EMBED_URL = VNC_PASSWORD
  ? `${VNC_URL}${VNC_URL.includes("?") ? "&" : "?"}autoconnect=true&resize=scale&password=${encodeURIComponent(VNC_PASSWORD)}`
  : ""

/* ─── Confetti ─── */
function Confetti() {
  const colors = ["#f59e0b","#ef4444","#8b5cf6","#3b82f6","#10b981","#ec4899"]
  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {Array.from({ length: 60 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: colors[i % colors.length], left: `${Math.random() * 100}%`, top: -10 }}
          animate={{ y: [0, typeof window !== 'undefined' ? window.innerHeight : 800], x: [0, (Math.random() - 0.5) * 300], rotate: [0, 720 + Math.random() * 360], opacity: [1, 0] }}
          transition={{ duration: 2.5 + Math.random() * 1.5, delay: Math.random() * 0.8, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}

/* ─── Toast ─── */
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t) }, [onClose])
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50 }}
      className="fixed bottom-6 right-6 z-[90] bg-emerald-500/20 border border-emerald-500/40 backdrop-blur-xl rounded-2xl px-5 py-4 max-w-sm shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-emerald-300">{message}</p>
        </div>
        <button onClick={onClose} className="text-emerald-400/60 hover:text-emerald-300"><X className="h-4 w-4" /></button>
      </div>
    </motion.div>
  )
}

/* ─── Types — new automations catalog (Phase 2) ─── */
/**
 * Shape of a row returned by /api/automations (the new `automations` table
 * added in migration 005). Kept in one place so Your Automations cards,
 * Maintenance table, and Overview tiles can all share the same type.
 */
interface DbAutomation {
  id: string
  name: string
  platform: string                   // DB platform string (instagram, facebook, ...)
  status: "draft" | "needs_recording" | "active" | "needs_rerecording" | "fixing" | "broken"
  tag: "outreach_action" | "lead_enrichment" | "utility" | null
  description: string | null
  steps: Array<{ index: number; description: string; kind: string; selectors: Record<string, unknown>; coords: { x: number; y: number } | null } | Record<string, unknown>>
  created_at: string
  updated_at: string
  last_tested_at: string | null
  last_error: string | null
  health_score: number
  account_id: string | null
  // `source` is populated by the unified /api/automations/list endpoint.
  // When present, it's 'dashboard' for native Phase-2 automations and
  // 'extension' for rows pulled from `autobot_automations` (AutoBot
  // Chrome extension recordings). The UI uses this to render a small
  // "From Extension" badge so Dylan can tell where a row came from.
  source?: "dashboard" | "extension"
}

interface DbAutomationRun {
  id: string
  automation_id: string
  run_type: string | null
  status: "running" | "passed" | "failed" | "healed"
  started_at: string
  finished_at: string | null
  error: string | null
  steps_completed: number | null
  // Populated by /api/automations/list when the recording-service has
  // captured per-step shots. Optional because older runs predate that
  // column being persisted from the VPS replay endpoint.
  screenshot_urls?: string[] | null
}

/* ─── Add Automation Modal ───
 * The "Add {Platform} Automation" button in Your Automations opens this.
 * Two-step flow:
 *   1. Fill in Name / Steps / Tag (platform is pre-locked from the row that opened the modal)
 *   2. POST /api/automations to create the draft, then transition to a
 *      "Ready to record — open dummy group VNC" screen. The CDP recorder is
 *      a separate workstream, so for now the Record button is a stub that
 *      says "Recording coming in next build".
 */
function AddAutomationModal({
  open,
  onClose,
  platformKey,      // short key (ig/fb/...) or null when re-using
  initial,          // populated when editing an existing automation
  onSaved,
}: {
  open: boolean
  onClose: () => void
  platformKey: string | null
  initial?: DbAutomation | null
  onSaved: (automation: DbAutomation, action: "created" | "updated") => void
}) {
  const [name, setName] = useState("")
  const [steps, setSteps] = useState("")
  const [tag, setTag] = useState<string>("outreach_action")
  const [phase, setPhase] = useState<"form" | "ready">("form")
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const effectivePlatformKey = initial ? PLATFORM_FROM_DB[initial.platform] || platformKey || "" : platformKey || ""
  const platformLabel = effectivePlatformKey ? platformLabels[effectivePlatformKey] : ""
  const PlatformIcon = effectivePlatformKey ? platformIcons[effectivePlatformKey] : null
  const isEditing = !!initial

  // Reset state every time the dialog opens so you don't leak state between
  // different platforms or between create/edit.
  useEffect(() => {
    if (open) {
      setName(initial?.name || "")
      setSteps(
        initial && Array.isArray(initial.steps)
          ? initial.steps.map((s: any) => typeof s?.description === "string" ? s.description : "").filter(Boolean).join("\n")
          : ""
      )
      setTag(initial?.tag || "outreach_action")
      setPhase("form")
      setSavedId(initial?.id || null)
      setError(null)
      setSaving(false)
    }
  }, [open, initial])

  if (!open || !effectivePlatformKey) return null

  const submit = async () => {
    if (!name.trim()) { setError("Name is required"); return }
    if (!steps.trim()) { setError("Write at least one step"); return }
    setSaving(true); setError(null)
    try {
      const dbPlatform = PLATFORM_DB_KEY[effectivePlatformKey]
      const url = isEditing ? `/api/automations/${initial!.id}` : "/api/automations"
      const method = isEditing ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, platform: dbPlatform, steps, tag }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Save failed"); setSaving(false); return }
      setSavedId(data.data.id)
      onSaved(data.data, isEditing ? "updated" : "created")
      setPhase("ready")
    } catch (e) {
      setError((e as Error).message || "Network error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
      >
        {phase === "form" && (
          <>
            <div className="flex items-center justify-between p-5 border-b border-border/30">
              <div className="flex items-center gap-3">
                {PlatformIcon && <PlatformIcon className="h-6 w-6" />}
                <div>
                  <h3 className="font-semibold text-base">
                    {isEditing ? "Edit Automation" : `New ${platformLabel} Automation`}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {isEditing ? "Rename, re-describe, or adjust steps" : `Describe what this automation should do on ${platformLabel}.`}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted/30 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={`e.g. ${platformLabel} DM`}
                  className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Steps</label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  One step per line, in order. Type <code className="font-mono">{"{{"}</code> to insert a variable like {"{{target_url}}"} or {"{{message}}"}.
                </p>
                <VariableAutocomplete
                  value={steps}
                  onChange={setSteps}
                  rows={6}
                  placeholder={"Navigate to {{target_url}}\nClick the Message button\nType {{message}}\nPress Enter"}
                  className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Tag</label>
                <div className="grid grid-cols-3 gap-2">
                  {AUTOMATION_TAGS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTag(t.value)}
                      className={`text-left rounded-xl border px-3 py-2 transition-all ${
                        tag === t.value
                          ? "border-orange-500/60 bg-orange-500/10 shadow-sm"
                          : "border-border/50 bg-muted/10 hover:border-border"
                      }`}
                    >
                      <p className="text-xs font-semibold">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t.hint}</p>
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 p-5 border-t border-border/30">
              <button
                onClick={onClose}
                className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors flex items-center gap-1.5"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {isEditing ? "Save" : "Next: Record"}
              </button>
            </div>
          </>
        )}

        {phase === "ready" && (
          <div className="p-6 text-center space-y-5">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40">
              <CheckCircle className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1">
                {isEditing ? "Saved!" : "Draft saved"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Ready to record this automation against the dummy group.
              </p>
            </div>

            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-left text-xs text-amber-300 space-y-1">
              <p className="font-semibold">Recording coming in next build</p>
              <p className="text-amber-300/80">
                The CDP recorder (captures selectors, coords, screenshots) is a separate workstream. Once it ships, this button will open the dummy group VNC with a bubble-per-click sidebar so you can demonstrate the steps.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={onClose}
                className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors"
              >
                Close
              </button>
              <button
                disabled
                title="Coming in next build"
                className="rounded-xl bg-orange-500/30 px-4 py-2 text-sm font-semibold text-white/70 cursor-not-allowed flex items-center gap-1.5"
              >
                <Video className="h-4 w-4" /> Open recording VNC
              </button>
            </div>

            {savedId && (
              <p className="text-[10px] text-muted-foreground/60 font-mono">ID: {savedId}</p>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

/* ─── Types ─── */
interface Recording {
  id: string; name: string; platform: string; action_type: string
  duration_seconds: number | null; status: string; created_at: string
  video_path: string | null; annotations: Annotation[]; tags: string[]
}
interface Annotation { time: number; label: string }
interface LoginResult { platform: string; loggedIn: boolean | null; loginUrl?: string; reason?: string | null; url?: string }
interface HealthStatus {
  chrome: boolean; xvfb: boolean; proxy: boolean; queueProcessor: boolean; recording: boolean
  accountsLoggedIn?: boolean
  loginResults?: LoginResult[]
  loggedOutCount?: number
}
interface DayStats { dmsSent: number; follows: number; errors: number }

const TAG_OPTIONS = ["warmup", "outreach", "engagement", "test"]
const tagColors: Record<string, string> = {
  warmup: "bg-amber-500/20 text-amber-400", outreach: "bg-blue-500/20 text-blue-400",
  engagement: "bg-purple-500/20 text-purple-400", test: "bg-muted/30 text-muted-foreground",
}

/* ─── Recording Modal (Full-screen immersive) ─── */
function RecordingModal({
  automation,
  isOpen,
  onClose,
  onComplete,
}: {
  automation: AutomationDef | null
  isOpen: boolean
  onClose: () => void
  onComplete: (platform: string, actionKey: string) => void
}) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [phase, setPhase] = useState<"guide" | "processing" | "done">("guide")
  const [processProgress, setProcessProgress] = useState(0)
  const [vncLoaded, setVncLoaded] = useState(false)
  const [vncError, setVncError] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [pipelineStarted, setPipelineStarted] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const popoutOpenedRef = useRef(false)

  const guideKey = automation ? `${automation.platform}_${automation.actionKey}` : ""
  const guide = RECORDING_GUIDES[guideKey]

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setIsRecording(false)
      setRecordingTime(0)
      setSessionId(null)
      setPhase("guide")
      setProcessProgress(0)
      setVncLoaded(false)
      setVncError(false)
      setShowHelp(false)
    }
  }, [isOpen])

  // VNC load timeout — if the iframe doesn't fire `onLoad` within 6s, treat
  // it as an error so the "Pop Out Browser" fallback surfaces. Without this
  // the user just sees "Loading browser view..." forever when the iframe is
  // silently blocked (e.g. by x-frame-options DENY on the VPS nginx, or when
  // the VNC password env var is missing so VNC_EMBED_URL is empty).
  useEffect(() => {
    if (!isOpen || phase !== "guide") return
    if (vncLoaded || vncError) return
    // If VNC_EMBED_URL is empty, fire the fallback immediately so we don't
    // even try to load a broken iframe.
    if (!VNC_EMBED_URL) {
      setVncError(true)
      return
    }
    const timer = setTimeout(() => {
      if (!vncLoaded) setVncError(true)
    }, 6000)
    return () => clearTimeout(timer)
  }, [isOpen, phase, vncLoaded, vncError])

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isRecording])

  // Fake processing progress
  useEffect(() => {
    if (phase === "processing") {
      const interval = setInterval(() => {
        setProcessProgress(p => {
          if (p >= 100) {
            clearInterval(interval)
            setTimeout(() => setPhase("done"), 500)
            return 100
          }
          // Speed varies — fast at start, slows in middle, fast at end
          const increment = p < 30 ? 8 : p < 70 ? 3 : p < 90 ? 5 : 10
          return Math.min(p + increment, 100)
        })
      }, 200)
      return () => clearInterval(interval)
    }
  }, [phase])

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  const startRecording = async () => {
    try {
      const res = await fetch("/api/recordings/start", { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSessionId(data.sessionId)
        setIsRecording(true)
        setRecordingTime(0)
        setCurrentStep(1) // Auto-advance past "Click Start Recording"
      }
    } catch (e) {
      console.error(e)
    }
  }

  const stopRecording = async () => {
    setIsRecording(false)
    setPhase("processing")
    try {
      const res = await fetch("/api/recordings/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          name: automation ? `${platformLabels[automation.platform]} ${automation.action}` : "Recording",
          platform: automation?.platform || "ig",
          action_type: automation?.actionKey || "dm",
          tags: ["outreach"],
        }),
      })
      const data = await res.json()
      // Pipeline runs async on the backend — we show success immediately
      // and the card will show "Setting up..." until self-test completes
      if (data.pipeline_status === "started") {
        setPipelineStarted(true)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDone = () => {
    if (automation) {
      onComplete(automation.platform, automation.actionKey)
    }
    onClose()
  }

  if (!isOpen || !automation || !guide) return null

  const PlatformIcon = platformIcons[automation.platform]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl"
    >
      {/* Recording Overlay Bar */}
      {isRecording && (
        <motion.div
          initial={{ y: -60 }}
          animate={{ y: 0 }}
          className="fixed top-0 left-0 right-0 z-[70] bg-red-500/20 backdrop-blur-xl border-b border-red-500/30 px-4 py-3"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                className="h-3 w-3 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.3], scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-sm font-semibold text-red-300">Recording...</span>
              <span className="text-lg font-mono font-bold text-red-200 tabular-nums">{formatTime(recordingTime)}</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={stopRecording}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop Recording
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Close button */}
      {phase === "guide" && !isRecording && (
        <button
          onClick={onClose}
          className="fixed top-4 right-4 z-[70] p-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Processing Phase */}
      {phase === "processing" && (
        <div className="h-full flex items-center justify-center p-8">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="max-w-md w-full text-center space-y-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="inline-block"
            >
              <Zap className="h-16 w-16 text-orange-400" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold mb-2">🎉 Nice!</h2>
              <p className="text-lg text-muted-foreground">George is learning this action now...</p>
            </div>
            <div className="space-y-2">
              <div className="relative h-4 bg-muted/20 rounded-full overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-500 to-emerald-500"
                  style={{ width: `${processProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {processProgress < 30 ? "Analyzing recording..." : processProgress < 60 ? "Identifying click patterns..." : processProgress < 90 ? "Building automation steps..." : "Almost done!"}
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Done Phase */}
      {phase === "done" && (
        <div className="h-full flex items-center justify-center p-8">
          <Confetti />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="max-w-md w-full text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.6, delay: 0.2 }}
            >
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40">
                <CheckCircle className="h-12 w-12 text-emerald-400" />
              </div>
            </motion.div>
            <div>
              <h2 className="text-3xl font-bold mb-2">
                {pipelineStarted
                  ? `🚀 ${platformLabels[automation.platform]} ${automation.action} is being set up!`
                  : `✅ ${platformLabels[automation.platform]} ${automation.action} is now active!`}
              </h2>
              <p className="text-muted-foreground">
                {pipelineStarted
                  ? "George is analyzing your recording and building the automation. We're testing it now — you'll get a notification when it's ready!"
                  : "George learned the steps and is ready to go."}
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleDone}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-emerald-500 hover:from-orange-400 hover:to-emerald-400 text-white font-bold text-lg transition-all shadow-lg"
              >
                🎉 Awesome, let&apos;s go!
              </motion.button>
              <button
                onClick={() => { setPhase("guide"); setCurrentStep(0); setRecordingTime(0) }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Record again (if something went wrong)
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Guide Phase — Main split layout */}
      {phase === "guide" && (
        <div className={`h-full flex flex-col lg:flex-row ${isRecording ? "pt-16" : ""}`}>
          {/* Left: VNC (75%) */}
          <div className="flex-1 lg:w-[75%] p-4 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <PlatformIcon className="h-6 w-6" />
              <h2 className="text-lg font-bold">
                Recording: {platformLabels[automation.platform]} {automation.action}
              </h2>
            </div>

            <div className="flex-1 rounded-2xl overflow-hidden border border-border/50 bg-black/50 relative">
              {!vncError ? (
                <>
                  {!vncLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/10">
                      <div className="text-center space-y-3">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                        >
                          <Monitor className="h-8 w-8 text-muted-foreground mx-auto" />
                        </motion.div>
                        <p className="text-sm text-muted-foreground">Loading browser view...</p>
                      </div>
                    </div>
                  )}
                  <iframe
                    src={VNC_EMBED_URL}
                    className="w-full h-full border-0"
                    onLoad={() => setVncLoaded(true)}
                    onError={() => setVncError(true)}
                    allow="clipboard-read; clipboard-write"
                  />
                </>
              ) : (
                (() => {
                  if (typeof window !== "undefined" && !popoutOpenedRef.current) {
                    popoutOpenedRef.current = true
                    window.open(VNC_URL, "_vnc", "width=1400,height=900")
                  }
                  return (
                    <div className="h-full flex items-center justify-center p-8">
                      <div className="text-center space-y-4 max-w-sm">
                        <Monitor className="h-12 w-12 text-muted-foreground mx-auto" />
                        <h3 className="text-lg font-semibold">Your browser is ready 🎯</h3>
                        <p className="text-sm text-muted-foreground">Click below to pop it out in a new window. Keep that window open while you record — come back here to follow the steps.</p>
                        <motion.a
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          href={VNC_EMBED_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-semibold transition-colors"
                        >
                          <ExternalLink className="h-5 w-5" />
                          Pop Out Browser
                        </motion.a>
                        <p className="text-xs text-muted-foreground">Then come back to this screen to follow the steps →</p>
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
          </div>

          {/* Right: Step Guide (40%) */}
          <div className="lg:w-[25%] p-4 lg:pl-0 flex flex-col overflow-y-auto text-xs">
            <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 flex-1 flex flex-col">
              {/* Header */}
              <div className="mb-4">
                <h3 className="text-sm font-bold mb-0.5">Step-by-Step Guide</h3>
                <p className="text-[11px] text-muted-foreground">Just follow along — it&apos;s easy!</p>
                {guide.exampleTip && (
                  <div className="mt-3 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-2.5">
                    <p className="text-xs text-blue-400">
                      💡 <span className="font-medium">Tip:</span> {guide.exampleTip}
                    </p>
                  </div>
                )}
              </div>

              {/* Steps */}
              <div className="space-y-2 flex-1">
                {guide.steps.map((step, i) => {
                  const isActive = i === currentStep
                  const isDone = i < currentStep
                  const isFirst = i === 0 // Start recording step
                  const isLast = i === guide.steps.length - 1 // Stop recording step

                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={`rounded-lg border p-2 transition-all ${
                        isActive
                          ? "bg-orange-500/10 border-orange-500/30 shadow-sm"
                          : isDone
                          ? "bg-emerald-500/5 border-emerald-500/20 opacity-60"
                          : "bg-muted/5 border-border/30 opacity-40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {/* Number circle */}
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isDone
                            ? "bg-emerald-500/20 text-emerald-400"
                            : isActive
                            ? "bg-orange-500/20 text-orange-400 ring-2 ring-orange-500/30"
                            : "bg-muted/20 text-muted-foreground"
                        }`}>
                          {isDone ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className={`font-semibold text-sm ${isActive ? "text-foreground" : isDone ? "text-emerald-400" : "text-muted-foreground"}`}>
                            {step.title}
                          </h4>
                          <p className={`text-xs mt-0.5 ${isActive ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                            {step.description}
                          </p>
                          {step.tip && isActive && (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="text-[11px] text-blue-400/80 mt-1.5 italic"
                            >
                              💡 {step.tip}
                            </motion.p>
                          )}

                          {/* Action buttons for specific steps */}
                          {isActive && isFirst && !isRecording && (
                            <motion.button
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={startRecording}
                              className="mt-3 flex items-center gap-2 px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors shadow-lg shadow-red-500/30"
                            >
                              <motion.div
                                className="h-3 w-3 rounded-full bg-white"
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                              />
                              Start Recording
                            </motion.button>
                          )}

                          {isActive && isLast && isRecording && (
                            <motion.button
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={stopRecording}
                              className="mt-3 flex items-center gap-2 px-5 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-colors"
                            >
                              <Square className="h-4 w-4 fill-current" />
                              Stop Recording
                            </motion.button>
                          )}

                          {/* "Done with this step" for middle steps */}
                          {isActive && !isFirst && !isLast && isRecording && (
                            <button
                              onClick={() => setCurrentStep(i + 1)}
                              className="mt-2 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-medium transition-colors"
                            >
                              Done with this step <ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              {/* Help section */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <button
                  onClick={() => setShowHelp(!showHelp)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  <HelpCircle className="h-4 w-4" />
                  <span>Need help?</span>
                  <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showHelp ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {showHelp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                        <p>• <span className="font-medium text-foreground/80">Browser not loading?</span> Try the &quot;Open Browser Window&quot; button to open it separately.</p>
                        <p>• <span className="font-medium text-foreground/80">Not logged in?</span> Log into {platformLabels[automation.platform]} first, then start over.</p>
                        <p>• <span className="font-medium text-foreground/80">Something went wrong?</span> No worries — just close this and try again. George doesn&apos;t judge.</p>
                        <p>• <span className="font-medium text-foreground/80">Recording didn&apos;t capture right?</span> You can always re-record from the automation card.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ─── Tab placeholder components ───
 * These are lightweight shells now and get fleshed out in P2.E / P2.F / P2.G.
 * They live here (same file) rather than separate files because every tab
 * reads from the same `/api/automations*` endpoints and shares platform
 * constants. Splitting them out only adds imports without reducing coupling.
 */

/**
 * OverviewTab
 *
 * High-level summary surface: total automations, how many are active vs
 * broken, recent run volume, success rate, and a short list of the latest
 * automation_runs so Dylan can see activity without jumping to Maintenance.
 *
 * All data comes from one /api/automations GET — the route computes counts
 * + success_rate server-side so this tab stays a thin renderer.
 */
function OverviewTab() {
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [successRate, setSuccessRate] = useState<number | null>(null)
  const [runs, setRuns] = useState<DbAutomationRun[]>([])
  const [automations, setAutomations] = useState<DbAutomation[]>([])
  const [sparkline, setSparkline] = useState<DailySparklinePoint[]>([])
  // Slice 5: which run is being viewed in the carousel modal.
  const [selectedRun, setSelectedRun] = useState<DbAutomationRun | null>(null)

  const load = useCallback(async () => {
    try {
      // Unified list: dashboard + extension-recorded automations in one call
      const res = await fetch("/api/automations/list")
      const data = await res.json()
      setCounts(data.counts || null)
      setSuccessRate(typeof data.success_rate === "number" ? data.success_rate : null)
      setRuns(data.runs || [])
      setAutomations(data.data || [])
      setSparkline(Array.isArray(data.sparkline) ? data.sparkline : [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const Card = ({
    label, value, hint, icon: Icon, tone,
  }: { label: string; value: string; hint?: string; icon: React.FC<{ className?: string }>; tone: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`rounded-lg p-1.5 ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </motion.div>
  )

  const total = counts?.total ?? 0
  const active = counts?.active ?? 0
  const broken = counts?.broken ?? 0
  const needsRerec = counts?.needs_rerecording ?? 0
  const recentRuns = counts?.recent_runs ?? 0
  const draft = counts?.draft ?? 0

  const runById = new Map(automations.map(a => [a.id, a.name]))

  return (
    <div className="space-y-4">
      <RetryQueueWidget variant="card" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card
          label="Total automations"
          value={loading ? "—" : String(total)}
          icon={Wand2}
          tone="bg-orange-500/20 text-orange-400"
          hint={draft ? `${draft} draft` : undefined}
        />
        <Card
          label="Active"
          value={loading ? "—" : String(active)}
          icon={CheckCircle}
          tone="bg-emerald-500/20 text-emerald-400"
          hint={total ? `${Math.round((active / total) * 100)}% of catalog` : "No automations yet"}
        />
        <Card
          label="Broken"
          value={loading ? "—" : String(broken)}
          icon={AlertTriangle}
          tone="bg-red-500/20 text-red-400"
          hint={needsRerec ? `+${needsRerec} need re-record` : "All healthy"}
        />
        <Card
          label="Recent runs"
          value={loading ? "—" : String(recentRuns)}
          icon={Activity}
          tone="bg-blue-500/20 text-blue-400"
          hint="Last 50 runs"
        />
        <Card
          label="Success rate"
          value={loading ? "—" : successRate === null ? "—" : `${successRate}%`}
          icon={TrendingUp}
          tone="bg-purple-500/20 text-purple-400"
          hint={successRate === null ? "No finished runs" : "Passed + auto-healed"}
        />
      </div>

      {/* 14-Day Health Trend sparkline (W4B Slice 1) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            14-Day Health Trend
          </h3>
          <span className="text-[10px] text-muted-foreground">Daily pass rate</span>
        </div>
        {loading ? (
          <div className="h-[60px] flex items-center justify-center text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
            Loading…
          </div>
        ) : (
          <SparklineChart data={sparkline} height={60} />
        )}
      </motion.div>

      {/* Recent runs list */}
      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-semibold">Recent Runs</h3>
          <span className="text-[10px] text-muted-foreground">Latest 20</span>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin inline mr-2" /> Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No runs yet. Once the replay engine ships and maintenance runs against the dummy group, they&apos;ll show up here.
          </div>
        ) : (
          <ul className="divide-y divide-border/20">
            {runs.slice(0, 20).map(run => {
              const tone = run.status === "passed" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                : run.status === "healed" ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                : run.status === "failed" ? "bg-red-500/20 text-red-400 border-red-500/30"
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRun(run)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-muted/10 transition-colors text-left"
                    aria-label={`Open replay viewer for run ${run.id}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{runById.get(run.automation_id) || run.automation_id.slice(0, 8)}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {run.run_type || "run"} · {new Date(run.started_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${tone}`}>
                      {run.status}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Replay viewer modal (W4B Slice 5) — opens when a run row is clicked. */}
      <ReplayViewerModal
        open={!!selectedRun}
        run={selectedRun ? {
          ...selectedRun,
          automation_name: runById.get(selectedRun.automation_id) || null,
        } : null}
        onClose={() => setSelectedRun(null)}
      />
    </div>
  )
}

/**
 * LiveViewTab
 *
 * Always-on embedded noVNC window of the GLOBAL DUMMY group (the single
 * proxy_groups row with is_dummy=true). Dylan uses this for (a) recording
 * new automations against the dummy browser and (b) watching the
 * maintenance cron exercise existing automations.
 *
 * Above the iframe is a "Dummy account" dropdown — pick which account in
 * the dummy group we should operate as. Selection persists to
 * automation_dummy_selection so reloads don't lose the choice.
 *
 * The VNC URL matches what the Accounts setup wizard (vnc-login-flow.tsx)
 * hits, so the same Chrome profile is visible from both places.
 */
function LiveViewTab() {
  interface DummyGroup {
    id: string
    name: string | null
    ip: string | null
    port: string | null
    location_city: string | null
    location_country: string | null
  }
  interface DummyAccount {
    account_id: string
    platform: string
    username: string | null
    display_name: string | null
    status: string | null
  }

  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState<DummyGroup | null>(null)
  const [accounts, setAccounts] = useState<DummyAccount[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [warning, setWarning] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  const fetchSelection = useCallback(async () => {
    try {
      const res = await fetch("/api/automations/dummy-selection")
      const data = await res.json()
      if (data.error) { setWarning(data.error); setLoading(false); return }
      if (!data.group) {
        setWarning(data.message || "No dummy group configured. Mark one proxy group as is_dummy=true in the Accounts page.")
        setGroup(null); setAccounts([]); setSelectedId(""); setLoading(false); return
      }
      setWarning(null)
      setGroup(data.group)
      setAccounts(data.accounts || [])
      setSelectedId(data.selection?.account_id || "")
    } catch (e) {
      setWarning((e as Error).message || "Failed to load dummy selection")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSelection() }, [fetchSelection])

  const handleSelect = async (accountId: string) => {
    if (!group) return
    setSelectedId(accountId)
    setSaving(true)
    try {
      await fetch("/api/automations/dummy-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy_group_id: group.id, account_id: accountId || null }),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Dummy group + account selector */}
      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg">
        {loading ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading dummy group...
          </div>
        ) : warning ? (
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-300">No dummy group</p>
              <p className="text-xs text-muted-foreground mt-1">{warning}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Head to <span className="font-mono bg-muted/30 px-1.5 py-0.5 rounded">Accounts &amp; Proxies</span>, pick a group you&apos;ve fully set up, and mark <code>is_dummy</code>=true in Supabase (migration 003 adds the column).
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="rounded-lg p-1.5 bg-purple-500/20">
                <Server className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dummy group</p>
                <p className="text-sm font-semibold">
                  {group?.name || group?.ip || "unnamed"}
                  <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                    {[group?.location_city, group?.location_country].filter(Boolean).join(", ") || ""}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground block mb-1">Operate as</label>
              <select
                value={selectedId}
                onChange={e => handleSelect(e.target.value)}
                disabled={saving}
                className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60"
              >
                <option value="">— No account selected —</option>
                {accounts.map(a => (
                  <option key={a.account_id} value={a.account_id}>
                    {a.platform} · {a.display_name || a.username || a.account_id}
                  </option>
                ))}
              </select>
              {accounts.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  This group has no accounts yet — add some in Accounts &amp; Proxies.
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {saving && <RefreshCw className="h-3 w-3 animate-spin" />}
              {!saving && selectedId && <CheckCircle className="h-3 w-3 text-emerald-400" />}
              <span>{saving ? "Saving…" : selectedId ? "Persisted" : "Pick an account"}</span>
            </div>
          </div>
        )}
      </div>

      {/* noVNC iframe */}
      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-border/30">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold">Dummy Group Browser</span>
            <span className="text-[10px] text-muted-foreground">(noVNC)</span>
          </div>
          <a
            href={VNC_EMBED_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Open in new tab
          </a>
        </div>
        <div className="relative aspect-[16/9] bg-black/50">
          {!iframeError ? (
            <>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" /> Loading noVNC…
                </div>
              )}
              <iframe
                src={VNC_EMBED_URL}
                className="w-full h-full border-0"
                onLoad={() => setIframeLoaded(true)}
                onError={() => setIframeError(true)}
                allow="clipboard-read; clipboard-write"
              />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
              <Monitor className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Can&apos;t embed the browser here</p>
              <a href={VNC_EMBED_URL} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Open in new window
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * MaintenanceTab
 *
 * Quality-control dashboard for every automation. Mirrors the Phase-2 spec:
 * name, platform, status badge, last_tested_at, last_error (truncated +
 * tooltip on hover). Top-right "Run maintenance now" button triggers
 * /api/automations/maintenance/run which today returns 501 — we surface the
 * server's status message as a toast so Dylan knows the cron/replay engine
 * is the next workstream, not a silent bug.
 */
function MaintenanceTab() {
  const [items, setItems] = useState<DbAutomation[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Slice 4: dry-run modal state — keep the per-row "currently inspecting"
  // id separate from the result so we can show a spinner while waiting.
  const [dryRunOpen, setDryRunOpen] = useState(false)
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunResult, setDryRunResult] = useState<DryRunResultPayload | null>(null)

  const load = useCallback(async () => {
    try {
      // Unified list so Maintenance surfaces extension-recorded automations too
      const res = await fetch("/api/automations/list")
      const data = await res.json()
      setItems(data.data || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const runMaintenance = async () => {
    setRunning(true)
    setMessage(null)
    try {
      const res = await fetch("/api/automations/maintenance/run", { method: "POST" })
      const data = await res.json()
      setMessage(data.message || (res.ok ? "Done" : `Error ${res.status}`))
    } catch (e) {
      setMessage((e as Error).message || "Network error")
    } finally {
      setRunning(false)
    }
  }

  // Slice 4: Dry-run handler. Calls the new collection-level replay route
  // with `dryRun: true`. The route never persists automation_runs rows
  // and never flips automation status, so this is safe to fire from any
  // role and on any schedule. NEVER calls campaign-worker.
  const startDryRun = async (automation: DbAutomation) => {
    setDryRunOpen(true)
    setDryRunLoading(true)
    setDryRunResult({ ok: false, automation_name: automation.name, steps: [] })
    try {
      const res = await fetch("/api/automations/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automation_id: automation.id, dryRun: true }),
      })
      const data = await res.json().catch(() => ({}))
      setDryRunResult({
        ok: !!data.ok,
        automation_name: data.automation_name || automation.name,
        overall: data.overall ?? null,
        steps: Array.isArray(data.steps) ? data.steps : [],
        note: data.note ?? null,
        error: data.error ?? null,
      })
    } catch (e) {
      setDryRunResult({
        ok: false,
        automation_name: automation.name,
        steps: [],
        error: (e as Error).message || "Network error",
      })
    } finally {
      setDryRunLoading(false)
    }
  }

  const statusStyles: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    draft: "bg-muted/30 text-muted-foreground border-border/50",
    needs_recording: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    needs_rerecording: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    fixing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    broken: "bg-red-500/20 text-red-400 border-red-500/30",
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Maintenance</h2>
            <p className="text-xs text-muted-foreground">
              Daily 6am ET cron will test every automation against the dummy group and self-heal selectors that break. Not yet running — button below is a manual trigger once the cron + replay engine ships.
            </p>
          </div>
          <button
            onClick={runMaintenance}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white transition-colors"
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Run maintenance now
          </button>
        </div>
        {message && (
          <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Platform</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Last tested</th>
                <th className="px-4 py-3 font-semibold">Last error</th>
                <th className="px-4 py-3 font-semibold text-right">Health</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No automations yet. Add one from the <span className="font-semibold">Your Automations</span> tab.
                  </td>
                </tr>
              )}
              {items.map((a) => {
                const shortPlatform = PLATFORM_FROM_DB[a.platform] || a.platform
                const PlatformIcon = platformIcons[shortPlatform]
                // Extension-recorded rows live in autobot_automations and
                // don't have a steps[] payload the replay route understands,
                // so dry-run is dashboard-only for now.
                const canDryRun = a.source !== "extension"
                return (
                  <tr key={a.id} className="border-t border-border/20 hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-1.5 text-xs">
                        {PlatformIcon && <PlatformIcon className="h-4 w-4" />}
                        {platformLabels[shortPlatform] || a.platform}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${statusStyles[a.status] || statusStyles.draft}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {a.last_tested_at ? new Date(a.last_tested_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs">
                      {a.last_error ? (
                        <span className="text-red-400 line-clamp-2" title={a.last_error}>{a.last_error}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-block w-10 text-xs font-semibold tabular-nums ${
                        a.health_score >= 90 ? "text-emerald-400" : a.health_score >= 60 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {a.health_score}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="inline-flex items-center justify-center rounded-lg p-1.5 hover:bg-muted/30 transition-colors"
                            aria-label={`Actions for ${a.name}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[180px]">
                          <DropdownMenuItem
                            disabled={!canDryRun}
                            onClick={() => canDryRun && startDryRun(a)}
                            className="text-xs"
                          >
                            <Eye className="h-3.5 w-3.5 mr-2 text-amber-400" />
                            Dry run (no clicks)
                          </DropdownMenuItem>
                          {!canDryRun && (
                            <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
                              Dry run not available for extension-recorded automations
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dry-run result modal (W4B Slice 4). Pure inspection — no DMs fired. */}
      <DryRunResultModal
        open={dryRunOpen}
        loading={dryRunLoading}
        result={dryRunResult}
        onClose={() => {
          setDryRunOpen(false)
          // Keep result around briefly so the modal close animation doesn't
          // jank to an empty state, but null it once truly closed.
          setTimeout(() => setDryRunResult(null), 250)
        }}
      />
    </div>
  )
}

/* ─── Main Page ─── */
export default function AutomationsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [showVideoModal, setShowVideoModal] = useState<Recording | null>(null)
  const [showTestDM, setShowTestDM] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [allPaused, setAllPaused] = useState(false)
  const [videoSpeed, setVideoSpeed] = useState(1)
  const [collapsedPlatforms, setCollapsedPlatforms] = useState<Record<string, boolean>>({})
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [dayStats, setDayStats] = useState<DayStats>({ dmsSent: 0, follows: 0, errors: 0 })
  const videoRef = useRef<HTMLVideoElement>(null)

  // Recording modal state
  const [recordingModalOpen, setRecordingModalOpen] = useState(false)
  const [recordingModalAuto, setRecordingModalAuto] = useState<AutomationDef | null>(null)

  // Platform login modal state. Replaces the old behavior where clicking
  // "Log in to Instagram" popped a raw noVNC window with no instructions — now
  // it opens a guided side-panel dialog (mirrors the recording modal UX) that
  // drives the shared VPS Chrome to the right login URL and verifies the
  // result via /api/platforms/login-status on confirm. `remaining` carries the
  // other platforms that still need login so the modal can chain them without
  // closing.
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginModalPlatform, setLoginModalPlatform] = useState<string>("instagram")
  const [loginModalRemaining, setLoginModalRemaining] = useState<string[]>([])

  // Connected platforms for the current business — used to suppress ghost
  // "Log in to X" buttons for platforms the business doesn't actually have
  // accounts for (Dylan's "don't show TikTok when I have no TikTok" ask).
  // Empty list = unknown (show everything the VPS probe returns, as fallback).
  const businessId = useBusinessId()
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([])

  // New-style "Add Automation" modal (Phase 2 — writes to /api/automations).
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addModalPlatformKey, setAddModalPlatformKey] = useState<string | null>(null)
  const [addModalInitial, setAddModalInitial] = useState<DbAutomation | null>(null)

  // Catalog of automations Dylan has created via the Add flow. Merged into
  // the platform cards grid alongside the built-in ALL_AUTOMATIONS list.
  const [dbAutomations, setDbAutomations] = useState<DbAutomation[]>([])
  const [dbRuns, setDbRuns] = useState<DbAutomationRun[]>([])
  const [dbCounts, setDbCounts] = useState<Record<string, number> | null>(null)
  const [dbSuccessRate, setDbSuccessRate] = useState<number | null>(null)

  // Rename state — one card at a time, keyed by id.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")

  // Delete confirm state.
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // P9.3 — replay dialog target.
  const [replayAutomation, setReplayAutomation] = useState<{ id: string; name: string } | null>(null)

  // P9.5 — import file picker + progress toast.
  const importFileRef = useRef<HTMLInputElement | null>(null)

  const handleImportAutomations = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const res = await fetch("/api/automations/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast(`❌ Import failed: ${data.error || "unknown error"}`)
      } else {
        setToast(`✅ Imported ${data.imported} automations${data.skipped ? ` (${data.skipped} skipped)` : ""}`)
        await fetchDbAutomations()
      }
    } catch (err) {
      setToast(`❌ Import parse failed: ${(err as Error).message}`)
    } finally {
      if (importFileRef.current) importFileRef.current.value = ""
    }
  }

  // Local overrides (for newly recorded automations in this session)
  const [activeOverrides, setActiveOverrides] = useState<Set<string>>(new Set())
  const [settingUpOverrides, setSettingUpOverrides] = useState<Set<string>>(new Set())

  // Test DM state
  const [testPlatform, setTestPlatform] = useState("ig")
  const [testUsername, setTestUsername] = useState("")
  const [testMessage, setTestMessage] = useState("Hey! This is a test DM from the automation system 🚀")
  const [testSending, setTestSending] = useState(false)

  const fetchDbAutomations = useCallback(async () => {
    try {
      // Unified list: dashboard-native + AutoBot extension recordings. The
      // unified endpoint is a superset of /api/automations (same shape +
      // `source` field on each row), so no other downstream code needs to
      // change for the merged list to render.
      const res = await fetch("/api/automations/list")
      const data = await res.json()
      setDbAutomations(data.data || [])
      setDbRuns(data.runs || [])
      setDbCounts(data.counts || null)
      setDbSuccessRate(typeof data.success_rate === "number" ? data.success_rate : null)
    } catch {}
  }, [])

  const fetchRecordings = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings")
      const data = await res.json()
      setRecordings(data.data || [])
    } catch {} finally { setLoading(false) }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings/health")
      const data = await res.json()
      setHealth(data)
    } catch { setHealth(null) }
  }, [])

  // Pull the distinct list of platforms this business has accounts for so the
  // health bar can hide "Log in to TikTok" when there's no TikTok account.
  // Runs once on mount + whenever the selected business changes.
  const fetchConnectedPlatforms = useCallback(async () => {
    if (!businessId) { setConnectedPlatforms([]); return }
    try {
      const res = await fetch(`/api/accounts?business_id=${encodeURIComponent(businessId)}`)
      const data = await res.json()
      const rows: Array<{ platform?: string }> = Array.isArray(data?.data) ? data.data : []
      const distinct = Array.from(new Set(
        rows.map(r => (r.platform || "").toLowerCase()).filter(Boolean)
      ))
      setConnectedPlatforms(distinct)
    } catch {
      setConnectedPlatforms([])
    }
  }, [businessId])

  const fetchDayStats = useCallback(async () => {
    try {
      const res = await fetch("/api/recordings/stats")
      const data = await res.json()
      setDayStats(data)
    } catch {}
  }, [])

  useEffect(() => {
    fetchRecordings()
    fetchHealth()
    fetchDayStats()
    fetchDbAutomations()
    fetchConnectedPlatforms()
    const h = setInterval(fetchHealth, 15000)
    const s = setInterval(fetchDayStats, 30000)
    const a = setInterval(fetchDbAutomations, 30000)
    const p = setInterval(fetchConnectedPlatforms, 30000)
    return () => { clearInterval(h); clearInterval(s); clearInterval(a); clearInterval(p) }
  }, [fetchRecordings, fetchHealth, fetchDayStats, fetchDbAutomations, fetchConnectedPlatforms])

  // ═══ Add / Edit / Delete / Rename handlers for DB automations ═══
  const openAddModal = (platformKey: string) => {
    setAddModalInitial(null)
    setAddModalPlatformKey(platformKey)
    setAddModalOpen(true)
  }

  const openEditModal = (automation: DbAutomation) => {
    setAddModalInitial(automation)
    setAddModalPlatformKey(PLATFORM_FROM_DB[automation.platform] || null)
    setAddModalOpen(true)
  }

  const handleAutomationSaved = (automation: DbAutomation, action: "created" | "updated") => {
    setDbAutomations(prev => {
      const idx = prev.findIndex(a => a.id === automation.id)
      if (idx >= 0) {
        const copy = [...prev]
        copy[idx] = automation
        return copy
      }
      return [automation, ...prev]
    })
    setToast(action === "created"
      ? `✨ ${automation.name} added to ${platformLabels[PLATFORM_FROM_DB[automation.platform] || ""] || automation.platform}`
      : `✅ ${automation.name} updated`)
  }

  const startRename = (automation: DbAutomation) => {
    setRenamingId(automation.id)
    setRenameDraft(automation.name)
  }

  const commitRename = async (id: string) => {
    const trimmed = renameDraft.trim()
    if (!trimmed) { setRenamingId(null); return }
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (res.ok && data.data) {
        setDbAutomations(prev => prev.map(a => a.id === id ? data.data : a))
        setToast("✏️ Renamed")
      } else {
        setToast(data.error || "Rename failed")
      }
    } catch (e) {
      setToast("Network error renaming")
    } finally {
      setRenamingId(null)
    }
  }

  const requestDelete = (id: string) => setDeletingId(id)

  const confirmDelete = async () => {
    if (!deletingId) return
    const id = deletingId
    setDeletingId(null)
    try {
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" })
      if (res.ok) {
        setDbAutomations(prev => prev.filter(a => a.id !== id))
        setToast("🗑️ Deleted")
      } else {
        const data = await res.json().catch(() => ({}))
        setToast(data.error || "Delete failed")
      }
    } catch {
      setToast("Network error deleting")
    }
  }

  const openRecordingModal = (auto: AutomationDef) => {
    setRecordingModalAuto(auto)
    setRecordingModalOpen(true)
  }

  const handleRecordingComplete = (platform: string, actionKey: string) => {
    const key = `${platform}_${actionKey}`
    // Mark as "setting up" — the backend pipeline will test it async
    setSettingUpOverrides(prev => new Set(prev).add(key))
    setShowConfetti(true)
    setToast(`🚀 ${platformLabels[platform]} ${actionKey} is being set up — you'll get a notification when ready!`)
    setTimeout(() => setShowConfetti(false), 3000)
    fetchRecordings()

    // Poll for script status every 10s for up to 5 minutes
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/recordings")
        const data = await res.json()
        // Check if there's an active automation_script for this platform/action
        const scriptRes = await fetch(`/api/recordings/script-status?platform=${platform}&action_type=${actionKey}`)
        const scriptData = await scriptRes.json()
        if (scriptData.status === "active") {
          setSettingUpOverrides(prev => { const n = new Set(prev); n.delete(key); return n })
          setActiveOverrides(prev => new Set(prev).add(key))
          setToast(`✅ ${platformLabels[platform]} ${actionKey} is now active!`)
          clearInterval(pollInterval)
        } else if (scriptData.status === "failed") {
          setSettingUpOverrides(prev => { const n = new Set(prev); n.delete(key); return n })
          setToast(`⚠️ ${platformLabels[platform]} ${actionKey} needs attention — check notifications`)
          clearInterval(pollInterval)
        }
      } catch {}
    }, 10000)

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000)
  }

  /**
   * Look up the DB-backed automation that corresponds to a catalog tile. We
   * match on `id === slug` first (because the rescue migration and the
   * recorder pipeline both write `automations.id = "{platform}_{action}"`),
   * then fall back to matching platform + name for legacy rows.
   */
  const findDbAutoForCatalog = (auto: AutomationDef): DbAutomation | undefined => {
    const slug = auto.slug
    const dbPlatform = PLATFORM_DB_KEY[auto.platform] || auto.platform
    // 1. Direct slug-id match (preferred — set by rescue + build-automation paths)
    const byId = dbAutomations.find(a => a.id === slug)
    if (byId) return byId
    // 2. Platform + action keyword fallback for legacy rows that got inserted
    //    with a uuid id before this page started writing slugs.
    const actionKey = auto.actionKey.replace(/_/g, " ")
    return dbAutomations.find(a =>
      a.platform === dbPlatform &&
      typeof a.name === "string" &&
      a.name.toLowerCase().includes(actionKey.toLowerCase())
    )
  }

  /**
   * The ONE source of truth for whether a catalog tile shows "Active". It's
   * active iff the DB has a matching row whose `steps` JSON has ≥1 step AND
   * whose `status` is "active". We still honor the optimistic
   * `activeOverrides` set so newly-finished recordings show up before the
   * next /api/automations poll lands.
   */
  const isAutoActive = (auto: AutomationDef) => {
    if (activeOverrides.has(`${auto.platform}_${auto.actionKey}`)) return true
    const dbRow = findDbAutoForCatalog(auto)
    if (!dbRow) return false
    const stepCount = Array.isArray(dbRow.steps) ? dbRow.steps.length : 0
    return dbRow.status === "active" && stepCount >= 1
  }

  const isAutoSettingUp = (auto: AutomationDef) => {
    return settingUpOverrides.has(`${auto.platform}_${auto.actionKey}`)
  }

  // True when the DB row exists with steps but was flagged by maintenance /
  // test as broken — UI uses this to show the orange pulse + highlighted
  // Re-record CTA on the catalog tile (distinct from "Needs Recording" which
  // means the automation was never recorded).
  const isAutoNeedsRerec = (auto: AutomationDef) => {
    const dbRow = findDbAutoForCatalog(auto)
    if (!dbRow) return false
    const stepCount = Array.isArray(dbRow.steps) ? dbRow.steps.length : 0
    return stepCount >= 1 && (dbRow.status === "needs_rerecording" || dbRow.status === "broken")
  }

  /** Last-tested date string for a tile (falls back to null, never a fake "Mar 30"). */
  const autoLastTested = (auto: AutomationDef): string | null => {
    const dbRow = findDbAutoForCatalog(auto)
    if (!dbRow?.last_tested_at) return null
    try { return new Date(dbRow.last_tested_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }
    catch { return null }
  }

  /**
   * Test button handler — fires a real /api/automations/:id/replay request.
   *
   * This replaces the old `setToast("Testing ...")` stub. The endpoint
   * expects a `target_url` so we pass a platform-specific sentinel profile
   * ("starbucks" on IG, "microsoft" on LinkedIn, etc.) which is enough for a
   * stub replay to exercise each step. On success we optimistically set
   * `last_tested_at` locally so the "Tested {date}" label updates without a
   * full refetch, and the next poll will confirm.
   */
  const TEST_TARGETS: Record<string, string> = {
    instagram: "https://www.instagram.com/starbucks/",
    facebook: "https://www.facebook.com/Starbucks",
    linkedin: "https://www.linkedin.com/company/microsoft/",
    tiktok: "https://www.tiktok.com/@starbucks",
    youtube: "https://www.youtube.com/@MrBeast",
    twitter: "https://twitter.com/elonmusk",
    snapchat: "https://www.snapchat.com/add/team.snapchat",
    pinterest: "https://www.pinterest.com/starbucks/",
  }

  const runTestReplay = async (dbRow: DbAutomation, auto: AutomationDef) => {
    const label = `${platformLabels[auto.platform] || auto.platform} ${auto.action}`
    // Guard: don't run a test against a platform that's signed out — the result
    // would be a guaranteed failure and just add noise to the maintenance log.
    const platformKey = PLATFORM_DB_KEY[auto.platform] || auto.platform
    const signedOut = (health?.loginResults || []).find(r => r.platform === platformKey && r.loggedIn === false)
    if (signedOut) {
      setToast(`⚠️ Can't test — ${auto.platform} needs login first. Use the red Log in button at the top.`)
      return
    }
    // Pop open the VNC viewer FIRST so Dylan can watch the test run in the browser.
    try {
      window.open(
        VNC_EMBED_URL,
        "outreach-vnc",
        "width=1280,height=800,noopener,noreferrer"
      )
    } catch {}
    setToast(`🧪 Testing ${label} — watch the VNC window...`)
    try {
      const targetUrl = TEST_TARGETS[dbRow.platform] || TEST_TARGETS.instagram
      const res = await fetch(`/api/automations/${encodeURIComponent(dbRow.id)}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_url: targetUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setToast(`❌ Test failed: ${data.error || `HTTP ${res.status}`}`)
        return
      }
      const overall = data?.data?.overall
      if (overall === "passed") {
        setToast(`✅ Test passed — ${label}`)
        // Optimistic local bump so "Tested {date}" label refreshes immediately
        setDbAutomations(prev => prev.map(a => a.id === dbRow.id ? { ...a, last_tested_at: new Date().toISOString() } : a))
      } else {
        const firstFailed = Array.isArray(data?.data?.steps)
          ? data.data.steps.find((s: { status: string; detail?: string }) => s.status === "failed")
          : null
        const detail = firstFailed?.detail || data?.data?.note || "Unknown error"
        setToast(`❌ Test failed: ${detail}`)
      }
      // Refetch so `last_tested_at` + run history land authoritatively.
      fetchDbAutomations()
    } catch (e) {
      setToast(`❌ Test failed: ${(e as Error).message || "Network error"}`)
    }
  }

  const togglePauseAll = async () => {
    const action = allPaused ? "resume" : "pause"
    try {
      for (const p of ["ig", "fb", "li"]) {
        await fetch("/api/automation/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: p, action }),
        })
      }
      setAllPaused(!allPaused)
      setToast(allPaused ? "▶️ All automations resumed" : "⏸️ All automations paused")
    } catch {}
  }

  const sendTestDM = async () => {
    setTestSending(true)
    try {
      await fetch("/api/power-dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: testPlatform, username: testUsername, message: testMessage, test: true }),
      })
      setToast("✅ Test DM queued!")
      setShowTestDM(false)
      setTestUsername("")
    } catch { setToast("❌ Failed to send test DM") }
    finally { setTestSending(false) }
  }

  const deleteRecording = async (id: string) => {
    if (!confirm("Delete this recording?")) return
    await fetch(`/api/recordings/${id}`, { method: "DELETE" })
    setRecordings(r => r.filter(x => x.id !== id))
  }

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  const healthCount = health ? [health.chrome, health.xvfb, health.proxy, health.queueProcessor].filter(Boolean).length : 0
  const healthTotal = 4
  // Only surface "logged out" for platforms this business actually has
  // accounts for. The VPS probe always tests IG/FB/LI/TikTok — this avoids
  // telling Dylan to log into TikTok when he has zero TikTok accounts.
  // If we haven't loaded the connected list yet (empty), fall through to the
  // raw probe result to avoid a flash of "all green" on first paint.
  const loggedOutPlatforms = (health?.loginResults || []).filter(r => {
    if (r.loggedIn !== false) return false
    if (connectedPlatforms.length === 0) return true
    return connectedPlatforms.includes((r.platform || "").toLowerCase())
  })
  const hasLoggedOut = loggedOutPlatforms.length > 0
  const healthColor = !health
    ? "text-muted-foreground"
    : hasLoggedOut
    ? "text-red-400"
    : healthCount === healthTotal ? "text-emerald-400" : healthCount >= 2 ? "text-amber-400" : "text-red-400"
  const healthLabel = !health
    ? "Checking..."
    : hasLoggedOut
    ? loggedOutPlatforms.length === 1
      ? `${loggedOutPlatforms[0].platform.charAt(0).toUpperCase()}${loggedOutPlatforms[0].platform.slice(1)} needs login`
      : `${loggedOutPlatforms.length} accounts need login`
    : healthCount === healthTotal ? "All Systems Operational" : healthCount >= 2 ? `${healthTotal - healthCount} Issue${healthTotal - healthCount > 1 ? "s" : ""}` : "Systems Down"

  const activeCount = ALL_AUTOMATIONS.filter(a => isAutoActive(a)).length
  const totalCount = ALL_AUTOMATIONS.length
  const progressPct = Math.round((activeCount / totalCount) * 100)

  // Group DB-backed automations by short platform key so we can render them
  // alongside the built-in ALL_AUTOMATIONS inside each platform panel. Rows
  // whose `id` matches a catalog slug are skipped here — they already back a
  // built-in tile and shouldn't be rendered twice.
  const catalogSlugs = new Set(ALL_AUTOMATIONS.map(a => a.slug))
  const dbByPlatformKey: Record<string, DbAutomation[]> = {}
  for (const a of dbAutomations) {
    if (catalogSlugs.has(a.id)) continue
    const key = PLATFORM_FROM_DB[a.platform] || a.platform
    if (!dbByPlatformKey[key]) dbByPlatformKey[key] = []
    dbByPlatformKey[key].push(a)
  }

  const platformGroups = PLATFORMS_ORDER.map(p => {
    const autos = ALL_AUTOMATIONS.filter(a => a.platform === p)
    const activeInGroup = autos.filter(a => isAutoActive(a)).length
    const custom = dbByPlatformKey[p] || []
    const customActive = custom.filter(a => a.status === "active").length
    return {
      platform: p,
      automations: autos,
      active: activeInGroup + customActive,
      total: autos.length + custom.length,
      custom,
    }
  })

  const togglePlatformCollapse = (p: string) => {
    setCollapsedPlatforms(prev => ({ ...prev, [p]: !prev[p] }))
  }

  const findRecording = (auto: AutomationDef): Recording | undefined => {
    return recordings.find(r => r.platform === auto.platform && r.action_type === auto.actionKey)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-20"
    >
      {showConfetti && <Confetti />}
      <AnimatePresence>
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </AnimatePresence>

      {/* Recording Modal */}
      <AnimatePresence>
        {recordingModalOpen && (
          <RecordingModal
            automation={recordingModalAuto}
            isOpen={recordingModalOpen}
            onClose={() => setRecordingModalOpen(false)}
            onComplete={handleRecordingComplete}
          />
        )}
      </AnimatePresence>

      {/* New Add / Edit Automation Modal (writes to /api/automations) */}
      <AnimatePresence>
        {addModalOpen && (
          <AddAutomationModal
            open={addModalOpen}
            onClose={() => setAddModalOpen(false)}
            platformKey={addModalPlatformKey}
            initial={addModalInitial}
            onSaved={handleAutomationSaved}
          />
        )}
      </AnimatePresence>

      {/* Delete-confirm dialog for DB automations */}
      <AnimatePresence>
        {deletingId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setDeletingId(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="rounded-full p-2 bg-red-500/20 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-semibold">Delete this automation?</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    The steps, tag, and any recorded selectors will be wiped. Can&apos;t undo.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeletingId(null)}
                  className="rounded-xl border border-border/50 px-4 py-2 text-sm font-medium hover:bg-muted/20 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="rounded-xl bg-red-500 hover:bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="flex items-center gap-3"
      >
        <div className="rounded-xl p-2.5 bg-orange-500/20">
          <Wand2 className="h-6 w-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Mission control for all your automation workflows</p>
        </div>
      </motion.div>

      {/* Health Bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className={`rounded-2xl backdrop-blur-xl border p-4 shadow-lg ${hasLoggedOut ? "bg-red-500/10 border-red-500/40" : "bg-card/60 border-border/50"}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <motion.div
              className={`h-3 w-3 rounded-full ${!health ? "bg-muted-foreground" : hasLoggedOut ? "bg-red-400" : healthCount === healthTotal ? "bg-emerald-400" : healthCount >= 2 ? "bg-amber-400" : "bg-red-400"}`}
              animate={(hasLoggedOut || healthCount !== healthTotal) ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className={`text-sm font-semibold ${healthColor}`}>{healthLabel}</span>
          </div>
          {health && !hasLoggedOut && (
            <div className="flex flex-wrap gap-3 text-xs">
              {[
                { label: "Chrome", ok: health.chrome },
                { label: "Xvfb", ok: health.xvfb },
                { label: "Proxy", ok: health.proxy },
                { label: "Queue", ok: health.queueProcessor },
              ].map(s => (
                <span key={s.label} className={`flex items-center gap-1 ${s.ok ? "text-emerald-400/80" : "text-red-400/80"}`}>
                  {s.ok ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {s.label}
                </span>
              ))}
            </div>
          )}
          {hasLoggedOut && (
            <div className="flex flex-wrap gap-2 items-center">
              {loggedOutPlatforms.map(p => (
                <button
                  key={p.platform}
                  onClick={() => {
                    // Open the guided login modal — shared VPS Chrome +
                    // side-panel instructions + "I'm Logged In" verification.
                    // Queue the rest of the logged-out platforms as `remaining`
                    // so the user can chain logins without closing the dialog.
                    const others = loggedOutPlatforms
                      .map(x => x.platform)
                      .filter(name => name !== p.platform)
                    setLoginModalPlatform(p.platform)
                    setLoginModalRemaining(others)
                    setLoginModalOpen(true)
                  }}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors shadow-md shadow-red-500/40"
                  title={`Open a guided ${p.platform} login with step-by-step instructions.`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  Log in to {p.platform.charAt(0).toUpperCase() + p.platform.slice(1)}
                </button>
              ))}
              <button
                onClick={() => {
                  setToast("🔄 Rechecking logins...")
                  fetch("/api/platforms/login-status?refresh=1").finally(() => fetchHealth())
                }}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
                title="Re-probe logins after you've signed in"
              >
                <RefreshCw className="h-3 w-3" /> Recheck
              </button>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={togglePauseAll}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                allPaused ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
            >
              {allPaused ? <><Play className="h-3 w-3" /> Resume All</> : <><Pause className="h-3 w-3" /> Pause All</>}
            </button>
          </div>
        </div>
        {hasLoggedOut && (
          <p className="text-[11px] text-red-300/80 mt-2">
            Automations can&apos;t run until you log in. Click a button above — the browser will open at the login page. Sign in, hit Recheck.
          </p>
        )}
      </motion.div>

      {/* Summary Progress Bar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg p-1.5 bg-orange-500/20">
              <Zap className="h-4 w-4 text-orange-400" />
            </div>
            <span className="text-sm font-semibold">Automation Coverage</span>
          </div>
          <span className="text-sm font-bold text-orange-400">{activeCount} of {totalCount} active</span>
        </div>
        <div className="relative h-3 bg-muted/20 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-500 to-emerald-500"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          {totalCount - activeCount === 0
            ? "🎉 All automations are active!"
            : `${totalCount - activeCount} automation${totalCount - activeCount !== 1 ? "s" : ""} need${totalCount - activeCount === 1 ? "s" : ""} recording — click "Needs Recording" to set them up`}
        </p>
      </motion.div>

      {/* Quick Actions + Stats */}
      <motion.div variants={container} initial="hidden" animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <motion.button variants={item} whileHover={{ scale: 1.02, y: -2 }}
          onClick={() => setShowTestDM(true)}
          className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg shadow-orange-500/10 hover:shadow-xl transition-shadow text-left group"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-lg p-1.5 bg-orange-500/20">
              <Rocket className="h-5 w-5 text-orange-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="font-medium text-sm">Send Test DM</span>
          </div>
          <p className="text-xs text-muted-foreground">Pick a platform & username, fire a test</p>
        </motion.button>
        <motion.div variants={item}
          className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg shadow-blue-500/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg p-1.5 bg-blue-500/20">
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
            <span className="font-medium text-sm">Today&apos;s Stats</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-blue-400 tabular-nums">{dayStats.dmsSent}</p>
              <p className="text-[10px] text-muted-foreground">DMs Sent</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-400 tabular-nums">{dayStats.follows}</p>
              <p className="text-[10px] text-muted-foreground">Follows</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-400 tabular-nums">{dayStats.errors}</p>
              <p className="text-[10px] text-muted-foreground">Errors</p>
            </div>
          </div>
        </motion.div>
        <motion.a variants={item} whileHover={{ scale: 1.02, y: -2 }}
          href={VNC_EMBED_URL} target="_blank" rel="noopener noreferrer"
          className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4 shadow-lg shadow-purple-500/10 hover:shadow-xl transition-shadow text-left group"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="rounded-lg p-1.5 bg-purple-500/20">
              <Monitor className="h-5 w-5 text-purple-400 group-hover:scale-110 transition-transform" />
            </div>
            <span className="font-medium text-sm">Open Full VNC</span>
          </div>
          <p className="text-xs text-muted-foreground">Full-screen VNC in new tab</p>
        </motion.a>
      </motion.div>

      <NudgeBanners page="automations" />

      {/* ═══ 4 Sub-Tabs ═══ Matches the accounts/proxies page pattern. */}
      <Tabs defaultValue="your-automations">
        <div className="flex gap-1 p-1 rounded-xl bg-muted/30 backdrop-blur-sm w-fit">
          <TabsList className="bg-transparent p-0 h-auto">
            <TabsTrigger
              value="overview"
              className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"
            >
              <LayoutGrid className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger
              value="your-automations"
              className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"
            >
              <Wand2 className="h-4 w-4" /> Your Automations
            </TabsTrigger>
            <TabsTrigger
              value="live-view"
              className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"
            >
              <Eye className="h-4 w-4" /> Live View
            </TabsTrigger>
            <TabsTrigger
              value="maintenance"
              className="gap-1.5 rounded-lg px-4 py-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all"
            >
              <Wrench className="h-4 w-4" /> Maintenance
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ─── Overview tab ─── (populated in P2.G) */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          <OverviewTab />
        </TabsContent>

        {/* ─── Your Automations tab ─── (the legacy platform-cards grid lives here) */}
        <TabsContent value="your-automations" className="space-y-6 mt-6">

      {/* Your Automations */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">Your Automations</h2>
          <span className="text-xs text-muted-foreground bg-muted/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
            {activeCount}/{totalCount} active
          </span>
          {/* P9.5 — export + import */}
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/api/automations/export"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/30 px-3 py-1.5 text-xs font-semibold transition-colors"
              title="Export all automations as JSON"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </a>
            <button
              onClick={() => importFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/30 px-3 py-1.5 text-xs font-semibold transition-colors"
              title="Import automations from a JSON file"
            >
              <PlayCircle className="h-3.5 w-3.5 rotate-180" /> Import
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportAutomations}
            />
            <a
              href="/automations/selectors"
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Layers className="h-3.5 w-3.5" /> Workflow Builder
            </a>
          </div>
        </div>

        <div className="space-y-4">
          {platformGroups.map((group, gi) => {
            const Icon = platformIcons[group.platform]
            const isCollapsed = collapsedPlatforms[group.platform]
            const builtinActive = group.automations.filter(a => isAutoActive(a)).length
            const customActive = group.custom.filter(a => a.status === "active").length
            const activeInGroup = builtinActive + customActive
            const allActive = activeInGroup === group.total && group.total > 0

            return (
              <motion.div
                key={group.platform}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + gi * 0.05 }}
                className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 overflow-hidden shadow-lg"
              >
                <div className="flex items-center justify-between p-4 hover:bg-muted/10 transition-colors">
                  <button
                    type="button"
                    onClick={() => togglePlatformCollapse(group.platform)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-semibold text-sm">{platformLabels[group.platform]}</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      allActive ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {activeInGroup}/{group.total} active
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openAddModal(group.platform)}
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add {platformLabels[group.platform]} Automation
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePlatformCollapse(group.platform)}
                      className="p-1.5 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <motion.div variants={container} initial="hidden" animate="show"
                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 pt-0"
                      >
                        {group.automations.map((auto) => {
                          const recording = findRecording(auto)
                          const active = isAutoActive(auto)
                          const settingUp = isAutoSettingUp(auto)
                          const needsRerec = isAutoNeedsRerec(auto)
                          return (
                            <motion.div
                              key={`${auto.platform}-${auto.actionKey}`}
                              variants={item}
                              whileHover={{ scale: 1.02, y: -2 }}
                              onClick={needsRerec ? () => openRecordingModal(auto) : (!active && !settingUp ? () => openRecordingModal(auto) : undefined)}
                              animate={needsRerec ? {
                                boxShadow: [
                                  "0 0 0 0 rgba(251, 146, 60, 0.0)",
                                  "0 0 0 4px rgba(251, 146, 60, 0.5)",
                                  "0 0 0 0 rgba(251, 146, 60, 0.0)",
                                ],
                              } : {}}
                              transition={needsRerec ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
                              className={`rounded-xl border p-4 transition-all ${
                                settingUp
                                  ? "bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30"
                                  : needsRerec
                                  ? "bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/60 cursor-pointer"
                                  : active
                                  ? "bg-gradient-to-br " + platformColors[auto.platform] + " hover:bg-muted/20"
                                  : "bg-muted/10 border-dashed border-amber-500/30 hover:border-amber-500/50 hover:bg-amber-500/5 cursor-pointer"
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-semibold text-sm">{auto.action}</h3>
                                    {auto.tag === "lead_enrichment" && (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                        title="Lead enrichment — scrapes a field into the Leads table"
                                      >
                                        <BarChart3 className="h-2.5 w-2.5" />
                                        Enrichment
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{auto.desc}</p>
                                </div>
                                {settingUp ? (
                                  <motion.span
                                    animate={{ opacity: [1, 0.6, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0"
                                  >
                                    <motion.div
                                      className="h-2 w-2 rounded-full bg-blue-400"
                                      animate={{ scale: [1, 1.3, 1] }}
                                      transition={{ duration: 1, repeat: Infinity }}
                                    />
                                    Setting up...
                                  </motion.span>
                                ) : needsRerec ? (
                                  <motion.span
                                    animate={{ opacity: [1, 0.55, 1] }}
                                    transition={{ duration: 1.4, repeat: Infinity }}
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-500/25 text-orange-300 border border-orange-500/60 shrink-0"
                                  >
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    Needs Re-record
                                  </motion.span>
                                ) : active ? (
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                                    <CheckCircle className="h-2.5 w-2.5" />
                                    Active
                                  </span>
                                ) : (
                                  <motion.span
                                    animate={{ opacity: [1, 0.6, 1] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0"
                                  >
                                    <Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                                    Needs Recording
                                  </motion.span>
                                )}
                              </div>

                              {auto.note && (
                                <p className="text-[10px] text-amber-400/70 mb-2 italic">{auto.note}</p>
                              )}

                              {active && (() => {
                                const dbRow = findDbAutoForCatalog(auto)
                                const lastTested = autoLastTested(auto)
                                const hasScript = !!dbRow && Array.isArray(dbRow.steps) && dbRow.steps.length >= 1
                                return (
                                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20">
                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      <span>{lastTested ? `Tested ${lastTested}` : "Not tested yet"}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        disabled={!hasScript}
                                        onClick={(e) => { e.stopPropagation(); if (dbRow) runTestReplay(dbRow, auto) }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-medium transition-colors"
                                        title={hasScript ? "Run a test replay against the dummy group" : "Record this first."}
                                      >
                                        <RefreshCw className="h-2.5 w-2.5" /> Test
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openRecordingModal(auto) }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 text-[10px] font-medium transition-colors"
                                        title="Re-record this automation"
                                      >
                                        <RotateCcw className="h-2.5 w-2.5" /> Re-record
                                      </button>
                                      {dbRow && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); requestDelete(dbRow.id) }}
                                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-medium transition-colors"
                                          title="Delete this automation — the tile stays as an empty slot you can re-record later"
                                        >
                                          <Trash2 className="h-2.5 w-2.5" /> Delete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}

                              {settingUp && (
                                <div className="mt-3 pt-2 border-t border-blue-500/10">
                                  <div className="flex items-center gap-1.5 text-[10px] text-blue-400 font-medium">
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                                      <RefreshCw className="h-3 w-3" />
                                    </motion.div>
                                    <span>George is testing this — you&apos;ll get a notification</span>
                                  </div>
                                </div>
                              )}

                              {!active && !settingUp && (() => {
                                const dbRow = findDbAutoForCatalog(auto)
                                return (
                                  <div className="mt-3 pt-2 border-t border-amber-500/10 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-medium">
                                      <Video className="h-3 w-3" />
                                      <span>{needsRerec ? "Click to re-record →" : "Click to record this action →"}</span>
                                    </div>
                                    {dbRow && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); requestDelete(dbRow.id) }}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-medium transition-colors"
                                        title="Delete this automation — the tile stays as an empty slot you can re-record later"
                                      >
                                        <Trash2 className="h-2.5 w-2.5" /> Delete
                                      </button>
                                    )}
                                  </div>
                                )
                              })()}

                              {recording && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="mt-2 rounded-lg bg-muted/20 p-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                      <Video className="h-3 w-3 text-blue-400" />
                                      <span>{recording.duration_seconds ? formatTime(recording.duration_seconds) : "—"}</span>
                                      <span>·</span>
                                      <span>{new Date(recording.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {recording.video_path && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setShowVideoModal(recording); setVideoSpeed(1) }}
                                          className="p-1 rounded-lg hover:bg-muted/30 transition-colors"
                                          title="Replay"
                                        >
                                          <Play className="h-3 w-3 text-emerald-400" />
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteRecording(recording.id) }}
                                        className="p-1 rounded-lg hover:bg-muted/30 transition-colors"
                                        title="Delete recording"
                                      >
                                        <Trash2 className="h-3 w-3 text-red-400" />
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </motion.div>
                          )
                        })}

                        {/* Custom DB-backed automations (created via "Add {Platform} Automation") */}
                        {group.custom.map((auto) => {
                          const isRenaming = renamingId === auto.id
                          const statusBadge = auto.status === "active"
                            ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0"><CheckCircle className="h-2.5 w-2.5" /> Active</span>
                            : auto.status === "draft"
                            ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0"><Circle className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Draft</span>
                            : auto.status === "needs_rerecording"
                            ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0"><AlertTriangle className="h-2.5 w-2.5" /> Needs Re-record</span>
                            : auto.status === "broken"
                            ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30 shrink-0"><AlertTriangle className="h-2.5 w-2.5" /> Broken</span>
                            : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted/30 text-muted-foreground border border-border/50 shrink-0">{auto.status}</span>
                          const needsAttn = auto.status === "needs_rerecording" || auto.status === "broken"
                          return (
                            <motion.div
                              key={`db-${auto.id}`}
                              variants={item}
                              whileHover={{ scale: 1.02, y: -2 }}
                              animate={needsAttn ? {
                                boxShadow: [
                                  "0 0 0 0 rgba(251, 146, 60, 0.0)",
                                  "0 0 0 4px rgba(251, 146, 60, 0.45)",
                                  "0 0 0 0 rgba(251, 146, 60, 0.0)",
                                ],
                              } : {}}
                              transition={needsAttn ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
                              className={`rounded-xl border p-4 transition-all bg-gradient-to-br ${platformColors[group.platform]} ${needsAttn ? "border-orange-500/60" : ""}`}
                            >
                              <div className="flex items-start justify-between mb-2 gap-2">
                                <div className="min-w-0 flex-1">
                                  {isRenaming ? (
                                    <input
                                      autoFocus
                                      value={renameDraft}
                                      onChange={e => setRenameDraft(e.target.value)}
                                      onBlur={() => commitRename(auto.id)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") commitRename(auto.id)
                                        if (e.key === "Escape") setRenamingId(null)
                                      }}
                                      className="w-full rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    />
                                  ) : (
                                    <h3 className="font-semibold text-sm truncate">{auto.name}</h3>
                                  )}
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                    {auto.description || (auto.tag ? AUTOMATION_TAGS.find(t => t.value === auto.tag)?.label : "No description")}
                                  </p>
                                </div>
                                {statusBadge}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                {auto.tag && (
                                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold bg-muted/30 text-muted-foreground border border-border/50">
                                    <Tag className="h-2.5 w-2.5" />
                                    {AUTOMATION_TAGS.find(t => t.value === auto.tag)?.label || auto.tag}
                                  </span>
                                )}
                                {auto.source === "extension" && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30"
                                    title="Recorded via the AutoBot Chrome extension"
                                  >
                                    <Video className="h-2.5 w-2.5" />
                                    From Extension
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/20">
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{auto.last_tested_at ? `Tested ${new Date(auto.last_tested_at).toLocaleDateString()}` : `Created ${new Date(auto.created_at).toLocaleDateString()}`}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {needsAttn && (
                                    <motion.button
                                      onClick={() => openEditModal(auto)}
                                      title="This automation is failing — re-record to fix the broken step"
                                      animate={{ scale: [1, 1.05, 1] }}
                                      transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/90 hover:bg-orange-500 text-white text-[10px] font-semibold transition-colors shadow-md shadow-orange-500/40"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                      Re-record
                                    </motion.button>
                                  )}
                                  <button
                                    onClick={() => setReplayAutomation({ id: auto.id, name: auto.name })}
                                    title="Replay this automation"
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[10px] font-semibold transition-colors"
                                  >
                                    <Play className="h-3 w-3" />
                                    Replay
                                  </button>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        title="More actions"
                                        className="inline-flex items-center justify-center px-1.5 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 text-[10px] font-medium transition-colors"
                                      >
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                      <DropdownMenuItem onClick={() => startRename(auto)}>
                                        <Pencil className="h-3.5 w-3.5 mr-2" />
                                        Rename
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => openEditModal(auto)}>
                                        <Edit2 className="h-3.5 w-3.5 mr-2" />
                                        Edit steps & tag
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() => window.open(`/api/automations/export?ids=${auto.id}`, "_blank")}
                                      >
                                        <Download className="h-3.5 w-3.5 mr-2" />
                                        Export JSON
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => requestDelete(auto.id)}
                                        className="text-red-400 focus:text-red-300"
                                      >
                                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>

                              {auto.last_error && (
                                <p className="text-[10px] text-red-400 mt-2 line-clamp-2" title={auto.last_error}>
                                  {auto.last_error}
                                </p>
                              )}
                            </motion.div>
                          )
                        })}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

        </TabsContent>

        {/* ─── Live View tab ─── (populated in P2.E) */}
        <TabsContent value="live-view" className="space-y-6 mt-6">
          <LiveViewTab />
        </TabsContent>

        {/* ─── Maintenance tab ─── (populated in P2.F) */}
        <TabsContent value="maintenance" className="space-y-6 mt-6">
          <MaintenanceTab />
        </TabsContent>
      </Tabs>

      {/* Video Playback Modal */}
      <AnimatePresence>
        {showVideoModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            onClick={() => setShowVideoModal(null)}
          >
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden w-full max-w-3xl shadow-2xl" onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border/30">
                <h3 className="font-semibold truncate">{showVideoModal.name}</h3>
                <button onClick={() => setShowVideoModal(null)} className="p-1 hover:bg-muted/30 rounded-xl"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-4">
                <video ref={videoRef} controls autoPlay className="w-full rounded-xl"
                  src={`/api/recordings/${showVideoModal.id}/video`}
                  onLoadedData={() => { if (videoRef.current) videoRef.current.playbackRate = videoSpeed }}
                />
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1">Speed:</span>
                    {[0.5, 1, 1.5, 2].map(s => (
                      <button key={s} onClick={() => { setVideoSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s }}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${videoSpeed === s ? "bg-orange-500/20 text-orange-400" : "bg-muted/20 text-muted-foreground hover:text-foreground"}`}
                      >{s}x</button>
                    ))}
                  </div>
                  <a href={`/api/recordings/${showVideoModal.id}/video`} download={`${showVideoModal.name}.mp4`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/20 hover:bg-muted/30 text-sm transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test DM Modal */}
      <AnimatePresence>
        {showTestDM && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4"
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">🚀 Send Test DM</h3>
                <button onClick={() => setShowTestDM(false)} className="p-1 hover:bg-muted/30 rounded-xl"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Platform</label>
                  <select value={testPlatform} onChange={e => setTestPlatform(e.target.value)}
                    className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="ig">Instagram</option><option value="fb">Facebook</option><option value="li">LinkedIn</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Username / Profile URL</label>
                  <input value={testUsername} onChange={e => setTestUsername(e.target.value)} placeholder="e.g. johndoe"
                    className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Message</label>
                  <textarea value={testMessage} onChange={e => setTestMessage(e.target.value)} rows={3}
                    className="w-full rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowTestDM(false)}
                  className="flex-1 rounded-xl border border-border/50 px-4 py-2.5 text-sm font-medium hover:bg-muted/20 transition-colors">Cancel</button>
                <button onClick={sendTestDM} disabled={!testUsername || testSending}
                  className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors flex items-center justify-center gap-2">
                  {testSending ? "Sending..." : <><Send className="h-4 w-4" /> Send Test</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* P9.3 — Replay dialog */}
      <AnimatePresence>
        {replayAutomation && (
          <ReplayAutomationDialog
            open={!!replayAutomation}
            onClose={() => setReplayAutomation(null)}
            automationId={replayAutomation.id}
            automationName={replayAutomation.name}
          />
        )}
      </AnimatePresence>

      {/* Guided platform login modal — replaces the old raw-VNC popup for
          the "Log in to X" buttons in the health bar. Gets side-panel
          instructions + embedded VNC + "I'm Logged In" verification. */}
      <PlatformLoginModal
        open={loginModalOpen}
        initialPlatform={loginModalPlatform}
        remainingPlatforms={loginModalRemaining}
        connectedPlatforms={connectedPlatforms}
        onClose={() => {
          setLoginModalOpen(false)
          // Re-poll health so the red banner flips green if the user logged
          // in successfully but didn't click 'I'm Logged In'.
          fetchHealth()
        }}
        onComplete={() => {
          // Each successful probe re-pulls health so the banner count
          // decreases in real time as platforms flip to logged-in.
          fetchHealth()
        }}
      />
    </motion.div>
  )
}
