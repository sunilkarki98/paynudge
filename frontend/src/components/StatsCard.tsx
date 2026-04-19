'use client'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  gradient: string
  trend?: { value: string; positive: boolean }
}

export default function StatsCard({ title, value, subtitle, icon, gradient, trend }: StatsCardProps) {
  return (
    <div className="glass-card rounded-2xl p-4 hover:scale-[1.05] transition-all duration-300 hover:shadow-xl group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs text-text-secondary font-medium line-clamp-1">{title}</p>
          <p className="text-2xl font-bold text-text-primary mt-1 tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-1" title={subtitle}>{subtitle}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 mt-1.5 text-[10px] font-medium ${trend.positive ? 'text-emerald-600' : 'text-red-600'}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={trend.positive ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
              </svg>
              {trend.value}
            </div>
          )}
        </div>
        <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br ${gradient} shadow-lg group-hover:scale-110 transition-transform duration-300 ml-2`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
