'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  FiTarget,
  FiAlertTriangle,
  FiClock,
  FiNavigation2,
  FiChevronDown,
  FiChevronUp,
  FiSend,
  FiTrash2,
  FiCpu,
  FiActivity,
  FiBarChart2,
  FiHistory,
  FiSearch,
  FiX,
  FiCheck,
  FiArrowRight,
  FiShield,
  FiAlertCircle,
  FiTag,
  FiUsers,
  FiLayers,
  FiRefreshCw,
} from 'react-icons/fi'

// ─── Constants ───────────────────────────────────────────────────────────────

const MANAGER_AGENT_ID = '69946ae4b3f7b0df4d40bf76'

const SAMPLE_CONVERSATION = `Customer: Hi, I've been trying to process a payment for the last 3 hours and it keeps failing with error code 5023. This is extremely urgent - we have a deadline to submit a purchase order worth $450,000 by end of day today or we lose the contract.

Support Agent: I understand this is critical. Let me look into error code 5023 for you. Can you provide your account ID?

Customer: It's ACC-98712. Look, I've already tried clearing cache, using different browsers, and even a different computer. Nothing works. My CFO is breathing down my neck and if this doesn't get resolved in the next hour, we're going to have serious problems. We've been a customer for 8 years and pay $50k/month for your enterprise plan.

Support Agent: I can see the error in our logs. It appears to be related to our payment gateway integration. Let me escalate this.

Customer: Escalate? I need this FIXED, not escalated to someone who will take another 3 hours to respond. I'm considering switching to your competitor if this isn't resolved immediately. This is the third time this month we've had payment processing issues.`

// ─── Types ───────────────────────────────────────────────────────────────────

interface SecondaryIntent {
  intent: string
  confidence: number
}

interface SignalDetected {
  signal_type: string
  description: string
  severity: string
}

interface RiskFactor {
  factor: string
  impact: string
  details: string
}

interface IntentClassification {
  primary_intent: string
  primary_confidence: number
  secondary_intents: SecondaryIntent[]
  classification_reasoning: string
  key_signals: string[]
}

interface UrgencyAssessment {
  urgency_level: string
  urgency_score: number
  signals_detected: SignalDetected[]
  reasoning: string[]
  emotional_tone: string
  business_impact: string
}

interface SLARisk {
  breach_probability: number
  risk_level: string
  recommended_response_window_hours: number
  recommended_resolution_window_hours: number
  risk_factors: RiskFactor[]
  mitigation_recommendations: string[]
}

interface RoutingRecommendation {
  target_team: string
  tier: string
  priority_level: string
  priority_reasoning: string
  suggested_next_actions: string[]
  escalation_needed: boolean
  escalation_path: string
  tags: string[]
}

interface TriageReport {
  executive_summary: string
  intent_classification: IntentClassification
  urgency_assessment: UrgencyAssessment
  sla_risk: SLARisk
  routing_recommendation: RoutingRecommendation
}

interface HistoryItem {
  id: string
  timestamp: string
  conversationSnippet: string
  report: TriageReport
}

// ─── Sub-Agent Info ──────────────────────────────────────────────────────────

const AGENTS = [
  { id: '69946ac9b3f7b0df4d40bf6c', name: 'Intent Classification', purpose: 'Classifies support ticket intent and confidence' },
  { id: '69946ac993f56833122ab5b1', name: 'Urgency Detection', purpose: 'Detects urgency level and emotional signals' },
  { id: '69946ac970f8b59789c57234', name: 'SLA Risk Estimation', purpose: 'Estimates SLA breach probability and risk' },
  { id: '69946acab3f7b0df4d40bf6e', name: 'Routing Recommendation', purpose: 'Recommends team routing and priority' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTriageResponse(result: any): TriageReport | null {
  try {
    if (result?.response?.result) {
      const data = result.response.result
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data)
          if (parsed.executive_summary) return parsed
          if (typeof parsed === 'string') {
            const doubleParsed = JSON.parse(parsed)
            if (doubleParsed.executive_summary) return doubleParsed
          }
        } catch {
          const jsonMatch = data.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const extracted = JSON.parse(jsonMatch[0])
            if (extracted.executive_summary) return extracted
          }
        }
      }
      if (data.executive_summary) return data as TriageReport
      if (data.result && typeof data.result === 'object' && data.result.executive_summary) {
        return data.result as TriageReport
      }
    }
    if (result?.raw_response) {
      try {
        const raw = typeof result.raw_response === 'string' ? JSON.parse(result.raw_response) : result.raw_response
        if (raw.executive_summary) return raw
      } catch { /* noop */ }
    }
    if (result?.response?.message) {
      try {
        const msg = typeof result.response.message === 'string' ? JSON.parse(result.response.message) : result.response.message
        if (msg.executive_summary) return msg
      } catch { /* noop */ }
    }
    return null
  } catch {
    return null
  }
}

