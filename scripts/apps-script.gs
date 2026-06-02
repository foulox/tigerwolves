const WORKOUT_LIBRARY_ID = '1DqYt4POBIzdj1FbKzImN06CVocGFbgeB1UTOkz0pqpc'

function doGet() {
  const scheduleSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedule')
  const racesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Races')
  const librarySheet = SpreadsheetApp.openById(WORKOUT_LIBRARY_ID).getSheetByName('Workouts')

  const result = {
    schedule: sheetToObjects(scheduleSheet),
    races: sheetToObjects(racesSheet),
    workouts: sheetToObjects(librarySheet),
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents)

    if (payload.action === 'setScheduleWorkout') {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedule')
      const data = sheet.getDataRange().getValues()
      const headers = data[0]
      const dateCol = headers.indexOf('Date')
      const nameCol = headers.indexOf('Workout Name')
      for (let i = 1; i < data.length; i++) {
        const rowDate = Utilities.formatDate(new Date(data[i][dateCol]), Session.getScriptTimeZone(), 'yyyy-MM-dd')
        if (rowDate === payload.date) {
          sheet.getRange(i + 1, nameCol + 1).setValue(payload.workoutName)
          return ContentService.createTextOutput(JSON.stringify({ ok: true }))
            .setMimeType(ContentService.MimeType.JSON)
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Date not found' }))
        .setMimeType(ContentService.MimeType.JSON)
    }

    const librarySheet = SpreadsheetApp.openById(WORKOUT_LIBRARY_ID).getSheetByName('Workouts')
    const headers = librarySheet.getRange(1, 1, 1, librarySheet.getLastColumn()).getValues()[0]

    if (payload.action === 'updateWorkout') {
      // Find the row matching originalName + originalVariation (composite key — must be unique)
      const nameCol = headers.indexOf('Workout Name')
      const variationCol = headers.indexOf('Variation')
      const data = librarySheet.getDataRange().getValues()
      const matches = []
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][nameCol]).trim() === payload.originalName &&
            String(data[i][variationCol]).trim() === payload.originalVariation) {
          matches.push(i + 1) // 1-indexed row number
        }
      }
      if (matches.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Workout not found' }))
          .setMimeType(ContentService.MimeType.JSON)
      }
      if (matches.length > 1) {
        return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Duplicate workouts found — cannot update safely' }))
          .setMimeType(ContentService.MimeType.JSON)
      }
      const rowNum = matches[0]
      const updatedRow = headers.map(h => payload[h] ?? data[rowNum - 1][headers.indexOf(h)])
      librarySheet.getRange(rowNum, 1, 1, headers.length).setValues([updatedRow])
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON)
    }

    if (payload.action === 'regroupFamily') {
      // Rename each workout's name+variation to the new family name
      const nameCol = headers.indexOf('Workout Name')
      const variationCol = headers.indexOf('Variation')
      const progressionCol = headers.indexOf('Progression')
      const data = librarySheet.getDataRange().getValues()
      for (const w of payload.workouts) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][nameCol]).trim() === w.originalName &&
              String(data[i][variationCol]).trim() === w.originalVariation) {
            librarySheet.getRange(i + 1, nameCol + 1).setValue(payload.newName)
            librarySheet.getRange(i + 1, variationCol + 1).setValue(w.variation)
            librarySheet.getRange(i + 1, progressionCol + 1).setValue(w.progression)
            break
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON)
    }

    // Default: add new workout row
    const row = headers.map(h => payload[h] ?? '')
    librarySheet.appendRow(row)
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

function sheetToObjects(sheet) {
  if (!sheet) return []
  const [headers, ...rows] = sheet.getDataRange().getValues()
  return rows
    .filter(r => r.some(c => c !== ''))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])))
}
