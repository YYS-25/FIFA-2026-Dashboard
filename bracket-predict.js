// bracket-predict.js - End-user bracket predictions ("My Picks")
//
// Lets each of the 5 people predict scores for the current open round (see
// PREDICTABLE_MATCH_RANGE in bracket.js - currently Round of 16, match_89-96).
// Submission is a single, one-time, immutable write to Firestore
// (dashboard/firestore.rules enforces "exactly once" and the deadline - this
// file's checks are UX only, not security). Drafts are saved to localStorage
// as the user fills the bracket in, and nothing reaches Firestore until they
// hit Submit.
//
// Each round gets its own Firestore collection (BRACKET_PREDICTIONS_COLLECTION
// below) rather than reusing the previous round's - a person's prior-round doc
// is immutable (rules forbid update/delete), so a new round needs a fresh
// collection to allow a fresh "create". Bump BRACKET_ROUND_KEY,
// BRACKET_PREDICTIONS_COLLECTION and BRACKET_R16_DEADLINE (renaming it too)
// together, plus PREDICTABLE_MATCH_RANGE in bracket.js and a new additive rule
// block in firestore.rules, when the next round (QF) opens.
//
// Rendering reuses bracket.js's tree-building functions (createBracketMatchCard,
// buildBracketGrid, resolveBracketTeam, ...) via a pluggable "context" object,
// so this file only owns state + the identity/submit UI around that tree.

const BRACKET_PREDICTIONS_DEADLINE = "2026-07-01T19:00:00Z"; // R32 - historical, kept for reference
const BRACKET_ROUND_KEY = "r16";
const BRACKET_PREDICTIONS_COLLECTION = "bracketPredictionsR16";
const BRACKET_R16_DEADLINE = "2026-07-05T19:00:00Z"; // 23:00 GMT+4 Jul 5
const FALLBACK_PEOPLE = ["Ravi", "Preety", "Kunal", "Anisha", "Yeshnav"];

let bracketPredictState = {
  selectedPerson: null,
  pinInput: "",
  draft: {}, // { match_89: { predictedHomeGoals, predictedAwayGoals, predictedPenaltyWinner }, ... }
  submitting: false,
  error: null,
  penaltyModal: null, // { matchId } | null - which match's "who wins on penalties?" popup is open
};

function isPastBracketDeadline() {
  return Date.now() >= new Date(BRACKET_R16_DEADLINE).getTime();
}

/**
 * People who can submit predictions - derived from whoever already has
 * group-stage predictions loaded, so the list stays correct on its own.
 * @returns {string[]}
 */
function getKnownPeople() {
  if (appState.predictions && appState.predictions.length > 0) {
    return Array.from(new Set(appState.predictions.map((p) => p.person))).sort();
  }
  return FALLBACK_PEOPLE;
}

/**
 * SHA-256 hash of a string, hex-encoded (Web Crypto - works on any modern
 * browser served over https or localhost). Used so the raw PIN never
 * touches Firestore, only its hash, which the security rules compare
 * against the admin-seeded value in pins/{person}.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Entry point called by bracket.js's renderBracket() when the "My Picks"
 * sub-view is active.
 * @param {HTMLElement} container
 */
function renderBracketPredictionsView(container) {
  container.classList.add("bracket-predict-view");

  const person = bracketPredictState.selectedPerson;
  if (!person) {
    renderIdentityGate(container);
    return;
  }

  const lockedDoc = appState.bracketPredictions &&
    appState.bracketPredictions[BRACKET_ROUND_KEY] &&
    appState.bracketPredictions[BRACKET_ROUND_KEY][person];
  if (lockedDoc) {
    renderLockedView(container, person, lockedDoc);
    return;
  }

  if (isPastBracketDeadline()) {
    renderClosedBanner(container, person);
    return;
  }

  renderEditableView(container, person);
}

