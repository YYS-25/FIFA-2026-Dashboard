// FIFA 2026 Dashboard - Knockout Bracket Visualization
// Renders the Round of 32 -> Final knockout tree as a mirrored bracket,
// mirroring the official FIFA 2026 draw shape (verified against data/worldcup.json).

// Fixed height (px) shared by every round/connector column on a side, so that
// each round's matches vertically center between the two matches that feed it
// (space-around on equal-height columns naturally produces correct alignment).
// Generous enough to give the Round of 32 column real breathing room between cards.
const BRACKET_TOTAL_HEIGHT = 1000;

// Current zoom level, persisted across re-renders (e.g. after Refresh) so the
// user doesn't lose their place. CSS `zoom` shrinks both the cards and the
// scrollable area together, so "zoomed out" actually reveals more of the tree.
let bracketZoomLevel = 1;
const BRACKET_ZOOM_MIN = 0.4;
const BRACKET_ZOOM_MAX = 1.3;
const BRACKET_ZOOM_STEP = 0.1;

// Each round's match IDs are ordered so that consecutive pairs feed the same
// next-round match (e.g. left R32 pairs (74,77)->89, (73,75)->90, ...).
const BRACKET_SIDES = {
  left: [
    { key: "r32", label: "Round of 32", matches: ["match_74", "match_77", "match_73", "match_75", "match_83", "match_84", "match_81", "match_82"] },
    { key: "r16", label: "Round of 16", matches: ["match_89", "match_90", "match_93", "match_94"] },
    { key: "qf", label: "Quarterfinals", matches: ["match_97", "match_98"] },
    { key: "sf", label: "Semifinals", matches: ["match_101"] },
  ],
  right: [
    { key: "r32", label: "Round of 32", matches: ["match_76", "match_78", "match_79", "match_80", "match_86", "match_88", "match_85", "match_87"] },
    { key: "r16", label: "Round of 16", matches: ["match_91", "match_92", "match_95", "match_96"] },
    { key: "qf", label: "Quarterfinals", matches: ["match_99", "match_100"] },
    { key: "sf", label: "Semifinals", matches: ["match_102"] },
  ],
};

const BRACKET_CENTER = {
  final: "match_104",
  thirdPlace: "match_103",
};

/**
 * Determine the winner of a knockout match, accounting for penalty shootouts.
 * Regular/extra-time goals decide it when they differ; when they're level,
 * a recorded penalty score ("3-4 pen.") breaks the tie by penalty goals.
 * @param {object} match
 * @returns {"home"|"away"|"draw"|null}
 */
function determineBracketWinner(match) {
  if (!match) return null;

  const regular = determineWinner(match.homeGoals, match.awayGoals);
  if (regular && regular !== "draw") return regular;

  if (match.penaltyScore) {
    const penMatch = match.penaltyScore.match(/(\d+)-(\d+)/);
    if (penMatch) {
      const homePens = parseInt(penMatch[1], 10);
      const awayPens = parseInt(penMatch[2], 10);
      if (homePens > awayPens) return "home";
      if (awayPens > homePens) return "away";
    }
  }

  return regular;
}

/**
 * Resolve a team field that may still be a placeholder:
 * - group position code ("2A", "3A/B/C/D/F") — can't be resolved client-side
 * - knockout winner/loser reference ("W74"/"L101") — resolved locally by
 *   looking up that match's own result, so a team advances on the bracket
 *   the moment its feeder match is decided, without waiting for the
 *   upstream data source to rewrite the next round's fixture text
 * - already a real team name — passed through as-is
 * @param {string} team
 * @returns {{name: string|null, isPlaceholder: boolean, subtitle: string}}
 */
