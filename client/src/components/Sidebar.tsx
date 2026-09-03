import { useState } from "react";
import type { School, SchoolClass } from "../types";

interface Props {
  schools: School[];
  selectedClassId: number | null;
  onSelectClass: (schoolClass: SchoolClass) => void;
  onAddSchool: (name: string) => Promise<void>;
  onAddClass: (schoolId: number, name: string, gradeLevel: string) => Promise<void>;
  onDeleteSchool: (id: number) => Promise<void>;
  onDeleteClass: (id: number) => Promise<void>;
  aiEnabled: boolean | null;
}

export function Sidebar({
  schools,
  selectedClassId,
  onSelectClass,
  onAddSchool,
  onAddClass,
  onDeleteSchool,
  onDeleteClass,
  aiEnabled,
}: Props) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [schoolName, setSchoolName] = useState("");
  const [classDraft, setClassDraft] = useState<Record<number, { name: string; grade: string }>>(
    {},
  );

  const toggle = (id: number) =>
    setExpanded((prev) => ({ ...prev, [id]: prev[id] === false ? true : !prev[id] }));

  return (
    <aside className="sidebar">
      <h1>edu-planner</h1>
      <p className="tagline">
        Εβδομαδιαίος προγραμματισμός ύλης
        {aiEnabled === false ? " · AI ανενεργό (λείπει API key)" : ""}
      </p>

      {schools.length === 0 && (
        <p className="empty">Δεν υπάρχουν σχολεία. Προσθέστε ένα παρακάτω.</p>
      )}

      {schools.map((school) => {
        const open = expanded[school.id] ?? true;
        const draft = classDraft[school.id] ?? { name: "", grade: "" };
        return (
          <div className="school" key={school.id}>
            <div className="school-header">
              <button className="name" onClick={() => toggle(school.id)}>
                {open ? "▾" : "▸"} {school.name}
              </button>
              <button
                className="link"
                title="Διαγραφή σχολείου"
                onClick={() => {
                  if (confirm(`Διαγραφή του σχολείου «${school.name}» και όλων των τμημάτων του;`)) {
                    void onDeleteSchool(school.id);
                  }
                }}
              >
                ✕
              </button>
            </div>

            {open && (
              <>
                <ul className="class-list">
                  {school.classes.map((schoolClass) => (
                    <li key={schoolClass.id}>
                      <button
                        className={`class-btn${schoolClass.id === selectedClassId ? " active" : ""}`}
                        onClick={() => onSelectClass(schoolClass)}
                      >
                        {schoolClass.name}
                        {schoolClass.gradeLevel ? ` · ${schoolClass.gradeLevel}` : ""}
                      </button>
                      <button
                        className="link"
                        title="Διαγραφή τμήματος"
                        onClick={() => {
                          if (confirm(`Διαγραφή του τμήματος «${schoolClass.name}»;`)) {
                            void onDeleteClass(schoolClass.id);
                          }
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                  {school.classes.length === 0 && (
                    <li className="muted" style={{ fontSize: 13 }}>
                      Χωρίς τμήματα
                    </li>
                  )}
                </ul>

                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!draft.name.trim()) return;
                    void onAddClass(school.id, draft.name.trim(), draft.grade.trim()).then(() =>
                      setClassDraft((prev) => ({ ...prev, [school.id]: { name: "", grade: "" } })),
                    );
                  }}
                >
                  <input
                    placeholder="Τμήμα (π.χ. Α1)"
                    value={draft.name}
                    onChange={(event) =>
                      setClassDraft((prev) => ({
                        ...prev,
                        [school.id]: { ...draft, name: event.target.value },
                      }))
                    }
                  />
                  <input
                    placeholder="Τάξη"
                    value={draft.grade}
                    onChange={(event) =>
                      setClassDraft((prev) => ({
                        ...prev,
                        [school.id]: { ...draft, grade: event.target.value },
                      }))
                    }
                  />
                  <button type="submit">+</button>
                </form>
              </>
            )}
          </div>
        );
      })}

      <form
        className="inline-form"
        style={{ marginTop: 20 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!schoolName.trim()) return;
          void onAddSchool(schoolName.trim()).then(() => setSchoolName(""));
        }}
      >
        <input
          placeholder="Νέο σχολείο"
          value={schoolName}
          onChange={(event) => setSchoolName(event.target.value)}
        />
        <button type="submit" className="primary">
          +
        </button>
      </form>
    </aside>
  );
}
