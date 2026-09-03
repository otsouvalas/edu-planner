import { useEffect, useState } from "react";
import { api } from "../api";
import type { CurriculumItem, ReviewResult, WeeklyPlan } from "../types";

interface Props {
  classId: number;
  aiEnabled: boolean;
  onError: (message: string) => void;
}

type WeekKey = "current" | "next";

export function PlanTab({ classId, aiEnabled, onError }: Props) {
  const [week, setWeek] = useState<WeekKey>("current");
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>([]);
  const [weeks, setWeeks] = useState<{ current: string; next: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [addId, setAddId] = useState("");
  const [hoursDraft, setHoursDraft] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      const [fetchedPlan, items, weekInfo] = await Promise.all([
        api.getPlan(classId, week),
        api.listCurriculum(classId),
        api.weeks(),
      ]);
      setPlan(fetchedPlan);
      setCurriculum(items);
      setWeeks(weekInfo);
      setHoursDraft(fetchedPlan ? String(fetchedPlan.hoursPerWeek) : "");
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setRationale(null);
    setReview(null);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, week]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createEmptyPlan = () =>
    run("create", async () => {
      await api.createPlan(classId, week);
      await reload();
    });

  const generate = () =>
    run("generate", async () => {
      const result = await api.generatePlan(classId, week);
      setRationale(result.rationale);
      await reload();
    });

  const runReview = () =>
    run("review", async () => {
      const result = await api.reviewWeek(classId, false);
      setReview(result);
    });

  const applyReview = () =>
    run("apply", async () => {
      if (!review) return;
      await api.setPlanItems(review.nextWeekPlanId, review.proposedCurriculumItemIds);
      setReview(null);
      setWeek("next");
      await reload();
    });

  const toggle = (itemId: number, done: boolean) =>
    run("toggle", async () => {
      await api.togglePlanItem(itemId, done);
      await reload();
    });

  const removeItem = (itemId: number) =>
    run("remove", async () => {
      await api.deletePlanItem(itemId);
      await reload();
    });

  const addItem = () =>
    run("add", async () => {
      if (!plan || !addId) return;
      await api.addPlanItem(plan.id, Number(addId));
      setAddId("");
      await reload();
    });

  const saveHours = () =>
    run("hours", async () => {
      if (!plan) return;
      await api.updatePlan(plan.id, { hoursPerWeek: Number(hoursDraft) });
      await reload();
    });

  const plannedHours =
    plan?.items.reduce((sum, item) => sum + (item.estimatedHours ?? 1), 0) ?? 0;
  const available = curriculum.filter(
    (item) => !plan?.items.some((planItem) => planItem.curriculumItemId === item.id),
  );

  if (loading) return <p className="empty">Φόρτωση…</p>;

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <button
              className={week === "current" ? "primary" : ""}
              onClick={() => setWeek("current")}
            >
              Τρέχουσα εβδομάδα
            </button>
            <button
              className={week === "next" ? "primary" : ""}
              onClick={() => setWeek("next")}
            >
              Επόμενη εβδομάδα
            </button>
            {weeks && (
              <span className="item-meta">
                Δευτέρα {week === "current" ? weeks.current : weeks.next}
              </span>
            )}
          </div>
          <div className="row">
            <button
              onClick={generate}
              disabled={!aiEnabled || busy !== null}
              title={aiEnabled ? "" : "Λείπει το ANTHROPIC_API_KEY"}
            >
              {busy === "generate" ? "Δημιουργία…" : "Δημιουργία Προγράμματος"}
            </button>
            <button
              onClick={runReview}
              disabled={!aiEnabled || busy !== null}
              title={aiEnabled ? "" : "Λείπει το ANTHROPIC_API_KEY"}
            >
              {busy === "review" ? "Ανάλυση…" : "Review Εβδομάδας"}
            </button>
          </div>
        </div>
      </div>

      {rationale && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Αιτιολόγηση</h3>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{rationale}</p>
        </div>
      )}

      {review && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Πρόταση αναθεώρησης για την επόμενη εβδομάδα</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{review.summary}</p>
          <div className="row">
            <button className="primary" onClick={applyReview} disabled={busy !== null}>
              {busy === "apply" ? "Εφαρμογή…" : "Εφαρμογή πρότασης"}
            </button>
            <button onClick={() => setReview(null)}>Απόρριψη</button>
          </div>
        </div>
      )}

      {!plan ? (
        <div className="card">
          <p className="empty">Δεν υπάρχει πρόγραμμα για αυτή την εβδομάδα.</p>
          <button className="primary" onClick={createEmptyPlan} disabled={busy !== null}>
            Δημιουργία κενού προγράμματος
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Πρόγραμμα {plan.weekStartDate}</h3>
            <div className="row">
              <span className="item-meta">Ώρες/εβδομάδα:</span>
              <input
                style={{ width: 80 }}
                type="number"
                step="0.5"
                min="0"
                value={hoursDraft}
                onChange={(event) => setHoursDraft(event.target.value)}
              />
              <button onClick={saveHours} disabled={busy !== null}>
                Αποθήκευση
              </button>
              <span className="badge">
                {plannedHours} / {plan.hoursPerWeek} ώρες
              </span>
            </div>
          </div>

          {plan.items.length === 0 ? (
            <p className="empty">Καμία ενότητα προγραμματισμένη.</p>
          ) : (
            <ul className="list">
              {plan.items.map((item) => (
                <li key={item.id} className={item.done ? "done" : ""}>
                  <input
                    type="checkbox"
                    style={{ width: 18, marginTop: 3 }}
                    checked={item.done}
                    onChange={(event) => void toggle(item.id, event.target.checked)}
                  />
                  <div className="grow">
                    <div className="item-title">{item.title}</div>
                    <div className="item-meta">
                      {item.estimatedHours != null ? `${item.estimatedHours} ώρες` : "—"}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </div>
                  </div>
                  <button className="link" onClick={() => void removeItem(item.id)}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <select
              className="grow"
              value={addId}
              onChange={(event) => setAddId(event.target.value)}
            >
              <option value="">Προσθήκη ενότητας ύλης…</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.covered ? " (ολοκληρωμένη)" : ""}
                </option>
              ))}
            </select>
            <button onClick={addItem} disabled={!addId || busy !== null}>
              Προσθήκη
            </button>
          </div>
        </div>
      )}
    </>
  );
}