function resolveBracketTeam(team) {
  if (!team) return { name: null, isPlaceholder: true, subtitle: "" };

  const winnerMatch = team.match(/^W(\d+)$/);
  const loserMatch = !winnerMatch && team.match(/^L(\d+)$/);

  if (winnerMatch || loserMatch) {
    const feederNum = (winnerMatch || loserMatch)[1];
    const feeder = appState.matchResults[`match_${feederNum}`];
    const feederWinnerSide = determineBracketWinner(feeder);

    if (feeder && feeder.status === "completed" && feederWinnerSide && feederWinnerSide !== "draw") {
      const wantSide = winnerMatch ? feederWinnerSide : feederWinnerSide === "home" ? "away" : "home";
      const resolvedName = wantSide === "home" ? feeder.home : feeder.away;
      const stillPlaceholder = resolvedName && /^([WL]\d+|[123][A-N](\/[A-N])*)$/.test(resolvedName);
      if (resolvedName && !stillPlaceholder) {
        return { name: resolvedName, isPlaceholder: false, subtitle: "" };
      }
    }

    const label = winnerMatch ? "Winner" : "Loser";
    return { name: null, isPlaceholder: true, subtitle: `${label} Match ${feederNum}` };
  }

  const groupMatch = team.match(/^([123])([A-N])(\/[A-N])*$/);
  if (groupMatch) {
    const positionLabel = groupMatch[1] === "1" ? "Winner" : groupMatch[1] === "2" ? "Runner-up" : "Best 3rd";
    const groups = team.slice(1).split("/").join("/");
    return { name: null, isPlaceholder: true, subtitle: `${positionLabel} Group ${groups}` };
  }

  return { name: team, isPlaceholder: false, subtitle: "" };
}

/**
 * Build a single bracket match node (compact card for the tree).
 * @param {string} matchId
 * @param {string} extraClass - optional extra class (e.g. "bracket-match-final")
 * @returns {HTMLElement}
 */
function createBracketMatchCard(matchId, extraClass) {
  const wrap = document.createElement("div");
  wrap.className = "bracket-match-wrap";

  const match = appState.matchResults[matchId];
  const card = document.createElement("div");
  card.className = `bracket-match ${extraClass || ""}`;

  if (!match) {
    card.innerHTML = '<div class="bracket-team bracket-tbd"><span class="bracket-team-name">TBD</span></div>';
    wrap.appendChild(card);
    return wrap;
  }

  const winner = determineBracketWinner(match);
  const isCompleted = match.status === "completed";
  const statusInfo = getMatchStatus(match);
  const badgeLabel = statusInfo.status === "completed" ? "FINISHED" : statusInfo.label;

  const renderTeamRow = (team, goals, side) => {
    const info = resolveBracketTeam(team);
    const isWinner = isCompleted && winner === side;
    const rowClass = `bracket-team${info.isPlaceholder ? " bracket-tbd" : ""}${isWinner ? " bracket-winner" : ""}`;
    const name = info.isPlaceholder ? "TBD" : info.name;
    const flag = info.isPlaceholder ? "" : `<span class="bracket-flag">${getCountryFlag(info.name)}</span>`;
    const score = goals !== null && goals !== undefined ? `<span class="bracket-score">${goals}</span>` : "";
    const subtitle = info.isPlaceholder && info.subtitle ? `<span class="bracket-subtitle">${info.subtitle}</span>` : "";
    return `
      <div class="${rowClass}">
        ${flag}
        <span class="bracket-team-name">${name}${subtitle}</span>
        ${score}
      </div>
    `;
  };

  const penaltyNote = match.penaltyScore
    ? `<div class="bracket-penalty">${match.penaltyScore}</div>`
    : "";

  card.innerHTML = `
    <div class="bracket-match-status badge-${statusInfo.status}">${badgeLabel}</div>
    ${renderTeamRow(match.home, match.homeGoals, "home")}
    ${renderTeamRow(match.away, match.awayGoals, "away")}
    ${penaltyNote}
  `;

  wrap.appendChild(card);
  return wrap;
}

/**
 * Build a round column: label + a fixed-height, vertically-centered stack of match cards.
 * @param {object} round - { key, label, matches }
 * @returns {HTMLElement}
 */
function createRoundColumn(round) {
  const col = document.createElement("div");
  col.className = `bracket-round bracket-round-${round.key}`;

  const label = document.createElement("div");
  label.className = "bracket-round-label";
  label.textContent = round.label;
  col.appendChild(label);

  const matchesContainer = document.createElement("div");
  matchesContainer.className = "bracket-round-matches";
  matchesContainer.style.height = `${BRACKET_TOTAL_HEIGHT}px`;
  round.matches.forEach((matchId) => {
    matchesContainer.appendChild(createBracketMatchCard(matchId));
  });
  col.appendChild(matchesContainer);

  return col;
}

