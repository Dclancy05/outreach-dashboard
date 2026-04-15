"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Ghost,
  Maximize2,
  Minimize2,
  RefreshCw,
  Wifi,
  WifiOff,
  Shield,
  Globe,
  Lock,
  ExternalLink,
} from "lucide-react"

const PHANTOM_VNC_URL =
  "https://srv1197943.taild42583.ts.net:10443/vnc.html?autoconnect=true&resize=scale&quality=8&compression=2"
const PHANTOM_VNC_BASE =
  "https://srv1197943.taild42583.ts.net:10443"

export default function PhantomPage() {
  const [isFullScreen, setIsFullScreen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [proxyIp, setProxyIp] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const checkConnection = async () => {
      try {
        // Try internal status API first (from Pure), fall back to direct probe (from Android)
        const res = await fetch("/api/pure/status")
        if (res.ok) {
          const data = await res.json()
          setIsConnected(data.connected ?? true)
          setProxyIp(data.proxyIp || null)
        } else {
          setIsConnected(true)
        }
      } catch {
        // If API doesn't exist, probe the VNC base directly (mode: no-cors won't throw on reachable host)
        try {
          await fetch(PHANTOM_VNC_BASE, { mode: "no-cors" })
          setIsConnected(true)
        } catch {
          setIsConnected(false)
        }
      }
      setIsLoading(false)
    }
    checkConnection()
    const interval = setInterval(checkConnection, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handler = () => {
      setIsFullScreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  const handleFullScreen = () => {
    if (!isFullScreen) {
      containerRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIsLoading(true)
      iframeRef.current.src = PHANTOM_VNC_URL + "&t=" + Date.now()
      setTimeout(() => setIsLoading(false), 3000)
    }
  }

  const openInNewTab = () => {
    window.open(PHANTOM_VNC_URL, "_blank")
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Ghost className="h-7 w-7 sm:h-8 sm:w-8 text-violet-400" />
            <span className="bg-gradient-to-r from-violet-400 to-purple-300 bg-clip-text text-transparent">
              Phantom
            </span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Remote device on VPS — untraceable, separate from your personal iPhone, with its own NYC IP
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={isConnected ? "default" : "destructive"}
            className={`gap-1 ${isConnected ? "bg-violet-600/80 hover:bg-violet-600/80 text-white border-0" : ""}`}
          >
            {isConnected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {isLoading ? "Checking..." : isConnected ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-violet-500/20 bg-violet-950/10">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/15">
              <Shield className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Device Fingerprint</p>
              <p className="text-sm font-medium">Pixel 8 Pro (Android 14)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-violet-500/20 bg-violet-950/10">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Globe className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">IP Address</p>
              <p className="text-sm font-medium font-mono">
                {proxyIp || "63.88.217.120"}{" "}
                <span className="text-muted-foreground font-normal">(NYC)</span>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-violet-500/20 bg-violet-950/10">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Lock className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Isolation Status</p>
              <p className="text-sm font-medium text-emerald-400">Fully Isolated</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Phantom Viewer */}
      <Card className="overflow-hidden border-violet-500/20">
        <div className="flex items-center justify-between p-2 sm:p-3 border-b bg-card">
          <span className="text-sm font-medium flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-violet-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <Ghost className="h-3.5 w-3.5 text-violet-400" />
            Phantom Display
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="h-8 w-8 p-0"
              title="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFullScreen}
              className="h-8 w-8 p-0"
              title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
            >
              {isFullScreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openInNewTab}
              className="h-8 text-xs gap-1 border-violet-500/30 hover:border-violet-500/60"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">New Tab</span>
            </Button>
          </div>
        </div>
        <div
          ref={containerRef}
          className="relative bg-black"
          style={{ minHeight: "75vh" }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
              <div className="text-center space-y-3">
                <Ghost className="h-10 w-10 mx-auto text-violet-400 animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  Connecting to Phantom...
                </p>
                <p className="text-xs text-violet-400/60">
                  VPS · NYC IP · Isolated
                </p>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src={PHANTOM_VNC_URL}
            className="w-full border-0"
            style={{ height: "75vh" }}
            onLoad={() => setIsLoading(false)}
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </Card>

      {/* Quick Guide */}
      <Card className="border-violet-500/10">
        <CardContent className="p-4">
          <h3 className="font-semibold mb-2 text-sm flex items-center gap-2">
            <Ghost className="h-4 w-4 text-violet-400" />
            How to use Phantom
          </h3>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>
              Phantom is a remote phone running on a VPS — completely separate from your personal iPhone
            </li>
            <li>
              It uses a dedicated NYC IP (<span className="font-mono text-xs">{proxyIp || "63.88.217.120"}</span>) and a unique device fingerprint (Pixel 8 Pro) — untraceable back to you
            </li>
            <li>
              Click or tap inside the viewer to interact with Phantom as if holding the device
            </li>
            <li>
              For the best mobile experience, tap <strong>New Tab</strong> to open the viewer full-screen
            </li>
            <li>All Phantom data and logins persist between sessions on the VPS</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
