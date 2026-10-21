import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  LineController,
  BarController,
  DoughnutController
} from 'chart.js'
import { formatCompact, formatNumber } from './statistics'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  LineController,
  BarController,
  DoughnutController
)

export function chartPalette(theme) {
  return {
    primary: theme.accent,
    blue: '#5b8def',
    purple: '#9b83db',
    amber: '#d9a34f',
    teal: '#46b8b0',
    rose: '#df8290',
    text: theme.textSecondary,
    muted: theme.textMuted,
    grid: theme.border
  }
}

export function lineDataset(label, values, color, options = {}) {
  return {
    label,
    data: values,
    borderColor: color,
    borderWidth: 2.5,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHitRadius: 12,
    pointBackgroundColor: color,
    pointBorderColor: color,
    tension: 0.35,
    fill: false,
    backgroundColor(context) {
      const { ctx, chartArea } = context.chart
      if (!chartArea) return color + '16'
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
      gradient.addColorStop(0, color + '28')
      gradient.addColorStop(1, color + '01')
      return gradient
    },
    ...options
  }
}

export function chartOptions(theme, options = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350 },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 12, right: 12 } },
    plugins: {
      datalabels: { display: false },
      legend: { display: false },
      tooltip: {
        backgroundColor: theme.bgFloat,
        titleColor: theme.text,
        bodyColor: theme.textSecondary,
        borderColor: theme.border,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        boxPadding: 5,
        usePointStyle: true,
        callbacks: {
          label: (item) => ` ${item.dataset.label}  ${formatNumber(item.parsed.y ?? item.parsed)}`
        }
      }
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: theme.textMuted,
          font: { size: 11 },
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 8,
          padding: 12
        }
      },
      y: {
        beginAtZero: true,
        border: { display: false, dash: [4, 5] },
        grid: { color: theme.border, drawTicks: false },
        ticks: {
          color: theme.textMuted,
          font: { size: 11 },
          padding: 12,
          maxTicksLimit: 5,
          precision: 0,
          callback: (value) => formatCompact(value)
        }
      }
    },
    ...options
  }
}
