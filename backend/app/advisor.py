import re

from app.schemas import ChartData, RecommendationOut, SlideSpec, TableData

_TIME_LABEL = re.compile(
    r"(?:(?:19|20)\d{2}(?:\s?г\.?)?"
    r"|(?:Q[1-4]|[1-4]\s?кв\S*)(?:\s?\d{2,4})?"
    r"|\d{4}-\d{2}(?:-\d{2})?"
    r"|\d{1,2}\.\d{1,2}\.\d{2,4}"
    r"|\d{1,2}\.\d{4}"
    r"|(?:янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек"
    r"|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[а-яa-z]*\.?(?:\s?\d{2,4})?"
    r"|(?:пн|вт|ср|чт|пт|сб|вс|mon|tue|wed|thu|fri|sat|sun)[а-яa-z]*)",
    re.IGNORECASE,
)
_SHARE_HINT = re.compile(
    r"доля|доли|структур|распредел|share|proportion|%", re.IGNORECASE
)
_NUMERIC_PAIR = re.compile(
    r"^\s*(?P<label>[^:–—]+?)\s*[:–—]\s*(?P<value>[-+]?\d[\d\s.,]*\s*(?:%|₽|\$|€|руб\.?|млн|тыс\.?|млрд)?)\s*$"
)

_CHART_VISUALIZATION = {
    "column": "column_chart",
    "line": "line_chart",
    "pie": "pie_chart",
}
_SLIDE_TYPE_BY_VISUALIZATION = {
    "text": "text",
    "table": "table",
    "line_chart": "chart",
    "column_chart": "chart",
    "pie_chart": "chart",
    "comparison": "comparison",
    "image": "image",
}


def recommend(slide: SlideSpec) -> RecommendationOut:
    if slide.type is not None:
        visualization = _explicit_visualization(slide)
        return _build(
            visualization,
            "Тип слайда задан пользователем, поэтому он имеет приоритет над рекомендацией.",
        )
    if slide.image is not None:
        return _build(
            "image", "Передано изображение, поэтому слайд строится вокруг него."
        )
    if slide.comparison is not None:
        return _build(
            "comparison",
            "Есть два набора данных для сравнения, поэтому выбран слайд сравнения.",
        )
    if slide.chart is not None:
        kind, reason = _chart_kind(slide)
        return _build(_CHART_VISUALIZATION[kind], reason)
    if slide.table is not None:
        return _build(
            "table", "Данные представлены таблицей, поэтому она сохраняется как есть."
        )
    if _numeric_pairs(slide.bullets) is not None:
        return _build(
            "table",
            "Несвязанные числовые показатели удобнее читать в таблице, поэтому они собраны в таблицу.",
        )
    return _build(
        "text", "Данных для графика или таблицы нет, поэтому выбран текстовый блок."
    )


def resolve(slide: SlideSpec) -> SlideSpec:
    recommendation = recommend(slide)
    resolved = slide.model_copy(
        update={
            "type": recommendation.slide_type,
            "reasoning": recommendation.reasoning,
        }
    )
    if (
        slide.type is None
        and recommendation.visualization == "table"
        and slide.table is None
    ):
        resolved.table = _table_from_pairs(slide.bullets)
        resolved.bullets = []
    if (
        slide.chart is not None
        and slide.chart.kind is None
        and recommendation.visualization.endswith("_chart")
    ):
        kind = recommendation.visualization.removesuffix("_chart")
        resolved.chart = slide.chart.model_copy(update={"kind": kind})
    return resolved


def _build(visualization: str, reasoning: str) -> RecommendationOut:
    return RecommendationOut(
        visualization=visualization,
        slide_type=_SLIDE_TYPE_BY_VISUALIZATION[visualization],
        reasoning=reasoning,
    )


def _explicit_visualization(slide: SlideSpec) -> str:
    if slide.type == "chart":
        return _CHART_VISUALIZATION[slide.chart.kind or _chart_kind(slide)[0]]
    return slide.type


def _chart_kind(slide: SlideSpec) -> tuple[str, str]:
    chart = slide.chart
    if chart.kind is not None:
        return chart.kind, "Тип диаграммы задан пользователем."
    if len(chart.categories) >= 3 and _is_time_series(chart.categories):
        return (
            "line",
            "Значения упорядочены по времени, поэтому линейный график показывает динамику.",
        )
    if len(chart.series) == 1 and _is_share(chart, slide.title):
        return (
            "pie",
            "Значения описывают доли одного целого, поэтому выбрана круговая диаграмма.",
        )
    return (
        "column",
        "Сравниваются категории между собой, поэтому выбрана столбчатая диаграмма.",
    )


def _is_time_series(categories: list[str]) -> bool:
    matches = sum(1 for label in categories if _TIME_LABEL.fullmatch(label.strip()))
    return matches >= max(3, int(len(categories) * 0.8))


def _is_share(chart: ChartData, title: str) -> bool:
    values = chart.series[0].values
    if any(value < 0 for value in values) or not 2 <= len(values) <= 8:
        return False
    total = sum(values)
    return abs(total - 100) <= 1 or bool(_SHARE_HINT.search(title))


def _numeric_pairs(bullets: list[str]) -> list[tuple[str, str]] | None:
    if len(bullets) < 3:
        return None
    pairs = []
    for bullet in bullets:
        match = _NUMERIC_PAIR.match(bullet)
        if match is None:
            return None
        pairs.append((match.group("label").strip(), match.group("value").strip()))
    return pairs


def _table_from_pairs(bullets: list[str]) -> TableData:
    pairs = _numeric_pairs(bullets) or []
    return TableData(
        headers=["Показатель", "Значение"],
        rows=[[label, value] for label, value in pairs],
    )
