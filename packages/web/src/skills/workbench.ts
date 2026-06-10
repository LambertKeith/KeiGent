import { escapeHtml } from "../ui/html.js";
import { normalizeSkillLibrary, type SkillInput, type SkillLibraryInput, type SkillLibraryView, type SkillView } from "./model.js";

export interface SkillWorkbenchStats {
  total: number;
  executable: number;
  needsReview: number;
  blockedOrDeprecated: number;
  withEvalCoverage: number;
}

export interface SkillWorkbenchView {
  library: SkillLibraryView;
  selected?: SkillView;
  stats: SkillWorkbenchStats;
}

export function buildSkillWorkbenchView(input: SkillLibraryInput, selectedSkillName?: string): SkillWorkbenchView {
  const library = normalizeSkillLibrary(input);
  const selected = library.skills.find((skill) => skill.name === selectedSkillName) ?? library.skills[0];

  return {
    library,
    ...(selected ? { selected } : {}),
    stats: {
      total: library.skills.length,
      executable: library.skills.filter((skill) => skill.executable).length,
      needsReview: library.skills.filter((skill) => skill.status === "candidate" || skill.status === "learned-note-only").length,
      blockedOrDeprecated: library.skills.filter((skill) => ["blocked", "deprecated", "quarantined"].includes(skill.status)).length,
      withEvalCoverage: library.skills.filter((skill) => skill.evalCoverageLinks.length > 0).length,
    },
  };
}

export function renderSkillWorkbench(view: SkillWorkbenchView): string {
  if (view.library.empty || !view.selected) {
    return `
      <section class="hero compact"><p class="eyebrow">Skills</p><h1>Skill governance is empty.</h1><p>${escapeHtml(view.library.emptyMessage ?? "No skills loaded")}</p></section>
      <section class="empty-state">Load skills to review trigger conditions, match reasons, eval coverage, and governance state.</section>
    `;
  }

  return `
    <section class="hero compact"><p class="eyebrow">Skills</p><h1>Skill explanations before trust.</h1><p>Inspect why skills match, whether they were injected, and what eval coverage supports them.</p></section>
    <section class="run-stats" aria-label="Skill queues">
      ${renderStat("Total", view.stats.total)}
      ${renderStat("Executable", view.stats.executable)}
      ${renderStat("Needs review", view.stats.needsReview)}
      ${renderStat("Blocked/deprecated", view.stats.blockedOrDeprecated)}
      ${renderStat("With eval coverage", view.stats.withEvalCoverage)}
    </section>
    <section class="workbench-grid">
      <aside class="panel run-list-panel">${renderSkillList(view.library.skills, view.selected.name)}</aside>
      <section class="run-detail-stack">
        ${renderSelectedSkill(view.selected)}
        ${renderMatchExplanations(view.selected)}
        ${renderGovernance(view.selected)}
        ${renderCoverageAndNotes(view.selected)}
      </section>
    </section>
  `;
}

export function sampleSkillInputs(): SkillInput[] {
  return [
    {
      name: "file-write",
      description: "Write files safely with checkpoint evidence.",
      tags: ["file", "write"],
      status: "verified",
      riskLevel: "R2",
      permissionsExpected: ["file.write"],
      evalCoverage: ["file-write-positive"],
    },
    {
      name: "browser-review",
      description: "Candidate browser inspection workflow.",
      tags: ["browser"],
      status: "candidate",
      evalCoverage: ["browser-review-positive"],
    },
    {
      name: "legacy-shell",
      description: "Deprecated shell workflow.",
      tags: ["shell"],
      status: "deprecated",
      deprecationReason: "replaced by governed shell workflow",
    },
  ];
}

