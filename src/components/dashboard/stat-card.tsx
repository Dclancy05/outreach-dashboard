import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { type LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  color: "purple" | "blue" | "green" | "pink" | "orange" | "cyan" | "yellow"
  trend?: { value: number; label: string }
}

const colorMap = {
  purple: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20", glow: "glow-purple" },
  blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", glow: "glow-blue" },
  green: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/20", glow: "glow-green" },
  pink: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20", glow: "glow-pink" },
  orange: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20", glow: "glow-orange" },
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20", glow: "glow-cyan" },
  yellow: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20", glow: "glow-yellow" },
}

export function StatCard({ title, value, subtitle, icon: Icon, color, trend }: StatCardProps) {
  const c = colorMap[color]
  return (
    <Card className={cn("relative overflow-hidden transition-all hover:scale-[1.02]", c.border, c.glow, "animate-pulse-glow")}>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={cn("text-3xl font-bold mt-1", c.text)}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trend && (
              <p className={cn("text-xs mt-1", trend.value >= 0 ? "text-green-400" : "text-red-400")}>
                {trend.value >= 0 ? "+" : ""}{trend.value}% {trend.label}
              </p>
            )}
          </div>
          <div className={cn("rounded-xl p-3", c.bg)}>
            <Icon className={cn("h-6 w-6", c.text)} />
          </div>
        </div>
      </div>
    </Card>
  )
}
