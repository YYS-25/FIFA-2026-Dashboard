// bracket-predict.js - End-user bracket predictions ("My Picks")
//
// Lets each of the 5 people predict scores for the current open round.
// Submission is a single, one-time, immutable write to Firestore
// (dashboard/firestore.rules enforces "exactly once" and the deadline - this
// file's checks are UX only, not security). Drafts are saved to localStorage
// as the user fills the bracket in, and nothing reaches Firestore until they
// hit Submit.
//
// Round of 32 and Round of 16 predate the generic system below and each got
// their own hardcoded Firestore collection + deadline (BRACKET_ROUND_KEY /
// BRACKET_PREDICTIONS_COLLECTION / BRACKET_R16_DEADLINE) - kept as-is here,
// untouched, since those rounds are done. Every round from QF onward instead
// derives its match ids from bracket.js's fixed BRACKET_SIDES/BRACKET_CENTER
// shape and its deadline from a "roundConfig/{round}" Firestore doc -
// auto-published by app.js (autoPublishReadyRoundConfigs) the moment that
// round's matches are fully decided, so a new round opens on its own with no
// manual step at all.
//
// Usually only one generic round is open at a time (QF, then SF, ...) - but
// 3rd Place and Final both become decided at the same moment (right after
// the semifinals finish), are played close together, and are meant to be
// predicted together in one sitting. getOpenGenericRoundKeys() can return
// more than one round at once for exactly this case; buildCombinedDescriptor
// merges whichever rounds a person hasn't locked in yet into a single
// editable view + one PIN + one Submit click, while still writing one
// independent Firestore doc per underlying round under the hood (each keeps
// its own collection/validation, unaffected by this being predicted jointly).
//
// Rendering reuses bracket.js's tree-building functions (createBracketMatchCard,
// buildBracketGrid, resolveBracketTeam, ...) via a pluggable "context" object,
// so this file only owns state + the identity/submit UI around that tree.

const BRACKET_PREDICTIONS_DEADLINE = "2026-07-01T19:00:00Z"; // R32 - historical, kept for reference
const BRACKET_ROUND_KEY = "r16";
const BRACKET_PREDICTIONS_COLLECTION = "bracketPredictionsR16";
const BRACKET_R16_DEADLINE = "2026-07-16T00:00:00Z"; // reopened briefly so Kunal/Anisha can self-serve submit; R16 matches are already over so this is just a submission-window extension, not a real prediction deadline
const FALLBACK_PEOPLE = ["Ravi", "Preety", "Kunal", "Anisha", "Yeshnav"];

let bracketPredictState = {
  selectedPerson: null,
  draftLoadedFor: null, // { person, draftKey } the in-memory draft below was last loaded for
  pinInput: "",
  draft: {}, // { match_89: { predictedHomeGoals, predictedAwayGoals, predictedPenaltyWinner }, ... }
  submitting: false,
  error: null,
  penaltyModal: null, // { matchId } | null - which match's "who wins on penalties?" popup is open
};

/**
 * Every generic round (QF onward) that currently has a published roundConfig
 * doc, in fixed tournament order. Usually a single entry, but 3rd Place and
 * Final both land here at once once the semifinals are done - see the file
 * header comment.
 * @returns {string[]}
 */
function getOpenGenericRoundKeys() {
  const configs = appState.roundConfigs || {};
  return GENERIC_BRACKET_ROUNDS.filter((key) => configs[key]);
}

/**
 * Build the round descriptor for a specific round key - either the legacy
 * Round of 16 (BRACKET_ROUND_KEY) or any generic round with a published
 * roundConfig doc.
 * @param {string} roundKey
 * @returns {{roundKey: string, label: string, collection: string, matchIds: string[], deadline: string, isGeneric: boolean}}
 */
function getRoundDescriptorForKey(roundKey) {
  if (roundKey === BRACKET_ROUND_KEY) {
    return {
      roundKey: BRACKET_ROUND_KEY,
      label: "Round of 16",
      collection: BRACKET_PREDICTIONS_COLLECTION,
      matchIds: getPredictableMatchIds(),
      deadline: BRACKET_R16_DEADLINE,
      isGeneric: false,
    };
  }

  const config = (appState.roundConfigs || {})[roundKey];
  return {
    roundKey,
    label: GENERIC_ROUND_LABELS[roundKey],
    collection: GENERIC_BRACKET_COLLECTION,
    matchIds: getMatchIdsForRound(roundKey),
    deadline: config ? config.deadline : null,
    isGeneric: true,
  };
}

/**
 * Combine one or more round "leaf" descriptors into a single descriptor
 * describing everything currently pending for a person - almost always one
 * round, but 3rd Place and Final together once both are open (see file
 * header). Submitting a combined descriptor still writes one independent
 * Firestore doc per underlying round (via subDescriptors), just from a
 * single editable view / PIN entry / Submit click.
 * @param {string[]} roundKeys
 * @returns {{subDescriptors: object[], draftKey: string, matchIds: string[], label: string, deadline: string}}
 */