function renderSkillList(skills: SkillView[], selectedName: string): string {
  const rows = skills.map((skill) => `
    <button class="run-row ${skill.name === selectedName ? "selected" : ""}" data-skill-name="${escapeHtml(skill.name)}">
      <span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.description)}</small></span>
      <span>${escapeHtml(skill.statusLabel)}</span>
      <span>${skill.executable ? "Executable" : "Not executable"}</span>
      <span>${escapeHtml(skill.recommendedAction)}</span>
    </button>
  `).join("");
  return `<h2>Skill list</h2>${rows}`;
}

function renderSelectedSkill(skill: SkillView): string {
  return panel("Selected skill", `
    <div class="summary-strip">
      ${renderFact("Name", skill.name)}
      ${renderFact("Status", skill.statusLabel)}
      ${renderFact("Executable", skill.executable ? "Yes" : "No")}
      ${renderFact("Action", skill.recommendedAction)}
      ${renderFact("Risk", skill.governance.riskLevel ?? "Not declared")}
      ${renderFact("Eval coverage", String(skill.governance.evalCoverageCount))}
    </div>
    <p class="run-goal">${escapeHtml(skill.description)}</p>
    ${renderListBlock("Trigger conditions", skill.triggerConditions)}
  `);
}

function renderMatchExplanations(skill: SkillView): string {
  const rows = skill.matchExplanations.map((explanation) => `
    <tr>
      <td>${escapeHtml(String(explanation.score))}</td>
      <td>${explanation.matched ? "Matched" : "Not matched"}</td>
      <td>${explanation.injected ? "Injected" : "Not injected"}</td>
      <td>${escapeHtml(explanation.reason)}</td>
      <td>${escapeHtml(explanation.operatorMessage)}</td>
    </tr>
  `).join("");
  return panel("Match explanations", `
    <div class="table-wrap"><table><thead><tr><th>Score</th><th>Match</th><th>Injection</th><th>Reason</th><th>Operator message</th></tr></thead><tbody>${rows || `<tr><td colspan="5">No match explanations recorded</td></tr>`}</tbody></table></div>
  `);
}

function renderGovernance(skill: SkillView): string {
  return panel("Governance", `
    <div class="summary-strip">
      ${renderFact("Version", skill.governance.version ?? "Not reported")}
      ${renderFact("Source", skill.governance.sourceType ?? "Not reported")}
      ${renderFact("Trajectory", skill.governance.sourceTrajectoryId ?? "Not reported")}
      ${renderFact("Permissions", skill.governance.permissionsExpected.join(", ") || "None")}
      ${renderFact("Blocked reason", skill.blockedReason ?? "None")}
      ${renderFact("Deprecated reason", skill.deprecationReason ?? "None")}
    </div>
    ${skill.quarantineReason ? `<p class="run-goal">${escapeHtml(skill.quarantineReason)}</p>` : ""}
  `);
}

function renderCoverageAndNotes(skill: SkillView): string {
  const coverage = skill.evalCoverageLinks.map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`).join("");
  const matches = skill.recentMatches.map((match) => `<li><strong>${escapeHtml(match.skillName)}</strong><span>score ${match.score}, ${match.injected ? "injected" : "not injected"}${match.reason ? `, ${escapeHtml(match.reason)}` : ""}</span></li>`).join("");
  return `
    <div class="split-panels">
      ${panel("Eval coverage", `<ul class="audit-list">${coverage || "<li>No eval coverage recorded</li>"}</ul>`)}
      ${panel("Recent matches and learning", `
        <ul class="audit-list">${matches || "<li>No recent matches recorded</li>"}</ul>
        ${renderListBlock("Learning notes", skill.learningNotes.length ? skill.learningNotes : ["None"])}
      `)}
    </div>
  `;
}

function renderStat(label: string, value: number): string {
  return `<div class="kpi compact"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function renderFact(label: string, value: string): string {
  return `<div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></div>`;
}

function renderListBlock(label: string, items: string[]): string {
  const body = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>None</li>";
  return `<div class="list-block"><strong>${escapeHtml(label)}</strong><ul>${body}</ul></div>`;
}

function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${escapeHtml(title)}</h2>${body}</section>`;
}
