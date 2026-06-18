// FIFA 2026 Dashboard Utilities
// Helper functions and utilities

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
  'Montenegro': '🇲🇪',
  'North Macedonia': '🇲🇰',
  'Bulgaria': '🇧🇬',
  'Moldova': '🇲🇩',

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
  'Algeria': '🇩🇿'
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

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[date.getUTCMonth()];
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
    return { totalPoints: 0, accuracy: 0, correctWinners: 0, totalPredictions: 0 };
  }

  let totalPoints = 0;
  let correctWinners = 0;
  const totalPredictions = predictions.length;

  predictions.forEach(prediction => {
    // Find matching match result by match ID or index
    const matchResult = matchResults.find(m => m.id === prediction.matchId || m.matchId === prediction.matchId);

    if (matchResult) {
      const result = calculatePredictionPoints(prediction, matchResult);
      totalPoints += result.points;

      if (result.points >= 1) {
        correctWinners++;
      }
    }
  });

  const accuracy = totalPredictions > 0 ? Math.round((correctWinners / totalPredictions) * 100) : 0;

  return {
    totalPoints,
    accuracy,
    correctWinners,
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