function renderSwitchPersonButton(container) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bracket-predict-switch-link";
  btn.textContent = "Not you? Switch person";
  btn.addEventListener("click", () => {
    bracketPredictState.selectedPerson = null;
    bracketPredictState.error = null;
    bracketPredictState.pinInput = "";
    renderBracket();
  });
  container.appendChild(btn);
}

function renderIdentityGate(container) {
  const people = getKnownPeople();
  const wrap = document.createElement("div");
  wrap.className = "bracket-predict-gate";
  wrap.innerHTML = `
    <p class="bracket-predict-intro">Pick your name to predict scores for the Round of 16 matches.</p>
    <select class="bracket-predict-person-select">
      <option value="">Select your name…</option>
      ${people.map((p) => `<option value="${p}">${p}</option>`).join("")}
    </select>
  `;
  wrap.querySelector("select").addEventListener("change", (e) => {
    const person = e.target.value;
    if (!person) return;
    bracketPredictState.selectedPerson = person;
    bracketPredictState.draft = loadBracketDraft(BRACKET_ROUND_KEY, person);
    bracketPredictState.pinInput = "";
    bracketPredictState.error = null;
    renderBracket();
  });
  container.appendChild(wrap);
}

function renderClosedBanner(container, person) {
  const banner = document.createElement("div");
  banner.className = "bracket-predict-banner bracket-predict-closed";
  banner.innerHTML = `⏰ <strong>Predictions are closed.</strong> ${person} didn't submit before the Round of 16 deadline (${formatDate(BRACKET_R16_DEADLINE)}).`;
  container.appendChild(banner);
  renderSwitchPersonButton(container);
}

/**
 * Context for the editable form: real results where already decided,
 * otherwise this person's own in-progress draft prediction for that match.
 * @param {string} person
 * @returns {object}
 */
function createPredictingContext(person) {
  const draft = bracketPredictState.draft;
  const predictableSet = new Set(getPredictableMatchIds());
  return {
    editable: true,
    isPredictable(matchId) {
      return predictableSet.has(matchId);
    },
    getMatch(matchId) {
      const real = appState.matchResults[matchId];
      if (!real) return null;
      if (real.status === "completed") return real;
      const pick = draft[matchId];
      if (pick && pick.predictedHomeGoals != null && pick.predictedAwayGoals != null) {
        return {
          ...real,
          homeGoals: pick.predictedHomeGoals,
          awayGoals: pick.predictedAwayGoals,
          status: "predicted",
          predictedPenaltyWinner: pick.predictedPenaltyWinner || null,
        };
      }
      return real;
    },
    isDecided(match) {
      return !!match && (match.status === "completed" || match.status === "predicted");
    },
    onScoreChange(matchId, side, rawValue) {
      handleScoreChange(person, matchId, side, rawValue);
    },
    needsPenaltyPick(matchId) {
      const pick = draft[matchId];
      return !!(
        pick &&
        pick.predictedHomeGoals != null &&
        pick.predictedAwayGoals != null &&
        pick.predictedHomeGoals === pick.predictedAwayGoals &&
        !pick.predictedPenaltyWinner
      );
    },
    onPenaltyPromptClick(matchId) {
      bracketPredictState.penaltyModal = { matchId };
      rerenderBracketPreservingScroll();
    },
  };
}

/**
 * Context for the locked read-only view. The predicted score is always shown
 * as the primary score; if the real match has since been played, a small
 * "Final: X-Y" note appears under the card (via match._finalResult) so the
 * person can see how their pick compared to the actual result.
 * @param {object} doc - the loaded bracketPredictions doc { predictions, ... }
 * @returns {object}
 */
