# Archery training stats

Copy this note into your vault (any folder).

## Plugins to install

| Install this | Author | Do **not** confuse with |
|--------------|--------|-------------------------|
| **Charts** | **phibr0** | Charts View, Advanced Canvas, Markwhen |

1. Community plugins → search **Charts** → pick **Charts** by **phibr0** (“Easily create interactive charts in your notes”)
2. [Dataview](https://github.com/blacksmithgu/obsidian-dataview) — enable **JavaScript queries** in Dataview settings

Docs: [charts.phib.ro](https://charts.phib.ro/Meta/Charts/Dataview+Integration)

Scorecards must use the `.rchery` format produced by RChery. Newer files include stats in a hidden `archery-meta` comment; older files are parsed from the score tables.

## Current month (base query)

Sessions from `.rchery` files modified this calendar month. Uses `archery-meta` when present, otherwise parses the scorecard tables.

```dataviewjs
const META_PREFIX = "<!-- archery-meta:";

function toJsDate(mtime) {
	return mtime instanceof Date ? mtime : new Date(mtime);
}

function formatDate(mtime) {
	const d = toJsDate(mtime);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function isCurrentMonth(mtime) {
	const d = toJsDate(mtime);
	const now = new Date();
	return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function parseMeta(content) {
	const line = content.split("\n").find((l) => l.trim().startsWith(META_PREFIX));
	if (!line) return null;
	try {
		const json = line.trim().slice(META_PREFIX.length).replace(/-->\s*$/, "").trim();
		const meta = JSON.parse(json);
		if (!meta || !meta.arrows) return null;
		return {
			roundType: meta.roundType ?? "—",
			arrows: meta.arrows,
			total: meta.score ?? 0,
			average: meta.average ?? null,
			tens: meta.tens ?? 0,
			nines: meta.nines ?? 0,
			eights: meta.eights ?? 0,
			sevens: meta.sevens ?? 0,
			sixes: meta.sixes ?? 0,
			fives: meta.fives ?? 0,
			fours: meta.fours ?? 0,
			threes: meta.threes ?? 0,
			twos: meta.twos ?? 0,
			ones: meta.ones ?? 0,
			misses: meta.misses ?? 0,
		};
	} catch {
		return null;
	}
}

function parseArrowCell(cell) {
	const trimmed = cell.trim();
	if (!trimmed) return null;
	const coordMatch = trimmed.match(/^(.+?)@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
	const scorePart = coordMatch ? coordMatch[1].trim() : trimmed;
	if (scorePart.toUpperCase() === "M") return 0;
	const value = Number.parseInt(scorePart, 10);
	return Number.isNaN(value) ? null : value;
}

function parseSessionTables(content) {
	const start = content.indexOf("<!-- archery-scorecard:start -->");
	const end = content.indexOf("<!-- archery-scorecard:end -->");
	if (start === -1 || end === -1) return null;

	const scores = [];
	for (const line of content.slice(start, end).split("\n")) {
		if (!line.startsWith("|") || line.includes("---") || /\|\s*End\s*\|/i.test(line)) continue;
		const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
		if (parts.length < 3 || !/^\d+$/.test(parts[0])) continue;
		for (const cell of parts.slice(1, -1)) {
			const score = parseArrowCell(cell);
			if (score !== null) scores.push(score);
		}
	}
	if (scores.length === 0) return null;

	const count = (n) => scores.filter((s) => s === n).length;
	const total = scores.reduce((sum, s) => sum + s, 0);
	return {
		roundType: "—",
		arrows: scores.length,
		total,
		average: total / scores.length,
		tens: count(10),
		nines: count(9),
		eights: count(8),
		sevens: count(7),
		sixes: count(6),
		fives: count(5),
		fours: count(4),
		threes: count(3),
		twos: count(2),
		ones: count(1),
		misses: count(0),
	};
}

function emptyTotals() {
	return {
		arrows: 0, tens: 0, nines: 0, eights: 0, sevens: 0, sixes: 0,
		fives: 0, fours: 0, threes: 0, twos: 0, ones: 0, misses: 0, total: 0,
	};
}

function addToTotals(totals, stats) {
	totals.arrows += stats.arrows;
	totals.tens += stats.tens;
	totals.nines += stats.nines;
	totals.eights += stats.eights;
	totals.sevens += stats.sevens;
	totals.sixes += stats.sixes;
	totals.fives += stats.fives;
	totals.fours += stats.fours;
	totals.threes += stats.threes;
	totals.twos += stats.twos;
	totals.ones += stats.ones;
	totals.misses += stats.misses;
	totals.total += stats.total;
}

// Optional: limit to a folder, e.g. "Archery"
const FOLDER_PREFIX = "";

const now = new Date();
const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const files = app.vault
	.getFiles()
	.filter((file) => file.extension === "rchery")
	.filter((file) => !FOLDER_PREFIX || file.path.startsWith(FOLDER_PREFIX + "/"))
	.filter((file) => isCurrentMonth(file.stat.mtime));

const rows = [];
const totals = emptyTotals();

for (const file of files) {
	const content = await dv.io.load(file.path);
	const stats = parseMeta(content) ?? parseSessionTables(content);
	if (!stats) continue;

	addToTotals(totals, stats);
	rows.push([
		dv.fileLink(file.path, false, file.basename),
		formatDate(file.stat.mtime),
		stats.roundType,
		stats.arrows,
		stats.tens,
		stats.nines,
		stats.eights,
		stats.sevens,
		stats.sixes,
		stats.fives,
		stats.misses,
		stats.total,
		stats.average != null ? stats.average.toFixed(1) : "—",
	]);
}

rows.sort((a, b) => String(b[1]).localeCompare(String(a[1])));

dv.header(2, `Archery — ${monthLabel}`);

if (rows.length === 0) {
	dv.paragraph("No scored .rchery files this month.");
} else {
	dv.table(
		["Session", "Date", "Round", "Arrows", "10s", "9s", "8s", "7s", "6s", "5s", "Miss", "Total", "Avg"],
		rows,
	);

	const avg = totals.arrows > 0 ? (totals.total / totals.arrows).toFixed(1) : "—";
	dv.paragraph(
		`${rows.length} sessions · ${totals.arrows} arrows · ` +
			`${totals.tens}×10 · ${totals.nines}×9 · ${totals.eights}×8 · ` +
			`${totals.sevens}×7 · ${totals.sixes}×6 · ${totals.fives}×5 · ` +
			`${totals.misses}×M · ${totals.total} total · ${avg} avg`,
	);
}
```

## All sessions (full dashboard)

```dataviewjs
function formatMtime(mtime) {
	const d = new Date(mtime);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function parseArrowCell(cell) {
	const trimmed = cell.trim();
	if (!trimmed) return null;

	const coordMatch = trimmed.match(/^(.+?)@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
	const scorePart = coordMatch ? coordMatch[1].trim() : trimmed;

	if (scorePart.toUpperCase() === "M") return 0;

	const value = Number.parseInt(scorePart, 10);
	return Number.isNaN(value) ? null : value;
}

function parseSession(content) {
	const start = content.indexOf("<!-- archery-scorecard:start -->");
	const end = content.indexOf("<!-- archery-scorecard:end -->");
	if (start === -1 || end === -1) return null;

	const block = content.slice(start, end);
	const scores = [];

	for (const line of block.split("\n")) {
		if (!line.startsWith("|")) continue;
		if (line.includes("---")) continue;
		if (/\|\s*End\s*\|/i.test(line)) continue;

		const parts = line
			.split("|")
			.map((part) => part.trim())
			.filter((part) => part.length > 0);

		if (parts.length < 3) continue;
		if (!/^\d+$/.test(parts[0])) continue;

		for (const cell of parts.slice(1, -1)) {
			const score = parseArrowCell(cell);
			if (score !== null) scores.push(score);
		}
	}

	if (scores.length === 0) return null;

	const count = (n) => scores.filter((s) => s === n).length;
	const total = scores.reduce((sum, score) => sum + score, 0);

	return {
		arrows: scores.length,
		total,
		average: total / scores.length,
		tens: count(10),
		nines: count(9),
		eights: count(8),
		sevens: count(7),
		sixes: count(6),
		fives: count(5),
		fours: count(4),
		threes: count(3),
		twos: count(2),
		ones: count(1),
		misses: count(0),
	};
}

function renderChart(host, chartConfig) {
	if (typeof window.renderChart !== "function") {
		return false;
	}
	window.renderChart(chartConfig, host);
	return true;
}

function archeryRingColors() {
	return [
		"#FFEB3B",
		"#FFEB3B",
		"#F44336",
		"#F44336",
		"#2196F3",
		"#2196F3",
		"#9E9E9E",
		"#9E9E9E",
		"#E0E0E0",
		"#E0E0E0",
		"#424242",
	];
}

// Optional: limit to a folder, e.g. "Archery"
const FOLDER_PREFIX = "";

const files = app.vault
	.getFiles()
	.filter((file) => file.extension === "rchery")
	.filter((file) => !FOLDER_PREFIX || file.path.startsWith(FOLDER_PREFIX + "/"));

const rows = [];
const sessions = [];
const totals = {
	arrows: 0,
	tens: 0,
	nines: 0,
	eights: 0,
	sevens: 0,
	sixes: 0,
	fives: 0,
	fours: 0,
	threes: 0,
	twos: 0,
	ones: 0,
	misses: 0,
	total: 0,
};

for (const file of files) {
	const content = await dv.io.load(file.path);
	const stats = parseSession(content);
	if (!stats) continue;

	const date = formatMtime(file.stat.mtime);

	sessions.push({
		name: file.basename,
		date,
		average: stats.average,
	});

	rows.push([
		dv.fileLink(file.path, false, file.basename),
		date,
		stats.arrows,
		stats.tens,
		stats.nines,
		stats.eights,
		stats.sevens,
		stats.sixes,
		stats.fives,
		stats.misses,
		stats.total,
		stats.average.toFixed(1),
	]);

	totals.arrows += stats.arrows;
	totals.tens += stats.tens;
	totals.nines += stats.nines;
	totals.eights += stats.eights;
	totals.sevens += stats.sevens;
	totals.sixes += stats.sixes;
	totals.fives += stats.fives;
	totals.fours += stats.fours;
	totals.threes += stats.threes;
	totals.twos += stats.twos;
	totals.ones += stats.ones;
	totals.misses += stats.misses;
	totals.total += stats.total;
}

rows.sort((a, b) => String(b[1]).localeCompare(String(a[1])));

dv.header(2, "Archery sessions");

if (rows.length === 0) {
	dv.paragraph("No scored .rchery files found.");
} else {
	dv.table(
		[
			"Session",
			"Date",
			"Arrows",
			"10s",
			"9s",
			"8s",
			"7s",
			"6s",
			"5s",
			"Miss",
			"Total",
			"Avg",
		],
		rows,
	);

	const avg =
		totals.arrows > 0
			? (totals.total / totals.arrows).toFixed(1)
			: "—";

	dv.header(2, "All training");
	dv.paragraph(
		`${totals.arrows} arrows · ` +
			`${totals.tens} tens · ${totals.nines} nines · ${totals.eights} eights · ` +
			`${totals.sevens} sevens · ${totals.sixes} sixes · ${totals.fives} fives · ` +
			`${totals.misses} misses · ${totals.total} total · ${avg} avg`,
	);

	dv.header(2, "Charts");

	if (typeof window.renderChart !== "function") {
		dv.paragraph(
			"Install **Charts** by **phibr0** (not Charts View), enable it, then reload this note.",
		);
	} else {
		const ringLabels = ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"];
		const ringData = [
			totals.tens,
			totals.nines,
			totals.eights,
			totals.sevens,
			totals.sixes,
			totals.fives,
			totals.fours,
			totals.threes,
			totals.twos,
			totals.ones,
			totals.misses,
		];

		dv.header(3, "Ring distribution");
		const ringHost = this.container.createDiv();
		renderChart(ringHost, {
			type: "bar",
			data: {
				labels: ringLabels,
				datasets: [
					{
						label: "Arrows",
						data: ringData,
						backgroundColor: archeryRingColors(),
					},
				],
			},
			options: {
				indexAxis: "y",
				scales: { x: { beginAtZero: true } },
				plugins: { legend: { display: false } },
			},
		});

		const gold = totals.tens + totals.nines;
		const rest = totals.arrows - gold;

		dv.header(3, "Gold zone (9–10)");
		const goldHost = this.container.createDiv();
		renderChart(goldHost, {
			type: "doughnut",
			data: {
				labels: ["9–10", "≤8"],
				datasets: [
					{
						label: "Arrows",
						data: [gold, rest],
						backgroundColor: ["#FFEB3B", "#BDBDBD"],
					},
				],
			},
		});

		if (sessions.length > 1) {
			const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));

			dv.header(3, "Average per session");
			const avgHost = this.container.createDiv();
			renderChart(avgHost, {
				type: "bar",
				data: {
					labels: sorted.map((s) =>
						s.date.length >= 10 ? s.date.slice(5) : s.date,
					),
					datasets: [
						{
							label: "Average",
							data: sorted.map((s) => Number(s.average.toFixed(2))),
						},
					],
				},
				options: {
					scales: { y: { beginAtZero: true } },
					plugins: { legend: { display: false } },
				},
			});
		}
	}
}
```
