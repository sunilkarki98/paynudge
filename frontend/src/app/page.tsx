'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import {
  Shield,
  FileUp,
  AlertTriangle,
  ArrowRight,
  Inbox,
  Zap,
  Clock,
  CheckCircle,
  Eye,
  Smartphone,
  Send,
} from 'lucide-react'

export default function LandingPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard')
    }
  }, [user, isLoading, router])

  // #region agent log
  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search)
    const err = q.get('error')
    const code = q.get('error_code')
    const desc = q.get('error_description')
    const hash = window.location.hash || ''
    const hasAuthErr = Boolean(err || hash.includes('error='))
    if (!hasAuthErr) return
    fetch('http://127.0.0.1:7359/ingest/3b0c2916-fdb5-45b8-9836-ac0638fd59ae', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '964b3b' },
      body: JSON.stringify({
        sessionId: '964b3b',
        runId: 'landing-oauth-return',
        hypothesisId: 'H-flow',
        location: 'frontend/src/app/page.tsx',
        message: 'Landing URL carried auth error params',
        data: {
          error: err,
          error_code: code,
          error_description: desc,
          hashHasError: hash.includes('error='),
          hashLen: hash.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => { })
  }, [])
  // #endregion

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
            <a href="#features" className="hidden sm:block text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
              Features
            </a>
            <a href="#pricing" className="hidden sm:block text-sm font-medium text-text-secondary hover:text-text-primary transition-colors">
              Pricing
            </a>
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
        <section className="relative pt-40 pb-6 lg:pt-56 lg:pb-8 px-6">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none" />
          <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
            <div className="inline-flex items-center px-4 py-2 rounded-full glass-card border border-primary-500/30 text-primary-400 text-sm font-medium mb-4">
              <Zap className="w-4 h-4 mr-2" />
              Behavioral Payment Intelligence
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Get paid faster without<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">
                the awkward follow-ups.
              </span>
            </h1>
            <p className="text-lg lg:text-xl text-text-primary max-w-2xl mx-auto leading-relaxed font-medium">
              Stop manually chasing clients. Our AI analyzes payment behavior and deploys perfectly-toned reminders via your own Gmail and SMS until you get paid—protecting your client relationships while securing your cashflow.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up">
              <Link
                href="/register"
                className="px-8 py-4 rounded-2xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold text-lg hover:shadow-2xl hover:shadow-primary-500/30 transition-all hover:-translate-y-1 w-full sm:w-auto text-center"
              >
                Start Free Trial
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto px-8 py-4 rounded-2xl glass-card font-medium text-text-primary hover:bg-surface-raised transition-all">
                See how it works ↓
              </a>
            </div>
            <p className="text-sm text-text-muted font-medium">
              7-Day Free Trial. No credit card required.
            </p>
          </div>
        </section>


        {/* ───────── HOW IT WORKS ───────── */}
        <section id="how-it-works" className="pt-10 pb-16 lg:pt-12 bg-surface-base border-y border-surface-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
              <h2 className="text-3xl lg:text-4xl font-bold text-text-primary">Three steps. Then it runs itself.</h2>
              <p className="text-text-primary font-medium text-lg">No integrations to configure. No templates to write. Just invoices in, money out.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {/* Connector line */}
              <div className="hidden md:block absolute top-[40px] left-[16.66%] right-[16.66%] h-[2px] bg-gradient-to-r from-primary-500/40 via-accent-500/40 to-emerald-500/40" />

              {/* Step 1 */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative w-20 h-20 rounded-2xl bg-background border border-surface-border flex items-center justify-center shadow-xl shadow-primary-500/5 hover:-translate-y-2 transition-transform z-10">
                  <Inbox className="w-8 h-8 text-primary-400" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary-500 text-white text-sm font-bold flex items-center justify-center">1</span>
                </div>
                <h3 className="text-xl font-bold">Create Invoice</h3>
                <p className="text-text-primary font-medium max-w-xs">Add your client, amount, and due date. Or upload a PDF/CSV and let AI extract the details automatically.</p>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative w-20 h-20 rounded-2xl bg-background border border-surface-border flex items-center justify-center shadow-xl shadow-accent-500/5 hover:-translate-y-2 transition-transform z-10">
                  <Clock className="w-8 h-8 text-accent-400" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-accent-500 text-white text-sm font-bold flex items-center justify-center">2</span>
                </div>
                <h3 className="text-xl font-bold">Set Your Rules</h3>
                <p className="text-text-primary font-medium max-w-xs">Choose a reminder tone (Friendly, Professional, or Firm), escalation speed, and contact channels per client.</p>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative w-20 h-20 rounded-2xl bg-background border border-surface-border flex items-center justify-center shadow-xl shadow-emerald-500/5 hover:-translate-y-2 transition-transform z-10">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                  <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-emerald-500 text-white text-sm font-bold flex items-center justify-center">3</span>
                </div>
                <h3 className="text-xl font-bold">Get Paid</h3>
                <p className="text-text-primary font-medium max-w-xs">AI deploys strategic nudges on schedule. When they pay, all pending nudges cancel instantly.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── FEATURE GRID ───────── */}
        <section id="features" className="py-16 bg-background">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
              <h2 className="text-3xl lg:text-4xl font-bold text-text-primary">What&apos;s actually built into this.</h2>
              <p className="text-text-primary font-medium text-lg">Every feature listed below is live and functional. No roadmap items.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

              {/* Feature 1: AI-Generated Messages */}
              <div className="glass-card p-6 rounded-3xl hover:-translate-y-2 transition-all duration-300 group shadow-lg hover:shadow-primary-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md">
                  <Zap className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Behavioral Nudges</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed">
                  Stop writing awkward follow-ups. Our AI drafts strategic, perfectly timed nudges based on client payment behavior.
                </p>
              </div>

              {/* Feature 2: Multi-Channel */}
              <div className="glass-card p-6 rounded-3xl hover:-translate-y-2 transition-all duration-300 group shadow-lg hover:shadow-accent-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-accent-400 to-accent-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-md">
                  <Send className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Email + SMS Delivery</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed">
                  Reach clients where they actually look. Ping them via Email, drop a quick SMS, or both. Use your own Twilio account or rely on ours.
                </p>
              </div>

              {/* Feature 3: Gmail Identity */}
              <div className="glass-card p-6 rounded-3xl hover:-translate-y-2 transition-all duration-300 group shadow-lg hover:shadow-emerald-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Professional Shield System</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed">
                  No more landing in spam as "noreply@bot.com". Link Google OAuth and send nudges straight from your real inbox, protecting your relationship.
                </p>
              </div>

              {/* Feature 4: AI Invoice Parsing */}
              <div className="glass-card p-6 rounded-3xl hover:-translate-y-2 transition-all duration-300 group shadow-lg hover:shadow-purple-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-md">
                  <FileUp className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Upload PDF or CSV</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed">
                  Got a messy PDF? Just drag and drop it. Our AI instantly scans and pulls out the client name, amount, and due date.
                </p>
              </div>

              {/* Feature 5: Risk Scoring */}
              <div className="glass-card p-6 rounded-3xl hover:-translate-y-2 transition-all duration-300 group shadow-lg hover:shadow-red-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-red-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:rotate-3 transition-transform shadow-md">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Risk Scoring per Invoice</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed">
                  Know who's going to ghost you before they do. We crunch payment history and open rates to flag High Risk invoices for you.
                </p>
              </div>

              {/* Feature 6: Event Tracking */}
              <div className="glass-card p-6 rounded-3xl hover:-translate-y-2 transition-all duration-300 group shadow-lg hover:shadow-cyan-500/10">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-cyan-600 text-white rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 group-hover:-rotate-3 transition-transform shadow-md">
                  <Eye className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-text-primary mb-2">Open & Click Tracking</h3>
                <p className="text-text-secondary text-sm font-medium leading-relaxed">
                  Stop wondering if they saw it. Invisible tracking pixels tell you exactly when a client opens your nudge or clicks the link.
                </p>
              </div>

            </div>
          </div>
        </section>



        {/* ───────── PRICING ───────── */}
        <section id="pricing" className="py-16 bg-surface-base border-y border-surface-border">
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto mb-12 space-y-4">
              <h2 className="text-3xl lg:text-4xl font-bold text-text-primary">Simple pricing. Start free.</h2>
              <p className="text-text-secondary font-medium text-lg">No surprise fees. Upgrade when you&apos;re ready.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
              {/* FAQ Section */}
              {/* Free Trial */}
              <div className="glass-card p-8 rounded-3xl hover:-translate-y-1 transition-transform">
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-text-primary">7-Day Free Trial</h3>
                  <p className="text-text-secondary text-sm mt-1">Full access to try it out</p>
                </div>
                <div className="mb-8">
                  <span className="text-4xl font-bold text-text-primary">$0</span>
                  <span className="text-text-muted text-sm ml-1">for 7 days</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['Unlimited invoices', 'Behavioral intelligence engine', 'Email & SMS delivery', 'Invoice PDF upload', 'Risk scoring', 'Payment link tracking'].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-text-secondary font-medium">
                      <CheckCircle className="w-4 h-4 text-primary-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block w-full text-center py-3 rounded-xl border border-surface-border font-semibold text-text-primary hover:bg-surface-raised transition-colors shadow-sm">
                  Start Free Trial
                </Link>
              </div>

              {/* Pro Plan */}
              <div className="relative glass-card p-8 rounded-3xl border-2 border-primary-500 shadow-xl shadow-primary-500/15 hover:-translate-y-1 transition-transform">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary-500 to-accent-500 rounded-full text-white text-xs font-bold uppercase tracking-wider shadow-md">
                  Most Popular
                </div>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-text-primary">Pro</h3>
                  <p className="text-text-secondary text-sm mt-1">For serious freelancers & agencies</p>
                </div>
                <div className="mb-8">
                  <span className="text-4xl font-bold text-text-primary">$19</span>
                  <span className="text-text-muted text-sm ml-1">/month</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {['Unlimited invoices', 'Full Behavioral Intelligence', 'Connect your Twilio (SMS/WA)', 'Chase-until-paid automation', 'Custom reminder intervals', 'Priority support'].map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-text-secondary font-medium">
                      <CheckCircle className="w-4 h-4 text-primary-500 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block w-full text-center py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold hover:shadow-lg hover:shadow-primary-500/25 transition-all">
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ───────── CTA ───────── */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-primary-900/40 to-background" />
          <div className="relative max-w-4xl mx-auto px-6 text-center space-y-8">
            <h2 className="text-4xl lg:text-5xl font-bold text-white">Stop writing &quot;just following up&quot; emails.</h2>
            <p className="text-xl text-text-primary font-medium max-w-2xl mx-auto">Create your first invoice. The AI handles everything after that.</p>
            <Link href="/register" className="inline-flex items-center gap-2 px-10 py-5 rounded-2xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold text-lg hover:scale-105 transition-transform shadow-2xl shadow-primary-500/20">
              Create Free Account <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        {/* ───────── TRUST STRIP ───────── */}
        <section className="py-12 border-t border-surface-border bg-surface-base">
          <div className="max-w-4xl mx-auto px-6">
            <p className="text-center text-sm font-medium text-text-muted mb-8 uppercase tracking-wider">Powered by tools you trust</p>
            <div className="flex flex-wrap items-center justify-center gap-10 sm:gap-16">
              {/* Google / Gmail */}
              <div className="flex items-center gap-2.5 text-text-secondary hover:text-text-primary transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-sm font-semibold">Gmail</span>
              </div>
              {/* Twilio */}
              <div className="flex items-center gap-2.5 text-text-secondary hover:text-text-primary transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 20.4a8.4 8.4 0 110-16.8 8.4 8.4 0 010 16.8zm-2.4-11.4a1.8 1.8 0 113.6 0 1.8 1.8 0 01-3.6 0zm4.8 0a1.8 1.8 0 113.6 0 1.8 1.8 0 01-3.6 0zm-4.8 4.8a1.8 1.8 0 113.6 0 1.8 1.8 0 01-3.6 0zm4.8 0a1.8 1.8 0 113.6 0 1.8 1.8 0 01-3.6 0z" />
                </svg>
                <span className="text-sm font-semibold">Twilio</span>
              </div>
              {/* Gemini AI */}
              <div className="flex items-center gap-2.5 text-text-secondary hover:text-text-primary transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L1 12l11 10 11-10L12 2zm0 3.27L19.18 12 12 18.73 4.82 12 12 5.27z" />
                </svg>
                <span className="text-sm font-semibold">Gemini AI</span>
              </div>
              {/* Supabase */}
              <div className="flex items-center gap-2.5 text-text-secondary hover:text-text-primary transition-colors">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.7 21.64c-.4.5-1.2.14-1.18-.54l.18-7.1H4.17c-.57 0-.87-.7-.49-1.12L10.3 2.36c.4-.5 1.2-.14 1.18.54l-.18 7.1h8.53c.57 0 .87.7.49 1.12L13.7 21.64z" />
                </svg>
                <span className="text-sm font-semibold">Supabase</span>
              </div>
              {/* Encrypted */}
              <div className="flex items-center gap-2.5 text-text-secondary hover:text-text-primary transition-colors">
                <Shield className="w-5 h-5" />
                <span className="text-sm font-semibold">AES-256 Encrypted</span>
              </div>
            </div>
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
