import { useEffect, useState } from "react";
import { api } from "../api";
import type { CurriculumItem } from "../types";

interface Props {
  classId: number;
  onError: (message: string) => void;
}

export function CurriculumTab({ classId, onError }: Props) {
  const [items, setItems] = useState<CurriculumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");

  const reload = () => {
    setLoading(true);
    api
      .listCurriculum(classId)
      .then(setItems)
      .catch((error: Error) => onError(error.message))
      .finally(() => setLoading(false));
  };

  useEffect(reload, [classId]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createCurriculumItem(classId, {
        title: title.trim(),
        description: description.trim() || undefined,
        estimatedHours: hours === "" ? null : Number(hours),
      });
      setTitle("");
      setDescription("");
      setHours("");
      reload();
    } catch (error) {
      onError((error as Error).message);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Διαγραφή αυτής της ενότητας ύλης;")) return;
    try {
      await api.deleteCurriculumItem(id);
      reload();
    } catch (error) {
      onError((error as Error).message);
    }
  };

  const totalHours = items.reduce((sum, item) => sum + (item.estimatedHours ?? 0), 0);

  return (
    <>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Νέα ενότητα ύλης</h3>
        <form onSubmit={add}>
          <div className="row" style={{ marginBottom: 8 }}>
            <input
              className="grow"
              placeholder="Τίτλος ενότητας"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <input
              style={{ width: 120 }}
              type="number"
              step="0.5"
              min="0"
              placeholder="Ώρες"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </div>
          <div className="row">
            <input
              className="grow"
              placeholder="Περιγραφή (προαιρετικά)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <button type="submit" className="primary">
              Προσθήκη
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Ύλη</h3>
          <span className="item-meta">
            {items.length} ενότητες · {totalHours} εκτ. ώρες
          </span>
        </div>
        {loading ? (
          <p className="empty">Φόρτωση…</p>
        ) : items.length === 0 ? (
          <p className="empty">Δεν έχει καταχωρηθεί ύλη για αυτό το τμήμα.</p>
        ) : (
          <ul className="list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="grow">
                  <div className="item-title">{item.title}</div>
                  {item.description && <div className="item-meta">{item.description}</div>}
                  <div className="item-meta">
                    {item.estimatedHours != null
                      ? `${item.estimatedHours} ώρες`
                      : "χωρίς εκτίμηση ωρών"}
                  </div>
                </div>
                {item.covered ? (
                  <span className="badge ok">ολοκληρωμένη</span>
                ) : item.scheduled ? (
                  <span className="badge">προγραμματισμένη</span>
                ) : null}
                <button className="link" onClick={() => void remove(item.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
