/* Builds: Manager-Dashboard.pptx
   Audience: managers (no coding context).
   Scope: functionality of the manager dashboard only. */

const pptxgen = require("pptxgenjs");
const L = require("./lib.cjs");

const pres = new pptxgen();
const t = L.theme("manager");
L.setupPres(pres, "manager");

const FOOT = "Lab Workflow · Manager functionality";

/* ---------- Slide 1: Title ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { titleSlide: true });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.4,
    y: 0,
    w: 4.93,
    h: 7.5,
    fill: { color: t.accentSoft },
    line: { color: t.accentSoft, width: 0 },
  });
  s.addShape(pres.shapes.RIGHT_TRIANGLE, {
    x: 8.4,
    y: 0,
    w: 4.93,
    h: 4.0,
    fill: { color: t.accent, transparency: 30 },
    line: { color: t.accent, width: 0 },
    flipH: true,
  });

  s.addText("LAB WORKFLOW", {
    x: 0.7,
    y: 1.6,
    w: 7.5,
    h: 0.4,
    fontSize: 14,
    fontFace: L.FONTS.body,
    color: t.accent,
    bold: true,
    charSpacing: 8,
    margin: 0,
  });
  s.addText("For managers", {
    x: 0.7,
    y: 2.05,
    w: 8,
    h: 1.2,
    fontSize: 50,
    fontFace: L.FONTS.title,
    color: t.titleText,
    bold: true,
    margin: 0,
  });
  s.addText("A single dashboard for lab-wide oversight — every active task log rolled up into one kanban, with metrics, rollups, and change tracking between refreshes.", {
    x: 0.7,
    y: 3.6,
    w: 7.4,
    h: 1.8,
    fontSize: 16,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });

  const ticks = [
    "All employees in one kanban view",
    "Filter by employee with reorderable tabs",
    "Assign new tasks to any lab member",
    "See exactly what changed since the last refresh",
  ];
  let ty = 5.4;
  for (const tick of ticks) {
    s.addShape(pres.shapes.OVAL, {
      x: 0.7,
      y: ty + 0.05,
      w: 0.18,
      h: 0.18,
      fill: { color: t.accent },
      line: { color: t.accent, width: 0 },
    });
    s.addText(tick, {
      x: 0.95,
      y: ty,
      w: 6.5,
      h: 0.3,
      fontSize: 13,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
    });
    ty += 0.36;
  }
}

/* ---------- Slide 2: The flow at a glance ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "01 / 10" });
  L.addSlideTitle(s, "The flow at a glance", t, "How you use the dashboard");

  const steps = [
    {
      n: 1,
      label: "Sign in",
      detail:
        "Sign in once with your Google account. The app auto-loads the admin spreadsheet and every active task log it points to.",
    },
    {
      n: 2,
      label: "Review",
      detail:
        "Scan the four metrics, the kanban, and the per-employee rollup cards to identify who needs attention.",
    },
    {
      n: 3,
      label: "Act",
      detail:
        "Filter to a single employee, add a task on their behalf, or open Setup to adjust configuration.",
    },
    {
      n: 4,
      label: "Track changes",
      detail:
        "Run summary records a snapshot. The next refresh shows added, removed, and updated tasks since.",
    },
  ];

  const stepW = 2.85;
  const stepGap = 0.25;
  const startX = 0.6;
  const stepY = 2.0;
  const stepH = 4.6;

  for (let i = 0; i < steps.length; i += 1) {
    const x = startX + i * (stepW + stepGap);
    L.card(pres, s, x, stepY, stepW, stepH, t);
    s.addShape(pres.shapes.OVAL, {
      x: x + (stepW - 0.9) / 2,
      y: stepY + 0.4,
      w: 0.9,
      h: 0.9,
      fill: { color: t.accent },
      line: { color: t.accent, width: 0 },
    });
    s.addText(String(steps[i].n), {
      x: x,
      y: stepY + 0.4,
      w: stepW,
      h: 0.9,
      fontSize: 28,
      bold: true,
      fontFace: L.FONTS.title,
      color: "0B1120",
      align: "center",
      valign: "middle",
      margin: 0,
    });
    s.addText(steps[i].label, {
      x: x + 0.2,
      y: stepY + 1.55,
      w: stepW - 0.4,
      h: 0.5,
      fontSize: 18,
      bold: true,
      fontFace: L.FONTS.title,
      color: t.titleText,
      align: "center",
      margin: 0,
    });
    s.addText(steps[i].detail, {
      x: x + 0.25,
      y: stepY + 2.15,
      w: stepW - 0.5,
      h: stepH - 2.3,
      fontSize: 12,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      align: "center",
      valign: "top",
      margin: 0,
    });
  }
}

/* ---------- Slide 3: Sign in & dashboard loads ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "02 / 10" });
  L.addSlideTitle(s, "Sign in and the dashboard loads itself", t, "Step 1");

  L.addBodyText(
    s,
    [
      "Sign in with the Google account on your manager allow-list.",
      "The app reads the admin spreadsheet (SheetRegistry, RunLog, Feedback, Roles).",
      "For every active row in SheetRegistry, the app pulls that employee's task log automatically.",
      "If a refresh fails, the dashboard falls back to the last successful snapshot with a sync warning — never a blank screen.",
      "The set of visible employees is driven entirely by SheetRegistry. Add or deactivate a row to add or hide an employee.",
    ],
    0.6,
    1.9,
    6.0,
    4.5,
    t,
    13.5,
  );

  // Right: load diagram
  const dx = 7.0;
  const dy = 1.95;
  const dw = 5.6;
  const dh = 4.7;
  L.panel(pres, s, dx, dy, dw, dh, t);
  s.addText("What loads when you sign in", {
    x: dx + 0.3,
    y: dy + 0.2,
    w: dw - 0.6,
    h: 0.4,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  // Admin sheet box
  L.card(pres, s, dx + 0.4, dy + 0.85, dw - 0.8, 0.9, t);
  s.addText("Admin spreadsheet", {
    x: dx + 0.55,
    y: dy + 0.95,
    w: dw - 1.1,
    h: 0.3,
    fontSize: 12,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  s.addText("SheetRegistry · RunLog · Feedback · Roles", {
    x: dx + 0.55,
    y: dy + 1.25,
    w: dw - 1.1,
    h: 0.3,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  // Arrow down
  s.addShape(pres.shapes.LINE, {
    x: dx + dw / 2,
    y: dy + 1.85,
    w: 0,
    h: 0.4,
    line: {
      color: t.accent,
      width: 1.5,
      endArrowType: "triangle",
    },
  });
  // Per-employee task logs
  const ttly = dy + 2.4;
  const empW = (dw - 0.8 - 0.4) / 3;
  ["Alex's task log", "Jamie's task log", "Pat's task log"].forEach((name, i) => {
    L.card(pres, s, dx + 0.4 + i * (empW + 0.2), ttly, empW, 1.2, t);
    s.addText(name, {
      x: dx + 0.5 + i * (empW + 0.2),
      y: ttly + 0.2,
      w: empW - 0.2,
      h: 0.3,
      fontSize: 11,
      bold: true,
      fontFace: L.FONTS.title,
      color: t.titleText,
      align: "center",
      margin: 0,
    });
    s.addText("Experiments tab", {
      x: dx + 0.5 + i * (empW + 0.2),
      y: ttly + 0.55,
      w: empW - 0.2,
      h: 0.3,
      fontSize: 9.5,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      align: "center",
      margin: 0,
    });
    s.addText("(read on every refresh)", {
      x: dx + 0.5 + i * (empW + 0.2),
      y: ttly + 0.78,
      w: empW - 0.2,
      h: 0.3,
      fontSize: 8,
      italic: true,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      align: "center",
      margin: 0,
    });
  });
  // Down arrow into kanban
  s.addShape(pres.shapes.LINE, {
    x: dx + dw / 2,
    y: dy + 3.7,
    w: 0,
    h: 0.4,
    line: {
      color: t.accent,
      width: 1.5,
      endArrowType: "triangle",
    },
  });
  // Final box: dashboard
  L.card(pres, s, dx + 0.4, dy + 4.25, dw - 0.8, 0.4, t);
  s.addText("Unified dashboard: metrics + kanban + rollups + change log", {
    x: dx + 0.55,
    y: dy + 4.27,
    w: dw - 1.1,
    h: 0.4,
    fontSize: 11,
    fontFace: L.FONTS.body,
    color: t.titleText,
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

/* ---------- Slide 4: Your dashboard at a glance ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "03 / 10" });
  L.addSlideTitle(s, "Your dashboard at a glance", t, "Step 2 · The full view");

  // Top bar
  L.appTopBar(
    pres,
    s,
    0.6,
    1.55,
    12.13,
    t,
    "Manager dashboard",
    "Source: Google Sheets · Last sync 2 minutes ago",
  );

  // Tabs row
  let tx = 0.6;
  const ty = 2.2;
  const tabs = [
    { label: "All employees", active: true },
    { label: "Alex Sharma", active: false },
    { label: "Jamie Lee", active: false },
    { label: "Pat Rivera", active: false },
    { label: "Morgan Chen", active: false },
  ];
  for (const tabSpec of tabs) {
    const w = L.tab(pres, s, tx, ty, tabSpec.label, tabSpec.active, t);
    tx += w + 0.12;
  }

  // Metrics row
  const my = 2.75;
  const mh = 1.0;
  const mGap = 0.18;
  const mW = (12.13 - 3 * mGap) / 4;
  L.metricCard(pres, s, 0.6, my, mW, mh, t, "Tasks in view", 24, "default");
  L.metricCard(
    pres,
    s,
    0.6 + mW + mGap,
    my,
    mW,
    mh,
    t,
    "Compliant",
    14,
    "success",
  );
  L.metricCard(
    pres,
    s,
    0.6 + 2 * (mW + mGap),
    my,
    mW,
    mh,
    t,
    "Overdue",
    3,
    "danger",
  );
  L.metricCard(
    pres,
    s,
    0.6 + 3 * (mW + mGap),
    my,
    mW,
    mh,
    t,
    "Missing closeout",
    4,
    "default",
  );

  // 4-lane kanban with lab member badges visible
  const laneY = 3.95;
  const laneH = 3.05;
  const totalW = 12.13;
  const gap = 0.18;
  const laneW = (totalW - 3 * gap) / 4;

  L.lane(pres, s, 0.6, laneY, laneW, laneH, t, "In Progress", 8, "FACC15", [
    {
      title: "Cell viability",
      project: "Project A",
      labMember: "Alex Sharma",
      showLabMember: true,
      status: "inProgress",
      dotColor: t.warnDot,
      start: "Apr 12",
      end: "Apr 22",
      estimate: "8h",
    },
  ]);
  L.lane(
    pres,
    s,
    0.6 + (laneW + gap),
    laneY,
    laneW,
    laneH,
    t,
    "Overdue",
    3,
    "F87171",
    [
      {
        title: "Western blot",
        project: "Project A",
        labMember: "Jamie Lee",
        showLabMember: true,
        status: "inProgress",
        dotColor: t.dangerDot,
        start: "Mar 30",
        end: "Apr 10",
        estimate: "4h",
      },
    ],
  );
  L.lane(
    pres,
    s,
    0.6 + 2 * (laneW + gap),
    laneY,
    laneW,
    laneH,
    t,
    "Planned",
    9,
    "60A5FA",
    [
      {
        title: "Reagent QC",
        project: "Project B",
        labMember: "Pat Rivera",
        showLabMember: true,
        status: "planned",
        dotColor: t.warnDot,
        start: "Apr 28",
        end: "May 2",
        estimate: "5h",
      },
    ],
  );
  L.lane(
    pres,
    s,
    0.6 + 3 * (laneW + gap),
    laneY,
    laneW,
    laneH,
    t,
    "Completed",
    4,
    "4ADE80",
    [
      {
        title: "Calibration",
        project: "Project A",
        labMember: "Alex Sharma",
        showLabMember: true,
        status: "completed",
        dotColor: t.okDot,
        start: "Apr 5",
        end: "Apr 8",
        estimate: "2h",
      },
    ],
  );
}

/* ---------- Slide 5: The four metrics explained ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "04 / 10" });
  L.addSlideTitle(s, "The four top-line metrics", t, "Reading the dashboard");

  const metrics = [
    {
      label: "Tasks in view",
      value: 24,
      tone: "default",
      desc:
        "Total tasks visible in the current scope. Drops when you filter to a single employee.",
    },
    {
      label: "Compliant",
      value: 14,
      tone: "success",
      desc:
        "Tasks with all required planning and closeout fields filled in for their current state.",
    },
    {
      label: "Overdue",
      value: 3,
      tone: "danger",
      desc:
        "Tasks past their projected end date that have not yet been completed or rescheduled.",
    },
    {
      label: "Missing closeout",
      value: 4,
      tone: "default",
      desc:
        "Tasks marked Completed but missing a result summary or a link to the final data.",
    },
  ];

  const cardW = 5.9;
  const cardH = 2.45;
  const xGap = 0.35;
  const yGap = 0.35;
  const startX = 0.6;
  const startY = 1.85;

  for (let i = 0; i < metrics.length; i += 1) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (cardW + xGap);
    const y = startY + row * (cardH + yGap);
    const m = metrics[i];

    L.metricCard(pres, s, x, y, cardW, 1.0, t, m.label, m.value, m.tone);
    L.card(pres, s, x, y + 1.05, cardW, cardH - 1.05, t);
    s.addText(m.desc, {
      x: x + 0.25,
      y: y + 1.2,
      w: cardW - 0.5,
      h: cardH - 1.3,
      fontSize: 13,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      valign: "top",
      margin: 0,
    });
  }
}

/* ---------- Slide 6: Filter by employee (reorderable tabs) ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "05 / 10" });
  L.addSlideTitle(s, "Filter by employee", t, "Reorderable tabs that remember themselves");

  L.addBodyText(
    s,
    [
      "All employees is the default — every visible task in one kanban.",
      "Click any name to filter the metrics, kanban, and rollup to just that person.",
      "Drag a tab to reorder. The order is saved per-device, so your dashboard opens the way you left it.",
      "New employees added to SheetRegistry appear automatically; deactivated employees disappear.",
      "Filter scope cascades: metrics, kanban lanes, rollup cards, and change log all narrow together.",
    ],
    0.6,
    1.9,
    6.0,
    4.5,
    t,
    13.5,
  );

  // Right: tabs visualization showing drag state
  const px = 7.0;
  const py = 1.95;
  const pw = 5.7;
  const ph = 4.7;
  L.panel(pres, s, px, py, pw, ph, t);
  s.addText("Tab strip", {
    x: px + 0.3,
    y: py + 0.2,
    w: pw - 0.6,
    h: 0.3,
    fontSize: 11.5,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.mutedText,
    margin: 0,
  });

  // First state - default order
  s.addText("Default", {
    x: px + 0.3,
    y: py + 0.65,
    w: pw - 0.6,
    h: 0.3,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    italic: true,
    margin: 0,
  });
  let ttx = px + 0.3;
  const tty1 = py + 1.0;
  for (const t1 of [
    { label: "All employees", active: true },
    { label: "Alex", active: false },
    { label: "Jamie", active: false },
    { label: "Pat", active: false },
    { label: "Morgan", active: false },
  ]) {
    const w = L.tab(pres, s, ttx, tty1, t1.label, t1.active, t);
    ttx += w + 0.12;
  }

  // Arrow indicating drag
  s.addText("Drag to reorder", {
    x: px + 0.3,
    y: py + 1.65,
    w: pw - 0.6,
    h: 0.3,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.accent,
    italic: true,
    margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: px + 0.5,
    y: py + 1.95,
    w: pw - 1.0,
    h: 0,
    line: {
      color: t.accent,
      width: 1.25,
      dashType: "dash",
      endArrowType: "triangle",
    },
  });

  // Second state - reordered & one selected
  s.addText("After reorder · viewing Pat only", {
    x: px + 0.3,
    y: py + 2.15,
    w: pw - 0.6,
    h: 0.3,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    italic: true,
    margin: 0,
  });
  let ttx2 = px + 0.3;
  const tty2 = py + 2.5;
  for (const t2 of [
    { label: "All employees", active: false },
    { label: "Pat", active: true },
    { label: "Alex", active: false },
    { label: "Morgan", active: false },
    { label: "Jamie", active: false },
  ]) {
    const w = L.tab(pres, s, ttx2, tty2, t2.label, t2.active, t);
    ttx2 += w + 0.12;
  }

  // Note callout
  L.card(pres, s, px + 0.3, py + 3.2, pw - 0.6, 1.3, t);
  s.addText("What changes when you click a tab", {
    x: px + 0.5,
    y: py + 3.32,
    w: pw - 1.0,
    h: 0.3,
    fontSize: 11,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  s.addText("Metrics recompute · kanban shows only that person's cards · rollup collapses to a single card · change log groups under their name.", {
    x: px + 0.5,
    y: py + 3.6,
    w: pw - 1.0,
    h: 0.85,
    fontSize: 11,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
}

/* ---------- Slide 7: Add a task for any lab member ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "06 / 10" });
  L.addSlideTitle(s, "Add a task for any lab member", t, "Manager-side assignment");

  // Left: explanation
  L.addBodyText(
    s,
    [
      "Click the + button in the bottom-right corner of the dashboard.",
      "Pick the employee from a dropdown sourced directly from your SheetRegistry.",
      "Fill in the same required fields a lab member would (Project, Experiment, Time estimate, Start, Projected end, Schematic, Link to data).",
      "On save, the task is written into that employee's task log — not yours.",
      "After save, your dashboard refreshes and the new card appears in the correct lane under that employee.",
    ],
    0.6,
    1.9,
    5.8,
    4.5,
    t,
    13.5,
  );

  // Right: Add task modal mockup
  const mx = 6.6;
  const my = 1.9;
  const mw = 6.1;
  const mh = 5.0;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("New task", {
    x: mx + 0.3,
    y: my + 0.2,
    w: 3,
    h: 0.4,
    fontSize: 16,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText("×", {
    x: mx + mw - 0.55,
    y: my + 0.15,
    w: 0.4,
    h: 0.4,
    fontSize: 22,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "right",
    margin: 0,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: mx + 0.3,
    y: my + 0.7,
    w: mw - 0.6,
    h: 0.01,
    fill: { color: t.cardBorder },
    line: { color: t.cardBorder, width: 0 },
  });

  // Assign-to dropdown row
  s.addText("Assign to", {
    x: mx + 0.3,
    y: my + 0.85,
    w: mw - 0.6,
    h: 0.22,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  // Dropdown shape
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: mx + 0.3,
    y: my + 1.1,
    w: mw - 0.6,
    h: 0.42,
    fill: { color: "020617" },
    line: { color: t.accent, width: 1.25 },
    rectRadius: 0.08,
  });
  s.addText("Pat Rivera", {
    x: mx + 0.42,
    y: my + 1.1,
    w: mw - 0.84,
    h: 0.42,
    fontSize: 11,
    bold: true,
    fontFace: L.FONTS.body,
    color: t.titleText,
    valign: "middle",
    margin: 0,
  });
  s.addText("▾", {
    x: mx + mw - 0.5,
    y: my + 1.1,
    w: 0.2,
    h: 0.42,
    fontSize: 11,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "right",
    valign: "middle",
    margin: 0,
  });
  s.addText("Sourced from SheetRegistry · only active employees appear here", {
    x: mx + 0.3,
    y: my + 1.6,
    w: mw - 0.6,
    h: 0.22,
    fontSize: 9,
    italic: true,
    fontFace: L.FONTS.body,
    color: t.accent,
    margin: 0,
  });

  // Smaller field grid
  const fy = my + 2.0;
  const fW = (mw - 0.9) / 2;
  L.field(pres, s, "Project", "Project B", mx + 0.3, fy, fW, t);
  L.field(pres, s, "Experiment", "Reagent QC", mx + 0.3 + fW + 0.3, fy, fW, t);
  L.field(pres, s, "Status", "Planned", mx + 0.3, fy + 0.85, fW, t);
  L.field(pres, s, "Time estimate", "5h", mx + 0.3 + fW + 0.3, fy + 0.85, fW, t);
  L.field(pres, s, "Projected end date", "2026-05-02", mx + 0.3, fy + 1.7, mw - 0.6, t);
  L.primaryButton(pres, s, "Add task", mx + 0.3, fy + 2.55, 1.5, t);
  L.secondaryButton(pres, s, "Cancel", mx + 1.95, fy + 2.55, 1.1, t);
}

/* ---------- Slide 8: Employee rollup cards ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "07 / 10" });
  L.addSlideTitle(s, "Employee rollup cards", t, "Per-person snapshot under the kanban");

  L.addBodyText(
    s,
    [
      "One card per visible employee, condensing their workload and compliance state.",
      "Each card shows total tasks, plus a count of compliant, flagged, and overdue.",
      "A short feedback snippet uses the most recent stored feedback if available, otherwise auto-generated text.",
      "Cards reflect the current scope — switch tabs and the rollup follows.",
      "Use this to scan who needs a check-in without opening individual cards.",
    ],
    0.6,
    1.9,
    5.7,
    4.5,
    t,
    13.5,
  );

  // Right: rollup card grid mockup (2 cards across × 2)
  const rx = 6.6;
  const ry = 1.95;
  const rw = 6.1;
  const rh = 4.95;
  L.panel(pres, s, rx, ry, rw, rh, t);
  s.addText("Employee rollup", {
    x: rx + 0.3,
    y: ry + 0.2,
    w: rw - 0.6,
    h: 0.4,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });

  const grid = [
    {
      name: "Alex Sharma",
      total: 7,
      compliant: 6,
      flagged: 1,
      overdue: 0,
      note:
        "Closed out 3 experiments this cycle. One task missing notebook location.",
    },
    {
      name: "Jamie Lee",
      total: 6,
      compliant: 3,
      flagged: 3,
      overdue: 2,
      note:
        "Two overdue tasks — reagent batch issue, see latest comment thread.",
    },
    {
      name: "Pat Rivera",
      total: 5,
      compliant: 4,
      flagged: 1,
      overdue: 0,
      note: "On track. Plate prep planned for next week.",
    },
    {
      name: "Morgan Chen",
      total: 6,
      compliant: 5,
      flagged: 1,
      overdue: 1,
      note: "One overdue: calibration dataset link missing.",
    },
  ];
  const cardW = (rw - 0.6 - 0.25) / 2;
  const cardH = 1.85;
  for (let i = 0; i < grid.length; i += 1) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = rx + 0.3 + col * (cardW + 0.25);
    const cy = ry + 0.7 + row * (cardH + 0.15);
    const g = grid[i];
    L.card(pres, s, cx, cy, cardW, cardH, t);
    s.addText(g.name, {
      x: cx + 0.2,
      y: cy + 0.15,
      w: cardW - 0.4,
      h: 0.3,
      fontSize: 12.5,
      bold: true,
      fontFace: L.FONTS.title,
      color: t.titleText,
      margin: 0,
    });
    s.addText(`${g.total} tasks`, {
      x: cx + 0.2,
      y: cy + 0.15,
      w: cardW - 0.4,
      h: 0.3,
      fontSize: 10.5,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      align: "right",
      margin: 0,
    });
    s.addText(
      `${g.compliant} compliant · ${g.flagged} flagged · ${g.overdue} overdue`,
      {
        x: cx + 0.2,
        y: cy + 0.5,
        w: cardW - 0.4,
        h: 0.3,
        fontSize: 10.5,
        fontFace: L.FONTS.body,
        color: t.bodyText,
        margin: 0,
      },
    );
    s.addText(g.note, {
      x: cx + 0.2,
      y: cy + 0.85,
      w: cardW - 0.4,
      h: 0.95,
      fontSize: 9.5,
      italic: true,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      valign: "top",
      margin: 0,
    });
  }
}

/* ---------- Slide 9: Change log between refreshes ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "08 / 10" });
  L.addSlideTitle(s, "Change log between refreshes", t, "Step 4 · Track what moved");

  L.addBodyText(
    s,
    [
      "The Run summary button on the dashboard captures a snapshot of the current dataset.",
      "Each subsequent refresh diffs against that snapshot and groups changes by employee.",
      "Three categories: tasks added, tasks removed, and tasks updated (with field-level before/after values).",
      "The first run initializes tracking. The second and beyond show only what's new since.",
      "Lets you walk into a check-in knowing exactly what changed without opening the spreadsheet.",
    ],
    0.6,
    1.9,
    5.7,
    4.5,
    t,
    13.5,
  );

  // Right: change log mockup
  const cx = 6.6;
  const cy = 1.95;
  const cw = 6.1;
  const ch = 4.95;
  L.panel(pres, s, cx, cy, cw, ch, t);
  s.addText("Change log since last run", {
    x: cx + 0.3,
    y: cy + 0.2,
    w: cw - 0.6,
    h: 0.4,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText("Last run · Apr 18 · 1.4s", {
    x: cx + 0.3,
    y: cy + 0.2,
    w: cw - 0.6,
    h: 0.4,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "right",
    margin: 0,
  });

  // Group: Jamie Lee
  L.card(pres, s, cx + 0.3, cy + 0.85, cw - 0.6, 1.6, t);
  s.addText("Jamie Lee", {
    x: cx + 0.45,
    y: cy + 0.95,
    w: cw - 0.9,
    h: 0.3,
    fontSize: 12,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  // badges
  L.pill(pres, s, "ADDED 1", cx + cw - 1.85, cy + 0.97, 0.7, "14532D", "BBF7D0");
  L.pill(pres, s, "UPDATED 2", cx + cw - 1.05, cy + 0.97, 0.85, "1E3A8A", "BFDBFE");
  s.addText("• Added — Western blot rerun (Project A)", {
    x: cx + 0.45,
    y: cy + 1.3,
    w: cw - 0.9,
    h: 0.25,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  s.addText("• Updated — Cell harvest", {
    x: cx + 0.45,
    y: cy + 1.55,
    w: cw - 0.9,
    h: 0.25,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  s.addText("Status: Planned → In Progress · Estimate: 4h → 6h", {
    x: cx + 0.7,
    y: cy + 1.78,
    w: cw - 0.9,
    h: 0.25,
    fontSize: 9.5,
    italic: true,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  s.addText("• Updated — Buffer prep · Projected end Apr 22 → Apr 26", {
    x: cx + 0.45,
    y: cy + 2.05,
    w: cw - 0.9,
    h: 0.25,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });

  // Group: Pat Rivera
  L.card(pres, s, cx + 0.3, cy + 2.6, cw - 0.6, 1.05, t);
  s.addText("Pat Rivera", {
    x: cx + 0.45,
    y: cy + 2.7,
    w: cw - 0.9,
    h: 0.3,
    fontSize: 12,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  L.pill(pres, s, "REMOVED 1", cx + cw - 1.05, cy + 2.72, 0.85, "7F1D1D", "FECACA");
  s.addText("• Removed — Old plate prep (replaced with new schedule)", {
    x: cx + 0.45,
    y: cy + 3.05,
    w: cw - 0.9,
    h: 0.25,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });

  // Group: Alex Sharma
  L.card(pres, s, cx + 0.3, cy + 3.85, cw - 0.6, 1.0, t);
  s.addText("Alex Sharma", {
    x: cx + 0.45,
    y: cy + 3.95,
    w: cw - 0.9,
    h: 0.3,
    fontSize: 12,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  L.pill(pres, s, "UPDATED 1", cx + cw - 1.05, cy + 3.97, 0.85, "1E3A8A", "BFDBFE");
  s.addText("• Updated — Calibration run · Status: In Progress → Completed", {
    x: cx + 0.45,
    y: cy + 4.3,
    w: cw - 0.9,
    h: 0.25,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
}

/* ---------- Slide 10: Setup panel (configuration) ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "09 / 10" });
  L.addSlideTitle(s, "Setup panel", t, "Configuration without a rebuild");

  L.addBodyText(
    s,
    [
      "Open from the Setup chip in the top bar at any time.",
      "Edit values without redeploying or restarting — changes take effect on the next data reload.",
      "Saved locally on this device, so each manager can keep their own configuration.",
      "Hit Reload data after editing to apply the change immediately.",
      "Use it to point at a different admin spreadsheet, change allow-lists, or adjust which sheet names hold the registry, run log, feedback, and roles.",
    ],
    0.6,
    1.9,
    5.7,
    4.5,
    t,
    13.5,
  );

  // Right: config panel mockup
  const px = 6.6;
  const py = 1.95;
  const pw = 6.1;
  const ph = 4.95;
  L.panel(pres, s, px, py, pw, ph, t);
  s.addText("Manager setup", {
    x: px + 0.3,
    y: py + 0.2,
    w: pw - 2.5,
    h: 0.4,
    fontSize: 16,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  L.secondaryButton(pres, s, "Reload data", px + pw - 2.3, py + 0.2, 1.2, t);
  L.secondaryButton(pres, s, "Close", px + pw - 1.0, py + 0.2, 0.7, t);
  s.addShape(pres.shapes.RECTANGLE, {
    x: px + 0.3,
    y: py + 0.75,
    w: pw - 0.6,
    h: 0.01,
    fill: { color: t.cardBorder },
    line: { color: t.cardBorder, width: 0 },
  });

  // Field rows
  const fy = py + 0.9;
  L.field(pres, s, "Admin spreadsheet ID or URL", "https://docs.google.com/spreadsheets/d/...", px + 0.3, fy, pw - 0.6, t);
  L.field(pres, s, "Google OAuth client ID", "1234567890-abc.apps.googleusercontent.com", px + 0.3, fy + 0.85, pw - 0.6, t);
  L.field(pres, s, "Manager emails", "pi@lab.edu, manager@lab.edu", px + 0.3, fy + 1.7, pw - 0.6, t);
  L.field(pres, s, "Employee emails", "alex@lab.edu, jamie@lab.edu, pat@lab.edu", px + 0.3, fy + 2.55, pw - 0.6, t);
  // Sheet name fields - smaller in 2 cols
  const fW = (pw - 0.9) / 2;
  L.field(pres, s, "Registry sheet", "SheetRegistry", px + 0.3, fy + 3.4, fW, t);
  L.field(pres, s, "RunLog sheet", "RunLog", px + 0.3 + fW + 0.3, fy + 3.4, fW, t);
}

pres.writeFile({ fileName: "Manager-Dashboard.pptx" })
  .then((f) => console.log("Wrote", f));
