import { useEffect, useState } from "react";
import { api } from "../api";

interface Props {
  onError: (message: string) => void;
  /** Bumped after a successful save so the rest of the app can refresh. */
  onModelChange?: (model: string) => void;
}

const KNOWN_MODELS = "claude-sonnet-5 · claude-opus-5 · claude-haiku-4-5-20251001";

export function SettingsPanel({ onError, onModelChange }: Props) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((settings) => {
        setModel(settings.model);
        setDraft(settings.model);
      })
      .catch((caught) => onError((caught as Error).message));
  }, [onError]);

  const save = async () => {
    const value = draft.trim();
    if (!value || value === model) return;
    setSaving(true);
    setSaved(false);
    try {
      const settings = await api.updateModel(value);
      setModel(settings.model);
      setDraft(settings.model);
      setSaved(true);
      onModelChange?.(settings.model);
    } catch (caught) {
      onError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings">
      <button className="link settings-toggle" onClick={() => setOpen((prev) => !prev)}>
        ⚙ Ρυθμίσεις
      </button>
      <p className="settings-current" title="Ενεργό μοντέλο Claude">
        Μοντέλο: <code>{model ?? "…"}</code>
      </p>

      {open && (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label htmlFor="model-input">Μοντέλο Claude</label>
          <input
            id="model-input"
            value={draft}
            placeholder="claude-sonnet-5"
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
            }}
          />
          <p className="settings-hint">Γνωστές επιλογές: {KNOWN_MODELS}</p>
          <button type="submit" className="primary" disabled={saving || !draft.trim()}>
            {saving ? "Αποθήκευση…" : "Αποθήκευση"}
          </button>
          {saved && <p className="settings-hint ok">Αποθηκεύτηκε.</p>}
        </form>
      )}
    </div>
  );
}
