// FIFA 2026 Dashboard Application
// Main application entry point

// Global state object
let appState = {
  predictions: [],
  matchResults: {},
  lastUpdated: null,
  error: null,
};

// Configuration constants
const PREDICTIONS_JSON_URL = "./predictions.json";
const OPENFOOTBALL_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

/**
 * Fetch predictions from local JSON export (already loaded by fetchPredictionsAndMatches)
 * @returns {Promise<void>}
 */
async function fetchPredictions() {
  try {
    if (!predictionsData) {
      throw new Error(
        "Predictions not loaded. Call fetchPredictionsAndMatches first.",
      );
    }

    const predictions = [];

    // Flatten nested structure: each person's predictions array into flat array
    predictionsData.predictions.forEach((personData) => {
      personData.predictions.forEach((pred) => {
        predictions.push({
          person: personData.person,
          matchId: pred.matchId,
          predictedHomeGoals: pred.predictedHomeGoals,
          predictedAwayGoals: pred.predictedAwayGoals,
        });
      });
    });

    appState.predictions = predictions;
    console.log(`✓ Loaded ${predictions.length} predictions from JSON export`);
  } catch (err) {
    appState.error = err.message;
    console.error("Error processing predictions:", err);
    throw err;
  }
}

let predictionsData = null; // Cache predictions data

/**
 * Fetch predictions and matches from local JSON export
 * @returns {Promise<void>}
 */
async function fetchPredictionsAndMatches() {
  try {
    console.log(
      `Fetching predictions and matches from: ${PREDICTIONS_JSON_URL}`,
    );
    const response = await fetch(PREDICTIONS_JSON_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    predictionsData = data;

    // Load matches from predictions.json
    if (data.matches && typeof data.matches === "object") {
      appState.matchResults = data.matches;
      console.log(
        `✓ Loaded ${Object.keys(data.matches).length} matches from predictions.json`,
      );
    }
  } catch (err) {
    appState.error = err.message;
    console.error("Error fetching predictions and matches:", err);
    throw err;
  }
}

/**
 * Fetch match results from local JSON export (called by fetchMatchResults for compatibility)
 * @returns {Promise<void>}
 */
async function fetchMatchResults() {
  // Matches are loaded with predictions, nothing to do here
  return Promise.resolve();
}


/**
 * Merge prediction data with match results and calculate scores
 * @returns {array} Array of merged prediction objects
 */
function mergeDataAndCalculateScores() {
  const predictions = appState.predictions;
  const matchResults = Object.values(appState.matchResults);
  console.log(
    `DEBUG mergeData: ${matchResults.length} matches, ${predictions.length} predictions`,
  );

  return predictions.map((pred) => {
    // Find matching match by matchId (match object uses 'id' field)
    const match = matchResults.find((m) => m.id === pred.matchId);

    // Derive predictedWinner from predicted goals if not present
    const predictedWinner =
      pred.predictedWinner ||
      determineWinner(pred.predictedHomeGoals, pred.predictedAwayGoals);

    const predWithWinner = {
      ...pred,
      predictedWinner,
    };

    if (match) {
      const scoreData = calculatePredictionPoints(predWithWinner, match);
      return {
        ...predWithWinner,
        matchData: match,
        points: scoreData.points,
        breakdown: scoreData.breakdown,
        scoreClass: getScoreClass(scoreData.points),
      };
    }

    // If no matching match found, return prediction with default score data
    return {
      ...predWithWinner,
      matchData: null,
      points: 0,
      breakdown: "Match not found",
      scoreClass: "miss",
    };
  });
}

/**
 * Load all data from sources
 * @returns {Promise<void>}
 */
async function loadAllData() {
  try {
    const refreshBtn = document.getElementById("refreshBtn");
    const mainContent = document.querySelector(".main-content");

    // Set loading state
    refreshBtn.disabled = true;
    refreshBtn.textContent = "🔄 Loading...";

    // Clear any error divs from main content
    const errorDivs = mainContent.querySelectorAll(".error");
    errorDivs.forEach((div) => div.remove());

    // Load predictions and matches from single JSON file
    await fetchPredictionsAndMatches();
    await fetchPredictions();

    // Save matches to localStorage so refreshMatchResults() can use them
    saveMatches(appState.matchResults);

    // Use the same API refresh mechanism as the admin panel
    console.log("🔄 Refreshing match results from ESPN API...");
    appState.matchResults = await refreshMatchResults();

    appState.lastUpdated = new Date();
    updateFooter();
    renderAllTabs();

    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 Refresh";
  } catch (err) {
    console.error("Error loading data:", err);
    const refreshBtn = document.getElementById("refreshBtn");
    refreshBtn.disabled = false;
    refreshBtn.textContent = "🔄 Refresh (Error)";
    showError(`Failed to load data: ${err.message}`);
  }
}

/**
 * Update footer with last updated timestamp
 */
function updateFooter() {
  const lastUpdatedEl = document.getElementById("lastUpdated");

  if (appState.lastUpdated) {
    const timeString = appState.lastUpdated.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Dubai",
      hour12: false,
    });
    lastUpdatedEl.textContent = `Last updated: ${timeString} GMT+4`;
  } else {
    lastUpdatedEl.textContent = "Last updated: Never";
  }
}