function getLevelColor(level: string | undefined): string {
  if (!level) return 'bg-muted text-muted-foreground border-border'
  const l = level.toLowerCase()
  if (l.includes('critical') || l.includes('p1')) return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (l.includes('high') || l.includes('p2')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  if (l.includes('medium') || l.includes('p3')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
  if (l.includes('low') || l.includes('p4')) return 'bg-green-500/20 text-green-400 border-green-500/30'
  return 'bg-muted text-muted-foreground border-border'
}

function getLevelDotColor(level: string | undefined): string {
  if (!level) return 'bg-muted-foreground'
  const l = level.toLowerCase()
  if (l.includes('critical') || l.includes('p1')) return 'bg-red-400'
  if (l.includes('high') || l.includes('p2')) return 'bg-orange-400'
  if (l.includes('medium') || l.includes('p3')) return 'bg-yellow-400'
  if (l.includes('low') || l.includes('p4')) return 'bg-green-400'
  return 'bg-muted-foreground'
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9)
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-1">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return <h4 key={i} className="font-semibold text-sm mt-2 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## '))
          return <h3 key={i} className="font-semibold text-base mt-2 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# '))
          return <h2 key={i} className="font-bold text-lg mt-3 mb-1">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* '))
          return <li key={i} className="ml-4 list-disc text-sm leading-snug">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line))
          return <li key={i} className="ml-4 list-decimal text-sm leading-snug">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm leading-snug">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  )
}

// ─── Inline Components ───────────────────────────────────────────────────────

