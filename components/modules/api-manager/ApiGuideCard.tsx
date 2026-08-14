'use client'
import React from 'react'
import { ApiGuideItem } from './types'

interface ApiGuideCardProps {
  guide: ApiGuideItem
}

export const ApiGuideCard: React.FC<ApiGuideCardProps> = ({ guide }) => {
  return (
    <div
      className="p-5 rounded-2xl border transition-all duration-300 hover:shadow-md flex flex-col justify-between"
      style={{
        backgroundColor: 'var(--paper-card, #ffffff)',
        borderColor: 'var(--paper-border, #e2d9cd)',
      }}
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow-xs"
              style={{ backgroundColor: guide.color }}
            >
              <i className={`ti ${guide.icon} text-lg`} />
            </div>
            <div>
              <h4 className="font-semibold text-sm" style={{ color: 'var(--paper-ink, #2c1a0e)' }}>
                {guide.label}
              </h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                {guide.cost}
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs mb-4 leading-relaxed opacity-85" style={{ color: 'var(--paper-ink, #2c1a0e)' }}>
          {guide.usage}
        </p>

        <div className="space-y-1.5 mb-4 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-[10px] opacity-60">
            Passo a Passo:
          </span>
          {guide.steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-1.5 opacity-80">
              <span className="font-mono text-[10px] w-4 text-center font-bold opacity-50">
                {idx + 1}.
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <a
          href={guide.link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline mb-2"
          style={{ color: guide.color }}
        >
          {guide.linkLabel} <i className="ti ti-external-link text-xs" />
        </a>

        <div className="text-[10px] p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 opacity-90">
          💡 <strong>Dica:</strong> {guide.tip}
        </div>
      </div>
    </div>
  )
}