/**
 * Show error message to user
 * @param {string} message - Error message to display
 */
function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.textContent = message;

  const mainContent = document.querySelector(".main-content");
  mainContent.insertBefore(errorDiv, mainContent.firstChild);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

/**
 * Switch to a different tab
 * @param {string} tabName - The ID of the tab to show
 */
function switchTab(tabName) {
  // Hide all tab content
  const tabContents = document.querySelectorAll(".tab-content");
  tabContents.forEach((tab) => tab.classList.remove("active"));

  // Show selected tab
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) {
    selectedTab.classList.add("active");
  }

  // Update nav button states
  const navBtns = document.querySelectorAll(".nav-btn");
  navBtns.forEach((btn) => btn.classList.remove("active"));

  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }

  // Re-render the active tab content
  switch (tabName) {
    case "upcoming":
      renderUpcomingMatches();
      break;
    case "leaderboard":
      renderLeaderboard();
      break;
    case "byGroup":
      renderByGroup();
      break;
    case "byUser":
      renderByUser();
      break;
    case "stats":
      renderStats();
      break;
    case "bracket":
      renderBracket();
      break;
  }
}

/**
 * Render upcoming matches view
 */
function renderUpcomingMatches() {
  const container = document.getElementById("upcoming");
  if (!container) return;

  const liveMatchesList = document.getElementById("live-matches-list");
  const upcomingMatchesList = document.getElementById("upcoming-matches-list");
  const errorDiv = document.getElementById("upcoming-error");

  console.log("renderUpcomingMatches called, matchResults:", Object.keys(appState.matchResults).length, "matches");

  if (
    !appState.matchResults ||
    Object.keys(appState.matchResults).length === 0
  ) {
    console.error("No match data available!");
    errorDiv.textContent = "No match data available";
    errorDiv.style.display = "block";
    return;
  }

  // Get all matches
  const allMatches = Object.values(appState.matchResults);

  // Separate live and upcoming matches
  const liveMatches = [];
  const upcomingMatches = [];

  allMatches.forEach((match) => {
    const statusInfo = getMatchStatus(match);
    if (statusInfo.status === "live") {
      liveMatches.push({ ...match, statusInfo });
    } else if (statusInfo.status !== "completed") {
      upcomingMatches.push({ ...match, statusInfo });
    }
  });

  // Sort by date
  upcomingMatches.sort((a, b) => new Date(a.date) - new Date(b.date));

  // Clear previous content
  liveMatchesList.innerHTML = "";
  upcomingMatchesList.innerHTML = "";
  errorDiv.style.display = "none";

  // Render live matches
  if (liveMatches.length > 0) {
    document.getElementById("live-matches-container").style.display = "block";
    liveMatches.forEach((match) => {
      liveMatchesList.appendChild(createMatchCard(match));
    });
  } else {
    document.getElementById("live-matches-container").style.display = "none";
  }

  // Render upcoming matches
  if (upcomingMatches.length > 0) {
    document.getElementById("upcoming-matches-container").style.display =
      "block";
    upcomingMatches.forEach((match) => {
      upcomingMatchesList.appendChild(createMatchCard(match));
    });
  } else {
    upcomingMatchesList.innerHTML =
      '<p class="no-matches">No upcoming matches</p>';
  }
}

/**
 * Create a match card element
 * @param {object} match - Match object with statusInfo property
 * @returns {HTMLElement} Match card DOM element
 */
