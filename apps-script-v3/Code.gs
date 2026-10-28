const SHEET_ID = '1Hd_Fz7LZcQmlTPHYbiPavMpFk6RHvm2s-FNPw-q28Bw';
const RESERVATION_KEY = 'LOTTERY_DRAW_RESERVATIONS';
const RESERVATION_TTL_MS = 10 * 60 * 1000;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('三玉保育園 夕涼み会 抽選会（まとめ引き）')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function book_() { return SpreadsheetApp.openById(SHEET_ID); }

function parseExcluded_(text, max) {
  const result = new Set();
  String(text).split(',').map(x => x.trim()).filter(Boolean).forEach(part => {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return;
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    for (let n = Math.min(first, last); n <= Math.max(first, last); n++) {
      if (n >= 1 && n <= max) result.add(n);
    }
  });
  return result;
}

function excludedNumbers_(ss, max) {
  const settings = ss.getSheetByName('設定');
  const excluded = parseExcluded_(String(settings.getRange('B5').getValue() || ''), max);
  const exclusionSheet = ss.getSheetByName('排除番号');
  if (exclusionSheet && exclusionSheet.getLastRow() >= 2) {
    exclusionSheet.getRange(2, 1, exclusionSheet.getLastRow() - 1, 1).getValues().forEach(row => {
      const n = Number(row[0]);
      if (Number.isInteger(n) && n >= 1 && n <= max) excluded.add(n);
    });
  }
  return [...excluded].sort((a, b) => a - b);
}

function getState_(ss) {
  const settings = ss.getSheetByName('設定');
  const max = Number(settings.getRange('B4').getValue()) || 200;
  const excluded = excludedNumbers_(ss, max);
  const drawSheet = ss.getSheetByName('当選番号');
  const lastRow = drawSheet.getLastRow();
  const rows = (lastRow >= 4 ? drawSheet.getRange(4, 1, lastRow - 3, 3).getValues() : [])
    .filter(row => row[1] !== '')
    .map(row => ({ order: Number(row[0]), number: Number(row[1]), time: String(row[2]) }));
  return { max, excluded, draws: rows };
}

function getState() { return getState_(book_()); }

function reservations_() {
  const props = PropertiesService.getScriptProperties();
  let rows = [];
  try { rows = JSON.parse(props.getProperty(RESERVATION_KEY) || '[]'); } catch (e) {}
  const now = Date.now();
  return rows.filter(x => x && x.token && Array.isArray(x.numbers) && Number(x.expires) > now);
}

function saveReservations_(rows) {
  const props = PropertiesService.getScriptProperties();
  if (rows.length) props.setProperty(RESERVATION_KEY, JSON.stringify(rows));
  else props.deleteProperty(RESERVATION_KEY);
}

function prepareDraw(count) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = book_();
    const state = getState_(ss);
    const requested = Number(count);
    if (!Number.isInteger(requested) || requested < 1 || requested > 15) {
      throw new Error('引く数は1〜15で入力してください。');
    }
    const reservations = reservations_();
    const reserved = reservations.flatMap(x => x.numbers);
    const used = new Set([...state.draws.map(x => x.number), ...state.excluded, ...reserved]);
    const available = [];
    for (let n = 1; n <= state.max; n++) if (!used.has(n)) available.push(n);
    if (requested > available.length) throw new Error(`残り${available.length}個しか抽選できません。`);
    for (let i = available.length - 1; i > available.length - 1 - requested; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const reservation = {
      token: Utilities.getUuid(),
      numbers: available.slice(-requested),
      expires: Date.now() + RESERVATION_TTL_MS
    };
    reservations.push(reservation);
    saveReservations_(reservations);
    return reservation;
  } finally {
    lock.releaseLock();
  }
}

function commitPreparedDraw(token) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const reservations = reservations_();
    const index = reservations.findIndex(x => x.token === String(token));
    if (index < 0) throw new Error('抽選番号の予約が期限切れです。もう一度抽選してください。');
    const reservation = reservations[index];
    const ss = book_();
    const state = getState_(ss);
    const used = new Set([...state.draws.map(x => x.number), ...state.excluded]);
    if (reservation.numbers.some(n => used.has(n) || n < 1 || n > state.max)) {
      reservations.splice(index, 1);
      saveReservations_(reservations);
      throw new Error('ほかの端末で抽選状態が変わりました。もう一度抽選してください。');
    }
    const sheet = ss.getSheetByName('当選番号');
    const startRow = Math.max(sheet.getLastRow() + 1, 4);
    const now = new Date();
    const newDraws = reservation.numbers.map((number, i) => ({
      order: state.draws.length + i + 1,
      number,
      time: String(now)
    }));
    sheet.getRange(startRow, 1, newDraws.length, 3)
      .setValues(newDraws.map(x => [x.order, x.number, now]));
    reservations.splice(index, 1);
    saveReservations_(reservations);
    return {
      state: { max: state.max, excluded: state.excluded, draws: state.draws.concat(newDraws) },
      numbers: reservation.numbers
    };
  } finally {
    lock.releaseLock();
  }
}

function drawMany(count) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = book_();
    const state = getState_(ss);
    const requested = Number(count);
    if (!Number.isInteger(requested) || requested < 1 || requested > 15) {
      throw new Error('引く数は1〜15で入力してください。');
    }
    const used = new Set([...state.draws.map(x => x.number), ...state.excluded]);
    const available = [];
    for (let n = 1; n <= state.max; n++) if (!used.has(n)) available.push(n);
    if (requested > available.length) throw new Error(`残り${available.length}個しか抽選できません。`);
    for (let i = available.length - 1; i > available.length - 1 - requested; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    const numbers = available.slice(-requested);
    const sheet = ss.getSheetByName('当選番号');
    const startRow = Math.max(sheet.getLastRow() + 1, 4);
    const now = new Date();
    const newDraws = numbers.map((number, i) => ({
      order: state.draws.length + i + 1,
      number,
      time: String(now)
    }));
    sheet.getRange(startRow, 1, numbers.length, 3)
      .setValues(newDraws.map(x => [x.order, x.number, now]));
    return {
      state: { max: state.max, excluded: state.excluded, draws: state.draws.concat(newDraws) },
      numbers
    };
  } finally {
    lock.releaseLock();
  }
}

function saveMax(max) {
  max = Number(max);
  if (!Number.isInteger(max) || max < 1 || max > 9999) {
    throw new Error('上限は1〜9999で入力してください。');
  }
  book_().getSheetByName('設定').getRange('B4').setValue(max);
  return getState();
}

function undoLast() {
  const sheet = book_().getSheetByName('当選番号');
  const last = sheet.getLastRow();
  if (last < 4) throw new Error('取り消せる番号がありません。');
  sheet.getRange(last, 1, 1, 3).clearContent();
  return getState();
}

function resetAll() {
  book_().getSheetByName('当選番号').getRange('A4:C').clearContent();
  return getState();
}
