import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { CurriculumTab } from "./components/CurriculumTab";
import { PlanTab } from "./components/PlanTab";
import { ChatTab } from "./components/ChatTab";
import type { School, SchoolClass } from "./types";

type Tab = "curriculum" | "plan" | "chat";

const TAB_LABELS: Record<Tab, string> = {
  curriculum: "Ύλη",
  plan: "Πρόγραμμα",
  chat: "Συνομιλία",
};

export function App() {
  const [schools, setSchools] = useState<School[]>([]);
  const [selected, setSelected] = useState<SchoolClass | null>(null);
  const [tab, setTab] = useState<Tab>("curriculum");
  const [error, setError] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  const onError = useCallback((message: string) => setError(message), []);

  const loadSchools = useCallback(async () => {
    try {
      const data = await api.listSchools();
      setSchools(data);
      setSelected((current) => {
        if (!current) return current;
        const stillThere = data
          .flatMap((school) => school.classes)
          .find((schoolClass) => schoolClass.id === current.id);
        return stillThere ?? null;
      });
    } catch (caught) {
      onError((caught as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    void loadSchools();
    api
      .health()
      .then((health) => setAiEnabled(health.aiEnabled))
      .catch(() => setAiEnabled(false));
  }, [loadSchools]);

  const selectedSchool = schools.find((school) => school.id === selected?.schoolId);

  return (
    <div className="app">
      <Sidebar
        schools={schools}
        selectedClassId={selected?.id ?? null}
        aiEnabled={aiEnabled}
        onError={onError}
        onSelectClass={(schoolClass) => {
          setSelected(schoolClass);
          setError(null);
        }}
        onAddSchool={async (name) => {
          try {
            await api.createSchool(name);
            await loadSchools();
          } catch (caught) {
            onError((caught as Error).message);
          }
        }}
        onAddClass={async (schoolId, name, gradeLevel) => {
          try {
            await api.createClass(schoolId, name, gradeLevel);
            await loadSchools();
          } catch (caught) {
            onError((caught as Error).message);
          }
        }}
        onDeleteSchool={async (id) => {
          try {
            await api.deleteSchool(id);
            await loadSchools();
          } catch (caught) {
            onError((caught as Error).message);
          }
        }}
        onDeleteClass={async (id) => {
          try {
            await api.deleteClass(id);
            if (selected?.id === id) setSelected(null);
            await loadSchools();
          } catch (caught) {
            onError((caught as Error).message);
          }
        }}
      />

      <main className="main">
        {error && (
          <div className="error" onClick={() => setError(null)} title="Κλικ για απόκρυψη">
            {error}
          </div>
        )}

        {!selected ? (
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Καλώς ήρθατε</h2>
            <p className="muted">
              Προσθέστε σχολεία και τμήματα από την αριστερή στήλη, μετά επιλέξτε ένα τμήμα
              για να καταχωρήσετε την ύλη του και να φτιάξετε εβδομαδιαίο πρόγραμμα.
            </p>
            {aiEnabled === false && (
              <p className="muted">
                Οι λειτουργίες AI είναι ανενεργές: ορίστε το <code>ANTHROPIC_API_KEY</code>{" "}
                στο <code>server/.env</code> και επανεκκινήστε τον διακομιστή.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="main-header">
              <h2>{selected.name}</h2>
              <span className="sub">
                {selectedSchool?.name}
                {selected.gradeLevel ? ` · ${selected.gradeLevel}` : ""}
              </span>
            </div>

            <nav className="tabs">
              {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
                <button
                  key={key}
                  className={tab === key ? "active" : ""}
                  onClick={() => setTab(key)}
                >
                  {TAB_LABELS[key]}
                </button>
              ))}
            </nav>

            {tab === "curriculum" && (
              <CurriculumTab key={selected.id} classId={selected.id} onError={onError} />
            )}
            {tab === "plan" && (
              <PlanTab
                key={selected.id}
                classId={selected.id}
                aiEnabled={aiEnabled === true}
                onError={onError}
              />
            )}
            {tab === "chat" && (
              <ChatTab
                key={selected.id}
                classId={selected.id}
                aiEnabled={aiEnabled === true}
                onError={onError}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