function createMatchCard(match) {
  const card = document.createElement("div");
  card.className = `match-card ${match.statusInfo.status === "live" ? "live" : ""}`;

  const timeInfo = convertToGMT4(match.date);
  const homeFlag = getCountryFlag(match.home);
  const awayFlag = getCountryFlag(match.away);

  card.innerHTML = `
    <div class="match-header">
      <div class="match-time">${timeInfo.full}</div>
      <span class="match-status-badge badge-${match.statusInfo.status}">
        ${match.statusInfo.label}
      </span>
    </div>

    <div class="match-teams">
      <div class="team">
        <div class="team-flag">${homeFlag}</div>
        <div class="team-name">${match.home}</div>
      </div>
      <div class="vs">vs</div>
      <div class="team">
        <div class="team-flag">${awayFlag}</div>
        <div class="team-name">${match.away}</div>
      </div>
    </div>

    <div class="match-venue">${match.stadium}</div>
  `;

  return card;
}

/**
 * Initialize the application
 */
async function initApp() {
  // Load all data first
  await loadAllData();

  // Set up nav button click handlers
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const tabName = this.getAttribute("data-tab");
      switchTab(tabName);
    });
  });

  // Set up refresh button click handler
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadAllData();
    });
  }
}

/**
 * Render leaderboard view
 */
function renderLeaderboard() {
  const container = document.getElementById("leaderboard");
  if (!container) return;

  // Check if predictions are empty or null
  if (!appState.predictions || appState.predictions.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No data loaded. Please refresh.</p>';
    return;
  }

  // Get merged data with scores
  const mergedData = mergeDataAndCalculateScores();

  // Get unique people
  const uniquePeople = Array.from(new Set(mergedData.map((p) => p.person)));

  if (uniquePeople.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No data available</p>';
    return;
  }

  // Calculate stats for each person
  const personStats = uniquePeople.map((person) => {
    const personPreds = mergedData.filter((p) => p.person === person);
    const matches = personPreds.map((p) => p.matchData).filter(Boolean);
    const stats = calculatePersonStats(personPreds, matches);

    return {
      person,
      totalPoints: stats.totalPoints,
      accuracy: stats.accuracy,
      exactScores: stats.exactScores,
      matchesPlayed: stats.matchesPlayed,
      avgPoints: stats.matchesPlayed > 0 ? (stats.totalPoints / stats.matchesPlayed).toFixed(2) : "0.00",
    };
  });

  // Sort by totalPoints descending
  personStats.sort((a, b) => b.totalPoints - a.totalPoints);

  const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };

  // Build HTML table
  let html = '<div class="table-scroll"><table class="leaderboard-table">';
  html +=
    "<thead><tr><th>Rank</th><th>Person</th><th>Points</th><th>Accuracy</th><th>Exact</th></tr></thead>";
  html += "<tbody>";

  personStats.forEach((person, index) => {
    const rank = index + 1;
    const rankClass = rank === 1 ? ' class="first"' : "";
    const medal = medals[rank] ? `<span class="rank-medal">${medals[rank]}</span>` : "";
    html += "<tr>";
    html += `<td${rankClass}>${medal}${rank}</td>`;
    html += `<td>${person.person}</td>`;
    html += `<td>${person.totalPoints}<br><span class="points-sub">${person.avgPoints} pts/match</span></td>`;
    html += `<td>${person.accuracy}%</td>`;
    html += `<td>${person.exactScores}</td>`;
    html += "</tr>";
  });

  html += "</tbody></table></div>";

  html += buildLeaderboardBreakdown(mergedData, uniquePeople.slice().sort());

  container.innerHTML = html;
}

/**
 * Build the "match breakdown" section for the Leaderboard tab:
 * a table with one row per completed match (newest first) and one
 * column per person, so predictions can be scanned across people.
 * @param {array} mergedData - Output of mergeDataAndCalculateScores()
 * @param {array} people - Sorted list of person names (column order)
 * @returns {string} HTML for the breakdown section
 */
