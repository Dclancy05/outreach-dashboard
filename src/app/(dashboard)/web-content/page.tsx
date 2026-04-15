"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Globe } from "lucide-react"
import { motion } from "framer-motion"
import dynamic from "next/dynamic"

const BlogContent = dynamic(() => import("../blog/page"), { ssr: false })
const SitePages = dynamic(() => import("../pages/page"), { ssr: false })

export default function WebContentPage() {
  const [tab, setTab] = useState("blog")

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-8"
    >
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-indigo-500/20">
            <Globe className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Web Content</h1>
            <p className="text-muted-foreground mt-1">Blog posts, site pages, and SEO optimization</p>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-muted/30 backdrop-blur-sm border border-border/50 rounded-xl p-1">
            <TabsTrigger value="blog" className="gap-1.5 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <BookOpen className="h-4 w-4" /> Blog Approval
            </TabsTrigger>
            <TabsTrigger value="pages" className="gap-1.5 rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground">
              <Globe className="h-4 w-4" /> Site Pages
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blog" className="mt-6">
            <BlogContent />
          </TabsContent>
          <TabsContent value="pages" className="mt-6">
            <SitePages />
          </TabsContent>
        </Tabs>
      </motion.div>
    </motion.div>
  )
}
