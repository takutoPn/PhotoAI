from pydantic import BaseModel, Field
from typing import List, Literal


class SelectionRules(BaseModel):
    max_per_person: int = Field(default=3, ge=1, le=30)
    max_per_cluster: int = Field(default=1, ge=1, le=10)
    target_picks: int = Field(default=30, ge=1, le=5000)
    quality_weight: float = 0.5
    face_weight: float = 0.3
    diversity_weight: float = 0.2


class JobCreate(BaseModel):
    project_name: str
    catalog_path: str
    rules: SelectionRules


class Job(BaseModel):
    id: str
    status: Literal["created", "running", "done", "failed"]
    project_name: str
    catalog_path: str
    rules: SelectionRules


class SelectionItem(BaseModel):
    asset_id: str
    score: float
    person_id: str
    cluster_id: str
    pick: bool
    reason: str


class JobResult(BaseModel):
    job_id: str
    picks: List[SelectionItem]
    total_assets: int = 0
    picked_assets: int = 0
    warnings: List[str] = Field(default_factory=list)
