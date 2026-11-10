import base64
from io import BytesIO

import lxml.etree
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

from app.schemas import SlideSpec, TableData

_CHART_TYPES = {
    "column": XL_CHART_TYPE.COLUMN_CLUSTERED,
    "line": XL_CHART_TYPE.LINE_MARKERS,
    "pie": XL_CHART_TYPE.PIE,
}
_LAYOUT_NAMES = {
    "title": ("title slide", "титульный слайд"),
    "content": ("title and content", "заголовок и объект"),
    "title_only": ("title only", "только заголовок"),
}
_LAYOUT_FALLBACK_INDEX = {"title": 0, "content": 1, "title_only": 5}
_FONT_NAME = "DejaVu Sans"
_THEME_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"


def validate_template(data: bytes) -> None:
    try:
        prs = Presentation(BytesIO(data))
    except Exception as exc:
        raise ValueError("Файл не является корректным PPTX-документом") from exc
    if len(prs.slide_layouts) == 0:
        raise ValueError("В шаблоне нет ни одного макета слайда")
    if not any(layout.placeholders for layout in prs.slide_layouts):
        raise ValueError("В шаблоне нет макетов с местами для текста")


def build_pptx(title: str, slides: list[SlideSpec], template: bytes | None) -> bytes:
    prs = _open_base(template)
    _set_theme_fonts(prs)
    title_slide = prs.slides.add_slide(_layout(prs, "title"))
    _set_title(prs, title_slide, title)
    for spec in slides:
        _add_slide(prs, spec)
    for slide in prs.slides:
        _apply_font(slide)
    buffer = BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


def _open_base(template: bytes | None) -> Presentation:
    if template is None:
        return Presentation()
    prs = Presentation(BytesIO(template))
    slide_ids = prs.slides._sldIdLst
    for slide_id in list(slide_ids):
        prs.part.drop_rel(slide_id.rId)
        slide_ids.remove(slide_id)
    return prs


def _layout(prs: Presentation, kind: str):
    names = _LAYOUT_NAMES[kind]
    for layout in prs.slide_layouts:
        if layout.name.lower() in names:
            return layout
    return prs.slide_layouts[
        min(_LAYOUT_FALLBACK_INDEX[kind], len(prs.slide_layouts) - 1)
    ]


def _add_slide(prs: Presentation, spec: SlideSpec) -> None:
    if spec.type == "text":
        slide = prs.slides.add_slide(_layout(prs, "content"))
        _set_title(prs, slide, spec.title)
        _text_slide(prs, slide, spec)
    else:
        slide = prs.slides.add_slide(_layout(prs, "title_only"))
        _set_title(prs, slide, spec.title)
        _BUILDERS[spec.type](prs, slide, spec)
    _drop_empty_placeholders(slide)


def _set_title(prs: Presentation, slide, text: str) -> None:
    if slide.shapes.title is None:
        left, top, width, _ = _content_box(prs)
        _add_textbox(
            slide, (left, Inches(0.4), width, Inches(1)), [text], bold=True, size=28
        )
        return
    slide.shapes.title.text_frame.word_wrap = True
    slide.shapes.title.text_frame.text = text
    if len(text) > 70:
        for paragraph in slide.shapes.title.text_frame.paragraphs:
            paragraph.font.size = Pt(28)


def _text_slide(prs: Presentation, slide, spec: SlideSpec) -> None:
    body = next(
        (shape for shape in slide.placeholders if shape.placeholder_format.idx != 0),
        None,
    )
    if body is not None and body.has_text_frame:
        _fill_paragraphs(
            body.text_frame, spec.bullets, size=_bullet_font_size(spec.bullets)
        )
    else:
        _add_textbox(
            slide,
            _content_box(prs),
            spec.bullets,
            prefix="• ",
            size=_bullet_font_size(spec.bullets),
        )


def _table_slide(prs: Presentation, slide, spec: SlideSpec) -> None:
    data: TableData = spec.table
    left, top, width, height = _content_box(prs)
    rows = len(data.rows) + 1
    font_size = 14 if rows <= 8 else 12 if rows <= 12 else 10
    table = slide.shapes.add_table(
        rows, len(data.headers), left, top, width, height
    ).table
    for column, header in enumerate(data.headers):
        _write_cell(table.cell(0, column), header, font_size, bold=True)
    for row_index, row in enumerate(data.rows, start=1):
        for column, value in enumerate(row):
            _write_cell(table.cell(row_index, column), value, font_size)


def _chart_slide(prs: Presentation, slide, spec: SlideSpec) -> None:
    data = spec.chart
    chart_data = CategoryChartData()
    chart_data.categories = data.categories
    for series in data.series:
        chart_data.add_series(series.name, series.values)
    frame = slide.shapes.add_chart(
        _CHART_TYPES[data.kind], *_content_box(prs), chart_data
    )
    chart = frame.chart
    chart.has_legend = data.kind == "pie" or len(data.series) > 1
    if chart.has_legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False
    if data.kind == "pie":
        chart.plots[0].has_data_labels = True


