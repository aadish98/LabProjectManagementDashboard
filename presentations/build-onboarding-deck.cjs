/* Builds: Lab-Workflow-Onboarding.pptx
   Audience: employees and managers.
   Scope: plain-language introduction and day-one usage guide. */

const path = require("path");
const pptxgen = require("pptxgenjs");
const L = require("./lib.cjs");

const pres = new pptxgen();
const t = L.theme("manager");

L.setupPres(pres, "manager");
pres.title = "Lab Workflow Desktop Onboarding";
pres.subject = "Plain-language guide for employees and managers";
pres.company = "Lab Workflow";

const OUT = path.join(__dirname, "Lab-Workflow-Onboarding.pptx");
const FOOT = "Lab Workflow Desktop onboarding";

const TURBO_DMG =
  "smb://umms-rallada-win.turbo.storage.umich.edu/umms-rallada/Softwares/LabProjectManagement/Lab Workflow Desktop_0.1.0_Mac-universal.dmg";

function slideNum(n) {
  return `${String(n).padStart(2, "0")} / 15`;
}

function titleSlide() {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { titleSlide: true });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 8.1,
    y: 0,
    w: 5.23,
    h: 7.5,
    fill: { color: "0F766E" },
    line: { color: "0F766E", width: 0 },
  });
  s.addShape(pres.shapes.RIGHT_TRIANGLE, {
    x: 8.1,
    y: 0,
    w: 5.23,
    h: 4.1,
    fill: { color: "5EEAD4", transparency: 45 },
    line: { color: "5EEAD4", width: 0 },
    flipH: true,
  });

  s.addText("LAB WORKFLOW DESKTOP", {
    x: 0.7,
    y: 1.25,
    w: 7.2,
    h: 0.35,
    fontSize: 13,
    fontFace: L.FONTS.body,
    color: "5EEAD4",
    bold: true,
    charSpacing: 6,
    margin: 0,
  });
  s.addText("A plain-language guide for employees and managers", {
    x: 0.7,
    y: 1.78,
    w: 7.3,
    h: 1.6,
    fontSize: 42,
    fontFace: L.FONTS.title,
    color: t.titleText,
    bold: true,
    margin: 0,
    fit: "shrink",
  });
  s.addText(
    "How to sign in, connect the right Google Sheets, manage experiment tasks, and review lab progress without opening the spreadsheets for everyday work.",
    {
      x: 0.7,
      y: 3.8,
      w: 7.2,
      h: 1.1,
      fontSize: 15,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
      breakLine: false,
      fit: "shrink",
    },
  );

  const labels = ["Employee workspace", "Manager dashboard", "Google Sheets stays source of truth"];
  let y = 5.35;
  for (const label of labels) {
    s.addShape(pres.shapes.OVAL, {
      x: 0.72,
      y: y + 0.05,
      w: 0.17,
      h: 0.17,
      fill: { color: "5EEAD4" },
      line: { color: "5EEAD4", width: 0 },
    });
    s.addText(label, {
      x: 1.0,
      y,
      w: 6.8,
      h: 0.28,
      fontSize: 12.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
    });
    y += 0.42;
  }

  drawStackedSheets(s, 8.95, 1.55, 3.1, 4.65);
}

function drawStackedSheets(slide, x, y, w, h) {
  L.card(pres, slide, x + 0.25, y + 0.25, w, h, t);
  L.card(pres, slide, x + 0.1, y + 0.1, w, h, t);
  L.card(pres, slide, x, y, w, h, t);
  slide.addText("One clean app", {
    x: x + 0.25,
    y: y + 0.3,
    w: w - 0.5,
    h: 0.32,
    fontSize: 15,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  slide.addText("over your lab's existing sheets", {
    x: x + 0.25,
    y: y + 0.7,
    w: w - 0.5,
    h: 0.28,
    fontSize: 10.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  const rows = [
    ["Project", "Experiment", "Status"],
    ["Project A", "Cell assay", "In Progress"],
    ["Project B", "Reagent QC", "Planned"],
    ["Project C", "Calibration", "Complete"],
  ];
  const cellW = (w - 0.5) / 3;
  let ry = y + 1.25;
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      const fill = rowIndex === 0 ? "134E4A" : rowIndex % 2 ? "020617" : "0F172A";
      slide.addShape(pres.shapes.RECTANGLE, {
        x: x + 0.25 + colIndex * cellW,
        y: ry,
        w: cellW,
        h: 0.46,
        fill: { color: fill },
        line: { color: "334155", width: 0.5 },
      });
      slide.addText(value, {
        x: x + 0.32 + colIndex * cellW,
        y: ry + 0.12,
        w: cellW - 0.14,
        h: 0.2,
        fontSize: rowIndex === 0 ? 8.5 : 8,
        bold: rowIndex === 0,
        fontFace: L.FONTS.body,
        color: rowIndex === 0 ? "CCFBF1" : t.bodyText,
        margin: 0,
        fit: "shrink",
      });
    });
    ry += 0.46;
  });
  L.primaryButton(pres, slide, "Open task board", x + 0.55, y + h - 0.75, w - 1.1, t);
}

function rolePill(slide, label, x, y, fill, color) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x,
    y,
    w: 1.25,
    h: 0.34,
    fill: { color: fill },
    line: { color: fill, width: 0 },
    rectRadius: 0.16,
  });
  slide.addText(label, {
    x,
    y: y + 0.05,
    w: 1.25,
    h: 0.2,
    fontSize: 8.5,
    bold: true,
    fontFace: L.FONTS.body,
    color,
    align: "center",
    margin: 0,
  });
}

