"use client"

import { Badge } from "@/components/ui/badge"
import { Shield, Server, Lock, Eye, Activity, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import { motion } from "framer-motion"

const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }

function StatusIndicator({ status }: { status: "ok" | "warning" | "error" }) {
  if (status === "ok") return <CheckCircle className="h-5 w-5 text-emerald-500" />
  if (status === "warning") return <AlertTriangle className="h-5 w-5 text-yellow-500" />
  return <XCircle className="h-5 w-5 text-red-500" />
}

function StatusBadge({ status }: { status: "ok" | "warning" | "error" }) {
  const variant = status === "ok" ? "default" : status === "warning" ? "secondary" : "destructive"
  const label = status === "ok" ? "Healthy" : status === "warning" ? "Warning" : "Down"
  return <Badge variant={variant}>{label}</Badge>
}

const vpsSecurityItems = [
  { label: "UFW Firewall", status: "ok" as const, detail: "Active — ports 22, 80, 443, 5900" },
  { label: "SSH Hardening", status: "ok" as const, detail: "Key-only auth, root login disabled" },
  { label: "Fail2Ban", status: "ok" as const, detail: "Active — 0 current bans" },
  { label: "Unattended Upgrades", status: "ok" as const, detail: "Security patches auto-installed" },
]

const serviceHealthItems = [
  { label: "Chrome Automation", status: "ok" as const, detail: "4 browser instances running" },
  { label: "Proxy Service", status: "ok" as const, detail: "Bright Data ISP proxies connected" },
  { label: "VNC Server", status: "ok" as const, detail: "Accessible on :5900" },
  { label: "Next.js App", status: "ok" as const, detail: "Deployed on Vercel" },
]

export default function SecurityPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-8"
    >
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">🛡️ Security & Infrastructure</h1>
        <p className="text-muted-foreground mt-1">VPS security status and service health monitoring</p>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={item} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <div className="rounded-xl p-2 bg-red-500/20">
              <Lock className="h-4 w-4 text-red-400" />
            </div>
            VPS Security
          </h3>
          <div className="space-y-3">
            {vpsSecurityItems.map((itm) => (
              <div key={itm.label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                <StatusIndicator status={itm.status} />
                <div className="flex-1">
                  <div className="font-medium text-sm">{itm.label}</div>
                  <div className="text-xs text-muted-foreground">{itm.detail}</div>
                </div>
                <StatusBadge status={itm.status} />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <div className="rounded-xl p-2 bg-blue-500/20">
              <Server className="h-4 w-4 text-blue-400" />
            </div>
            Service Health
          </h3>
          <div className="space-y-3">
            {serviceHealthItems.map((itm) => (
              <div key={itm.label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/30 transition-colors">
                <StatusIndicator status={itm.status} />
                <div className="flex-1">
                  <div className="font-medium text-sm">{itm.label}</div>
                  <div className="text-xs text-muted-foreground">{itm.detail}</div>
                </div>
                <StatusBadge status={itm.status} />
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-5 shadow-lg"
      >
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <div className="rounded-xl p-2 bg-purple-500/20">
            <Eye className="h-4 w-4 text-purple-400" />
          </div>
          Security Audit
        </h3>
        <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/20 border border-border/30">
          <Activity className="h-5 w-5 text-emerald-500" />
          <div>
            <div className="font-medium text-sm">Last Audit: March 28, 2026</div>
            <div className="text-xs text-muted-foreground">All checks passed — next audit scheduled April 4, 2026</div>
          </div>
          <Badge variant="default" className="ml-auto">Passed</Badge>
        </div>
      </motion.div>
    </motion.div>
  )
}
