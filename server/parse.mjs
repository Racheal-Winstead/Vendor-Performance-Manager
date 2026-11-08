import {parseCSV} from '../src/metrics.js';
import {HttpError} from './db.mjs';

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_NOTES = 200;
const MAX_NOTE_CHARS = 2000;

// Stateless: validates an upload and returns the parsed rows. Nothing is saved
// until the manager creates or updates a review with the result.
export function parseMetricsCsv(text) {
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Upload a CSV with at least one metric row.');
  if (Buffer.byteLength(text, 'utf8') > MAX_CSV_BYTES) throw new HttpError(413, 'Choose a CSV smaller than 1 MB.');
  try {
    return parseCSV(text).map(({name, raw, unit, row}) => ({row, name, raw, unit, target: '', direction: 'min', assess: true}));
  } catch (e) {
    throw new HttpError(400, e.message);
  }
}

// One note per non-empty line. Stable refs (N1, N2...) are assigned when saved.
export function parseNotes(text) {
  if (typeof text !== 'string') throw new HttpError(400, 'Notes must be text.');
  const notes = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (notes.length > MAX_NOTES) throw new HttpError(400, `Use at most ${MAX_NOTES} notes per review.`);
  const long = notes.findIndex(n => n.length > MAX_NOTE_CHARS);
  if (long >= 0) throw new HttpError(400, `Note ${long + 1} is longer than ${MAX_NOTE_CHARS} characters.`);
  return notes;
}