function textBlock(slide, title, body, x, y, w, h, accent = t.accent) {
  L.card(pres, slide, x, y, w, h, t);
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.18,
    w: w - 0.44,
    h: 0.38,
    fontSize: 15,
    bold: true,
    fontFace: L.FONTS.title,
    color: accent,
    margin: 0,
  });
  slide.addText(body, {
    x: x + 0.22,
    y: y + 0.68,
    w: w - 0.44,
    h: h - 0.85,
    fontSize: 11.5,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
    valign: "top",
    fit: "shrink",
  });
}

function processStep(slide, n, label, detail, x, y, w, h, color = t.accent) {
  L.card(pres, slide, x, y, w, h, t);
  slide.addShape(pres.shapes.OVAL, {
    x: x + 0.18,
    y: y + 0.22,
    w: 0.54,
    h: 0.54,
    fill: { color },
    line: { color, width: 0 },
  });
  slide.addText(String(n), {
    x: x + 0.18,
    y: y + 0.29,
    w: 0.54,
    h: 0.28,
    fontSize: 15,
    bold: true,
    fontFace: L.FONTS.title,
    color: "020617",
    align: "center",
    margin: 0,
  });
  slide.addText(label, {
    x: x + 0.85,
    y: y + 0.2,
    w: w - 1.0,
    h: 0.34,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(detail, {
    x: x + 0.85,
    y: y + 0.6,
    w: w - 1.05,
    h: h - 0.75,
    fontSize: 10.7,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
    fit: "shrink",
  });
}

function sectionDivider(label, title, subtitle, color, n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 7.5,
    fill: { color: "020617" },
    line: { color: "020617", width: 0 },
  });
  s.addShape(pres.shapes.RIGHT_TRIANGLE, {
    x: 7.2,
    y: 0,
    w: 6.13,
    h: 7.5,
    fill: { color, transparency: 25 },
    line: { color, width: 0 },
    flipH: true,
  });
  rolePill(s, label, 0.8, 1.5, color, "020617");
  s.addText(title, {
    x: 0.8,
    y: 2.05,
    w: 8.0,
    h: 1.15,
    fontSize: 44,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText(subtitle, {
    x: 0.8,
    y: 3.55,
    w: 7.3,
    h: 0.9,
    fontSize: 15,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });
  const dots = [
    [9.0, 2.1, 0.55],
    [10.15, 3.05, 0.9],
    [11.4, 1.65, 0.45],
    [11.0, 4.5, 1.1],
    [8.4, 5.05, 0.65],
  ];
  dots.forEach(([x, y, size], i) => {
    s.addShape(pres.shapes.OVAL, {
      x,
      y,
      w: size,
      h: size,
      fill: { color: i % 2 ? "0F172A" : color, transparency: i % 2 ? 0 : 10 },
      line: { color: i % 2 ? color : "99F6E4", width: 1 },
    });
  });
  // The full-slide shape above covers the standard footer, so redraw it on top.
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 7.18,
    w: 12.13,
    h: 0.01,
    fill: { color: t.cardBorder },
    line: { color: t.cardBorder, width: 0 },
  });
  s.addText(FOOT, {
    x: 0.6,
    y: 7.22,
    w: 8,
    h: 0.22,
    fontSize: 9,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
  s.addText(slideNum(n), {
    x: 8.6,
    y: 7.22,
    w: 4.13,
    h: 0.22,
    fontSize: 9,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "right",
    margin: 0,
  });
}

function overviewSlide() {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(1) });
  L.addSlideTitle(s, "What the tool is", t, "Start here");

  textBlock(
    s,
    "A front door for task logs",
    "Lab Workflow Desktop gives everyone a cleaner way to work with experiment task logs. You use forms, boards, and timelines. The spreadsheet remains the official record in the background.",
    0.6,
    1.75,
    3.85,
    2.25,
    "5EEAD4",
  );
  textBlock(
    s,
    "One workspace per role",
    "Employees see their own task log. Managers see team-wide progress across active lab members. The app sends each person to the right place after Google sign-in.",
    4.75,
    1.75,
    3.85,
    2.25,
    "93C5FD",
  );
  textBlock(
    s,
    "Less spreadsheet cleanup",
    "Required fields, overdue tasks, missing closeout details, and invalid dates are called out before they become silent problems in the sheet.",
    8.9,
    1.75,
    3.85,
    2.25,
    "FDE68A",
  );

  L.panel(pres, s, 1.05, 4.55, 11.3, 1.65, t);
  const flow = [
    { label: "Sign in", x: 1.45 },
    { label: "Pick Sheets", x: 3.75 },
    { label: "Work in app", x: 6.15 },
    { label: "Data saved", x: 8.65 },
  ];
  flow.forEach((item, i) => {
    s.addShape(pres.shapes.OVAL, {
      x: item.x,
      y: 5.02,
      w: 0.68,
      h: 0.68,
      fill: { color: i === 2 ? "5EEAD4" : "1E293B" },
      line: { color: i === 2 ? "5EEAD4" : "334155", width: 1 },
    });
    s.addText(String(i + 1), {
      x: item.x,
      y: 5.15,
      w: 0.68,
      h: 0.24,
      fontSize: 13,
      bold: true,
      fontFace: L.FONTS.title,
      color: i === 2 ? "020617" : t.bodyText,
      align: "center",
      margin: 0,
    });
    s.addText(item.label, {
      x: item.x - 0.42,
      y: 5.82,
      w: 1.5,
      h: 0.24,
      fontSize: 10.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      align: "center",
      margin: 0,
    });
    if (i < flow.length - 1) {
      s.addShape(pres.shapes.LINE, {
        x: item.x + 0.8,
        y: 5.36,
        w: flow[i + 1].x - item.x - 0.94,
        h: 0,
        line: { color: "5EEAD4", width: 1.4, endArrowType: "triangle" },
      });
    }
  });
}

