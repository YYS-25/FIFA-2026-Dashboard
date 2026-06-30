// FIFA 2026 Dashboard Utilities
// Helper functions and utilities

// Month names for date formatting
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Day names for date formatting
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Country flags emoji mapping (50+ nations)
const COUNTRY_FLAGS = {
  // CONCACAF (North/Central America & Caribbean)
  'USA': '🇺🇸',
  'Mexico': '🇲🇽',
  'Canada': '🇨🇦',
  'Jamaica': '🇯🇲',
  'Honduras': '🇭🇳',
  'Costa Rica': '🇨🇷',
  'Panama': '🇵🇦',
  'Trinidad and Tobago': '🇹🇹',

  // CONMEBOL (South America)
  'Argentina': '🇦🇷',
  'Brazil': '🇧🇷',
  'Uruguay': '🇺🇾',
  'Paraguay': '🇵🇾',
  'Colombia': '🇨🇴',
  'Ecuador': '🇪🇨',
  'Peru': '🇵🇪',
  'Bolivia': '🇧🇴',
  'Chile': '🇨🇱',
  'Venezuela': '🇻🇪',

  // UEFA (Europe)
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'France': '🇫🇷',
  'Germany': '🇩🇪',
  'Spain': '🇪🇸',
  'Italy': '🇮🇹',
  'Netherlands': '🇳🇱',
  'Belgium': '🇧🇪',
  'Switzerland': '🇨🇭',
  'Austria': '🇦🇹',
  'Poland': '🇵🇱',
  'Czech Republic': '🇨🇿',
  'Portugal': '🇵🇹',
  'Greece': '🇬🇷',
  'Romania': '🇷🇴',
  'Serbia': '🇷🇸',
  'Ukraine': '🇺🇦',
  'Türkiye': '🇹🇷',
  'Hungary': '🇭🇺',
  'Slovakia': '🇸🇰',
  'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Northern Ireland': '🇮🇪',
  'Iceland': '🇮🇸',
  'Croatia': '🇭🇷',
  'Slovenia': '🇸🇮',
  'Albania': '🇦🇱',
  'Bosnia and Herzegovina': '🇧🇦',
  'Bosnia & Herzegovina': '🇧🇦',
  'Montenegro': '🇲🇪',
  'North Macedonia': '🇲🇰',
  'Bulgaria': '🇧🇬',
  'Moldova': '🇲🇩',
  'Sweden': '🇸🇪',
  'Norway': '🇳🇴',
  'Denmark': '🇩🇰',
  'Finland': '🇫🇮',

  // AFC (Asia & Oceania)
  'Japan': '🇯🇵',
  'South Korea': '🇰🇷',
  'China': '🇨🇳',
  'India': '🇮🇳',
  'Saudi Arabia': '🇸🇦',
  'Iran': '🇮🇷',
  'United Arab Emirates': '🇦🇪',
  'Iraq': '🇮🇶',
  'Qatar': '🇶🇦',
  'Australia': '🇦🇺',
  'Uzbekistan': '🇺🇿',

  // CAF (Africa)
  'Egypt': '🇪🇬',
  'Nigeria': '🇳🇬',
  'Senegal': '🇸🇳',
  'Cameroon': '🇨🇲',
  'Ivory Coast': '🇨🇮',
  'South Africa': '🇿🇦',
  'Morocco': '🇲🇦',
  'Ghana': '🇬🇭',
  'Tunisia': '🇹🇳',
  'Algeria': '🇩🇿',
  'DR Congo': '🇨🇩',
  'Cape Verde': '🇨🇻',
  'Mali': '🇲🇱',
  'Guinea': '🇬🇳',
  'Burkina Faso': '🇧🇫'
};

/**
 * Get country flag emoji
 * @param {string} countryName - Country name
 * @returns {string} Flag emoji or 🏳️ if not found
 */
function getCountryFlag(countryName) {
  if (!countryName) return '🏳️';
  return COUNTRY_FLAGS[countryName] || '🏳️';
}

/**
 * Format ISO date string to readable format
 * @param {string} isoString - ISO date string (e.g., "2026-06-11T18:00:00Z")
 * @returns {string} Formatted date (e.g., "Jun 11, 18:00 UTC")
 */
