import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session")
def _db_schema():
    """Creates the schema from the models (see tests/test_referral_network.py for
    why not migrations). Only instantiated by tests that request `api`."""
    from sqlalchemy import create_engine

    import app.all_models  # noqa: F401
    from app.config import get_settings
    from app.database import Base

    engine = create_engine(get_settings().sync_database_url)
    Base.metadata.create_all(engine)
    engine.dispose()


@pytest.fixture
async def api(_db_schema):
    """ASGI client against the real app + database, rate limits off."""
    from app.core.rate_limit import limiter
    from app.database import engine

    limiter.enabled = False
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    limiter.enabled = True
    # Each test gets its own event loop; asyncpg connections are bound to the loop
    # that opened them, so drop the pool rather than reuse it across tests.
    await engine.dispose()
