/* Mockup helpers shared by both decks. Colors mirror the actual app's
   styles.css so the slides look like a stylized capture of the live UI. */

const PALETTES = {
  scientist: {
    pageBg: "0B1120",
    railFill: "10B981",
    railText: "022C22",
    panelBg: "0F172A",
    cardBg: "1E293B",
    cardBorder: "334155",
    laneBorder: "334155",
    titleText: "F8FAFC",
    bodyText: "E2E8F0",
    mutedText: "94A3B8",
    primaryBtn: "2563EB",
    primaryBtnText: "FFFFFF",
    accent: "10B981",
    accentSoft: "064E3B",
    okDot: "4ADE80",
    warnDot: "FACC15",
    dangerDot: "F87171",
    pillPlanned: "1D3A8A",
    pillPlannedText: "BFDBFE",
    pillInProgress: "713F12",
    pillInProgressText: "FEF08A",
    pillCompleted: "14532D",
    pillCompletedText: "BBF7D0",
    pillBlocked: "7F1D1D",
    pillBlockedText: "FECACA",
  },
  manager: {
    pageBg: "0B1120",
    railFill: "3B82F6",
    railText: "0B1120",
    panelBg: "0F172A",
    cardBg: "1E293B",
    cardBorder: "334155",
    laneBorder: "334155",
    titleText: "F8FAFC",
    bodyText: "E2E8F0",
    mutedText: "94A3B8",
    primaryBtn: "2563EB",
    primaryBtnText: "FFFFFF",
    accent: "3B82F6",
    accentSoft: "1E3A8A",
    okDot: "4ADE80",
    warnDot: "FACC15",
    dangerDot: "F87171",
    pillPlanned: "1D3A8A",
    pillPlannedText: "BFDBFE",
    pillInProgress: "713F12",
    pillInProgressText: "FEF08A",
    pillCompleted: "14532D",
    pillCompletedText: "BBF7D0",
    pillBlocked: "7F1D1D",
    pillBlockedText: "FECACA",
  },
};

const FONTS = {
  title: "Calibri",
  body: "Calibri",
  mono: "Consolas",
};

function theme(role) {
  return PALETTES[role];
}

function setupPres(pres, role) {
  pres.layout = "LAYOUT_WIDE"; // 13.33" x 7.5"
  pres.author = "Lab Workflow";
  pres.title =
    role === "scientist"
      ? "Lab Workflow for Researchers"
      : "Lab Workflow for Managers";
}

function addSlideFrame(pres, slide, t, opts = {}) {
  slide.background = { color: t.pageBg };
  // Left accent rail
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 0.18,
    h: 7.5,
    fill: { color: t.accent },
    line: { color: t.accent, width: 0 },
  });
  // Footer hairline (very subtle)
  if (!opts.titleSlide) {
    slide.addShape(pres.shapes.RECTANGLE, {
      x: 0.6,
      y: 7.18,
      w: 12.13,
      h: 0.01,
      fill: { color: t.cardBorder },
      line: { color: t.cardBorder, width: 0 },
    });
    slide.addText(opts.footerLeft || "", {
      x: 0.6,
      y: 7.22,
      w: 8,
      h: 0.22,
      fontSize: 9,
      fontFace: FONTS.body,
      color: t.mutedText,
      margin: 0,
    });
    if (opts.footerRight !== undefined) {
      slide.addText(opts.footerRight, {
        x: 8.6,
        y: 7.22,
        w: 4.13,
        h: 0.22,
        fontSize: 9,
        fontFace: FONTS.body,
        color: t.mutedText,
        align: "right",
        margin: 0,
      });
    }
  }
}

function addSlideTitle(slide, text, t, kicker) {
  if (kicker) {
    slide.addText(kicker.toUpperCase(), {
      x: 0.6,
      y: 0.45,
      w: 12,
      h: 0.3,
      fontSize: 11,
      fontFace: FONTS.body,
      color: t.accent,
      bold: true,
      charSpacing: 4,
      margin: 0,
    });
  }
  slide.addText(text, {
    x: 0.6,
    y: kicker ? 0.78 : 0.55,
    w: 12,
    h: 0.7,
    fontSize: 32,
    fontFace: FONTS.title,
    color: t.titleText,
    bold: true,
    margin: 0,
  });
}

