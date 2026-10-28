#!/usr/bin/env python3
"""Generate two demo CV PDFs for E2E testing: one strong, one weak candidate."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

def make_pdf(path, lines):
    c = canvas.Canvas(path, pagesize=A4)
    w, h = A4
    y = h - 25 * mm
    c.setFont("Helvetica-Bold", 20)
    c.drawString(25 * mm, y, lines[0]); y -= 10 * mm
    c.setFont("Helvetica", 10.5)
    for ln in lines[1:]:
        if ln.startswith("## "):
            y -= 6 * mm
            c.setFont("Helvetica-Bold", 13)
            c.drawString(25 * mm, y, ln[3:])
            c.setFont("Helvetica", 10.5)
        else:
            y -= 6 * mm
            for chunk in _wrap(ln, 95):
                c.drawString(25 * mm, y, chunk)
                y -= 5.2 * mm
    c.save()

def _wrap(text, width):
    words, out, cur = text.split(), [], ""
    for wd in words:
        if len(cur) + len(wd) + 1 > width:
            out.append(cur); cur = wd
        else:
            cur = f"{cur} {wd}".strip()
    if cur: out.append(cur)
    return out or [""]

# ── Strong candidate ──
make_pdf("/home/z/my-project/scripts/e2e/cv_grace_njeri.pdf", [
    "Grace Njeri",
    "Email: grace.njeri@example.com | Phone: +254 712 345 678 | Nairobi, Kenya",
    "## Professional Summary",
    "Operations analyst with 4 years of experience in logistics and data-driven process optimisation. "
    "Proven record of cutting reporting turnaround by 35% and leading cross-team dashboards adoption. "
    "Known for clear stakeholder communication and structured problem solving.",
    "## Experience",
    "Operations Analyst, Eastwind Logistics (2022-2026): owned the weekly KPI reporting pipeline in Excel and Power BI; "
    "automated data cleaning with Python scripts saving 12 hours weekly; presented insights to regional directors monthly.",
    "Junior Analyst, Brightpath Consulting (2020-2022): supported supply-chain diagnostics for 8 clients; "
    "built cost models and scenario analyses used in board recommendations.",
    "## Education",
    "BSc Operations Management, University of Nairobi, 2016-2020, Upper Second Class.",
    "## Skills",
    "Advanced Excel, Power BI, SQL, Python for data analysis, process mapping, stakeholder reporting, fluent English, Kiswahili.",
    "## Certifications",
    "Lean Six Sigma Yellow Belt (2021). Google Data Analytics Certificate (2022).",
])

# ── Weak candidate ──
make_pdf("/home/z/my-project/scripts/e2e/cv_brian_otto.pdf", [
    "Brian Otto",
    "Email: brian.otto@example.com | Phone: +254 700 111 222",
    "## About Me",
    "Recent secondary school graduate looking for any office job. I am hardworking and willing to learn.",
    "## Experience",
    "Shop attendant, Family retail shop (2023-2024): serving customers and stock taking.",
    "Volunteer, community church events (2022): helped organise chairs and sound.",
    "## Education",
    "KCSE certificate, 2022, mean grade C-.",
    "## Skills",
    "Basic computer use, friendly personality.",
])
print("CVs generated")
