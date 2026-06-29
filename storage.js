// storage.js - Local storage and file I/O

const STORAGE_KEYS = {
  MATCHES: 'wcPredictor_matches',
  PREDICTIONS: 'wcPredictor_predictions',
  SCORES: 'wcPredictor_scores',
  LAST_UPDATED: 'wcPredictor_lastUpdated'
};

/**
 * Determine the winner of a match (home, away, or draw)
 */
function determineWinner(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return 'draw';
}

/**
 * Save matches to local storage
 */
function saveMatches(matches) {
  localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches));
  updateLastUpdated();
}

/**
 * Load matches from local storage
 */
function loadMatches() {
  const data = localStorage.getItem(STORAGE_KEYS.MATCHES);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse matches data:', err);
    return {};
  }
}

/**
 * Save predictions to local storage
 */
function savePredictions(predictions) {
  localStorage.setItem(STORAGE_KEYS.PREDICTIONS, JSON.stringify(predictions));
  updateLastUpdated();
}

/**
 * Load predictions from local storage
 */
function loadPredictions() {
  const data = localStorage.getItem(STORAGE_KEYS.PREDICTIONS);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse predictions data:', err);
    return [];
  }
}

/**
 * Save scores to local storage
 */
function saveScores(scores) {
  localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify(scores));
}

/**
 * Load scores from local storage
 */
function loadScores() {
  const data = localStorage.getItem(STORAGE_KEYS.SCORES);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to parse scores data:', err);
    return [];
  }
}

/**
 * Update last modified timestamp
 */
function updateLastUpdated() {
  const now = new Date().toLocaleString();
  localStorage.setItem(STORAGE_KEYS.LAST_UPDATED, now);
}

/**
 * Get last updated time
 */
function getLastUpdated() {
  return localStorage.getItem(STORAGE_KEYS.LAST_UPDATED) || 'Never';
}

/**
 * Export predictions as JSON file
 */
function exportAsJSON() {
  const predictions = loadPredictions();
  const matches = loadMatches();
  const scores = loadScores();

  const data = {
    exportedAt: new Date().toISOString(),
    predictions: predictions,
    matches: matches,
    scores: scores
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadFile(blob, 'world-cup-predictions.json');
}

/**
 * Convert array of objects to CSV string
 * Prevents CSV injection by quoting all string values
 */
function objectsToCSV(headers, rows) {
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        // Quote all string values to prevent formula injection (=, +, @, -)
        if (typeof val === 'string') {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    )
  ];
  return csv.join('\n');
}

/**
 * Export predictions as CSV file
 */
function exportPredictionsAsCSV() {
  const predictions = loadPredictions();
  const matches = loadMatches();

  const rows = [];
  predictions.forEach(person => {
    person.predictions.forEach(pred => {
      const match = matches[pred.matchId];
      if (match) {
        const predictedWinner = determineWinner(pred.predictedHomeGoals, pred.predictedAwayGoals);
        rows.push({
          Person: person.person,
          'Match ID': pred.matchId,
          'Home Team': match.home,
          'Away Team': match.away,
          'Predicted Winner': predictedWinner,
          'Predicted Home Goals': pred.predictedHomeGoals,
          'Predicted Away Goals': pred.predictedAwayGoals,
          'Actual Home Goals': match.homeGoals || '',
          'Actual Away Goals': match.awayGoals || '',
          'Status': match.status
        });
      }
    });
  });

  const headers = ['Person', 'Match ID', 'Home Team', 'Away Team', 'Predicted Winner',
                   'Predicted Home Goals', 'Predicted Away Goals', 'Actual Home Goals',
                   'Actual Away Goals', 'Status'];
  const csv = objectsToCSV(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, 'world-cup-predictions.csv');
}

/**
 * Export scores as CSV file
 */
function exportScoresAsCSV() {
  const scores = loadScores();

  const rows = scores.map(score => ({
    Person: score.person,
    'Total Points': score.totalPoints,
    'Accuracy %': score.accuracy,
    'Matches With Results': score.matchesWithResults
  }));

  const headers = ['Person', 'Total Points', 'Accuracy %', 'Matches With Results'];
  const csv = objectsToCSV(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, 'world-cup-scores.csv');
}

/**
 * Helper to trigger file download
 */
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import predictions from CSV file
 */
async function importPredictionsFromCSV(file) {
  return new Promise((resolve, reject) => {
    // Validate file type
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      reject(new Error('File must be a CSV file'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());

        const personMap = {};
        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVRow(lines[i]);

          // Validate row has required columns
          if (row.length < 7) {
            console.warn(`Skipping row ${i}: insufficient columns`);
            continue;
          }

          const person = row[0];
          const matchId = row[1];
          const predictedHomeGoalsStr = row[5];
          const predictedAwayGoalsStr = row[6];

          // Validate integer parsing
          const predictedHomeGoals = parseInt(predictedHomeGoalsStr, 10);
          const predictedAwayGoals = parseInt(predictedAwayGoalsStr, 10);

          if (isNaN(predictedHomeGoals) || isNaN(predictedAwayGoals)) {
            console.warn(`Skipping row ${i}: invalid goal values`);
            continue;
          }

          if (!personMap[person]) {
            personMap[person] = [];
          }

          personMap[person].push({
            matchId: matchId,
            predictedHomeGoals: predictedHomeGoals,
            predictedAwayGoals: predictedAwayGoals
          });
        }

        const predictions = Object.entries(personMap).map(([person, preds]) => ({
          person: person,
          predictions: preds
        }));

        savePredictions(predictions);
        resolve(predictions);
      } catch (err) {
        reject(new Error(`Failed to parse CSV file: ${err.message}`));
      }
    };

    reader.onerror = (e) => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsText(file);
  });
}

/**
 * Parse a CSV row handling quoted values
 */
function parseCSVRow(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
