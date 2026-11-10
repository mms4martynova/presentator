from redis import Redis
from rq import Queue, Retry

from app.config import settings

QUEUE_NAME = "presentations"


def enqueue_generation(task_id: str) -> None:
    queue = Queue(QUEUE_NAME, connection=Redis.from_url(settings.redis_url))
    queue.enqueue(
        "app.jobs.run_generation",
        task_id,
        job_timeout=900,
        retry=Retry(max=2, interval=[10, 30]),
    )
