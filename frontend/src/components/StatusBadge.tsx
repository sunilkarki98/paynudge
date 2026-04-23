'use client'

import React from 'react'
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  AlertTriangle, 
  PauseCircle, 
  FileText, 
  Gavel, 
  XCircle, 
  RefreshCcw, 
  CreditCard,
  ShieldCheck,
  Search,
  HandCoins
} from 'lucide-react'

interface StatusBadgeProps {
  state: string
  dueDate?: string
}

interface StatusConfig {
  label: string
  icon: React.ElementType
  classes: string
  dotClass: string
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  // --- Initial States ---
  DRAFT: {
    label: 'Draft',
    icon: FileText,
    classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    dotClass: 'bg-slate-400'
  },
  APPROVAL_REQUIRED: {
    label: 'Needs Approval',
    icon: Search,
    classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    dotClass: 'bg-indigo-400'
  },

  // --- Active Lifecycle ---
  PENDING: {
    label: 'Active',
    icon: Clock,
    classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dotClass: 'bg-blue-400'
  },
  DUE_SOON: {
    label: 'Due Soon',
    icon: Clock,
    classes: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    dotClass: 'bg-amber-400'
  },
  DUE: {
    label: 'Due Today',
    icon: AlertCircle,
    classes: 'bg-orange-500/10 text-orange-500 border-orange-500/20 font-bold',
    dotClass: 'bg-orange-400'
  },

  // --- Overdue & Escalation ---
  GRACE_PERIOD: {
    label: 'Grace Period',
    icon: ShieldCheck,
    classes: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    dotClass: 'bg-emerald-400'
  },
  OVERDUE_L1: {
    label: 'Late (Nudge 1)',
    icon: AlertTriangle,
    classes: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    dotClass: 'bg-rose-400'
  },
  OVERDUE_L2: {
    label: 'Overdue (Firm)',
    icon: AlertTriangle,
    classes: 'bg-red-500/15 text-red-500 border-red-500/25',
    dotClass: 'bg-red-500'
  },
  OVERDUE_L3: {
    label: 'Critically Late',
    icon: AlertTriangle,
    classes: 'bg-red-600/20 text-red-600 border-red-600/30 font-bold',
    dotClass: 'bg-red-600 animate-pulse'
  },
  FINAL_NOTICE: {
    label: 'Final Notice',
    icon: AlertCircle,
    classes: 'bg-black text-white border-red-600/50',
    dotClass: 'bg-red-500 animate-ping'
  },
  RECURRING_CHASE: {
    label: 'Chasing Loop',
    icon: RefreshCcw,
    classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    dotClass: 'bg-purple-400'
  },

  // --- Payment States ---
  UNVERIFIED_PAYMENT: {
    label: 'Payment Claimed',
    icon: HandCoins,
    classes: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dotClass: 'bg-cyan-400'
  },
  ESCROW_HELD: {
    label: 'In Escrow',
    icon: PauseCircle,
    classes: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    dotClass: 'bg-teal-400'
  },
  PARTIALLY_PAID: {
    label: 'Partially Paid',
    icon: CreditCard,
    classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dotClass: 'bg-emerald-400'
  },
  PAID: {
    label: 'Paid',
    icon: CheckCircle2,
    classes: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20 font-semibold',
    dotClass: 'bg-emerald-500'
  },
  OVERPAID: {
    label: 'Overpaid',
    icon: CheckCircle2,
    classes: 'bg-sky-500/15 text-sky-500 border-sky-500/20 font-semibold',
    dotClass: 'bg-sky-500'
  },

  // --- Exceptional States ---
  DISPUTED: {
    label: 'Disputed',
    icon: AlertCircle,
    classes: 'bg-red-500/10 text-red-400 border-red-500/20',
    dotClass: 'bg-red-400'
  },
  LEGAL_HOLD: {
    label: 'Legal Hold',
    icon: Gavel,
    classes: 'bg-slate-900 text-slate-300 border-slate-700',
    dotClass: 'bg-slate-500'
  },
  VOIDED: {
    label: 'Voided',
    icon: XCircle,
    classes: 'bg-slate-500/10 text-slate-500 border-slate-500/20 line-through',
    dotClass: 'bg-slate-500'
  },
  WRITTEN_OFF: {
    label: 'Written Off',
    icon: XCircle,
    classes: 'bg-slate-900/50 text-slate-600 border-slate-800',
    dotClass: 'bg-slate-700'
  }
}

export default function StatusBadge({ state, dueDate }: StatusBadgeProps) {
  const config = STATUS_CONFIG[state.toUpperCase()] || {
    label: state,
    icon: FileText,
    classes: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    dotClass: 'bg-slate-400'
  }

  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border transition-all duration-200 ${config.classes}`}>
      <Icon size={12} strokeWidth={2.5} />
      <span>{config.label}</span>
      <span className={`w-1 h-1 rounded-full ml-0.5 ${config.dotClass}`} />
    </span>
  )
}
