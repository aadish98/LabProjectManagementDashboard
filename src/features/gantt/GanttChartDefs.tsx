interface GanttChartDefsProps {
  uid: string;
}

export function GanttChartDefs({ uid }: GanttChartDefsProps) {
  return (
    <defs>
      <linearGradient id={`gantt-grad-planned-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#908e86" />
        <stop offset="100%" stopColor="#7b796f" />
      </linearGradient>
      <linearGradient
        id={`gantt-grad-inProgress-${uid}`}
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop offset="0%" stopColor="#9fbcac" />
        <stop offset="100%" stopColor="#86a693" />
      </linearGradient>
      <linearGradient id={`gantt-grad-overdue-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c9917f" />
        <stop offset="100%" stopColor="#b47a6d" />
      </linearGradient>
      <linearGradient
        id={`gantt-grad-completed-${uid}`}
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop offset="0%" stopColor="#758d7e" />
        <stop offset="100%" stopColor="#61776b" />
      </linearGradient>
      <linearGradient id={`gantt-pane-shadow-${uid}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#000" stopOpacity="0.25" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </linearGradient>
      <pattern
        id={`gantt-open-pattern-${uid}`}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" fill="rgba(255,255,255,0.06)" />
        <rect width="3" height="6" fill="rgba(255,255,255,0)" />
      </pattern>
      <filter
        id={`gantt-bar-glow-${uid}`}
        x="-20%"
        y="-50%"
        width="140%"
        height="200%"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
        <feComposite in="blur" in2="SourceGraphic" operator="over" />
      </filter>
    </defs>
  );
}
