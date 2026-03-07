"""TinyDB database layer for JSON storage."""

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from tinydb import Query, TinyDB
from tinydb.table import Table

from app.config import settings

logger = logging.getLogger(__name__)


class Database:
    """TinyDB wrapper for resume matcher data."""

    _master_resume_lock = asyncio.Lock()

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or settings.db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db: TinyDB | None = None

    @property
    def db(self) -> TinyDB:
        """Lazy initialization of TinyDB instance."""
        if self._db is None:
            self._db = TinyDB(self.db_path)
        return self._db

    @property
    def resumes(self) -> Table:
        """Resumes table."""
        return self.db.table("resumes")

    @property
    def jobs(self) -> Table:
        """Job descriptions table."""
        return self.db.table("jobs")

    @property
    def improvements(self) -> Table:
        """Improvement results table."""
        return self.db.table("improvements")

    @property
    def tailor_tasks(self) -> Table:
        """Async tailor task tracking table."""
        return self.db.table("tailor_tasks")

    def close(self) -> None:
        """Close database connection."""
        if self._db is not None:
            self._db.close()
            self._db = None

    # Resume operations
    def create_resume(
        self,
        content: str,
        content_type: str = "md",
        filename: str | None = None,
        is_master: bool = False,
        parent_id: str | None = None,
        processed_data: dict[str, Any] | None = None,
        processing_status: str = "pending",
        cover_letter: str | None = None,
        outreach_message: str | None = None,
        title: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new resume entry.

        processing_status: "pending", "processing", "ready", "failed"
        """
        resume_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc = {
            "resume_id": resume_id,
            "content": content,
            "content_type": content_type,
            "filename": filename,
            "is_master": is_master,
            "deleted_at": None,
            "parent_id": parent_id,
            "processed_data": processed_data,
            "processing_status": processing_status,
            "cover_letter": cover_letter,
            "outreach_message": outreach_message,
            "title": title,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
        }
        self.resumes.insert(doc)
        return doc

    # LEGACY BOOTSTRAP ONLY — DO NOT USE FOR GENERATION SOURCE
    # This method exists solely for first-upload atomic master assignment.
    # All generation source resolution must go through _get_generation_source_resume
    # in resumes.py, which uses get_active_resume + is_master validation.
    async def create_resume_atomic_master(
        self,
        content: str,
        content_type: str = "md",
        filename: str | None = None,
        processed_data: dict[str, Any] | None = None,
        processing_status: str = "pending",
        cover_letter: str | None = None,
        outreach_message: str | None = None,
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a new resume with atomic master assignment.

        Uses an asyncio.Lock to prevent race conditions when multiple uploads
        happen concurrently and both try to become master. This avoids blocking
        the FastAPI event loop unlike threading.Lock.

        LEGACY BOOTSTRAP ONLY — DO NOT USE FOR GENERATION SOURCE.
        Used exclusively by upload route for first-upload compatibility.
        Never called from improve, preview, confirm, or any source-resolution path.
        """
        async with self._master_resume_lock:
            current_master = self.get_master_resume(user_id=user_id)
            is_master = current_master is None

            return self.create_resume(
                content=content,
                content_type=content_type,
                filename=filename,
                is_master=is_master,
                processed_data=processed_data,
                processing_status=processing_status,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                user_id=user_id,
            )

    def get_resume(self, resume_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Get resume by ID."""
        Resume = Query()
        query = Resume.resume_id == resume_id
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        result = self.resumes.search(query)
        return result[0] if result else None

    def get_active_resume(
        self, resume_id: str, user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Get non-deleted resume by ID."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.resume_id == resume_id) & active_query
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        result = self.resumes.search(query)
        return result[0] if result else None

    # LEGACY BOOTSTRAP ONLY — DO NOT USE FOR GENERATION SOURCE
    # Used only by: create_resume_atomic_master (bootstrap) and get_stats (status display).
    # Generation source must always be resolved via _get_generation_source_resume in resumes.py.
    def get_master_resume(self, user_id: str | None = None) -> dict[str, Any] | None:
        """Get one active master resume.

        LEGACY BOOTSTRAP ONLY — DO NOT USE FOR GENERATION SOURCE.
        Permitted callers: create_resume_atomic_master, get_stats.
        All other callers must use list_master_resumes or get_active_resume.
        """
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.is_master == True) & active_query
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        result = self.resumes.search(query)
        return result[0] if result else None

    def list_master_resumes(self, user_id: str | None = None) -> list[dict[str, Any]]:
        """List all non-deleted master resumes."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.is_master == True) & active_query
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        return list(self.resumes.search(query))

    def promote_to_master(self, resume_id: str, user_id: str | None = None) -> bool:
        """Mark an existing non-deleted resume as master."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        target_query = (Resume.resume_id == resume_id) & active_query
        if user_id is not None:
            target_query = target_query & (Resume.user_id == user_id)
        updated = self.resumes.update(
            {
                "is_master": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            target_query,
        )
        return len(updated) > 0

    def update_resume(
        self, resume_id: str, updates: dict[str, Any], user_id: str | None = None
    ) -> dict[str, Any]:
        """Update resume by ID.

        Raises:
            ValueError: If resume not found.
        """
        Resume = Query()
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        query = Resume.resume_id == resume_id
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        updated_count = self.resumes.update(updates, query)

        if not updated_count:
            raise ValueError(f"Resume not found: {resume_id}")

        result = self.get_resume(resume_id, user_id=user_id)
        if not result:
            raise ValueError(f"Resume disappeared after update: {resume_id}")

        return result

    def delete_resume(self, resume_id: str, user_id: str | None = None) -> bool:
        """Delete resume by ID."""
        Resume = Query()
        query = Resume.resume_id == resume_id
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        removed = self.resumes.remove(query)
        return len(removed) > 0

    def soft_delete_resume(self, resume_id: str, user_id: str | None = None) -> bool:
        """Soft-delete resume by setting deleted_at timestamp."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.resume_id == resume_id) & active_query
        if user_id is not None:
            query = query & (Resume.user_id == user_id)
        updated = self.resumes.update(
            {
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            query,
        )
        return len(updated) > 0

    def list_resumes(
        self, user_id: str | None = None, include_deleted: bool = False
    ) -> list[dict[str, Any]]:
        """List resumes with optional deleted records."""
        Resume = Query()
        query = None
        if not include_deleted:
            query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        if user_id is not None:
            user_query = Resume.user_id == user_id
            query = user_query if query is None else (query & user_query)

        if query is None:
            return list(self.resumes.all())
        return list(self.resumes.search(query))

    def set_master_resume(self, resume_id: str, user_id: str | None = None) -> bool:
        """Set a resume as master.

        Returns False if the resume doesn't exist.
        """
        Resume = Query()

        # First verify the target resume exists
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        target_query = (Resume.resume_id == resume_id) & active_query
        if user_id is not None:
            target_query = target_query & (Resume.user_id == user_id)
        target = self.resumes.search(target_query)
        if not target:
            logger.warning("Cannot set master: resume %s not found", resume_id)
            return False

        # Set target as master without mutating other masters.
        set_query = Resume.resume_id == resume_id
        if user_id is not None:
            set_query = set_query & (Resume.user_id == user_id)
        updated = self.resumes.update(
            {
                "is_master": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            set_query,
        )
        return len(updated) > 0

    # Job operations
    def create_job(
        self, content: str, resume_id: str | None = None, user_id: str | None = None
    ) -> dict[str, Any]:
        """Create a new job description entry."""
        job_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc = {
            "job_id": job_id,
            "content": content,
            "resume_id": resume_id,
            "user_id": user_id,
            "created_at": now,
        }
        self.jobs.insert(doc)
        return doc

    def get_job(self, job_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Get job by ID."""
        Job = Query()
        query = Job.job_id == job_id
        if user_id is not None:
            query = query & (Job.user_id == user_id)
        result = self.jobs.search(query)
        return result[0] if result else None

    def update_job(
        self, job_id: str, updates: dict[str, Any], user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Update a job by ID."""
        Job = Query()
        query = Job.job_id == job_id
        if user_id is not None:
            query = query & (Job.user_id == user_id)
        updated = self.jobs.update(updates, query)
        if not updated:
            return None
        return self.get_job(job_id, user_id=user_id)

    # Improvement operations
    def create_improvement(
        self,
        original_resume_id: str,
        tailored_resume_id: str,
        job_id: str,
        improvements: list[dict[str, Any]],
        user_id: str | None = None,
    ) -> dict[str, Any]:
        """Create an improvement result entry."""
        request_id = str(uuid4())
        now = datetime.now(timezone.utc).isoformat()

        doc = {
            "request_id": request_id,
            "original_resume_id": original_resume_id,
            "tailored_resume_id": tailored_resume_id,
            "job_id": job_id,
            "improvements": improvements,
            "user_id": user_id,
            "created_at": now,
        }
        self.improvements.insert(doc)
        return doc

    def get_improvement_by_tailored_resume(
        self, tailored_resume_id: str, user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Get improvement record by tailored resume ID.

        This is used to retrieve the job context for on-demand
        cover letter and outreach message generation.
        """
        Improvement = Query()
        query = Improvement.tailored_resume_id == tailored_resume_id
        if user_id is not None:
            query = query & (Improvement.user_id == user_id)
        result = self.improvements.search(query)
        return result[0] if result else None

    # Admin activity query helpers
    def count_resumes_for_user(self, user_id: str) -> int:
        """Count all non-deleted resumes for a specific user."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.user_id == user_id) & active_query
        return len(self.resumes.search(query))

    def count_tailored_resumes_for_user(self, user_id: str) -> int:
        """Count non-deleted, non-master (tailored) resumes for a specific user."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.user_id == user_id) & active_query & (Resume.is_master == False)
        return len(self.resumes.search(query))

    def count_master_resumes_for_user(self, user_id: str) -> int:
        """Count non-deleted master resumes for a specific user."""
        Resume = Query()
        active_query = (Resume.deleted_at == None) | (~Resume.deleted_at.exists())
        query = (Resume.user_id == user_id) & active_query & (Resume.is_master == True)
        return len(self.resumes.search(query))

    def get_resume_dates_for_user(self, user_id: str) -> list[str]:
        """Return list of created_at date strings for all resumes (including soft-deleted) for a user."""
        Resume = Query()
        results = self.resumes.search(Resume.user_id == user_id)
        return [r["created_at"] for r in results if "created_at" in r]

    # Stats
    def get_stats(self, user_id: str | None = None) -> dict[str, Any]:
        """Get database statistics."""
        if user_id is None:
            total_resumes = len(self.list_resumes())
            total_jobs = len(self.jobs)
            total_improvements = len(self.improvements)
            has_master_resume = self.get_master_resume() is not None
        else:
            Job = Query()
            Improvement = Query()
            total_resumes = len(self.list_resumes(user_id=user_id))
            total_jobs = len(self.jobs.search(Job.user_id == user_id))
            total_improvements = len(
                self.improvements.search(Improvement.user_id == user_id)
            )
            has_master_resume = self.get_master_resume(user_id=user_id) is not None

        return {
            "total_resumes": total_resumes,
            "total_jobs": total_jobs,
            "total_improvements": total_improvements,
            "has_master_resume": has_master_resume,
        }

    def reset_user_data(self, user_id: str) -> None:
        """Reset data for a specific user only."""
        Resume = Query()
        Job = Query()
        Improvement = Query()
        self.resumes.remove(Resume.user_id == user_id)
        self.jobs.remove(Job.user_id == user_id)
        self.improvements.remove(Improvement.user_id == user_id)

    # ---------------------------------------------------------------------------
    # Tailor task operations (async background tailoring)
    # ---------------------------------------------------------------------------

    def create_tailor_task(
        self,
        task_id: str,
        user_id: str,
        resume_id: str,
        job_id: str,
        prompt_id: str,
    ) -> dict[str, Any]:
        """Create a new tailor task record with status=pending."""
        now = datetime.now(timezone.utc).isoformat()
        doc: dict[str, Any] = {
            "task_id": task_id,
            "user_id": user_id,
            "resume_id": resume_id,
            "job_id": job_id,
            "prompt_id": prompt_id,
            "status": "pending",    # pending | processing | completed | failed
            "stage": "queued",      # queued | extract_keywords | improve_resume | refine_resume | finalize | done
            "progress": 0,          # 0-100
            "result": None,
            "error": None,
            "error_type": None,
            "created_at": now,
            "updated_at": now,
        }
        self.tailor_tasks.insert(doc)
        return doc

    def get_tailor_task(self, task_id: str, user_id: str) -> dict[str, Any] | None:
        """Fetch a tailor task by ID, scoped to user."""
        Task = Query()
        results = self.tailor_tasks.search(
            (Task.task_id == task_id) & (Task.user_id == user_id)
        )
        return results[0] if results else None

    def update_tailor_task(self, task_id: str, updates: dict[str, Any], user_id: str | None = None) -> None:
        """Update fields on a tailor task record."""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        Task = Query()
        condition = Task.task_id == task_id
        if user_id:
            condition = condition & (Task.user_id == user_id)
        self.tailor_tasks.update(updates, condition)

    def cleanup_stale_tailor_tasks(self, max_age_minutes: int = 15) -> int:
        """Mark in-flight tasks older than max_age_minutes as failed (crash recovery).

        Returns the number of tasks updated.
        """
        from datetime import timedelta

        cutoff = (
            datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
        ).isoformat()
        Task = Query()
        stale = self.tailor_tasks.search(
            Task.status.one_of(["pending", "processing"])
            & (Task.created_at < cutoff)
        )
        for task in stale:
            self.update_tailor_task(
                task["task_id"],
                {
                    "status": "failed",
                    "error": "Task expired — server may have restarted. Please try again.",
                    "error_type": "timeout",
                },
            )
        return len(stale)

    def cleanup_old_tailor_tasks(self, max_age_hours: int = 24) -> int:
        """Permanently delete completed/failed tasks older than max_age_hours.

        Returns the number of tasks deleted.
        """
        from datetime import timedelta

        cutoff = (
            datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
        ).isoformat()
        Task = Query()
        old = self.tailor_tasks.search(
            Task.status.one_of(["completed", "failed"])
            & (Task.created_at < cutoff)
        )
        for task in old:
            self.tailor_tasks.remove(Task.task_id == task["task_id"])
        return len(old)

    def reset_database(self) -> None:
        """Reset the database by truncating all tables and clearing uploads."""
        # Truncate tables
        self.resumes.truncate()
        self.jobs.truncate()
        self.improvements.truncate()
        self.tailor_tasks.truncate()

        # Clear uploads directory
        uploads_dir = settings.data_dir / "uploads"
        if uploads_dir.exists():
            import shutil

            shutil.rmtree(uploads_dir)
            uploads_dir.mkdir(parents=True, exist_ok=True)


# Global database instance
db = Database()