function buildCombinedDescriptor(roundKeys) {
  const subDescriptors = roundKeys.map(getRoundDescriptorForKey);
  const deadline = subDescriptors.reduce((earliest, d) => {
    if (!d.deadline) return earliest;
    return !earliest || new Date(d.deadline) < new Date(earliest) ? d.deadline : earliest;
  }, null);

  return {
    subDescriptors,
    draftKey: roundKeys.join("+"),
    matchIds: subDescriptors.flatMap((d) => d.matchIds),
    label: subDescriptors.map((d) => d.label).join(" & "),
    deadline,
  };
}

/**
 * Merge already-locked docs across multiple rounds into one doc-shaped
 * object, so the locked view can show everything a person has submitted
 * (e.g. both 3rd Place and Final) together instead of picking just one.
 * @param {string[]} roundKeys
 * @param {string} person
 * @returns {{person: string, predictions: object, submittedAt: string|null}}
 */
function buildMergedLockedDoc(roundKeys, person) {
  const predictions = {};
  let latestSubmittedAt = null;
  roundKeys.forEach((roundKey) => {
    const doc = appState.bracketPredictions && appState.bracketPredictions[roundKey] && appState.bracketPredictions[roundKey][person];
    if (!doc) return;
    Object.assign(predictions, doc.predictions);
    if (doc.submittedAt && (!latestSubmittedAt || doc.submittedAt > latestSubmittedAt)) {
      latestSubmittedAt = doc.submittedAt;
    }
  });
  return { person, predictions, submittedAt: latestSubmittedAt };
}

/**
 * Load bracketPredictState.draft for (person, draftKey) if it isn't already
 * loaded for that exact pair - avoids clobbering in-progress edits on every
 * re-render (score edits call renderBracket() themselves) while still
 * picking up the right draft whenever the person or the pending rounds change.
 * @param {string} person
 * @param {string} draftKey
 */
function ensureDraftLoaded(person, draftKey) {
  const loadedFor = bracketPredictState.draftLoadedFor;
  if (loadedFor && loadedFor.person === person && loadedFor.draftKey === draftKey) return;
  bracketPredictState.draft = loadBracketDraft(draftKey, person);
  bracketPredictState.draftLoadedFor = { person, draftKey };
}