function addBodyText(slide, lines, x, y, w, h, t, fontSize = 14) {
  const arr = lines.map((line, i) => ({
    text: line,
    options: {
      bullet: { code: "25CF" },
      paraSpaceAfter: 6,
      breakLine: i < lines.length - 1,
    },
  }));
  slide.addText(arr, {
    x,
    y,
    w,
    h,
    fontSize,
    fontFace: FONTS.body,
    color: t.bodyText,
    valign: "top",
    margin: 0,
  });
}

/* ============== App-shaped mockup primitives ============== */

function panel(pres, slide, x, y, w, h, t) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: t.panelBg },
    line: { color: t.cardBorder, width: 1 },
    rectRadius: 0.12,
  });
}

function card(pres, slide, x, y, w, h, t) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: t.cardBg },
    line: { color: t.cardBorder, width: 1 },
    rectRadius: 0.1,
  });
}

function pill(pres, slide, text, x, y, w, fillColor, textColor) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h: 0.28,
    fill: { color: fillColor },
    line: { color: fillColor, width: 0 },
    rectRadius: 0.14,
  });
  slide.addText(text, {
    x,
    y,
    w,
    h: 0.28,
    fontSize: 9,
    fontFace: FONTS.body,
    color: textColor,
    bold: true,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

function complianceDot(pres, slide, x, y, color) {
  slide.addShape(pres.shapes.OVAL, {
    x,
    y,
    w: 0.18,
    h: 0.18,
    fill: { color },
    line: { color, width: 0 },
  });
  slide.addShape(pres.shapes.OVAL, {
    x: x - 0.05,
    y: y - 0.05,
    w: 0.28,
    h: 0.28,
    fill: { color, transparency: 80 },
    line: { color, width: 0 },
  });
}

function statusPillFor(pres, slide, status, x, y, t) {
  const map = {
    planned: { fill: t.pillPlanned, text: t.pillPlannedText, label: "Planned" },
    inProgress: {
      fill: t.pillInProgress,
      text: t.pillInProgressText,
      label: "In Progress",
    },
    completed: {
      fill: t.pillCompleted,
      text: t.pillCompletedText,
      label: "Completed",
    },
    blocked: { fill: t.pillBlocked, text: t.pillBlockedText, label: "Blocked" },
  };
  const m = map[status];
  pill(pres, slide, m.label, x, y, 0.95, m.fill, m.text);
}

function taskCard(pres, slide, x, y, w, t, data) {
  const h = data.showLabMember ? 1.55 : 1.35;
  card(pres, slide, x, y, w, h, t);
  const padX = 0.12;
  // Header row: dot + status pill
  complianceDot(pres, slide, x + padX, y + 0.13, data.dotColor);
  statusPillFor(pres, slide, data.status, x + w - padX - 0.95, y + 0.1, t);
  // Title
  slide.addText(data.title, {
    x: x + padX,
    y: y + 0.36,
    w: w - 2 * padX,
    h: 0.28,
    fontSize: 11.5,
    bold: true,
    fontFace: FONTS.body,
    color: t.titleText,
    margin: 0,
  });
  // Project subtitle
  slide.addText(data.project, {
    x: x + padX,
    y: y + 0.62,
    w: w - 2 * padX,
    h: 0.22,
    fontSize: 9.5,
    fontFace: FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  let metaY = y + 0.86;
  if (data.showLabMember && data.labMember) {
    slide.addText(data.labMember, {
      x: x + padX,
      y: metaY,
      w: w - 2 * padX,
      h: 0.22,
      fontSize: 9,
      fontFace: FONTS.body,
      color: "93C5FD",
      margin: 0,
    });
    metaY += 0.22;
  }
  // Meta row: Start | End | Estimate
  const colW = (w - 2 * padX) / 3;
  const labels = ["Start", "End", "Est"];
  const values = [data.start, data.end, data.estimate];
  for (let i = 0; i < 3; i += 1) {
    slide.addText(labels[i], {
      x: x + padX + i * colW,
      y: metaY,
      w: colW,
      h: 0.18,
      fontSize: 7.5,
      fontFace: FONTS.body,
      color: t.mutedText,
      margin: 0,
    });
    slide.addText(values[i], {
      x: x + padX + i * colW,
      y: metaY + 0.16,
      w: colW,
      h: 0.2,
      fontSize: 9,
      fontFace: FONTS.body,
      color: t.bodyText,
      margin: 0,
    });
  }
  return h;
}

function lane(pres, slide, x, y, w, h, t, label, count, accentColor, cards) {
  const borderColor = accentColor || t.laneBorder;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: "020617" },
    line: { color: borderColor, width: 1 },
    rectRadius: 0.12,
  });
  // Header row
  slide.addText(label, {
    x: x + 0.15,
    y: y + 0.1,
    w: w - 0.6,
    h: 0.28,
    fontSize: 12,
    bold: true,
    fontFace: FONTS.body,
    color: t.titleText,
    margin: 0,
  });
  // Count badge
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x + w - 0.5,
    y: y + 0.1,
    w: 0.4,
    h: 0.26,
    fill: { color: "1E293B" },
    line: { color: "334155", width: 0.5 },
    rectRadius: 0.13,
  });
  slide.addText(String(count), {
    x: x + w - 0.5,
    y: y + 0.1,
    w: 0.4,
    h: 0.26,
    fontSize: 10,
    fontFace: FONTS.body,
    color: t.bodyText,
    align: "center",
    valign: "middle",
    margin: 0,
  });
  // Cards stacked
  let cy = y + 0.5;
  for (const c of cards || []) {
    const ch = taskCard(pres, slide, x + 0.12, cy, w - 0.24, t, c);
    cy += ch + 0.12;
  }
}

