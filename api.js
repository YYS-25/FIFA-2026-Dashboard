// api.js - API integration with official openfootball data + ESPN live updates
// Primary source: Official openfootball worldcup.json (GitHub)
// Local backup: data/matches.json (cached version)
// Live updates: ESPN API for real-time scores (free and public, no API key required)

const OPENFOOTBALL_WORLDCUP_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

/**
 * No API key needed - ESPN API is public
 * This function is kept for backward compatibility with app.js
 * @returns {boolean} Always returns true
 */
function isApiKeyConfigured() {
  return true;
}

/**
 * Fetch official World Cup 2026 data from openfootball GitHub repository
 * @returns {Object} Raw openfootball data with all matches
 */
async function fetchFromGithub() {
  try {
    const response = await fetch(OPENFOOTBALL_WORLDCUP_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch from GitHub: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched official worldcup.json with ${data.matches?.length || 0} matches`);

    return data;
  } catch (error) {
    console.error("Error fetching from openfootball GitHub:", error);
    return null;
  }
}

/**
 * Parse openfootball format into app format
 * Maps: team1→home, team2→away, score.ft→goals, date+time→ISO datetime
 * @param {Object} openfootballData - Raw data from openfootball GitHub
 * @returns {Object} Matches in app format keyed by match ID
 */
function parseOpenfootballData(openfootballData) {
  if (!openfootballData || !Array.isArray(openfootballData.matches)) {
    return {};
  }

  const matches = {};
  let matchCount = 0;

  openfootballData.matches.forEach((match, index) => {
    // Normalize team names to match our app format
    const home = normalizeTeamName(match.team1);
    const away = normalizeTeamName(match.team2);
    const matchId = `match_${index + 1}`;

    // Parse date and time to create ISO datetime
    const dateTime = parseOpenfootballDateTime(match.date, match.time);

    // Extract scores (handle both completed and upcoming matches)
    const homeGoals = match.score?.ft?.[0] ?? null;
    const awayGoals = match.score?.ft?.[1] ?? null;

    // Determine status based on score availability
    const status = homeGoals !== null && awayGoals !== null ? "completed" : "upcoming";

    // Extract group name (remove "Group " prefix if present)
    const groupMatch = match.group?.match(/Group\s+([A-L])/);
    const group = groupMatch ? groupMatch[1] : "";

    // Extract stage/round information
    const stage = parseStage(match.round);

    matches[matchId] = {
      id: matchId,
      fixtureId: `${home.toLowerCase()}_${away.toLowerCase()}_${match.date}`,
      date: dateTime,
      home: home,
      away: away,
      stadium: match.ground || "",
      group: group,
      stage: stage,
      homeGoals: homeGoals,
      awayGoals: awayGoals,
      status: status
    };

    matchCount++;
  });

  console.log(`Parsed ${matchCount} matches from openfootball data`);
  return matches;
}

/**
 * Normalize team names for consistency
 * @param {string} teamName - Raw team name from openfootball
 * @returns {string} Normalized team name
 */
function normalizeTeamName(teamName) {
  if (!teamName) return "";

  // Map common alternate names to standard names
  const nameMap = {
    "South Korea": "Korea Republic",
    "Korea": "Korea Republic",
    "Czech Republic": "Czechia",
    "Czechia": "Czechia",
    "Bosnia-Herzegovina": "Bosnia & Herzegovina",
    "Bosnia & Herzegovina": "Bosnia & Herzegovina",
    "England": "England",
    "France": "France",
    "Germany": "Germany",
    "Spain": "Spain",
    "Italy": "Italy",
    "Netherlands": "Netherlands",
    "Belgium": "Belgium",
    "Portugal": "Portugal",
    "Poland": "Poland",
    "Denmark": "Denmark",
    "Sweden": "Sweden",
    "Norway": "Norway",
    "Switzerland": "Switzerland",
    "Austria": "Austria",
    "Ukraine": "Ukraine",
    "Russia": "Russia",
    "Serbia": "Serbia",
    "Croatia": "Croatia",
    "Slovenia": "Slovenia",
    "Hungary": "Hungary",
    "Romania": "Romania",
    "Bulgaria": "Bulgaria",
    "Greece": "Greece",
    "Turkey": "Turkey",
    "Japan": "Japan",
    "South Africa": "South Africa",
    "Australia": "Australia",
    "Brazil": "Brazil",
    "Mexico": "Mexico",
    "Canada": "Canada",
    "USA": "USA",
    "Paraguay": "Paraguay",
    "Uruguay": "Uruguay",
    "Argentina": "Argentina",
    "Chile": "Chile",
    "Colombia": "Colombia",
    "Peru": "Peru",
    "Ecuador": "Ecuador",
    "Venezuela": "Venezuela",
    "Bolivia": "Bolivia",
    "Morocco": "Morocco",
    "Algeria": "Algeria",
    "Tunisia": "Tunisia",
    "Egypt": "Egypt",
    "Cameroon": "Cameroon",
    "Senegal": "Senegal",
    "Ghana": "Ghana",
    "Nigeria": "Nigeria",
    "Ivory Coast": "Ivory Coast",
    "Mali": "Mali",
    "Guinea": "Guinea",
    "Burkina Faso": "Burkina Faso",
    "Saudi Arabia": "Saudi Arabia",
    "Iran": "Iran",
    "Iraq": "Iraq",
    "Qatar": "Qatar",
    "UAE": "UAE",
    "Uzbekistan": "Uzbekistan",
    "Kazakhstan": "Kazakhstan",
    "China": "China",
    "India": "India",
    "Thailand": "Thailand",
    "Vietnam": "Vietnam",
    "Indonesia": "Indonesia",
    "Philippines": "Philippines",
    "New Zealand": "New Zealand",
    "Fiji": "Fiji",
    "Solomon Islands": "Solomon Islands",
    "Jamaica": "Jamaica",
    "Haiti": "Haiti",
    "Trinidad and Tobago": "Trinidad and Tobago",
    "Costa Rica": "Costa Rica",
    "Panama": "Panama",
    "Honduras": "Honduras",
    "El Salvador": "El Salvador",
    "Guatemala": "Guatemala",
    "Nicaragua": "Nicaragua",
    "Scotland": "Scotland",
    "Wales": "Wales",
    "Northern Ireland": "Northern Ireland",
    "Israel": "Israel",
    "Palestine": "Palestine",
    "Lebanon": "Lebanon",
    "Jordan": "Jordan",
    "Syria": "Syria"
  };

  // Trim whitespace and check map
  const trimmed = teamName.trim();
  return nameMap[trimmed] || trimmed;
}

/**
 * Parse openfootball date and time to ISO datetime
 * Format: "2026-06-11" and "13:00 UTC-6" → "2026-06-11T13:00:00Z" (adjusted to UTC)
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} time - Time in "HH:MM UTC±X" format
 * @returns {string} ISO datetime string in UTC
 */
function parseOpenfootballDateTime(date, time) {
  if (!date) return new Date().toISOString();

  // Default to noon UTC if time is not provided
  if (!time) {
    return `${date}T12:00:00Z`;
  }

  // Parse time: "13:00 UTC-6" or "13:00 UTC+4"
  const timeMatch = time.match(/(\d{1,2}):(\d{2})\s+UTC([+-]\d{1,2})/);
  if (!timeMatch) {
    // If parsing fails, return date with noon UTC
    return `${date}T12:00:00Z`;
  }

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const utcOffset = parseInt(timeMatch[3], 10);

  // Create a date at the specified local time in the specified timezone
  // Convert to UTC by subtracting the offset
  const utcHours = hours - utcOffset;

  // Use Date to handle day boundaries correctly
  const dateObj = new Date(`${date}T00:00:00Z`);
  dateObj.setUTCHours(utcHours, minutes, 0, 0);

  return dateObj.toISOString();
}

/**
 * Parse round/matchday information to determine tournament stage
 * @param {string} round - Round string like "Matchday 1" or "Group Stage"
 * @returns {string} Stage name for our app
 */
function parseStage(round) {
  if (!round) return "Group Stage";

  const roundLower = round.toLowerCase();

  // Group stage: Matchday 1-16
  if (roundLower.includes("matchday")) {
    const matchdayMatch = round.match(/Matchday\s+(\d+)/);
    if (matchdayMatch) {
      const day = parseInt(matchdayMatch[1], 10);
      if (day <= 16) return "Group Stage";
      // Matchday 17+ is knockout stages
    }
  }

  // Explicit stage names
  if (roundLower.includes("round of 16") || roundLower.includes("round-of-16")) return "Round of 16";
  if (roundLower.includes("quarterfinal") || roundLower.includes("quarter-final")) return "Quarterfinals";
  if (roundLower.includes("semifinal") || roundLower.includes("semi-final")) return "Semifinals";
  if (roundLower.includes("final") && !roundLower.includes("semifinal")) return "Final";
  if (roundLower.includes("third place")) return "Third Place Match";
  if (roundLower.includes("group")) return "Group Stage";

  // Default to group stage
  return "Group Stage";
}

/**
 * Load local World Cup 2026 matches from data/matches.json (backup/cache)
 * @returns {Object} Object with match data keyed by match ID
 */
async function loadLocalMatches() {
  try {
    const response = await fetch("./data/matches.json");

    if (!response.ok) {
      throw new Error(`Failed to load local matches: ${response.status}`);
    }

    const matches = await response.json();
    console.log(`Loaded ${Object.keys(matches).length} matches from local cache`);

    return matches;
  } catch (error) {
    console.error("Error loading local matches:", error);
    return {};
  }
}

/**
 * Fetch all World Cup 2026 matches
 * Primary: Official openfootball worldcup.json from GitHub
 * Fallback: Local cache (data/matches.json)
 * Enhancement: ESPN live data enrichment if available
 * @returns {Object} Object with match data keyed by match ID
 */
async function fetchWorldCupMatches() {
  try {
    // Try to fetch from official openfootball source first
    const openfootballData = await fetchFromGithub();

    let matches = {};

    if (openfootballData) {
      // Parse official data into our format
      matches = parseOpenfootballData(openfootballData);
      console.log("Using official openfootball data source");
    } else {
      // Fallback to local cache if GitHub fetch fails
      console.warn("GitHub fetch failed, falling back to local cache");
      matches = await loadLocalMatches();
    }

    if (Object.keys(matches).length === 0) {
      console.warn("No matches loaded from either source");
      return loadMatches();
    }

    // Try to enrich with ESPN live data if available
    try {
      const enrichedMatches = await enrichWithEspnData(matches);
      saveMatches(enrichedMatches);
      return enrichedMatches;
    } catch (error) {
      // If ESPN fails, just use the primary source data
      console.warn("ESPN enrichment failed, using primary data only:", error.message);
      saveMatches(matches);
      return matches;
    }
  } catch (error) {
    console.error("Error fetching matches:", error);
    // Return cached matches if everything fails
    return loadMatches();
  }
}

/**
 * Enrich local match data with ESPN live scores
 * Merges ESPN score data into local matches where available
 * @param {Object} localMatches - Local match data from FIFA schedule
 * @returns {Object} Enriched match data with live scores
 */
async function enrichWithEspnData(localMatches) {
  try {
    const response = await fetch(ESPN_SCOREBOARD_URL);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();

    // Validate response structure
    if (!data.events || !Array.isArray(data.events)) {
      console.warn("Invalid ESPN API response format");
      return localMatches;
    }

    // Create a map of ESPN events for quick lookup by team names
    const espnEventMap = {};
    data.events.forEach((event) => {
      const competition = event.competitions && event.competitions[0];
      if (competition && event.id) {
        const competitors = competition.competitors || [];
        const homeTeam = competitors.find((c) => c.homeAway === "home") || competitors[0];
        const awayTeam = competitors.find((c) => c.homeAway === "away") || competitors[1];

        const homeTeamName = homeTeam?.team?.displayName || "";
        const awayTeamName = awayTeam?.team?.displayName || "";
        const key = `${homeTeamName}_${awayTeamName}`;

        espnEventMap[key] = {
          fixtureId: event.id,
          homeGoals: homeTeam ? homeTeam.score : null,
          awayGoals: awayTeam ? awayTeam.score : null,
          status: mapEspnStatus(competition.status?.type),
        };
      }
    });

    // Enrich local matches with ESPN data where available
    const enrichedMatches = { ...localMatches };
    Object.entries(enrichedMatches).forEach(([matchKey, match]) => {
      const espnKey = `${match.home}_${match.away}`;
      const espnData = espnEventMap[espnKey];

      if (espnData) {
        enrichedMatches[matchKey] = {
          ...match,
          fixtureId: espnData.fixtureId,
          homeGoals: espnData.homeGoals,
          awayGoals: espnData.awayGoals,
          status: espnData.status,
        };
      }
    });

    return enrichedMatches;
  } catch (error) {
    console.warn("Could not enrich with ESPN data:", error.message);
    return localMatches;
  }
}

/**
 * Map ESPN API status to app status
 * @param {Object} espnStatusObj - Status object from ESPN API (has a "state" property)
 * @returns {string} Mapped status: 'upcoming', 'completed', or 'live'
 */
function mapEspnStatus(espnStatusObj) {
  if (!espnStatusObj) return "upcoming";

  // ESPN status object has a "state" property
  const state = espnStatusObj.state || espnStatusObj;
  if (typeof state !== "string") return "upcoming";

  const status = state.toLowerCase();
  if (status === "pre") return "upcoming"; // Pre-game
  if (status === "in") return "live"; // In progress
  if (status === "post") return "completed"; // Post-game
  return "upcoming"; // Default to upcoming for unknown statuses
}

/**
 * Fetch latest results for all matches
 * Primary: openfootball (has all historical + future matches)
 * Backup: ESPN API (live/recent data overlay)
 * @returns {Object} Updated match data
 */
async function refreshMatchResults() {
  try {
    const matches = loadMatches();

    if (Object.keys(matches).length === 0) {
      console.log("No matches to refresh");
      return matches;
    }

    // Step 1: Fetch from openfootball (primary source - has ALL results)
    console.log("📚 Fetching match data from openfootball...");
    const openfootballData = await fetchFromGithub();

    if (openfootballData && Array.isArray(openfootballData.matches)) {
      // Merge openfootball results into our matches
      openfootballData.matches.forEach((match, index) => {
        const matchId = `match_${index + 1}`;
        if (matches[matchId]) {
          const homeGoals = match.score?.ft?.[0] ?? null;
          const awayGoals = match.score?.ft?.[1] ?? null;
          const status = homeGoals !== null && awayGoals !== null ? "completed" : matches[matchId].status;

          if (homeGoals !== null) {
            console.log(`  ✅ ${matches[matchId].home} ${homeGoals}-${awayGoals} ${matches[matchId].away}`);
            matches[matchId].homeGoals = homeGoals;
            matches[matchId].awayGoals = awayGoals;
            matches[matchId].status = status;
          }
        }
      });
    }

    // Step 2: Overlay with ESPN live data (for current/live matches)
    console.log("🔴 Overlaying with ESPN live data...");
    try {
      const response = await fetch(ESPN_SCOREBOARD_URL);

      if (response.ok) {
        const data = await response.json();

        if (data.events && Array.isArray(data.events)) {
          // Create a map of ESPN events by team names
          const espnEventMap = {};
          data.events.forEach((event) => {
            const competition = event.competitions && event.competitions[0];
            if (competition) {
              const competitors = competition.competitors || [];
              const homeTeam = competitors.find((c) => c.homeAway === "home") || competitors[0];
              const awayTeam = competitors.find((c) => c.homeAway === "away") || competitors[1];

              const homeTeamName = homeTeam?.team?.displayName || "";
              const awayTeamName = awayTeam?.team?.displayName || "";
              const key = `${homeTeamName}_${awayTeamName}`;

              espnEventMap[key] = {
                homeGoals: homeTeam ? homeTeam.score : null,
                awayGoals: awayTeam ? awayTeam.score : null,
                status: mapEspnStatus(competition.status),
              };
            }
          });

          // Overlay ESPN live data
          Object.entries(matches).forEach(([matchKey, match]) => {
            const espnKey = `${match.home}_${match.away}`;
            const espnData = espnEventMap[espnKey];
            if (espnData && (espnData.status === "live" || espnData.status === "completed")) {
              console.log(`  🔴 ${match.home} ${espnData.homeGoals}-${espnData.awayGoals} ${match.away} (${espnData.status})`);
              matches[matchKey].homeGoals = espnData.homeGoals;
              matches[matchKey].awayGoals = espnData.awayGoals;
              matches[matchKey].status = espnData.status;
            }
          });
        }
      }
    } catch (error) {
      console.warn("ESPN overlay failed, using openfootball data:", error.message);
    }

    saveMatches(matches);
    console.log("✓ Match results refreshed from openfootball + ESPN");
    return matches;
  } catch (error) {
    console.error("Error refreshing results:", error);
    return loadMatches();
  }
}
