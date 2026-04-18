'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import {
  Mail,
  MessageSquare,
  Shield,
  FileUp,
  AlertTriangle,
  ArrowRight,
  Inbox,
  Upload,
  DollarSign,
  BarChart3,
  Zap,
  Clock,
  CheckCircle,
  Eye,
} from 'lucide-react'

export default function LandingPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (user) return null

  return (
    <div className="min-h-screen bg-background text-text-primary selection:bg-primary-500/30 overflow-x-hidden">

      {/* ───────── NAVIGATION ───────── */}
      <nav className="fixed w-full z-50 backdrop-blur-xl bg-surface-base/80 border-b border-surface-border">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-400 to-accent-300">
              Invoice Chaser
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-5 py-2.5 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold hover:scale-105 transition-transform text-sm shadow-lg shadow-primary-500/20"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ───────── HERO ───────── */}
        <section className="relative pt-40 pb-20 lg:pt-56 lg:pb-32 px-6">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none" />
          <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center px-4 py-2 rounded-full glass-card border border-primary-500/30 text-primary-400 text-sm font-medium mb-4">
              <Zap className="w-4 h-4 mr-2" />
              AI-generated reminders via Gemini
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Automate your<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">
                payment follow-ups.
              </span>
            </h1>
            <p className="text-lg lg:text-xl text-text-primary max-w-2xl mx-auto leading-relaxed font-medium">
              Create an invoice. Set a tone. Invoice Chaser automatically sends escalating reminders
              via Email and SMS until your client pays — so you don&apos;t have to ask.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href="/register" className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold text-lg hover:shadow-2xl hover:shadow-primary-500/30 hover:-translate-y-1 transition-all flex items-center justify-center gap-2">
                Start Free <ArrowRight className="w-5 h-5" />
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-2xl glass-card font-medium text-text-primary hover:bg-surface-raised transition-all">
                See how it works ↓
              </a>
            </div>
            <p className="text-sm text-text-muted font-medium">
              No credit card required. Set up in under 2 minutes.
            </p>
          </div>
        </section>

        {/* ───────── HOW IT WORKS ───────── */}
        <section id="how-it-works" className="py-24 bg-surface-base border-y border-surface-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl lg:text-4xl font-bold text-text-primary">Three steps. Then it runs itself.</h2>
              <p className="text-text-primary font-medium text-lg">No integrations to configure. No templates to write. Just invoices in, money out.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Connector line */}
              <div className="hidden md:block absolute top-[60px] left-[16.66%] right-[16.66%] h-[2px] bg-gradient-to-r from-primary-500/40 via-accent-500/40 to-emerald-500/40" />

              {/* Step 1 */}
              <div className="flex flex-col items-center text-center space-y-5">
                <div className="relative w-[120px] h-[120px] rounded-3xl bg-background border border-surface-border flex items-center justify-center shadow-xl shadow-primary-500/5 hover:-translate-y-2 transition-transform z-10">
                  <Inbox className="w-12 h-12 text-primary-400" />
                  <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center">1</span>
                </div>
                <h3 className="text-xl font-bold">Create Invoice</h3>
                <p className="text-text-primary font-medium max-w-xs">Add your client, amount, and due date. Or upload a PDF/CSV and let AI extract the details automatically.</p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center space-y-5">
                <div className="relative w-[120px] h-[120px] rounded-3xl bg-background border border-surface-border flex items-center justify-center shadow-xl shadow-accent-500/5 hover:-translate-y-2 transition-transform z-10">
                  <Clock className="w-12 h-12 text-accent-400" />
                  <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-accent-500 text-white text-sm font-bold flex items-center justify-center">2</span>
                </div>
                <h3 className="text-xl font-bold">Set Your Rules</h3>
                <p className="text-text-primary font-medium max-w-xs">Choose a reminder tone (Friendly, Professional, or Firm), escalation speed, and contact channels per client.</p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center space-y-5">
                <div className="relative w-[120px] h-[120px] rounded-3xl bg-background border border-surface-border flex items-center justify-center shadow-xl shadow-emerald-500/5 hover:-translate-y-2 transition-transform z-10">
                  <CheckCircle className="w-12 h-12 text-emerald-400" />
                  <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center">3</span>
                </div>
                <h3 className="text-xl font-bold">Get Paid</h3>
                <p className="text-text-primary font-medium max-w-xs">AI sends escalating reminders on schedule. When they pay, all pending reminders cancel instantly.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── FEATURE GRID ───────── */}
        <section id="features" className="py-24 bg-background">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl lg:text-4xl font-bold text-text-primary">What&apos;s actually built into this.</h2>
              <p className="text-text-primary font-medium text-lg">Every feature listed below is live and functional. No roadmap items.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

              {/* Feature 1: AI-Generated Messages */}
              <div className="p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group bg-green-50 border border-green-100">
                <div className="w-14 h-14 bg-green-500/20 text-green-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Mail className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">AI-Written Reminders</h3>
                <p className="text-text-primary font-medium leading-relaxed">
                  Gemini generates unique, context-aware emails for each reminder stage. Three tones — Friendly, Professional, and Firm — escalate automatically. Falls back to battle-tested templates if the LLM is unavailable.
                </p>
              </div>

              {/* Feature 2: Multi-Channel */}
              <div className="p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group bg-amber-50 border border-amber-100">
                <div className="w-14 h-14 bg-amber-500/20 text-amber-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Email + SMS Delivery</h3>
                <p className="text-text-primary font-medium leading-relaxed">
                  Send via Email, SMS, or both simultaneously. Email uses Google OAuth (from your real inbox) or system SMTP. SMS runs through Twilio — your own account or ours as fallback.
                </p>
              </div>

              {/* Feature 3: Gmail Identity */}
              <div className="p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group bg-emerald-50 border border-emerald-100">
                <div className="w-14 h-14 bg-emerald-500/20 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Shield className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Send from Your Gmail</h3>
                <p className="text-text-primary font-medium leading-relaxed">
                  Connect Google OAuth and reminders come from your actual email address — not &quot;noreply@bot.com&quot;. Encrypted token storage with automatic refresh. Shows up in your Sent folder.
                </p>
              </div>

              {/* Feature 4: AI Invoice Parsing */}
              <div className="p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group bg-purple-50 border border-purple-100">
                <div className="w-14 h-14 bg-purple-500/20 text-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <FileUp className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Upload PDF or CSV</h3>
                <p className="text-text-primary font-medium leading-relaxed">
                  Drop a PDF invoice or CSV billing export. Gemini extracts client name, email, amount, and due date with a confidence score. Review and confirm before saving.
                </p>
              </div>

              {/* Feature 5: Risk Scoring */}
              <div className="p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group bg-red-50 border border-red-100">
                <div className="w-14 h-14 bg-red-500/20 text-red-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Risk Scoring per Invoice</h3>
                <p className="text-text-primary font-medium leading-relaxed">
                  Each invoice gets a weighted risk score based on overdue duration, client payment history, invoice amount, and reminder engagement (opens & clicks). Low / Medium / High ratings displayed in dashboard.
                </p>
              </div>

              {/* Feature 6: Event Tracking */}
              <div className="p-8 rounded-3xl hover:-translate-y-2 transition-transform duration-300 group bg-cyan-50 border border-cyan-100">
                <div className="w-14 h-14 bg-cyan-500/20 text-cyan-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Eye className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-3">Open & Click Tracking</h3>
                <p className="text-text-primary font-medium leading-relaxed">
                  Tracking pixel detects when a client opens your reminder email. Payment link clicks are logged per invoice. See exactly who is ignoring you and who is engaging.
                </p>
              </div>

            </div>
          </div>
        </section>



        {/* ───────── CTA ───────── */}
        <section className="py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-primary-900/40 to-background" />
          <div className="relative max-w-4xl mx-auto px-6 text-center space-y-8">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">Stop writing &quot;just following up&quot; emails.</h2>
            <p className="text-xl text-text-primary font-medium max-w-2xl mx-auto">Create your first invoice. The AI handles everything after that.</p>
            <Link href="/register" className="inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold text-lg hover:scale-105 transition-transform shadow-2xl shadow-primary-500/20">
              Create Free Account <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

      </main>

      {/* ───────── FOOTER ───────── */}
      <footer className="border-t border-surface-border bg-surface-base py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="text-lg font-bold text-text-primary flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              Invoice Chaser
            </div>
            <span className="text-sm text-text-muted">© {new Date().getFullYear()} Invoice Chaser. All rights reserved.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
            <Link href="/privacy" className="hover:text-primary-400 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-primary-400 transition-colors">Terms of Service</Link>
            <Link href="mailto:support@invoicechaser.app" className="hover:text-primary-400 transition-colors">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
