import base64
from io import BytesIO

import pytest
from pptx import Presentation

from app.pptx_builder import build_pptx, validate_template
from app.schemas import (
    ChartData,
    ChartSeries,
    ComparisonData,
    ImageData,
    SlideSpec,
    TableData,
)

PNG_1X1 = base64.b64encode(
    base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )
).decode()


def _open(data: bytes) -> Presentation:
    return Presentation(BytesIO(data))


def test_builds_every_slide_type_with_title_slide():
    slides = [
        SlideSpec(
            type="text",
            title="Тезисы",
            bullets=["Продажи выросли", "Кириллица: ёжик & «кавычки»"],
        ),
        SlideSpec(
            type="table",
            title="Таблица",
            table=TableData(headers=["Регион", "Выручка"], rows=[["Москва", "10"]]),
        ),
        SlideSpec(
            type="chart",
            title="Диаграмма",
            chart=ChartData(
                kind="column",
                categories=["A", "B"],
                series=[ChartSeries(name="S", values=[1, 2])],
            ),
        ),
        SlideSpec(
            type="comparison",
            title="До и после",
            comparison=ComparisonData(
                left_title="До",
                left_items=["x"],
                right_title="После",
                right_items=["y"],
            ),
        ),
        SlideSpec(type="image", title="Фото", image=ImageData(base64=PNG_1X1)),
    ]
    prs = _open(build_pptx("Квартальный отчет", slides, None))
    assert len(prs.slides) == 1 + len(slides)
    assert prs.slides[0].shapes.title.text_frame.text == "Квартальный отчет"
    assert any(shape.has_chart for shape in prs.slides[3].shapes)
    assert any(shape.has_table for shape in prs.slides[2].shapes)
    assert any(shape.shape_type == 13 for shape in prs.slides[5].shapes)


def test_template_is_applied_and_its_slides_removed():
    template_prs = Presentation()
    template_prs.slides.add_slide(template_prs.slide_layouts[0])
    buffer = BytesIO()
    template_prs.save(buffer)

    result = _open(
        build_pptx(
            "Новая",
            [SlideSpec(type="text", title="Один", bullets=["a"])],
            buffer.getvalue(),
        )
    )
    assert len(result.slides) == 2


def test_validate_template_rejects_non_pptx():
    with pytest.raises(ValueError):
        validate_template(b"not a presentation")


def test_validate_template_accepts_pptx():
    buffer = BytesIO()
    Presentation().save(buffer)
    validate_template(buffer.getvalue())
