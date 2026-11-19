from dataclasses import dataclass
from typing import Optional


@dataclass
class Song:
    id: int
    title: str
    artist: Optional[str]
    file_path: str
    stem_path: Optional[str]
    duration_ms: Optional[int]
    processed_at: Optional[str]


@dataclass
class NoteEvent:
    time_ms: int
    pitch_midi: float
    duration_ms: int


@dataclass
class PitchFrame:
    note: str        # e.g. "A4"
    midi: float      # e.g. 69.3
    cents: float     # deviation from nearest semitone, -50 to +50
    confidence: float


@dataclass
class Session:
    id: int
    song_id: int
    practiced_at: str
    accuracy_pct: Optional[float]
    notes_hit: Optional[int]
    notes_total: Optional[int]
    range_low_midi: Optional[float]
    range_high_midi: Optional[float]