function buildLeaderboardBreakdown(mergedData, people) {
  const completedPreds = mergedData.filter(
    (pred) => pred.matchData && pred.matchData.status === "completed",
  );

  if (completedPreds.length === 0) {
    return "";
  }

  // Group predictions and match metadata by matchId
  const predsByMatch = {};
  const matchById = {};
  completedPreds.forEach((pred) => {
    if (!predsByMatch[pred.matchId]) {
      predsByMatch[pred.matchId] = {};
    }
    predsByMatch[pred.matchId][pred.person] = pred;
    matchById[pred.matchId] = pred.matchData;
  });

  // Newest match first
  const sortedMatchIds = Object.keys(matchById).sort(
    (a, b) => new Date(matchById[b].date) - new Date(matchById[a].date),
  );

  let html = `<h3 class="section-title">Match Breakdown (${sortedMatchIds.length} completed)</h3>`;
  html += '<div class="table-scroll"><table class="breakdown-table"><thead><tr><th>Match</th>';
  people.forEach((person) => {
    html += `<th>${person}</th>`;
  });
  html += "</tr></thead><tbody>";

  sortedMatchIds.forEach((matchId) => {
    const match = matchById[matchId];
    const penaltyLine = match.penaltyScore
      ? `<br><span class="breakdown-penalty">${match.penaltyScore}</span>`
      : "";
    html += "<tr>";
    html += `<td class="breakdown-match-cell">${match.home}<span class="breakdown-score">${match.homeGoals}-${match.awayGoals}</span>${match.away}${penaltyLine}</td>`;

    people.forEach((person) => {
      const pred = predsByMatch[matchId][person];
      if (pred) {
        const scoreDisplay = `${pred.predictedHomeGoals !== null ? pred.predictedHomeGoals : "?"}-${pred.predictedAwayGoals !== null ? pred.predictedAwayGoals : "?"}`;
        html += `<td><span class="prediction-box ${pred.scoreClass}">${scoreDisplay}<br>${pred.points}pt${pred.points === 1 ? "" : "s"}</span></td>`;
      } else {
        html += "<td>-</td>";
      }
    });

    html += "</tr>";
  });

  html += "</tbody></table></div>";
  return html;
}

/**
 * Render by group view with group selector
 */
function renderByGroup() {
  const container = document.getElementById("byGroup");
  if (!container) return;

  // Check if predictions are empty or null
  if (!appState.predictions || appState.predictions.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No data loaded. Please refresh.</p>';
    return;
  }

  // Get merged data
  const mergedData = mergeDataAndCalculateScores();

  // Get unique groups from matchData
  const groups = Array.from(
    new Set(mergedData.map((p) => p.matchData?.group).filter(Boolean)),
  ).sort();

  // If no groups, show message
  if (groups.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No groups available</p>';
    return;
  }

  // Create dropdown HTML
  let html = '<div class="filter-group">';
  html += '<label for="groupFilter">Select Group</label>';
  html += '<select id="groupFilter" onchange="updateByGroupView()">';
  html += '<option value="">-- Choose a group --</option>';
  groups.forEach((group) => {
    html += `<option value="${group}">Group ${group}</option>`;
  });
  html += "</select>";
  html += "</div>";
  html += '<div id="groupContent"></div>';

  container.innerHTML = html;

  // Pre-select first group
  setTimeout(() => {
    const groupFilter = document.getElementById("groupFilter");
    if (groupFilter) {
      groupFilter.value = groups[0];
      updateByGroupView();
    }
  }, 0);
}

/**
 * Update by group view when selection changes
 */
function updateByGroupView() {
  const groupFilter = document.getElementById("groupFilter");
  const groupContent = document.getElementById("groupContent");

  if (!groupFilter || !groupContent) return;

  const selectedGroup = groupFilter.value;

  // If no selection, show message
  if (!selectedGroup) {
    groupContent.innerHTML =
      '<p class="text-center text-secondary">Select a group</p>';
    return;
  }

  // Get merged data
  const mergedData = mergeDataAndCalculateScores();

  // Filter for selected group
  const groupPredictions = mergedData.filter(
    (pred) => pred.matchData && pred.matchData.group === selectedGroup,
  );

  // If no matches, show message
  if (groupPredictions.length === 0) {
    groupContent.innerHTML =
      '<p class="text-center text-secondary">No matches in this group</p>';
    return;
  }

  // Group by matchId
  const matchGroups = {};
  groupPredictions.forEach((pred) => {
    if (!matchGroups[pred.matchId]) {
      matchGroups[pred.matchId] = [];
    }
    matchGroups[pred.matchId].push(pred);
  });

  // Build HTML for all matches
  let html = "";
  Object.values(matchGroups).forEach((predictions) => {
    if (predictions.length === 0) return;

    const firstPred = predictions[0];
    const match = firstPred.matchData;

    // Get team flags
    const homeFlag = getCountryFlag(match.home);
    const awayFlag = getCountryFlag(match.away);

    // Format actual result
    let resultDisplay = "TBD";
    if (match.homeGoals !== null && match.awayGoals !== null) {
      resultDisplay = `${match.homeGoals}-${match.awayGoals}`;
    }

    // Start match card
    html += '<div class="match-card">';
    html += '<div class="match-header">';
    html += `<div class="match-teams"><span class="flag">${homeFlag}</span> <span class="team">${match.home}</span> <strong>${resultDisplay}</strong> <span class="team">${match.away}</span> <span class="flag">${awayFlag}</span></div>`;
    html += "</div>";

    // Add predictions grid
    html += '<div class="match-predictions">';
    predictions.forEach((pred) => {
      const scoreDisplay = `${pred.predictedHomeGoals !== null ? pred.predictedHomeGoals : "?"}-${pred.predictedAwayGoals !== null ? pred.predictedAwayGoals : "?"}`;
      const pointsText =
        pred.points === 3 ? "3 pts" : pred.points === 1 ? "1 pt" : "0 pts";
      html += `<div class="prediction-box ${pred.scoreClass}"><strong>${pred.person}</strong><br>${scoreDisplay}<br>${pointsText}</div>`;
    });
    html += "</div>";

    html += "</div>";
  });

  groupContent.innerHTML = html;
}

