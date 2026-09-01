"""Import every module's models so SQLAlchemy's mapper registry is fully populated
before any query runs. Relationships that reference another module's model by string
name (e.g. `Mapped["PartnerRoleApplication"]` on a class in users/models.py) only
resolve if that module has been imported somewhere first.

The FastAPI app itself imports every module's router (which imports its models
transitively), so this only matters for standalone entry points: Alembic
(migrations/env.py) and one-off scripts (scripts/*.py). Import this module first
in both.
"""
from app.modules.admin import models as _admin_models  # noqa: F401
from app.modules.badges import models as _badges_models  # noqa: F401
from app.modules.bidding import models as _bidding_models  # noqa: F401
from app.modules.bookings import models as _bookings_models  # noqa: F401
from app.modules.business_network import models as _business_network_models  # noqa: F401
from app.modules.commissions import models as _commissions_models  # noqa: F401
from app.modules.disputes import models as _disputes_models  # noqa: F401
from app.modules.guides import models as _guides_models  # noqa: F401
from app.modules.locations import models as _locations_models  # noqa: F401
from app.modules.notifications import models as _notifications_models  # noqa: F401
from app.modules.partners import models as _partners_models  # noqa: F401
from app.modules.payments import models as _payments_models  # noqa: F401
from app.modules.payouts import models as _payouts_models  # noqa: F401
from app.modules.profiles import models as _profiles_models  # noqa: F401
from app.modules.rentcar import models as _rentcar_models  # noqa: F401
from app.modules.reviews import models as _reviews_models  # noqa: F401
from app.modules.stays import models as _stays_models  # noqa: F401
from app.modules.tours import models as _tours_models  # noqa: F401
from app.modules.users import models as _users_models  # noqa: F401