function isPastBracketDeadline(descriptor) {
  return Date.now() >= new Date(descriptor.deadline).getTime();
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

  const openGenericRounds = getOpenGenericRoundKeys();
  const roundKeys = openGenericRounds.length > 0 ? openGenericRounds : [BRACKET_ROUND_KEY];

  const person = bracketPredictState.selectedPerson;
  if (!person) {
    renderIdentityGate(container, roundKeys);
    return;
  }

  const isLocked = (key) => !!(appState.bracketPredictions && appState.bracketPredictions[key] && appState.bracketPredictions[key][person]);
  const pendingRoundKeys = roundKeys.filter((key) => !isLocked(key));

  if (pendingRoundKeys.length === 0) {
    // Everything currently open is already locked in - show it all together
    // (e.g. both 3rd Place and Final once both have been submitted).
    renderLockedView(container, person, buildMergedLockedDoc(roundKeys, person));
    return;
  }

  // Predict everything still pending in one sitting - usually a single
  // round, but 3rd Place and Final together once the semifinals are done.
  const descriptor = buildCombinedDescriptor(pendingRoundKeys);
  ensureDraftLoaded(person, descriptor.draftKey);

  if (isPastBracketDeadline(descriptor)) {
    renderClosedBanner(container, person, descriptor);
    return;
  }

  renderEditableView(container, person, descriptor);
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

function renderIdentityGate(container, roundKeys) {
  const people = getKnownPeople();
  const labels = roundKeys.map((key) => key === BRACKET_ROUND_KEY ? "Round of 16" : GENERIC_ROUND_LABELS[key]);
  const labelText = labels.length > 1
    ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
    : labels[0];

  const wrap = document.createElement("div");
  wrap.className = "bracket-predict-gate";
  wrap.innerHTML = `
    <p class="bracket-predict-intro">Pick your name to predict scores for the ${labelText} matches.</p>
    <select class="bracket-predict-person-select">
      <option value="">Select your name…</option>
      ${people.map((p) => `<option value="${p}">${p}</option>`).join("")}
    </select>
  `;
  wrap.querySelector("select").addEventListener("change", (e) => {
    const person = e.target.value;
    if (!person) return;
    bracketPredictState.selectedPerson = person;
    bracketPredictState.pinInput = "";
    bracketPredictState.error = null;
    renderBracket();
  });
  container.appendChild(wrap);
}

function renderClosedBanner(container, person, descriptor) {
  const banner = document.createElement("div");
  banner.className = "bracket-predict-banner bracket-predict-closed";
  banner.innerHTML = `⏰ <strong>Predictions are closed.</strong> ${person} didn't submit before the ${descriptor.label} deadline (${formatDate(descriptor.deadline)}).`;
  container.appendChild(banner);
  renderSwitchPersonButton(container);
}

/**
 * Context for the editable form: real results where already decided,
 * otherwise this person's own in-progress draft prediction for that match.
 * @param {string} person
 * @returns {object}
 */
function createPredictingContext(person, descriptor) {
  const draft = bracketPredictState.draft;
  const predictableSet = new Set(descriptor.matchIds);
  return {
    editable: true,
    isPredictable(matchId) {
      return predictableSet.has(matchId);
    },
    getMatch(matchId) {
      const real = appState.matchResults[matchId];
      if (!real) return null;
      const isOwnMatch = predictableSet.has(matchId);
      // Feeder matches from earlier rounds (referenced only to resolve a
      // "W83"-style placeholder into a team name) should show their real,
      // completed result as normal. But a match that's actually one of THIS
      // round's own predictable matches must never leak its real score into
      // a not-yet-submitted person's editable view, even if it has already
      // been played by the time they get around to submitting (e.g. the
      // deadline got pushed past kickoff for stragglers) - so this only
      // early-returns the real result for matches outside our own set.
      if (real.status === "completed" && !isOwnMatch) return real;
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
      if (isOwnMatch) {
        // No draft pick yet - blank the score (even though the real match
        // may have already been played) and present it as not-yet-decided,
        // so it renders as an empty input rather than showing the answer.
        return { ...real, homeGoals: null, awayGoals: null, status: "upcoming" };
      }
      return real;
    },
    isDecided(match) {
      return !!match && (match.status === "completed" || match.status === "predicted");
    },
    onScoreChange(matchId, side, rawValue) {
      handleScoreChange(person, matchId, side, rawValue, descriptor.draftKey);
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

function handleScoreChange(person, matchId, side, rawValue, draftKey) {
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

  saveBracketDraft(draftKey, person, bracketPredictState.draft);
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

function countFilledPredictions(descriptor) {
  return descriptor.matchIds.filter(isMatchFullyPredicted).length;
}

function renderEditableView(container, person, descriptor) {
  const banner = document.createElement("div");
  banner.className = "bracket-predict-banner";
  banner.innerHTML = `Filling in ${descriptor.label} predictions as <strong>${person}</strong>.`;
  container.appendChild(banner);
  renderSwitchPersonButton(container);

  const context = createPredictingContext(person, descriptor);
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "bracket-scroll";
  scrollWrap.appendChild(buildBracketGrid(context));
  container.appendChild(scrollWrap);

  const totalCount = descriptor.matchIds.length;
  const filledCount = countFilledPredictions(descriptor);
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
    submitBracketPredictions(person, descriptor);
  });

  container.appendChild(panel);

  if (bracketPredictState.penaltyModal) {
    renderBracketPenaltyModal(container, person, context, descriptor);
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
 * @param {object} descriptor - the active (possibly combined) round descriptor, for saving the draft under the right key
 */
function renderBracketPenaltyModal(container, person, context, descriptor) {
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
      saveBracketDraft(descriptor.draftKey, person, bracketPredictState.draft);
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

async function submitBracketPredictions(person, descriptor) {
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

  bracketPredictState.submitting = true;
  bracketPredictState.error = null;
  renderBracket();

  try {
    const pinHash = await sha256Hex(pin);

    // One Firestore doc per underlying round even when this is a combined
    // submission (e.g. 3rd Place + Final entered together) - each round
    // keeps its own collection/doc-id/validation, exactly as if it had been
    // submitted on its own. Legacy rounds (R32/R16) keep doc id = person;
    // generic rounds (QF onward) share one collection, so the doc id needs
    // the round baked in too ("qf_Kunal") - see bracketPredictionsByRound in
    // firestore.rules.
    for (const sub of descriptor.subDescriptors) {
      const predictions = {};
      sub.matchIds.forEach((matchId) => {
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

      const docId = sub.isGeneric ? `${sub.roundKey}_${person}` : person;
      await db.collection(sub.collection).doc(docId).set({
        person,
        pinHash,
        round: sub.roundKey,
        predictions,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      appState.bracketPredictions = appState.bracketPredictions || {};
      appState.bracketPredictions[sub.roundKey] = appState.bracketPredictions[sub.roundKey] || {};
      appState.bracketPredictions[sub.roundKey][person] = { person, predictions, submittedAt: new Date().toISOString() };
      clearBracketDraft(sub.roundKey, person);
    }

    clearBracketDraft(descriptor.draftKey, person);
    mergeBracketPredictionsIntoPredictions();
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
    // guessing which one applies. If this was a combined submission and one
    // round's write already succeeded before the failure, the next render
    // picks that up from appState.bracketPredictions and only re-offers the
    // round(s) still actually pending.
    bracketPredictState.error =
      `Submission rejected. Double-check your PIN, make sure you haven't already submitted, and that the ${descriptor.label} deadline (${formatDate(descriptor.deadline)}) hasn't passed.`;
    renderBracket();
  }
}