/**
 * Build a connector column joining `sourceCount` matches in the previous round
 * down to `sourceCount / 2` matches in the next round, with vertical bars and
 * stub lines. Mirrored for the right side of the bracket.
 * @param {number} sourceCount
 * @param {boolean} mirrored
 * @returns {HTMLElement}
 */
function createConnectorColumn(sourceCount, mirrored) {
  const col = document.createElement("div");
  col.className = "bracket-connector-spacer";

  const connector = document.createElement("div");
  connector.className = "bracket-connector-col";
  connector.style.height = `${BRACKET_TOTAL_HEIGHT}px`;

  const barCount = sourceCount / 2;
  const barHeight = BRACKET_TOTAL_HEIGHT / sourceCount;

  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement("div");
    bar.className = `bracket-connector-bar${mirrored ? " mirrored" : ""}`;
    bar.style.height = `${barHeight}px`;
    bar.innerHTML = `
      <span class="conn-line conn-v"></span>
      <span class="conn-line conn-top"></span>
      <span class="conn-line conn-bottom"></span>
      <span class="conn-line conn-out"></span>
    `;
    connector.appendChild(bar);
  }

  col.appendChild(connector);
  return col;
}

/**
 * Build one side (left or right) of the bracket: rounds interleaved with connectors.
 * @param {Array} rounds - BRACKET_SIDES.left or BRACKET_SIDES.right
 * @param {boolean} mirrored - true for the right side (DOM + connector direction flipped)
 * @returns {HTMLElement}
 */
function createBracketSide(rounds, mirrored) {
  const side = document.createElement("div");
  side.className = `bracket-side ${mirrored ? "bracket-side-right" : "bracket-side-left"}`;

  const pieces = [];
  rounds.forEach((round, i) => {
    pieces.push({ type: "round", round });
    if (i < rounds.length - 1) {
      pieces.push({ type: "connector", sourceCount: round.matches.length });
    }
  });

  const ordered = mirrored ? [...pieces].reverse() : pieces;

  ordered.forEach((piece) => {
    if (piece.type === "round") {
      side.appendChild(createRoundColumn(piece.round));
    } else {
      side.appendChild(createConnectorColumn(piece.sourceCount, mirrored));
    }
  });

  return side;
}

/**
 * Build the center column: Final true-centered on the column (matching the
 * semifinal convergence point on both sides), Third Place Playoff anchored
 * directly beneath it.
 * @returns {HTMLElement}
 */
function createBracketCenter() {
  const center = document.createElement("div");
  center.className = "bracket-center";
  center.style.height = `${BRACKET_TOTAL_HEIGHT}px`;

  // Absolutely positioned at top:50% + translateY(-50%) so the Final card's
  // own vertical center lands exactly on the column midpoint, regardless of
  // the card's content height.
  const finalBlock = document.createElement("div");
  finalBlock.className = "bracket-round bracket-round-final bracket-final-block";
  const finalLabel = document.createElement("div");
  finalLabel.className = "bracket-round-label bracket-final-label";
  finalLabel.textContent = "🏆 Final";
  finalBlock.appendChild(finalLabel);
  finalBlock.appendChild(createBracketMatchCard(BRACKET_CENTER.final, "bracket-match-final"));
  center.appendChild(finalBlock);

  // Anchored just below the Final block, not pulled into the same height
  // alignment math — it's a separate fixture, not part of the main tree.
  const thirdBlock = document.createElement("div");
  thirdBlock.className = "bracket-round bracket-round-third bracket-third-block";
  const thirdLabel = document.createElement("div");
  thirdLabel.className = "bracket-round-label";
  thirdLabel.textContent = "3rd Place Playoff";
  thirdBlock.appendChild(thirdLabel);
  thirdBlock.appendChild(createBracketMatchCard(BRACKET_CENTER.thirdPlace, "bracket-match-third"));
  center.appendChild(thirdBlock);

  return center;
}

/**
 * Apply the current zoom level to the bracket grid and update the toolbar's
 * percentage readout.
 */
