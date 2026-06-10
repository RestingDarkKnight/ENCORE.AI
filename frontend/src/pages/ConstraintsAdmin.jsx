import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, BookOpenText } from "@phosphor-icons/react";

const TYPES = [
  { id: "real_fact",    label: "Real fact",    cls: "border-brand-moss/30 bg-brand-moss/5 text-brand-moss" },
  { id: "limit",        label: "Limit",        cls: "border-brand-sand/30 bg-brand-sand/5 text-brand-sand" },
  { id: "anti_pattern", label: "Anti-pattern", cls: "border-signal-error/30 bg-signal-error/5 text-signal-error" },
];

export default function ConstraintsAdmin() {
  const [domainKey, setDomainKey] = useState("");
  const [domains, setDomains] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ constraint_type: "real_fact", text: "" });

  useEffect(() => {
    api.get("/constraints/domains").then((r) => {
      setDomains(r.data);
      if (r.data.length > 0 && !domainKey) setDomainKey(r.data[0]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!domainKey) { setItems([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get("/constraints", { params: { domain_key: domainKey } });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [domainKey]);

  useEffect(() => { load(); }, [load]);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!domainKey || !form.text.trim()) return;
    try {
      await api.post("/constraints", { ...form, domain_key: domainKey });
      setForm({ constraint_type: "real_fact", text: "" });
      toast.success("Constraint added.");
      load();
      if (!domains.includes(domainKey)) setDomains((d) => [...d, domainKey].sort());
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not add.");
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this constraint?")) return;
    try {
      await api.delete(`/constraints/${id}`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not delete.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8" data-testid="constraints-admin">
      <header>
        <p className="encore-overline mb-2 flex items-center gap-2"><BookOpenText weight="duotone" size={12} className="text-brand-sand" /> Grounding library</p>
        <h1 className="font-display text-3xl sm:text-4xl font-black tracking-tighter leading-tight">Domain constraints</h1>
        <p className="text-ink-soft mt-3 max-w-xl">Curated truths per role family. Real facts, hard limits, and anti-patterns get injected into Claude before every case generation for that domain.</p>
      </header>

      <section className="encore-card p-6">
        <label className="block text-sm font-medium text-ink-soft mb-1.5">Domain key</label>
        <div className="flex gap-2 items-center">
          <input
            list="known-domains"
            value={domainKey}
            onChange={(e) => setDomainKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            placeholder="e.g. casting_foundry_qa_engineer"
            data-testid="constraints-domain-input"
            className="flex-1 bg-transparent border border-black/15 rounded-lg px-4 py-2.5 font-mono text-sm focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all"
          />
          <datalist id="known-domains">
            {domains.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
        {domains.length > 0 && (
          <p className="text-xs text-ink-soft mt-2">Known domains: {domains.slice(0, 6).join(" · ")}{domains.length > 6 ? "…" : ""}</p>
        )}
      </section>

      <section className="encore-card p-6">
        <p className="encore-overline mb-3">Add a constraint</p>
        <form onSubmit={onAdd} className="space-y-3" data-testid="constraints-add-form">
          <div className="flex gap-2 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, constraint_type: t.id }))}
                data-testid={`constraints-type-${t.id}`}
                className={`text-xs font-medium border rounded-full px-3 py-1.5 transition-all ${form.constraint_type === t.id ? t.cls : "bg-transparent border-black/15 text-ink-soft hover:border-black/30"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={form.text}
            onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
            rows={2}
            placeholder="e.g. Subsurface pinhole porosity is a gas/hydrogen defect, distinct from shrinkage."
            data-testid="constraints-text-input"
            className="w-full bg-canvas border border-black/15 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all text-sm resize-none"
          />
          <button
            type="submit"
            disabled={!domainKey || !form.text.trim()}
            data-testid="constraints-add-submit"
            className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-hover disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-all hover:-translate-y-0.5"
          >
            <Plus size={14} weight="bold" /> Add
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight mb-4">Current constraints {items.length > 0 && <span className="text-sm font-normal text-ink-soft ml-2">({items.length})</span>}</h2>
        {loading ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : items.length === 0 ? (
          <div className="encore-card p-8 text-center text-sm text-ink-soft" data-testid="constraints-empty">
            No constraints yet for <code className="font-mono text-xs px-1 py-0.5 bg-black/[0.04] rounded">{domainKey || "(no domain)"}</code>. The grounding layer will fall back to plain generation for this domain until you add some.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((c) => {
              const cfg = TYPES.find((t) => t.id === c.constraint_type) || TYPES[0];
              return (
                <li key={c.id} className="encore-card p-4 flex items-start gap-3" data-testid={`constraint-${c.id}`}>
                  <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 shrink-0 ${cfg.cls}`}>{cfg.label}</span>
                  <p className="text-sm text-ink flex-1">{c.text}</p>
                  <button
                    onClick={() => onDelete(c.id)}
                    data-testid={`constraint-delete-${c.id}`}
                    className="text-ink-soft hover:text-signal-error shrink-0"
                    title="Delete"
                  >
                    <Trash size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