function createLockedContext(doc) {
  return {
    editable: false,
    getMatch(matchId) {
      const real = appState.matchResults[matchId];
      if (!real) return null;
      const pick = doc.predictions[matchId];
      // resolveBracketTeam also calls getMatch on *feeder* match IDs (e.g. the
      // Round of 32 match behind a "W83" placeholder) to resolve them into
      // team names - those aren't part of this round's own predictions doc,
      // so there's no pick for them. Return the real (already-completed)
      // result untouched in that case, rather than incorrectly nulling out
      // real goals that are needed to determine the feeder's winner.
      if (!pick) return real;
      return {
        ...real,
        // Predicted scores are always the primary display values.
        homeGoals: pick.predictedHomeGoals,
        awayGoals: pick.predictedAwayGoals,
        predictedPenaltyWinner: pick.predictedPenaltyWinner || null,
        // Clear real penalty note - it belongs to the real result, not the prediction.
        penaltyScore: null,
        // If the real match has finished, attach actual result so the card can
        // render a small "Final: X–Y" note alongside the predicted score.
        _finalResult: real.status === "completed" ? {
          homeGoals: real.homeGoals,
          awayGoals: real.awayGoals,
          penaltyScore: real.penaltyScore || null,
        } : null,
      };
    },
    isDecided(match) {
      return !!match && match.status === "completed";
    },
  };
}

function handleScoreChange(person, matchId, side, rawValue) {
  const parsed = rawValue === "" ? null : parseInt(rawValue, 10);
  const value = parsed === null || Number.isNaN(parsed) ? null : Math.max(0, Math.min(20, parsed));

  if (!bracketPredictState.draft[matchId]) {
    bracketPredictState.draft[matchId] = { predictedHomeGoals: null, predictedAwayGoals: null };
  }
  const key = side === "home" ? "predictedHomeGoals" : "predictedAwayGoals";
  const pick = bracketPredictState.draft[matchId];
  pick[key] = value;

  const bothFilled = pick.predictedHomeGoals != null && pick.predictedAwayGoals != null;
  const isEqual = bothFilled && pick.predictedHomeGoals === pick.predictedAwayGoals;

  if (!isEqual) {
    // Moved away from a draw (or incomplete) - any prior penalty pick is stale.
    if (pick.predictedPenaltyWinner) delete pick.predictedPenaltyWinner;
    if (bracketPredictState.penaltyModal && bracketPredictState.penaltyModal.matchId === matchId) {
      bracketPredictState.penaltyModal = null;
    }
  } else if (!pick.predictedPenaltyWinner) {
    // Just became equal (or still equal with no pick yet) - prompt for it.
    // Equal-to-still-equal (e.g. 2-2 -> 3-3) intentionally keeps an existing
    // pick and doesn't reopen the modal - the pick is about the team, not the scoreline.
    bracketPredictState.penaltyModal = { matchId };
  }

  saveBracketDraft(BRACKET_ROUND_KEY, person, bracketPredictState.draft);
  rerenderBracketPreservingScroll();
}

/**
 * renderBracket() rebuilds the whole tab from scratch, including a brand
 * new .bracket-scroll element - which resets horizontal scroll to 0 every
 * time, yanking the view back to the left edge after each score edit. Save
 * and restore the scroll position around the rebuild to avoid that.
 */
function rerenderBracketPreservingScroll() {
  const scrollWrap = document.querySelector("#bracket .bracket-scroll");
  const scrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;

  renderBracket();

  const newScrollWrap = document.querySelector("#bracket .bracket-scroll");
  if (newScrollWrap) newScrollWrap.scrollLeft = scrollLeft;
}

/**
 * A match counts as fully predicted once both scores are filled - and, if
 * those scores are equal, once a penalty-shootout winner has also been picked.
 * @param {string} matchId
 * @returns {boolean}
 */
function isMatchFullyPredicted(matchId) {
  const pick = bracketPredictState.draft[matchId];
  if (!pick || pick.predictedHomeGoals == null || pick.predictedAwayGoals == null) return false;
  if (pick.predictedHomeGoals === pick.predictedAwayGoals && !pick.predictedPenaltyWinner) return false;
  return true;
}

function countFilledPredictions() {
  return getPredictableMatchIds().filter(isMatchFullyPredicted).length;
}