function metricCard(pres, slide, x, y, w, h, t, label, value, tone) {
  const borderColor =
    tone === "danger"
      ? "F87171"
      : tone === "success"
        ? "4ADE80"
        : t.cardBorder;
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h,
    fill: { color: t.cardBg },
    line: { color: borderColor, width: 1 },
    rectRadius: 0.1,
  });
  slide.addText(label, {
    x: x + 0.18,
    y: y + 0.12,
    w: w - 0.36,
    h: 0.28,
    fontSize: 11,
    fontFace: FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  slide.addText(String(value), {
    x: x + 0.18,
    y: y + 0.4,
    w: w - 0.36,
    h: 0.55,
    fontSize: 30,
    bold: true,
    fontFace: FONTS.title,
    color: t.titleText,
    margin: 0,
  });
}

function tab(pres, slide, x, y, label, active, t) {
  const w = Math.max(1.0, label.length * 0.085 + 0.5);
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h: 0.34,
    fill: {
      color: active ? "1E3A8A" : "1E293B",
    },
    line: {
      color: active ? "60A5FA" : "334155",
      width: active ? 1 : 0.5,
    },
    rectRadius: 0.17,
  });
  slide.addText(label, {
    x,
    y,
    w,
    h: 0.34,
    fontSize: 10,
    fontFace: FONTS.body,
    color: t.titleText,
    align: "center",
    valign: "middle",
    margin: 0,
  });
  return w;
}

