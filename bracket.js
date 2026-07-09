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

// Round of 16 (match_89-96) - the last round on the legacy hardcoded path.
// Round of 32 (match_73-88) is closed - those predictions are locked in the
// "bracketPredictions" Firestore collection; Round of 16 predictions live in
// their own "bracketPredictionsR16" collection (see bracket-predict.js).
// Every round from QF onward instead uses the generic, data-driven system
// below (getMatchIdsForRound/GENERIC_BRACKET_ROUNDS) - this range is kept
// exactly as-is since R16 is done and not worth migrating.
const PREDICTABLE_MATCH_RANGE = { from: 89, to: 96 };

function getPredictableMatchIds() {
  const ids = [];
  for (let n = PREDICTABLE_MATCH_RANGE.from; n <= PREDICTABLE_MATCH_RANGE.to; n++) {
    ids.push(`match_${n}`);
  }
  return ids;
}

// Rounds handled by the generic, data-driven system (see bracket-predict.js):
// each round's match ids come straight out of BRACKET_SIDES/BRACKET_CENTER
// (fixed once FIFA sets the bracket shape, never edited per round), and
// whether the round is currently open + its deadline come from a
// "roundConfig/{roundKey}" Firestore doc - auto-published by app.js
// (autoPublishReadyRoundConfigs) the moment that round's matches are fully
// decided, so opening a new round needs zero manual steps at all.
// suggestRoundConfig below is kept as a devtools fallback/debug tool in case
// auto-publish ever needs a manual nudge. R32/R16 predate this and stay on
// their own hardcoded path above.
const GENERIC_BRACKET_ROUNDS = ["qf", "sf", "thirdPlace", "final"];
const GENERIC_ROUND_LABELS = {
  qf: "Quarterfinals",
  sf: "Semifinals",
  thirdPlace: "3rd Place Playoff",
  final: "Final",
};
const GENERIC_BRACKET_COLLECTION = "bracketPredictionsByRound";

/**
 * All match ids belonging to a given round key, derived from the fixed
 * bracket shape (BRACKET_SIDES/BRACKET_CENTER) rather than a hand-maintained
 * range - works for any of GENERIC_BRACKET_ROUNDS without further edits.
 * @param {string} roundKey - "qf" | "sf" | "thirdPlace" | "final"
 * @returns {string[]}
 */
function getMatchIdsForRound(roundKey) {
  if (roundKey === "final") return [BRACKET_CENTER.final];
  if (roundKey === "thirdPlace") return [BRACKET_CENTER.thirdPlace];
  return ["left", "right"].flatMap((side) => {
    const column = BRACKET_SIDES[side].find((c) => c.key === roundKey);
    return column ? column.matches : [];
  });
}

/**
 * Computes the { matchCount, deadline } a round's roundConfig doc should
 * have - deadline is 15 minutes before the earliest kickoff among that
 * round's matches, using live match data. Used by autoPublishReadyRoundConfigs
 * (app.js) to auto-open a round; also callable directly from the browser
 * devtools console (e.g. `suggestRoundConfig('qf')`) as a manual fallback if
 * auto-publish ever needs a nudge (e.g. to paste into the Firebase console).
 * @param {string} roundKey - "qf" | "sf" | "thirdPlace" | "final"
 * @returns {{matchCount: number, deadline: string}|null}
 */
function suggestRoundConfig(roundKey) {
  const matchIds = getMatchIdsForRound(roundKey);
  const kickoffs = matchIds
    .map((id) => appState.matchResults[id])
    .filter(Boolean)
    .map((m) => new Date(m.date).getTime())
    .filter((t) => !Number.isNaN(t));

  if (kickoffs.length === 0) {
    console.warn(`suggestRoundConfig: no match data found for round "${roundKey}"`);
    return null;
  }

  const earliestKickoff = Math.min(...kickoffs);
  const deadline = new Date(earliestKickoff - 15 * 60 * 1000).toISOString();
  const result = { matchCount: matchIds.length, deadline };
  console.log(`roundConfig/${roundKey} ->`, result);
  return result;
}