/**
 * Render by user view with user selector
 */
function renderByUser() {
  const container = document.getElementById("byUser");
  if (!container) return;

  // Check if predictions are empty or null
  if (!appState.predictions || appState.predictions.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No data loaded. Please refresh.</p>';
    return;
  }

  // Get merged data
  const mergedData = mergeDataAndCalculateScores();

  // Get unique people
  const uniquePeople = Array.from(
    new Set(mergedData.map((p) => p.person)),
  ).sort();

  // If no people, show message
  if (uniquePeople.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No people available</p>';
    return;
  }

  // Create dropdown HTML
  let html = '<div class="filter-group">';
  html += '<label for="userFilter">Select User</label>';
  html += '<select id="userFilter" onchange="updateByUserView()">';
  html += '<option value="">-- Choose a person --</option>';
  uniquePeople.forEach((person) => {
    html += `<option value="${person}">${person}</option>`;
  });
  html += "</select>";
  html += "</div>";
  html += '<div id="userContent"></div>';

  container.innerHTML = html;

  // Pre-select first person
  setTimeout(() => {
    const userFilter = document.getElementById("userFilter");
    if (userFilter) {
      userFilter.value = uniquePeople[0];
      updateByUserView();
    }
  }, 0);
}

/**
 * Update by user view when selection changes
 */
function updateByUserView() {
  const userFilter = document.getElementById("userFilter");
  const userContent = document.getElementById("userContent");

  if (!userFilter || !userContent) return;

  const selectedUser = userFilter.value;

  // If no selection, show message
  if (!selectedUser) {
    userContent.innerHTML =
      '<p class="text-center text-secondary">Select a person</p>';
    return;
  }

  // Get merged data
  const mergedData = mergeDataAndCalculateScores();

  // Filter for selected user
  const userPredictions = mergedData.filter(
    (pred) => pred.person === selectedUser,
  );

  // If no predictions, show message
  if (userPredictions.length === 0) {
    userContent.innerHTML =
      '<p class="text-center text-secondary">No predictions for this person</p>';
    return;
  }

  // Calculate person stats
  const matches = userPredictions.map((p) => p.matchData).filter(Boolean);
  const stats = calculatePersonStats(userPredictions, matches);

  // Build HTML
  let html = "";

  // Render summary card
  html += '<div class="stat-card">';
  html += '<div class="stat-row">';
  html += `<span class="stat-label">Person</span>`;
  html += `<span class="stat-value">${selectedUser}</span>`;
  html += "</div>";
  html += '<div class="stat-row">';
  html += `<span class="stat-label">Total Points</span>`;
  html += `<span class="stat-value">${stats.totalPoints}</span>`;
  html += "</div>";
  html += '<div class="stat-row">';
  html += `<span class="stat-label">Accuracy</span>`;
  html += `<span class="stat-value">${stats.accuracy}%</span>`;
  html += "</div>";
  html += '<div class="stat-row">';
  html += `<span class="stat-label">Correct Predictions</span>`;
  html += `<span class="stat-value">${stats.correctWinners}/${stats.totalPredictions}</span>`;
  html += "</div>";
  html += "</div>";

  // Render each prediction as card
  userPredictions.forEach((pred) => {
    if (!pred.matchData) return;

    const match = pred.matchData;
    const homeFlag = getCountryFlag(match.home);
    const awayFlag = getCountryFlag(match.away);

    // Format actual result
    let resultDisplay = "TBD";
    if (match.homeGoals !== null && match.awayGoals !== null) {
      resultDisplay = `${match.homeGoals}-${match.awayGoals}`;
    }

    // Format prediction
    const predictionDisplay = `${pred.predictedHomeGoals !== null ? pred.predictedHomeGoals : "?"}-${pred.predictedAwayGoals !== null ? pred.predictedAwayGoals : "?"}`;

    // Determine predicted winner name
    let predictedWinnerName = "Draw";
    if (pred.predictedWinner === "home") {
      predictedWinnerName = match.home;
    } else if (pred.predictedWinner === "away") {
      predictedWinnerName = match.away;
    }

    // Start prediction card
    html += '<div class="card">';
    html += '<div class="match-header">';
    html += `<div class="match-teams"><span class="flag">${homeFlag}</span> <span class="team">${match.home}</span> <strong>${resultDisplay}</strong> <span class="team">${match.away}</span> <span class="flag">${awayFlag}</span></div>`;
    html += "</div>";
    html += '<div class="prediction-details">';
    html += `<div class="prediction-text">Prediction: <strong>${predictedWinnerName}</strong> ${predictionDisplay}</div>`;
    html += "</div>";

    // Colored prediction box with points and breakdown
    html += `<div class="prediction-box ${pred.scoreClass}">`;
    html += `<strong>${pred.points} ${pred.points === 1 ? "point" : "points"}</strong> — ${pred.breakdown}`;
    html += "</div>";

    html += "</div>";
  });

  userContent.innerHTML = html;
}