function formatDate(isoString) {
  if (!isoString) return 'TBD';

  const date = new Date(isoString);
  if (isNaN(date.getTime())) return 'TBD';

  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = date.getUTCDate();
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${month} ${day}, ${hours}:${minutes} UTC`;
}

/**
 * Determine the winner of a match
 * @param {number} homeGoals - Home team goals
 * @param {number} awayGoals - Away team goals
 * @returns {string|null} "home", "away", "draw", or null if goals are null
 */
function determineWinner(homeGoals, awayGoals) {
  if (homeGoals === null || homeGoals === undefined || awayGoals === null || awayGoals === undefined) {
    return null;
  }

  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return 'draw';
}

/**
 * Convert UTC date to GMT+4 local time string
 * @param {string} utcDateString - ISO date string (e.g., "2026-06-18T16:00:00.000Z")
 * @returns {object|null} Object with date, time, and full formatted string, or null if input is invalid
 */
function convertToGMT4(utcDateString) {
  // Input validation
  if (!utcDateString) return null;

  const utcDate = new Date(utcDateString);

  // Check if resulting Date is valid
  if (isNaN(utcDate.getTime())) return null;

  // GMT+4 is UTC + 4 hours (no DST conversion needed for consistency)
  const gmt4Date = new Date(utcDate.getTime() + (4 * 60 * 60 * 1000));

  const day = gmt4Date.getUTCDate();
  const month = MONTH_NAMES[gmt4Date.getUTCMonth()];
  const dayOfWeek = DAY_NAMES[gmt4Date.getUTCDay()];
  const hours = String(gmt4Date.getUTCHours()).padStart(2, '0');
  const minutes = String(gmt4Date.getUTCMinutes()).padStart(2, '0');

  return {
    date: `${dayOfWeek}, ${month} ${day}`,
    time: `${hours}:${minutes}`,
    full: `${dayOfWeek}, ${month} ${day} • ${hours}:${minutes} GMT+4`
  };
}

/**
 * Determine match status based on match data and current time
 * @param {object} match - Match object with status and date properties
 * @returns {object} Object with status ('live', 'today', 'upcoming', 'completed') and display label
 */
function getMatchStatus(match) {
  // Input validation
  if (!match || !match.date) {
    return { status: 'upcoming', label: 'UPCOMING' };
  }

  // If match is already completed, return completed
  if (match.status === 'completed') {
    return { status: 'completed', label: 'FINAL' };
  }

  // For upcoming matches, check if it's live now
  const now = new Date();
  const matchTime = new Date(match.date);

  // Check if resulting Date is valid
  if (isNaN(matchTime.getTime())) {
    return { status: 'upcoming', label: 'UPCOMING' };
  }

  // Check if match is ongoing (started but not finished)
  // Assume matches last ~2 hours
  const matchEndTime = new Date(matchTime.getTime() + (2 * 60 * 60 * 1000));
  if (now >= matchTime && now < matchEndTime &&
      match.homeGoals === null && match.awayGoals === null) {
    return { status: 'live', label: 'LIVE' };
  }

  // Check if match is today
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const matchDay = new Date(matchTime);
  matchDay.setHours(0, 0, 0, 0);

  if (matchDay.getTime() === today.getTime()) {
    return { status: 'today', label: 'TODAY' };
  }

  // Check if match is within next 7 days (only future matches)
  const daysUntil = Math.floor((matchDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil > 0 && daysUntil <= 7) {
    return { status: 'upcoming', label: `IN ${daysUntil} DAY${daysUntil > 1 ? 'S' : ''}` };
  }

  return { status: 'upcoming', label: 'UPCOMING' };
}

/**
 * Calculate prediction points based on actual result
 * @param {object} prediction - Prediction object with {predictedWinner, predictedHomeGoals, predictedAwayGoals}
 * @param {object} actualResult - Actual result object with {homeGoals, awayGoals}
 * @returns {object} {points: 0|1|3, breakdown: string}
 */
function calculatePredictionPoints(prediction, actualResult) {
  if (!actualResult || actualResult.homeGoals === null || actualResult.homeGoals === undefined ||
      actualResult.awayGoals === null || actualResult.awayGoals === undefined) {
    return { points: 0, breakdown: 'No result yet' };
  }

  const actualWinner = determineWinner(actualResult.homeGoals, actualResult.awayGoals);

  // Check if predicted winner matches actual winner
  if (prediction.predictedWinner !== actualWinner) {
    return { points: 0, breakdown: 'Wrong winner' };
  }

  // Check if score matches exactly
  if (prediction.predictedHomeGoals === actualResult.homeGoals &&
      prediction.predictedAwayGoals === actualResult.awayGoals) {
    return { points: 3, breakdown: 'Exact score' };
  }

  // Winner is correct but score doesn't match
  return { points: 1, breakdown: 'Correct winner' };
}

/**
 * Calculate personal statistics for predictions
 * @param {array} predictions - Array of prediction objects
 * @param {array} matchResults - Array of match result objects
 * @returns {object} {totalPoints, accuracy, correctWinners, totalPredictions}
 */
function calculatePersonStats(predictions, matchResults) {
  if (!predictions || !matchResults) {
    return { totalPoints: 0, accuracy: 0, correctWinners: 0, exactScores: 0, matchesPlayed: 0, totalPredictions: 0 };
  }

  let totalPoints = 0;
  let correctWinners = 0;
  let exactScores = 0;
  let matchesPlayed = 0;
  const totalPredictions = predictions.length;

  predictions.forEach(prediction => {
    // Find matching match result by match ID or index
    const matchResult = matchResults.find(m => m.id === prediction.matchId || m.matchId === prediction.matchId);

    if (matchResult && matchResult.status === 'completed') {
      matchesPlayed++;
      const result = calculatePredictionPoints(prediction, matchResult);
      totalPoints += result.points;

      if (result.points >= 1) {
        correctWinners++;
      }
      if (result.points === 3) {
        exactScores++;
      }
    }
  });

  const accuracy = matchesPlayed > 0 ? Math.round((correctWinners / matchesPlayed) * 100) : 0;

  return {
    totalPoints,
    accuracy,
    correctWinners,
    exactScores,
    matchesPlayed,
    totalPredictions
  };
}

/**
 * Get CSS class name based on prediction points
 * @param {number} points - Prediction points
 * @returns {string} CSS class name
 */
function getScoreClass(points) {
  if (points === 3) return 'exact';
  if (points === 1) return 'partial';
  return 'miss';
}

/**
 * Parse CSV string into array of objects
 * @param {string} csvText - CSV text content
 * @returns {array} Array of objects with header keys
 */
function parseCSV(csvText) {
  if (!csvText) return [];

  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  // First line is headers
  const headers = lines[0].split(',').map(h => h.trim());

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(',').map(v => v.trim());
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });

    result.push(obj);
  }

  return result;
}
