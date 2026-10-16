from __future__ import annotations

import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Constants

MAX_PROMPT = 500
MAX_ANSWER = 500
MAX_NOTES = 2000
MAX_READING = 200
MAX_ALTERNATES = 20

PartOfSpeech = Literal["noun", "verb", "adjective", "adverb"]
Gender = Literal["masculine", "feminine", "common"]

# Text folding

def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text.casefold())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(unicodedata.normalize("NFC", stripped).split())

# Candidate from the source text

class Candidate(BaseModel):
    lemma: str
    surface: str
    pos: PartOfSpeech
    gender: Gender | None = None
    zipf: float
    context: str
    occurrences: int = 1

# What the model returns

class ExtractedItem(BaseModel):
    lemma: str = Field(min_length=1, max_length=MAX_ANSWER)
    answer: str = Field(min_length=1, max_length=MAX_ANSWER)
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT)
    alternates: list[str] = Field(default_factory=list, max_length=MAX_ALTERNATES)
    pos: PartOfSpeech
    context: str = Field(default="", max_length=MAX_NOTES)
    skip_reason: str | None = None

    @field_validator("lemma", "answer", "prompt", "context")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("alternates")
    @classmethod
    def clean_alternates(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            text = " ".join(value.split())
            if not text or len(text) > MAX_ANSWER:
                continue
            key = fold(text)
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(text)
        return cleaned[:MAX_ALTERNATES]

    @model_validator(mode="after")
    def check_consistency(self) -> ExtractedItem:
        if fold(self.answer) == fold(self.prompt):
            raise ValueError("answer and prompt are the same")
        if fold(self.lemma) not in fold(self.answer):
            raise ValueError(f"answer '{self.answer}' does not contain the lemma '{self.lemma}'")
        answer_key = fold(self.answer)
        self.alternates = [a for a in self.alternates if fold(a) != answer_key]
        return self

# What the app imports

class CourseItemDraft(BaseModel):
    prompt: str = Field(max_length=MAX_PROMPT)
    answer: str = Field(max_length=MAX_ANSWER)
    alternates: list[str] = Field(default_factory=list, max_length=MAX_ALTERNATES)
    reading: str | None = Field(default=None, max_length=MAX_READING)
    notes: str | None = Field(default=None, max_length=MAX_NOTES)

def to_draft(item: ExtractedItem) -> CourseItemDraft:
    return CourseItemDraft(
        prompt=item.prompt,
        answer=item.answer,
        alternates=item.alternates,
        reading=None,
        notes=item.context or None,
    )

# Model reply

class ReplyItem(BaseModel):
    id: int
    gloss: str = ""
    form: str | None = None
    alternates: list[str] = Field(default_factory=list)
    skip: str | None = None

    @field_validator("gloss")
    @classmethod
    def strip_gloss(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("form", "skip")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None

class ReplyBatch(BaseModel):
    items: list[ReplyItem] = Field(default_factory=list)