/**
 * The default rendering context: reads real results from appState and never
 * shows score inputs. Every render function below takes a context so the
 * same tree-building code can also power the editable "My Picks" view and
 * its locked read-only view (see bracket-predict.js), which supply their
 * own getMatch/isDecided and an editable flag instead.
 * @returns {object}
 */
function createOfficialBracketContext() {
  return {
    editable: false,
    getMatch(matchId) {
      return appState.matchResults[matchId];
    },
    isDecided(match) {
      return !!match && match.status === "completed";
    },
  };
}

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
 * - knockout winner/loser reference ("W74"/"L101") — resolved by looking up
 *   that match's own result/prediction via the context, so a team advances
 *   on the bracket the moment its feeder match is decided (either a real
 *   completed result, or - for the editable predictions context - the
 *   user's own predicted score for that feeder)
 * - already a real team name — passed through as-is
 * @param {string} team
 * @param {object} [context] - defaults to the official (real-results) context
 * @returns {{name: string|null, isPlaceholder: boolean, subtitle: string, isPredicted: boolean}}
 */
function resolveBracketTeam(team, context) {
  context = context || createOfficialBracketContext();
  if (!team) return { name: null, isPlaceholder: true, subtitle: "", isPredicted: false };

  const winnerMatch = team.match(/^W(\d+)$/);
  const loserMatch = !winnerMatch && team.match(/^L(\d+)$/);

  if (winnerMatch || loserMatch) {
    const feederNum = (winnerMatch || loserMatch)[1];
    const feeder = context.getMatch(`match_${feederNum}`);
    const feederWinnerSide = determineBracketWinner(feeder);

    if (feeder && context.isDecided(feeder) && feederWinnerSide && feederWinnerSide !== "draw") {
      const wantSide = winnerMatch ? feederWinnerSide : feederWinnerSide === "home" ? "away" : "home";
      const resolvedName = wantSide === "home" ? feeder.home : feeder.away;
      const stillPlaceholder = resolvedName && /^([WL]\d+|[123][A-N](\/[A-N])*)$/.test(resolvedName);
      if (resolvedName && !stillPlaceholder) {
        return {
          name: resolvedName,
          isPlaceholder: false,
          subtitle: "",
          isPredicted: feeder.status !== "completed",
        };
      }
    }

    const label = winnerMatch ? "Winner" : "Loser";
    return { name: null, isPlaceholder: true, subtitle: `${label} Match ${feederNum}`, isPredicted: false };
  }

  const groupMatch = team.match(/^([123])([A-N])(\/[A-N])*$/);
  if (groupMatch) {
    const positionLabel = groupMatch[1] === "1" ? "Winner" : groupMatch[1] === "2" ? "Runner-up" : "Best 3rd";
    const groups = team.slice(1).split("/").join("/");
    return { name: null, isPlaceholder: true, subtitle: `${positionLabel} Group ${groups}`, isPredicted: false };
  }

  return { name: team, isPlaceholder: false, subtitle: "", isPredicted: false };
}

/**
 * Build a single bracket match node (compact card for the tree). When
 * context.editable is true and this matchId falls in the predictable range,
 * each resolved team gets a number input instead of a static score, wired
 * to context.onScoreChange.
 * @param {string} matchId
 * @param {string} extraClass - optional extra class (e.g. "bracket-match-final")
 * @param {object} [context] - defaults to the official (real-results) context
 * @returns {HTMLElement}
 */
function createBracketMatchCard(matchId, extraClass, context) {
  context = context || createOfficialBracketContext();
  const wrap = document.createElement("div");
  wrap.className = "bracket-match-wrap";

  const match = context.getMatch(matchId);
  const card = document.createElement("div");
  card.className = `bracket-match ${extraClass || ""}`;

  if (!match) {
    card.innerHTML = '<div class="bracket-team bracket-tbd"><span class="bracket-team-name">TBD</span></div>';
    wrap.appendChild(card);
    return wrap;
  }

  const winner = determineBracketWinner(match);
  const isDecided = context.isDecided(match);
  const statusInfo = getMatchStatus(match);
  const badgeLabel = statusInfo.status === "completed" ? "FINISHED" : statusInfo.label;

  // Only show score inputs once BOTH teams are known - predicting a score
  // against a still-TBD opponent isn't meaningful, even if this side's own
  // team is already resolved.
  const homeInfo = resolveBracketTeam(match.home, context);
  const awayInfo = resolveBracketTeam(match.away, context);
  const bothTeamsKnown = !homeInfo.isPlaceholder && !awayInfo.isPlaceholder;
  const isEditableMatch = !!(
    context.editable &&
    context.isPredictable &&
    context.isPredictable(matchId) &&
    bothTeamsKnown
  );

  const penaltyPickSide = match.predictedPenaltyWinner || null;

  const renderTeamRow = (info, goals, side) => {
    const isWinner = isDecided && winner === side;
    const rowClass = `bracket-team${info.isPlaceholder ? " bracket-tbd" : ""}${isWinner ? " bracket-winner" : ""}`;
    const name = info.isPlaceholder ? "TBD" : info.name;
    const flag = info.isPlaceholder ? "" : `<span class="bracket-flag">${getCountryFlag(info.name)}</span>`;
    const predictedTag = info.isPredicted ? '<span class="bracket-predicted-tag">your pick</span>' : "";
    const pensTag = penaltyPickSide === side ? '<span class="bracket-pens-tag">on pens</span>' : "";
    const subtitle = info.isPlaceholder && info.subtitle ? `<span class="bracket-subtitle">${info.subtitle}</span>` : "";

    let scoreHtml;
    if (isEditableMatch) {
      const value = goals !== null && goals !== undefined ? goals : "";
      scoreHtml = `<input type="number" class="bracket-score-input" min="0" max="20" inputmode="numeric" data-match-id="${matchId}" data-side="${side}" value="${value}" placeholder="-">`;
    } else {
      scoreHtml = goals !== null && goals !== undefined ? `<span class="bracket-score">${goals}</span>` : "";
    }

    return `
      <div class="${rowClass}">
        ${flag}
        <span class="bracket-team-name">${name}${subtitle}${predictedTag}${pensTag}</span>
        ${scoreHtml}
      </div>
    `;
  };

  const penaltyNote = match.penaltyScore
    ? `<div class="bracket-penalty">${match.penaltyScore}</div>`
    : "";

  // In the locked predictions view, _finalResult carries the actual result so
  // both the predicted score (primary) and the real final score can be shown.
  const finalNote = match._finalResult != null
    ? `<div class="bracket-final-score">Final: ${match._finalResult.homeGoals}–${match._finalResult.awayGoals}${match._finalResult.penaltyScore ? ` (${match._finalResult.penaltyScore})` : ""}</div>`
    : "";

  // Only the editable context ever supplies needsPenaltyPick - the official
  // and locked contexts don't, so this is always false there.
  const showPenaltyPrompt = isEditableMatch && context.needsPenaltyPick && context.needsPenaltyPick(matchId);
  const penaltyPromptHtml = showPenaltyPrompt
    ? `<button type="button" class="bracket-penalty-prompt-btn" data-match-id="${matchId}">⚽ Pick penalty winner</button>`
    : "";

  card.innerHTML = `
    <div class="bracket-match-status badge-${statusInfo.status}">${badgeLabel}</div>
    ${renderTeamRow(homeInfo, match.homeGoals, "home")}
    ${renderTeamRow(awayInfo, match.awayGoals, "away")}
    ${penaltyNote}
    ${finalNote}
    ${penaltyPromptHtml}
  `;

  if (showPenaltyPrompt && context.onPenaltyPromptClick) {
    card.querySelector(".bracket-penalty-prompt-btn").addEventListener("click", () => {
      context.onPenaltyPromptClick(matchId);
    });
  }

  if (isEditableMatch && context.onScoreChange) {
    card.querySelectorAll(".bracket-score-input").forEach((input) => {
      input.addEventListener("change", () => {
        context.onScoreChange(matchId, input.dataset.side, input.value);
      });
    });
  }

  wrap.appendChild(card);
  return wrap;
}

/**
 * Build a round column: label + a fixed-height, vertically-centered stack of match cards.
 * @param {object} round - { key, label, matches }
 * @param {object} [context]
 * @returns {HTMLElement}
 */
function createRoundColumn(round, context) {
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
    matchesContainer.appendChild(createBracketMatchCard(matchId, null, context));
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
 * @param {object} [context]
 * @returns {HTMLElement}
 */
function createBracketSide(rounds, mirrored, context) {
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
      side.appendChild(createRoundColumn(piece.round, context));
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
 * @param {object} [context]
 * @returns {HTMLElement}
 */
function createBracketCenter(context) {
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
  finalBlock.appendChild(createBracketMatchCard(BRACKET_CENTER.final, "bracket-match-final", context));
  center.appendChild(finalBlock);

  // Anchored just below the Final block, not pulled into the same height
  // alignment math — it's a separate fixture, not part of the main tree.
  const thirdBlock = document.createElement("div");
  thirdBlock.className = "bracket-round bracket-round-third bracket-third-block";
  const thirdLabel = document.createElement("div");
  thirdLabel.className = "bracket-round-label";
  thirdLabel.textContent = "3rd Place Playoff";
  thirdBlock.appendChild(thirdLabel);
  thirdBlock.appendChild(createBracketMatchCard(BRACKET_CENTER.thirdPlace, "bracket-match-third", context));
  center.appendChild(thirdBlock);

  return center;
}

/**
 * Build the full bracket grid (left side + center + right side) for a given
 * context. Shared by the official read-only view and the editable/locked
 * "My Picks" views in bracket-predict.js.
 * @param {object} [context]
 * @returns {HTMLElement}
 */
function buildBracketGrid(context) {
  context = context || createOfficialBracketContext();
  const grid = document.createElement("div");
  grid.className = "bracket-grid";

  grid.appendChild(createBracketSide(BRACKET_SIDES.left, false, context));
  grid.appendChild(createBracketCenter(context));
  grid.appendChild(createBracketSide(BRACKET_SIDES.right, true, context));

  return grid;
}

/**
 * Apply the current zoom level to the bracket grid and update the toolbar's
 * percentage readout.
 */
function applyBracketZoom() {
  const grid = document.querySelector("#bracket-view-content .bracket-grid") ||
               document.querySelector(".bracket-grid");
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
    const scrollWrap = document.querySelector("#bracket-view-content .bracket-scroll") ||
                       document.querySelector(".bracket-scroll");
    const grid = document.querySelector("#bracket-view-content .bracket-grid") ||
                 document.querySelector(".bracket-grid");
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

// Which bracket sub-view is showing: the official read-only tree, or the
// end user's own predictions (editable / locked, see bracket-predict.js).
let bracketActiveView = "official";

/**
 * Render the knockout bracket view: a header/zoom toolbar shared by both
 * sub-views, an Official/My Picks toggle, and the active sub-view's content.
 * The "My Picks" sub-view is delegated to bracket-predict.js (if loaded) so
 * this file stays usable on its own for the read-only official tree.
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

  if (typeof renderBracketPredictionsView === "function") {
    const toggle = document.createElement("div");
    toggle.className = "bracket-view-toggle";
    toggle.innerHTML = `
      <button type="button" class="bracket-view-btn${bracketActiveView === "official" ? " active" : ""}" data-view="official">🏆 Official Bracket</button>
      <button type="button" class="bracket-view-btn${bracketActiveView === "predict" ? " active" : ""}" data-view="predict">🔮 My Picks</button>
    `;
    toggle.querySelectorAll(".bracket-view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        bracketActiveView = btn.dataset.view;
        renderBracket();
      });
    });
    container.appendChild(toggle);
  }

  const content = document.createElement("div");
  content.id = "bracket-view-content";
  container.appendChild(content);

  if (bracketActiveView === "predict" && typeof renderBracketPredictionsView === "function") {
    renderBracketPredictionsView(content);
  } else {
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "bracket-scroll";
    scrollWrap.appendChild(buildBracketGrid(createOfficialBracketContext()));
    content.appendChild(scrollWrap);
  }

  applyBracketZoom();
}
