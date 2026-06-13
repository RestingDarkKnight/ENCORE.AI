// useSuggest.js — client hook for /api/suggest with debounce + in-session memo cache.
// One instance per (kind+title+industry+seniority) call site.

import { useCallback, useRef, useState } from "react";
import api from "@/lib/api";

const _sessionCache = new Map(); // key: stringified inputs → response

function makeKey(kind, title, industry, seniority, existing) {
  return JSON.stringify({
    kind,
    title: (title || "").trim().toLowerCase(),
    industry: (industry || "").trim().toLowerCase(),
    seniority: (seniority || "").trim().toLowerCase(),
    existing: (existing || []).map((s) => s.trim().toLowerCase()).sort(),
  });
}

export default function useSuggest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inflight = useRef({});

  const fetchSuggest = useCallback(async ({ kind, jobTitle, industry, seniority, existing = [], force = false }) => {
    if (!jobTitle?.trim()) {
      setError("Add a job title first.");
      return null;
    }
    const key = makeKey(kind, jobTitle, industry, seniority, existing);
    if (!force && _sessionCache.has(key)) {
      return _sessionCache.get(key);
    }
    if (inflight.current[key]) return inflight.current[key];

    setError(null);
    setLoading(true);
    const promise = (async () => {
      try {
        const { data } = await api.post("/suggest", {
          kind,
          job_title: jobTitle.trim(),
          industry: industry?.trim() || null,
          seniority: seniority || null,
          existing,
        });
        if (!force) _sessionCache.set(key, data);
        return data;
      } catch (err) {
        setError(err?.response?.data?.detail || "Could not load suggestions.");
        return null;
      } finally {
        setLoading(false);
        delete inflight.current[key];
      }
    })();
    inflight.current[key] = promise;
    return promise;
  }, []);

  return { fetchSuggest, loading, error };
}