def _comparison_slide(prs: Presentation, slide, spec: SlideSpec) -> None:
    data = spec.comparison
    left, top, width, height = _content_box(prs)
    column_width = int(width * 0.47)
    gap = width - 2 * column_width
    header_height = Inches(0.6)
    for index, (title, items) in enumerate(
        [(data.left_title, data.left_items), (data.right_title, data.right_items)]
    ):
        x = left + index * (column_width + gap)
        _add_textbox(
            slide, (x, top, column_width, header_height), [title], bold=True, size=22
        )
        _add_textbox(
            slide,
            (x, top + header_height, column_width, height - header_height),
            items,
            prefix="• ",
            size=_bullet_font_size(items),
        )


def _image_slide(prs: Presentation, slide, spec: SlideSpec) -> None:
    left, top, width, height = _content_box(prs)
    picture = slide.shapes.add_picture(
        BytesIO(base64.b64decode(spec.image.base64)), left, top, width=width
    )
    if picture.height > height:
        ratio = height / picture.height
        picture.height = int(height)
        picture.width = int(picture.width * ratio)
    picture.left = int(left + (width - picture.width) / 2)


_BUILDERS = {
    "table": _table_slide,
    "chart": _chart_slide,
    "comparison": _comparison_slide,
    "image": _image_slide,
}


def _content_box(prs: Presentation) -> tuple[Emu, Emu, Emu, Emu]:
    width, height = prs.slide_width, prs.slide_height
    return int(width * 0.07), int(height * 0.26), int(width * 0.86), int(height * 0.64)


def _bullet_font_size(items: list[str]) -> int | None:
    total = sum(len(item) for item in items)
    for limit, size in ((900, 14), (600, 16), (400, 18), (250, 20)):
        if total > limit:
            return size
    return None


def _fill_paragraphs(
    text_frame, items: list[str], prefix: str = "", size: int | None = None
) -> None:
    text_frame.word_wrap = True
    for index, item in enumerate(items):
        paragraph = (
            text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
        )
        paragraph.text = f"{prefix}{item}"
        paragraph.font.size = Pt(size) if size else None


def _add_textbox(
    slide,
    box,
    items: list[str],
    prefix: str = "",
    bold: bool = False,
    size: int | None = None,
) -> None:
    textbox = slide.shapes.add_textbox(*box)
    _fill_paragraphs(textbox.text_frame, items, prefix, size)
    for paragraph in textbox.text_frame.paragraphs:
        paragraph.font.bold = bold


def _write_cell(cell, text: str, size: int, bold: bool = False) -> None:
    cell.text = text
    for paragraph in cell.text_frame.paragraphs:
        paragraph.font.size = Pt(size)
        paragraph.font.bold = bold


def _set_theme_fonts(prs: Presentation) -> None:
    # Calibri (the default theme font) is absent in the container image, so LibreOffice
    # substitutes a Latin-only fallback and Cyrillic renders as tofu. Force the theme
    # fonts to DejaVu Sans, which covers Cyrillic.
    master = prs.slide_masters[0]
    theme_part = master.part.part_related_by(_THEME_REL)
    theme = lxml.etree.fromstring(theme_part.blob)
    for scope in ("majorFont", "minorFont"):
        node = theme.find(f".//{{http://schemas.openxmlformats.org/drawingml/2006/main}}{scope}")
        if node is None:
            continue
        for tag in ("latin", "ea", "cs"):
            existing = node.find(qn(f"a:{tag}"))
            if existing is None:
                existing = node.makeelement(qn(f"a:{tag}"), {})
                node.append(existing)
            existing.set("typeface", _FONT_NAME)
    theme_part._blob = lxml.etree.tostring(
        theme, xml_declaration=True, encoding="UTF-8", standalone=True
    )


def _apply_font(slide) -> None:
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue
        for paragraph in shape.text_frame.paragraphs:
            for run in paragraph.runs:
                run.font.name = _FONT_NAME
                _set_run_fonts(run._r.get_or_add_rPr())


def _set_run_fonts(rPr) -> None:
    # python-pptx only exposes get_or_add_latin(); ea/cs must be created via XML.
    latin = rPr.find(qn("a:latin"))
    if latin is None:
        latin = rPr.makeelement(qn("a:latin"), {})
        rPr.append(latin)
    latin.set("typeface", _FONT_NAME)
    for tag in ("a:ea", "a:cs"):
        node = rPr.find(qn(tag))
        if node is None:
            node = rPr.makeelement(qn(tag), {})
            rPr.append(node)
        node.set("typeface", _FONT_NAME)


def _drop_empty_placeholders(slide) -> None:
    for shape in list(slide.placeholders):
        if shape.has_text_frame and not shape.text_frame.text.strip():
            element = shape._element
            element.getparent().remove(element)
