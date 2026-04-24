/* Builds: Scientist-Workflow.pptx
   Audience: senior research scientists (= lab members in the app).
   Scope: functionality of the employee workspace only. */

const pptxgen = require("pptxgenjs");
const L = require("./lib.cjs");

const pres = new pptxgen();
const t = L.theme("scientist");
L.setupPres(pres, "scientist");

const ROLE = "Lab Member workspace";
const FOOT = "Lab Workflow · Researcher functionality";

/* ---------- Slide 1: Title ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { titleSlide: true });

  // Big accent block on right side as visual motif
  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.4,
    y: 0,
    w: 4.93,
    h: 7.5,
    fill: { color: t.accentSoft },
    line: { color: t.accentSoft, width: 0 },
  });
  // Accent corner triangle motif
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
  s.addText("For research scientists", {
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
  s.addText("A structured workspace for planning, running, and closing out experiments — built directly on top of your existing Google Sheet task log.", {
    x: 0.7,
    y: 3.6,
    w: 7.4,
    h: 1.6,
    fontSize: 16,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });

  // Feature ticks as a visual element
  const ticks = [
    "Kanban view of all your experiments",
    "Built-in compliance checks",
    "Guided complete and overdue flows",
    "Your spreadsheet stays the source of truth",
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
  L.addSlideTitle(s, "The flow at a glance", t, "How you use the app");

  const steps = [
    {
      n: 1,
      label: "Sign in",
      detail: "One-click Google sign-in with your lab account.",
    },
    {
      n: 2,
      label: "Connect task log",
      detail:
        "Paste your Google Sheet URL and tab name once. The app remembers it.",
    },
    {
      n: 3,
      label: "Manage tasks",
      detail:
        "Create, edit, and review experiments from a kanban board organized by status.",
    },
    {
      n: 4,
      label: "Close out cleanly",
      detail:
        "Complete and overdue actions enforce the closeout details a manager will look for.",
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
    // Number circle
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

/* ---------- Slide 3: Sign in with Google ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "02 / 10" });
  L.addSlideTitle(s, "Sign in with Google", t, "Step 1");

  // Left: explanation
  L.addBodyText(
    s,
    [
      "Sign in with the Google account that already has access to your task log spreadsheet.",
      "No separate username, password, or invite — the app uses Google's standard sign-in.",
      "Your role (lab member or manager) is determined automatically from a configured allow-list.",
      "If your account isn't on the list, you'll see a clear unauthorized notice instead of any data.",
    ],
    0.6,
    1.9,
    5.6,
    4.5,
    t,
    13.5,
  );

  // Right: SignedOutScreen mockup
  const mx = 6.7;
  const my = 1.9;
  const mw = 6.0;
  const mh = 4.6;
  L.panel(pres, s, mx, my, mw, mh, t);
  // App-like centered card inside panel
  const cx = mx + (mw - 4.0) / 2;
  const cy = my + 0.7;
  L.card(pres, s, cx, cy, 4.0, 3.2, t);
  s.addText("Lab Workflow", {
    x: cx,
    y: cy + 0.4,
    w: 4.0,
    h: 0.5,
    fontSize: 22,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    align: "center",
    margin: 0,
  });
  s.addText("Sign in with your lab Google account to continue.", {
    x: cx + 0.3,
    y: cy + 1.0,
    w: 3.4,
    h: 0.5,
    fontSize: 11.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "center",
    margin: 0,
  });
  L.primaryButton(
    pres,
    s,
    "Sign in with Google",
    cx + 0.5,
    cy + 1.9,
    3.0,
    t,
  );
  s.addText("Mockup of the sign-in screen", {
    x: mx,
    y: my + mh - 0.4,
    w: mw,
    h: 0.3,
    fontSize: 9,
    italic: true,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "center",
    margin: 0,
  });
}

/* ---------- Slide 4: Connect your task log ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "03 / 10" });
  L.addSlideTitle(s, "Connect your task log", t, "Step 2 · One-time setup");

  L.addBodyText(
    s,
    [
      "Paste the URL of your personal task-log Google Sheet.",
      "Type the exact tab name you're using (e.g. Sept 2026).",
      "The app validates that the sheet and tab exist before letting you continue.",
      "Stored locally on this device — you only do this once per machine.",
      "Use Setup later to swap to a different tab or a new monthly sheet.",
    ],
    0.6,
    1.9,
    5.6,
    4.5,
    t,
    13.5,
  );

  const mx = 6.7;
  const my = 1.9;
  const mw = 6.0;
  const mh = 4.6;
  L.panel(pres, s, mx, my, mw, mh, t);
  // Setup card
  const cx = mx + 0.4;
  const cy = my + 0.4;
  const cw = mw - 0.8;
  L.card(pres, s, cx, cy, cw, mh - 0.8, t);
  s.addText("Connect your task log", {
    x: cx + 0.3,
    y: cy + 0.25,
    w: cw - 0.6,
    h: 0.4,
    fontSize: 18,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText("Signed in as alex@lab.edu", {
    x: cx + 0.3,
    y: cy + 0.7,
    w: cw - 0.6,
    h: 0.3,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  L.field(
    pres,
    s,
    "Task log spreadsheet URL",
    "https://docs.google.com/spreadsheets/d/...",
    cx + 0.3,
    cy + 1.15,
    cw - 0.6,
    t,
  );
  L.field(
    pres,
    s,
    "Active sheet / tab name",
    "e.g. Sept 2026",
    cx + 0.3,
    cy + 2.0,
    cw - 0.6,
    t,
  );
  L.primaryButton(pres, s, "Validate and continue", cx + 0.3, cy + 2.95, 2.5, t);
  L.secondaryButton(pres, s, "Sign out", cx + 2.95, cy + 2.95, 1.2, t);
}

/* ---------- Slide 5: Your workspace at a glance ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "04 / 10" });
  L.addSlideTitle(s, "Your workspace at a glance", t, "Step 3 · Day-to-day view");

  // App top bar in mockup
  L.appTopBar(
    pres,
    s,
    0.6,
    1.7,
    12.13,
    t,
    "Your task log",
    "Source: Google Sheets · Last sync 2 minutes ago",
  );

  // 4 lanes
  const laneY = 2.4;
  const laneH = 4.5;
  const totalW = 12.13;
  const gap = 0.18;
  const laneW = (totalW - 3 * gap) / 4;

  L.lane(
    pres,
    s,
    0.6,
    laneY,
    laneW,
    laneH,
    t,
    "In Progress",
    2,
    "FACC15",
    [
      {
        title: "Cell viability assay",
        project: "Project A",
        status: "inProgress",
        dotColor: t.warnDot,
        start: "Apr 12",
        end: "Apr 22",
        estimate: "8h",
      },
      {
        title: "Buffer optimization",
        project: "Project C",
        status: "inProgress",
        dotColor: t.okDot,
        start: "Apr 15",
        end: "Apr 25",
        estimate: "6h",
      },
    ],
  );

  L.lane(
    pres,
    s,
    0.6 + (laneW + gap),
    laneY,
    laneW,
    laneH,
    t,
    "Overdue",
    1,
    "F87171",
    [
      {
        title: "Western blot rerun",
        project: "Project A",
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
    2,
    "60A5FA",
    [
      {
        title: "Plate prep",
        project: "Project B",
        status: "planned",
        dotColor: t.warnDot,
        start: "Apr 24",
        end: "Apr 26",
        estimate: "3h",
      },
      {
        title: "Reagent QC",
        project: "Project B",
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
    1,
    "4ADE80",
    [
      {
        title: "Calibration run",
        project: "Project A",
        status: "completed",
        dotColor: t.okDot,
        start: "Apr 5",
        end: "Apr 8",
        estimate: "2h",
      },
    ],
  );

  // Bottom right: floating + button mockup
  s.addShape(pres.shapes.OVAL, {
    x: 12.0,
    y: 6.55,
    w: 0.55,
    h: 0.55,
    fill: { color: t.primaryBtn },
    line: { color: t.primaryBtn, width: 0 },
  });
  s.addText("+", {
    x: 12.0,
    y: 6.5,
    w: 0.55,
    h: 0.6,
    fontSize: 24,
    bold: true,
    fontFace: L.FONTS.title,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
    margin: 0,
  });
}

/* ---------- Slide 6: Anatomy of a task card + compliance dots ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "05 / 10" });
  L.addSlideTitle(s, "Anatomy of a task card", t, "Reading the board at a glance");

  // Big task card on the left
  const cx = 0.9;
  const cy = 2.0;
  const cw = 4.5;
  L.card(pres, s, cx, cy, cw, 4.4, t);
  // header
  L.complianceDot(pres, s, cx + 0.3, cy + 0.35, t.warnDot);
  L.statusPillFor(pres, s, "inProgress", cx + cw - 1.2, cy + 0.3, t);
  s.addText("Cell viability assay", {
    x: cx + 0.3,
    y: cy + 0.85,
    w: cw - 0.6,
    h: 0.5,
    fontSize: 22,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText("Project A", {
    x: cx + 0.3,
    y: cy + 1.4,
    w: cw - 0.6,
    h: 0.3,
    fontSize: 13,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  // meta grid 3 cols
  const colW = (cw - 0.6) / 3;
  const labels = ["Start", "End", "Estimate"];
  const values = ["Apr 12", "Apr 22", "8h"];
  for (let i = 0; i < 3; i += 1) {
    s.addText(labels[i], {
      x: cx + 0.3 + i * colW,
      y: cy + 2.0,
      w: colW,
      h: 0.3,
      fontSize: 10.5,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      margin: 0,
    });
    s.addText(values[i], {
      x: cx + 0.3 + i * colW,
      y: cy + 2.3,
      w: colW,
      h: 0.35,
      fontSize: 14,
      bold: true,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
    });
  }
  // feedback line
  s.addText(
    "Compliance: missing notebook location.",
    {
      x: cx + 0.3,
      y: cy + 3.1,
      w: cw - 0.6,
      h: 0.4,
      fontSize: 11,
      fontFace: L.FONTS.body,
      color: "FDE68A",
      italic: true,
      margin: 0,
    },
  );
  // small actions
  L.secondaryButton(pres, s, "Edit", cx + 0.3, cy + 3.7, 0.85, t);
  L.secondaryButton(pres, s, "Complete", cx + 1.25, cy + 3.7, 1.2, t);

  // Right: annotated callouts + compliance legend
  const ax = 6.0;
  let ay = 1.95;
  const calls = [
    {
      n: 1,
      text: "Compliance dot — green / amber / red signals at-a-glance health.",
    },
    {
      n: 2,
      text: "Status pill — Planned, In Progress, Completed, or Blocked.",
    },
    { n: 3, text: "Experiment title and the project it rolls up to." },
    { n: 4, text: "Start, projected end, and your time estimate." },
    {
      n: 5,
      text: "Plain-English feedback explaining why a card isn't fully compliant.",
    },
    { n: 6, text: "Edit, Complete, or Resolve overdue — only the actions that apply." },
  ];
  for (const c of calls) {
    L.annotationCallout(pres, s, ax, ay, 6.7, 0.42, t, c.text, { number: c.n });
    ay += 0.5;
  }

  // Compliance legend
  const lx = 6.0;
  const ly = 5.4;
  const lw = 6.7;
  L.card(pres, s, lx, ly, lw, 1.2, t);
  s.addText("Compliance dots", {
    x: lx + 0.25,
    y: ly + 0.12,
    w: lw - 0.5,
    h: 0.3,
    fontSize: 12,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const legend = [
    { color: t.okDot, label: "Compliant — required fields filled in." },
    { color: t.warnDot, label: "Missing info or closeout fields." },
    { color: t.dangerDot, label: "Past projected end date." },
  ];
  let lyi = ly + 0.45;
  for (const item of legend) {
    L.complianceDot(pres, s, lx + 0.35, lyi + 0.05, item.color);
    s.addText(item.label, {
      x: lx + 0.7,
      y: lyi - 0.02,
      w: lw - 0.9,
      h: 0.3,
      fontSize: 10.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
    });
    lyi += 0.22;
  }
}

/* ---------- Slide 7: Create or edit a task ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "06 / 10" });
  L.addSlideTitle(s, "Create or edit a task", t, "Step 3 · Add new work");

  // Left: required vs optional
  const lx = 0.6;
  let ly = 1.9;
  s.addText("Required when you save", {
    x: lx,
    y: ly,
    w: 5.4,
    h: 0.35,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  ly += 0.35;
  L.addBodyText(
    s,
    [
      "Project",
      "Experiment",
      "Time estimate",
      "Start date",
      "Projected end date",
      "Status",
      "Schematic",
      "Link to data",
    ],
    lx,
    ly,
    5.4,
    2.6,
    t,
    12,
  );
  ly += 2.7;
  s.addText("Optional", {
    x: lx,
    y: ly,
    w: 5.4,
    h: 0.35,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.mutedText,
    margin: 0,
  });
  ly += 0.35;
  L.addBodyText(
    s,
    ["Notebook location", "Comments / improvements"],
    lx,
    ly,
    5.4,
    0.9,
    t,
    12,
  );

  // Right: modal mockup
  const mx = 6.4;
  const my = 1.9;
  const mw = 6.3;
  const mh = 4.9;
  L.panel(pres, s, mx, my, mw, mh, t);
  // Modal header
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
  // Divider
  s.addShape(pres.shapes.RECTANGLE, {
    x: mx + 0.3,
    y: my + 0.7,
    w: mw - 0.6,
    h: 0.01,
    fill: { color: t.cardBorder },
    line: { color: t.cardBorder, width: 0 },
  });
  // Fields grid: 2 cols
  const fy = my + 0.85;
  const fW = (mw - 0.9) / 2;
  L.field(pres, s, "Project", "Project A", mx + 0.3, fy, fW, t);
  L.field(pres, s, "Experiment", "Cell viability assay", mx + 0.3 + fW + 0.3, fy, fW, t);
  L.field(pres, s, "Status", "In Progress", mx + 0.3, fy + 0.85, fW, t);
  L.field(pres, s, "Time estimate", "8h", mx + 0.3 + fW + 0.3, fy + 0.85, fW, t);
  L.field(pres, s, "Start date", "2026-04-12", mx + 0.3, fy + 1.7, fW, t);
  L.field(pres, s, "Projected end date", "2026-04-22", mx + 0.3 + fW + 0.3, fy + 1.7, fW, t);
  L.field(pres, s, "Schematic", "https://...", mx + 0.3, fy + 2.55, mw - 0.6, t);
  // Buttons
  L.primaryButton(pres, s, "Save task", mx + 0.3, fy + 3.45, 1.7, t);
  L.secondaryButton(pres, s, "Cancel", mx + 2.1, fy + 3.45, 1.1, t);
}

/* ---------- Slide 8: Mark a task complete ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "07 / 10" });
  L.addSlideTitle(s, "Mark a task complete", t, "Closing out cleanly");

  L.addBodyText(
    s,
    [
      "Completion is a guided workflow, not just a status toggle.",
      "Three closeout fields are required before the app will accept the task as complete.",
      "Once saved, the card moves to the Completed lane and shows as compliant.",
      "If a closeout field is missing later, the card will show an amber dot until it's filled in.",
    ],
    0.6,
    1.9,
    5.8,
    3.5,
    t,
    13.5,
  );

  // Required closeout panel (accent)
  const px = 0.6;
  const py = 5.55;
  L.card(pres, s, px, py, 5.8, 1.45, t);
  s.addText("Required closeout fields", {
    x: px + 0.25,
    y: py + 0.15,
    w: 5.3,
    h: 0.35,
    fontSize: 13,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  L.addBodyText(
    s,
    ["Final schematic", "Link to final data", "Result summary"],
    px + 0.3,
    py + 0.55,
    5.2,
    0.85,
    t,
    11.5,
  );

  // Right: complete modal mockup
  const mx = 6.7;
  const my = 1.9;
  const mw = 6.0;
  const mh = 5.1;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("Complete task — Cell viability assay", {
    x: mx + 0.3,
    y: my + 0.2,
    w: mw - 0.6,
    h: 0.4,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
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
  L.field(pres, s, "Final schematic", "https://...", mx + 0.3, my + 0.9, mw - 0.6, t);
  L.field(pres, s, "Link to final data", "https://dropbox.com/...", mx + 0.3, my + 1.75, mw - 0.6, t);
  s.addText("Result summary", {
    x: mx + 0.3,
    y: my + 2.6,
    w: mw - 0.6,
    h: 0.22,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: mx + 0.3,
    y: my + 2.84,
    w: mw - 0.6,
    h: 1.1,
    fill: { color: "020617" },
    line: { color: "334155", width: 0.75 },
    rectRadius: 0.08,
  });
  s.addText("Cells maintained 92% viability through 72h. Ran in triplicate; details in linked dataset.", {
    x: mx + 0.42,
    y: my + 2.9,
    w: mw - 0.84,
    h: 1.0,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    italic: true,
    margin: 0,
  });
  L.primaryButton(pres, s, "Mark complete", mx + 0.3, my + 4.2, 1.85, t);
  L.secondaryButton(pres, s, "Cancel", mx + 2.25, my + 4.2, 1.1, t);
}

/* ---------- Slide 9: Resolve an overdue task ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "08 / 10" });
  L.addSlideTitle(s, "Resolve an overdue task", t, "When work slips past the projected end date");

  L.addBodyText(
    s,
    [
      "Once a task passes its projected end date without being completed, it moves to the Overdue lane and the dot turns red.",
      "The overdue resolution workflow asks for new planning values plus a reason — so the slip is documented, not erased.",
      "Old planning values are preserved as history; the new values are appended to the task.",
      "The delay reason is recorded in the comments column so it's visible to you and to your manager.",
    ],
    0.6,
    1.9,
    5.8,
    3.7,
    t,
    13.5,
  );

  const px = 0.6;
  const py = 5.65;
  L.card(pres, s, px, py, 5.8, 1.35, t);
  s.addText("Required to resolve", {
    x: px + 0.25,
    y: py + 0.13,
    w: 5.3,
    h: 0.35,
    fontSize: 13,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.accent,
    margin: 0,
  });
  L.addBodyText(
    s,
    ["New projected end date (must be in the future)", "New time estimate", "Delay reason"],
    px + 0.3,
    py + 0.5,
    5.2,
    0.85,
    t,
    11.5,
  );

  // Right: resolve modal mockup
  const mx = 6.7;
  const my = 1.9;
  const mw = 6.0;
  const mh = 5.1;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("Resolve overdue — Western blot rerun", {
    x: mx + 0.3,
    y: my + 0.2,
    w: mw - 0.6,
    h: 0.4,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  // Status badge
  L.statusPillFor(pres, s, "blocked", mx + mw - 1.15, my + 0.25, t);
  s.addShape(pres.shapes.RECTANGLE, {
    x: mx + 0.3,
    y: my + 0.75,
    w: mw - 0.6,
    h: 0.01,
    fill: { color: t.cardBorder },
    line: { color: t.cardBorder, width: 0 },
  });
  // Show old vs new vals
  s.addText("Previously: end Apr 10 · 4h estimate", {
    x: mx + 0.3,
    y: my + 0.9,
    w: mw - 0.6,
    h: 0.3,
    fontSize: 10,
    italic: true,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  L.field(pres, s, "New projected end date", "2026-05-02", mx + 0.3, my + 1.3, (mw - 0.9) / 2, t);
  L.field(pres, s, "New time estimate", "6h", mx + 0.3 + (mw - 0.9) / 2 + 0.3, my + 1.3, (mw - 0.9) / 2, t);
  s.addText("Delay reason", {
    x: mx + 0.3,
    y: my + 2.2,
    w: mw - 0.6,
    h: 0.22,
    fontSize: 10,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: mx + 0.3,
    y: my + 2.44,
    w: mw - 0.6,
    h: 1.5,
    fill: { color: "020617" },
    line: { color: "334155", width: 0.75 },
    rectRadius: 0.08,
  });
  s.addText("Reagent batch arrived 5 days late. Restarting with new lot and adjusted protocol.", {
    x: mx + 0.42,
    y: my + 2.5,
    w: mw - 0.84,
    h: 1.4,
    fontSize: 10,
    italic: true,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  L.primaryButton(pres, s, "Update plan", mx + 0.3, my + 4.2, 1.85, t);
  L.secondaryButton(pres, s, "Cancel", mx + 2.25, my + 4.2, 1.1, t);
}

/* ---------- Slide 10: What's saved where ---------- */
{
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: "09 / 10" });
  L.addSlideTitle(s, "What's saved where", t, "Source of truth & local memory");

  // Two-column diagram
  const colY = 2.0;
  const colH = 4.6;

  // Left column: Google Sheet (source of truth)
  const lx = 0.8;
  const lw = 5.7;
  L.card(pres, s, lx, colY, lw, colH, t);
  s.addText("Your Google Sheet", {
    x: lx + 0.3,
    y: colY + 0.25,
    w: lw - 0.6,
    h: 0.45,
    fontSize: 20,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText("THE SOURCE OF TRUTH", {
    x: lx + 0.3,
    y: colY + 0.75,
    w: lw - 0.6,
    h: 0.3,
    fontSize: 11,
    bold: true,
    fontFace: L.FONTS.body,
    color: t.accent,
    charSpacing: 4,
    margin: 0,
  });
  L.addBodyText(
    s,
    [
      "Every create, edit, complete, and overdue resolution writes back to your spreadsheet.",
      "You can still open the sheet directly — the app and the sheet always agree.",
      "Refreshing the app re-reads the sheet, so changes made elsewhere appear here too.",
      "Switching computers, signing in elsewhere, or losing your laptop changes nothing about your data.",
    ],
    lx + 0.35,
    colY + 1.25,
    lw - 0.7,
    colH - 1.4,
    t,
    12,
  );

  // Right column: Local device
  const rx = 6.9;
  const rw = 5.8;
  L.card(pres, s, rx, colY, rw, colH, t);
  s.addText("This device", {
    x: rx + 0.3,
    y: colY + 0.25,
    w: rw - 0.6,
    h: 0.45,
    fontSize: 20,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText("LOCAL CONVENIENCE ONLY", {
    x: rx + 0.3,
    y: colY + 0.75,
    w: rw - 0.6,
    h: 0.3,
    fontSize: 11,
    bold: true,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    charSpacing: 4,
    margin: 0,
  });
  L.addBodyText(
    s,
    [
      "Your task-log URL and active tab name (so setup is one-time per machine).",
      "A small dataset cache so the board still loads if the network blips.",
      "None of this is your experiment data — that always lives in the sheet.",
      "Sign out clears your session; no shared state with anyone else's device.",
    ],
    rx + 0.35,
    colY + 1.25,
    rw - 0.7,
    colH - 1.4,
    t,
    12,
  );
}

pres.writeFile({ fileName: "Scientist-Workflow.pptx" })
  .then((f) => console.log("Wrote", f));
