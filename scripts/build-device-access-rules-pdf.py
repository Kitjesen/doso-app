"""Build the archived access rules from their Markdown source."""
from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
    Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/production/DOSO_DEVICE_ACCESS_RULES_20261104.md'
OUTPUT = ROOT / 'output/pdf/DOSO_机器狗连接与使用规则_20261104.pdf'
FONT = Path('C:/Windows/Fonts/simhei.ttf')


def inline(text):
    safe = escape(text)
    safe = re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)',
                  r'<link href="\2" color="#17638a">\1</link>', safe)
    return safe.replace('`', '')


def build():
    if not FONT.is_file():
        raise RuntimeError('Chinese font is required: ' + str(FONT))
    pdfmetrics.registerFont(TTFont('DosoCJK', str(FONT)))
    source_text = SOURCE.read_text(encoding='utf-8')
    required = {ord(char) for char in source_text if not char.isspace()} | {ord('·')}
    missing = required - set(pdfmetrics.getFont('DosoCJK').face.charWidths)
    if missing:
        raise ValueError('Font lacks glyphs: ' + ', '.join(f'U+{value:04X}' for value in sorted(missing)))
    ink, blue = colors.HexColor('#183044'), colors.HexColor('#1B668B')
    body = ParagraphStyle('body', fontName='DosoCJK', fontSize=10.2,
                          leading=16.1, spaceAfter=8, textColor=ink,
                          wordWrap='CJK', alignment=TA_LEFT)
    title = ParagraphStyle('title', parent=body, fontSize=23, leading=32,
                           spaceAfter=12, textColor=blue)
    heading = ParagraphStyle('heading', parent=body, fontSize=14.2, leading=21,
                             spaceBefore=8, spaceAfter=9, textColor=blue,
                             keepWithNext=True)
    cell = ParagraphStyle('cell', parent=body, fontSize=9.1, leading=13.8,
                          spaceAfter=0)
    bullet = ParagraphStyle('bullet', parent=body, leftIndent=11,
                            firstLineIndent=-10, spaceAfter=6)
    story = []
    lines = source_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line:
            continue
        if line == '<!-- PAGEBREAK -->':
            story.append(PageBreak())
        elif line.startswith('# '):
            story.append(Paragraph(inline(line[2:]), title))
            story.append(HRFlowable(width='100%', thickness=2, color=blue))
            story.append(Spacer(1, 13))
        elif line.startswith('## '):
            story.append(Paragraph(inline(line[3:]), heading))
        elif line.startswith('|'):
            rows = [line]
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(lines[i].strip())
                i += 1
            data = []
            for row in rows:
                values = [part.strip() for part in row.strip('|').split('|')]
                if all(re.fullmatch(r':?-+:?', part) for part in values):
                    continue
                data.append([Paragraph(inline(value), cell) for value in values])
            if not data or any(len(row) != 3 for row in data):
                raise ValueError('Rules tables require exactly three columns')
            table = Table(data, colWidths=[105, 199, A4[0] - 96 - 304],
                          repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DDEEF5')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1),
                 [colors.HexColor('#F4F8FA'), colors.white]),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 7),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                ('LINEBELOW', (0, 0), (-1, 0), 0.6, blue),
                ('LINEBELOW', (0, -1), (-1, -1), 0.4,
                 colors.HexColor('#D6E2E8')),
            ]))
            story.extend([table, Spacer(1, 10)])
        elif line.startswith('- '):
            story.append(Paragraph('· ' + inline(line[2:]), bullet))
        else:
            paragraph = [line]
            while i < len(lines) and lines[i].strip() and not lines[i].startswith(('#', '|', '- ', '<!--')):
                paragraph.append(lines[i].strip())
                i += 1
            story.append(Paragraph(inline(' '.join(paragraph)), body))

    def page(canvas, document):
        canvas.saveState()
        canvas.setFont('DosoCJK', 8.3)
        canvas.setFillColor(colors.HexColor('#587080'))
        canvas.drawString(48, A4[1] - 30, 'DOSO  /  连接与使用规则')
        canvas.drawRightString(A4[0] - 48, A4[1] - 30, '2026-11-04 · v1.0')
        canvas.setStrokeColor(colors.HexColor('#D6E2E8'))
        canvas.line(48, 40, A4[0] - 48, 40)
        canvas.drawString(48, 26, '产品规则存档 · 实现和验收状态见正文')
        canvas.drawRightString(A4[0] - 48, 26, str(document.page))
        canvas.restoreState()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=48,
                                 rightMargin=48, topMargin=51, bottomMargin=54,
                                 title='DOSO 机器狗连接与使用规则',
                                 author='DOSO Robotics', pageCompression=1)
    document.build(story, onFirstPage=page, onLaterPages=page)
    print(OUTPUT)


if __name__ == '__main__':
    build()