function renderEditableView(container, person) {
  const banner = document.createElement("div");
  banner.className = "bracket-predict-banner";
  banner.innerHTML = `Filling in predictions as <strong>${person}</strong>.`;
  container.appendChild(banner);
  renderSwitchPersonButton(container);

  const context = createPredictingContext(person);
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "bracket-scroll";
  scrollWrap.appendChild(buildBracketGrid(context));
  container.appendChild(scrollWrap);

  const totalCount = getPredictableMatchIds().length;
  const filledCount = countFilledPredictions();
  const allFilled = filledCount === totalCount;

  const panel = document.createElement("div");
  panel.className = "bracket-predict-submit-panel";
  panel.innerHTML = `
    <div class="bracket-predict-progress">${filledCount} / ${totalCount} matches predicted</div>
    <input type="password" inputmode="numeric" autocomplete="off" maxlength="12" class="bracket-predict-pin-input" placeholder="Your PIN">
    <button type="button" class="bracket-predict-submit-btn"${allFilled && !bracketPredictState.submitting ? "" : " disabled"}>
      ${bracketPredictState.submitting ? "Submitting…" : "🔒 Submit Predictions"}
    </button>
    ${bracketPredictState.error ? `<div class="bracket-predict-error">${bracketPredictState.error}</div>` : ""}
    ${!allFilled ? '<div class="bracket-predict-hint">Predict every match before submitting - this locks them all in at once and can\'t be changed.</div>' : ""}
  `;

  const pinInput = panel.querySelector(".bracket-predict-pin-input");
  pinInput.value = bracketPredictState.pinInput;
  pinInput.addEventListener("input", (e) => {
    bracketPredictState.pinInput = e.target.value;
  });

  panel.querySelector(".bracket-predict-submit-btn").addEventListener("click", () => {
    submitBracketPredictions(person);
  });

  container.appendChild(panel);

  if (bracketPredictState.penaltyModal) {
    renderBracketPenaltyModal(container, person, context);
  }
}

/**
 * "Who wins on penalties?" popup, shown when a knockout match's entered
 * scores are equal. Appended into the same container as the rest of the
 * editable view - position:fixed works correctly there since nothing in the
 * ancestor chain (the bracket's zoom is applied to a sibling subtree) creates
 * a containing block that would confine it.
 * @param {HTMLElement} container
 * @param {string} person
 * @param {object} context - the editable predicting context (for getMatch/resolveBracketTeam)
 */
function renderBracketPenaltyModal(container, person, context) {
  const matchId = bracketPredictState.penaltyModal.matchId;
  const pick = bracketPredictState.draft[matchId];

  // Defends against stale state (e.g. scores changed elsewhere): if this
  // match's draft scores are no longer equal, there's nothing to ask.
  if (!pick || pick.predictedHomeGoals == null || pick.predictedAwayGoals == null ||
      pick.predictedHomeGoals !== pick.predictedAwayGoals) {
    bracketPredictState.penaltyModal = null;
    return;
  }

  const match = context.getMatch(matchId);
  if (!match) {
    bracketPredictState.penaltyModal = null;
    return;
  }

  const homeInfo = resolveBracketTeam(match.home, context);
  const awayInfo = resolveBracketTeam(match.away, context);

  const overlay = document.createElement("div");
  overlay.className = "bracket-penalty-modal-overlay";
  overlay.innerHTML = `
    <div class="bracket-penalty-modal-card">
      <button type="button" class="bracket-penalty-modal-close" aria-label="Close">×</button>
      <p class="bracket-penalty-modal-title">${homeInfo.name} ${pick.predictedHomeGoals}-${pick.predictedAwayGoals} ${awayInfo.name} — who wins on penalties?</p>
      <div class="bracket-penalty-modal-teams">
        <button type="button" class="bracket-penalty-modal-team-btn" data-side="home">${getCountryFlag(homeInfo.name)} ${homeInfo.name}</button>
        <button type="button" class="bracket-penalty-modal-team-btn" data-side="away">${getCountryFlag(awayInfo.name)} ${awayInfo.name}</button>
      </div>
    </div>
  `;

  const closeModal = () => {
    bracketPredictState.penaltyModal = null;
    rerenderBracketPreservingScroll();
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  overlay.querySelector(".bracket-penalty-modal-close").addEventListener("click", closeModal);

  overlay.querySelectorAll(".bracket-penalty-modal-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      pick.predictedPenaltyWinner = btn.dataset.side;
      bracketPredictState.penaltyModal = null;
      saveBracketDraft(BRACKET_ROUND_KEY, person, bracketPredictState.draft);
      rerenderBracketPreservingScroll();
    });
  });

  container.appendChild(overlay);
}