/**
 * Render stats view with medals and detailed stats for each person
 */
function renderStats() {
  const container = document.getElementById("stats");
  if (!container) return;

  // Check if predictions are empty or null
  if (!appState.predictions || appState.predictions.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No data loaded. Please refresh.</p>';
    return;
  }

  // Get merged data with scores
  const mergedData = mergeDataAndCalculateScores();

  // Get unique people
  const uniquePeople = Array.from(new Set(mergedData.map((p) => p.person)));

  if (uniquePeople.length === 0) {
    container.innerHTML =
      '<p class="text-center text-secondary">No data available</p>';
    return;
  }

  // Calculate stats for each person
  const personStats = uniquePeople.map((person) => {
    const personPreds = mergedData.filter((p) => p.person === person);
    const matches = personPreds.map((p) => p.matchData).filter(Boolean);
    const stats = calculatePersonStats(personPreds, matches);

    return {
      person,
      totalPoints: stats.totalPoints,
      accuracy: stats.accuracy,
      correctWinners: stats.correctWinners,
      totalPredictions: stats.totalPredictions,
    };
  });

  // Sort by totalPoints descending
  personStats.sort((a, b) => b.totalPoints - a.totalPoints);

  // Build HTML for stat cards with medals
  let html = "";
  personStats.forEach((person, index) => {
    const rank = index + 1;

    // Determine medal emoji
    let medal = "";
    if (rank === 1) {
      medal = "🥇";
    } else if (rank === 2) {
      medal = "🥈";
    } else if (rank === 3) {
      medal = "🥉";
    }

    // Build stat card
    html += '<div class="stat-card">';
    html += '<div class="stat-header">';
    html += `<span class="medal">${medal}</span>`;
    html += `<span class="person-name">${person.person}</span>`;
    html += "</div>";
    html += '<div class="stat-row">';
    html += `<span class="stat-label">Total Points</span>`;
    html += `<span class="stat-value">${person.totalPoints}</span>`;
    html += "</div>";
    html += '<div class="stat-row">';
    html += `<span class="stat-label">Accuracy</span>`;
    html += `<span class="stat-value">${person.accuracy}%</span>`;
    html += "</div>";
    html += '<div class="stat-row">';
    html += `<span class="stat-label">Correct Winners</span>`;
    html += `<span class="stat-value">${person.correctWinners}/${person.totalPredictions}</span>`;
    html += "</div>";
    html += "</div>";
  });

  container.innerHTML = html;
}

/**
 * Render all tabs with current data
 */
function renderAllTabs() {
  console.log("Rendering tabs...");
  // Render upcoming matches tab
  renderUpcomingMatches();
  // Render leaderboard tab
  renderLeaderboard();
  // Render by group tab
  renderByGroup();
  // Render by user tab
  renderByUser();
  // Render stats tab
  renderStats();
  // Render bracket tab
  renderBracket();
}

// Auto-start the application when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
