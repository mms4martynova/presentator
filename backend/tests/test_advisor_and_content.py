from app import advisor
from app.content import split_text
from app.schemas import ChartData, ChartSeries, ComparisonData, SlideSpec, TableData


def _chart(categories, values, names=("Значение",)):
    return ChartData(
        categories=categories,
        series=[ChartSeries(name=name, values=values) for name in names],
    )


def test_time_series_gets_line_chart():
    slide = SlideSpec(
        title="Динамика", chart=_chart(["Янв", "Фев", "Мар", "Апр"], [1, 2, 3, 4])
    )
    assert advisor.recommend(slide).visualization == "line_chart"


def test_year_categories_are_time_series():
    slide = SlideSpec(
        title="Выручка", chart=_chart(["2021", "2022", "2023"], [1, 2, 3])
    )
    assert advisor.recommend(slide).visualization == "line_chart"


def test_category_comparison_gets_column_chart():
    slide = SlideSpec(
        title="Филиалы", chart=_chart(["Москва", "Казань", "Омск"], [10, 20, 15])
    )
    assert advisor.recommend(slide).visualization == "column_chart"


def test_shares_of_whole_get_pie_chart():
    slide = SlideSpec(
        title="Структура выручки", chart=_chart(["A", "B", "C"], [50, 30, 20])
    )
    assert advisor.recommend(slide).visualization == "pie_chart"


def test_scattered_numbers_become_table():
    slide = SlideSpec(
        title="Показатели",
        bullets=["Выручка: 120 млн", "Прибыль: 15 млн", "Клиенты: 300"],
    )
    recommendation = advisor.recommend(slide)
    assert recommendation.visualization == "table"
    resolved = advisor.resolve(slide)
    assert resolved.table.headers == ["Показатель", "Значение"]
    assert resolved.bullets == []


def test_comparison_data_gets_comparison_slide():
    slide = SlideSpec(
        title="До и после",
        comparison=ComparisonData(
            left_title="До", left_items=["A"], right_title="После", right_items=["B"]
        ),
    )
    assert advisor.recommend(slide).slide_type == "comparison"


def test_plain_text_gets_text_block():
    assert (
        advisor.recommend(
            SlideSpec(title="Итоги", bullets=["Рост продаж"])
        ).visualization
        == "text"
    )


def test_explicit_type_overrides_recommendation():
    slide = SlideSpec(
        title="Цифры", type="text", chart=_chart(["2021", "2022", "2023"], [1, 2, 3])
    )
    recommendation = advisor.recommend(slide)
    assert recommendation.slide_type == "text"
    assert "приоритет" in recommendation.reasoning


def test_explicit_chart_without_kind_uses_rules():
    slide = SlideSpec(
        title="Динамика", type="chart", chart=_chart(["Янв", "Фев", "Мар"], [1, 2, 3])
    )
    resolved = advisor.resolve(slide)
    assert resolved.chart.kind == "line"


def test_table_slide_requires_table_data():
    try:
        SlideSpec(title="Пусто", type="table")
    except ValueError:
        return
    raise AssertionError("Ожидалась ошибка валидации")


def test_split_text_uses_headings_and_limits_count():
    text = "# Первый\n- пункт 1\n- пункт 2\n\n# Второй\nтекст\n\n# Третий\n- пункт 3"
    slides = split_text(text, 2)
    assert len(slides) == 2
    assert slides[0].title == "Первый"


def test_split_text_plain_paragraph_first_line_is_title():
    slides = split_text("Заголовок\n- первый\n- второй", 5)
    assert slides[0].title == "Заголовок"
    assert slides[0].bullets == ["первый", "второй"]


def test_table_data_validates_row_width():
    try:
        TableData(headers=["A", "B"], rows=[["1"]])
    except ValueError:
        return
    raise AssertionError("Ожидалась ошибка валидации")