function twoRolesSlide() {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(2) });
  L.addSlideTitle(s, "Two sections, two everyday jobs", t, "Who this guide is for");

  L.card(pres, s, 0.75, 1.75, 5.8, 4.9, t);
  rolePill(s, "EMPLOYEES", 1.1, 2.1, "10B981", "022C22");
  s.addText("Keep your own experiments current", {
    x: 1.1,
    y: 2.6,
    w: 5.1,
    h: 0.45,
    fontSize: 22,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  L.addBodyText(
    s,
    [
      "Connect your task-log spreadsheet once.",
      "Create, update, complete, and reschedule tasks.",
      "Use Kanban for status and Gantt for timing.",
      "Fix missing fields before your manager has to chase them.",
    ],
    1.1,
    3.3,
    4.9,
    2.2,
    t,
    12.2,
  );
  drawMiniBoard(s, 1.1, 5.65, 4.95, 0.55, "employee");

  L.card(pres, s, 6.85, 1.75, 5.8, 4.9, t);
  rolePill(s, "MANAGERS", 7.2, 2.1, "60A5FA", "0B1120");
  s.addText("Review the whole lab in one place", {
    x: 7.2,
    y: 2.6,
    w: 5.1,
    h: 0.45,
    fontSize: 22,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  L.addBodyText(
    s,
    [
      "Set up the team and active task logs in Lab setup.",
      "Review metrics, overdue work, and employee rollups.",
      "Add or fix tasks for a selected lab member.",
      "Use Team for lab oversight or My tasks for your own bench work.",
      "Track what changed between review cycles with Run summary.",
    ],
    7.2,
    3.3,
    4.9,
    2.2,
    t,
    12.2,
  );
  drawMiniBoard(s, 7.2, 5.65, 4.95, 0.55, "manager");
}

function drawMiniBoard(slide, x, y, w, h, role) {
  const colors = role === "employee" ? ["10B981", "F87171", "60A5FA", "4ADE80"] : ["FACC15", "F87171", "60A5FA", "4ADE80"];
  const labels = ["Active", "Overdue", "Planned", "Done"];
  const gap = 0.08;
  const laneW = (w - 3 * gap) / 4;
  labels.forEach((label, i) => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + i * (laneW + gap),
      y,
      w: laneW,
      h,
      fill: { color: "020617" },
      line: { color: colors[i], width: 1 },
      rectRadius: 0.08,
    });
    slide.addText(label, {
      x: x + i * (laneW + gap),
      y: y + 0.17,
      w: laneW,
      h: 0.16,
      fontSize: 7.8,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      align: "center",
      margin: 0,
    });
  });
}

function employeeSetupSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Employee quick start", t, "First time only");

  const steps = [
    ["Sign in", "Use the Google account that has access to your personal task-log spreadsheet."],
    ["Choose file", "Click Choose from Drive and pick your own task-log workbook."],
    ["Pick tab", "Select the active sheet or tab that contains your current task list."],
    ["Match columns", "Review how fields such as Project, Experiment, Start Date, Result, and Link to Data map to your sheet."],
    ["Optional photo", "Upload a small profile photo, or skip it and use initials."],
  ];
  const x = 0.7;
  let y = 1.7;
  steps.forEach((step, i) => {
    processStep(s, i + 1, step[0], step[1], x, y, 5.95, 0.86, "10B981");
    y += 0.96;
  });

  const mx = 7.1;
  const my = 1.75;
  const mw = 5.55;
  const mh = 4.95;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("Connect your task log", {
    x: mx + 0.3,
    y: my + 0.25,
    w: mw - 0.6,
    h: 0.36,
    fontSize: 17,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const stepLabels = ["File", "Tab", "Columns", "Profile"];
  stepLabels.forEach((label, i) => {
    const cx = mx + 0.45 + i * 1.25;
    s.addShape(pres.shapes.OVAL, {
      x: cx,
      y: my + 0.9,
      w: 0.42,
      h: 0.42,
      fill: { color: i < 3 ? "10B981" : "1E293B" },
      line: { color: i < 3 ? "10B981" : "334155", width: 1 },
    });
    s.addText(String(i + 1), {
      x: cx,
      y: my + 0.99,
      w: 0.42,
      h: 0.16,
      fontSize: 9,
      bold: true,
      fontFace: L.FONTS.body,
      color: i < 3 ? "022C22" : t.bodyText,
      align: "center",
      margin: 0,
    });
    s.addText(label, {
      x: cx - 0.24,
      y: my + 1.38,
      w: 0.9,
      h: 0.2,
      fontSize: 8,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      align: "center",
      margin: 0,
    });
  });
  L.field(pres, s, "Selected workbook", "Alex Task Log", mx + 0.35, my + 1.85, mw - 0.7, t);
  L.field(pres, s, "Active tab", "May 2026", mx + 0.35, my + 2.7, mw - 0.7, t);
  L.primaryButton(pres, s, "Connect task log", mx + 0.35, my + 3.75, 1.85, t);
  L.secondaryButton(pres, s, "Reconnect Google", mx + 2.4, my + 3.75, 1.8, t);
  s.addText("Saved on this device for your signed-in email.", {
    x: mx + 0.35,
    y: my + 4.45,
    w: mw - 0.7,
    h: 0.24,
    fontSize: 9.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
}

function employeeWorkspaceSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Your everyday workspace", t, "Employee section");

  L.appTopBar(
    pres,
    s,
    0.65,
    1.55,
    12.05,
    t,
    "Alex Sharma",
    "Task log · tab May 2026",
    ["alex@lab.edu", "Change task log", "Sign out"],
  );
  const tabsY = 2.15;
  L.tab(pres, s, 0.65, tabsY, "Kanban", true, t);
  L.tab(pres, s, 1.65, tabsY, "Gantt", false, t);
  L.secondaryButton(pres, s, "Change task log", 10.15, 2.12, 1.65, t);
  L.primaryButton(pres, s, "New task", 11.95, 2.12, 0.75, t);

  const laneY = 2.72;
  const laneH = 3.95;
  const gap = 0.18;
  const laneW = (12.05 - 3 * gap) / 4;
  L.lane(pres, s, 0.65, laneY, laneW, laneH, t, "In Progress", 2, "FACC15", [
    {
      title: "Cell viability assay",
      project: "Project A",
      status: "inProgress",
      dotColor: t.warnDot,
      start: "May 14",
      end: "May 22",
      estimate: "8h",
    },
  ]);
  L.lane(pres, s, 0.65 + laneW + gap, laneY, laneW, laneH, t, "Overdue", 1, "F87171", [
    {
      title: "Western blot rerun",
      project: "Project A",
      status: "inProgress",
      dotColor: t.dangerDot,
      start: "Apr 30",
      end: "May 8",
      estimate: "4h",
    },
  ]);
  L.lane(pres, s, 0.65 + 2 * (laneW + gap), laneY, laneW, laneH, t, "Planned", 3, "60A5FA", [
    {
      title: "Reagent QC",
      project: "Project B",
      status: "planned",
      dotColor: t.okDot,
      start: "May 24",
      end: "May 29",
      estimate: "5h",
    },
  ]);
  L.lane(pres, s, 0.65 + 3 * (laneW + gap), laneY, laneW, laneH, t, "Completed", 4, "4ADE80", [
    {
      title: "Calibration run",
      project: "Project C",
      status: "completed",
      dotColor: t.okDot,
      start: "May 1",
      end: "May 4",
      estimate: "2h",
    },
  ]);

  s.addText("Use Kanban for status. Use Gantt when timing and workload matter.", {
    x: 0.65,
    y: 6.86,
    w: 7.5,
    h: 0.28,
    fontSize: 11.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
}

function employeeTaskSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Create or edit a task", t, "Employee section");

  L.addBodyText(
    s,
    [
      "Click New task to add planned or active work.",
      "Use Edit when dates, status, links, or notes change.",
      "Required fields are highlighted next to the field that needs attention.",
      "Saving writes the update to your Google Sheet and refreshes the board.",
      "Completed work should go through Complete, not a quick status change.",
    ],
    0.65,
    1.85,
    5.4,
    3.0,
    t,
    13,
  );

  L.card(pres, s, 0.65, 5.35, 5.4, 1.4, t);
  s.addText("What you need before saving a new task", {
    x: 0.9,
    y: 5.52,
    w: 4.9,
    h: 0.28,
    fontSize: 12.5,
    bold: true,
    fontFace: L.FONTS.title,
    color: "5EEAD4",
    margin: 0,
  });
  s.addText("Project, Experiment, Time estimate, Start date, Projected end date, Schematic, and Link to data.", {
    x: 0.9,
    y: 5.92,
    w: 4.85,
    h: 0.5,
    fontSize: 11,
    fontFace: L.FONTS.body,
    color: t.bodyText,
    margin: 0,
  });

  const mx = 6.55;
  const my = 1.78;
  const mw = 6.1;
  const mh = 5.05;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("New task", {
    x: mx + 0.32,
    y: my + 0.22,
    w: 3,
    h: 0.35,
    fontSize: 17,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const fy = my + 0.75;
  const fW = (mw - 0.9) / 2;
  L.field(pres, s, "Project", "Project A", mx + 0.3, fy, fW, t);
  L.field(pres, s, "Experiment", "Cell viability assay", mx + 0.3 + fW + 0.3, fy, fW, t);
  L.field(pres, s, "Status", "In Progress", mx + 0.3, fy + 0.76, fW, t);
  L.field(pres, s, "Time estimate", "8h", mx + 0.3 + fW + 0.3, fy + 0.76, fW, t);
  L.field(pres, s, "Start date", "2026-05-14", mx + 0.3, fy + 1.52, fW, t);
  L.field(pres, s, "Projected end date", "2026-05-22", mx + 0.3 + fW + 0.3, fy + 1.52, fW, t);
  L.field(pres, s, "Schematic", "Link or short description", mx + 0.3, fy + 2.28, mw - 0.6, t);
  L.field(pres, s, "Link to data", "Dropbox or Drive link", mx + 0.3, fy + 3.04, mw - 0.6, t);
  L.primaryButton(pres, s, "Save task", mx + 0.3, fy + 3.86, 1.45, t);
  L.secondaryButton(pres, s, "Cancel", mx + 1.9, fy + 3.86, 1.05, t);
}

function employeeCloseoutSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Complete and resolve overdue work", t, "Employee section");

  textBlock(
    s,
    "Complete",
    "Use Complete when the work is done. The app asks for final schematic, link to final data, and a result summary. The task then moves to Completed.",
    0.7,
    1.8,
    5.7,
    2.0,
    "4ADE80",
  );
  textBlock(
    s,
    "Resolve overdue",
    "Use Resolve overdue when a task slips past its projected end date. Enter a new projected end date, a new time estimate, and a delay reason.",
    0.7,
    4.15,
    5.7,
    2.0,
    "F87171",
  );

  const mx = 6.85;
  const my = 1.8;
  const mw = 5.75;
  const mh = 4.95;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("Overdue task", {
    x: mx + 0.32,
    y: my + 0.22,
    w: mw - 0.64,
    h: 0.34,
    fontSize: 16,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  L.taskCard(pres, s, mx + 0.35, my + 0.85, mw - 0.7, t, {
    title: "Western blot rerun",
    project: "Project A",
    status: "inProgress",
    dotColor: t.dangerDot,
    start: "Apr 30",
    end: "May 8",
    estimate: "4h",
  });
  L.field(pres, s, "New projected end date", "2026-05-24", mx + 0.35, my + 2.85, (mw - 0.95) / 2, t);
  L.field(pres, s, "New time estimate", "6h", mx + 0.35 + (mw - 0.95) / 2 + 0.25, my + 2.85, (mw - 0.95) / 2, t);
  L.field(pres, s, "Delay reason", "Reagent batch arrived late", mx + 0.35, my + 3.75, mw - 0.7, t);
  L.primaryButton(pres, s, "Update plan", mx + 0.35, my + 4.35, 1.5, t);
}

function ganttSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Use Gantt for timing", t, "Employee and manager section");

  L.addBodyText(
    s,
    [
      "Switch from Kanban to Gantt when you need to see work across time.",
      "Presets include This Quarter, Next 30 Days, Year, and Custom ranges.",
      "Employees see their own timeline. Managers can show all employees or a selected group.",
      "Tasks with missing or invalid dates are listed separately with a Fix task action.",
      "Export the chart as PNG or use Print to save as PDF.",
    ],
    0.7,
    1.8,
    5.3,
    3.0,
    t,
    13,
  );

  const gx = 6.45;
  const gy = 1.75;
  const gw = 6.2;
  const gh = 5.1;
  L.panel(pres, s, gx, gy, gw, gh, t);
  s.addText("Gantt timeline", {
    x: gx + 0.3,
    y: gy + 0.22,
    w: gw - 0.6,
    h: 0.34,
    fontSize: 16,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const rangePills = ["This Quarter", "Next 30 Days", "Custom", "PNG", "Print"];
  let px = gx + 0.3;
  rangePills.forEach((label, i) => {
    const w = i === 0 ? 1.0 : i >= 3 ? 0.55 : 0.95;
    L.pill(pres, s, label, px, gy + 0.72, w, i === 0 ? "1E3A8A" : i >= 3 ? "14532D" : "1E293B", i === 0 ? "BFDBFE" : i >= 3 ? "BBF7D0" : t.bodyText);
    px += w + 0.14;
  });
  const chartX = gx + 0.42;
  const chartY = gy + 1.45;
  const chartW = gw - 0.84;
  const rowH = 0.62;
  const labelW = 1.25;
  ["May 14", "May 21", "May 28", "Jun 4"].forEach((label, i) => {
    const x = chartX + labelW + i * ((chartW - labelW) / 4);
    s.addShape(pres.shapes.LINE, {
      x,
      y: chartY,
      w: 0,
      h: 3.0,
      line: { color: "334155", width: 0.5 },
    });
    s.addText(label, {
      x: x - 0.25,
      y: chartY - 0.32,
      w: 0.7,
      h: 0.2,
      fontSize: 7.5,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      margin: 0,
      align: "center",
    });
  });
  const rows = [
    ["Alex", "Cell assay", 0.15, 1.55, "10B981"],
    ["Jamie", "Western blot", 0.45, 2.4, "F87171"],
    ["Pat", "Reagent QC", 2.1, 1.2, "60A5FA"],
    ["Morgan", "Calibration", 1.2, 0.85, "4ADE80"],
  ];
  rows.forEach((row, i) => {
    const y = chartY + i * rowH;
    s.addText(row[0], {
      x: chartX,
      y: y + 0.14,
      w: labelW - 0.1,
      h: 0.18,
      fontSize: 8.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: chartX + labelW + row[2],
      y: y + 0.11,
      w: row[3],
      h: 0.28,
      fill: { color: row[4] },
      line: { color: row[4], width: 0 },
      rectRadius: 0.08,
    });
    s.addText(row[1], {
      x: chartX + labelW + row[2] + 0.08,
      y: y + 0.17,
      w: Math.max(0.55, row[3] - 0.16),
      h: 0.12,
      fontSize: 6.7,
      bold: true,
      fontFace: L.FONTS.body,
      color: "020617",
      margin: 0,
      fit: "shrink",
    });
  });
  L.card(pres, s, chartX, gy + 4.25, chartW, 0.65, t);
  s.addText("Unscheduled or invalid-date tasks appear here so they can be fixed.", {
    x: chartX + 0.18,
    y: gy + 4.45,
    w: chartW - 0.36,
    h: 0.18,
    fontSize: 8.8,
    fontFace: L.FONTS.body,
    color: "FDE68A",
    margin: 0,
  });
}

function managerSetupSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Manager quick start", t, "First team setup");

  L.card(pres, s, 0.7, 1.62, 5.95, 0.95, t);
  s.addShape(pres.shapes.OVAL, {
    x: 0.88,
    y: 1.78,
    w: 0.54,
    h: 0.54,
    fill: { color: "60A5FA" },
    line: { color: "60A5FA", width: 0 },
  });
  s.addText("0", {
    x: 0.88,
    y: 1.85,
    w: 0.54,
    h: 0.28,
    fontSize: 15,
    bold: true,
    fontFace: L.FONTS.title,
    color: "020617",
    align: "center",
    margin: 0,
  });
  s.addText("Get or update the app", {
    x: 1.55,
    y: 1.72,
    w: 4.9,
    h: 0.3,
    fontSize: 14,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  s.addText(
    "Copy Lab Workflow Desktop from the lab Turbo share, open the .dmg, and drag the app to Applications. Replace the old copy when IT publishes a new build.",
    {
      x: 1.55,
      y: 2.02,
      w: 4.95,
      h: 0.45,
      fontSize: 9.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
      fit: "shrink",
    },
  );
  s.addText(TURBO_DMG, {
    x: 0.88,
    y: 2.42,
    w: 5.65,
    h: 0.18,
    fontSize: 7.2,
    fontFace: L.FONTS.mono,
    color: t.mutedText,
    margin: 0,
    fit: "shrink",
  });

  const steps = [
    ["Pick admin workbook", "The admin workbook is the team's control center. It lists managers, employees, and active task logs."],
    ["Repair setup tabs", "If required tabs are missing, use Fix missing setup sheets to create them from inside the app."],
    ["Add the team", "Use Lab setup to add managers and lab members. No one needs to edit role lists by hand."],
    ["Choose task logs", "For each lab member, pick their task-log workbook, active tab, and active status."],
    ["Grant file access", "Share files in Drive, then use Grant task-log access in the app so each workbook can load."],
  ];
  let y = 2.72;
  steps.forEach((step, i) => {
    processStep(s, i + 1, step[0], step[1], 0.7, y, 5.95, 0.78, "60A5FA");
    y += 0.84;
  });

  const mx = 7.1;
  const my = 1.75;
  const mw = 5.55;
  const mh = 4.95;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("Lab setup", {
    x: mx + 0.3,
    y: my + 0.25,
    w: mw - 0.6,
    h: 0.34,
    fontSize: 17,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const rows = [
    ["Alex Sharma", "Employee", "May 2026", "Active"],
    ["Jamie Lee", "Employee", "May 2026", "Active"],
    ["Pat Rivera", "Employee", "Q2", "Active"],
    ["Priya Rao", "Manager", "Admin", "Active"],
  ];
  const cols = [1.6, 1.15, 1.15, 0.95];
  let tableY = my + 0.95;
  ["Name", "Role", "Tab", "State"].forEach((head, i) => {
    const x = mx + 0.3 + cols.slice(0, i).reduce((a, b) => a + b, 0);
    s.addShape(pres.shapes.RECTANGLE, {
      x,
      y: tableY,
      w: cols[i],
      h: 0.42,
      fill: { color: "1E3A8A" },
      line: { color: "334155", width: 0.5 },
    });
    s.addText(head, {
      x: x + 0.08,
      y: tableY + 0.12,
      w: cols[i] - 0.16,
      h: 0.16,
      fontSize: 8.2,
      bold: true,
      fontFace: L.FONTS.body,
      color: "BFDBFE",
      margin: 0,
    });
  });
  tableY += 0.42;
  rows.forEach((row, r) => {
    row.forEach((cell, i) => {
      const x = mx + 0.3 + cols.slice(0, i).reduce((a, b) => a + b, 0);
      s.addShape(pres.shapes.RECTANGLE, {
        x,
        y: tableY,
        w: cols[i],
        h: 0.42,
        fill: { color: r % 2 ? "020617" : "0F172A" },
        line: { color: "334155", width: 0.5 },
      });
      s.addText(cell, {
        x: x + 0.08,
        y: tableY + 0.12,
        w: cols[i] - 0.16,
        h: 0.16,
        fontSize: 7.8,
        fontFace: L.FONTS.body,
        color: t.bodyText,
        margin: 0,
        fit: "shrink",
      });
    });
    tableY += 0.42;
  });
  L.primaryButton(pres, s, "Save", mx + 0.3, my + 3.35, 1.85, t);
  L.secondaryButton(pres, s, "Fix missing setup sheets", mx + 2.35, my + 3.35, 2.2, t);
  s.addText("The app writes changes back to the admin workbook.", {
    x: mx + 0.3,
    y: my + 4.25,
    w: mw - 0.6,
    h: 0.24,
    fontSize: 9.5,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    margin: 0,
  });
}

function managerDashboardSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Manager dashboard at a glance", t, "Manager section");

  L.appTopBar(
    pres,
    s,
    0.65,
    1.45,
    12.05,
    t,
    "Manager dashboard",
    "Source: Google Sheets - Last sync 2 minutes ago",
    ["alex@lab.edu", "Lab setup", "Sign out"],
  );

  // Team / My tasks scope switcher
  L.pill(pres, s, "Team", 0.65, 1.95, 0.75, "1E3A8A", "BFDBFE");
  L.pill(pres, s, "My tasks", 1.5, 1.95, 0.85, "1E293B", t.bodyText);
  L.pill(pres, s, "Kanban", 2.55, 1.95, 0.75, "1E3A8A", "BFDBFE");
  L.pill(pres, s, "Gantt", 3.4, 1.95, 0.65, "1E293B", t.bodyText);

  let tx = 0.65;
  const tabs = ["All employees", "Alex Sharma", "Jamie Lee", "Pat Rivera", "Morgan Chen"];
  tabs.forEach((tab, i) => {
    const w = L.tab(pres, s, tx, 2.35, tab, i === 0, t);
    tx += w + 0.1;
  });

  const my = 2.88;
  const mGap = 0.18;
  const mW = (12.05 - 3 * mGap) / 4;
  L.metricCard(pres, s, 0.65, my, mW, 0.95, t, "Tasks in view", 24, "default");
  L.metricCard(pres, s, 0.65 + mW + mGap, my, mW, 0.95, t, "Compliant", 14, "success");
  L.metricCard(pres, s, 0.65 + 2 * (mW + mGap), my, mW, 0.95, t, "Overdue", 3, "danger");
  L.metricCard(pres, s, 0.65 + 3 * (mW + mGap), my, mW, 0.95, t, "Missing closeout", 4, "default");

  const laneY = 4.08;
  const laneH = 3.05;
  const gap = 0.18;
  const laneW = (12.05 - 3 * gap) / 4;
  L.lane(pres, s, 0.65, laneY, laneW, laneH, t, "In Progress", 8, "FACC15", [
    {
      title: "Cell viability",
      project: "Project A",
      labMember: "Alex Sharma",
      showLabMember: true,
      status: "inProgress",
      dotColor: t.warnDot,
      start: "May 14",
      end: "May 22",
      estimate: "8h",
    },
  ]);
  L.lane(pres, s, 0.65 + laneW + gap, laneY, laneW, laneH, t, "Overdue", 3, "F87171", [
    {
      title: "Western blot",
      project: "Project A",
      labMember: "Jamie Lee",
      showLabMember: true,
      status: "inProgress",
      dotColor: t.dangerDot,
      start: "Apr 30",
      end: "May 8",
      estimate: "4h",
    },
  ]);
  L.lane(pres, s, 0.65 + 2 * (laneW + gap), laneY, laneW, laneH, t, "Planned", 9, "60A5FA", [
    {
      title: "Reagent QC",
      project: "Project B",
      labMember: "Pat Rivera",
      showLabMember: true,
      status: "planned",
      dotColor: t.okDot,
      start: "May 24",
      end: "May 29",
      estimate: "5h",
    },
  ]);
  L.lane(pres, s, 0.65 + 3 * (laneW + gap), laneY, laneW, laneH, t, "Completed", 4, "4ADE80", [
    {
      title: "Calibration",
      project: "Project C",
      labMember: "Morgan Chen",
      showLabMember: true,
      status: "completed",
      dotColor: t.okDot,
      start: "May 1",
      end: "May 4",
      estimate: "2h",
    },
  ]);
}

function managerReviewSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Review, filter, and prioritize", t, "Manager section");

  textBlock(
    s,
    "Start wide",
    "Use All employees to scan team health. The four top metrics show workload, compliant records, overdue work, and completed tasks missing closeout.",
    0.7,
    1.75,
    3.8,
    2.0,
    "93C5FD",
  );
  textBlock(
    s,
    "Filter to one person",
    "Click an employee tab when you need a focused view. Metrics, cards, rollups, and change history narrow to that employee.",
    4.75,
    1.75,
    3.8,
    2.0,
    "5EEAD4",
  );
  textBlock(
    s,
    "Look for attention signals",
    "Red means overdue. Amber means missing required information. On All employees, use checkboxes to filter Kanban and Gantt to a subset.",
    8.8,
    1.75,
    3.8,
    2.0,
    "FDE68A",
  );

  L.panel(pres, s, 0.7, 4.3, 11.9, 2.35, t);
  s.addText("Employee rollups", {
    x: 1.0,
    y: 4.55,
    w: 11.3,
    h: 0.3,
    fontSize: 15,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const people = [
    ["Alex Sharma", "7 tasks", "6 compliant", "1 flagged", "1 overdue", "On track after calibration closeout."],
    ["Jamie Lee", "6 tasks", "3 compliant", "3 flagged", "2 overdue", "Needs check-in on reagent delay."],
    ["Pat Rivera", "5 tasks", "4 compliant", "1 flagged", "0 overdue", "Next milestone scheduled."],
  ];
  const cardW = 3.55;
  people.forEach((p, i) => {
    const x = 1.05 + i * (cardW + 0.3);
    L.card(pres, s, x, 5.05, cardW, 1.25, t);
    s.addText(p[0], {
      x: x + 0.18,
      y: 5.2,
      w: cardW - 0.36,
      h: 0.2,
      fontSize: 11.5,
      bold: true,
      fontFace: L.FONTS.title,
      color: t.titleText,
      margin: 0,
    });
    s.addText(`${p[1]} · ${p[2]} · ${p[3]} · ${p[4]}`, {
      x: x + 0.18,
      y: 5.52,
      w: cardW - 0.36,
      h: 0.18,
      fontSize: 8.8,
      fontFace: L.FONTS.body,
      color: i === 1 ? "FCA5A5" : t.bodyText,
      margin: 0,
      fit: "shrink",
    });
    s.addText(p[5], {
      x: x + 0.18,
      y: 5.82,
      w: cardW - 0.36,
      h: 0.34,
      fontSize: 8.8,
      italic: true,
      fontFace: L.FONTS.body,
      color: t.mutedText,
      margin: 0,
      fit: "shrink",
    });
  });
}

function managerActionsSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "Manager actions", t, "Manager section");

  L.addBodyText(
    s,
    [
      "Add task lets you assign work to any active lab member from Lab setup.",
      "Fix task opens the same fields employees use, useful for correcting invalid dates or missing information.",
      "Run summary reloads spreadsheet data, saves a snapshot, and powers the change log.",
      "Gantt can show all employees or a selected subset without changing the Kanban tab.",
      "Switch to My tasks when you also run experiments and need the employee workspace.",
    ],
    0.7,
    1.85,
    5.45,
    3.7,
    t,
    13,
  );

  const mx = 6.55;
  const my = 1.75;
  const mw = 6.1;
  const mh = 5.05;
  L.panel(pres, s, mx, my, mw, mh, t);
  s.addText("Add task", {
    x: mx + 0.3,
    y: my + 0.22,
    w: mw - 0.6,
    h: 0.35,
    fontSize: 17,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  L.field(pres, s, "Assign to", "Pat Rivera", mx + 0.3, my + 0.85, mw - 0.6, t);
  const fy = my + 1.75;
  const fW = (mw - 0.9) / 2;
  L.field(pres, s, "Project", "Project B", mx + 0.3, fy, fW, t);
  L.field(pres, s, "Experiment", "Reagent QC", mx + 0.3 + fW + 0.3, fy, fW, t);
  L.field(pres, s, "Status", "Planned", mx + 0.3, fy + 0.76, fW, t);
  L.field(pres, s, "Time estimate", "5h", mx + 0.3 + fW + 0.3, fy + 0.76, fW, t);
  L.field(pres, s, "Start date", "2026-05-24", mx + 0.3, fy + 1.52, fW, t);
  L.field(pres, s, "Projected end date", "2026-05-29", mx + 0.3 + fW + 0.3, fy + 1.52, fW, t);
  L.field(pres, s, "Schematic", "Link or short description", mx + 0.3, fy + 2.28, mw - 0.6, t);
  L.field(pres, s, "Link to data", "Dropbox or Drive link", mx + 0.3, fy + 3.04, mw - 0.6, t);
  L.primaryButton(pres, s, "Add task", mx + 0.3, fy + 3.86, 1.35, t);
  L.secondaryButton(pres, s, "Cancel", mx + 1.8, fy + 3.86, 1.05, t);
}

function changeLogSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "See what changed since the last review", t, "Manager section");

  L.addBodyText(
    s,
    [
      "Run summary records the current dashboard as a snapshot.",
      "Next time, the app compares the new data to the previous snapshot.",
      "Changes are grouped by employee so review meetings start with evidence.",
      "You can see added tasks, removed tasks, and updated fields.",
      "The first run only starts tracking. The second run starts showing differences.",
    ],
    0.7,
    1.85,
    5.45,
    3.5,
    t,
    13,
  );

  const cx = 6.55;
  const cy = 1.75;
  const cw = 6.1;
  const ch = 5.05;
  L.panel(pres, s, cx, cy, cw, ch, t);
  s.addText("Change log since last run", {
    x: cx + 0.3,
    y: cy + 0.22,
    w: cw - 0.6,
    h: 0.34,
    fontSize: 16,
    bold: true,
    fontFace: L.FONTS.title,
    color: t.titleText,
    margin: 0,
  });
  const groups = [
    ["Jamie Lee", "ADDED 1", "UPDATED 2", "Western blot rerun added; Buffer prep estimate changed."],
    ["Pat Rivera", "REMOVED 1", "", "Old plate prep removed after schedule replacement."],
    ["Alex Sharma", "UPDATED 1", "", "Calibration run moved from In Progress to Completed."],
  ];
  let y = cy + 0.9;
  groups.forEach((group, i) => {
    L.card(pres, s, cx + 0.3, y, cw - 0.6, 1.12, t);
    s.addText(group[0], {
      x: cx + 0.5,
      y: y + 0.15,
      w: 2.0,
      h: 0.22,
      fontSize: 11.5,
      bold: true,
      fontFace: L.FONTS.title,
      color: t.accent,
      margin: 0,
    });
    L.pill(pres, s, group[1], cx + cw - 2.05, y + 0.16, 0.75, i === 1 ? "7F1D1D" : "14532D", i === 1 ? "FECACA" : "BBF7D0");
    if (group[2]) {
      L.pill(pres, s, group[2], cx + cw - 1.18, y + 0.16, 0.85, "1E3A8A", "BFDBFE");
    }
    s.addText(group[3], {
      x: cx + 0.5,
      y: y + 0.55,
      w: cw - 1.0,
      h: 0.34,
      fontSize: 9.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
      fit: "shrink",
    });
    y += 1.28;
  });
}

function finalChecklistSlide(n) {
  const s = pres.addSlide();
  L.addSlideFrame(pres, s, t, { footerLeft: FOOT, footerRight: slideNum(n) });
  L.addSlideTitle(s, "First-week checklist", t, "What good usage looks like");

  const checks = [
    ["Employees", "Sign in, connect the right task-log workbook, map columns, and create one test task."],
    ["Employees", "Use Complete for finished work and Resolve overdue for slipped work."],
    ["Employees", "Keep data links, schematics, dates, and result summaries current."],
    ["Managers", "Copy the latest .dmg from Turbo to install or update, then confirm Lab setup, Drive sharing, and Grant task-log access."],
    ["Managers", "Review overdue and missing-closeout metrics at least once per review cycle."],
    ["Managers", "Run summary before check-ins so the change log shows what moved."],
  ];

  let y = 1.75;
  checks.forEach((check, i) => {
    const roleColor = check[0] === "Employees" ? "10B981" : "60A5FA";
    L.card(pres, s, 0.75, y, 11.85, 0.72, t);
    s.addShape(pres.shapes.OVAL, {
      x: 1.02,
      y: y + 0.18,
      w: 0.32,
      h: 0.32,
      fill: { color: roleColor },
      line: { color: roleColor, width: 0 },
    });
    s.addText(String(i + 1), {
      x: 1.02,
      y: y + 0.24,
      w: 0.32,
      h: 0.16,
      fontSize: 8.5,
      bold: true,
      fontFace: L.FONTS.body,
      color: "020617",
      align: "center",
      margin: 0,
    });
    s.addText(check[0], {
      x: 1.55,
      y: y + 0.18,
      w: 1.45,
      h: 0.2,
      fontSize: 10,
      bold: true,
      fontFace: L.FONTS.body,
      color: roleColor,
      margin: 0,
    });
    s.addText(check[1], {
      x: 3.05,
      y: y + 0.16,
      w: 9.2,
      h: 0.28,
      fontSize: 11.5,
      fontFace: L.FONTS.body,
      color: t.bodyText,
      margin: 0,
      fit: "shrink",
    });
    y += 0.82;
  });

  L.panel(pres, s, 0.75, 6.55, 11.85, 0.38, t);
  s.addText("Remember: the spreadsheet is still the official record. The app is the cleaner daily workflow on top of it.", {
    x: 1.0,
    y: 6.65,
    w: 11.35,
    h: 0.16,
    fontSize: 9.2,
    fontFace: L.FONTS.body,
    color: t.mutedText,
    align: "center",
    margin: 0,
  });
}

titleSlide();
overviewSlide();
twoRolesSlide();
sectionDivider("EMPLOYEES", "Employee section", "How to connect your own task log, keep experiment cards current, and close out work cleanly.", "10B981", 3);
employeeSetupSlide(4);
employeeWorkspaceSlide(5);
employeeTaskSlide(6);
employeeCloseoutSlide(7);
ganttSlide(8);
sectionDivider("MANAGERS", "Manager section", "How to set up the team, review lab-wide progress, and act on the work that needs attention.", "60A5FA", 9);
managerSetupSlide(10);
managerDashboardSlide(11);
managerReviewSlide(12);
managerActionsSlide(13);
changeLogSlide(14);
finalChecklistSlide(15);

pres.writeFile({ fileName: OUT }).then((file) => console.log("Wrote", file));
