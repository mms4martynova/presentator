import base64
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SlideType = Literal["text", "table", "chart", "comparison", "image"]
ChartKind = Literal["column", "line", "pie"]


class TableData(BaseModel):
    headers: list[str] = Field(min_length=1, max_length=12)
    rows: list[list[str]] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def rows_match_headers(self):
        if any(len(row) != len(self.headers) for row in self.rows):
            raise ValueError(
                "Количество ячеек в каждой строке должно совпадать с количеством заголовков"
            )
        return self


class ChartSeries(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    values: list[float] = Field(min_length=1, max_length=50)


class ChartData(BaseModel):
    kind: ChartKind | None = None
    categories: list[str] = Field(min_length=1, max_length=50)
    series: list[ChartSeries] = Field(min_length=1, max_length=6)

    @model_validator(mode="after")
    def series_match_categories(self):
        if any(len(s.values) != len(self.categories) for s in self.series):
            raise ValueError(
                "Количество значений в каждом ряду должно совпадать с количеством категорий"
            )
        return self


class ComparisonData(BaseModel):
    left_title: str = Field(min_length=1, max_length=100)
    left_items: list[str] = Field(default_factory=list, max_length=15)
    right_title: str = Field(min_length=1, max_length=100)
    right_items: list[str] = Field(default_factory=list, max_length=15)


class ImageData(BaseModel):
    base64: str = Field(min_length=1, max_length=4_000_000)

    @model_validator(mode="after")
    def valid_base64(self):
        try:
            base64.b64decode(self.base64, validate=True)
        except ValueError as exc:
            raise ValueError("Изображение должно быть закодировано в base64") from exc
        return self


class SlideSpec(BaseModel):
    type: SlideType | None = None
    title: str = Field(min_length=1, max_length=200)
    bullets: list[str] = Field(default_factory=list, max_length=30)
    table: TableData | None = None
    chart: ChartData | None = None
    comparison: ComparisonData | None = None
    image: ImageData | None = None
    reasoning: str | None = None

    @model_validator(mode="after")
    def explicit_type_has_data(self):
        required = {
            "table": self.table,
            "chart": self.chart,
            "comparison": self.comparison,
            "image": self.image,
        }
        if self.type in required and required[self.type] is None:
            raise ValueError(
                f"Для слайда типа «{self.type}» не переданы данные этого типа"
            )
        return self


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    text: str | None = Field(default=None, max_length=50_000)
    slides: list[SlideSpec] | None = Field(default=None, max_length=40)
    slides_count: int = Field(default=8, ge=1, le=40)
    language: Literal["ru", "en"] = "ru"
    audience: str | None = Field(default=None, max_length=200)
    tone: str | None = Field(default=None, max_length=200)
    template_id: int | None = None
    want_pdf: bool = False
    mode: Literal["async", "sync"] = "async"

    @model_validator(mode="after")
    def has_content(self):
        if not self.text and not self.slides:
            raise ValueError("Укажите текстовое описание или структурированные слайды")
        return self


class TaskRebuild(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    text: str | None = Field(default=None, max_length=50_000)
    slides: list[SlideSpec] | None = Field(default=None, max_length=40)
    slides_count: int | None = Field(default=None, ge=1, le=40)
    language: Literal["ru", "en"] | None = None
    audience: str | None = Field(default=None, max_length=200)
    tone: str | None = Field(default=None, max_length=200)
    template_id: int | None = None
    want_pdf: bool | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    progress: int
    error: str | None
    parent_task_id: str | None
    template_version_id: int | None
    want_pdf: bool
    request: dict
    outline: list[SlideSpec] | None
    has_pptx: bool
    has_pdf: bool
    created_at: datetime
    updated_at: datetime


class TaskSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    status: str
    progress: int
    want_pdf: bool
    has_pptx: bool
    has_pdf: bool
    created_at: datetime


class TemplateVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version: int
    original_filename: str
    is_active: bool
    created_at: datetime


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    versions: list[TemplateVersionOut]


class RecommendationOut(BaseModel):
    visualization: Literal[
        "text",
        "table",
        "line_chart",
        "column_chart",
        "pie_chart",
        "comparison",
        "image",
    ]
    slide_type: SlideType
    reasoning: str


class MeOut(BaseModel):
    id: int
    name: str