function Sidebar({ activeView, onNavigate }: { activeView: string; onNavigate: (v: string) => void }) {
  return (
    <div className="w-56 h-screen flex-shrink-0 bg-[hsl(220,24%,8%)] border-r border-[hsl(220,18%,15%)] flex flex-col fixed left-0 top-0 z-20">
      <div className="px-4 py-4 border-b border-[hsl(220,18%,15%)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-primary/20 flex items-center justify-center">
            <FiShield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">Support Triage</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">Intelligence System</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-1">
        <button
          onClick={() => onNavigate('dashboard')}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded transition-colors',
            activeView === 'dashboard'
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <FiActivity className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => onNavigate('history')}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded transition-colors',
            activeView === 'history'
              ? 'bg-primary/15 text-primary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <FiHistory className="w-4 h-4" />
          Analysis History
        </button>
      </nav>
      <div className="px-3 py-3 border-t border-[hsl(220,18%,15%)]">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">Agents</div>
        <div className="space-y-1.5">
          {AGENTS.map((agent) => (
            <div key={agent.id} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate">{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LoadingSkeletons() {
  return (
    <div className="space-y-3">
      <Card className="border border-border bg-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <FiCpu className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-sm text-primary font-medium">Analyzing conversation...</span>
          </div>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border border-border bg-card">
          <CardContent className="p-4">
            <Skeleton className="h-4 w-1/3 mb-3" />
            <Skeleton className="h-3 w-full mb-2" />
            <Skeleton className="h-3 w-5/6 mb-2" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ExecutiveSummaryCard({ summary }: { summary: string }) {
  return (
    <Card className="border border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-2">
          <FiBarChart2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-medium text-primary uppercase tracking-wider mb-1.5">Executive Summary</h3>
            <div className="text-sm text-foreground leading-relaxed">{renderMarkdown(summary ?? '')}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function IntentCard({ data }: { data: IntentClassification | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  const confidencePercent = typeof data.primary_confidence === 'number'
    ? data.primary_confidence > 1 ? data.primary_confidence : data.primary_confidence * 100
    : 0

  return (
    <Card className="border border-border bg-card">
      <CardHeader className="px-4 py-3 pb-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FiTarget className="w-4 h-4 text-primary" />
          Intent Classification
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs font-medium">{data.primary_intent ?? 'Unknown'}</Badge>
          <span className="text-xs text-muted-foreground">{confidencePercent.toFixed(1)}% confidence</span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Confidence</span>
            <span>{confidencePercent.toFixed(1)}%</span>
          </div>
          <Progress value={confidencePercent} className="h-1.5" />
        </div>

        {Array.isArray(data.secondary_intents) && data.secondary_intents.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Secondary Intents</p>
            <div className="space-y-1">
              {data.secondary_intents.map((si, i) => {
                const siConf = typeof si.confidence === 'number'
                  ? si.confidence > 1 ? si.confidence : si.confidence * 100
                  : 0
                return (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{si.intent ?? ''}</span>
                    <span className="text-muted-foreground">{siConf.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {Array.isArray(data.key_signals) && data.key_signals.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Key Signals</p>
            <div className="flex flex-wrap gap-1">
              {data.key_signals.map((signal, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">{signal}</Badge>
              ))}
            </div>
          </div>
        )}

        {data.classification_reasoning && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {open ? <FiChevronUp className="w-3 h-3" /> : <FiChevronDown className="w-3 h-3" />}
                Classification Reasoning
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-2 rounded bg-secondary/50 text-xs text-foreground leading-relaxed">
                {renderMarkdown(data.classification_reasoning)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

function UrgencyCard({ data }: { data: UrgencyAssessment | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  const score = typeof data.urgency_score === 'number' ? data.urgency_score : 0

  return (
    <Card className="border border-border bg-card">
      <CardHeader className="px-4 py-3 pb-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FiAlertTriangle className="w-4 h-4 text-orange-400" />
          Urgency Assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <Badge className={cn('text-xs font-medium border', getLevelColor(data.urgency_level))}>
            {data.urgency_level ?? 'Unknown'}
          </Badge>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Score</span>
            <span className={cn('text-sm font-semibold', score >= 7 ? 'text-red-400' : score >= 4 ? 'text-yellow-400' : 'text-green-400')}>
              {score}/10
            </span>
          </div>
        </div>
        <Progress value={score * 10} className="h-1.5" />

        {Array.isArray(data.signals_detected) && data.signals_detected.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Signals Detected</p>
            <div className="space-y-1.5">
              {data.signals_detected.map((sig, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <Badge className={cn('text-[10px] px-1 py-0 border flex-shrink-0', getLevelColor(sig.severity))}>
                    {sig.severity ?? ''}
                  </Badge>
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{sig.signal_type ?? ''}</span>
                    <span className="text-muted-foreground"> -- {sig.description ?? ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-secondary/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Emotional Tone</p>
            <p className="text-xs text-foreground font-medium">{data.emotional_tone ?? 'N/A'}</p>
          </div>
          <div className="p-2 rounded bg-secondary/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Business Impact</p>
            <p className="text-xs text-foreground font-medium">{data.business_impact ?? 'N/A'}</p>
          </div>
        </div>

        {Array.isArray(data.reasoning) && data.reasoning.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {open ? <FiChevronUp className="w-3 h-3" /> : <FiChevronDown className="w-3 h-3" />}
                Reasoning ({data.reasoning.length})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-1">
                {data.reasoning.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <FiArrowRight className="w-3 h-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

function SLARiskCard({ data }: { data: SLARisk | undefined }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  const breachProb = typeof data.breach_probability === 'number' ? data.breach_probability : 0

  return (
    <Card className="border border-border bg-card">
      <CardHeader className="px-4 py-3 pb-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FiClock className="w-4 h-4 text-yellow-400" />
          SLA Risk
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <Badge className={cn('text-xs font-medium border', getLevelColor(data.risk_level))}>
            {data.risk_level ?? 'Unknown'} Risk
          </Badge>
          <span className={cn('text-sm font-semibold', breachProb >= 70 ? 'text-red-400' : breachProb >= 40 ? 'text-yellow-400' : 'text-green-400')}>
            {breachProb}% breach risk
          </span>
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Breach Probability</span>
            <span>{breachProb}%</span>
          </div>
          <Progress value={breachProb} className="h-1.5" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded bg-secondary/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Response Window</p>
            <p className="text-sm text-foreground font-semibold">
              {data.recommended_response_window_hours ?? 'N/A'}
              <span className="text-xs text-muted-foreground font-normal ml-0.5">hrs</span>
            </p>
          </div>
          <div className="p-2 rounded bg-secondary/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Resolution Window</p>
            <p className="text-sm text-foreground font-semibold">
              {data.recommended_resolution_window_hours ?? 'N/A'}
              <span className="text-xs text-muted-foreground font-normal ml-0.5">hrs</span>
            </p>
          </div>
        </div>

        {Array.isArray(data.risk_factors) && data.risk_factors.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Risk Factors</p>
            <div className="space-y-1.5">
              {data.risk_factors.map((rf, i) => (
                <div key={i} className="p-2 rounded bg-secondary/30 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-foreground">{rf.factor ?? ''}</span>
                    <Badge className={cn('text-[10px] px-1 py-0 border', getLevelColor(rf.impact))}>{rf.impact ?? ''}</Badge>
                  </div>
                  <p className="text-muted-foreground">{rf.details ?? ''}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(data.mitigation_recommendations) && data.mitigation_recommendations.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {open ? <FiChevronUp className="w-3 h-3" /> : <FiChevronDown className="w-3 h-3" />}
                Mitigation Recommendations ({data.mitigation_recommendations.length})
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-1">
                {data.mitigation_recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <FiCheck className="w-3 h-3 text-accent mt-0.5 flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}

function RoutingCard({ data }: { data: RoutingRecommendation | undefined }) {
  if (!data) return null
  return (
    <Card className="border border-border bg-card">
      <CardHeader className="px-4 py-3 pb-0">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FiNavigation2 className="w-4 h-4 text-accent" />
          Routing Recommendation
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn('text-xs font-medium border', getLevelColor(data.priority_level))}>
            {data.priority_level ?? 'Unknown'}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <FiUsers className="w-3 h-3 mr-1" />
            {data.target_team ?? 'Unassigned'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            <FiLayers className="w-3 h-3 mr-1" />
            {data.tier ?? 'N/A'}
          </Badge>
        </div>

        {data.escalation_needed && (
          <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/20">
            <FiAlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-red-400">Escalation Required</span>
              {data.escalation_path && (
                <span className="text-muted-foreground"> -- {data.escalation_path}</span>
              )}
            </div>
          </div>
        )}

        {data.priority_reasoning && (
          <div className="p-2 rounded bg-secondary/50">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Priority Reasoning</p>
            <p className="text-xs text-foreground leading-relaxed">{data.priority_reasoning}</p>
          </div>
        )}

        {Array.isArray(data.suggested_next_actions) && data.suggested_next_actions.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Suggested Next Actions</p>
            <ol className="space-y-1">
              {data.suggested_next_actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                  <span className="flex-shrink-0 w-4 h-4 rounded bg-primary/20 text-primary text-[10px] font-medium flex items-center justify-center">{i + 1}</span>
                  <span>{action}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {Array.isArray(data.tags) && data.tags.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1">
              {data.tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                  <FiTag className="w-2.5 h-2.5 mr-0.5" />
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistoryItemCard({
  item,
  expanded,
  onToggle,
}: {
  item: HistoryItem
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <Card className="border border-border bg-card">
      <CardContent className="p-0">
        <button onClick={onToggle} className="w-full text-left p-3 hover:bg-secondary/30 transition-colors">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">
                {item.report?.intent_classification?.primary_intent ?? 'Unknown'}
              </Badge>
              <Badge className={cn('text-[10px] border', getLevelColor(item.report?.urgency_assessment?.urgency_level))}>
                {item.report?.urgency_assessment?.urgency_level ?? 'N/A'}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                SLA Risk: {item.report?.sla_risk?.breach_probability ?? 0}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{item.timestamp}</span>
              {expanded ? <FiChevronUp className="w-3 h-3 text-muted-foreground" /> : <FiChevronDown className="w-3 h-3 text-muted-foreground" />}
            </div>
          </div>
          <p className="text-xs text-muted-foreground truncate">{item.conversationSnippet}</p>
        </button>
        {expanded && (
          <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
            <ExecutiveSummaryCard summary={item.report?.executive_summary ?? ''} />
            <IntentCard data={item.report?.intent_classification} />
            <UrgencyCard data={item.report?.urgency_assessment} />
            <SLARiskCard data={item.report?.sla_risk} />
            <RoutingCard data={item.report?.routing_recommendation} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function Page() {
  const [activeView, setActiveView] = useState('dashboard')
  const [conversationInput, setConversationInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [triageResult, setTriageResult] = useState<TriageReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [sampleDataOn, setSampleDataOn] = useState(false)
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('triage_history')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setHistory(parsed)
        }
      }
    } catch { /* noop */ }
  }, [])

  // Save history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('triage_history', JSON.stringify(history))
    } catch { /* noop */ }
  }, [history])

  // Sample data toggle
  useEffect(() => {
    if (sampleDataOn) {
      setConversationInput(SAMPLE_CONVERSATION)
    } else {
      setConversationInput('')
      setTriageResult(null)
      setError(null)
    }
  }, [sampleDataOn])

  const handleAnalyze = useCallback(async () => {
    if (!conversationInput.trim()) return
    setLoading(true)
    setError(null)
    setTriageResult(null)
    setActiveAgentId(MANAGER_AGENT_ID)

    try {
      const result = await callAIAgent(conversationInput, MANAGER_AGENT_ID)
      setActiveAgentId(null)

      if (result.success) {
        const parsed = parseTriageResponse(result)
        if (parsed) {
          setTriageResult(parsed)
          const newItem: HistoryItem = {
            id: generateId(),
            timestamp: new Date().toLocaleString(),
            conversationSnippet: conversationInput.slice(0, 100) + (conversationInput.length > 100 ? '...' : ''),
            report: parsed,
          }
          setHistory((prev) => [newItem, ...prev])
        } else {
          setError('Failed to parse triage response. The agent returned data in an unexpected format.')
        }
      } else {
        setError(result.error ?? result.response?.message ?? 'Analysis failed. Please try again.')
      }
    } catch (e: any) {
      setActiveAgentId(null)
      setError(e?.message ?? 'An unexpected error occurred.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }, [conversationInput])

  const handleClear = useCallback(() => {
    setConversationInput('')
    setTriageResult(null)
    setError(null)
    setSampleDataOn(false)
  }, [])

  const filteredHistory = urgencyFilter
    ? history.filter((h) => {
        const level = h.report?.urgency_assessment?.urgency_level?.toLowerCase() ?? ''
        return level.includes(urgencyFilter.toLowerCase())
      })
    : history

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />

      <div className="ml-56 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="h-12 border-b border-border bg-card flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">
              {activeView === 'dashboard' ? 'Analysis Dashboard' : 'Analysis History'}
            </h2>
            {activeAgentId && (
              <Badge variant="secondary" className="text-[10px] animate-pulse">
                <FiCpu className="w-3 h-3 mr-1" />
                Processing...
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sample Data</span>
            <Switch checked={sampleDataOn} onCheckedChange={setSampleDataOn} />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          {activeView === 'dashboard' ? (
            <div className="h-[calc(100vh-3rem)] flex">
              {/* Left Panel - Input */}
              <div className="w-[40%] border-r border-border flex flex-col p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-medium mb-1">Support Conversation</h3>
                  <p className="text-xs text-muted-foreground">Paste a support conversation below to analyze intent, urgency, SLA risk, and routing.</p>
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="relative flex-1">
                    <Textarea
                      placeholder="Paste support conversation here..."
                      value={conversationInput}
                      onChange={(e) => setConversationInput(e.target.value)}
                      className="h-full min-h-[180px] resize-none bg-input border-border text-sm leading-relaxed"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground">{conversationInput.length} characters</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClear}
                        disabled={loading}
                        className="text-xs h-8"
                      >
                        <FiTrash2 className="w-3 h-3 mr-1" />
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleAnalyze}
                        disabled={loading || !conversationInput.trim()}
                        className="text-xs h-8"
                      >
                        {loading ? (
                          <>
                            <FiRefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <FiSend className="w-3 h-3 mr-1" />
                            Analyze Conversation
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Agent Status */}
                <Separator className="my-3" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">Agent Pipeline</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {AGENTS.map((agent) => (
                      <div
                        key={agent.id}
                        className={cn(
                          'flex items-center gap-1.5 p-1.5 rounded text-[10px] border',
                          activeAgentId === MANAGER_AGENT_ID
                            ? 'border-primary/30 bg-primary/5'
                            : 'border-transparent bg-secondary/30'
                        )}
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full', activeAgentId === MANAGER_AGENT_ID ? 'bg-primary animate-pulse' : 'bg-green-500')} />
                        <span className="text-muted-foreground truncate">{agent.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Panel - Results */}
              <div className="w-[60%] flex flex-col min-h-0">
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-3">
                    {/* Error State */}
                    {error && (
                      <Card className="border border-red-500/30 bg-red-500/5">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <FiAlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-red-400 mb-1">Analysis Failed</p>
                              <p className="text-xs text-muted-foreground mb-2">{error}</p>
                              <Button variant="outline" size="sm" onClick={handleAnalyze} className="text-xs h-7">
                                <FiRefreshCw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Loading State */}
                    {loading && <LoadingSkeletons />}

                    {/* Results */}
                    {!loading && !error && triageResult && (
                      <>
                        <ExecutiveSummaryCard summary={triageResult.executive_summary ?? ''} />
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                          <IntentCard data={triageResult.intent_classification} />
                          <UrgencyCard data={triageResult.urgency_assessment} />
                          <SLARiskCard data={triageResult.sla_risk} />
                          <RoutingCard data={triageResult.routing_recommendation} />
                        </div>
                      </>
                    )}

                    {/* Empty State */}
                    {!loading && !error && !triageResult && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-12 h-12 rounded bg-secondary flex items-center justify-center mb-3">
                          <FiSearch className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <h3 className="text-sm font-medium text-foreground mb-1">No Analysis Yet</h3>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          Paste a support conversation in the left panel and click "Analyze Conversation" to begin triage analysis.
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ) : (
            /* History View */
            <ScrollArea className="h-[calc(100vh-3rem)]">
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium">Past Analyses</h3>
                  <span className="text-xs text-muted-foreground">{history.length} total</span>
                </div>

                {/* Urgency Filters */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setUrgencyFilter(null)}
                    className={cn(
                      'px-2 py-0.5 text-[10px] rounded border transition-colors',
                      !urgencyFilter
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                    )}
                  >
                    All
                  </button>
                  {['Critical', 'High', 'Medium', 'Low'].map((level) => (
                    <button
                      key={level}
                      onClick={() => setUrgencyFilter(urgencyFilter === level ? null : level)}
                      className={cn(
                        'px-2 py-0.5 text-[10px] rounded border transition-colors',
                        urgencyFilter === level
                          ? getLevelColor(level)
                          : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>

                <Separator />

                {filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-12 h-12 rounded bg-secondary flex items-center justify-center mb-3">
                      <FiHistory className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      {history.length === 0 ? 'No Analyses Yet' : 'No Matching Results'}
                    </h3>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {history.length === 0
                        ? 'Run your first triage from the dashboard.'
                        : 'Try adjusting the urgency filter.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredHistory.map((item) => (
                      <HistoryItemCard
                        key={item.id}
                        item={item}
                        expanded={expandedHistoryId === item.id}
                        onToggle={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </main>
      </div>
    </div>
  )
}
