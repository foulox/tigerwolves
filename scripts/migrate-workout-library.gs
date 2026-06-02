// One-time migration: adds Author, Race Type, Training Phase columns and populates all workouts.
// Also fixes instructions and fills missing fields for incomplete entries.
//
// HOW TO RUN:
//   1. Open the Workout Library sheet in Google Sheets
//   2. Extensions → Apps Script
//   3. Paste this file, then click Run → migrateWorkoutLibrary
//   4. Grant permissions when prompted

function migrateWorkoutLibrary() {
  const ss = SpreadsheetApp.openById('1DqYt4POBIzdj1FbKzImN06CVocGFbgeB1UTOkz0pqpc');
  const sheet = ss.getSheetByName('Workouts');
  if (!sheet) { Logger.log('Sheet "Workouts" not found'); return; }

  // Get current headers (row 1)
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  function getOrAddCol(name) {
    let idx = headers.indexOf(name);
    if (idx === -1) {
      idx = headers.length;
      headers.push(name);
      sheet.getRange(1, idx + 1).setValue(name);
    }
    return idx + 1; // 1-indexed
  }

  const nameCol          = getOrAddCol('Workout Name');
  const instructionsCol  = getOrAddCol('Instructions');
  const lapStructureCol  = getOrAddCol('Lap Structure');
  const energySystemCol  = getOrAddCol('Energy System');
  const hrZoneCol        = getOrAddCol('HR Zone');
  const rpeCol           = getOrAddCol('RPE');
  const coachingNotesCol = getOrAddCol('Coaching Notes');
  const authorCol        = getOrAddCol('Author');
  const raceTypeCol      = getOrAddCol('Race Type');
  const trainingPhaseCol = getOrAddCol('Training Phase');

  // Per-workout data. Fields only listed here if they need to be set or overwritten.
  const WORKOUTS = {
    "Broken Tempo - Short Recovery": {
      author: "Brad Hudson", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Sir Blake's SuperSet": {
      author: "Sir Blake", raceType: "5K, 10K, Half", trainingPhase: "Build, Peak"
    },
    "Straight Tempo": {
      author: "Brad Hudson", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Hills - Ladder": {
      author: "TigerWolves", raceType: "5K, 10K, Half, Full", trainingPhase: "Base, Build"
    },
    "Broken Tempo - 3x10": {
      author: "TigerWolves", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Broken Tempo - 3x7": {
      author: "TigerWolves", raceType: "5K, 10K", trainingPhase: "Build, Peak"
    },
    "The Moneghetti": {
      author: "Steve Moneghetti", raceType: "5K, 10K, Half", trainingPhase: "Base, Build"
    },
    "Hills - 12x45s": {
      author: "TigerWolves", raceType: "5K, 10K, Half, Full", trainingPhase: "Base, Build"
    },
    "Kostas Fartlek": {
      author: "Kostas", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Intervals - 5x4min": {
      author: "TigerWolves", raceType: "5K, 10K", trainingPhase: "Build, Peak"
    },
    "Rowland Tempo": {
      author: "Rowland", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Hills - 8x90s": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Base, Build"
    },
    "Progression w/ Rests": {
      author: "Brad Hudson", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Progressive - 9..3min": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Build, Peak"
    },
    "Progressive 10-8-4": {
      author: "TigerWolves", raceType: "5K, 10K", trainingPhase: "Build, Peak"
    },
    "800s": {
      author: "TigerWolves", raceType: "Mile, 5K, 10K", trainingPhase: "Build, Peak"
    },
    "Hills - 10x45s": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Base, Build"
    },
    "The Klondike Bar": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Build, Peak"
    },
    "Hills 6x(30/45/60)": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Base, Build"
    },
    "Broken Tempo - 2x15": {
      author: "TigerWolves", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Ice Cream Sandwich": {
      author: "TigerWolves", raceType: "5K, 10K", trainingPhase: "Build, Peak"
    },
    "Broken Tempo - Medium Recovery": {
      author: "Brad Hudson", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Hills 10x60s": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Base, Build"
    },
    "Ladder - 1 to 5 to 1": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Build, Peak"
    },
    "Progression - No Rest": {
      author: "Brad Hudson", raceType: "Half, Full", trainingPhase: "Build, Peak"
    },
    "Power Endurance for Elites": {
      author: "Brad Hudson", raceType: "Half, Full", trainingPhase: "Peak"
    },
    "Williamsburg Bridge Hills": {
      author: "TigerWolves", raceType: "5K, 10K, Half", trainingPhase: "Base, Build"
    },
    "Hills - 2 Sets 7x30s": {
      author: "Kostas", raceType: "5K, 10K", trainingPhase: "Base, Build"
    },
    "The 10/8/6/4 Progression": {
      author: "Lou", raceType: "5K, 10K, Half", trainingPhase: "Build, Peak"
    },
    // Incomplete workouts — instructions + missing fields also fixed below
    "Power Endurance for Mortals": {
      author: "TigerWolves",
      raceType: "Half, Full",
      trainingPhase: "Peak",
      instructions: "WU: 15 min easy. Main: (3K@10K + 2min r + 2K@10K + 2min r + 1K@5K) + 4min r + (2K@10K + 2min r + 1K@5K). CD: 10 min easy.",
      lapStructure: "(3K + 2K + 1K) r4min (2K + 1K) r2min between reps",
      energySystem: "Lactate Threshold",
      hrZone: "Z4-Z5",
      rpe: "8",
      coachingNotes: "3K and 2K at 10K race pace, 1K at 5K–3K race pace. Higher-stimulus threshold session."
    },
    "Easy Run": {
      author: "TigerWolves",
      raceType: "Mile, 5K, 10K, Half, Full",
      trainingPhase: "Base, Build, Peak, Taper",
      instructions: "4–6 mi easy (Z2), conversational pace."
    },
    "Long Run": {
      author: "TigerWolves",
      raceType: "Half, Full",
      trainingPhase: "Base, Build, Peak",
      instructions: "14–20 mi easy (Z2). Optional: last 2–3 mi progress to MP."
    },
    "Mid Distance": {
      author: "TigerWolves",
      raceType: "Half, Full",
      trainingPhase: "Base, Build, Peak",
      instructions: "8–10 mi easy (Z2).",
      hrZone: "Z2-Z3"
    },
    "Generic Tempo": {
      author: "TigerWolves",
      raceType: "Half, Full",
      trainingPhase: "Build, Peak",
      instructions: "WU: 1–2 mi easy. Main: 30–45 min@tempo. CD: 1–2 mi easy.",
      lapStructure: "Continuous 30–45 min",
      energySystem: "Lactate Threshold",
      hrZone: "Z3-Z4",
      rpe: "7"
    },
    "Generic Track Intervals": {
      author: "TigerWolves",
      raceType: "Mile, 5K, 10K",
      trainingPhase: "Build, Peak",
      instructions: "WU: 1–2 mi easy. Main: 10×400m@5K, r90s. CD: 1–2 mi easy.",
      lapStructure: "10×400m r90s",
      energySystem: "Anaerobic",
      hrZone: "Z4-Z5",
      rpe: "8"
    },
    "Williamsburg Full Bridge Workout": {
      author: "TigerWolves",
      raceType: "5K, 10K, Half",
      trainingPhase: "Base, Build",
      instructions: "WU: Easy jog over bridge from Brooklyn to Manhattan (~1.3 mi). Main: 3 full bridge crossings. CD: Easy jog back to start.",
      lapStructure: "3 full crossings (~0.9 mi each)",
      energySystem: "Anaerobic",
      hrZone: "Z4-Z5",
      rpe: "8"
    }
  };

  const lastRow = sheet.getLastRow();
  const allValues = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let updated = 0;

  for (let i = 0; i < allValues.length; i++) {
    const rowNum = i + 2;
    const name = String(allValues[i][nameCol - 1]).trim();
    const d = WORKOUTS[name];
    if (!d) { Logger.log('No data for: ' + name); continue; }

    if (d.author)        sheet.getRange(rowNum, authorCol).setValue(d.author);
    if (d.raceType)      sheet.getRange(rowNum, raceTypeCol).setValue(d.raceType);
    if (d.trainingPhase) sheet.getRange(rowNum, trainingPhaseCol).setValue(d.trainingPhase);
    if (d.instructions)  sheet.getRange(rowNum, instructionsCol).setValue(d.instructions);
    if (d.lapStructure)  sheet.getRange(rowNum, lapStructureCol).setValue(d.lapStructure);
    if (d.energySystem)  sheet.getRange(rowNum, energySystemCol).setValue(d.energySystem);
    if (d.hrZone)        sheet.getRange(rowNum, hrZoneCol).setValue(d.hrZone);
    if (d.rpe)           sheet.getRange(rowNum, rpeCol).setValue(d.rpe);
    if (d.coachingNotes) sheet.getRange(rowNum, coachingNotesCol).setValue(d.coachingNotes);

    updated++;
  }

  Logger.log('Done. Updated ' + updated + ' of ' + (lastRow - 1) + ' rows.');
}
