#!/usr/bin/env python3
"""
Build one self-contained audit workbook HTML per use case.

    python3 scripts/build.py                 # build every use case
    python3 scripts/build.py dora-2024-1774  # build one

The engine (engine/*.js) is shared and never forked. The use case
(usecases/<id>/*.json) supplies the normative content, prompts, evidence
vocabulary, method text and branding. Output is a single HTML file in dist/.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENGINE = ROOT / "engine"
USECASES = ROOT / "usecases"
DIST = ROOT / "dist"

JS_ORDER = sorted(p.name for p in ENGINE.glob("*.js"))


def build(use_case_dir: pathlib.Path) -> pathlib.Path:
    shell = (use_case_dir / "shell.html").read_text(encoding="utf-8")
    package = json.loads((use_case_dir / "usecase.json").read_text(encoding="utf-8"))

    # --- resolve the requirements for this package ---
    reqs = load_requirements(use_case_dir, package)

    # --- classes-by-ref index, so requirements can carry auditor-confirmed classes ---
    el = package.get("evidenceVocab", {})
    evidence_vocab = {
        "design": re_compile(el.get("designPattern")),
        "operating": re_compile(el.get("operatingPattern")),
        "designDetail": re_compile(el.get("designDetailPattern")),
        "categories": [[re_compile(c["pattern"]), c["label"]] for c in el.get("categories", [])],
        "defaultCategory": el.get("defaultCategory", "Other"),
    }
    raci_rules = [[re_compile(r["pattern"]), r["raci"]] for r in package.get("raciRules", [])]

    runtime = {
        "id": package["id"],
        "title": package["title"],
        "version": package["version"],
        "engineVersion": package["engineVersion"],
        "subtitle": package.get("subtitle", ""),
        "settingsIntro": package.get("settingsIntro", ""),
        "normativeSources": package.get("normativeSources", []),
        "requirementCut": {
            "mode": package["requirementCut"]["mode"],
            "refTemplate": package["requirementCut"].get("refTemplate", "Art. {n} – {title}"),
            "obligationPattern": package["requirementCut"]["obligationPattern"],
            "maxFallback": package["requirementCut"].get("maxFallback", 60),
        },
        "validation": package.get("validation", {}),
        "prompts": json.loads((use_case_dir / "prompts.json").read_text(encoding="utf-8")),
        "evidenceVocab": evidence_vocab,
        "raciRules": raci_rules,
        "defaultRaci": package.get("defaultRaci", ["ICT risk function", "Management body", "Compliance, internal audit", "Business and ICT functions"]),
        "classesByRef": classes_by_ref(reqs),
        "classesOrigin": package.get("classesOrigin", "Normative package"),
        "normativePackage": {
            "fileName": package["normativePackage"]["fileName"],
            "fileTag": package["normativePackage"]["fileTag"],
            "requirements": reqs,
        },
        "sampleEvidence": package.get("sampleEvidence", []),
        "settingDefaults": package.get("settingDefaults", {}),
        "stopwords": package.get("stopwords", DEFAULT_STOPWORDS),
        "methodHtml": (use_case_dir / "method.html").read_text(encoding="utf-8"),
    }

    js = "\n\n".join((ENGINE / name).read_text(encoding="utf-8") for name in JS_ORDER)
    inject = "window.__USECASE__=" + json.dumps(runtime, ensure_ascii=False).replace("</", "<\\/") + ";\n" + js

    html = shell.replace("/*__USECASE__*/", inject)
    for key, value in {
        "{{TITLE}}": package["title"],
        "{{SUBTITLE}}": package.get("subtitle", ""),
        "{{VERSION}}": package["version"],
        "{{METHOD}}": runtime["methodHtml"],
        "{{SETTINGS_INTRO}}": package.get("settingsIntro", ""),
        "{{NORMATIVE_NOTE}}": package["normativePackage"].get("uploadNote", ""),
        "{{EVIDENCE_NOTE}}": package.get("evidenceNote", ""),
        "{{LOAD_LABEL}}": package["normativePackage"].get("loadLabel", "Load the normative package"),
    }.items():
        html = html.replace(key, value)

    if "{{" in html:
        leftovers = {html[i:i + 22] for i in range(len(html)) if html.startswith("{{", i)}
        raise SystemExit(f"Unresolved placeholders in {use_case_dir.name}: {sorted(leftovers)}")

    DIST.mkdir(exist_ok=True)
    out = DIST / f"{package['id']}_workbook.html"
    out.write_text(html, encoding="utf-8")
    return out


def load_requirements(use_case_dir, package):
    """Requirements from requirements.json, or built from articles + a classes CSV/JSON."""
    direct = use_case_dir / "requirements.json"
    if direct.exists():
        return json.loads(direct.read_text(encoding="utf-8"))

    articles = json.loads((use_case_dir / package["normativePackage"]["articlesFile"]).read_text(encoding="utf-8"))
    classes_file = use_case_dir / package["normativePackage"].get("classesFile", "classes.csv")
    classes = {}
    if classes_file.exists():
        import csv
        with classes_file.open(encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                classes[row["Ref."].strip()] = {
                    "design": row["Control Design"], "monitor": row["Monitoring the Effectiveness"],
                    "evidence": row["Demonstrate by Evidencing"], "owner": row["Ownership (RACI)"],
                }
    out = []
    for a in articles:
        ref = f"Art. {a['n']}"
        item = {
            "ref": f"{ref} – {a['t']}",
            "article": a["n"],
            "title": a["t"],
            "text": " ".join(a["x"].split()),
        }
        if a.get("applicability"):
            item["applicability"] = a["applicability"]
        out.append(item)
    return attach_classes(out, classes)


def attach_classes(reqs, classes):
    for r in reqs:
        key = r["ref"].split(" – ")[0].strip()
        if key in classes:
            r["classes"] = classes[key]
    return reqs


def classes_by_ref(reqs):
    return {r["ref"].split(" – ")[0].strip(): r["classes"] for r in reqs if r.get("classes")}


def re_compile(pattern):
    """Return a JS-style regex literal marker; the engine builds RegExp from strings."""
    return pattern


DEFAULT_STOPWORDS = ("the and for that with shall this which from have been will their there these those such each "
                     "when where being also upon within into than other are not any all may can its our your was were "
                     "has had you one per via").split()


if __name__ == "__main__":
    targets = sys.argv[1:] or [p.name for p in sorted(USECASES.iterdir()) if p.is_dir()]
    for name in targets:
        path = build(USECASES / name)
        print(f"built {path.relative_to(ROOT)}  ({path.stat().st_size:,} bytes)")