function applyBracketZoom() {
  const grid = document.querySelector(".bracket-grid");
  const readout = document.querySelector(".bracket-zoom-readout");
  if (!grid) return;
  grid.style.zoom = bracketZoomLevel;
  if (readout) readout.textContent = `${Math.round(bracketZoomLevel * 100)}%`;
}

/**
 * Build the zoom toolbar (zoom out / fit / zoom in / reset) pinned above the
 * bracket so the full tree can be shrunk down to fit the screen.
 * @returns {HTMLElement}
 */
function createBracketZoomToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "bracket-zoom-toolbar";

  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.type = "button";
  zoomOutBtn.className = "bracket-zoom-btn";
  zoomOutBtn.setAttribute("aria-label", "Zoom out");
  zoomOutBtn.textContent = "−";
  zoomOutBtn.addEventListener("click", () => {
    bracketZoomLevel = Math.max(BRACKET_ZOOM_MIN, +(bracketZoomLevel - BRACKET_ZOOM_STEP).toFixed(2));
    applyBracketZoom();
  });

  const readout = document.createElement("span");
  readout.className = "bracket-zoom-readout";
  readout.textContent = `${Math.round(bracketZoomLevel * 100)}%`;

  const zoomInBtn = document.createElement("button");
  zoomInBtn.type = "button";
  zoomInBtn.className = "bracket-zoom-btn";
  zoomInBtn.setAttribute("aria-label", "Zoom in");
  zoomInBtn.textContent = "+";
  zoomInBtn.addEventListener("click", () => {
    bracketZoomLevel = Math.min(BRACKET_ZOOM_MAX, +(bracketZoomLevel + BRACKET_ZOOM_STEP).toFixed(2));
    applyBracketZoom();
  });

  const fitBtn = document.createElement("button");
  fitBtn.type = "button";
  fitBtn.className = "bracket-zoom-btn bracket-zoom-fit";
  fitBtn.textContent = "Fit all";
  fitBtn.addEventListener("click", () => {
    const scrollWrap = document.querySelector(".bracket-scroll");
    const grid = document.querySelector(".bracket-grid");
    if (!scrollWrap || !grid) return;
    const previousZoom = bracketZoomLevel;
    grid.style.zoom = 1;
    const naturalWidth = grid.scrollWidth;
    bracketZoomLevel = Math.max(
      BRACKET_ZOOM_MIN,
      Math.min(1, +(scrollWrap.clientWidth / naturalWidth).toFixed(2))
    );
    if (Number.isNaN(bracketZoomLevel) || bracketZoomLevel <= 0) {
      bracketZoomLevel = previousZoom;
    }
    applyBracketZoom();
    scrollWrap.scrollLeft = 0;
  });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "bracket-zoom-btn bracket-zoom-reset";
  resetBtn.textContent = "100%";
  resetBtn.addEventListener("click", () => {
    bracketZoomLevel = 1;
    applyBracketZoom();
  });

  toolbar.appendChild(zoomOutBtn);
  toolbar.appendChild(readout);
  toolbar.appendChild(zoomInBtn);
  toolbar.appendChild(fitBtn);
  toolbar.appendChild(resetBtn);

  return toolbar;
}

/**
 * Render the knockout bracket view
 */
function renderBracket() {
  const container = document.getElementById("bracket");
  if (!container) return;

  if (!appState.matchResults || Object.keys(appState.matchResults).length === 0) {
    container.innerHTML = '<p class="text-center text-secondary">No data loaded. Please refresh.</p>';
    return;
  }

  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "tab-header bracket-header";
  header.innerHTML = "<h2>Knockout Bracket</h2>";
  header.appendChild(createBracketZoomToolbar());
  container.appendChild(header);

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "bracket-scroll";

  const grid = document.createElement("div");
  grid.className = "bracket-grid";

  grid.appendChild(createBracketSide(BRACKET_SIDES.left, false));
  grid.appendChild(createBracketCenter());
  grid.appendChild(createBracketSide(BRACKET_SIDES.right, true));

  scrollWrap.appendChild(grid);
  container.appendChild(scrollWrap);

  applyBracketZoom();
}
