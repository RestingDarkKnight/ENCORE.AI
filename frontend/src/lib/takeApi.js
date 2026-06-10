/* Public (no-auth) API helpers for the candidate take flow. */
import axios from "axios";
import { API_BASE } from "@/lib/api";

const pub = axios.create({ baseURL: API_BASE, timeout: 60000 });

export async function fetchTake(token) {
  const { data } = await pub.get(`/take/${token}`);
  return data;
}

export async function saveProgress(token, answers, honor_code_accepted) {
  await pub.post(`/take/${token}/progress`, { answers, honor_code_accepted });
}

export async function uploadAudio(token, sectionId, qIndex, blob, onProgress) {
  const fd = new FormData();
  fd.append("section_id", sectionId);
  fd.append("question_index", String(qIndex));
  const filename = `clip-${Date.now()}.webm`;
  fd.append("file", blob, filename);
  const { data } = await pub.post(`/take/${token}/audio`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}

export async function submitTake(token, answers, time_taken_seconds) {
  const { data } = await pub.post(`/take/${token}/submit`, {
    answers,
    honor_code_accepted: true,
    time_taken_seconds,
  });
  return data;
}

export function publicAudioUrl(token, sectionId, qIndex) {
  return `${API_BASE}/take/${token}/audio/${sectionId}/${qIndex}`;
}
