import { NoteItem, RetentionOption } from '../types';

export async function saveNote(
  title: string,
  content: string,
  retention: RetentionOption = 'permanent'
): Promise<NoteItem> {
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: title.trim(),
      content,
      retention,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success || !data.note) {
    throw new Error(data.error || `Server responded with status ${res.status}`);
  }

  return data.note;
}

export async function fetchNotes(): Promise<NoteItem[]> {
  try {
    const res = await fetch('/api/notes');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Failed to fetch notes:', err);
    return [];
  }
}

export async function deleteNote(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/notes/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    return Boolean(res.ok && data.success);
  } catch (err) {
    console.error(`Failed to delete note ${id}:`, err);
    return false;
  }
}
