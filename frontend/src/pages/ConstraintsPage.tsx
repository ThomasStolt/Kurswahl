type Row = { label: string; value: string; note?: string }

function Section({
  title,
  intro,
  rows,
  footer,
}: {
  title: string
  intro?: string
  rows: Row[]
  footer?: React.ReactNode
}) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-6 shadow-card">
      <h2 className="font-display text-lg font-semibold text-t1 mb-1">{title}</h2>
      {intro && <p className="text-sm text-t2 mb-4 leading-relaxed">{intro}</p>}
      <dl className="divide-y divide-border">
        {rows.map(r => (
          <div key={r.label} className="py-3 grid grid-cols-[1fr_auto] gap-4 items-baseline">
            <div>
              <dt className="text-sm font-medium text-t1">{r.label}</dt>
              {r.note && <p className="text-xs text-t3 mt-0.5 leading-relaxed">{r.note}</p>}
            </div>
            <dd className="text-sm font-mono tabular-nums text-accent font-semibold whitespace-nowrap">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {footer && <div className="mt-4 pt-4 border-t border-border text-xs text-t3 leading-relaxed">{footer}</div>}
    </section>
  )
}

export default function ConstraintsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 stagger-1">
        <h1 className="font-display text-3xl font-bold text-t1 mb-1.5">Rahmenbedingungen</h1>
        <p className="text-t2 text-sm">Welche Regeln der Optimierer berücksichtigt — und was sie in der Praxis bedeuten</p>
      </div>

      <div className="space-y-5">
        <div className="stagger-2">
          <Section
            title="CSV-Import"
            intro="Beim Hochladen wird jede Zeile validiert. Fehlerhafte Schüler werden zwar importiert, aber im Editor rot markiert und von der Optimierung ausgeschlossen."
            rows={[
              { label: 'Werte pro Kurs', value: '0 – 8', note: '0 = kein Interesse, 1 = höchste Priorität, 8 = niedrigste Priorität' },
              { label: 'Anzahl Wunschkurse pro Schüler', value: 'genau 8', note: 'Exakt 8 von null verschiedene Werte müssen gesetzt sein.' },
              { label: 'Doppelte Prioritäten', value: 'verboten', note: 'Jede Priorität 1–8 darf pro Schüler nur einmal vorkommen.' },
              { label: 'Schülernummer', value: 'Integer', note: 'Die Spalte „Nr." muss eine ganze Zahl enthalten.' },
              { label: 'Maximale Dateigröße', value: '5 MB' },
            ]}
          />
        </div>

        <div className="stagger-2">
          <Section
            title="Kurs-Kapazitäten"
            intro="Jeder Kurs hat eine Unter- und Obergrenze für die Anzahl zugeteilter Schüler. Die Grenzen gelten nur, wenn der Kurs tatsächlich angeboten wird."
            rows={[
              { label: 'Minimum pro Kurs', value: '15 Schüler', note: 'Wird ein Kurs angeboten, müssen mindestens 15 Schüler ihn besuchen — sonst würde er wirtschaftlich nicht tragbar sein.' },
              { label: 'Maximum pro Kurs (Standard)', value: '26 Schüler' },
              { label: 'Maximum Kochen', value: '16 Schüler', note: 'Sonderregel wegen der begrenzten Arbeitsplätze in der Schulküche.' },
            ]}
            footer={
              <>
                <strong className="text-t2">Konsequenz:</strong> Mit 4 Kursen pro Halbjahr liegt die Gesamtkapazität eines Halbjahres zwischen 60 (4 × 15) und 104 (4 × 26). Landet Kochen in einem Halbjahr, sinkt die Obergrenze auf 94 (3 × 26 + 16). Für alle typischen Jahrgangsgrößen bis ca. 100 Schüler bleibt der Solver damit lösbar.
              </>
            }
          />
        </div>

        <div className="stagger-3">
          <Section
            title={'Volloptimierung (Button „Optimierung starten")'}
            intro="Der Solver wählt automatisch, welche Kurse aus den bis zu 18 Kandidaten angeboten werden und teilt jedem Schüler je einen Kurs pro Halbjahr zu."
            rows={[
              { label: 'Anzahl angebotener Kurse', value: 'exakt 8', note: 'Aus allen Kandidaten werden die 8 gewählt, die die Gesamtzufriedenheit maximieren.' },
              { label: 'Kurse pro Halbjahr', value: '4 + 4', note: 'Jeweils genau 4 in Halbjahr 1 und 4 in Halbjahr 2.' },
              { label: 'Kurse in beiden Halbjahren', value: 'nicht möglich', note: 'Ein Kurs gehört entweder zu HJ1, zu HJ2 oder wird nicht angeboten.' },
              { label: 'Zuteilungen pro Schüler', value: '1 Kurs pro HJ', note: 'Jeder gültige Schüler bekommt genau einen Kurs pro Halbjahr — keine Mehrfachbelegung, keine Lücken.' },
              { label: 'Nur angebotene Kurse zuteilbar', value: 'garantiert', note: 'Ein Schüler kann nie einem Kurs zugeteilt werden, der nicht ausgewählt wurde.' },
            ]}
          />
        </div>

        <div className="stagger-3">
          <Section
            title="Nachträgliches Verschieben (Drag & Drop)"
            intro={'Nach der Volloptimierung können Kurse per Drag & Drop zwischen den Halbjahren oder nach „Nicht angeboten" gezogen werden. Der Solver berechnet die Schüler-Zuteilung dann neu.'}
            rows={[
              { label: 'Semantik', value: 'Tausch', note: 'Zwei Kurse tauschen ihren Status (HJ1 ↔ HJ2, HJ ↔ Nicht angeboten). Die 4+4-Verteilung bleibt dadurch immer erhalten.' },
              { label: 'Pro Halbjahr mindestens ein Kurs', value: 'Pflicht', note: 'Ein Halbjahr darf nie leer bleiben, sonst weist der Backend-Endpoint den Tausch mit 400 ab.' },
              { label: 'Kapazitätsprüfung', value: 'sofort', note: 'Nach jedem Drop prüft der Solver, ob die neue Konstellation noch feasible ist. Ist sie es nicht (z. B. weil Kochens 16er-Cap die Gesamtkapazität unter die Schülerzahl drückt), springt die Karte mit rotem Hinweis zurück.' },
            ]}
          />
        </div>

        <div className="stagger-4">
          <Section
            title="Zufriedenheits-Score"
            intro="Der Optimierer maximiert die Summe aller individuellen Score-Beiträge — er wählt also die Verteilung, bei der im Schnitt möglichst viele Schüler möglichst hohe Prioritäten erhalten."
            rows={[
              { label: 'Priorität 1', value: '+ 8 Punkte' },
              { label: 'Priorität 2', value: '+ 7 Punkte' },
              { label: 'Priorität 3', value: '+ 6 Punkte' },
              { label: 'Priorität 4', value: '+ 5 Punkte' },
              { label: 'Priorität 5', value: '+ 4 Punkte' },
              { label: 'Priorität 6', value: '+ 3 Punkte' },
              { label: 'Priorität 7', value: '+ 2 Punkte' },
              { label: 'Priorität 8', value: '+ 1 Punkt' },
              { label: 'Nicht auf der Wunschliste', value: '− 5 Punkte', note: 'Strafterm: tritt auf, wenn der Solver einen Schüler in einen Kurs setzen muss, den er gar nicht gewählt hat — typisch, wenn ein Kurs mit wenig Interesse angeboten wird, aber seine 15er-Mindestgrenze erreichen muss.' },
              { label: 'Maximum pro Schüler', value: '16 Punkte', note: '8 + 8, wenn beide Halbjahre die erste Priorität treffen.' },
            ]}
            footer={
              <>
                Der global angezeigte Prozentwert ist <code className="font-mono text-accent">erreichte Punkte / maximal mögliche Punkte</code>, wobei das Maximum stets <code className="font-mono text-accent">16 × Anzahl Schüler</code> beträgt. Die Ampel-Labels: <strong className="text-ok">Exzellent</strong> (≥ 85%), <strong className="text-yellow-600 dark:text-yellow-400">Gut</strong> (≥ 70%), <strong className="text-orange-600 dark:text-orange-400">Akzeptabel</strong> (≥ 55%), <strong className="text-err">Kritisch</strong> (darunter).
              </>
            }
          />
        </div>

        <div className="stagger-4">
          <Section
            title="Solver & Infrastruktur"
            intro="Technische Parameter des Branch-and-Bound-Solvers (CBC via PuLP) und der Container-Infrastruktur. In der Regel nicht anzufassen."
            rows={[
              { label: 'Solver', value: 'CBC', note: 'Coin-or Branch and Cut — Open-Source-ILP-Solver, der über PuLP angesprochen wird.' },
              { label: 'Zeitlimit', value: '240 s', note: 'Obergrenze, bis der Solver abbricht. Auf dem Raspberry Pi liegt ein typischer Lauf bei 40–90 s. Überschreibbar per Env-Var KURSWAHL_SOLVER_TIME_LIMIT.' },
              { label: 'Parallele Threads', value: '4', note: 'CBC parallelisiert den Branch-and-Bound-Baum. Überschreibbar per Env-Var KURSWAHL_SOLVER_THREADS.' },
              { label: 'nginx proxy_read_timeout', value: '300 s', note: 'Muss über dem Solver-Zeitlimit liegen, sonst würde nginx die HTTP-Verbindung zum Backend kappen, bevor der Solver fertig ist.' },
              { label: 'Session-Persistenz', value: '/data/session.json', note: 'Atomic write-and-rename — übersteht Abstürze ohne korrupte Zwischenzustände.' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