function renderLockedView(container, person, doc) {
  const banner = document.createElement("div");
  banner.className = "bracket-predict-banner bracket-predict-locked";
  const submittedLabel = doc.submittedAt ? formatDate(doc.submittedAt) : "earlier";
  banner.innerHTML = `🔒 <strong>${person}'s predictions are locked in</strong> — submitted ${submittedLabel}.`;
  container.appendChild(banner);
  renderSwitchPersonButton(container);

  const context = createLockedContext(doc);
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "bracket-scroll";
  scrollWrap.appendChild(buildBracketGrid(context));
  container.appendChild(scrollWrap);
}

async function submitBracketPredictions(person) {
  const pin = bracketPredictState.pinInput.trim();
  if (!pin) {
    bracketPredictState.error = "Enter your PIN to submit.";
    renderBracket();
    return;
  }

  const db = getFirestoreDb();
  if (!db) {
    bracketPredictState.error = "Predictions backend isn't configured yet - ask the admin to finish Firebase setup.";
    renderBracket();
    return;
  }

  const predictions = {};
  getPredictableMatchIds().forEach((matchId) => {
    const pick = bracketPredictState.draft[matchId];
    const entry = {
      predictedHomeGoals: pick.predictedHomeGoals,
      predictedAwayGoals: pick.predictedAwayGoals,
    };
    if (pick.predictedHomeGoals === pick.predictedAwayGoals && pick.predictedPenaltyWinner) {
      entry.predictedPenaltyWinner = pick.predictedPenaltyWinner;
    }
    predictions[matchId] = entry;
  });

  bracketPredictState.submitting = true;
  bracketPredictState.error = null;
  renderBracket();

  try {
    const pinHash = await sha256Hex(pin);
    await db.collection(BRACKET_PREDICTIONS_COLLECTION).doc(person).set({
      person,
      pinHash,
      round: BRACKET_ROUND_KEY,
      predictions,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    appState.bracketPredictions = appState.bracketPredictions || {};
    appState.bracketPredictions[BRACKET_ROUND_KEY] = appState.bracketPredictions[BRACKET_ROUND_KEY] || {};
    appState.bracketPredictions[BRACKET_ROUND_KEY][person] = { person, predictions, submittedAt: new Date().toISOString() };
    mergeBracketPredictionsIntoPredictions();
    clearBracketDraft(BRACKET_ROUND_KEY, person);
    bracketPredictState.submitting = false;
    bracketPredictState.pinInput = "";
    renderBracket();
    if (typeof renderLeaderboard === "function") renderLeaderboard();
    if (typeof renderByUser === "function") renderByUser();
  } catch (err) {
    console.error("Bracket prediction submission failed:", err);
    bracketPredictState.submitting = false;
    // Firestore security rules just deny the write - they don't say *why*,
    // so this covers the three possible causes together rather than
    // guessing which one applies.
    bracketPredictState.error =
      `Submission rejected. Double-check your PIN, make sure you haven't already submitted, and that the Round of 16 deadline (${formatDate(BRACKET_R16_DEADLINE)}) hasn't passed.`;
    renderBracket();
  }
}