function appTopBar(pres, slide, x, y, w, t, title, sub, chipLabels) {
  slide.addText(title, {
    x,
    y,
    w: w - 3.5,
    h: 0.34,
    fontSize: 16,
    bold: true,
    fontFace: FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  if (sub) {
    slide.addText(sub, {
      x,
      y: y + 0.34,
      w: w - 3.5,
      h: 0.22,
      fontSize: 9.5,
      fontFace: FONTS.body,
      color: t.mutedText,
      margin: 0,
    });
  }
  // Right side action chips
  const chipY = y + 0.05;
  const defaultLabels = ["alex@lab.edu", "Setup", "Sign out"];
  const labels = chipLabels ?? defaultLabels;
  const chips = labels.map((label, index) => ({
    label,
    primary: index === labels.length - 1,
  }));
  let cx = x + w;
  for (let i = chips.length - 1; i >= 0; i -= 1) {
    const c = chips[i];
    const cw = c.label.length * 0.075 + 0.4;
    cx -= cw + 0.12;
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: cx,
      y: chipY,
      w: cw,
      h: 0.32,
      fill: { color: c.primary ? "1E3A8A" : "0F172A" },
      line: { color: "334155", width: 0.5 },
      rectRadius: 0.16,
    });
    slide.addText(c.label, {
      x: cx,
      y: chipY,
      w: cw,
      h: 0.32,
      fontSize: 9,
      fontFace: FONTS.body,
      color: t.bodyText,
      align: "center",
      valign: "middle",
      margin: 0,
    });
  }
}

function field(pres, slide, label, placeholder, x, y, w, t) {
  slide.addText(label, {
    x,
    y,
    w,
    h: 0.22,
    fontSize: 10,
    fontFace: FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y: y + 0.24,
    w,
    h: 0.42,
    fill: { color: "020617" },
    line: { color: "334155", width: 0.75 },
    rectRadius: 0.08,
  });
  slide.addText(placeholder, {
    x: x + 0.12,
    y: y + 0.24,
    w: w - 0.24,
    h: 0.42,
    fontSize: 10,
    fontFace: FONTS.body,
    color: t.mutedText,
    italic: true,
    valign: "middle",
    margin: 0,
  });
}

function primaryButton(pres, slide, label, x, y, w, t) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h: 0.42,
    fill: { color: t.primaryBtn },
    line: { color: t.primaryBtn, width: 0 },
    rectRadius: 0.1,
  });
  slide.addText(label, {
    x,
    y,
    w,
    h: 0.42,
    fontSize: 11,
    bold: true,
    fontFace: FONTS.body,
    color: t.primaryBtnText,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

function secondaryButton(pres, slide, label, x, y, w, t) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w,
    h: 0.42,
    fill: { color: "1E293B" },
    line: { color: "334155", width: 0.75 },
    rectRadius: 0.1,
  });
  slide.addText(label, {
    x,
    y,
    w,
    h: 0.42,
    fontSize: 11,
    fontFace: FONTS.body,
    color: t.bodyText,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

function annotationCallout(pres, slide, x, y, w, h, t, text, opts = {}) {
  // Numbered circle + line + label box
  const num = opts.number;
  if (num !== undefined) {
    slide.addShape(pres.shapes.OVAL, {
      x,
      y,
      w: 0.32,
      h: 0.32,
      fill: { color: t.accent },
      line: { color: t.accent, width: 0 },
    });
    slide.addText(String(num), {
      x,
      y,
      w: 0.32,
      h: 0.32,
      fontSize: 12,
      bold: true,
      fontFace: FONTS.body,
      color: "0B1120",
      align: "center",
      valign: "middle",
      margin: 0,
    });
  }
  slide.addText(text, {
    x: num !== undefined ? x + 0.42 : x,
    y,
    w: num !== undefined ? w - 0.42 : w,
    h,
    fontSize: 11,
    fontFace: FONTS.body,
    color: t.bodyText,
    valign: "top",
    margin: 0,
  });
}

function connector(pres, slide, x1, y1, x2, y2, t, color) {
  slide.addShape(pres.shapes.LINE, {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    flipH: x2 < x1,
    flipV: y2 < y1,
    line: {
      color: color || t.accent,
      width: 1.25,
      dashType: "dash",
      endArrowType: "triangle",
    },
  });
}

module.exports = {
  PALETTES,
  FONTS,
  theme,
  setupPres,
  addSlideFrame,
  addSlideTitle,
  addBodyText,
  panel,
  card,
  pill,
  statusPillFor,
  complianceDot,
  taskCard,
  lane,
  metricCard,
  tab,
  appTopBar,
  field,
  primaryButton,
  secondaryButton,
  annotationCallout,
  connector,
};
