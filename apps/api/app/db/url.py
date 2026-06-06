def normalize_async_pg_url(url: str) -> str:
    """Normalize a postgres URL to use the asyncpg driver.

    Railway and most managed providers return URLs starting with
    'postgres://' or 'postgresql://'. Our async engine requires the
    asyncpg driver explicitly via 'postgresql+asyncpg://'.
    """
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url
